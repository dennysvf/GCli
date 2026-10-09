import type { ActionResult } from "@/shared/kernel/action-result";
import type { UploadIntent } from "../application/attachments";
import type { CategoryRecord } from "../application/ports";
import type { CreatedEntry, EntryList } from "../application/entries";
import type { CloseResult, MovementResult, OpenResult } from "../application/registers";
import type { StatementView } from "../application/statement";
import type { RegisterDay, RegisterView } from "../application/views";

// The Server Actions the cash and finance screens call. The routes pass the real ones, so the
// module's UI never imports from `app/` (spec F11 section 4).
type Action<Input, Output> = (input: Input) => Promise<ActionResult<Output>>;

export type EntryFields = {
  description: string;
  categoryId: string;
  unitId: string | null;
  currency: string;
  amountMinor: number;
  dueDate: string;
  attachmentId: string | null;
};

export type CashActions = {
  registerDay: Action<{ unitId: string; businessDate: string }, RegisterDay>;
  open: Action<
    { unitId: string; businessDate: string; openingMinor: number; openingReason: string | null },
    OpenResult
  >;
  recordMovement: Action<
    {
      registerId: string;
      direction: "IN" | "OUT";
      amountMinor: number;
      description: string;
      categoryId: string;
      attachmentId: string | null;
    },
    MovementResult
  >;
  reverseMovement: Action<{ movementId: string; reason: string }, { reversed: true }>;
  close: Action<{ registerId: string; countedMinor: number; justification: string | null }, CloseResult>;
  reopen: Action<{ registerId: string; reason: string }, { register: RegisterView }>;
  categories: Action<Record<string, never>, CategoryRecord[]>;
  uploadIntent: Action<{ fileName: string; contentType: string; sizeBytes: number }, UploadIntent>;
  downloadUrl: Action<{ attachmentId: string }, { url: string }>;
};

export type FinanceActions = {
  createEntry: Action<
    EntryFields & {
      kind: "EXPENSE" | "REVENUE";
      repeatMonthly: boolean;
      paid: { paidOn: string; method: string } | null;
    },
    CreatedEntry
  >;
  updateEntry: Action<
    EntryFields & { entryId: string; version?: number; scope: "ONE" | "FOLLOWING" },
    { updated: number }
  >;
  deleteEntry: Action<{ entryId: string; scope: "ONE" | "FOLLOWING" }, { removed: number }>;
  payEntry: Action<{ entryId: string; paidOn: string; method: string }, { paid: true }>;
  reverseEntryPayment: Action<{ entryId: string; reason: string }, { reversed: true }>;
  endSeries: Action<{ seriesId: string }, { removed: number }>;
  listEntries: Action<
    {
      kind: "EXPENSE" | "REVENUE";
      from: string | null;
      to: string | null;
      categoryId: string | null;
      unit: string;
      status: "PENDING" | "PAID" | "OVERDUE" | null;
    },
    EntryList
  >;
  statement: Action<{ unit: string; from: string; to: string; currency: string | null }, StatementView>;
  categories: Action<Record<string, never>, CategoryRecord[]>;
  saveCategory: Action<{ categoryId?: string; kind: "EXPENSE" | "REVENUE"; name: string }, CategoryRecord>;
  setCategoryActive: Action<{ categoryId: string; active: boolean }, { active: boolean }>;
  uploadIntent: CashActions["uploadIntent"];
  downloadUrl: CashActions["downloadUrl"];
};
