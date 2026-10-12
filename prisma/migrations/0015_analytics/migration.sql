-- F12 Management Dashboard (spec docs/F12-management-dashboard/spec.md, section 6): indexes for the
-- dashboard aggregates. No new tables; the analytics module only reads.

-- CreateIndex
CREATE INDEX "ix_patient_org_created" ON "patient"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_charge_org_unit_created" ON "charge"("organization_id", "unit_id", "created_at");
