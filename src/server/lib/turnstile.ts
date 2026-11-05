import { fetchWithTimeout } from "./http.js";

/**
 * Cloudflare Turnstile siteverify (browser -> faucet -> Cloudflare).
 * Fail-closed on any error while a secret is configured; blank secret skips
 * the check entirely.
 *
 * `remoteip` is deliberately NOT sent: behind a reverse proxy the peer
 * address is the proxy's, and a mismatched remoteip makes Cloudflare reject
 * an otherwise-valid token. The token already proves a solved challenge for
 * this sitekey; per-IP throttling happens in the drip pipeline itself.
 */
export async function turnstileOk(token: string | undefined, secret: string): Promise<boolean> {
  if (!secret) return true;
  try {
    const resp = await fetchWithTimeout(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token ?? "" }),
      },
      5000,
    );
    const data = (await resp.json()) as { success?: boolean; "error-codes"?: unknown };
    if (data.success !== true) {
      // Operator-facing trail: timeout-or-duplicate / invalid-input-secret /
      // invalid-input-response tell very different stories.
      console.warn(`faucet: turnstile rejected (HTTP ${resp.status}):`, JSON.stringify(data["error-codes"] ?? data));
    }
    return data.success === true;
  } catch {
    console.warn("faucet: turnstile siteverify unreachable");
    return false;
  }
}
