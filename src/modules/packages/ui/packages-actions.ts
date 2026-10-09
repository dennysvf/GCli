import type { ActionResult } from "@/shared/kernel/action-result";
import type { CancelResult } from "../application/lifecycle";
import type { EligiblePackage, PatientPackages, SellOptions } from "../application/queries";
import type { SaleResult } from "../application/sales";
import type { PackageView } from "../application/views";

// The Server Actions the package screens call. The route passes the real ones, so the module's UI
// never imports from `app/` (spec F10 section 4).
type Action<Input, Output> = (input: Input) => Promise<ActionResult<Output>>;

export type SaveTemplateInput = {
  templateId?: string;
  version?: number;
  name: string;
  serviceId: string;
  sessions: number;
  validityDays: number;
  prices: { currency: string; amountMinor: number }[];
  active: boolean;
};

export type PackagesActions = {
  sellOptions: Action<Record<string, never>, SellOptions>;
  sell: Action<
    {
      patientId: string;
      templateId: string;
      unitId: string;
      priceMinor: number;
      discountReason?: string;
      approval?: { approverUserId: string; pin: string };
      submitForApproval?: boolean;
    },
    SaleResult
  >;
  patientPackages: Action<{ patientId: string }, PatientPackages>;
  extend: Action<{ packageId: string; version?: number; days: number; reason: string }, PackageView>;
  cancel: Action<
    { packageId: string; version?: number; reason: string; confirmUnlink?: boolean },
    CancelResult
  >;
  eligible: Action<{ patientId: string; serviceId: string; date: string }, EligiblePackage[]>;
  coverage: Action<{ packageId: string; count: number }, { covered: number; rest: number }>;
  saveTemplate: Action<SaveTemplateInput, { templateId: string; version: number }>;
  setTemplateActive: Action<{ templateId: string; version: number; active: boolean }, { version: number }>;
  setNoShowDebit: Action<{ enabled: boolean }, { enabled: boolean }>;
};
