import { describe, expect, it } from "vitest";
import { scopeArgs } from "./tenant";

const ORG = "01926f7a-0000-7000-8000-000000000001";

describe("scopeArgs", () => {
  it("adds organizationId to reads and writes of tenant models", () => {
    expect(scopeArgs("User", "findMany", { where: { status: "ACTIVE" } }, ORG)).toEqual({
      where: { status: "ACTIVE", organizationId: ORG },
    });
    expect(scopeArgs("Invitation", "updateMany", { where: {}, data: { status: "REVOKED" } }, ORG)).toEqual({
      where: { organizationId: ORG },
      data: { status: "REVOKED" },
    });
  });

  it("overrides an organizationId supplied by the caller", () => {
    expect(scopeArgs("User", "findFirst", { where: { organizationId: "other" } }, ORG)).toEqual({
      where: { organizationId: ORG },
    });
    expect(scopeArgs("User", "create", { data: { name: "Ana", organizationId: "other" } }, ORG)).toEqual({
      data: { name: "Ana", organizationId: ORG },
    });
  });

  it("injects organizationId into createMany rows and upsert create", () => {
    expect(scopeArgs("Invitation", "createMany", { data: [{ email: "a" }, { email: "b" }] }, ORG)).toEqual({
      data: [
        { email: "a", organizationId: ORG },
        { email: "b", organizationId: ORG },
      ],
    });
    const upsert = scopeArgs(
      "User",
      "upsert",
      { where: { id: "u" }, create: { name: "A" }, update: {} },
      ORG,
    );
    expect(upsert).toMatchObject({
      where: { id: "u", organizationId: ORG },
      create: { organizationId: ORG },
    });
  });

  it("scopes the organization model by its own id", () => {
    expect(scopeArgs("Organization", "findFirst", {}, ORG)).toEqual({ where: { id: ORG } });
  });

  it("leaves non-tenant models untouched", () => {
    const args = { where: { key: "x" } };
    expect(scopeArgs("RateLimitBucket", "findUnique", args, ORG)).toBe(args);
  });
});
