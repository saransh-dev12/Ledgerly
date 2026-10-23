# Roviel

**Give every currency a direction.** A full-stack, multi-currency finance tracker: a cinematic public landing page, a live reference-rate converter, and an authenticated ledger with accounts, budgets, goals, recurring rules and evidence-based insights.

Built as a portfolio-grade backend project — Express + TypeScript + PostgreSQL + Prisma in front, a dependency-free design system in the browser.

**Live:** [roviel.vercel.app](https://roviel.vercel.app) · [API health](https://ledgerly-api-4yhc.onrender.com/health) — demo login `demo@ledgerly.app` / `ledgerly123`.

> The API runs on Render's free tier and sleeps after 15 minutes idle, so the first request can take ~30 seconds. Cloud mode wakes it; the offline demo is instant.

---

## What it does

| Surface | Highlights |
| --- | --- |
| **Landing** | Scroll-snapped story (one scroll = one section), WebGL coin scene with a graceful no-WebGL fallback, custom cursor, interface sounds, reduced-motion support. |
| **Public converter** | 165+ currencies, dated reference rates, inverse rate, stale/offline states with a dated cache, popular pairs, favourites, recents, copy & share. |
| **Quote comparator** | Enter a provider quote + fixed/percentage/tax fees; exact `BigInt` minor-unit maths with per-currency rounding. The reference rate is **never** auto-filled into the provider field. |
| **Dashboard** | 8 dedicated views: Overview, Transactions, Accounts, Budgets, Goals, Recurring, Insights, Currency pulse. Pulse includes a 30-day accessible rate chart with high/low, observation date, source, freshness and keyboard/pointer inspection. |
| **Cloud mode** | JWT auth with expiring sessions, single-use email password recovery, multi-currency accounts, atomic transfers with FX capture, budgets with burn-down bars, goals with contributions plus edit/delete, recurring rules you can post in one tap, CSV export of the full ledger with currency-native precision, deterministic insights. |
| **Offline-first** | The anonymous demo keeps working with no API — localStorage ledger, local analytics, and an explicit "local demo" state. |

## Architecture

```
Browser (Vite, zero-framework UI)
  ├── index.html            landing + dashboard + converter (vanilla JS, ES modules)
  ├── public/roviel-api.js thin API client (additive; demo works without it)
  ├── e2e/run.mjs           Playwright suite (112 checks, real browser)
  └── server/test/          Vitest money/maths unit tests (JPY, KWD, fees)
        │  HTTPS + Bearer JWT
        ▼
Express API (TypeScript)
  ├── routes: auth · accounts · transactions · finance · fx · insights
  ├── middleware: requireAuth (JWT → userId), rate limit, helmet, CORS, zod validation
  └── lib: money (BigInt minor units) · fx (Frankfurter + wide-coverage fallback, cached in Postgres)
        │  Prisma ORM
        ▼
PostgreSQL — 10 tables, user-scoped by userId on every query
```

**Design rules that hold everywhere**

- Money is stored as **integer minor units + ISO currency** (`amountMinor`, `currency`). Never floats.
- Original amounts and the reporting rate are stored together without rewriting either (`amountMinor`, `currency`, `rateToHome`).
- Transfers are **atomic** (`prisma.$transaction`) and both legs are linked, so a linked transfer can never be half-deleted.
- Every query is filtered by `userId` — user isolation is enforced in the data layer, not the UI.
- The frontend never touches the database, and the API never trusts client-supplied amounts or account ids.

## Design system

Roviel ships **two complete, switchable themes** — one design language applied to the landing page, the dashboard, the converter and every popup. The active theme is stored in `localStorage` and applied via `data-theme` on `<html>`; the toggle in the header switches instantly (the WebGL scene is rebuilt with the matching palette).

| Theme | Character |
| --- | --- |
| **Neo-Brutalist Cream** (default) | Paper `#f2efe6` + ink `#16130f` + electric cobalt `#2b3df0`. Square corners, 2px borders, hard offset shadows, Archivo 800 headlines, Inter body, IBM Plex Mono for every number. |
| **Terminal Noir** | Near-black `#08090b` + acid lime `#c6f432`. Hairline cards, glow accents, Space Grotesk headings, mono labels, lime chart line and coin rim. |

Shared across both: one type scale (display / body / mono), one spacing rhythm, one motion language (staggered rise-in per view, animated progress bars, reduced-motion support), and the same component set — cards, buttons, inputs, tabs, tables, pills, bars, modals, toasts.

## Run it locally

```sh
# 1. Database
docker compose up -d db          # Postgres 16 on :5432

# 2. API  (http://localhost:4000)
cd server
cp .env.example .env             # set DATABASE_URL + a long JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed                     # demo@ledgerly.app / ledgerly123
npm run dev

# 3. Frontend (http://localhost:5173)
npm install && npm run dev
```

Open <http://localhost:5173>. Use the public converter without an account; sign in for cloud sync.

## Testing

```sh
npm run test:unit     # minor-unit maths: JPY (1), KWD (1000), fees
npm run test:e2e      # reseeds the demo, then runs 112 Playwright checks
npm run smoke:prod    # web, API/DB health, FX freshness and auth boundary
npm run lint          # oxlint
```

The E2E suite drives a real Chromium instance and asserts exact values rather than labels. It also covers password-reset form states and non-enumerating forgot-password responses; the API integration suite exercises reset expiry, single-use tokens, session revocation and signed-in password changes. A ₹250 expense must raise spending by exactly ₹250, a ₹2,000 budget must report a ₹2,000 limit and 0% spend, a ₹1,000 goal contribution must move the saved amount by ₹1,000, a transfer of ₹100 must debit the source by ₹100, conversions and quotes are compared against the displayed rate, and chart months are checked against `/api/summary`. It also covers landing scroll-snap, auth, every dashboard view, budgets/goals/recurring creation and deletion, CSV export, mobile layout, and a fully-blocked-network offline pass. The suite reseeds the demo account first, so it is repeatable.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` · `/login` | Create account / sign in (bcrypt + JWT) |
| `POST` | `/api/auth/forgot-password` · `/reset-password` | Single-use, expiring email reset flow |
| `POST` | `/api/auth/change-password` | Change password and revoke other sessions |
| `GET` | `/api/auth/me` | Current user |
| `DELETE` | `/api/auth/account` | Delete account and all data |
| `GET/POST` | `/api/accounts` | Multi-currency accounts |
| `GET/POST` | `/api/transactions` | Ledger entries (filter by account, kind, date) |
| `PATCH/DELETE` | `/api/transactions/:id` | Correct or remove an entry (linked legs are protected) |
| `POST` | `/api/transactions/transfer` | Atomic cross-account transfer with FX capture |
| `PATCH/DELETE` | `/api/accounts/:id` | Rename or remove an empty account |
| `GET/POST/DELETE` | `/api/budgets` · `/api/budgets/:id` | Monthly limits |
| `GET/POST` | `/api/goals` · `/api/recurring` | Planning records |
| `PATCH/DELETE` | `/api/goals/:id` | Edit or remove a savings goal |
| `POST` | `/api/goals/:id/contribute` | Record a contribution |
| `POST` | `/api/recurring/:id/post` | Post a rule into the ledger and advance its next run |
| `PATCH` | `/api/auth/me` | Home currency, locale and display name |
| `GET` | `/api/fx/rate` · `/history` · `/currencies` | Reference rates (cached, stale-aware) |
| `POST` | `/api/fx/quote` | Server-side quote + fee breakdown |
| `GET` | `/api/summary?months=N` | Server-side totals, accounts, categories, months, budgets, goals |
| `GET` | `/api/insights` | Deterministic, evidence-backed summaries |

## Deployment

| Piece | Target | Config |
| --- | --- | --- |
| Frontend | Vercel | `vercel.json` |
| API | Render (Docker) | `render.yaml` |
| Database | Neon Postgres (free) | `server/prisma/migrations` |

Live URLs: web `https://roviel.vercel.app`, API `https://ledgerly-api-4yhc.onrender.com` (Render service `roviel-api`, Singapore, Docker, `rootDir: server`).

1. **Database** — create a free Neon Postgres project through the Vercel Marketplace (Singapore `sin1`) and use the **direct/unpooled** connection string for Render. Keep the pooled URL for serverless clients if one is added later. Run `prisma migrate deploy` and restore the latest dump before pointing production at it.
2. **API** — create a Render Docker web service with `rootDir: server`, health check `/health`, and env `DATABASE_URL` (Neon direct), `FRONTEND_URL` (comma-separated allow-list for the web origins), `APP_URL`, `JWT_SECRET`, plus `RESEND_API_KEY` and `EMAIL_FROM` when recovery email is enabled. The image installs OpenSSL 3 so Prisma's schema engine can run; the container executes `prisma migrate deploy` before starting the server. Auto-deploy is intentionally disabled on Render so database migrations are never triggered by an ordinary push.
3. **Frontend** — the Vercel project is linked locally (`.vercel/`, gitignored) and `VITE_API_URL` is set for Production and Preview. Deploy with `vercel --prod`, which rebuilds the bundle with the API URL baked in; the value takes precedence over `meta[name="roviel-api"]` and the localStorage override. The project is not connected to GitHub yet, so pushing alone does not deploy the frontend.
4. **Seed the demo** — `DATABASE_URL='<external-url>?sslmode=require' npm run db:seed`. The seed resets the demo user's data, so never point it at real users.

`FRONTEND_URL` is also the CORS allow-list: requests from other origins are rejected. Local development needs no env at all — the web app defaults to `http://localhost:4000` on localhost and keeps working offline in demo mode.

Operational notes: the Render web service sleeps after 15 minutes idle (cold start ~30s). Production now uses **Neon Postgres** in Singapore; the old Render database is kept temporarily for rollback and is no longer read by the API. Render auto-deploy is disabled deliberately. Vercel frontend auto-deploy needs the GitHub login connection added in the Vercel dashboard, so a release is `git push`, `render deploys create srv-dbdidass728c73c30920`, then `vercel deploy --prod`, followed by `npm run smoke:prod`.

## Backup and recovery

Production data now lives on Neon Postgres. Take an off-platform dump before migrations or destructive changes; the free Neon plan is not a substitute for your own backup policy:

```sh
# External access must be allowed for your IP first (Render dashboard or CLI).
DATABASE_URL='postgresql://.../roviel?sslmode=require' ./scripts/backup-db.sh
pg_restore --list backups/roviel-*.dump | head      # verify the archive
```

Restore into a fresh database, never over live data without a snapshot:

```sh
DATABASE_URL='postgresql://.../roviel?sslmode=require' RESTORE_CONFIRM=RESTORE ./scripts/restore-db.sh backups/roviel-YYYYMMDDTHHMMSSZ.dump
npm run db:migrate    # only if the backup predates the current schema
```

`backups/` is gitignored. Keep dumps outside the repository and never commit credentials or dumps. For the bundled demo, `npm run db:seed` rebuilds the sample ledger; it is destructive to the `demo@ledgerly.app` user only.

Run a real restore drill against a disposable database or a Neon branch before cutting over production:

```sh
createdb roviel_restore_drill
SOURCE_DATABASE_URL='postgresql:///roviel' \
DRILL_DATABASE_URL='postgresql:///roviel_restore_drill' \
DRILL_CONFIRM=RESTORE-DRILL ./scripts/restore-drill.sh
dropdb roviel_restore_drill
```

The script dumps the source, refuses a non-empty target, restores into it, compares every public table and migration count, and never drops the target itself. A local drill against all six migrations passed on 2026-10-23, and the same restore drill was run from the old Render database into Neon before the production cutover.

### Uptime checks

`.github/workflows/uptime.yml` runs `npm run smoke:prod` every 30 minutes and on demand. It checks the web alias, `/health` (including the database when the deployed API reports it), a dated USD/EUR quote, the full currency directory and the 401 boundary on summary data. A failed run notifies repository watchers through GitHub Actions; no production credentials are stored in the workflow.

## Security and correctness notes

- Production startup refuses to boot with a missing/default `JWT_SECRET`, no `DATABASE_URL`, or a wildcard/empty `FRONTEND_URL`. Access tokens last 12 hours; logout and password changes increment `tokenVersion` so old sessions are revoked server-side.
- Password-reset tokens are random 256-bit values stored only as SHA-256 hashes, expire after 30 minutes, are single-use, and are invalidated by a newer request. Forgot-password responses are intentionally identical for registered and unknown emails. Reset links are delivered by Resend in production; local development logs the link instead. Until `RESEND_API_KEY` and `EMAIL_FROM` are configured, production returns a clear 503 instead of pretending the email was sent.
- New accounts start at **zero** — the app never invents an opening balance. Demo data is seeded explicitly and labelled as a demo.
- Entries can only use the currency of their account. Missing FX quotes are reported as unavailable (`null`) rather than converted at `1`.
- Account deletion requires the account password plus the exact word `DELETE`; an account with entries cannot be removed, and at least one account must remain.
- The client treats a `401` as an expired session, clears cloud state, and asks you to sign in instead of showing an empty or local ledger as if it were yours. A failed cloud write never falls back to the local demo ledger while signed in; the form stays open with a retryable error.
- CSV exports include the original currency, kind, `amount_minor`, and the converted `home_amount` when a rate exists.

## Data sources & disclaimers

The WebGL coin scene runs on Three.js 0.160, vendored under `public/vendor/three/` with its MIT licence so the signature visual has no runtime CDN dependency.

Reference rates come from [Frankfurter](https://frankfurter.dev/) (central-bank blended), with a wide-coverage fallback for currencies the ECB feed does not publish. Rates are informational, dated, and can be revised — they are not provider quotes and Roviel never executes an exchange.

## Notable bugs found and fixed during testing

- Converter inflated amounts by `10^100` (`minorScale` used where the digit count was needed).
- `GET /api/recurring` crashed on `BigInt` serialisation, returning 503.
- Public FX routes were shadowed by a globally-authenticated router (401 on a public endpoint).
- The API crashed the whole process when the database was unreachable.
- Linked transfer legs could be deleted, orphaning the pair.
- Dashboard "Sign in" button was hidden behind an id collision and a mobile-only CSS rule.
- Stored XSS via account/goal/budget names rendered through `innerHTML`.
- After cloud login the dashboard rendered the local demo totals (constant opening balance, transfers counted as income/spend) instead of `/api/summary`.
- Transfer legs leaked into income and spending in the client-side fallback summary.
- The goal **Contribute** button had no listener — it looked interactive and did nothing.
- Budget progress fell back to the current month when a budget's own month had no activity.
- Goals with identical `createdAt` reordered after an update, so the row you contributed to appeared to change.
- The dashboard topbar overflowed on 800–1050px screens and the landing header pushed its primary action off-screen at ~800px.

## Known limitations

- Render's free web service sleeps after 15 minutes idle, so the first cloud request can take around 30 seconds.
- Password-recovery email is implemented, but production returns a clear 503 until a free Resend sender/domain is configured with `RESEND_API_KEY` and `EMAIL_FROM`. It never pretends a reset email was sent when delivery is unavailable.
- Vercel frontend auto-deploy still requires the account's GitHub login connection in Vercel; until then releases use `vercel deploy --prod`.
- The old Render Postgres is retained temporarily for rollback, is no longer read by the API and will expire naturally. Neon's free tier has its own compute/storage limits.
- Refresh-token rotation and optional TOTP are not part of V1 and remain tracked in issue #10.

## Privacy

Roviel stores only what you enter, scoped to your account, and deletes everything when you delete your account. The anonymous demo never leaves the browser. There is no third-party analytics and no advertising tracking.
