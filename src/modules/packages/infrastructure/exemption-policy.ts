import type { ChargeExemptionPolicy } from "@/modules/billing";

// PRD F10: an appointment covered by a package creates no charge on check-in. It is covered while it
// holds a live link (linked, or already debited), which the link table answers in one read.
export const packagesExemptionPolicy: ChargeExemptionPolicy = {
  async isExempt(uow, input) {
    const link = await uow.tx.packageAppointment.findFirst({
      where: { appointmentId: input.appointmentId, status: { in: ["LINKED", "DEBITED"] } },
      select: { id: true },
    });
    return link !== null;
  },
};
