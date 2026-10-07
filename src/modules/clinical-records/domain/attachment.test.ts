import { describe, expect, it } from "vitest";
import {
  canAddAttachment,
  canMarkInError,
  checkAttachmentSize,
  cleanFileName,
  declaredAttachmentType,
  detectAttachmentType,
} from "./attachment";
import { canStartEncounterNote, canStartStandaloneNote } from "./eligibility";
import { ATTACHMENT_MAX_BYTES, IN_ERROR_WINDOW_MS } from "./limits";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new Uint8Array([...value].map((char) => char.charCodeAt(0)));

describe("attachments", () => {
  it("F07: attachment types are detected by magic bytes", () => {
    expect(detectAttachmentType(text("%PDF-1.7"))).toBe("application/pdf");
    expect(detectAttachmentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectAttachmentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    const heic = new Uint8Array(16);
    heic.set(text("ftyp"), 4);
    heic.set(text("heic"), 8);
    expect(detectAttachmentType(heic)).toBe("image/heic");
    heic.set(text("mp42"), 8);
    expect(detectAttachmentType(heic)).toBeNull();
    expect(detectAttachmentType(text("MZ\u0090\u0000"))).toBeNull();
    expect(detectAttachmentType(new Uint8Array(0))).toBeNull();
  });

  it("F07: declared types accept HEIF as HEIC and refuse anything else", () => {
    expect(declaredAttachmentType("image/HEIF")).toBe("image/heic");
    expect(declaredAttachmentType("text/plain")).toBeNull();
  });

  it("F07: files over 20 MB are refused", () => {
    expect(checkAttachmentSize(ATTACHMENT_MAX_BYTES).ok).toBe(true);
    const over = checkAttachmentSize(ATTACHMENT_MAX_BYTES + 1);
    expect(!over.ok && over.error.code).toBe("CLINICAL_ATTACHMENT_UNSUPPORTED");
    expect(checkAttachmentSize(0).ok).toBe(false);
  });

  it("F07: the 11th attachment is refused and in-error attachments free a place", () => {
    expect(canAddAttachment({ editable: true, activeCount: 9 }).ok).toBe(true);
    const eleventh = canAddAttachment({ editable: true, activeCount: 10 });
    expect(!eleventh.ok && eleventh.error.code).toBe("CLINICAL_ATTACHMENT_LIMIT");
    const closed = canAddAttachment({ editable: false, activeCount: 0 });
    expect(!closed.ok && closed.error.code).toBe("CLINICAL_ATTACHMENTS_CLOSED");
  });

  it("F07: an attachment can be marked in error only within 24 hours", () => {
    const uploadedAt = new Date("2026-10-06T10:00:00.000Z");
    const input = { actorUserId: "u1", uploadedById: "u1", uploadedAt, alreadyMarked: false };
    expect(
      canMarkInError({ ...input, now: new Date(uploadedAt.getTime() + IN_ERROR_WINDOW_MS - 1) }).ok,
    ).toBe(true);
    const late = canMarkInError({ ...input, now: new Date(uploadedAt.getTime() + IN_ERROR_WINDOW_MS) });
    expect(!late.ok && late.error.code).toBe("CLINICAL_ATTACHMENT_ERROR_WINDOW_EXPIRED");
    const other = canMarkInError({ ...input, actorUserId: "u2", now: uploadedAt });
    expect(!other.ok && other.error.code).toBe("CLINICAL_NOT_AUTHOR");
  });

  it("F07: file names are cleaned and limited", () => {
    expect(cleanFileName("raio\u0000x\n.pdf")).toBe("raiox.pdf");
    expect(cleanFileName("a".repeat(300))).toHaveLength(255);
    expect(cleanFileName("   ")).toBe("arquivo");
  });
});

describe("note eligibility", () => {
  const base = { appointmentProfessionalId: "pro-1", actorProfessionalId: "pro-1" };

  it("F07: a note can be created only for Chegou, Em atendimento or Concluído by the appointment's professional", () => {
    for (const status of ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"]) {
      expect(canStartEncounterNote({ ...base, appointmentStatus: status }).ok).toBe(true);
    }
    for (const status of ["SCHEDULED", "CONFIRMED", "NO_SHOW", "CANCELLED"]) {
      const result = canStartEncounterNote({ ...base, appointmentStatus: status });
      expect(!result.ok && result.error.code).toBe("CLINICAL_APPOINTMENT_STATUS_INVALID");
    }
    const other = canStartEncounterNote({
      ...base,
      actorProfessionalId: "pro-2",
      appointmentStatus: "COMPLETED",
    });
    expect(!other.ok && other.error.code).toBe("CLINICAL_NOT_APPOINTMENT_PROFESSIONAL");
    const unlinked = canStartEncounterNote({
      ...base,
      actorProfessionalId: null,
      appointmentStatus: "COMPLETED",
    });
    expect(unlinked.ok).toBe(false);
  });

  it("F07: standalone notes need a past attended appointment with the professional", () => {
    expect(canStartStandaloneNote(true).ok).toBe(true);
    const refused = canStartStandaloneNote(false);
    expect(!refused.ok && refused.error.code).toBe("CLINICAL_STANDALONE_NOT_ALLOWED");
  });
});
