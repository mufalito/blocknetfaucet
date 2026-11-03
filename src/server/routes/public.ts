import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { env } from "../config.js";
import { db, ROOT_DIR } from "../db/index.js";
import { banners, claims } from "../db/schema.js";
import { bannerSlotOf, type BannerSlot } from "../lib/banners.js";
import { fmtBnt } from "../lib/bnt.js";
import { fetchWithTimeout } from "../lib/http.js";
import { getSettings } from "../lib/settings.js";
import { humanize, nowSec } from "../lib/time.js";

import { EXPLORER_TX } from "../lib/explorer.js";

export interface BannerDTO {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string;
}

/** Active banners grouped by effective slot. */
export function bannerSlots(): Record<BannerSlot, BannerDTO[]> {
  const slots: Record<BannerSlot, BannerDTO[]> = { top: [], grid: [], sidebar: [], bottom: [] };
  const rows = db
    .select({ id: banners.id, title: banners.title, linkUrl: banners.linkUrl, slot: banners.slot, width: banners.width, height: banners.height })
    .from(banners)
    .where(eq(banners.active, 1))
    .orderBy(banners.id)
    .all();
  for (const row of rows) {
    slots[bannerSlotOf(row)].push({
      id: row.id,
      title: row.title,
      imageUrl: `/api/banner-img/${row.id}`,
      linkUrl: row.linkUrl,
    });
  }
  return slots;
}

/** "aaaa…bbbb" — first 14 + ellipsis + last 6 chars. */
export function truncateMiddle(value: string): string {
  return `${value.slice(0, 14)}…${value.slice(-6)}`;
}

export function truncateTxid(txid: string): string {
  return txid.length > 12 ? `${txid.slice(0, 12)}…` : txid;
}

const STATIC_MEDIA: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** Resolve a /static/… URL to a file inside static/, or null when it escapes / misses. */
export function resolveStaticFile(urlPath: string): string | null {
  const base = path.resolve(ROOT_DIR, "static");
  const target = path.resolve(ROOT_DIR, urlPath.replace(/^\/+/, ""));
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!existsSync(target) || !statSync(target).isFile()) return null;
  return target;
}

export const publicRoutes = new Hono();

publicRoutes.get("/api/config", (c) => {
  const s = getSettings();
  return c.json({
    amountBnt: s["amount_bnt"] ?? "",
    cooldownHours: s["cooldown_hours"] ?? "",
    dailyCapBnt: s["daily_cap_bnt"] ?? "",
    donationAddress: s["donation_address"] ?? "",
    turnstileSitekey: env.turnstileSitekey,
    signinEnabled: !!env.authApiKey,
    banners: bannerSlots(),
  });
});

publicRoutes.get("/api/recent", (c) => {
  const rows = db
    .select({ address: claims.address, amountAtomic: claims.amountAtomic, txid: claims.txid, createdAt: claims.createdAt })
    .from(claims)
    .where(isNotNull(claims.txid))
    .orderBy(desc(claims.createdAt), desc(claims.id))
    .limit(10)
    .all();
  const now = nowSec();
  return c.json({
    claims: rows.map((r) => ({
      when: humanize(Math.max(now - r.createdAt, 0)),
      address: truncateMiddle(r.address),
      addressFull: r.address,
      txid: truncateTxid(r.txid ?? ""),
      txUrl: `${EXPLORER_TX}${r.txid}`,
      amountBnt: fmtBnt(r.amountAtomic),
    })),
  });
});

publicRoutes.get("/api/banner-img/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.notFound();
  const row = db.select({ imageUrl: banners.imageUrl }).from(banners).where(eq(banners.id, id)).get();
  if (!row) return c.notFound();
  const url = row.imageUrl;

  if (url.startsWith("/static/")) {
    const target = resolveStaticFile(url);
    if (!target) return c.notFound();
    const media = STATIC_MEDIA[path.extname(target).toLowerCase()] ?? "application/octet-stream";
    const data = readFileSync(target);
    return c.body(new Uint8Array(data), 200, {
      "content-type": media,
      "cache-control": "public, max-age=3600",
    });
  }

  // Remote image: stream through the faucet so it renders regardless of
  // hotlink/referrer policies at the origin (URLs are admin-controlled).
  try {
    const resp = await fetchWithTimeout(url, { headers: { "user-agent": "bnt-faucet" } }, 10000);
    if (resp.status !== 200) return c.text("gateway error", 502);
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length === 0) return c.text("gateway error", 502);
    const head = buf.subarray(0, 64);
    const meta = resp.headers.get("content-type") ?? "";
    let media: string | null = null;
    if (head.subarray(0, 4).toString("latin1") === "\x89PNG") media = "image/png";
    else if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) media = "image/jpeg";
    else if (["GIF87a", "GIF89a"].includes(head.subarray(0, 6).toString("latin1"))) media = "image/gif";
    else if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") media = "image/webp";
    else if (meta.split(";")[0]?.trim() === "image/svg+xml" || buf.subarray(0, 512).toString("latin1").toLowerCase().includes("<svg")) media = "image/svg+xml";
    else if (meta.startsWith("image/")) media = meta.split(";")[0]?.trim() ?? null;
    if (!media) return c.text("unsupported media type", 502);
    return c.body(new Uint8Array(buf), 200, {
      "content-type": media,
      "cache-control": "public, max-age=3600",
    });
  } catch {
    return c.text("gateway error", 502);
  }
});
