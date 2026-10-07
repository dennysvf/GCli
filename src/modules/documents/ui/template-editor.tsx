"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/components/dropdown-menu";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { RichTextEditor } from "@/shared/ui/rich-text/rich-text-editor";
import type { TemplateType } from "../application/schemas";
import { TEMPLATE_TYPES } from "../application/schemas";
import type { TemplateDetails } from "../application/templates";
import { FIELD_NAME_PATTERN, TEMPLATE_MAX_CHARACTERS, TEMPLATE_NAME_MAX } from "../domain/limits";
import { FIELD_PREFIX, VARIABLE_GROUPS, VARIABLE_KEYS } from "../domain/template-variables";
import type { SettingsActions } from "./settings-actions";
import { TemplateTokenHighlight } from "./template-token-extension";

// The template form (PRD F08 Capabilities): name, type, clinical flag, and a rich text body with
// the variables inserted from a menu and free fields named by the writer. The server checks every
// token again, so a typed variable that does not exist is refused with its name.
const BACK = "/settings/documents";

export function TemplateEditor({
  template,
  actions,
}: {
  template: TemplateDetails | null;
  actions: Pick<SettingsActions, "createTemplate" | "updateTemplate">;
}) {
  const t = useTranslations("documents");
  const router = useRouter();
  const editorRef = useRef<Editor | null>(null);
  const [name, setName] = useState(template?.name ?? "");
  const [type, setType] = useState<TemplateType>(template?.type ?? "OTHER");
  const [clinical, setClinical] = useState(template?.clinical ?? false);
  const [html, setHtml] = useState(template?.bodyHtml ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fieldDialog, setFieldDialog] = useState(false);
  const [fieldName, setFieldName] = useState("");

  const insert = (text: string) => editorRef.current?.chain().focus().insertContent(text).run();
  const fieldValid = FIELD_NAME_PATTERN.test(fieldName);

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const body = { name, type, clinical, bodyHtml: html };
      const result: ActionResult<unknown> = template
        ? await actions.updateTemplate({ ...body, templateId: template.id, version: template.version })
        : await actions.createTemplate(body);
      if (!result.ok && result.error.fields) {
        setErrors(result.error.fields);
        return;
      }
      if (handleActionResult(result, { successMessage: t("ui.templateSavedToast") })) {
        router.push(BACK);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid max-w-2xl gap-4">
        <Field id="template-name" label={t("ui.templateName")} error={errors.name}>
          <Input
            id="template-name"
            maxLength={TEMPLATE_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="grid gap-1">
          <Label htmlFor="template-type">{t("ui.columns.type")}</Label>
          <Select value={type} onValueChange={(value) => setType(value as TemplateType)}>
            <SelectTrigger id="template-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`types.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="template-clinical"
              checked={clinical}
              onCheckedChange={(checked) => setClinical(checked === true)}
            />
            <Label htmlFor="template-clinical">{t("ui.templateIsClinical")}</Label>
          </div>
          <p className="text-muted-foreground text-xs">{t("ui.templateClinicalHint")}</p>
        </div>
      </div>

      <div className="grid max-w-3xl gap-2">
        <Label htmlFor="template-body">{t("ui.templateBody")}</Label>
        <RichTextEditor
          key={template?.id ?? "new"}
          initialHtml={html}
          label={t("ui.templateBody")}
          maxCharacters={TEMPLATE_MAX_CHARACTERS}
          onChange={(nextHtml) => setHtml(nextHtml)}
          extensions={[TemplateTokenHighlight]}
          onReady={(editor) => {
            editorRef.current = editor;
          }}
          toolbarExtra={() => (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    {t("ui.insertVariable")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                  {VARIABLE_GROUPS.map((group) => (
                    <DropdownMenuGroup key={group.group}>
                      <DropdownMenuLabel>{t(`variables.groups.${group.group}`)}</DropdownMenuLabel>
                      {group.names.map((variable) => (
                        <DropdownMenuItem key={variable} onSelect={() => insert(`{{${variable}}}`)}>
                          {t(`variables.${VARIABLE_KEYS[variable]}`)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setFieldDialog(true)}
              >
                {t("ui.freeField")}
              </Button>
            </>
          )}
        />
        {errors.bodyHtml ? <Alert variant="destructive">{errors.bodyHtml}</Alert> : null}
        <p className="text-muted-foreground text-xs">{t("ui.templateBodyHint")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>
          {t("ui.saveTemplate")}
        </Button>
        <Button asChild variant="ghost">
          <Link href={BACK}>{t("ui.cancel")}</Link>
        </Button>
      </div>

      <Dialog open={fieldDialog} onOpenChange={setFieldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ui.freeField")}</DialogTitle>
            <DialogDescription>{t("ui.freeFieldHint")}</DialogDescription>
          </DialogHeader>
          <Field
            id="free-field-name"
            label={t("ui.freeFieldName")}
            error={fieldName && !fieldValid ? t("ui.freeFieldInvalid") : undefined}
          >
            <Input
              id="free-field-name"
              maxLength={40}
              value={fieldName}
              onChange={(event) => setFieldName(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFieldDialog(false)}>
              {t("ui.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!fieldValid}
              onClick={() => {
                insert(`{{${FIELD_PREFIX}${fieldName}}}`);
                setFieldName("");
                setFieldDialog(false);
              }}
            >
              {t("ui.insert")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
