import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../config.js";
import { db } from "../db/index.js";
import { banners, bans, claims, referralPayouts, refCodes, referrals, settings } from "../db/schema.js";
import { BANNER_SLOT_LABELS, bannerSlotOf, imageSize, type BannerSlot } from "../lib/banners.js";
import { fmtBnt, parseBntAtomic } from "../lib/bnt.js";
import { requestPayout } from "../lib/oalgopay.js";
import { claimStats } from "../lib/claims.js";
import { clientIp, fetchWithTimeout } from "../lib/http.js";
import { isLockedOut, recordLoginFail, clearLoginFails } from "../lib/lockout.js";
import { ADMIN_SESSION_TTL, adminTokenValid, destroyAdminToken, mintAdminToken } from "../lib/sessions.js";
import { getSettings } from "../lib/settings.js";
import { humanize, nowSec, sleep } from "../lib/time.js";
import { EXPLORER_TX } from "../lib/explorer.js";
import { resolveStaticFile, truncateMiddle, truncateTxid } from "./public.js";

const COUNTRY_RE = /^([A-Z]{2})(,[A-Z]{2})*$/;
const SLOTS = new Set(["auto", ...(Object.keys(BANNER_SLOT_LABELS) as BannerSlot[])]);

/** Constant-time string compare — hashes both sides to equal length first
 * (timingSafeEqual throws on length mismatch). */
function timingSafeEq(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const dbb = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, dbb);
}

export const adminRoutes = new Hono();

adminRoutes.post("/api/admin/login", async (c) => {
  const ip = clientIp(c, env.ipHeader);
  if (isLockedOut(ip)) return c.json({ error: "Too many attempts, try again later" }, 429);

  const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!timingSafeEq(password, env.adminPassword)) {
    recordLoginFail(ip);
    await sleep(500);
    return c.json({ error: "wrong password" }, 401);
  }
  clearLoginFails(ip);
  const token = mintAdminToken();
  setCookie(c, "faucet_admin", token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: ADMIN_SESSION_TTL,
  });
  return c.json({ ok: true });
});

// Guard everything below (registered after /login, which it must not cover).
adminRoutes.use("/api/admin/*", async (c, next) => {
  const token = getCookie(c, "faucet_admin") ?? "";
  if (!adminTokenValid(token)) return c.json({ error: "admin auth required" }, 401);
  await next();
});

adminRoutes.post("/api/admin/logout", (c) => {
  destroyAdminToken(getCookie(c, "faucet_admin") ?? "");
  deleteCookie(c, "faucet_admin", { path: "/" });
  return c.json({ ok: true });
});

