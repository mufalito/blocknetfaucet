import { fetchWithTimeout } from "./http.js";

/**
 * Cloudflare Turnstile siteverify (browser -> faucet -> Cloudflare).
 * Fail-closed on any error while a secret is configured; blank secret skips
 * the check entirely.
 */
export async function turnstileOk(token: string | undefined, ip: string, secret: string): Promise<boolean> {
  if (!secret) return true;
  try {
    const resp = await fetchWithTimeout(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token ?? "", remoteip: ip }),
      },
      5000,
    );
    const data = (await resp.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
