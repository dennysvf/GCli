import { describe, expect, it } from "vitest";
import { SERVICE_COLORS, nextDefaultColor } from "./palette";

describe("palette", () => {
  it("F03: new services get the first unused palette color", () => {
    expect(SERVICE_COLORS).toHaveLength(16);
    expect(nextDefaultColor([])).toBe("slate");
    expect(nextDefaultColor(["slate", "red"])).toBe("orange");
    expect(nextDefaultColor(SERVICE_COLORS)).toBe("blue");
  });
});
