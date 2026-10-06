// Check-digit algorithms of the identity documents and tax IDs of the supported countries (PRD
// F16). Pure functions over normalized values (upper case, no punctuation); `documents.ts` and
// `tax-id.ts` build their specs on top of them. CPF and CNPJ live in `cpf.ts` and `cnpj.ts`.

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

// Spain: DNI (8 digits + letter) and NIE (X, Y or Z + 7 digits + letter).
export function isValidDniEs(value: string): boolean {
  const match = /^(\d{8})([A-Z])$/.exec(value);
  return !!match && DNI_LETTERS[Number(match[1]) % 23] === match[2];
}

export function isValidNieEs(value: string): boolean {
  const match = /^([XYZ])(\d{7})([A-Z])$/.exec(value);
  if (!match) return false;
  const prefix = { X: "0", Y: "1", Z: "2" }[match[1] as "X" | "Y" | "Z"];
  return DNI_LETTERS[Number(`${prefix}${match[2]}`) % 23] === match[3];
}

// Spain: CIF of legal entities, a letter, 7 digits and a control digit or letter.
export function isValidCifEs(value: string): boolean {
  const match = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(value);
  if (!match) return false;
  const [, kind = "", digits = "", control = ""] = match;
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const n = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = n * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += n;
    }
  }
  const digit = (10 - (sum % 10)) % 10;
  const letter = "JABCDEFGHI"[digit];
  if ("PQRSNW".includes(kind)) return control === letter;
  if ("ABEH".includes(kind)) return control === String(digit);
  return control === String(digit) || control === letter;
}

// Portugal: NIF (individuals) and NIPC (companies), 9 digits with a modulo-11 check digit. The
// first digits identify the kind of holder; only the issued ranges are accepted.
export function isValidNifPt(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const issued = /^([1235689]|45|70|71|72|74|75|77|78|79|90|91|98|99)/.test(value);
  if (!issued) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(value[i]) * (9 - i);
  const remainder = 11 - (sum % 11);
  return Number(value[8]) === (remainder >= 10 ? 0 : remainder);
}

// Argentina: CUIT/CUIL, 11 digits, modulo 11 with weights 5,4,3,2,7,6,5,4,3,2.
export function isValidCuit(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(value[i]) * (weights[i] ?? 0);
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder;
  return digit !== 10 && Number(value[10]) === digit && /^(20|23|24|27|30|33|34)/.test(value);
}

// Chile: RUT, 7 or 8 digits and a verifier that is a digit or K (modulo 11, weights 2 to 7).
export function isValidRut(value: string): boolean {
  const match = /^(\d{7,8})([0-9K])$/.exec(value);
  if (!match) return false;
  const body = match[1] ?? "";
  let sum = 0;
  let weight = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = 11 - (sum % 11);
  const verifier = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return match[2] === verifier;
}

// Colombia: NIT, the base number followed by a verification digit (DIAN weights).
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
export function isValidNit(value: string): boolean {
  if (!/^\d{8,11}$/.test(value)) return false;
  const base = value.slice(0, -1).split("").reverse();
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (NIT_WEIGHTS[i] ?? 0);
  const remainder = sum % 11;
  return Number(value.slice(-1)) === (remainder > 1 ? 11 - remainder : remainder);
}

// Mexico: CURP, 18 characters with a check digit over the first 17.
const CURP_ALPHABET = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
export function isValidCurp(value: string): boolean {
  if (!/^[A-Z]{4}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += CURP_ALPHABET.indexOf(value[i] ?? "") * (18 - i);
  return Number(value[17]) === (10 - (sum % 10)) % 10;
}

// Mexico: RFC of people (13 characters) and companies (12), checked by format only: the
// homoclave check digit depends on a table the tax authority has changed over time.
export function isValidRfc(value: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/.test(value);
}

// United States: NPI, 10 digits whose Luhn check includes the 80840 prefix.
export function isValidNpi(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const digits = `80840${value}`;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}
