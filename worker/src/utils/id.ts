/** Generate an 8-char uppercase hex event ID (matches the Rust CLI format) */
export function generateEventId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Generate a full UUID v4 for general-purpose record IDs */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Validate that a string is a valid event ID format */
export function isValidEventId(id: string): boolean {
  return /^[0-9A-F]{8}$/.test(id);
}
