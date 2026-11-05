# BNT Faucet

A Blocknet (BNT) faucet: visitors claim small amounts of BNT, sign in with
their wallet to track history and referrals, and the operator manages
everything (settings, bans, banners, referral rewards) from a built-in admin
panel. Payouts run through the [oalgopay](https://pay.oalgo.space) gateway;
wallet sign-in uses its auth API.

Built with **Hono** (REST JSON API) + **React/Vite** SPA + **Drizzle ORM** on
SQLite + **Tailwind CSS**. Node 22+, one npm package, no external services
beyond the gateway.

## Stack

| Layer     | Choice |
|-----------|--------|
| Server    | Hono v4 on `@hono/node-server`, TypeScript strict, ESM |
| Client    | React 18 SPA (`client/`), built by Vite to `dist/client`, served same-origin by the API (history fallback) |
| DB        | Drizzle ORM + better-sqlite3, schema in `src/server/db/schema.ts`, SQL migrations in `drizzle/` applied at boot |
| Styling   | Tailwind CSS 3.4 via Vite + PostCSS (no separate CLI build) |

Runtime: **Node 22+** and npm. Dev uses `tsx`; prod runs the compiled
`dist/server` (`npm run build && npm start`).

## Setup

```sh
cp .env.example .env   # fill in the keys
npm install
npm run db:generate    # only when the schema changed (migrations ship in ./drizzle)
npm run build          # tsc (server) + vite (client)
npm start              # serves API + SPA on http://0.0.0.0:$PORT
```

Development with hot reload:

```sh
npm run dev            # API via tsx watch (uses .env PORT) + Vite on :5173
                       # (Vite proxies /api to the API port)
```

### Docker (optional)

```sh
cp .env.example .env   # fill in the keys
docker compose up -d --build
```

The image builds the server + client, keeps only production dependencies,
and runs the compiled app. SQLite lives on the `faucet-data` volume
(`DB_PATH=/data/faucet.db`), so claims, settings, banners, and referral
ledger survive rebuilds. Migrations + seeding run automatically at boot; a
`HEALTHCHECK` pings `/api/config`. Plain Docker without compose:

```sh
docker build -t bnt-faucet .
docker volume create faucet-data
docker run -d --name faucet -p 8097:8097 --env-file .env \
  -e DB_PATH=/data/faucet.db -v faucet-data:/data bnt-faucet
```

IP note: behind a reverse proxy, set `IP_HEADER` (e.g. `X-Forwarded-For`) so
bans/geo/cooldowns see real client IPs; exposed directly, they use the socket
peer address.

The boot sequence validates `.env` (exits with a clear message on missing
keys), applies `drizzle/` migrations, and idempotently seeds default settings.
Banners are **not** seeded — they are purely admin-managed (add via an
`http(s)://` URL such as imgur, or any `/static/…` path). Deleting a banner in
the panel sticks across restarts.

## Environment

| Key                | Default     | Meaning |
|--------------------|-------------|---------|
| `PORT`             | `8097`      | Listen port |
| `DB_PATH`          | `faucet.db` | SQLite file (relative to repo root) |
| `GATEWAY_URL`      | —           | oalgopay base URL, **required** |
| `PAYOUT_API_KEY`   | —           | Payouts API key, **required non-empty** |
| `AUTH_API_KEY`     | `""`        | Auth API key — blank **hides** wallet sign-in |
| `ADMIN_PASSWORD`   | —           | Admin panel password, **required** |
| `IP_HEADER`        | `""`        | Reverse-proxy IP header (e.g. `X-Forwarded-For`). **Blank when directly exposed** — otherwise clients can spoof their IP |
| `TURNSTILE_SITEKEY`| `""`        | Cloudflare Turnstile sitekey |
| `TURNSTILE_SECRET` | `""`        | Blank **disables** captcha verification; set = fail-closed |
| `AMOUNT_BNT`       | `0.5`       | First-boot seed for the amount setting |

## REST API

All JSON, cookies `HttpOnly; SameSite=Lax`, errors as `{"error": string}`.

### Public
- `GET /api/config` — settings + active banners grouped by slot (`top`/`grid`/`sidebar`/`bottom`)
- `GET /api/recent` — last 10 successful claims, newest first
- `GET /api/banner-img/:id` — banner image (local `/static/…` confined to `static/`, else server-side proxy with media sniffing)
- `GET /api/ref/:code` — referral landing: stashes a 30-d `faucet_ref` cookie for 10-hex codes
- `POST /api/drip` `{ address, turnstileToken? }` — the claim pipeline: shape → IP ban → address ban → geo (fail-open, private IPs exempt) → settings sanity → per-address cooldown → per-IP cooldown → 24 h global cap → Turnstile (fail-closed when secret set) → payout. Every gateway-reached payout leaves a `claims` audit row; pre-payout rejections leave none.

### Wallet sign-in (hidden while `AUTH_API_KEY` blank)
- `POST /api/auth/challenge` / `POST /api/auth/verify` `{ nonce, address, signature }` — proxied to the gateway auth API, with local per-IP lockout (5 definite fails / 15 min, shared with admin login)
- `POST /api/auth/signout`, `GET /api/me`, `GET /api/me/dashboard` (history, stats, lazily-minted referral code)

### Admin (`faucet_admin` cookie, 24 h)
- `POST /api/admin/login` / `POST /api/admin/logout` — lockout + constant-time compare
- `GET /api/admin/overview` — stats, settings, last 50 claims (with IP), bans, banners
- `PATCH /api/admin/settings` — `amountBnt`, `cooldownHours` (1–720), `dailyCapBnt`, `blockedCountries` (uppercase ISO CSV or `""`), `donationAddress`, `referralMinClaims`, `referralMinSpanHours`, `referralRewardBnt`; per-field validation, live on the next request
- `POST /api/admin/bans` / `DELETE /api/admin/bans/:id`
- `POST /api/admin/banners` (dims parsed from the image; `/static/…` confined, `http(s)://` fetched), `PATCH /api/admin/banners/:id` `{ slot }`, `POST …/toggle`, `DELETE …/:id`
- `GET /api/admin/referrals` — per-referrer qualification report (see below)
- `POST /api/admin/referrals/pay` `{ referrer }` — one-click batch reward (see below)

### Referral program (admin)

Referrals are track-only for users. The admin Referrals tab reports per
referee qualification — `referral_min_claims` (default 2) successful claims
spanning at least `referral_min_span_hours` (default 48) — plus same-IP flags
(a referee whose claims share an IP with the referrer). Thresholds and the
`referral_reward_bnt` rate (default 0.02) are settings, editable live; the UI
shows the reward relative to the per-claim amount so tuning stays sober. The
user dashboard explains the same rules (steps + per-referee qualified/pending
status) without exposing reward amounts or payment timing.

"Pay N · X BNT" sends **one** gateway payout (memo `referral reward`) for a
referrer's qualified & unpaid referees and records them in the
`referral_payouts` ledger (unique per referee — every referral is payable
exactly once, ever). The payout idempotency key hashes the referee set, so a
retry after a lost gateway response replays safely instead of double-sending,
while a changed set pays fresh. Nothing is automatic; every payout follows an
admin click.

## Banner slots

`banner_slot(w, h)`: unknown dims → grid; aspect ≥ 3 → `bottom` when ≥ 900 px
wide else `top`; aspect < 0.75 → `sidebar`; else `grid`. An admin-set `slot`
always wins over the shape-derived one.

## Ops notes

- BNT amounts are strings in JSON and atomic integers (1 BNT = 10⁸) in the DB; timestamps are epoch seconds.
- Geo lookup uses ip-api.com with a 24 h cache; any failure resolves `XX` (never blocked). Private IPs resolve `PR`.
- The daily cap counts successful claims in the trailing 24 h against `daily_cap_bnt`.
- Payout idempotency key: `faucet:<sha256(addr)[:32]>:<UTC YYYYMMDD>` — one payout attempt per address per day at the gateway.
- `faucet.db*` and `.env` are git-ignored. Nothing here commits secrets.
