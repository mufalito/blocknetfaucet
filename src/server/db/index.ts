import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../config.js";
import * as schema from "./schema.js";

/** Repo root (…/faucet). Works under tsx (src/server/db) and tsc (dist/server/db). */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const dbPath = path.isAbsolute(env.dbFile) ? env.dbFile : path.join(ROOT_DIR, env.dbFile);
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
