import type { ActionResult } from "@/shared/kernel/action-result";
import type { TemplateType } from "../application/schemas";

// The Server Actions of the Documents settings page (spec F08 section 5).
export type SettingsActions = {
  createCategory: (input: {
    name: string;
    clinical: boolean;
  }) => Promise<ActionResult<{ categoryId: string }>>;
  updateCategory: (input: {
    categoryId: string;
    name: string;
    clinical: boolean;
    version: number;
  }) => Promise<ActionResult<{ version: number; documentsMadeClinical: number }>>;
  setCategoryActive: (input: {
    categoryId: string;
    active: boolean;
    version: number;
  }) => Promise<ActionResult<{ version: number }>>;
  createTemplate: (input: {
    name: string;
    type: TemplateType;
    clinical: boolean;
    bodyHtml: string;
  }) => Promise<ActionResult<{ templateId: string }>>;
  updateTemplate: (input: {
    templateId: string;
    name: string;
    type: TemplateType;
    clinical: boolean;
    bodyHtml: string;
    version: number;
  }) => Promise<ActionResult<{ version: number }>>;
  setTemplateActive: (input: {
    templateId: string;
    active: boolean;
    version: number;
  }) => Promise<ActionResult<{ version: number }>>;
};
