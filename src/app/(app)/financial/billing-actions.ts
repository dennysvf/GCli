import type { BillingActions } from "@/modules/billing/client";
import {
  appointmentChargeAction,
  approveDiscountAction,
  chargeDetailAction,
  createChargeAction,
  listChargesAction,
  newChargeOptionsAction,
  patientChargesAction,
  pendingApprovalsAction,
  receiveOptionsAction,
  receivePaymentAction,
  refundPaymentAction,
  rejectDiscountAction,
  setDiscountAction,
  setPaymentMethodAction,
  voidChargeAction,
} from "./actions";

// The Server Actions the billing screens receive as props (the module's UI never imports `app/`).
export const billingActions = {
  appointmentCharge: appointmentChargeAction,
  receiveOptions: receiveOptionsAction,
  receive: receivePaymentAction,
  setDiscount: setDiscountAction,
  createCharge: createChargeAction,
  listCharges: listChargesAction,
  patientCharges: patientChargesAction,
  detail: chargeDetailAction,
  approve: approveDiscountAction,
  reject: rejectDiscountAction,
  refund: refundPaymentAction,
  void: voidChargeAction,
  pending: pendingApprovalsAction,
  setMethod: setPaymentMethodAction,
  newChargeOptions: newChargeOptionsAction,
} as unknown as BillingActions;
