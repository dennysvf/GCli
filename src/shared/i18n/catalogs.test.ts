import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, type Locale } from "./locales";

type Tree = { [key: string]: string | Tree };

const SRC = join(__dirname, "..", "..");

// Every catalog on disk: the shared one and one per module, each with a file per language.
function loadCatalogs(): { name: string; files: Record<Locale, Tree> }[] {
  const read = (dir: string): Record<Locale, Tree> => {
    const files = {} as Record<Locale, Tree>;
    for (const locale of SUPPORTED_LOCALES) {
      files[locale] = JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf-8")) as Tree;
    }
    return files;
  };
  const catalogs = [{ name: "shared", files: read(join(SRC, "shared", "i18n", "messages")) }];
  const modules = join(SRC, "modules");
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(modules, entry.name, "messages");
    try {
      readdirSync(dir);
    } catch {
      continue;
    }
    catalogs.push({ name: entry.name, files: read(dir) });
  }
  return catalogs;
}

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else for (const [nested, text] of flatten(value, path)) result.set(nested, text);
  }
  return result;
}

function placeholders(elements: MessageFormatElement[], found = new Set<string>()): Set<string> {
  for (const element of elements) {
    if (element.type === TYPE.pound || element.type === TYPE.literal) continue;
    if (element.type === TYPE.tag) {
      found.add(`<${element.value}>`);
      placeholders(element.children, found);
      continue;
    }
    found.add(element.value);
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) placeholders(option.value, found);
    }
  }
  return found;
}

// Source files that may call the translator (tests and generated code excluded).
function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "generated") files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("message catalogs", () => {
  const catalogs = loadCatalogs();

  it("F16: every catalog has the same keys, valid ICU and the same placeholders in the three languages", () => {
    const problems: string[] = [];
    for (const { name, files } of catalogs) {
      const source = flatten(files["pt-BR"]);
      for (const locale of SUPPORTED_LOCALES) {
        const flat = flatten(files[locale]);
        for (const key of source.keys()) {
          if (!flat.has(key)) problems.push(`${name}/${locale}: missing ${key}`);
        }
        for (const [key, text] of flat) {
          const original = source.get(key);
          if (original === undefined) {
            problems.push(`${name}/${locale}: extra ${key}`);
            continue;
          }
          try {
            const own = [...placeholders(parse(text))].sort().join(",");
            const expected = [...placeholders(parse(original))].sort().join(",");
            if (own !== expected)
              problems.push(`${name}/${locale}: ${key} placeholders {${own}} != {${expected}}`);
          } catch {
            problems.push(`${name}/${locale}: ${key} is not valid ICU`);
          }
          if (text.trim() === "") problems.push(`${name}/${locale}: ${key} is empty`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("F16: language names are the same in every language", () => {
    const shared = catalogs.find((catalog) => catalog.name === "shared");
    const names = SUPPORTED_LOCALES.map((locale) => JSON.stringify(shared?.files[locale].common));
    // Only the language names must match; other common words differ, so compare that subtree.
    const languages = SUPPORTED_LOCALES.map((locale) => {
      const common = shared?.files[locale].common;
      return typeof common === "object" ? JSON.stringify(common.languages) : "";
    });
    expect(names).toHaveLength(3);
    expect(new Set(languages).size).toBe(1);
  });
  it("F16: every full message key written in the code exists in the three languages", () => {
    // A key starts with a catalog namespace (a shared section or a module); keys of a namespaced
    // translator ("auth.title" under useTranslations("identity")) are not full keys and are skipped.
    const flats = SUPPORTED_LOCALES.map((locale) => {
      const merged = new Map<string, string>();
      for (const { name, files } of catalogs) {
        for (const [key, text] of flatten(files[locale]))
          merged.set(name === "shared" ? key : `${name}.${key}`, text);
      }
      return merged;
    });
    const namespaces = new Set([...(flats[0]?.keys() ?? [])].map((key) => key.split(".")[0]));
    const missing: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf-8");
      // A namespaced translator makes every key relative to its namespace.
      if (/(?:use|get)Translations\("/.test(text)) continue;
      for (const match of text.matchAll(/\b(?:t|translate)\(\s*"([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)"/g)) {
        const key = match[1] ?? "";
        if (!namespaces.has(key.split(".")[0] ?? "")) continue;
        flats.forEach((flat, index) => {
          if (!flat.has(key)) missing.push(`${SUPPORTED_LOCALES[index]}: ${key} (${file.slice(SRC.length)})`);
        });
      }
    }
    expect(missing).toEqual([]);
  });
});
