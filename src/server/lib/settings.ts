import { db } from "../db/index.js";
import { settings } from "../db/schema.js";

/** Live settings as a plain record (admin-editable, read per request). */
export function getSettings(): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
