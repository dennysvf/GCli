import { z } from "zod";
import { addressFieldsSchema, normalizeAddress, type CountryAddress } from "@/shared/kernel/address";
import { isTimeZoneOf } from "@/shared/kernel/countries";
import { COUNTRY_CODES } from "@/shared/kernel/countries/codes";
import { PhoneNumber } from "@/shared/kernel/phone";
import { CLOSURE_REASON_MAX, ROOM_DESCRIPTION_MAX, ROOM_NAME_MAX, UNIT_NAME_MAX } from "../domain/limits";

// Zod schemas shared by the units forms and use cases. Messages are catalog keys (units.validation.*
// and validation.*, ADR-028), translated where they are shown.
// Empty strings from forms become null; values are trimmed.
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const unitFields = {
  name: z
    .string()
    .trim()
    .min(2, "units.validation.nameRequired")
    .max(UNIT_NAME_MAX, "units.validation.nameTooLong"),
  country: z.enum(COUNTRY_CODES, { error: "validation.countryInvalid" }),
  // Check digits are validated by the use case against the country (TAX_ID_INVALID).
  taxId: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null),
  timeZone: z.string().min(1, "units.validation.timeZoneRequired"),
  phone: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || z.email().safeParse(value).success, "units.validation.emailInvalid"),
  address: addressFieldsSchema.prefault({}),
};

type UnitFieldsOutput = {
  name: string;
  country: (typeof COUNTRY_CODES)[number];
  taxId: string | null;
  timeZone: string;
  phone: string | null;
  email: string | null;
  address: z.output<typeof addressFieldsSchema>;
};

// Rules that need the country: time zone, phone (stored as E.164) and the address.
function withCountryRules<T extends UnitFieldsOutput>(value: T, ctx: z.RefinementCtx) {
  if (!isTimeZoneOf(value.country, value.timeZone)) {
    ctx.addIssue({ code: "custom", path: ["timeZone"], message: "units.validation.timeZoneRequired" });
  }
  let phone: string | null = null;
  if (value.phone) {
    const parsed = PhoneNumber.parse(value.phone, { defaultCountry: value.country });
    if (parsed.ok) phone = parsed.value.e164;
    else ctx.addIssue({ code: "custom", path: ["phone"], message: "validation.phoneInvalid" });
  }
  const address: CountryAddress = normalizeAddress(value.country, value.address, (path, message) =>
    ctx.addIssue({ code: "custom", path: ["address", path], message }),
  );
  return { ...value, phone, address };
}

export const createUnitSchema = z.object(unitFields).transform(withCountryRules);
export const updateUnitSchema = z
  .object({
    ...unitFields,
    unitId: z.uuid(),
    version: z.coerce.number().int().min(1),
  })
  .transform(withCountryRules);
export const setUnitActiveSchema = z.object({ unitId: z.uuid(), active: z.boolean() });

const intervalSchema = z.object({ start: z.coerce.number().int(), end: z.coerce.number().int() });
export const replaceBusinessHoursSchema = z.object({
  unitId: z.uuid(),
  days: z.array(
    z.object({ weekday: z.coerce.number().int(), open: z.boolean(), intervals: z.array(intervalSchema) }),
  ),
});

export const createRoomSchema = z.object({
  unitId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, "units.validation.roomNameRequired")
    .max(ROOM_NAME_MAX, "units.validation.nameTooLong"),
  description: optionalText(ROOM_DESCRIPTION_MAX, "units.validation.descriptionTooLong"),
});
export const updateRoomSchema = createRoomSchema.omit({ unitId: true }).extend({ roomId: z.uuid() });
export const setRoomActiveSchema = z.object({ roomId: z.uuid(), active: z.boolean() });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "units.validation.dateInvalid");
export const createClosureSchema = z
  .object({
    unitId: z.uuid(),
    startsOn: isoDate,
    endsOn: isoDate,
    reason: z
      .string()
      .trim()
      .min(2, "units.validation.reasonRequired")
      .max(CLOSURE_REASON_MAX, "units.validation.reasonTooLong"),
    confirmOverlap: z.boolean().optional().default(false),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    path: ["endsOn"],
    message: "units.validation.endBeforeStart",
  });
export const deleteClosureSchema = z.object({ closureId: z.uuid() });

export const selectUnitSchema = z.object({ unitId: z.uuid() });

export type UnitFormInput = z.input<typeof createUnitSchema>;
export type BusinessHoursInput = z.input<typeof replaceBusinessHoursSchema>;
