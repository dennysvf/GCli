import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBilling, type BillingDeps } from "@/modules/billing";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import { billingWorld, manualCharge, mustReceive, receive, type BillingWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

type Rendered = Parameters<BillingDeps["receipts"]["render"]>[0];

function recordingBilling(captured: Rendered[]) {
  return createBilling((base) => ({
    ...base,
    receipts: {
      async render(input) {
        captured.push(input);
        return base.receipts.render(input);
      },
    },
  }));
}

const plain = (value: string) => value.replace(/ /g, " ");

describe("receipt", () => {
  it("F09: the receipt PDF has organization data, patient, item, amounts, methods and date, generated in 3 seconds or less", async () => {
    await db().organization.update({
      where: { id: world.organizationId },
      data: { taxId: "11222333000181" },
    });
    const charge = await manualCharge(world, 20_000);
    await receive(world, charge.id, [
      { method: "PIX", amountMinor: 8000 },
      { method: "CREDIT_CARD", amountMinor: 4000, installments: 3 },
    ]);
    const captured: Rendered[] = [];
    const started = Date.now();
    const result = await recordingBilling(captured).renderReceipt(world.desk, { chargeId: charge.id });
    const elapsed = Date.now() - started;

    expect(result.ok && result.value.bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.ok && result.value.fileName).toBe(`recibo-${charge.number}.pdf`);
    expect(elapsed).toBeLessThanOrEqual(3000);

    const input = captured[0];
    expect(input).toMatchObject({
      clinicName: "Clínica Exemplo",
      number: charge.number,
      patient: { name: "Mari Oliveira" },
      item: "Venda de produto",
      balance: expect.stringContaining("80,00"),
    });
    expect(plain(input?.gross ?? "")).toBe("R$ 200,00");
    expect(plain(input?.received ?? "")).toBe("R$ 120,00");
    expect(input?.taxId).toBeTruthy();
    expect(input?.payments.map((payment) => payment.method)).toEqual(["Pix", "Cartão de crédito (3x)"]);
    expect(input?.payments[0]?.date).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(input?.labels.footerNote).toBe("Este recibo não é um documento fiscal.");
    expect(input?.unit.name).toBeTruthy();
  });

  it("F16 → F09: amounts are in the unit's currency, methods come from the unit's country, and the receipt uses the organization's language", async () => {
    await db().organization.update({ where: { id: world.organizationId }, data: { defaultLocale: "en" } });
    const created = await createBilling().createManualCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.ptUnitId,
      description: "Registration fee",
      grossMinor: 5000,
    });
    if (!created.ok) throw new Error(created.error.code);
    const paid = await receive(world, created.value.id, [{ method: "MBWAY", amountMinor: 5000 }], {
      unitId: world.ptUnitId,
    });
    expect(paid.ok && paid.value.charge.status).toBe("PAID");
    const wrong = await receive(world, created.value.id, [{ method: "PIX", amountMinor: 100 }], {
      unitId: world.ptUnitId,
    });
    expect(!wrong.ok).toBe(true);

    const captured: Rendered[] = [];
    const result = await recordingBilling(captured).renderReceipt(world.desk, { chargeId: created.value.id });
    expect(result.ok).toBe(true);
    const input = captured[0];
    expect(plain(input?.gross ?? "")).toMatch(/€|EUR/);
    expect(input?.labels.title).toBe("Receipt");
    expect(input?.labels.footerNote).toBe("This receipt is not a fiscal document.");
    expect(input?.payments[0]?.method).toBe("MB WAY");
    expect(input?.unit.name).toBe("Unidade Lisboa");
  });

  it("F09: a receipt needs billing access and a charge of the organization", async () => {
    const charge = await manualCharge(world, 1000);
    await mustReceive(world, charge.id, 1000);
    const professional = await createBilling().renderReceipt(world.pro, { chargeId: charge.id });
    expect(!professional.ok && professional.error.code).toBe("AUTHZ_FORBIDDEN");
    const missing = await createBilling().renderReceipt(world.desk, { chargeId: crypto.randomUUID() });
    expect(!missing.ok && missing.error.code).toBe("BILLING_CHARGE_NOT_FOUND");
    const failing = await createBilling((base) => ({
      ...base,
      receipts: { render: async () => Promise.reject(new Error("engine down")) },
    })).renderReceipt(world.desk, { chargeId: charge.id });
    expect(!failing.ok && failing.error.code).toBe("BILLING_RECEIPT_FAILED");
  });
});
