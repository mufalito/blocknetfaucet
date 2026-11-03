import { randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { env } from "../config.js";
import { db } from "../db/index.js";
import { claims, refCodes, referrals } from "../db/schema.js";
import { fmtBnt } from "../lib/bnt.js";
import { claimStats } from "../lib/claims.js";
import { clientIp } from "../lib/http.js";
import { isLockedOut, recordLoginFail, clearLoginFails } from "../lib/lockout.js";
import { authChallenge, authVerify } from "../lib/oalgopay.js";
import { getSettings } from "../lib/settings.js";
import { mintUserSession, USER_SESSION_TTL, userAddressFor, destroyUserToken } from "../lib/sessions.js";
import { fmtNext, humanize, nowSec, sleep } from "../lib/time.js";
import { EXPLORER_TX } from "../lib/explorer.js";


export const authRoutes = new Hono();

/** Fresh single-use challenge from the gateway's auth API. */
authRoutes.post("/api/auth/challenge", async (c) => {
  if (!env.authApiKey) return c.json({ error: "Sign-in is disabled" }, 404);
  const challenge = await authChallenge(env);
  if (!challenge) {
    return c.json({ error: "Sign-in is temporarily unavailable, try again shortly" }, 503);
  }
  return c.json(challenge);
});

authRoutes.post("/api/auth/verify", async (c) => {
  if (!env.authApiKey) return c.json({ error: "Sign-in is disabled" }, 404);

  // Lockout mirrors admin login: >=5 definite fails within 15 min from one
  // IP. The gateway runs its own lockout too, but keyed on the faucet's
  // egress IP (shared by every visitor) — this one isolates individual
  // abusers so they cannot burn the shared budget.
  const ip = clientIp(c, env.ipHeader);
  if (isLockedOut(ip)) return c.json({ error: "Too many attempts, try again later" }, 429);

  const body = (await c.req.json().catch(() => null)) as { nonce?: unknown; address?: unknown; signature?: unknown } | null;
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";

  // 1. Address shape prefilter (the gateway/node verify authoritatively).
  if (!(address.length >= 20 && address.length <= 160)) {
    return c.json({ error: "That doesn't look like a BNT address" }, 400);
  }

  // 2. Gateway verdict; its challenge store is single-use. On "infra"
  // nothing was consumed and the user may resubmit the same nonce.
  const verdict = await authVerify(env, nonce.trim(), address, signature.trim());
  if (verdict === "bad_challenge") return c.json({ error: "Challenge expired — reload the page" }, 400);
  if (verdict === "bad_input") return c.json({ error: "That doesn't look like a BNT address or a valid signature" }, 400);
  if (verdict === "locked") return c.json({ error: "Too many attempts, try again later" }, 429);
  if (verdict === "infra") {
    return c.json({ error: "Signature verification unavailable, try again shortly" }, 503);
  }

  // 3. Invalid signature counts toward the lockout.
  if (verdict === "invalid") {
    recordLoginFail(ip);
    await sleep(500);
    return c.json({ error: "Invalid signature — sign the exact challenge text" }, 401);
  }

  // 4. Valid signature -> session cookie (30 d).
  clearLoginFails(ip);
  const token = mintUserSession(address);
  setCookie(c, "faucet_user", token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: USER_SESSION_TTL,
  });
  return c.json({ address });
});

authRoutes.post("/api/auth/signout", (c) => {
  destroyUserToken(getCookie(c, "faucet_user") ?? "");
  deleteCookie(c, "faucet_user", { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/api/me", (c) => {
  const address = userAddressFor(getCookie(c, "faucet_user") ?? "");
  if (!address) return c.json({ error: "Not signed in" }, 401);
  return c.json({ address });
});

authRoutes.get("/api/me/dashboard", (c) => {
  const address = userAddressFor(getCookie(c, "faucet_user") ?? "");
  if (!address) return c.json({ error: "Not signed in" }, 401);
  const now = nowSec();
  const s = getSettings();
  const cooldownS = Number.parseInt(s["cooldown_hours"] ?? "", 10) * 3600 || 0;

  const history = db
    .select({ amountAtomic: claims.amountAtomic, txid: claims.txid, error: claims.error, createdAt: claims.createdAt })
    .from(claims)
    .where(eq(claims.address, address))
    .orderBy(desc(claims.createdAt), desc(claims.id))
    .all()
    .map((r) => ({
      when: humanize(Math.max(now - r.createdAt, 0)),
      amountBnt: fmtBnt(r.amountAtomic),
      txid: r.txid ? (r.txid.length > 12 ? `${r.txid.slice(0, 12)}…` : r.txid) : "",
      txUrl: r.txid ? `${EXPLORER_TX}${r.txid}` : "",
      error: (r.error ?? "").slice(0, 80),
    }));

  const total = db
    .select({
      count: sql<number>`count(*)`,
      sum: sql<number>`coalesce(sum(amount_atomic), 0)`,
      last: sql<number | null>`max(created_at)`,
    })
    .from(claims)
    .where(and(eq(claims.address, address), isNotNull(claims.txid)))
    .get();
  const remaining = total?.last != null ? Math.max(cooldownS - (now - total.last), 0) : 0;

  // Referral code: one per address, minted lazily on first dashboard view.
  let code = db.select({ code: refCodes.code }).from(refCodes).where(eq(refCodes.address, address)).get()?.code;
  if (!code) {
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      const candidate = randomBytes(5).toString("hex");
      try {
        db.insert(refCodes).values({ code: candidate, address, createdAt: now }).run();
        code = candidate;
      } catch {
        /* code collision or a racing request for this address — retry */
      }
    }
    code ??= db.select({ code: refCodes.code }).from(refCodes).where(eq(refCodes.address, address)).get()?.code;
  }
  const minClaims = Math.min(Math.max(Number.parseInt(s["referral_min_claims"] ?? "", 10) || 2, 1), 10);
  const minSpanSec = Math.min(Math.max(Number.parseInt(s["referral_min_span_hours"] ?? "", 10) || 48, 1), 2160) * 3600;
  const referees = db
    .select({ address: referrals.referee, createdAt: referrals.createdAt })
    .from(referrals)
    .where(eq(referrals.referrer, address))
    .orderBy(desc(referrals.createdAt), desc(referrals.id))
    .all()
    .map((r) => {
      const st = claimStats(r.address);
      const span = st.lastAt - st.firstAt;
      return {
        address: r.address,
        when: humanize(Math.max(now - r.createdAt, 0)),
        qualified: st.claims >= minClaims && span >= minSpanSec,
      };
    });

  const origin = new URL(c.req.url).origin;
  return c.json({
    address,
    history,
    stats: {
      claims: total?.count ?? 0,
      totalBnt: fmtBnt(total?.sum ?? 0),
      next: fmtNext(remaining),
    },
    referral: code ? { code, refLink: `${origin}/?ref=${code}`, referees, minClaims, minSpanHours: minSpanSec / 3600 } : null,
  });
});
