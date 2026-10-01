import { MAJORITY_AGE } from "./limits";

// Ages from calendar dates ("YYYY-MM-DD"). "Today" comes from the organization's time zone
// (spec F05 assumptions), so the result does not depend on the server clock's zone.
function parts(date: string): [number, number, number] {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  return [year, month, day];
}

export function ageOn(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = parts(birthDate);
  const [year, month, day] = parts(today);
  const hadBirthday = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}

// PRD F05: patients under 18 at registration need a guardian.
export function isMinor(birthDate: string, today: string): boolean {
  return ageOn(birthDate, today) < MAJORITY_AGE;
}
