import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "@/shared/i18n/locales";
import { sanitizeRichText } from "@/shared/rich-text/sanitizer";
import { analyzeTemplate } from "../domain/template-variables";
import { DEFAULT_TEMPLATES, DEFAULT_TEMPLATE_BODIES } from "./default-templates";

describe("default templates", () => {
  it("F08: default templates use only known variables in every locale and survive the sanitizer", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const template of DEFAULT_TEMPLATES) {
        const body = DEFAULT_TEMPLATE_BODIES[locale][template.key];
        expect(analyzeTemplate(body).ok, `${locale} ${template.key}`).toBe(true);
        // What is stored is what the sanitizer keeps: the bodies need no cleaning.
        expect(sanitizeRichText(body).html).toBe(body);
      }
    }
  });

  it("F08: the clinical ones are the certificate and the prescription", () => {
    expect(DEFAULT_TEMPLATES.filter((template) => template.clinical).map((template) => template.key)).toEqual(
      ["CERTIFICATE", "PRESCRIPTION"],
    );
  });

  it("F08: every default template has its free fields declared in order", () => {
    const certificate = analyzeTemplate(DEFAULT_TEMPLATE_BODIES["pt-BR"].CERTIFICATE);
    const declaration = analyzeTemplate(DEFAULT_TEMPLATE_BODIES["pt-BR"].ATTENDANCE_DECLARATION);
    expect(certificate.ok && certificate.fields).toEqual(["dias_afastamento"]);
    expect(declaration.ok && declaration.fields).toEqual(["hora_inicio", "hora_fim"]);
  });
});