adminRoutes.get("/api/admin/overview", (c) => {
  const s = getSettings();
  const now = nowSec();
  const capAtomic = parseBntAtomic(s["daily_cap_bnt"] ?? "") ?? 0;

  const total = db.select({ count: sql<number>`count(*)` }).from(claims).where(isNotNull(claims.txid)).get();
  const day = db
    .select({ count: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(amount_atomic), 0)` })
    .from(claims)
    .where(and(isNotNull(claims.txid), sql`created_at > ${now - 86400}`))
    .get();

  const claimRows = db
    .select()
    .from(claims)
    .orderBy(desc(claims.createdAt), desc(claims.id))
    .limit(50)
    .all();

  const banRows = db.select().from(bans).orderBy(desc(bans.createdAt), desc(bans.id)).all();
  const bannerRows = db.select().from(banners).orderBy(desc(banners.id)).all();

  return c.json({
    stats: {
      total: total?.count ?? 0,
      dayCount: day?.count ?? 0,
      dayBnt: fmtBnt(day?.sum ?? 0),
      remainingBnt: fmtBnt(Math.max(capAtomic - (day?.sum ?? 0), 0)),
    },
    settings: s,
    claims: claimRows.map((r) => ({
      when: humanize(Math.max(now - r.createdAt, 0)),
      address: r.address,
      addressShort: truncateMiddle(r.address),
      ip: r.ip ?? "",
      amountBnt: fmtBnt(r.amountAtomic),
      txid: r.txid ? truncateTxid(r.txid) : "",
      txUrl: r.txid ? `${EXPLORER_TX}${r.txid}` : "",
      error: (r.error ?? "").slice(0, 80),
    })),
    bans: banRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      value: r.value,
      reason: r.reason ?? "",
      when: humanize(Math.max(now - r.createdAt, 0)),
    })),
    banners: bannerRows.map((r) => ({
      id: r.id,
      title: r.title,
      imageUrl: r.imageUrl,
      linkUrl: r.linkUrl,
      active: r.active === 1,
      when: humanize(Math.max(now - r.createdAt, 0)),
      width: r.width,
      height: r.height,
      dims: r.width ? `${r.width}×${r.height}` : "?",
      slot: r.slot,
      slotEffective: BANNER_SLOT_LABELS[bannerSlotOf(r)],
    })),
  });
});

adminRoutes.patch("/api/admin/settings", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const updates: Array<{ key: string; value: string }> = [];
  const has = (k: string) => body !== null && k in body;
  const str = (k: string) => {
    const v = body?.[k];
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
  };

  if (has("amountBnt")) {
    if (parseBntAtomic(str("amountBnt")) === null) return c.json({ error: "Invalid amount, not saved" }, 400);
    updates.push({ key: "amount_bnt", value: str("amountBnt").trim() });
  }
  if (has("dailyCapBnt")) {
    if (parseBntAtomic(str("dailyCapBnt")) === null) return c.json({ error: "Invalid amount, not saved" }, 400);
    updates.push({ key: "daily_cap_bnt", value: str("dailyCapBnt").trim() });
  }
  if (has("cooldownHours")) {
    const cooldown = Number.parseInt(str("cooldownHours").trim(), 10);
    if (!(cooldown >= 1 && cooldown <= 720)) return c.json({ error: "Invalid cooldown, not saved" }, 400);
    updates.push({ key: "cooldown_hours", value: String(cooldown) });
  }
  if (has("blockedCountries")) {
    const countries = str("blockedCountries")
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x !== "")
      .join(",");
    if (countries !== "" && !COUNTRY_RE.test(countries)) {
      return c.json({ error: "Invalid country list, not saved" }, 400);
    }
    updates.push({ key: "blocked_countries", value: countries });
  }
  if (has("donationAddress")) updates.push({ key: "donation_address", value: str("donationAddress").trim() });
  if (has("referralMinClaims")) {
    const n = Number.parseInt(str("referralMinClaims").trim(), 10);
    if (!(n >= 1 && n <= 10)) return c.json({ error: "Invalid referral qualification, not saved" }, 400);
    updates.push({ key: "referral_min_claims", value: String(n) });
  }
  if (has("referralMinSpanHours")) {
    const n = Number.parseInt(str("referralMinSpanHours").trim(), 10);
    if (!(n >= 1 && n <= 2160)) return c.json({ error: "Invalid referral qualification, not saved" }, 400);
    updates.push({ key: "referral_min_span_hours", value: String(n) });
  }
  if (has("referralRewardBnt")) {
    if (parseBntAtomic(str("referralRewardBnt")) === null) return c.json({ error: "Invalid referral reward, not saved" }, 400);
    updates.push({ key: "referral_reward_bnt", value: str("referralRewardBnt").trim() });
  }

  if (updates.length === 0) return c.json({ error: "No fields to update" }, 400);
  for (const u of updates) db.update(settings).set({ value: u.value }).where(eq(settings.key, u.key)).run();
  return c.json({ ok: true });
});


/** Referral report for the admin panel: every referrer with per-referee
 * qualification (>= referral_min_claims successful claims spanning
 * >= referral_min_span_hours), paid-once ledger state, and same-IP abuse
 * flags. Also echoes rewardBnt/amountBnt so the UI can show sober math. */
function referralReport() {
  const s = getSettings();
  const minClaims = Math.min(Math.max(Number.parseInt(s["referral_min_claims"] ?? "", 10) || 2, 1), 10);
  const minSpanHours = Math.min(Math.max(Number.parseInt(s["referral_min_span_hours"] ?? "", 10) || 48, 1), 2160);
  const minSpanSec = minSpanHours * 3600;
  const rewardAtomic = parseBntAtomic(s["referral_reward_bnt"] ?? "") ?? 0;
  const now = nowSec();

  const codeByAddress = new Map(
    db.select().from(refCodes).all().map((r) => [r.address, r.code]),
  );
  const paidByReferee = new Map(
    db.select().from(referralPayouts).all().map((p) => [p.referee, p]),
  );

  // Group referrals by referrer, preserving first-seen order.
  const byReferrer = new Map<string, Array<{ referee: string; createdAt: number }>>();
  for (const r of db.select().from(referrals).orderBy(referrals.createdAt, referrals.id).all()) {
    const list = byReferrer.get(r.referrer) ?? [];
    list.push({ referee: r.referee, createdAt: r.createdAt });
    byReferrer.set(r.referrer, list);
  }

  const referrers = [...byReferrer.entries()].map(([referrer, refs]) => {
    const referrerIps = new Set(claimStats(referrer).ips);
    const allRefereeIps = new Set<string>();
    const referees = refs.map((r) => {
      const st = claimStats(r.referee);
      st.ips.forEach((ip) => allRefereeIps.add(ip));
      const span = st.lastAt - st.firstAt;
      const qualified = st.claims >= minClaims && span >= minSpanSec;
      const paid = paidByReferee.get(r.referee);
      return {
        address: r.referee,
        addressShort: truncateMiddle(r.referee),
        referredWhen: humanize(Math.max(now - r.createdAt, 0)),
        claims: st.claims,
        firstWhen: st.claims > 0 ? humanize(Math.max(now - st.firstAt, 0)) : "",
        lastWhen: st.claims > 0 ? humanize(Math.max(now - st.lastAt, 0)) : "",
        spanHours: Math.floor(span / 3600),
        qualified,
        paid: qualified && paid !== undefined,
        paidWhen: paid ? humanize(Math.max(now - paid.paidAt, 0)) : "",
        txid: paid?.txid ?? "",
        sharesIpWithReferrer: st.ips.some((ip) => referrerIps.has(ip)),
        ips: st.ips,
      };
    });
    const unpaidQualified = referees.filter((r) => r.qualified && !r.paid).length;
    return {
      referrer,
      referrerShort: truncateMiddle(referrer),
      code: codeByAddress.get(referrer) ?? null,
      total: referees.length,
      qualified: referees.filter((r) => r.qualified).length,
      unpaidQualified,
      payableBnt: fmtBnt(rewardAtomic * unpaidQualified),
      sameIpFlag: referees.some((r) => r.sharesIpWithReferrer),
      distinctRefereeIps: allRefereeIps.size,
      referees,
    };
  });

  return {
    minClaims,
    minSpanHours,
    rewardBnt: s["referral_reward_bnt"] ?? "",
    amountBnt: s["amount_bnt"] ?? "",
    referrers,
  };
}

adminRoutes.get("/api/admin/referrals", (c) => c.json(referralReport()));

/** Pay every qualified & unpaid referee of one referrer in a single gateway
 * payout. Idempotency key hashes the referee set, so a retry after a lost
 * response replays safely (no double coins) while a changed set pays fresh.
 * The ledger (uq referee) makes every referral payable exactly once, ever. */
adminRoutes.post("/api/admin/referrals/pay", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { referrer?: unknown } | null;
  const referrer = typeof body?.referrer === "string" ? body.referrer.trim() : "";
  const s = getSettings();
  const rewardAtomic = parseBntAtomic(s["referral_reward_bnt"] ?? "");
  if (rewardAtomic === null) return c.json({ error: "Invalid referral reward — fix it in settings" }, 400);

  const entry = referralReport().referrers.find((r) => r.referrer === referrer);
  if (!entry) return c.json({ error: "No referrals for this address" }, 404);
  const due = entry.referees.filter((r) => r.qualified && !r.paid);
  if (due.length === 0) return c.json({ error: "Nothing to pay — no qualified unpaid referees" }, 400);

  const amountAtomic = rewardAtomic * due.length;
  const amountBnt = fmtBnt(amountAtomic);
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const refHash = createHash("sha256").update(referrer).digest("hex").slice(0, 16);
  const setHash = createHash("sha256").update(due.map((r) => r.address).join(",")).digest("hex").slice(0, 16);
  const result = await requestPayout(env, referrer, amountBnt, `refreward:${refHash}:${setHash}:${day}`, "referral reward");

  if (result.kind === "network_error") return c.json({ error: "gateway unreachable" }, 502);
  if (result.kind !== "ok") {
    if (result.status === 401) return c.json({ error: "faucet key invalid — check config" }, 500);
    if (result.status === 422) {
      let detail = "core rejected";
      try {
        const data = JSON.parse(result.body) as { detail?: unknown };
        if (data && typeof data.detail === "string" && data.detail) detail = data.detail;
      } catch {
        /* keep default */
      }
      return c.json({ error: `Gateway rejected: ${detail}` }, 502);
    }
    return c.json({ error: `gateway error (HTTP ${result.status})` }, 502);
  }

  const paidAt = nowSec();
  for (const r of due) {
    db.insert(referralPayouts)
      .values({ referrer, referee: r.address, paidAt, txid: result.txid })
      .onConflictDoNothing()
      .run();
  }
  return c.json({ ok: true, txid: result.txid, paid: due.length, amountBnt, explorerUrl: `${EXPLORER_TX}${result.txid}` });
});

adminRoutes.post("/api/admin/bans", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { kind?: unknown; value?: unknown; reason?: unknown } | null;
  const kind = typeof body?.kind === "string" ? body.kind.trim() : "";
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if ((kind !== "address" && kind !== "ip") || value === "") return c.json({ error: "Invalid ban" }, 400);
  db.insert(bans).values({ kind, value, reason: reason || null, createdAt: nowSec() }).onConflictDoNothing().run();
  return c.json({ ok: true });
});

adminRoutes.delete("/api/admin/bans/:id", (c) => {
  db.delete(bans).where(eq(bans.id, Number(c.req.param("id")))).run();
  return c.json({ ok: true });
});

adminRoutes.post("/api/admin/banners", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { title?: unknown; imageUrl?: unknown; linkUrl?: unknown; slot?: unknown } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  const linkUrl = typeof body?.linkUrl === "string" ? body.linkUrl.trim() : "";
  const slotRaw = typeof body?.slot === "string" ? body.slot.trim() : "auto";
  if (title === "") return c.json({ error: "Title required" }, 400);

  const staticSrc = imageUrl.startsWith("/static/");
  if (staticSrc && !resolveStaticFile(imageUrl)) {
    return c.json({ error: "Static banner not found — path must be under /static/" }, 400);
  }
  if (
    !(
      (imageUrl.startsWith("http://") || imageUrl.startsWith("https://") || staticSrc) &&
      (linkUrl.startsWith("http://") || linkUrl.startsWith("https://"))
    )
  ) {
    return c.json({ error: "Image must be http(s):// or /static/…; link must be http(s)://" }, 400);
  }

  // Fetch the image once (local read or http GET) to store its dimensions —
  // they decide the homepage slot shown in the panel.
  let data: Buffer;
  if (staticSrc) {
    const file = resolveStaticFile(imageUrl);
    if (!file) return c.json({ error: "Static banner not found — path must be under /static/" }, 400);
    data = readFileSync(file);
  } else {
    try {
      const resp = await fetchWithTimeout(imageUrl, { headers: { "user-agent": "bnt-faucet" } }, 10000);
      if (resp.status !== 200) return c.json({ error: "Could not fetch the image URL" }, 400);
      data = Buffer.from(await resp.arrayBuffer());
      if (data.length === 0) return c.json({ error: "Could not fetch the image URL" }, 400);
    } catch {
      return c.json({ error: "Could not fetch the image URL" }, 400);
    }
  }
  const slot = SLOTS.has(slotRaw) ? slotRaw : "auto";
  const size = imageSize(data);
  db.insert(banners)
    .values({
      title,
      imageUrl,
      linkUrl,
      active: 1,
      createdAt: nowSec(),
      width: size?.[0] ?? null,
      height: size?.[1] ?? null,
      slot,
    })
    .run();
  return c.json({ ok: true });
});

adminRoutes.patch("/api/admin/banners/:id", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { slot?: unknown } | null;
  const slot = typeof body?.slot === "string" ? body.slot.trim() : "";
  if (!SLOTS.has(slot)) return c.json({ error: "Unknown slot" }, 400);
  const changed = db.update(banners).set({ slot }).where(eq(banners.id, Number(c.req.param("id")))).run().changes;
  if (changed === 0) return c.json({ error: "Banner not found" }, 404);
  return c.json({ ok: true });
});

adminRoutes.post("/api/admin/banners/:id/toggle", (c) => {
  const changed = db
    .update(banners)
    .set({ active: sql`1 - active` })
    .where(eq(banners.id, Number(c.req.param("id"))))
    .run().changes;
  if (changed === 0) return c.json({ error: "Banner not found" }, 404);
  return c.json({ ok: true });
});

adminRoutes.delete("/api/admin/banners/:id", (c) => {
  db.delete(banners).where(eq(banners.id, Number(c.req.param("id")))).run();
  return c.json({ ok: true });
});
