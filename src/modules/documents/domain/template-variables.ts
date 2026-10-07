import { FIELD_NAME_PATTERN } from "./limits";

// Variables of document templates (PRD F08 Capabilities). A variable is a plain-text token in the
// template body, `{{paciente.nome}}`, or a free field filled when the document is generated,
// `{{campo:dias_afastamento}}` (ADR-033). Everything here is pure: the values come from the
// application layer.

export const VARIABLE_GROUPS = [
  { group: "patient", names: ["paciente.nome", "paciente.cpf", "paciente.data_nascimento"] },
  {
    group: "professional",
    names: ["profissional.nome", "profissional.registro", "profissional.especialidade"],
  },
  { group: "unit", names: ["unidade.nome", "unidade.endereco"] },
  { group: "clinic", names: ["clinica.nome", "clinica.cnpj"] },
  { group: "date", names: ["data_hoje", "data_extenso"] },
] as const;

export type VariableGroup = (typeof VARIABLE_GROUPS)[number]["group"];
export type VariableName = (typeof VARIABLE_GROUPS)[number]["names"][number];

export const KNOWN_VARIABLES: readonly string[] = VARIABLE_GROUPS.flatMap((group) => group.names);

export const FIELD_PREFIX = "campo:";

// What a missing value prints on the page, so the paper copy keeps room to write it by hand.
export const BLANK_LINE = "________";

const TOKEN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

export type TokenProblem =
  { code: "UNKNOWN_VARIABLE"; variable: string } | { code: "INVALID_FIELD"; field: string };

export type TemplateAnalysis =
  { ok: true; variables: string[]; fields: string[] } | { ok: false; problem: TokenProblem };

export function isFieldToken(token: string): boolean {
  return token.startsWith(FIELD_PREFIX);
}

export function fieldNameOf(token: string): string {
  return token.slice(FIELD_PREFIX.length);
}

// Checks every token of a body: variables must exist and free field names must be valid. Free
// fields are listed in the order of their first use, which is the order of the generation form.
export function analyzeTemplate(html: string): TemplateAnalysis {
  const variables: string[] = [];
  const fields: string[] = [];
  for (const match of html.matchAll(TOKEN)) {
    const token = match[1] ?? "";
    if (isFieldToken(token)) {
      const name = fieldNameOf(token);
      if (!FIELD_NAME_PATTERN.test(name))
        return { ok: false, problem: { code: "INVALID_FIELD", field: name } };
      if (!fields.includes(name)) fields.push(name);
    } else if (KNOWN_VARIABLES.includes(token)) {
      if (!variables.includes(token)) variables.push(token);
    } else {
      return { ok: false, problem: { code: "UNKNOWN_VARIABLE", variable: token } };
    }
  }
  return { ok: true, variables, fields };
}

// "dias_afastamento" → "Dias afastamento": the label of a free field in the generation form.
export function fieldLabel(name: string): string {
  const spaced = name.replaceAll("_", " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type MissingValue = { variable: string };

export type SubstitutionInput = {
  // Value of each variable of the registry; null or empty means the data is not registered.
  values: Readonly<Record<string, string | null | undefined>>;
  // Free field values typed by the user, by field name.
  fields: Readonly<Record<string, string | undefined>>;
  // "preview" highlights what is missing; "pdf" prints a blank line instead.
  mode: "preview" | "pdf";
  // Text shown inside the highlight, already in the user's language.
  label: (variable: string) => string;
};

// Replaces every token with its escaped value, and lists what is missing without repeating it.
// The result is HTML built from a sanitized body and escaped values, so it is safe to render; the
// only markup it adds is the highlight of a missing value.
export function substituteTemplate(
  html: string,
  input: SubstitutionInput,
): { html: string; missing: MissingValue[] } {
  const missing: MissingValue[] = [];
  const result = html.replace(TOKEN, (_whole, rawToken: string) => {
    const token = rawToken;
    const value = isFieldToken(token)
      ? input.fields[fieldNameOf(token)]?.trim()
      : input.values[token]?.trim();
    if (value) return escapeHtml(value);
    if (!missing.some((item) => item.variable === token)) missing.push({ variable: token });
    return input.mode === "pdf"
      ? BLANK_LINE
      : `<mark data-missing="${escapeHtml(token)}">${escapeHtml(input.label(token))}</mark>`;
  });
  return { html: result, missing };
}
