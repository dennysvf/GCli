// Real type of an uploaded file from its bytes; what the client declares is never trusted
// (ADR-031, ADR-033). Pure functions: reading the bytes is the caller's job.

export type DetectedFileType =
  "application/pdf" | "image/jpeg" | "image/png" | "image/heic" | "application/zip";

export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Bytes needed to tell every type apart (the HEIC brand ends at byte 12).
export const FILE_SIGNATURE_BYTES = 16;

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "%PDF") return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 4))) {
    return "image/heic";
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "application/zip";
  }
  return null;
}

// --- DOCX (a ZIP with a known set of entries) ------------------------------------------------------

// The end of central directory record is at most 22 bytes plus a comment of up to 65,535 bytes.
export const ZIP_TAIL_BYTES = 65_557;
// A real .docx has a few dozen entries; a larger directory is refused instead of read.
export const ZIP_DIRECTORY_MAX_BYTES = 1024 * 1024;

const EOCD_SIGNATURE = [0x50, 0x4b, 0x05, 0x06];
const CENTRAL_HEADER_SIGNATURE = [0x50, 0x4b, 0x01, 0x02];
const CENTRAL_HEADER_BYTES = 46;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export type ZipDirectoryLocation = { offset: number; size: number; entries: number };

// Where the central directory is, from the last bytes of the file.
export function locateZipDirectory(tail: Uint8Array): ZipDirectoryLocation | null {
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (!matchesAt(tail, at, EOCD_SIGNATURE)) continue;
    const data = view(tail);
    return {
      entries: data.getUint16(at + 10, true),
      size: data.getUint32(at + 12, true),
      offset: data.getUint32(at + 16, true),
    };
  }
  return null;
}

// Entry names of the central directory, or null when it is malformed.
export function listZipEntryNames(directory: Uint8Array, entries: number): string[] | null {
  const names: string[] = [];
  const data = view(directory);
  let at = 0;
  for (let index = 0; index < entries; index += 1) {
    if (at + CENTRAL_HEADER_BYTES > directory.length || !matchesAt(directory, at, CENTRAL_HEADER_SIGNATURE)) {
      return null;
    }
    const nameLength = data.getUint16(at + 28, true);
    const extraLength = data.getUint16(at + 30, true);
    const commentLength = data.getUint16(at + 32, true);
    const nameStart = at + CENTRAL_HEADER_BYTES;
    if (nameStart + nameLength > directory.length) return null;
    names.push(new TextDecoder().decode(directory.slice(nameStart, nameStart + nameLength)));
    at = nameStart + nameLength + extraLength + commentLength;
  }
  return names;
}

// PRD F08: only .docx is accepted. A macro-enabled file (.docm) keeps its macros in
// word/vbaProject.bin, so it is refused.
export function isDocxEntries(names: readonly string[]): boolean {
  return (
    names.includes("[Content_Types].xml") &&
    names.includes("word/document.xml") &&
    !names.includes("word/vbaProject.bin")
  );
}

export type FileReader = {
  size: number;
  // Reads up to `length` bytes from `start`, or null when the object does not exist.
  read(start: number, length: number): Promise<Uint8Array | null>;
};

// The real type of a stored file: the first bytes decide, and a ZIP is accepted only as DOCX.
export async function detectStoredFileType(
  reader: FileReader,
): Promise<Exclude<DetectedFileType, "application/zip"> | typeof DOCX_CONTENT_TYPE | null> {
  const head = await reader.read(0, FILE_SIGNATURE_BYTES);
  const detected = head ? detectFileType(head) : null;
  if (detected !== "application/zip") return detected;

  const tailStart = Math.max(0, reader.size - ZIP_TAIL_BYTES);
  const tail = await reader.read(tailStart, reader.size - tailStart);
  const location = tail ? locateZipDirectory(tail) : null;
  if (!location || location.size > ZIP_DIRECTORY_MAX_BYTES || location.offset + location.size > reader.size) {
    return null;
  }
  const directory = await reader.read(location.offset, location.size);
  const names = directory ? listZipEntryNames(directory, location.entries) : null;
  return names && isDocxEntries(names) ? DOCX_CONTENT_TYPE : null;
}
