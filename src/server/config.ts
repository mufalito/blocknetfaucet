import dotenv from "dotenv";
import { parseBntAtomic } from "./lib/bnt.js";

dotenv.config({ quiet: true });

export interface Env {
  port: number;
  gatewayUrl: string; // no trailing slash
  payoutApiKey: string;
  authApiKey: string; // "" hides wallet sign-in
  adminPassword: string;
  ipHeader: string; // "" = socket peer address
  turnstileSitekey: string;
  turnstileSecret: string; // "" skips the captcha check
  amountBntSeed: string;
  dbFile: string; // sqlite file, relative to the repo root
}

function die(message: string): never {
  console.error(`faucet: ${message}`);
  process.exit(1);
}

/** Load and validate .env — exits with a clear message on bad config. */
export function loadEnv(): Env {
  const gatewayUrl = (process.env.GATEWAY_URL ?? "").trim().replace(/\/+$/, "");
  const payoutApiKey = (process.env.PAYOUT_API_KEY ?? "").trim();
  const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
  const amountBntSeed = (process.env.AMOUNT_BNT ?? "0.5").trim();

  if (!gatewayUrl) die(".env: GATEWAY_URL is blank — set it before running");
  if (!payoutApiKey) die(".env: PAYOUT_API_KEY is blank — set it before running");
  if (!adminPassword) die(".env: ADMIN_PASSWORD is blank — set it before running");
  if (parseBntAtomic(amountBntSeed) === null)
    die(`.env: cannot parse AMOUNT_BNT '${amountBntSeed}' as a positive BNT amount`);

  const port = Number(process.env.PORT ?? "8097");
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    die(`.env: PORT must be an integer 1-65535, got '${process.env.PORT}'`);

  return {
    port,
    gatewayUrl,
    payoutApiKey,
    authApiKey: (process.env.AUTH_API_KEY ?? "").trim(),
    adminPassword,
    ipHeader: (process.env.IP_HEADER ?? "").trim(),
    turnstileSitekey: (process.env.TURNSTILE_SITEKEY ?? "").trim(),
    turnstileSecret: (process.env.TURNSTILE_SECRET ?? "").trim(),
    amountBntSeed,
    dbFile: (process.env.DB_PATH ?? "").trim() || "faucet.db",
  };
}

/** Process-wide env (loaded+validated once at boot; exits on bad config). */
export const env: Env = loadEnv();
