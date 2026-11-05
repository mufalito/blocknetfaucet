import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { fetchWithTimeout } from "./http.js";

/** blocknet.id handle resolution (same contract as oalgopay's resolve_handle):
 * the resolver envelope is only trusted after its Ed25519 signature verifies
 * against the service's well-known signing pubkey. */

const RESOLVER_BASE = "https://blocknet.id/api/v1/resolve";
const WELL_KNOWN_URL = "https://blocknet.id/.well-known/blocknet-id.json";
const RESOLVE_TTL_MS = 60_000; // mirrors the service's ttl_default
const PUBKEY_TTL_MS = 3_600_000;
const FETCH_TIMEOUT_MS = 8_000;

// Raw 32-byte Ed25519 public key -> SPKI DER (fixed ASN.1 prefix).
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// Handle charset: 1-63 chars, [a-z0-9-], no leading/trailing hyphen.
const HANDLE_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export type HandleResolution =
  | { kind: "ok"; handle: string; address: string }
  | { kind: "not_found" } // resolver says the name is unregistered
  | { kind: "unverified" } // resolver answered; signature/envelope checks failed
  | { kind: "unreachable" }; // network/HTTP failure

/** Is this claim input a blocknet.id name rather than a BNT address?
 * "$name" is explicit; a bare name only counts while too short to collide
 * with the 20+-char address shape check. */
export function parseHandleInput(input: string): string | null {
  if (input.startsWith("$")) {
    const h = input.slice(1);
    return HANDLE_RE.test(h) ? h : null;
  }
  return input.length < 20 && HANDLE_RE.test(input) ? input : null;
}

interface Envelope {
  address?: unknown;
  payload?: unknown;
  sig?: unknown;
  updated_at?: unknown;
}

let cachedKey: { expiresAt: number; key: KeyObject } | null = null;

async function signingKey(): Promise<KeyObject | null> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.key;
  let b64 = "";
  try {
    const resp = await fetchWithTimeout(WELL_KNOWN_URL, {}, FETCH_TIMEOUT_MS);
    if (!resp.ok) return null;
    const wellKnown = (await resp.json()) as { signing_pubkey?: unknown };
    b64 = String(wellKnown.signing_pubkey ?? "");
  } catch {
    return null;
  }
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) return null;
  const key = createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
  cachedKey = { expiresAt: Date.now() + PUBKEY_TTL_MS, key };
  return key;
}

const cache = new Map<string, { expiresAt: number; res: HandleResolution }>();

/** Resolve a blocknet.id handle (no "$"). Results — including failures — are
 * cached for the service TTL to keep claim spam off the resolver. */
export async function resolveHandle(handle: string): Promise<HandleResolution> {
  const hit = cache.get(handle);
  if (hit && hit.expiresAt > Date.now()) return hit.res;

  let res: HandleResolution;
  let envelope: Envelope;
  try {
    const resp = await fetchWithTimeout(`${RESOLVER_BASE}/${encodeURIComponent(handle)}`, {}, FETCH_TIMEOUT_MS);
    if (resp.status === 404) {
      res = { kind: "not_found" };
      cache.set(handle, { expiresAt: Date.now() + RESOLVE_TTL_MS, res });
      return res;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    envelope = (await resp.json()) as Envelope;
  } catch {
    res = { kind: "unreachable" };
    cache.set(handle, { expiresAt: Date.now() + RESOLVE_TTL_MS, res });
    return res;
  }

  res = (await verifyEnvelope(handle, envelope)) ?? { kind: "unverified" };
  cache.set(handle, { expiresAt: Date.now() + RESOLVE_TTL_MS, res });
  return res;
}

/** Full oalgopay-parity checks; null = any mismatch. */
async function verifyEnvelope(handle: string, env: Envelope): Promise<HandleResolution | null> {
  if (typeof env.payload !== "string" || typeof env.sig !== "string" || typeof env.address !== "string") return null;
  const key = await signingKey();
  if (!key) return null;
  const sig = Buffer.from(env.sig, "base64");
  if (sig.length !== 64) return null;
  try {
    // Signature covers the payload string's exact bytes.
    if (!verify(null, Buffer.from(env.payload, "utf8"), key, sig)) return null;
    const payload = JSON.parse(env.payload) as { handle?: unknown; address?: unknown; updated_at_unix?: unknown };
    if (payload.handle !== handle) return null;
    if (payload.address !== env.address) return null;
    if (payload.updated_at_unix !== env.updated_at) return null;
    if (typeof env.address !== "string" || env.address.length === 0) return null;
    return { kind: "ok", handle, address: env.address };
  } catch {
    return null;
  }
}
