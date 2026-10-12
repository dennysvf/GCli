import { describe, expect, it } from "vitest";
import { createTranslator } from "@/shared/i18n/translator";
import { toCsv } from "@/shared/i18n/csv";
import { csvHeader, csvRow, displayCell } from "./format";
import type { ColumnDef, RawRow } from "./types";

const COLUMNS: ColumnDef[] = [
  { key: "date", kind: "date", align: "left" },
  { key: "patient", kind: "text", align: "left" },
  { key: "hoursAttended", kind: "hours", align: "right" },
  { key: "amount", kind: "money", align: "right" },
];
const ROW: RawRow = {
  date: "2026-09-03",
  patient: "Ana Souza",
  hoursAttended: 12.5,
  amount: { amountMinor: 123456n, currency: "BRL" },
};

describe("report cell formatting", () => {
  it("F13: CSV cells use a decimal comma in pt-BR and es and a decimal point in en", () => {
    const pt = csvRow(COLUMNS, ROW, createTranslator("pt-BR"), "pt-BR");
    const en = csvRow(COLUMNS, ROW, createTranslator("en"), "en");
    expect(pt).toEqual(["03/09/2026", "Ana Souza", "12,5", "1234,56", "BRL"]);
    expect(en).toEqual(["09/03/2026", "Ana Souza", "12.5", "1234.56", "BRL"]);
    const es = csvRow(COLUMNS, ROW, createTranslator("es"), "es");
    expect(es[3]).toBe("1234,56");
  });

  it("F13: CSV dates follow the user's language", () => {
    expect(csvRow(COLUMNS, ROW, createTranslator("pt-BR"), "pt-BR")[0]).toBe("03/09/2026");
    expect(csvRow(COLUMNS, ROW, createTranslator("en"), "en")[0]).toBe("09/03/2026");
  });

  it("F13: CLP amounts have no decimals in CSV", () => {
    const row: RawRow = { ...ROW, amount: { amountMinor: 15000n, currency: "CLP" } };
    expect(csvRow(COLUMNS, row, createTranslator("es"), "es")[3]).toBe("15000");
  });

  it("F13: the CSV has a currency column after the money columns and the separators of the language", () => {
    const t = createTranslator("pt-BR");
    const csv = toCsv(csvHeader(COLUMNS, t, "METHOD"), [csvRow(COLUMNS, ROW, t, "pt-BR")], "pt-BR");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[1]).toBe("03/09/2026;Ana Souza;12,5;1234,56;BRL");
  });

  it("F13: money on screen follows the language and the currency", () => {
    const t = createTranslator("pt-BR");
    expect(displayCell(COLUMNS[3]!, ROW.amount, t, "pt-BR")).toBe("R$ 1.234,56");
  });
});
