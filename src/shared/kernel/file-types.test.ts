import { describe, expect, it } from "vitest";
import {
  DOCX_CONTENT_TYPE,
  detectFileType,
  detectStoredFileType,
  listZipEntryNames,
  locateZipDirectory,
  type FileReader,
} from "./file-types";

const encoder = new TextEncoder();

function text(value: string): Uint8Array {
  return encoder.encode(value);
}

// A stored (uncompressed) ZIP with empty entries: enough for the central directory the detector reads.
export function buildZip(names: string[], comment = ""): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = text(name);
    const local = new Uint8Array(30 + nameBytes.length);
    local.set([0x50, 0x4b, 0x03, 0x04], 0);
    new DataView(local.buffer).setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local);

    const header = new Uint8Array(46 + nameBytes.length);
    header.set([0x50, 0x4b, 0x01, 0x02], 0);
    const view = new DataView(header.buffer);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);
    offset += local.length;
  }
  const directorySize = central.reduce((sum, item) => sum + item.length, 0);
  const commentBytes = text(comment);
  const end = new Uint8Array(22 + commentBytes.length);
  end.set([0x50, 0x4b, 0x05, 0x06], 0);
  const view = new DataView(end.buffer);
  view.setUint16(8, names.length, true);
  view.setUint16(10, names.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  view.setUint16(20, commentBytes.length, true);
  end.set(commentBytes, 22);
  const all = [...parts, ...central, end];
  const bytes = new Uint8Array(all.reduce((sum, item) => sum + item.length, 0));
  let at = 0;
  for (const item of all) {
    bytes.set(item, at);
    at += item.length;
  }
  return bytes;
}

function readerOf(bytes: Uint8Array): FileReader {
  return { size: bytes.length, read: async (start, length) => bytes.slice(start, start + length) };
}

const DOCX_ENTRIES = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];

describe("file type detection", () => {
  it("F08: detects PDF, JPG, PNG and HEIC from their first bytes", () => {
    expect(detectFileType(text("%PDF-1.7"))).toBe("application/pdf");
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      "image/png",
    );
    const heic = new Uint8Array(16);
    heic.set(text("ftypheic"), 4);
    expect(detectFileType(heic)).toBe("image/heic");
    expect(detectFileType(text("MZ\u0090\u0000"))).toBeNull();
    expect(detectFileType(new Uint8Array(0))).toBeNull();
  });

  it("F08: a ZIP is DOCX only with word/document.xml and without macros", async () => {
    expect(await detectStoredFileType(readerOf(buildZip(DOCX_ENTRIES)))).toBe(DOCX_CONTENT_TYPE);
    // .docm keeps its macros in word/vbaProject.bin.
    expect(
      await detectStoredFileType(readerOf(buildZip([...DOCX_ENTRIES, "word/vbaProject.bin"]))),
    ).toBeNull();
    // A plain archive, such as exame.zip.
    expect(await detectStoredFileType(readerOf(buildZip(["exame.pdf"])))).toBeNull();
    // A spreadsheet is also an Office ZIP, but not a document.
    expect(
      await detectStoredFileType(readerOf(buildZip(["[Content_Types].xml", "xl/workbook.xml"]))),
    ).toBeNull();
  });

  it("F08: a truncated or corrupted ZIP is refused", async () => {
    const zip = buildZip(DOCX_ENTRIES);
    expect(await detectStoredFileType(readerOf(zip.slice(0, zip.length - 10)))).toBeNull();
    const corrupted = zip.slice();
    // The signature of the last central directory header: 46 bytes plus the name, before the 22-byte end.
    corrupted[corrupted.length - 22 - (46 + "word/document.xml".length)] = 0;
    expect(await detectStoredFileType(readerOf(corrupted))).toBeNull();
  });

  it("F08: the central directory is found behind a long archive comment", async () => {
    const zip = buildZip(DOCX_ENTRIES, "x".repeat(5000));
    expect(await detectStoredFileType(readerOf(zip))).toBe(DOCX_CONTENT_TYPE);
  });

  it("F08: reads the entry names and the directory location of a ZIP", () => {
    const zip = buildZip(["a.txt", "dir/b.txt"]);
    const location = locateZipDirectory(zip);
    expect(location?.entries).toBe(2);
    const directory = zip.slice(location?.offset, (location?.offset ?? 0) + (location?.size ?? 0));
    expect(listZipEntryNames(directory, 2)).toEqual(["a.txt", "dir/b.txt"]);
    expect(listZipEntryNames(directory, 3)).toBeNull();
  });
});
