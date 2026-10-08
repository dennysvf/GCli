import { sanitizeRichText } from "@/shared/rich-text/sanitizer";
import type { HtmlSanitizer } from "../application/ports";

// The editor's allowlist (ADR-032) lives in the shared sanitizer, also used by F08 templates.
export const sanitizeHtmlAdapter: HtmlSanitizer = { sanitize: sanitizeRichText };
