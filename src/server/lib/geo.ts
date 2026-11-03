import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { geoCache } from "../db/schema.js";
import { fetchWithTimeout } from "./http.js";
import { nowSec } from "./time.js";

const GEO_CACHE_TTL = 86400; // seconds a geo_cache row stays fresh

export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) {
    return true;
  }
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (Number.isInteger(second)) return 16 <= second && second <= 31;
  }
  return false;
}

/**
 * Country code via ip-api.com with a 24 h cache.
 * Private/local nets -> "PR" (never looked up, never blocked).
 * Any failure -> "XX" (fail-open: in no block list, never cached).
 */
export async function geoCountry(ip: string): Promise<string> {
  if (isPrivateIp(ip)) return "PR";
  const n = nowSec();
  const row = db.select().from(geoCache).where(eq(geoCache.ip, ip)).get();
  if (row && n - row.lookedAt < GEO_CACHE_TTL) return row.country;

  let data: { status?: string; countryCode?: string };
  try {
    const resp = await fetchWithTimeout(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
      {},
      5000,
    );
    data = (await resp.json()) as { status?: string; countryCode?: string };
  } catch {
    return "XX";
  }
  if (data?.status !== "success") return "XX";
  const country = String(data.countryCode ?? "").toUpperCase();
  if (country.length !== 2) return "XX";

  db.insert(geoCache)
    .values({ ip, country, lookedAt: n })
    .onConflictDoUpdate({ target: geoCache.ip, set: { country, lookedAt: n } })
    .run();
  return country;
}
