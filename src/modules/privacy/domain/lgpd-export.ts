import { EXPORT_AVAILABILITY_MS } from "./limits";

// An LGPD export (spec decisions D12–D15): PROCESSING → READY or FAILED, and READY → EXPIRED after
// 7 days or when the patient is anonymized. Only a READY export has a stored file.
export const EXPORT_STATUSES = ["PROCESSING", "READY", "FAILED", "EXPIRED"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const EXPORT_ERROR_CODES = [
  "FILE_MISSING",
  "STORAGE_ERROR",
  "RENDER_ERROR",
  "TIME_BUDGET_EXCEEDED",
] as const;
export type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[number];

export type LgpdExportProps = {
  id: string;
  organizationId: string;
  requestId: string;
  status: ExportStatus;
  locale: string;
  objectKey: string | null;
  sizeBytes: number | null;
  fileCount: number | null;
  errorCode: ExportErrorCode | null;
  requestedById: string;
  requestedAt: Date;
  readyAt: Date | null;
  expiresAt: Date | null;
  failedAt: Date | null;
  expiredAt: Date | null;
};

// PRD F14: available for download for 7 days after it is ready.
export function expiresAtFor(readyAt: Date): Date {
  return new Date(readyAt.getTime() + EXPORT_AVAILABILITY_MS);
}

export function isDownloadable(props: Pick<LgpdExportProps, "status" | "expiresAt">, now: Date): boolean {
  return props.status === "READY" && props.expiresAt !== null && now.getTime() < props.expiresAt.getTime();
}

// Expired in practice: ready but past its availability (the daily job may not have run yet).
export function isPastAvailability(props: Pick<LgpdExportProps, "status" | "expiresAt">, now: Date): boolean {
  return (
    props.status === "EXPIRED" ||
    (props.status === "READY" && props.expiresAt !== null && now.getTime() >= props.expiresAt.getTime())
  );
}

export class LgpdExport {
  private props: LgpdExportProps;

  private constructor(props: LgpdExportProps) {
    this.props = { ...props };
  }

  static rehydrate(props: LgpdExportProps): LgpdExport {
    return new LgpdExport(props);
  }

  static start(input: {
    id: string;
    organizationId: string;
    requestId: string;
    locale: string;
    requestedById: string;
    now: Date;
  }): LgpdExport {
    return new LgpdExport({
      id: input.id,
      organizationId: input.organizationId,
      requestId: input.requestId,
      status: "PROCESSING",
      locale: input.locale,
      objectKey: null,
      sizeBytes: null,
      fileCount: null,
      errorCode: null,
      requestedById: input.requestedById,
      requestedAt: input.now,
      readyAt: null,
      expiresAt: null,
      failedAt: null,
      expiredAt: null,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get snapshot(): Readonly<LgpdExportProps> {
    return { ...this.props };
  }

  isProcessing(): boolean {
    return this.props.status === "PROCESSING";
  }

  // Only once the whole ZIP is stored (the multipart upload completed).
  markReady(input: { objectKey: string; sizeBytes: number; fileCount: number; now: Date }): boolean {
    if (this.props.status !== "PROCESSING") return false;
    this.props.status = "READY";
    this.props.objectKey = input.objectKey;
    this.props.sizeBytes = input.sizeBytes;
    this.props.fileCount = input.fileCount;
    this.props.readyAt = input.now;
    this.props.expiresAt = expiresAtFor(input.now);
    return true;
  }

  markFailed(code: ExportErrorCode, now: Date): boolean {
    if (this.props.status !== "PROCESSING") return false;
    this.props.status = "FAILED";
    this.props.errorCode = code;
    this.props.failedAt = now;
    return true;
  }

  // Returns the key of the file to delete, or null when there is nothing to expire.
  expire(now: Date): string | null {
    if (this.props.status !== "READY" || !this.props.objectKey) return null;
    const key = this.props.objectKey;
    this.props.status = "EXPIRED";
    this.props.objectKey = null;
    this.props.expiredAt = now;
    return key;
  }
}
