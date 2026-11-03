import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { claims } from "../db/schema.js";

/** Successful-claim stats for one address: count, first/last seen, IPs used. */
export function claimStats(address: string): { claims: number; firstAt: number; lastAt: number; ips: string[] } {
  const row = db
    .select({
      count: sql<number>`count(*)`,
      firstAt: sql<number | null>`min(created_at)`,
      lastAt: sql<number | null>`max(created_at)`,
    })
    .from(claims)
    .where(and(eq(claims.address, address), isNotNull(claims.txid)))
    .get();
  const ips = db
    .selectDistinct({ ip: claims.ip })
    .from(claims)
    .where(and(eq(claims.address, address), isNotNull(claims.txid)))
    .all()
    .map((r) => r.ip ?? "")
    .filter((ip) => ip !== "");
  return { claims: row?.count ?? 0, firstAt: row?.firstAt ?? 0, lastAt: row?.lastAt ?? 0, ips };
}
