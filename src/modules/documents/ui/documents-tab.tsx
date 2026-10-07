"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { CategoryItem } from "../application/categories";
import type { DocumentItem, DocumentPage } from "../application/documents";
import type { IssueOptions } from "../application/generation";
import type { StorageUsage } from "../application/quota";
import type { DocumentActions } from "./document-actions";
import { ArchiveDocumentDialog, EditDocumentDialog } from "./document-dialogs";
import { DocumentsTable } from "./documents-table";
import { IssueDocumentDialog } from "./issue-document-dialog";
import { PreviewDialog } from "./preview-dialog";
import { UploadDialog } from "./upload-dialog";

// The "Documentos" tab of the patient page (PRD F08 Experience): filters, the table, and the
// actions to send files and to issue a document. The first page is rendered by the server; the
// filters and "Carregar mais" read through the Server Action.

const ALL = "all";
type KindFilter = typeof ALL | "UPLOADED" | "GENERATED";

type Props = {
  patientId: string;
  initialPage: DocumentPage;
  // The active categories, for the filter and the selectors.
  categories: CategoryItem[];
  usage: StorageUsage | null;
  timeZone: string;
  canUpload: boolean;
  actions: DocumentActions;
  // What the "Emitir documento" dialog offers (F08 Full Scope); null when the user may not issue.
  issue: IssueOptions | null;
};

export function DocumentsTab({
  patientId,
  initialPage,
  categories,
  usage,
  timeZone,
  canUpload,
  actions,
  issue,
}: Props) {
  const t = useTranslations("documents");
  const [items, setItems] = useState<DocumentItem[]>(initialPage.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor);
  const [categoryId, setCategoryId] = useState(ALL);
  const [kind, setKind] = useState<KindFilter>(ALL);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DocumentItem | null>(null);
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [archiving, setArchiving] = useState<DocumentItem | null>(null);

  const query = useCallback(
    (filters: { categoryId: string; kind: KindFilter; includeArchived: boolean }, cursor?: string) =>
      actions.list({
        patientId,
        ...(filters.categoryId !== ALL ? { categoryId: filters.categoryId } : {}),
        ...(filters.kind !== ALL ? { kind: filters.kind } : {}),
        includeArchived: filters.includeArchived,
        ...(cursor ? { cursor } : {}),
      }),
    [actions, patientId],
  );

  // Reads the first page again with the given filters (after a filter changed or a change was made).
  const reload = useCallback(
    async (filters = { categoryId, kind, includeArchived }) => {
      setLoading(true);
      try {
        const result = await query(filters);
        if (handleActionResult(result)) {
          setItems(result.data.items);
          setNextCursor(result.data.nextCursor);
        }
      } finally {
        setLoading(false);
      }
    },
    [categoryId, kind, includeArchived, query],
  );

  async function loadMore() {
    if (!nextCursor) return;
    setLoading(true);
    try {
      const result = await query({ categoryId, kind, includeArchived }, nextCursor);
      if (handleActionResult(result)) {
        setItems((current) => [...current, ...result.data.items]);
        setNextCursor(result.data.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }

  function changeFilters(next: Partial<{ categoryId: string; kind: KindFilter; includeArchived: boolean }>) {
    const filters = { categoryId, kind, includeArchived, ...next };
    setCategoryId(filters.categoryId);
    setKind(filters.kind);
    setIncludeArchived(filters.includeArchived);
    void reload(filters);
  }

  async function restore(item: DocumentItem) {
    const result = await actions.restore({ documentId: item.id, version: item.version });
    if (handleActionResult(result, { successMessage: t("ui.restoredToast") })) void reload();
  }

  const filtered = categoryId !== ALL || kind !== ALL || includeArchived;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="documents-category">{t("ui.filterCategory")}</Label>
            <Select value={categoryId} onValueChange={(value) => changeFilters({ categoryId: value })}>
              <SelectTrigger id="documents-category" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("ui.allCategories")}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="documents-kind">{t("ui.filterType")}</Label>
            <Select value={kind} onValueChange={(value) => changeFilters({ kind: value as KindFilter })}>
              <SelectTrigger id="documents-kind" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("ui.typeAll")}</SelectItem>
                <SelectItem value="UPLOADED">{t("ui.typeUploaded")}</SelectItem>
                <SelectItem value="GENERATED">{t("ui.typeGenerated")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="documents-archived"
              checked={includeArchived}
              onCheckedChange={(checked) => changeFilters({ includeArchived: checked === true })}
            />
            <Label htmlFor="documents-archived">{t("ui.showArchived")}</Label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {issue ? (
            <IssueDocumentDialog
              patientId={patientId}
              options={issue}
              actions={actions}
              onIssued={() => void reload()}
            />
          ) : null}
          {canUpload ? (
            <UploadDialog
              patientId={patientId}
              categories={categories}
              usage={usage}
              canReadClinical={initialPage.canReadClinical}
              actions={actions}
              onUploaded={() => void reload()}
            />
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground">{filtered ? t("ui.emptyFiltered") : t("ui.empty")}</p>
      ) : (
        <DocumentsTable
          items={items}
          timeZone={timeZone}
          onPreview={setPreview}
          onEdit={setEditing}
          onArchive={setArchiving}
          onRestore={(item) => void restore(item)}
        />
      )}
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {t("ui.loadMore")}
        </Button>
      ) : null}

      <PreviewDialog document={preview} timeZone={timeZone} onClose={() => setPreview(null)} />
      <EditDocumentDialog
        document={editing}
        categories={categories}
        actions={actions}
        onClose={() => setEditing(null)}
        onSaved={() => void reload()}
      />
      <ArchiveDocumentDialog
        document={archiving}
        actions={actions}
        onClose={() => setArchiving(null)}
        onDone={() => void reload()}
      />
    </div>
  );
}
