import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("F01: next parameter only accepts same-origin relative paths", () => {
    expect(safeRedirectPath("/settings/users")).toBe("/settings/users");
    expect(safeRedirectPath("/settings/users?tab=1#x")).toBe("/settings/users?tab=1#x");
    expect(safeRedirectPath("//evil.com")).toBeNull();
    expect(safeRedirectPath("https://evil.com")).toBeNull();
    expect(safeRedirectPath("/\\evil.com")).toBeNull();
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
    expect(safeRedirectPath("settings")).toBeNull();
    expect(safeRedirectPath("/\tevil")).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
  });
});
