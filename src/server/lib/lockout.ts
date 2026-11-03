import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { loginFails } from "../db/schema.js";
import { nowSec } from "./time.js";

export const LOGIN_WINDOW = 900; // fail-counting window, seconds
export const MAX_LOGIN_FAILS = 5;

/** >= MAX_LOGIN_FAILS definite fails within LOGIN_WINDOW from one IP? */
export function isLockedOut(ip: string): boolean {
  const row = db.select().from(loginFails).where(eq(loginFails.ip, ip)).get();
  return !!row && row.fails >= MAX_LOGIN_FAILS && nowSec() - row.windowStart < LOGIN_WINDOW;
}

/** Count one definite failure; a fresh window resets the counter. */
export function recordLoginFail(ip: string): void {
  const n = nowSec();
  const row = db.select().from(loginFails).where(eq(loginFails.ip, ip)).get();
  if (row && n - row.windowStart < LOGIN_WINDOW) {
    db.update(loginFails).set({ fails: row.fails + 1 }).where(eq(loginFails.ip, ip)).run();
  } else {
    db.insert(loginFails)
      .values({ ip, fails: 1, windowStart: n })
      .onConflictDoUpdate({ target: loginFails.ip, set: { fails: 1, windowStart: n } })
      .run();
  }
}

export function clearLoginFails(ip: string): void {
  db.delete(loginFails).where(eq(loginFails.ip, ip)).run();
}
