import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Every timestamp column is integer epoch seconds (portable across SQLite/Postgres). */

export const claims = sqliteTable(
  "claims",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    address: text("address").notNull(),
    amountAtomic: integer("amount_atomic").notNull(),
    txid: text("txid"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
    ip: text("ip"),
  },
  (t) => [index("idx_claims_address_time").on(t.address, t.createdAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const bans = sqliteTable(
  "bans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(), // 'address' | 'ip'
    value: text("value").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("uq_bans_kind_value").on(t.kind, t.value)],
);

export const banners = sqliteTable("banners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  width: integer("width"),
  height: integer("height"),
  slot: text("slot").notNull().default("auto"),
});

export const geoCache = sqliteTable("geo_cache", {
  ip: text("ip").primaryKey(),
  country: text("country").notNull(),
  lookedAt: integer("looked_at").notNull(),
});

export const adminSessions = sqliteTable("admin_sessions", {
  token: text("token").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const loginFails = sqliteTable("login_fails", {
  ip: text("ip").primaryKey(),
  fails: integer("fails").notNull(),
  windowStart: integer("window_start").notNull(),
});

export const userSessions = sqliteTable("user_sessions", {
  token: text("token").primaryKey(),
  address: text("address").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const refCodes = sqliteTable(
  "ref_codes",
  {
    code: text("code").primaryKey(),
    address: text("address").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("uq_ref_codes_address").on(t.address)],
);

export const referrals = sqliteTable(
  "referrals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referrer: text("referrer").notNull(),
    referee: text("referee").notNull(),
    createdAt: integer("created_at").notNull(),
    /** Non-null = admin-approved, qualifies regardless of claim stats. */
    approvedAt: integer("approved_at"),
  },
  (t) => [uniqueIndex("uq_referrals_referee").on(t.referee)],
);

/** Paid-once ledger: one row per referee ever rewarded. */
export const referralPayouts = sqliteTable(
  "referral_payouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referrer: text("referrer").notNull(),
    referee: text("referee").notNull(),
    paidAt: integer("paid_at").notNull(),
    txid: text("txid").notNull(),
  },
  (t) => [uniqueIndex("uq_referral_payouts_referee").on(t.referee)],
);
