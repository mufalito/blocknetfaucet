import { createHash } from "node:crypto";
import type { Env } from "../config.js";
import { fetchWithTimeout } from "./http.js";

/** "faucet:<sha256(addr)[:32]>:<UTC YYYYMMDD>" — one payout per address per day. */
export function dripIdempotencyKey(address: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const addrHash = createHash("sha256").update(address).digest("hex").slice(0, 32);
  return `faucet:${addrHash}:${day}`;
}

export type PayoutResult =
  | { kind: "ok"; txid: string }
  | { kind: "network_error" } // gateway unreachable
  | { kind: "http"; status: number; body: string }; // reached, non-201

/** POST a payout (drip or referral reward). Amount travels as a string
 * (exact decimal). */
export async function requestPayout(
  env: Env,
  address: string,
  amountBnt: string,
  idempotencyKey: string,
  memo = "faucet drip",
): Promise<PayoutResult> {
  try {
    const resp = await fetchWithTimeout(
      `${env.gatewayUrl}/api/v1/payouts`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.payoutApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          address,
          amount_bnt: amountBnt,
          memo,
          idempotency_key: idempotencyKey,
        }),
      },
      15000,
    );
    if (resp.status === 201) {
      const data = (await resp.json().catch(() => ({}))) as { txid?: unknown };
      return { kind: "ok", txid: String(data.txid ?? "") };
    }
    return { kind: "http", status: resp.status, body: await resp.text().catch(() => "") };
  } catch {
    return { kind: "network_error" };
  }
}

export interface Challenge {
  message: string;
  nonce: string;
}

/** Mint a single-use sign-in challenge. null = gateway unreachable or key
 * rejected — surface as a temporary outage; nothing is stored locally. */
export async function authChallenge(env: Env): Promise<Challenge | null> {
  try {
    const resp = await fetchWithTimeout(
      `${env.gatewayUrl}/api/v1/auth/challenge`,
      { method: "POST", headers: { authorization: `Bearer ${env.authApiKey}` } },
      5000,
    );
    if (resp.status !== 200) return null;
    const data = (await resp.json().catch(() => null)) as { nonce?: unknown; message?: unknown } | null;
    if (!data || typeof data.nonce !== "string" || typeof data.message !== "string") return null;
    return { message: data.message, nonce: data.nonce };
  } catch {
    return null;
  }
}

export type VerifyVerdict =
  | "ok"
  | "invalid" // definite bad signature — counts toward lockout
  | "bad_challenge" // unknown/used/expired — request a new one
  | "bad_input" // hygiene bounds, never reached the node
  | "locked" // gateway lockout for our egress IP is burned
  | "infra"; // no verdict; the challenge stays usable and nothing is counted

/** Gateway verdict for a challenge signature. A 401 here can only be a
 * node-validated signature failure: a bad auth key already fails at
 * challenge-mint time, so the form never renders. */
export async function authVerify(env: Env, nonce: string, address: string, signature: string): Promise<VerifyVerdict> {
  try {
    const resp = await fetchWithTimeout(
      `${env.gatewayUrl}/api/v1/auth/verify`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.authApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ nonce, address, signature }),
      },
      5000,
    );
    if (resp.status === 200) {
      const data = (await resp.json().catch(() => null)) as { verified?: boolean } | null;
      if (!data) return "infra";
      return data.verified === true ? "ok" : "invalid";
    }
    if (resp.status === 401) return "invalid";
    if (resp.status === 400) return "bad_challenge";
    if (resp.status === 422) return "bad_input";
    if (resp.status === 429) return "locked";
    return "infra"; // 403/5xx/unexpected: nothing consumed, retry allowed
  } catch {
    return "infra";
  }
}
