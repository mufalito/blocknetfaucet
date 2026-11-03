/** "aaaa…bbbb" — first 14 + ellipsis + last 6 chars (mirrors the server). */
export function truncateMiddle(value: string): string {
  return `${value.slice(0, 14)}…${value.slice(-6)}`;
}

/** Sober reward context for the admin: how the referral reward relates to the
 * per-claim amount and what a month of referrals costs. Empty when either
 * value doesn't parse. */
export function rewardContext(rewardBnt: string, amountBnt: string): string {
  const reward = Number.parseFloat(rewardBnt);
  const claim = Number.parseFloat(amountBnt);
  if (!Number.isFinite(reward) || !Number.isFinite(claim) || reward <= 0 || claim <= 0) return "";
  const multiple = (reward / claim).toFixed(reward / claim < 10 ? 1 : 0);
  return `${rewardBnt} BNT = ${multiple}× a claim (${amountBnt}) · 100 qualified referrals ≈ ${(reward * 100).toFixed(2)} BNT`;
}
