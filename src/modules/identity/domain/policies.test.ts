import { describe, expect, it } from "vitest";
import { isValidCnpj, normalizeCnpj } from "./cnpj";
import { checkPassword, isLocked, sessionState, shouldTouchSession } from "./policies";

const T0 = new Date("2026-09-29T12:00:00.000Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("password policy", () => {
  it("F01: password shorter than 10 characters is rejected", () => {
    expect(checkPassword("abcdefgh1")).toBe("too_short");
    expect(checkPassword("abcdefghi1")).toBeNull();
  });

  it("F01: password without a letter or without a digit is rejected", () => {
    expect(checkPassword("1234567890")).toBe("missing_letter");
    expect(checkPassword("abcdefghij")).toBe("missing_digit");
    expect(checkPassword("ção1234567")).toBeNull();
  });

  it("F01: password longer than 128 characters is rejected", () => {
    expect(checkPassword(`a1${"x".repeat(127)}`)).toBe("too_long");
    expect(checkPassword(`a1${"x".repeat(126)}`)).toBeNull();
  });
});

describe("lockout", () => {
  it("F01: lock expires after 15 minutes", () => {
    const lockedUntil = minutes(15);
    expect(isLocked(lockedUntil, minutes(14))).toBe(true);
    expect(isLocked(lockedUntil, new Date(lockedUntil.getTime() + 1))).toBe(false);
    expect(isLocked(null, T0)).toBe(false);
  });
});

describe("session expiry", () => {
  it("F01: session is invalid after 60 idle minutes or 12 absolute hours", () => {
    expect(sessionState({ createdAt: T0, lastActiveAt: T0 }, minutes(59))).toBe("active");
    expect(sessionState({ createdAt: T0, lastActiveAt: T0 }, minutes(60))).toBe("idle_expired");
    expect(sessionState({ createdAt: T0, lastActiveAt: minutes(11 * 60 + 30) }, minutes(12 * 60))).toBe(
      "absolute_expired",
    );
  });

  it("touches the session at most once per minute", () => {
    expect(shouldTouchSession(T0, new Date(T0.getTime() + 59_000))).toBe(false);
    expect(shouldTouchSession(T0, minutes(1))).toBe(true);
  });
});

describe("CNPJ", () => {
  it("F01: numeric CNPJ with valid check digits is accepted", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("F01: alphanumeric CNPJ with valid check digits is accepted", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12ABD34501DE35")).toBe(false);
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });
});
