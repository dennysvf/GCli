-- F01 audit log (architecture section 5.3, spec F01 section 6). Hand-written: Prisma cannot express
-- partitioning. Monthly partitions live in the separate schema audit_partitions so Prisma Migrate
-- ignores them; the parent table in public is what the application reads and writes.

CREATE SCHEMA IF NOT EXISTS audit_partitions;

CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organization_id" UUID,
    "actor_type" VARCHAR(12) NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(40),
    "entity_id" UUID,
    "summary" VARCHAR(255),
    "changes" JSONB,
    "metadata" JSONB,
    "ip_address" INET,
    "request_id" VARCHAR(64),

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id", "occurred_at"),
    CONSTRAINT "ck_audit_org_required" CHECK ("organization_id" IS NOT NULL OR "actor_type" = 'ANONYMOUS'),
    CONSTRAINT "ck_audit_actor_type" CHECK ("actor_type" IN ('USER', 'SYSTEM', 'ANONYMOUS'))
) PARTITION BY RANGE ("occurred_at");

CREATE INDEX "ix_audit_org_time" ON "audit_event"("organization_id", "occurred_at" DESC);
CREATE INDEX "ix_audit_entity" ON "audit_event"("entity_type", "entity_id", "occurred_at" DESC);
CREATE INDEX "ix_audit_actor" ON "audit_event"("actor_user_id", "occurred_at" DESC);

-- Safety net for rows outside every monthly partition.
CREATE TABLE audit_partitions.audit_event_default PARTITION OF "audit_event" DEFAULT;

-- Current month and the next three; the worker job keeps three months ahead from then on.
DO $$
DECLARE
  month_start date := date_trunc('month', now())::date;
  i int;
  from_date date;
  to_date date;
BEGIN
  FOR i IN 0..3 LOOP
    from_date := (month_start + make_interval(months => i))::date;
    to_date := (month_start + make_interval(months => i + 1))::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS audit_partitions.%I PARTITION OF "audit_event" FOR VALUES FROM (%L) TO (%L)',
      'audit_event_' || to_char(from_date, 'YYYY_MM'), from_date, to_date
    );
  END LOOP;
END $$;

-- Append-only for the runtime role: reads and inserts through the parent table only.
REVOKE ALL ON "audit_event" FROM gcli_app;
GRANT SELECT, INSERT ON "audit_event" TO gcli_app;
