// Tiny shared helper — nothing in Part 1 established an ID-generation convention, so this
// is it: one place to change if the scheme ever needs to (e.g. a future sync backend that
// wants server-assigned IDs). `crypto.randomUUID()` is available natively in all evergreen
// browsers (required for a TWA target anyway) and in Node ≥ 14.17, so this adds zero new
// dependencies.
export function newId(): string {
  return crypto.randomUUID();
}
