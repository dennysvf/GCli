import { DURATION_MAX, DURATION_MIN, DURATION_STEP, PRICE_MAX_CENTS } from "./limits";

export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= DURATION_MIN &&
    minutes <= DURATION_MAX &&
    minutes % DURATION_STEP === 0
  );
}

export function isValidPriceCents(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= PRICE_MAX_CENTS;
}

// "30 min", "1h 30min", "2h".
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export const DURATION_OPTIONS: readonly number[] = Array.from(
  { length: (DURATION_MAX - DURATION_MIN) / DURATION_STEP + 1 },
  (_, index) => DURATION_MIN + index * DURATION_STEP,
);

export type RoomRef = { id: string; name: string; active: boolean; unitId: string };

// Allowed rooms are restricted per unit (spec F03 section 3): a unit with no selected room
// accepts any active room; a unit with selected rooms accepts only those still active.
export function resolveAllowedRooms(
  selectedRooms: RoomRef[],
  unitId: string,
): "any" | { id: string; name: string }[] {
  const inUnit = selectedRooms.filter((room) => room.unitId === unitId);
  if (inUnit.length === 0) return "any";
  return inUnit
    .filter((room) => room.active)
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
