import { describe, expect, it } from "vitest";
import { csvAmount, csvSeparator, toCsv } from "./csv";

describe("CSV output", () => {
  it("F16: CSV separators follow the language", () => {
    expect(csvSeparator("pt-BR")).toBe(";");
    expect(csvSeparator("es")).toBe(";");
    expect(csvSeparator("en")).toBe(",");
  });

  it("F16: amounts use the decimal separator of the language, with the currency in its own column", () => {
    expect(csvAmount(123456, "BRL", "pt-BR")).toBe("1234,56");
    expect(csvAmount(123456, "USD", "en")).toBe("1234.56");
    expect(csvAmount(5, "EUR", "es")).toBe("0,05");
    expect(csvAmount(1235, "CLP", "es")).toBe("1235");
    expect(csvAmount(-250, "BRL", "pt-BR")).toBe("-2,50");

    const rows = [
      ["Consulta", csvAmount(25000, "BRL", "pt-BR"), "BRL"],
      ["Consulta", csvAmount(6000, "EUR", "pt-BR"), "EUR"],
    ];
    expect(toCsv(["Serviço", "Valor", "Moeda"], rows, "pt-BR")).toBe(
      "﻿Serviço;Valor;Moeda\r\nConsulta;250,00;BRL\r\nConsulta;60,00;EUR\r\n",
    );
    expect(
      toCsv(["Service", "Amount", "Currency"], [["Visit", csvAmount(6000, "USD", "en"), "USD"]], "en"),
    ).toBe("﻿Service,Amount,Currency\r\nVisit,60.00,USD\r\n");
  });

  it("quotes cells with separators, quotes and line breaks, and defuses formulas", () => {
    expect(
      toCsv(["a"], [["x;y"], ['say "hi"'], ["two\nlines"], ["=SUM(A1)"], [null], ["-5,00"]], "pt-BR"),
    ).toBe('﻿a\r\n"x;y"\r\n"say ""hi"""\r\n"two\nlines"\r\n\'=SUM(A1)\r\n\r\n-5,00\r\n');
  });
});
