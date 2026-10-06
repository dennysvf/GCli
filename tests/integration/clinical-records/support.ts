import { scheduling } from "@/modules/scheduling";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { createUser, signedInContext } from "../helpers";
import { booking, bookOrThrow, day, schedulingWorld, type Ctx, type World } from "../scheduling/support";

export type { Ctx, World };

// A clinic from the scheduling tests plus a second professional user (linked to Bruno), so access
// rules between professionals can be exercised.
export async function clinicalWorld() {
  const world = await schedulingWorld();
  const brunoUser = await createUser({
    organizationId: world.organizationId,
    role: "PROFESSIONAL",
    name: "Bruno Souza",
  });
  await db().professional.update({
    where: { id: world.professionals.bruno },
    data: { linkedUserId: brunoUser.id },
  });
  const bruno = (await signedInContext(brunoUser)).ctx;
  return { ...world, brunoPro: bruno };
}

export type ClinicalWorld = Awaited<ReturnType<typeof clinicalWorld>>;

// Moves an appointment along the lifecycle as the front desk.
export async function moveTo(ctx: Ctx, appointmentId: string, statuses: string[]) {
  for (const to of statuses) {
    const current = await db().appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const result = await scheduling.changeAppointmentStatus(ctx, {
      appointmentId,
      version: current.version,
      to,
    });
    if (!result.ok) throw new Error(`status ${to} failed: ${result.error.code}`);
  }
}

// An appointment of Ana with Maria, already at the given status (CHECKED_IN by default).
export async function appointmentFor(
  world: ClinicalWorld,
  options: { status?: string[]; startTime?: string; patientId?: string; professionalId?: string } = {},
) {
  const booked = await bookOrThrow(
    world.desk,
    booking(world, {
      date: day(1),
      startTime: options.startTime ?? "10:00",
      ...(options.patientId ? { patientId: options.patientId } : {}),
      ...(options.professionalId ? { professionalId: options.professionalId } : {}),
    }),
  );
  await moveTo(world.desk, booked.appointmentId, options.status ?? ["CHECKED_IN"]);
  return booked.appointmentId;
}

// Inserts a note directly (as the runtime role), with a controlled creation instant. Used by the
// schema tests and to seed notes that are already locked.
export async function insertNote(
  world: ClinicalWorld,
  options: {
    appointmentId?: string | null;
    createdAt?: Date;
    status?: "DRAFT" | "FINALIZED";
    html?: string;
    authorUserId?: string;
    professionalId?: string;
    patientId?: string;
  } = {},
) {
  const createdAt = options.createdAt ?? new Date();
  const html = options.html ?? "<p>Dor lombar.</p>";
  const status = options.status ?? "FINALIZED";
  const professional = await db().professional.findUniqueOrThrow({
    where: { id: options.professionalId ?? world.professionals.ana },
  });
  return db().clinicalNote.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      patientId: options.patientId ?? world.patients.maria,
      appointmentId: options.appointmentId ?? null,
      kind: options.appointmentId ? "ENCOUNTER" : "STANDALONE",
      professionalId: professional.id,
      authorUserId: options.authorUserId ?? professional.linkedUserId ?? world.pro.user.id,
      status,
      contentHtml: html,
      contentText: html.replace(/<[^>]+>/g, ""),
      characters: html.replace(/<[^>]+>/g, "").length,
      createdAt,
      locksAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
      ...(status === "FINALIZED" ? { finalizedAt: createdAt } : {}),
    },
  });
}
