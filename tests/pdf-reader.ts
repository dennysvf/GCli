import { inflateSync } from "node:zlib";

// A small PDF reader for the checks on generated documents and report PDFs (F08, F13): it lists the
// pages in order with the text drawn on each page and the images each page paints. Enough for the
// files the application writes through @react-pdf/renderer (pdfkit): plain indirect objects with
// direct stream lengths, Flate streams, embedded fonts with a ToUnicode map and image XObjects.
// No object streams, no encryption.

export type PdfImage = { name: string; width: number; height: number };
export type PdfPage = { text: string; images: PdfImage[]; mediaBox: number[] };

type PdfObject = { dict: string; stream: Buffer | null };
type CMap = { codeBytes: number; map: Map<number, string> };

function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(text))) {
    const id = Number(match[1]);
    const bodyStart = header.lastIndex;
    const end = text.indexOf("endobj", bodyStart);
    const streamAt = text.indexOf("stream", bodyStart);
    if (streamAt !== -1 && (end === -1 || streamAt < end)) {
      const dict = text.slice(bodyStart, streamAt);
      const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      if (!length) throw new Error(`object ${id}: indirect stream lengths are not supported`);
      let dataStart = streamAt + "stream".length;
      if (text[dataStart] === "\r") dataStart += 1;
      if (text[dataStart] === "\n") dataStart += 1;
      const dataEnd = dataStart + Number(length[1]);
      objects.set(id, { dict, stream: pdf.subarray(dataStart, dataEnd) });
      header.lastIndex = text.indexOf("endobj", dataEnd) + "endobj".length;
    } else {
      objects.set(id, { dict: text.slice(bodyStart, end), stream: null });
      header.lastIndex = end + "endobj".length;
    }
  }
  return objects;
}

function decodedStream(object: PdfObject): Buffer {
  if (!object.stream) return Buffer.alloc(0);
  return /\/Filter\s*\/FlateDecode/.test(object.dict) ? inflateSync(object.stream) : object.stream;
}

const refs = (text: string) => [...text.matchAll(/(\d+)\s+0\s+R/g)].map((match) => Number(match[1]));

// The value of `/Key` in a dictionary: a nested `<< >>` dictionary (or the dictionary of the
// object it refers to), returned as text.
function entryDict(objects: Map<number, PdfObject>, dict: string, key: string): string {
  const at = new RegExp(`/${key}\\s*`).exec(dict);
  if (!at) return "";
  const rest = dict.slice(at.index + at[0].length);
  if (rest.startsWith("<<")) {
    let depth = 0;
    for (let index = 0; index < rest.length - 1; index += 1) {
      const pair = rest.slice(index, index + 2);
      if (pair === "<<") {
        depth += 1;
        index += 1;
      } else if (pair === ">>") {
        depth -= 1;
        index += 1;
        if (depth === 0) return rest.slice(2, index - 1);
      }
    }
    return rest;
  }
  const ref = /^(\d+)\s+0\s+R/.exec(rest);
  return ref ? (objects.get(Number(ref[1]))?.dict ?? "") : "";
}

// Resource name to object number, e.g. { F1: 12, I1: 15 }.
function namedRefs(dict: string): Map<string, number> {
  return new Map(
    [...dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/g)].map((match) => [
      match[1] ?? "",
      Number(match[2]),
    ]),
  );
}

function utf16(hex: string): string {
  const units: number[] = [];
  for (let index = 0; index + 4 <= hex.length; index += 4)
    units.push(parseInt(hex.slice(index, index + 4), 16));
  return String.fromCharCode(...units);
}

function parseCMap(source: string): CMap {
  const map = new Map<number, string>();
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(source);
  const codeBytes = space?.[1] ? space[1].length / 2 : 2;
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? "").matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      map.set(parseInt(pair[1] ?? "0", 16), utf16(pair[2] ?? ""));
    }
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1] ?? "";
    for (const range of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const low = parseInt(range[1] ?? "0", 16);
      const high = parseInt(range[2] ?? "0", 16);
      const target = range[3] ?? "";
      if (target.startsWith("[")) {
        const items = [...target.matchAll(/<([0-9A-Fa-f]*)>/g)].map((item) => utf16(item[1] ?? ""));
        items.forEach((value, offset) => map.set(low + offset, value));
      } else {
        const first = target.slice(1, -1);
        const base = parseInt(first.slice(-4), 16);
        for (let code = low; code <= high; code += 1) {
          map.set(code, utf16(first.slice(0, -4)) + String.fromCharCode(base + code - low));
        }
      }
    }
  }
  return { codeBytes, map };
}

