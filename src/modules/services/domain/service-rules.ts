import { minorUnits, type Currency } from "@/shared/kernel/countries/codes";
import { DURATION_MAX, DURATION_MIN, DURATION_STEP, PRICE_MAX_MAJOR } from "./limits";

export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= DURATION_MIN &&
    minutes <= DURATION_MAX &&
    minutes % DURATION_STEP === 0
  );
}

// Largest price in minor units: 99,999.99 with two decimals, 99,999 for currencies without decimals.
export function maxPriceMinor(currency: Currency): number {
  const scale = 10 ** minorUnits(currency);
  return PRICE_MAX_MAJOR * scale + (scale - 1);
}

export function isValidPriceMinor(amountMinor: number, currency: Currency): boolean {
  return Number.isInteger(amountMinor) && amountMinor >= 0 && amountMinor <= maxPriceMinor(currency);
}

export type PriceInput = { currency: Currency; amountMinor: number };

// The price of a currency among the prices of a service, or null when it has none.
export function priceIn(prices: readonly PriceInput[], currency: Currency): number | null {
  return prices.find((price) => price.currency === currency)?.amountMinor ?? null;
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
