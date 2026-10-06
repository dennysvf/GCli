import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Migrates a populated F01–F06 database with the 0008 migration and checks the copied values.
// It uses its own database, created next to the test one, so the other suites are not affected.
const MIGRATIONS = join(process.cwd(), "prisma", "migrations");
const DATABASE = "gcli_migration_f16";

let admin: Pool;
let pool: Pool;

function migrationUrl(database: string): string {
  const url = new URL(process.env.DATABASE_MIGRATION_URL ?? "");
  url.pathname = `/${database}`;
  return url.toString();
}

function migrationFile(name: string): string {
  return readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf-8");
}

const ORG = "01900000-0000-7000-8000-000000000001";
const UNIT = "01900000-0000-7000-8000-000000000002";
const CATEGORY = "01900000-0000-7000-8000-000000000003";
const SERVICE = "01900000-0000-7000-8000-000000000004";
const PROFESSIONAL = "01900000-0000-7000-8000-000000000005";
const OTHER_PROFESSIONAL = "01900000-0000-7000-8000-000000000006";
const PATIENT = "01900000-0000-7000-8000-000000000007";
const APPOINTMENT = "01900000-0000-7000-8000-000000000008";
const CHANGE = "01900000-0000-7000-8000-000000000009";

beforeAll(async () => {
  admin = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  await admin.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
  await admin.query(`CREATE DATABASE ${DATABASE}`);
  pool = new Pool({ connectionString: migrationUrl(DATABASE), max: 1 });

  const earlier = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name < "0008")
    .map((entry) => entry.name)
    .sort();
  for (const name of earlier) await pool.query(migrationFile(name));

  // A populated database as F06 left it: everything Brazilian.
  await pool.query(
    `INSERT INTO organization (id, legal_name, cnpj) VALUES ($1, 'Clínica Ltda', '11222333000181')`,
    [ORG],
  );
  await pool.query(
    `INSERT INTO unit (id, organization_id, name, cnpj, time_zone, phone, cep, street, state)
     VALUES ($1, $2, 'Centro', '12ABC34501DE35', 'America/Sao_Paulo', '1133334444', '01310100', 'Avenida Paulista', 'SP')`,
    [UNIT, ORG],
  );
  await pool.query(
    `INSERT INTO service_category (id, organization_id, name, sort_order) VALUES ($1, $2, 'Consultas', 1)`,
    [CATEGORY, ORG],
  );
  await pool.query(
    `INSERT INTO service (id, organization_id, category_id, name, duration_minutes, price_cents, color)
     VALUES ($1, $2, $3, 'Consulta', 30, 25000, 'blue')`,
    [SERVICE, ORG, CATEGORY],
  );
  await pool.query(
    `INSERT INTO service_price_change (id, organization_id, service_id, previous_price_cents, price_cents)
     VALUES ($1, $2, $3, 20000, 25000)`,
    [CHANGE, ORG, SERVICE],
  );
  await pool.query(
    `INSERT INTO professional (id, organization_id, full_name, council_type, council_number, council_state, cpf, phone, color)
     VALUES ($1, $2, 'Ana Lima', 'CRM', '123456', 'SP', '52998224725', '11988887777', 'teal'),
            ($3, $2, 'Bruno Sem Conselho', 'NONE', NULL, NULL, NULL, NULL, 'blue')`,
    [PROFESSIONAL, ORG, OTHER_PROFESSIONAL],
  );
  await pool.query(
    `INSERT INTO patient (id, organization_id, full_name, normalized_name, birth_date, cpf, mobile_phone,
                          secondary_phone, phone_digits, cep, street, state, guardian_name, guardian_cpf,
                          guardian_relationship, guardian_phone)
     VALUES ($1, $2, 'Lucas Prado', 'lucas prado', '2015-03-01', '52998224725', '11988887777', '1133334444',
             '11988887777 1133334444', '01310100', 'Rua A', 'SP', 'Carla Prado', '11144477735', 'MOTHER', '11977776666')`,
    [PATIENT, ORG],
  );
  await pool.query(
    `INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id, starts_at,
                              ends_at, duration_minutes, price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, '2026-11-02T13:00:00Z', '2026-11-02T13:30:00Z', 30, 25000)`,
    [APPOINTMENT, ORG, UNIT, PROFESSIONAL, SERVICE, PATIENT],
  );

  await pool.query(migrationFile("0008_internationalization"));
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
  await admin?.end();
});

