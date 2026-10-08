// PRD F08: the clinical flag of a document can be turned on but never off, so health data that was
// protected never becomes visible to non-clinical users again. The database trigger enforces the
// same rule; this is the application side, used to compute the value to store.
export function nextClinicalFlag(current: boolean, categoryIsClinical: boolean): boolean {
  return current || categoryIsClinical;
}
