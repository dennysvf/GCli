import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ptBR from "../messages/pt-BR.json";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AUDIT_LOG_ENTITY_TYPE } from "./entity-types";

const SRC = join(__dirname, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== "generated") files.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

// Entity types written by audit.record(): literals (`entityType: "patient"`, also inside a
// conditional) and the values of a local lookup map (`entityType: ENTITY[list]`).
function recordedEntityTypes(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(/entityType:[^,\n}]*?"([a-z_]+)"/g)) found.add(match[1] ?? "");
    for (const lookup of text.matchAll(/entityType:\s*([A-Z_]+)\[/g)) {
      const map = new RegExp(`const ${lookup[1]}[^=]*=\\s*\\{([^}]*)\\}`).exec(text)?.[1] ?? "";
      for (const value of map.matchAll(/:\s*"([a-z_]+)"/g)) found.add(value[1] ?? "");
    }
  }
  found.delete("");
  return found;
}

describe("audit registries", () => {
  it("F15: every entity type recorded in the sources and every audit action is in the registries", () => {
    const recorded = recordedEntityTypes();
    expect(recorded.size).toBeGreaterThan(30);
    expect([...recorded].filter((type) => !AUDIT_ENTITY_TYPES.includes(type)).sort()).toEqual([]);
    // Nothing in the registry that no module records, except the export of the audit log itself.
    expect(
      AUDIT_ENTITY_TYPES.filter((type) => !recorded.has(type) && type !== AUDIT_LOG_ENTITY_TYPE),
    ).toEqual([]);
    expect(new Set(AUDIT_ENTITY_TYPES).size).toBe(AUDIT_ENTITY_TYPES.length);

    const writer = readFileSync(join(SRC, "shared", "audit", "audit-writer.ts"), "utf-8");
    const union = /export type AuditAction =([^;]+);/.exec(writer)?.[1] ?? "";
    const actions = [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]);
    expect([...AUDIT_ACTIONS].sort()).toEqual(actions.sort());
    expect(actions).not.toContain("RETIME");
    expect(actions).not.toContain("SKIP");
  });

  it("F15: every action and entity type has a pt-BR label", () => {
    for (const action of AUDIT_ACTIONS) expect(ptBR.actions[action]).toBeTruthy();
    const labels: Record<string, string> = ptBR.entityTypes;
    for (const type of AUDIT_ENTITY_TYPES) expect(labels[type], type).toBeTruthy();
  });
});
