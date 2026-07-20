const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_PATTERN.test(email);
}

export function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Canonical form for storing and looking up emails: trimmed + lowercased, so
// "Foo@X.com " and "foo@x.com" resolve to the same account. Returns "" for
// non-strings, which then fails isValidEmail — closing NoSQL-injection inputs.
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}
