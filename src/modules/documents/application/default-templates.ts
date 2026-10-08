import type { Locale } from "@/shared/i18n/locales";

// The three templates every organization starts with (PRD F08 Capabilities): Atestado, Declaração de
// comparecimento and Receituário simples. The bodies are constants per language, not catalog
// messages: ICU would read `{{...}}` as arguments (ADR-033). They are written in the PRD's tone and
// are clinic data from the moment they are created. Legal wording outside Brazil is not validated
// (PRD Section 7).
export const DEFAULT_TEMPLATES = [
  { key: "CERTIFICATE", type: "CERTIFICATE", clinical: true },
  { key: "ATTENDANCE_DECLARATION", type: "ATTENDANCE_DECLARATION", clinical: false },
  { key: "PRESCRIPTION", type: "PRESCRIPTION", clinical: true },
] as const;

export type DefaultTemplateKey = (typeof DEFAULT_TEMPLATES)[number]["key"];

export const DEFAULT_TEMPLATE_BODIES: Record<Locale, Record<DefaultTemplateKey, string>> = {
  "pt-BR": {
    CERTIFICATE:
      "<p>Atesto, para os devidos fins, que <strong>{{paciente.nome}}</strong> (CPF {{paciente.cpf}}) esteve sob meus cuidados em {{data_hoje}} e necessita de {{campo:dias_afastamento}} dia(s) de afastamento de suas atividades.</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
    ATTENDANCE_DECLARATION:
      "<p>Declaro, para os devidos fins, que <strong>{{paciente.nome}}</strong> compareceu a {{unidade.nome}} em {{data_hoje}}, no período das {{campo:hora_inicio}} às {{campo:hora_fim}}.</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
    PRESCRIPTION:
      "<p>Paciente: <strong>{{paciente.nome}}</strong></p><p>{{campo:prescricao}}</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
  },
  en: {
    CERTIFICATE:
      "<p>I certify, for all due purposes, that <strong>{{paciente.nome}}</strong> (ID {{paciente.cpf}}) was under my care on {{data_hoje}} and needs {{campo:dias_afastamento}} day(s) away from their activities.</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
    ATTENDANCE_DECLARATION:
      "<p>I declare, for all due purposes, that <strong>{{paciente.nome}}</strong> attended {{unidade.nome}} on {{data_hoje}}, from {{campo:hora_inicio}} to {{campo:hora_fim}}.</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
    PRESCRIPTION:
      "<p>Patient: <strong>{{paciente.nome}}</strong></p><p>{{campo:prescricao}}</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
  },
  es: {
    CERTIFICATE:
      "<p>Certifico, para los fines que correspondan, que <strong>{{paciente.nome}}</strong> (documento {{paciente.cpf}}) estuvo bajo mi cuidado el {{data_hoje}} y necesita {{campo:dias_afastamento}} día(s) de reposo de sus actividades.</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
    ATTENDANCE_DECLARATION:
      "<p>Declaro, para los fines que correspondan, que <strong>{{paciente.nome}}</strong> asistió a {{unidade.nome}} el {{data_hoje}}, de {{campo:hora_inicio}} a {{campo:hora_fim}}.</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
    PRESCRIPTION:
      "<p>Paciente: <strong>{{paciente.nome}}</strong></p><p>{{campo:prescricao}}</p><p>{{unidade.nome}}, {{data_extenso}}.</p>",
  },
};
