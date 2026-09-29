import { Pool } from "pg";

// Keeps monthly audit_event partitions ready ahead of time (spec F01 section 6). Runs with the
// owner role because the runtime role cannot create tables.
export const MONTHS_AHEAD = 3;

function monthStart(date: Date, offset: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function ensureAuditPartitions(
  ownerConnectionString: string,
  now = new Date(),
): Promise<string[]> {
  const pool = new Pool({ connectionString: ownerConnectionString, max: 1 });
  const created: string[] = [];
  try {
    for (let offset = 0; offset <= MONTHS_AHEAD; offset++) {
      const from = monthStart(now, offset);
      const to = monthStart(now, offset + 1);
      const name = `audit_event_${from.getUTCFullYear()}_${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
      const exists = await pool.query("SELECT to_regclass($1) AS oid", [`audit_partitions.${name}`]);
      if (exists.rows[0]?.oid) continue;
      // Identifiers and dates are generated here, never from user input.
      await pool.query(
        `CREATE TABLE audit_partitions.${name} PARTITION OF audit_event FOR VALUES FROM ('${isoDate(from)}') TO ('${isoDate(to)}')`,
      );
      created.push(name);
    }
  } finally {
    await pool.end();
  }
  return created;
}
