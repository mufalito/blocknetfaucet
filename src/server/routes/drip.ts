import { and, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { db } from "../db/index.js";
import { bans, claims, refCodes, referrals } from "../db/schema.js";
import { fmtBnt, parseBntAtomic } from "../lib/bnt.js";
import { env } from "../config.js";
import { clientIp } from "../lib/http.js";
import { geoCountry, isPrivateIp } from "../lib/geo.js";
import { getSettings } from "../lib/settings.js";
import { fmtHm, nowSec } from "../lib/time.js";
import { dripIdempotencyKey, requestPayout } from "../lib/oalgopay.js";
import { turnstileOk } from "../lib/turnstile.js";

const REF_CODE_RE = /^[0-9a-f]{10}$/;

export const dripRoute = new Hono();

dripRoute.post("/api/drip", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { address?: unknown; turnstileToken?: unknown } | null;
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const turnstileToken = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";
  const now = nowSec();
  const ip = clientIp(c, env.ipHeader);
  const err = (message: string, status: 400 | 403 | 429 | 451 | 500 | 502) => c.json({ error: message }, status);

  // 1. Shape check only — the gateway core validates addresses authoritatively.
  if (!(address.length >= 20 && address.length <= 160)) {
    return err("That doesn't look like a BNT address", 400);
  }
  const s = getSettings();

  // 2/3. Bans — no claim row recorded (not payout attempts).
  if (db.select({ one: sql<number>`1` }).from(bans).where(and(eq(bans.kind, "ip"), eq(bans.value, ip))).get()) {
    return err("Your IP is banned from the faucet.", 403);
  }
  if (db.select({ one: sql<number>`1` }).from(bans).where(and(eq(bans.kind, "address"), eq(bans.value, address))).get()) {
    return err("This address is banned from the faucet.", 403);
  }

  // 4. Geo-block (fail-open: lookup failure -> "XX", never blocked).
  const blocked = new Set((s["blocked_countries"] ?? "").split(",").filter((x) => x !== ""));
  if (blocked.size > 0 && blocked.has(await geoCountry(ip))) {
    return err("Faucet is not available in your region.", 451);
  }

  // 5. Live settings (admin-editable); validated here, never exit().
  const amountAtomic = parseBntAtomic(s["amount_bnt"] ?? "");
  const capAtomic = parseBntAtomic(s["daily_cap_bnt"] ?? "");
  const cooldownS = Number.parseInt(s["cooldown_hours"] ?? "", 10) * 3600;
  if (amountAtomic === null || capAtomic === null || !(cooldownS > 0)) {
    return err("Faucet settings invalid — contact the operator", 500);
  }

  // 6. Per-address cooldown (successful claims only).
  const last = db
    .select({ last: sql<number | null>`max(created_at)` })
    .from(claims)
    .where(and(eq(claims.address, address), isNotNull(claims.txid)))
    .get()?.last;
  if (last !== null && last !== undefined) {
    const remaining = cooldownS - (now - last);
    if (remaining > 0) return err(`Already claimed; try again in ${fmtHm(remaining)}`, 429);
  }

  // 6b. Per-IP cooldown — same farmer, fresh wallet: the cooldown above is
  // keyed by address, so a generated address would dodge it. Private/local
  // IPs are exempt so NAT offices and local testing keep working.
  if (!isPrivateIp(ip)) {
    const lastIp = db
      .select({ last: sql<number | null>`max(created_at)` })
      .from(claims)
      .where(and(eq(claims.ip, ip), isNotNull(claims.txid)))
      .get()?.last;
    if (lastIp !== null && lastIp !== undefined) {
      const remaining = cooldownS - (now - lastIp);
      if (remaining > 0) return err(`This network already claimed; try again in ${fmtHm(remaining)}`, 429);
    }
  }

  // 7. Global daily cap.
  const spentRow = db
    .select({ spent: sql<number>`coalesce(sum(amount_atomic), 0)` })
    .from(claims)
    .where(and(isNotNull(claims.txid), sql`created_at > ${now - 86400}`))
    .get();
  if ((spentRow?.spent ?? 0) + amountAtomic > capAtomic) {
    return err("Daily faucet budget exhausted, back tomorrow", 429);
  }

  // 8. Human check — single-use token per claim; verified only after the free
  // checks so blocked ranges never consume one; fail-closed while configured.
  if (!(await turnstileOk(turnstileToken, ip, env.turnstileSecret))) {
    return err("Captcha verification failed — reload and try again", 400);
  }

  const record = (txid: string | null, error: string | null) => {
    db.insert(claims).values({ address, amountAtomic, txid, error, createdAt: now, ip }).run();
  };

  // 9. Payout via the documented gateway contract.
  const idem = dripIdempotencyKey(address, new Date(now * 1000));
  const result = await requestPayout(env, address, s["amount_bnt"] ?? "", idem);

  // 10. Response handling — every attempted payout leaves an audit row.
  if (result.kind === "network_error") {
    record(null, "gateway unreachable");
    return err("gateway unreachable", 502);
  }
  if (result.kind === "ok") {
    record(result.txid, null);
    // Referral capture (track-only): the ?ref= landing cookie credits the
    // referrer once per referee address; self-referrals never land.
    const ref = getCookie(c, "faucet_ref") ?? "";
    if (REF_CODE_RE.test(ref)) {
      const referrer = db.select({ address: refCodes.address }).from(refCodes).where(eq(refCodes.code, ref)).get();
      if (referrer && referrer.address !== address) {
        db.insert(referrals).values({ referrer: referrer.address, referee: address, createdAt: now })
          .onConflictDoNothing()
          .run();
      }
    }
    deleteCookie(c, "faucet_ref", { path: "/" });
    return c.json(
      { ok: true, message: `Sent ${fmtBnt(amountAtomic)} BNT to ${address}`, txid: result.txid, address },
      200,
    );
  }
  if (result.status === 401) {
    record(null, "faucet key invalid");
    return err("faucet key invalid — check config", 500);
  }
  if (result.status === 422) {
    let detail = "core rejected";
    try {
      const data = JSON.parse(result.body) as { detail?: unknown };
      if (data && typeof data.detail === "string" && data.detail) detail = data.detail;
    } catch {
      /* keep default */
    }
    record(null, detail);
    return err(`Gateway rejected: ${detail}`, 502);
  }
  record(null, `HTTP ${result.status}: ${result.body.slice(0, 200)}`);
  return err(`gateway error (HTTP ${result.status})`, 502);
});
