import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { patients } from "@/modules/patients";
import { closeHelpers, createOrganization, resetDatabase } from "../helpers";
import { createPatientOrThrow, patientsContext, VALID_CPF, cpfDoc } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fabio", "Gabriela", "Heitor", "Iris", "Joao"];
const LAST = [
  "Silva",
  "Souza",
  "Costa",
  "Pereira",
  "Oliveira",
  "Santos",
  "Lima",
  "Gomes",
  "Ribeiro",
  "Martins",
];

// 100,000 patients in one INSERT ... SELECT (PRD F05 performance target).
async function seedPatients(organizationId: string, count: number) {
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  try {
    await pool.query(
      `INSERT INTO patient (id, organization_id, full_name, normalized_name, birth_date, mobile_phone, phone_digits, updated_at)
       SELECT uuidv7(), $1::uuid, n.full_name, lower(n.full_name), DATE '1950-01-01' + (i % 25000),
              '+55119' || lpad(i::text, 8, '0'), '119' || lpad(i::text, 8, '0'), now()
       FROM generate_series(1, $2) AS i
       CROSS JOIN LATERAL (
         SELECT ($3::text[])[1 + i % 10] || ' ' || ($4::text[])[1 + (i / 10) % 10] || ' ' || i AS full_name
       ) AS n`,
      [organizationId, count, FIRST, LAST],
    );
    await pool.query("ANALYZE patient");
  } finally {
    await pool.end();
  }
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

describe("patient search", () => {
  it("F05: search by partial name, CPF or phone returns the patient within 1 second at p95 with 100,000 records", async () => {
    const ctx = await patientsContext();
    await seedPatients(ctx.organizationId, 100_000);
    const target = await createPatientOrThrow(ctx, {
      fullName: "João Conceição Brandão",
      document: cpfDoc(VALID_CPF),
      mobilePhone: "(21) 99123-4567",
    });

    const queries = [
      { q: "joao conceicao", expect: true },
      { q: "CONCEIÇÃO bran", expect: true },
      { q: "529.982.247-25", expect: true },
      { q: "52998224725", expect: true },
      { q: "9123-4567", expect: true },
      { q: "silva", expect: false },
    ];
    const timings: number[] = [];
    for (let round = 0; round < 10; round++) {
      for (const query of queries) {
        const started = performance.now();
        const result = await patients.searchPatients(ctx, { q: query.q });
        timings.push(performance.now() - started);
        expect(result.ok).toBe(true);
        if (result.ok && query.expect) expect(result.value.items.map((item) => item.id)).toContain(target);
        if (result.ok && !query.expect) {
          expect(result.value.items).toHaveLength(20);
          expect(result.value.total).toBeGreaterThan(1000);
        }
      }
    }
    expect(p95(timings)).toBeLessThan(1000);
  }, 120_000);

  it("F05: front desk sees CPF masked except the last 5 digits in search results", async () => {
    const frontDesk = await patientsContext("FRONT_DESK");
    await createPatientOrThrow(frontDesk, { document: cpfDoc(VALID_CPF) });
    const manager = await patientsContext("MANAGER", frontDesk.organizationId);
    const masked = await patients.searchPatients(frontDesk, { q: "maria" });
    expect(masked.ok && masked.value.items[0]?.document?.display).toBe("***.***.247-25");
    const full = await patients.searchPatients(manager, { q: "maria" });
    expect(full.ok && full.value.items[0]?.document?.display).toBe("529.982.247-25");
  });

  it("F05: social name is displayed instead of the full name", async () => {
    const ctx = await patientsContext();
    await createPatientOrThrow(ctx, { fullName: "João Pedro Silva", socialName: "Joana Silva" });
    const result = await patients.searchPatients(ctx, { q: "joao pedro" });
    expect(result.ok && result.value.items[0]?.displayName).toBe("Joana Silva");
  });

  it("F05: search ignores other organizations even in raw SQL", async () => {
    const ctx = await patientsContext();
    await createPatientOrThrow(ctx);
    const other = await patientsContext("FRONT_DESK", await createOrganization("Outra Clínica"));
    await createPatientOrThrow(other);
    const result = await patients.searchPatients(ctx, { q: "maria silva" });
    expect(result.ok && result.value.total).toBe(1);
  });

  it("F05: short terms and wildcards are handled", async () => {
    const ctx = await patientsContext();
    await createPatientOrThrow(ctx);
    const short = await patients.searchPatients(ctx, { q: "ma" });
    expect(!short.ok && short.error.code).toBe("PATIENTS_SEARCH_TOO_SHORT");
    const wildcard = await patients.searchPatients(ctx, { q: "%%%" });
    expect(wildcard.ok && wildcard.value.total).toBe(0);
  });
});
