import type { ActionResult } from "@/shared/kernel/action-result";
import type { DiscountOutcome, PendingApproval } from "../application/discounts";
import type { PaymentMethodSetting } from "../application/payment-methods";
import type { ReceiveResult } from "../application/payments";
import type { ChargeDetail, ChargeList, PatientCharges, ReceiveOptions } from "../application/queries";
import type { ChargeView } from "../application/views";

// The Server Actions the billing screens call. The route passes the real ones, so the module's UI
// never imports from `app/` (spec F09 section 4).
type Action<Input, Output> = (input: Input) => Promise<ActionResult<Output>>;

export type ReceiveInput = {
  chargeId: string;
  version?: number;
  submissionKey: string;
  unitId: string;
  discount?: { kind: "PERCENT" | "AMOUNT"; value: number } | null;
  discountReason?: string;
  approval?: { approverUserId: string; pin: string };
  receivedAt?: string;
  payments: { method: string; amountMinor: number; installments?: number }[];
};

export type BillingActions = {
  appointmentCharge: Action<{ appointmentId: string }, ChargeView | null>;
  receiveOptions: Action<{ chargeId: string }, ReceiveOptions>;
  receive: Action<ReceiveInput, ReceiveResult>;
  setDiscount: Action<
    {
      chargeId: string;
      version: number;
      discount: { kind: "PERCENT" | "AMOUNT"; value: number } | null;
      reason?: string;
      approval?: { approverUserId: string; pin: string };
      submitForApproval?: boolean;
    },
    DiscountOutcome
  >;
  createCharge: Action<
    {
      patientId: string;
      unitId: string;
      serviceId?: string;
      description?: string;
      grossMinor: number;
      professionalId?: string;
    },
    ChargeView
  >;
  listCharges: Action<
    {
      from?: string;
      to?: string;
      unitId?: string;
      statuses?: string[];
      professionalId?: string;
      method?: string;
      cursor?: string;
    },
    ChargeList
  >;
  patientCharges: Action<{ patientId: string }, PatientCharges>;
  detail: Action<{ chargeId: string }, ChargeDetail>;
  approve: Action<{ chargeId: string; version?: number }, ChargeView>;
  reject: Action<{ chargeId: string; version?: number; reason: string }, ChargeView>;
  refund: Action<
    { chargeId: string; paymentId: string; amountMinor?: number; reason: string; unitId: string },
    { charge: ChargeView }
  >;
  void: Action<{ chargeId: string; reason: string }, ChargeView>;
  pending: Action<Record<string, never>, PendingApproval[]>;
  setMethod: Action<{ country: string; method: string; enabled: boolean }, PaymentMethodSetting>;
  newChargeOptions: Action<
    Record<string, never>,
    {
      units: { id: string; name: string; currency: string }[];
      selectedUnitId: string | null;
      services: { id: string; name: string; prices: { currency: string; amountMinor: number }[] }[];
      professionals: { id: string; name: string }[];
    }
  >;
};
