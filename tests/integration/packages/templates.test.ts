import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { packages } from "@/modules/packages";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import { billingWorld, templateFor, type BillingWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const base = (overrides: Record<string, unknown> = {}) => ({
  name: "Pacote",
  serviceId: world.services.consulta,
  sessions: 10,
  validityDays: 180,
  prices: [{ currency: "BRL", amountMinor: 150_000 }],
  ...overrides,
});

describe("package templates", () => {
  it("F10: a package template requires 2–100 sessions, a price of 0.01–99,999.99 and a validity of 30–730 days", async () => {
    for (const sessions of [2, 100]) {
      expect((await packages.saveTemplate(world.manager, base({ name: `S${sessions}`, sessions }))).ok).toBe(
        true,
      );
    }
    for (const sessions of [1, 101]) {
      const result = await packages.saveTemplate(world.manager, base({ name: `X${sessions}`, sessions }));
      expect(!result.ok && result.error.fields?.sessions).toBe("packages.validation.sessionsRange");
    }
    for (const validityDays of [30, 730]) {
      expect(
        (await packages.saveTemplate(world.manager, base({ name: `V${validityDays}`, validityDays }))).ok,
      ).toBe(true);
    }
    for (const validityDays of [29, 731]) {
      const result = await packages.saveTemplate(
        world.manager,
        base({ name: `Y${validityDays}`, validityDays }),
      );
      expect(!result.ok && result.error.fields?.validityDays).toBe("packages.validation.validityRange");
    }
    for (const amountMinor of [1, 9_999_999]) {
      const result = await packages.saveTemplate(
        world.manager,
        base({ name: `P${amountMinor}`, prices: [{ currency: "BRL", amountMinor }] }),
      );
      expect(result.ok).toBe(true);
    }
    for (const amountMinor of [0, 10_000_000]) {
      const result = await packages.saveTemplate(
        world.manager,
        base({ name: `Z${amountMinor}`, prices: [{ currency: "BRL", amountMinor }] }),
      );
      expect(!result.ok && result.error.fields?.["prices.0.amountMinor"]).toBe(
        "packages.validation.priceRange",
      );
    }
  });

  it("F10: names are unique ignoring case, prices follow the currencies of the active units and one can edit", async () => {
    const id = await templateFor(world, { name: "Combo Fisio" });
    const clash = await packages.saveTemplate(world.manager, base({ name: "combo fisio" }));
    expect(!clash.ok && clash.error.code).toBe("PACKAGE_TEMPLATE_NAME_TAKEN");
    const foreign = await packages.saveTemplate(
      world.manager,
      base({ name: "Em dólar", prices: [{ currency: "USD", amountMinor: 1000 }] }),
    );
    expect(!foreign.ok && foreign.error.code).toBe("PACKAGE_TEMPLATE_INVALID");

    const edited = await packages.saveTemplate(
      world.manager,
      base({
        templateId: id,
        version: 1,
        name: "Combo Fisio",
        prices: [
          { currency: "BRL", amountMinor: 140_000 },
          { currency: "EUR", amountMinor: 25_000 },
        ],
      }),
    );
    expect(edited.ok && edited.value.version).toBe(2);
    const listed = await packages.listTemplates(world.desk);
    expect(listed.ok && listed.value[0]).toMatchObject({
      sessions: 10,
      prices: [
        { currency: "BRL", amountMinor: 140_000 },
        { currency: "EUR", amountMinor: 25_000 },
      ],
      serviceName: "Consulta",
    });
    const stale = await packages.setTemplateActive(world.manager, {
      templateId: id,
      version: 1,
      active: false,
    });
    expect(!stale.ok && stale.error.code).toBe("PACKAGE_STALE");
    expect(
      (await packages.setTemplateActive(world.manager, { templateId: id, version: 2, active: false })).ok,
    ).toBe(true);
    const active = await packages.listTemplates(world.desk);
    expect(active.ok && active.value).toEqual([]);
  });

  it("F03 → F10: only active services appear in package templates", async () => {
    await db().service.update({ where: { id: world.services.retorno }, data: { active: false } });
    const refused = await packages.saveTemplate(world.manager, base({ serviceId: world.services.retorno }));
    expect(!refused.ok && refused.error.code).toBe("PACKAGE_SERVICE_INVALID");
    expect((await packages.saveTemplate(world.manager, base())).ok).toBe(true);
  });

  it("F10: templates and the no-show setting need setup permission", async () => {
    const desk = await packages.saveTemplate(world.desk, base());
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
    expect(
      (await packages.getNoShowDebit(world.desk)).ok && (await packages.getNoShowDebit(world.desk)),
    ).toMatchObject({
      value: false,
    });
    expect((await packages.setNoShowDebit(world.manager, { enabled: true })).ok).toBe(true);
    const read = await packages.getNoShowDebit(world.manager);
    expect(read.ok && read.value).toBe(true);
    const forbidden = await packages.setNoShowDebit(world.desk, { enabled: false });
    expect(!forbidden.ok && forbidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const professional = await packages.listTemplates(world.pro);
    expect(!professional.ok && professional.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});
