import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { env } from "./config.js";
import { ROOT_DIR } from "./db/index.js";
import { migrateDb, seed } from "./db/seed.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { dripRoute } from "./routes/drip.js";
import { publicRoutes } from "./routes/public.js";

// Boot: apply migrations + idempotent seed (exits on bad env before this).
migrateDb();
seed(env);

const app = new Hono();

// JSON errors everywhere; the server never exits per-request.
app.onError((err, c) => {
  console.error(err);
  if (c.req.path.startsWith("/api/")) return c.json({ error: "internal error" }, 500);
  return c.text("internal error", 500);
});

// API-wide no-store — registered BEFORE the routes so it wraps them; keeps
// banner-img's own cache-control when it sets one.
app.use("/api/*", async (c, next) => {
  await next();
  if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
});

app.route("/", publicRoutes);
app.route("/", dripRoute);
app.route("/", authRoutes);
app.route("/", adminRoutes);

// Referral landing: stash a well-formed ?ref= code (30 d) for the drip hook.
// Unknown codes pass the shape check but simply never match at claim time.
app.get("/api/ref/:code", (c) => {
  const code = c.req.param("code");
  if (/^[0-9a-f]{10}$/.test(code)) {
    setCookie(c, "faucet_ref", code, { path: "/", httpOnly: true, sameSite: "Lax", maxAge: 30 * 86400 });
  }
  return c.body(null, 204);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
  return c.text("not found", 404);
});

// Bundled creatives (and any admin-uploaded /static/… banner paths).
app.use("/static/*", serveStatic({ root: "./static", rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));

// Prod SPA: built client + history fallback for deep links.
const clientIndex = path.join(ROOT_DIR, "dist/client/index.html");
app.use("*", serveStatic({ root: "./dist/client" }));
app.get("*", (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
  if (!existsSync(clientIndex)) return c.text("client not built — run npm run build", 404);
  return c.html(readFileSync(clientIndex, "utf8"));
});

serve({ fetch: app.fetch, port: env.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`faucet: listening on http://0.0.0.0:${info.port} (db: ${env.dbFile})`);
});
