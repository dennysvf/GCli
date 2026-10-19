import { inflateRawSync } from "node:zlib";

// A small ZIP reader for the F14 export checks (integration and E2E): it lists the entries from the
// central directory and inflates one entry on demand. Enough for the archives the application writes
// (stored or deflated entries, data descriptors, no encryption); ZIP64 sizes are read when present.

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_EXTRA = 0x0001;

function findEndOfCentralDirectory(zip: Buffer): number {
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 65_557); index--) {
    if (zip.readUInt32LE(index) === EOCD) return index;
  }
  throw new Error("not a ZIP file");
}

function zip64Values(extra: Buffer, needed: { size: boolean; compressed: boolean; offset: boolean }) {
  const values: { size?: number; compressed?: number; offset?: number } = {};
  for (let index = 0; index + 4 <= extra.length;) {
    const id = extra.readUInt16LE(index);
    const length = extra.readUInt16LE(index + 2);
    if (id === ZIP64_EXTRA) {
      let cursor = index + 4;
      if (needed.size) {
        values.size = Number(extra.readBigUInt64LE(cursor));
        cursor += 8;
      }
      if (needed.compressed) {
        values.compressed = Number(extra.readBigUInt64LE(cursor));
        cursor += 8;
      }
      if (needed.offset) values.offset = Number(extra.readBigUInt64LE(cursor));
    }
    index += 4 + length;
  }
  return values;
}

// The entries of a large ZIP from its last bytes only (the central directory and the end record),
// so a gigabyte archive is never loaded into memory. `totalSize` is the size of the whole file.
export function readZipEntriesFromTail(tail: Buffer, totalSize: number): ZipEntry[] {
  const shift = totalSize - tail.length;
  return readZipEntries(tail, shift);
}

export function readZipEntries(zip: Buffer, shift = 0): ZipEntry[] {
  const end = findEndOfCentralDirectory(zip);
  let count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  // ZIP64 end of central directory locator, right before the classic record.
  if ((count === 0xffff || offset === 0xffffffff) && zip.readUInt32LE(end - 20) === 0x07064b50) {
    const record = Number(zip.readBigUInt64LE(end - 12)) - shift;
    count = Number(zip.readBigUInt64LE(record + 32));
    offset = Number(zip.readBigUInt64LE(record + 48));
  }
  // Offsets in the file are absolute; the buffer may hold only its end.
  offset -= shift;
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(offset) !== CENTRAL) throw new Error("broken central directory");
    const method = zip.readUInt16LE(offset + 10);
    let compressedSize = zip.readUInt32LE(offset + 20);
    let size = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    let localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const extra = zip.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
    const wide = zip64Values(extra, {
      size: size === 0xffffffff,
      compressed: compressedSize === 0xffffffff,
      offset: localOffset === 0xffffffff,
    });
    size = wide.size ?? size;
    compressedSize = wide.compressed ?? compressedSize;
    localOffset = wide.offset ?? localOffset;
    entries.push({ name, method, compressedSize, size, offset: localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function readZipEntry(zip: Buffer, entry: ZipEntry): Buffer {
  if (zip.readUInt32LE(entry.offset) !== LOCAL) throw new Error("broken local header");
  const nameLength = zip.readUInt16LE(entry.offset + 26);
  const extraLength = zip.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`unsupported compression method ${entry.method}`);
}

export function readZipFile(zip: Buffer, name: string): Buffer {
  const entry = readZipEntries(zip).find((item) => item.name === name);
  if (!entry) throw new Error(`no entry ${name}`);
  return readZipEntry(zip, entry);
}
