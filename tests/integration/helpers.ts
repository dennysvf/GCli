import { hash } from "@node-rs/argon2";
import { Pool } from "pg";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import type { Role } from "@/shared/kernel/roles";
import type { RequestMeta } from "@/modules/identity";

// Test fixtures that write directly to the database, plus request helpers.

let ownerPool: Pool | undefined;

function owner(): Pool {
  ownerPool ??= new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  return ownerPool;
}

// Empties every application table. Runs as the owner role, which may truncate audit_event.
export async function resetDatabase(): Promise<void> {
  await owner().query(`TRUNCATE organization, app_user, session, account, verification, invitation,
    rate_limit_bucket, outbox_message, audit_event,
    unit, unit_business_hours, unit_closure, room, unit_selection,
    service_category, service, service_allowed_room, service_price_change,
    professional, professional_service, professional_schedule, professional_working_interval,
    professional_time_off, patient, referral_source, tag, patient_tag, privacy_terms_version,
    consent_record, consent_upload CASCADE`);
}

export async function closeHelpers(): Promise<void> {
  await ownerPool?.end();
  ownerPool = undefined;
}

export async function createOrganization(name = "Clínica Exemplo"): Promise<string> {
  const id = newId();
  await db().organization.create({ data: { id, legalName: `${name} Ltda`, tradeName: name } });
  return id;
}

export const DEFAULT_PASSWORD = "senhaForte2026";

export async function createUser(input: {
  organizationId: string;
  role?: Role;
  email?: string;
  name?: string;
  password?: string;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<{ id: string; email: string; password: string }> {
  const id = newId();
  const email = input.email ?? `${id}@exemplo.com.br`;
  const password = input.password ?? DEFAULT_PASSWORD;
  await db().user.create({
    data: {
      id,
      organizationId: input.organizationId,
      name: input.name ?? "Pessoa Teste",
      email,
      emailVerified: true,
      role: input.role ?? "FRONT_DESK",
      status: input.status ?? "ACTIVE",
    },
  });
  await db().account.create({
    data: {
      id: newId(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hash(password),
    },
  });
  return { id, email, password };
}

let ipCounter = 1;

// A fresh IP per test keeps the per-IP rate limit from leaking between tests.
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

export function meta(options: { cookies?: string[]; ip?: string } = {}): RequestMeta {
  const headers = new Headers({ "user-agent": "vitest" });
  if (options.cookies?.length) {
    headers.set("cookie", options.cookies.map((cookie) => cookie.split(";")[0]).join("; "));
  }
  return { requestId: newId(), ipAddress: options.ip ?? freshIp(), userAgent: "vitest", headers };
}

export async function auditEvents(where: { action?: string; entityId?: string } = {}) {
  return db().auditEvent.findMany({ where, orderBy: { occurredAt: "asc" } });
}

// Signs a fixture user in and returns the resolved request context and cookies.
export async function signedInContext(user: { email: string; password: string }) {
  const { identity } = await import("@/modules/identity");
  const signIn = await identity.signIn({ email: user.email, password: user.password }, meta());
  if (!signIn.ok) throw new Error(`sign-in failed: ${signIn.error.code}`);
  const ctx = await identity.resolveRequestContext(meta({ cookies: signIn.value.setCookies }));
  if (!ctx) throw new Error("no context");
  return { ctx, cookies: signIn.value.setCookies };
}

// Reads the invitation token from the most recent outbox email for an address.
export async function invitationTokenFor(email: string): Promise<string> {
  const messages = await db().outboxMessage.findMany({
    where: { type: "email.invitation" },
    orderBy: { createdAt: "desc" },
  });
  const message = messages.find((row) => (row.payload as { to?: string }).to === email);
  if (!message) throw new Error(`no invitation email for ${email}`);
  const token = new URL((message.payload as { url: string }).url).searchParams.get("token");
  if (!token) throw new Error("missing token");
  return token;
}
