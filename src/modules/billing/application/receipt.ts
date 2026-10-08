import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { formatDateTime, formatLocale, formatMoney } from "@/shared/i18n/format";
import { createTranslator } from "@/shared/i18n/translator";
import type { Currency } from "@/shared/kernel/countries/codes";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import type { PaymentRecord } from "../domain/charge";
import { BillingErrors } from "../domain/errors";
import { RECEIPT_TIMEOUT_MS } from "../domain/limits";
import type { BillingDeps, ReceiptInput } from "./ports";
import { chargeIdSchema } from "./schemas";

export type ReceiptFile = { bytes: Buffer; fileName: string; number: string };

// PRD F09: a PDF per charge with the organization, the patient, the item, the amounts, the
// payment methods and dates. Generated on demand, in the organization's language, never stored.
export async function renderReceipt(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ReceiptFile>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(chargeIdSchema, input);
  if (!parsed.ok) return parsed;

  const loaded = await withTransaction(ctx, async (uow) => {
    const charge = await deps.charges.findById(uow, ctx.organizationId, parsed.value.chargeId, {
      lock: false,
    });
    return charge ? ok(charge) : fail(BillingErrors.chargeNotFound());
  });
  if (!loaded.ok) return loaded;
  const s = loaded.value.snapshot;

  const firstPayment = s.payments.find((payment) => payment.kind === "PAYMENT");
  const [organization, patient, unit, service] = await Promise.all([
    deps.directory.organization(ctx),
    deps.directory.patient(ctx, s.patientId),
    deps.directory.unit(ctx, firstPayment?.unitId ?? s.unitId),
    s.serviceId ? deps.directory.service(ctx, s.serviceId) : Promise.resolve(null),
  ]);
  if (!patient.ok) return patient;
  if (!unit) return fail(BillingErrors.unitRequired());
  const unitNames = new Map<string, string>([[unit.id, unit.name]]);
  for (const payment of s.payments) {
    if (unitNames.has(payment.unitId)) continue;
    const other = await deps.directory.unit(ctx, payment.unitId);
    unitNames.set(payment.unitId, other?.name ?? "");
  }

  const locale = organization.defaultLocale;
  const intl = formatLocale(locale, unit.country);
  const t = createTranslator(locale);
  const currency = s.currency as Currency;
  const money = (amountMinor: number) => formatMoney({ amountMinor, currency }, intl);
  const line = (payment: PaymentRecord) => ({
    date: formatDateTime(payment.receivedAt, intl, unit.timeZone),
    method:
      payment.installments && payment.installments > 1
        ? `${t(`countries.paymentMethods.${payment.method}`)} (${t("billing.receipt.installments", { count: payment.installments })})`
        : t(`countries.paymentMethods.${payment.method}`),
    unit: unitNames.get(payment.unitId) ?? "",
    amount: money(payment.amountMinor),
  });

  const document = patient.value.document;
  const receipt: ReceiptInput = {
    clinicName: organization.name,
    taxId: organization.taxId,
    logo: organization.logo,
    unit: { name: unit.name, address: unit.formattedAddress, phone: unit.phone },
    number: s.number,
    issuedAt: formatDateTime(deps.clock(), intl, unit.timeZone),
    patient: {
      name: patient.value.displayName,
      document: document ? `${document.type} ${document.number}` : null,
    },
    item: service?.name ?? s.description ?? "",
    gross: money(s.grossMinor),
    discount: s.discountMinor > 0 ? money(s.discountMinor) : null,
    net: money(s.netMinor),
    payments: s.payments.filter((payment) => payment.kind === "PAYMENT").map(line),
    refunds: s.payments.filter((payment) => payment.kind === "REFUND").map(line),
    received: money(s.paidMinor),
    balance: money(s.netMinor - s.paidMinor),
    labels: {
      documentTitle: t("billing.receipt.documentTitle", { number: s.number }),
      title: t("billing.receipt.title"),
      numberLabel: t("billing.receipt.number"),
      dateLabel: t("billing.receipt.date"),
      patientLabel: t("billing.receipt.patient"),
      documentLabel: t("billing.receipt.document"),
      itemLabel: t("billing.receipt.item"),
      grossLabel: t("billing.receipt.gross"),
      discountLabel: t("billing.receipt.discount"),
      netLabel: t("billing.receipt.net"),
      paymentsTitle: t("billing.receipt.payments"),
      refundsTitle: t("billing.receipt.refunds"),
      columns: {
        date: t("billing.receipt.columnDate"),
        method: t("billing.receipt.columnMethod"),
        unit: t("billing.receipt.columnUnit"),
        amount: t("billing.receipt.columnAmount"),
      },
      receivedLabel: t("billing.receipt.received"),
      balanceLabel: t("billing.receipt.balance"),
      noPayments: t("billing.receipt.noPayments"),
      footerNote: t("billing.receipt.notFiscal"),
      pageLabel: t("billing.receipt.page"),
      taxIdLabel: t("billing.receipt.taxId"),
      installmentsLabel: t("billing.receipt.installments", { count: 1 }),
    },
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const bytes = await Promise.race([
      deps.receipts.render(receipt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("receipt render timeout")), RECEIPT_TIMEOUT_MS);
      }),
    ]);
    return ok({ bytes, fileName: `recibo-${s.number}.pdf`, number: s.number });
  } catch {
    return fail(BillingErrors.receiptFailed());
  } finally {
    clearTimeout(timer);
  }
}
