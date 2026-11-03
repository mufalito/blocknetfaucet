export const ATOMIC_PER_BNT = 100_000_000;

/**
 * BNT amount string -> atomic integer, or null when invalid / <= 0.
 * Parses plain decimals exactly (no float math); more than 8 fractional
 * digits truncate toward zero, matching Python's `int(Decimal(v) * 1e8)`.
 */
export function parseBntAtomic(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const m = /^\s*(\d+)(?:\.(\d*))?\s*$/.exec(String(value));
  if (!m) return null;
  const whole = m[1] ?? "0";
  const frac = (m[2] ?? "").slice(0, 8).padEnd(8, "0");
  const atomic = Number(whole) * ATOMIC_PER_BNT + Number(frac);
  if (!Number.isSafeInteger(atomic) || atomic <= 0) return null;
  return atomic;
}

/** Atomic integer -> display string with trailing zeros stripped ("0.5", "1"). */
export function fmtBnt(atomic: number): string {
  const s = (atomic / ATOMIC_PER_BNT).toFixed(8);
  return s.replace(/0+$/, "").replace(/\.$/, "");
}
