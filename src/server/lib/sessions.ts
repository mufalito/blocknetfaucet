import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminSessions, userSessions } from "../db/schema.js";
import { nowSec } from "./time.js";

export const ADMIN_SESSION_TTL = 86400; // admin session lifetime
export const USER_SESSION_TTL = 30 * 86400; // wallet sign-in session lifetime

/** Mint a fresh admin session token (43-char base64url, 32 random bytes). */
export function mintAdminToken(): string {
  const token = randomBytes(32).toString("base64url");
  db.insert(adminSessions).values({ token, createdAt: nowSec() }).run();
  return token;
}

/** Valid admin token? Lazy-expires the whole table past TTL. */
export function adminTokenValid(token: string): boolean {
  if (!token) return false;
  const row = db.select().from(adminSessions).where(eq(adminSessions.token, token)).get();
  if (!row) return false;
  if (nowSec() - row.createdAt > ADMIN_SESSION_TTL) {
    db.delete(adminSessions).where(lt(adminSessions.createdAt, nowSec() - ADMIN_SESSION_TTL)).run();
    return false;
  }
  return true;
}

export function destroyAdminToken(token: string): void {
  if (token) db.delete(adminSessions).where(eq(adminSessions.token, token)).run();
}

/** Mint a wallet sign-in session for an address. */
export function mintUserSession(address: string): string {
  const token = randomBytes(32).toString("base64url");
  db.insert(userSessions).values({ token, address, createdAt: nowSec() }).run();
  return token;
}

/** Signed-in address for a token, or null (lazily expired). */
export function userAddressFor(token: string): string | null {
  if (!token) return null;
  const row = db.select().from(userSessions).where(eq(userSessions.token, token)).get();
  if (!row) return null;
  if (nowSec() - row.createdAt > USER_SESSION_TTL) {
    db.delete(userSessions).where(lt(userSessions.createdAt, nowSec() - USER_SESSION_TTL)).run();
    return null;
  }
  return row.address;
}

export function destroyUserToken(token: string): void {
  if (token) db.delete(userSessions).where(eq(userSessions.token, token)).run();
}