function decodeString(bytes: Buffer, cmap: CMap | undefined): string {
  if (!cmap) return bytes.toString("latin1");
  let out = "";
  for (let index = 0; index + cmap.codeBytes <= bytes.length; index += cmap.codeBytes) {
    const code = bytes.readUIntBE(index, cmap.codeBytes);
    out += cmap.map.get(code) ?? "";
  }
  return out;
}

function literalBytes(body: string): Buffer {
  const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
  const unescaped = body.replace(/\\([0-7]{1,3}|.)/g, (_, escape: string) =>
    /^[0-7]+$/.test(escape) ? String.fromCharCode(parseInt(escape, 8)) : (escapes[escape] ?? escape),
  );
  return Buffer.from(unescaped, "latin1");
}

// Text drawn by one content stream, one line per BT…ET block, in drawing order.
function pageText(content: string, fonts: Map<string, CMap | undefined>): string {
  const lines: string[] = [];
  let line = "";
  let font: CMap | undefined;
  const tokens = /\/([^\s/<>[\]()]+)\s+[-\d.]+\s+Tf|<(?!<)([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)|\bET\b/g;
  for (const token of content.matchAll(tokens)) {
    if (token[1] !== undefined) font = fonts.get(token[1]);
    else if (token[2] !== undefined)
      line += decodeString(Buffer.from(token[2].replace(/\s+/g, ""), "hex"), font);
    else if (token[3] !== undefined) line += decodeString(literalBytes(token[3]), font);
    else {
      lines.push(line);
      line = "";
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export function readPdf(pdf: Buffer): PdfPage[] {
  const objects = parseObjects(pdf);
  const isPages = (object: PdfObject) => /\/Type\s*\/Pages\b/.test(object.dict);
  const root = [...objects.values()].find((object) => isPages(object) && !/\/Parent\b/.test(object.dict));
  if (!root) throw new Error("no page tree");

  const pageIds: number[] = [];
  const walk = (node: PdfObject) => {
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node.dict)?.[1] ?? "";
    for (const id of refs(kids)) {
      const kid = objects.get(id);
      if (!kid) continue;
      if (isPages(kid)) walk(kid);
      else pageIds.push(id);
    }
  };
  walk(root);

  const cmaps = new Map<number, CMap | undefined>();
  const cmapOfFont = (fontId: number) => {
    if (!cmaps.has(fontId)) {
      const font = objects.get(fontId);
      const toUnicode = font ? /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font.dict) : null;
      const stream = toUnicode ? objects.get(Number(toUnicode[1])) : undefined;
      cmaps.set(fontId, stream ? parseCMap(decodedStream(stream).toString("latin1")) : undefined);
    }
    return cmaps.get(fontId);
  };

  return pageIds.map((id) => {
    const page = objects.get(id);
    if (!page) throw new Error(`page ${id} missing`);
    const resources = entryDict(objects, page.dict, "Resources");
    const fonts = new Map(
      [...namedRefs(entryDict(objects, resources, "Font"))].map(([name, fontId]) => [
        name,
        cmapOfFont(fontId),
      ]),
    );
    const contentsEntry = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(page.dict)?.[1] ?? "";
    const content = refs(contentsEntry)
      .map((contentId) => {
        const object = objects.get(contentId);
        return object ? decodedStream(object).toString("latin1") : "";
      })
      .join("\n");
    const painted = new Set([...content.matchAll(/\/([^\s/<>[\]()]+)\s+Do\b/g)].map((match) => match[1]));
    const images: PdfImage[] = [];
    for (const [name, imageId] of namedRefs(entryDict(objects, resources, "XObject"))) {
      const image = objects.get(imageId);
      if (!image || !/\/Subtype\s*\/Image\b/.test(image.dict) || !painted.has(name)) continue;
      images.push({
        name,
        width: Number(/\/Width\s+(\d+)/.exec(image.dict)?.[1]),
        height: Number(/\/Height\s+(\d+)/.exec(image.dict)?.[1]),
      });
    }
    const box = /\/MediaBox\s*\[([^\]]*)\]/.exec(page.dict)?.[1] ?? "";
    return { text: pageText(content, fonts), images, mediaBox: box.trim().split(/\s+/).map(Number) };
  });
}
