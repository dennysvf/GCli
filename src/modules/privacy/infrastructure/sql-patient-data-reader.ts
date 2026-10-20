import type { UnitOfWork } from "@/shared/db/transaction";
import { objectStorage } from "@/shared/storage/object-storage";
import type { PatientDataReader, PatientExportData } from "../application/ports";

// Read-only access to the data of other modules for the export and the anonymization rules
// (ADR-040). Model queries go through the tenant-scoped client and also name the organization
// explicitly; the patient row lock is raw SQL with an explicit organization filter.

const OPEN_CHARGE_STATUSES = ["PENDING_APPROVAL", "OPEN", "PARTIALLY_PAID"];
const NOT_OCCUPYING = ["CANCELLED", "NO_SHOW"];

const displayOf = (professional: { displayName: string | null; fullName: string }) =>
  professional.displayName ?? professional.fullName;

async function userNames(uow: UnitOfWork, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const rows = await uow.tx.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, row.name]));
}

export const sqlPatientDataReader: PatientDataReader = {
  async read(uow, organizationId, patientId): Promise<PatientExportData | null> {
    const scope = { organizationId, patientId };
    const [organization, patient] = await Promise.all([
      uow.tx.organization.findFirst({
        where: { id: organizationId },
        select: { id: true, legalName: true, tradeName: true, timeZone: true, logoObjectKey: true },
      }),
      uow.tx.patient.findFirst({
        where: { organizationId, id: patientId },
        include: {
          referralSource: { select: { name: true } },
          tags: { select: { tag: { select: { name: true } } } },
        },
      }),
    ]);
    if (!organization || !patient) return null;

    const consents = await uow.tx.consentRecord.findMany({
      where: scope,
      include: { termsVersion: { select: { version: true } } },
      orderBy: [{ consentedAt: "asc" }, { id: "asc" }],
    });
    const appointments = await uow.tx.appointment.findMany({
      where: scope,
      include: {
        service: { select: { name: true } },
        professional: { select: { displayName: true, fullName: true } },
        unit: { select: { name: true, timeZone: true } },
        room: { select: { name: true } },
        cancellationReason: { select: { name: true } },
        statusChanges: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] },
        reschedules: { orderBy: [{ rescheduledAt: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    const notes = await uow.tx.clinicalNote.findMany({
      where: scope,
      include: {
        professional: { select: { displayName: true, fullName: true } },
        versions: { orderBy: { versionNumber: "asc" } },
        addenda: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        attachments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const alert = await uow.tx.clinicalAlert.findFirst({
      where: scope,
      include: { changes: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    const documents = await uow.tx.patientDocument.findMany({
      where: scope,
      include: { category: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const charges = await uow.tx.charge.findMany({
      where: scope,
      include: {
        unit: { select: { name: true, timeZone: true } },
        service: { select: { name: true } },
        payments: { orderBy: [{ receivedAt: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const names = await userNames(uow, [
      ...consents.map((row) => row.recordedById),
      ...appointments.flatMap((row) => [
        row.createdById,
        ...row.statusChanges.map((change) => change.changedById),
        ...row.reschedules.map((change) => change.rescheduledById),
      ]),
      ...notes.flatMap((row) => [row.authorUserId, ...row.addenda.map((addendum) => addendum.authorUserId)]),
      ...documents.map((row) => row.authorUserId),
      ...charges.flatMap((row) => row.payments.map((payment) => payment.userId)),
    ]);
    const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);

    return {
      organization: {
        id: organization.id,
        name: organization.tradeName ?? organization.legalName,
        timeZone: organization.timeZone,
        logoKey: organization.logoObjectKey,
      },
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        socialName: patient.socialName,
        birthDate: patient.birthDate.toISOString().slice(0, 10),
        sex: patient.sex,
        document:
          patient.documentType && patient.documentNumber && patient.documentCountry
            ? { country: patient.documentCountry, type: patient.documentType, number: patient.documentNumber }
            : null,
        rg: patient.rg,
        mobilePhone: patient.mobilePhone,
        secondaryPhone: patient.secondaryPhone,
        email: patient.email,
        address: {
          country: patient.addressCountry,
          postalCode: patient.postalCode,
          street: patient.street,
          number: patient.number,
          complement: patient.complement,
          district: patient.district,
          city: patient.city,
          region: patient.region,
        },
        occupation: patient.occupation,
        referralSource: patient.referralSource?.name ?? null,
        observations: patient.observations,
        tags: patient.tags.map((item) => item.tag.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
        guardian:
          patient.guardianName && patient.guardianRelationship && patient.guardianPhone
            ? {
                name: patient.guardianName,
                document:
                  patient.guardianDocumentType && patient.guardianDocumentNumber
                    ? { type: patient.guardianDocumentType, number: patient.guardianDocumentNumber }
                    : null,
                relationship: patient.guardianRelationship,
                phone: patient.guardianPhone,
              }
            : null,
        active: patient.active,
        inactiveReason: patient.inactiveReason,
        createdAt: patient.createdAt,
        anonymizedAt: patient.anonymizedAt,
      },
      consents: consents.map((row) => ({
        id: row.id,
        consentedAt: row.consentedAt,
        termsVersion: row.termsVersion.version,
        method: row.method,
        recordedByName: nameOf(row.recordedById),
        file:
          row.fileObjectKey && row.fileName
            ? { id: row.id, fileName: row.fileName, objectKey: row.fileObjectKey }
            : null,
      })),
      appointments: appointments.map((row) => ({
        id: row.id,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        timeZone: row.unit.timeZone,
        status: row.status,
        serviceName: row.service.name,
        professionalName: displayOf(row.professional),
        unitName: row.unit.name,
        roomName: row.room?.name ?? null,
        isOverbooking: row.isOverbooking,
        priceMinor: row.priceMinor.toString(),
        currency: row.currency,
        notes: row.notes,
        cancellation: row.cancelledAt
          ? {
              origin: row.cancellationOrigin,
              reason: row.cancellationReason?.name ?? null,
              note: row.cancellationNote,
              at: row.cancelledAt,
            }
          : null,
        createdAt: row.createdAt,
        createdByName: nameOf(row.createdById),
        history: row.statusChanges.map((change) => ({
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          changedAt: change.changedAt,
          changedByName: nameOf(change.changedById),
          justification: change.justification,
        })),
        reschedules: row.reschedules.map((change) => ({
          previousStartsAt: change.previousStartsAt,
          previousEndsAt: change.previousEndsAt,
          rescheduledAt: change.rescheduledAt,
          rescheduledByName: nameOf(change.rescheduledById),
        })),
      })),
      clinicalNotes: notes.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        appointmentId: row.appointmentId,
        professionalName: displayOf(row.professional),
        authorName: nameOf(row.authorUserId),
        createdAt: row.createdAt,
        finalizedAt: row.finalizedAt,
        autoFinalized: row.autoFinalized,
        contentHtml: row.contentHtml,
        contentText: row.contentText,
        versions: row.versions.map((version) => ({
          versionNumber: version.versionNumber,
          replacedAt: version.replacedAt,
          contentHtml: version.contentHtml,
          contentText: version.contentText,
        })),
        addenda: row.addenda.map((addendum) => ({
          id: addendum.id,
          authorName: nameOf(addendum.authorUserId),
          createdAt: addendum.createdAt,
          contentHtml: addendum.contentHtml,
          contentText: addendum.contentText,
        })),
        // The original file as uploaded (the converted copy is derived from it).
        attachments: row.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          contentType: attachment.contentType ?? attachment.sourceContentType,
          sizeBytes: attachment.sizeBytes,
          inError: attachment.markedInErrorAt !== null,
          createdAt: attachment.createdAt,
          file: { id: attachment.id, fileName: attachment.fileName, objectKey: attachment.sourceObjectKey },
        })),
      })),
      clinicalAlert: alert
        ? {
            text: alert.text,
            updatedAt: alert.updatedAt,
            history: alert.changes.map((change) => ({
              previousText: change.previousText,
              changedAt: change.createdAt,
            })),
          }
        : null,
      documents: documents.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        categoryName: row.category.name,
        isClinical: row.isClinical,
        status: row.status,
        fileName: row.fileName,
        contentType: row.sourceContentType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        authorName: nameOf(row.authorUserId),
        archivedAt: row.archivedAt,
        erasedAt: row.erasedAt,
        // An erased document has no file left (PRD F14 anonymization).
        file: row.erasedAt ? null : { id: row.id, fileName: row.fileName, objectKey: row.sourceObjectKey },
      })),
      charges: charges.map((row) => ({
        id: row.id,
        number: row.number,
        origin: row.origin,
        item: row.service?.name ?? row.description,
        unitName: row.unit.name,
        timeZone: row.unit.timeZone,
        currency: row.currency,
        grossMinor: row.grossMinor.toString(),
        discountMinor: row.discountMinor.toString(),
        discountReason: row.discountReason,
        netMinor: row.netMinor.toString(),
        paidMinor: row.paidMinor.toString(),
        status: row.status,
        createdAt: row.createdAt,
        cancelledAt: row.cancelledAt,
        cancelReason: row.cancelReason,
        payments: row.payments.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          method: payment.method,
          installments: payment.installments,
          amountMinor: payment.amountMinor.toString(),
          refundedMinor: payment.refundedMinor.toString(),
          receivedAt: payment.receivedAt,
          userName: nameOf(payment.userId),
          reason: payment.reason,
        })),
      })),
    };
  },

  async facts(uow, organizationId, patientId, now) {
    const scope = { organizationId, patientId };
    const [clinicalNotes, clinicalDocuments, alert, futureAppointments, openCharges] = await Promise.all([
      uow.tx.clinicalNote.count({ where: scope }),
      uow.tx.patientDocument.count({ where: { ...scope, isClinical: true } }),
      uow.tx.clinicalAlert.findFirst({ where: scope, select: { text: true } }),
      uow.tx.appointment.count({
        where: { ...scope, startsAt: { gt: now }, status: { notIn: NOT_OCCUPYING } },
      }),
      uow.tx.charge.count({ where: { ...scope, status: { in: OPEN_CHARGE_STATUSES } } }),
    ]);
    return {
      clinicalNotes,
      clinicalDocuments,
      clinicalAlert: (alert?.text.trim().length ?? 0) > 0,
      futureAppointments,
      openCharges,
    };
  },

  async lockPatient(uow, organizationId, patientId) {
    const rows = await uow.tx.$queryRaw<{ full_name: string; anonymized_at: Date | null }[]>`
      SELECT full_name, anonymized_at FROM patient
      WHERE organization_id = ${organizationId}::uuid AND id = ${patientId}::uuid
      FOR UPDATE`;
    const row = rows[0];
    return row ? { fullName: row.full_name, anonymized: row.anonymized_at !== null } : null;
  },

  async anonymizationCodeTaken(uow, organizationId, code) {
    return (await uow.tx.patient.count({ where: { organizationId, anonymizedCode: code } })) > 0;
  },

  async organizationLogo(key) {
    const stored = await objectStorage().get(key);
    return stored ? { data: Buffer.from(stored.body), format: "png" } : null;
  },
};
