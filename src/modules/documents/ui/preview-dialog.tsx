"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { DocumentItem } from "../application/documents";

// The preview modal (PRD F08 Experience): an image or a frame with the PDF, the title and the
// metadata in `meta`, and "Baixar" as the only action. Both go through the route that audits the
// reading and redirects to a 5-minute signed URL (ADR-033: frame-src allows the storage origin).
export function PreviewDialog({
  document,
  timeZone,
  onClose,
}: {
  document: DocumentItem | null;
  timeZone: string;
  onClose: () => void;
}) {
  const t = useTranslations("documents");
  const format = useFormatters();
  const href = document ? `/api/documents/${document.id}` : "";
  const isImage = document?.contentType === "image/jpeg" || document?.contentType === "image/png";

  return (
    <Dialog open={document !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-4xl">
        {document ? (
          <>
            <DialogHeader>
              <DialogTitle>{document.title}</DialogTitle>
              <DialogDescription>
                {t("ui.previewMeta", {
                  category: document.categoryName,
                  date: format.date(document.createdAt, timeZone),
                  author: document.authorName,
                })}
              </DialogDescription>
            </DialogHeader>
            {document.previewable ? (
              isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- a redirect to a short-lived signed URL.
                <img
                  src={`${href}?disposition=inline`}
                  alt={document.title}
                  className="mx-auto max-h-[70vh] max-w-full rounded-xs border object-contain"
                />
              ) : (
                <iframe
                  src={`${href}?disposition=inline`}
                  title={document.title}
                  className="h-[70vh] w-full rounded-xs border"
                />
              )
            ) : (
              <p className="text-muted-foreground text-sm">{t("ui.noPreview")}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("ui.close")}
              </Button>
              <Button asChild variant="outline">
                <a href={`${href}?disposition=attachment`}>{t("ui.download")}</a>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
