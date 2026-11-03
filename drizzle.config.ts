import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  dbCredentials: { url: process.env.DB_PATH?.trim() || "./faucet.db" },
});
