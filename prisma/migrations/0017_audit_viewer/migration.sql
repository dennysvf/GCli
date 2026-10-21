-- F15 audit log viewer (spec docs/F15-audit-log-viewer, section 6; ADR-039). Indexes for the action
-- and entity type filters, which the F01 indexes do not serve. Created on the partitioned parent, so
-- every existing and future partition gets them (CONCURRENTLY is not supported on a partitioned
-- parent).
CREATE INDEX "ix_audit_org_action_time" ON "audit_event"("organization_id", "action", "occurred_at" DESC);
CREATE INDEX "ix_audit_org_entity_type_time" ON "audit_event"("organization_id", "entity_type", "occurred_at" DESC);
