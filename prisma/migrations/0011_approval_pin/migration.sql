-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "approval_pin_failed_count" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "approval_pin_hash" VARCHAR(255),
ADD COLUMN     "approval_pin_locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "approval_pin_set_at" TIMESTAMPTZ(6);

-- hand-written: PRD F09 — the PIN is exactly a hash (never stored in clear) and the failure counter
-- stays within the lockout rule.
ALTER TABLE "app_user" ADD CONSTRAINT "ck_app_user_approval_pin" CHECK (
  ("approval_pin_hash" IS NULL) = ("approval_pin_set_at" IS NULL) AND "approval_pin_failed_count" >= 0);