async function row<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await pool.query(sql, params);
  const first = result.rows[0] as T | undefined;
  if (!first) throw new Error(`no row for ${sql}`);
  return first;
}

describe("0008 internationalization migration", () => {
  it("F16: the 0008 migration keeps every F01–F06 record valid as Brazil", async () => {
    expect(await row("SELECT country, default_locale, tax_id FROM organization")).toEqual({
      country: "BR",
      default_locale: "pt-BR",
      tax_id: "11222333000181",
    });
    expect(await row("SELECT country, currency, tax_id, phone, postal_code, region FROM unit")).toEqual({
      country: "BR",
      currency: "BRL",
      tax_id: "12ABC34501DE35",
      phone: "+551133334444",
      postal_code: "01310100",
      region: "SP",
    });

    // Prices move to one row per currency and the history keeps its values with the currency.
    expect(await row("SELECT currency, amount_minor::int AS amount FROM service_price")).toEqual({
      currency: "BRL",
      amount: 25000,
    });
    expect(
      await row(
        "SELECT currency, previous_amount_minor::int AS previous, amount_minor::int AS amount FROM service_price_change",
      ),
    ).toEqual({ currency: "BRL", previous: 20000, amount: 25000 });
    expect(await row("SELECT price_minor::int AS price, currency FROM appointment")).toEqual({
      price: 25000,
      currency: "BRL",
    });

    // The council becomes a Brazilian registration; "no council" becomes a flag.
    expect(await row("SELECT country, council_type, number, region FROM professional_registration")).toEqual({
      country: "BR",
      council_type: "CRM",
      number: "123456",
      region: "SP",
    });
    const flags = await pool.query("SELECT full_name, has_no_council FROM professional ORDER BY full_name");
    expect(flags.rows).toEqual([
      { full_name: "Ana Lima", has_no_council: false },
      { full_name: "Bruno Sem Conselho", has_no_council: true },
    ]);
    expect(await row("SELECT count(*)::int AS total FROM professional_registration")).toEqual({ total: 1 });
    expect(
      await row(
        "SELECT document_country, document_type, document_number, phone FROM professional WHERE id = $1",
        [PROFESSIONAL],
      ),
    ).toEqual({
      document_country: "BR",
      document_type: "CPF",
      document_number: "52998224725",
      phone: "+5511988887777",
    });

    // Patients: CPF documents, E.164 phones, the search digits unchanged and the generic address.
    expect(
      await row(
        `SELECT document_country, document_type, document_number, guardian_document_type, guardian_document_number,
                mobile_phone, secondary_phone, guardian_phone, phone_digits, address_country, postal_code, region
         FROM patient`,
      ),
    ).toEqual({
      document_country: "BR",
      document_type: "CPF",
      document_number: "52998224725",
      guardian_document_type: "CPF",
      guardian_document_number: "11144477735",
      mobile_phone: "+5511988887777",
      secondary_phone: "+551133334444",
      guardian_phone: "+5511977776666",
      phone_digits: "11988887777 1133334444",
      address_country: "BR",
      postal_code: "01310100",
      region: "SP",
    });
  });

  it("F16: the new constraints keep working after the migration", async () => {
    // A document is unique per type inside the organization, and the old columns are gone.
    await expect(
      pool.query(
        `INSERT INTO patient (id, organization_id, full_name, normalized_name, birth_date, document_country,
                              document_type, document_number, mobile_phone, phone_digits)
         VALUES (gen_random_uuid(), $1, 'Outro Paciente', 'outro paciente', '1990-01-01', 'BR', 'CPF',
                 '52998224725', '+5511911112222', '11911112222')`,
        [ORG],
      ),
    ).rejects.toThrow(/uq_patient_org_document/);
    await expect(pool.query("SELECT cpf FROM patient")).rejects.toThrow();
    await expect(pool.query("SELECT price_cents FROM service")).rejects.toThrow();
    // A unit keeps its currency consistent with its country.
    await expect(pool.query("UPDATE unit SET currency = 'EUR'")).rejects.toThrow(/ck_unit_currency_country/);
    // One registration per country for a professional.
    await expect(
      pool.query(
        `INSERT INTO professional_registration (id, organization_id, professional_id, country, council_type, number, region)
         VALUES (gen_random_uuid(), $1, $2, 'BR', 'CRO', '999', 'SP')`,
        [ORG, PROFESSIONAL],
      ),
    ).rejects.toThrow(/uq_registration_professional_country/);
  });
});
