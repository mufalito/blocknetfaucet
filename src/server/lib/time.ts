export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** "just now" / "5m ago" / "2h 05m ago" / "1d 3h ago" — relative age. */
export function humanize(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h}h ${Math.floor((seconds % 3600) / 60)}m ago`;
  }
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ago`;
}

/** "Xh Ym" cooldown remainder. */
export function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  return `${h}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** "now" / "12m" / "3h 20m" / "1d 4h" — next-claim countdown. */
export function fmtNext(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    return `${h}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/** Await a pause (used to slow brute-force login attempts). */
export const sleep = (ms: number) => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};
