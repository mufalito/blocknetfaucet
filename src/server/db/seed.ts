import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Env } from "../config.js";
import { db, ROOT_DIR } from "./index.js";
import { settings } from "./schema.js";

/** Apply the generated SQL migrations shipped in ./drizzle. */
export function migrateDb(): void {
  migrate(db, { migrationsFolder: path.join(ROOT_DIR, "drizzle") });
}

/** Idempotent boot seeding: default settings only. Banners are NOT seeded —
 * they are purely admin-managed (http(s):// URL or a /static/… path), so
 * deleting one in the panel sticks across restarts. */
export function seed(env: Env): void {
  db.insert(settings)
    .values([
      { key: "amount_bnt", value: env.amountBntSeed },
      { key: "cooldown_hours", value: "24" },
      { key: "daily_cap_bnt", value: "5" },
      { key: "blocked_countries", value: "IN,NG" },
      { key: "donation_address", value: "" },
      { key: "referral_min_claims", value: "2" },
      { key: "referral_min_span_hours", value: "48" },
      { key: "referral_reward_bnt", value: "0.02" },
    ])
    .onConflictDoNothing()
    .run();
}
