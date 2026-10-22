# Ledgerly

**Give every currency a direction.** A full-stack, multi-currency finance tracker: a cinematic public landing page, a live reference-rate converter, and an authenticated ledger with accounts, budgets, goals, recurring rules and evidence-based insights.

Built as a portfolio-grade backend project — Express + TypeScript + PostgreSQL + Prisma in front, a dependency-free design system in the browser.

---

## What it does

| Surface | Highlights |
| --- | --- |
| **Landing** | Scroll-snapped story (one scroll = one section), WebGL coin scene with a graceful no-WebGL fallback, custom cursor, interface sounds, reduced-motion support. |
| **Public converter** | 165+ currencies, dated reference rates, inverse rate, stale/offline states with a dated cache, popular pairs, favourites, recents, copy & share. |
| **Quote comparator** | Enter a provider quote + fixed/percentage/tax fees; exact `BigInt` minor-unit maths with per-currency rounding. The reference rate is **never** auto-filled into the provider field. |
| **Dashboard** | 8 dedicated views: Overview, Transactions, Accounts, Budgets, Goals, Recurring, Insights, Currency pulse. Each with a crisp headline, guidance and inline actions. |
| **Cloud mode** | JWT auth, multi-currency accounts, atomic transfers with FX capture, budgets with burn-down bars, goals with contributions, recurring rules you can post in one tap, CSV export, deterministic insights. |
| **Offline-first** | The anonymous demo keeps working with no API — localStorage ledger, local analytics, and an explicit "local demo" state. |

## Architecture

```
Browser (Vite, zero-framework UI)
  ├── index.html            landing + dashboard + converter (vanilla JS, ES modules)
  ├── public/ledgerly-api.js thin API client (additive; demo works without it)
  └── e2e/run.mjs           Playwright suite (81 checks, real browser)
        │  HTTPS + Bearer JWT
        ▼
Express API (TypeScript)
  ├── routes: auth · accounts · transactions · finance · fx · insights
  ├── middleware: requireAuth (JWT → userId), rate limit, helmet, CORS, zod validation
  └── lib: money (BigInt minor units) · fx (Frankfurter + wide-coverage fallback, cached in Postgres)
        │  Prisma ORM
        ▼
PostgreSQL — 12 tables, user-scoped by userId on every query
```

**Design rules that hold everywhere**

- Money is stored as **integer minor units + ISO currency** (`amountMinor`, `currency`). Never floats.
- Original amounts and reporting values are stored **separately** (`rateToHome`, `transaction_valuations`).
- Transfers are **atomic** (`prisma.$transaction`) and both legs are linked, so a linked transfer can never be half-deleted.
- Every query is filtered by `userId` — user isolation is enforced in the data layer, not the UI.
- The frontend never touches the database, and the API never trusts client-supplied amounts or account ids.

## Design system

Ledgerly ships **two complete, switchable themes** — one design language applied to the landing page, the dashboard, the converter and every popup. The active theme is stored in `localStorage` and applied via `data-theme` on `<html>`; the toggle in the header switches instantly (the WebGL scene is rebuilt with the matching palette).

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
npm run test:e2e      # reseeds the demo, then runs 81 Playwright checks
npm run lint         # oxlint
```

The E2E suite drives a real Chromium instance and asserts exact values rather than labels: a ₹250 expense must raise spending by exactly ₹250, a ₹2,000 budget must report a ₹2,000 limit and 0% spend, a ₹1,000 goal contribution must move the saved amount by ₹1,000, a transfer of ₹100 must debit the source by ₹100, conversions and quotes are compared against the displayed rate, and chart months are checked against `/api/summary`. It also covers landing scroll-snap, auth, every dashboard view, budgets/goals/recurring creation and deletion, CSV export, mobile layout, and a fully-blocked-network offline pass. The suite reseeds the demo account first, so it is repeatable.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` · `/login` | Create account / sign in (bcrypt + JWT) |
| `GET` | `/api/auth/me` | Current user |
| `DELETE` | `/api/auth/account` | Delete account and all data |
| `GET/POST` | `/api/accounts` | Multi-currency accounts |
| `GET/POST` | `/api/transactions` | Ledger entries (filter by account, kind, date) |
| `POST` | `/api/transactions/transfer` | Atomic cross-account transfer with FX capture |
| `DELETE` | `/api/transactions/:id` | Remove an entry (linked legs are protected) |
| `GET/POST/DELETE` | `/api/budgets` · `/api/budgets/:id` | Monthly limits |
| `GET/POST` | `/api/goals` · `/api/recurring` | Planning records |
| `POST` | `/api/goals/:id/contribute` | Record a contribution |
| `GET` | `/api/fx/rate` · `/history` · `/currencies` | Reference rates (cached, stale-aware) |
| `POST` | `/api/fx/quote` | Server-side quote + fee breakdown |
| `GET` | `/api/summary?months=N` | Server-side totals, accounts, categories, months, budgets, goals |
| `GET` | `/api/insights` | Deterministic, evidence-backed summaries |

## Deployment

| Piece | Target | Config |
| --- | --- | --- |
| Frontend | Vercel | `vercel.json` |
| API | Render (Docker) | `render.yaml` |
| Database | Supabase Postgres | `server/prisma/migrations` |

1. **Database** — create a Supabase project, copy the pooled connection string (port `6543`, `?pgbouncer=true&connection_limit=1` for serverless) and keep the direct connection for migrations.
2. **API** — create a Render Blueprint from `render.yaml` (or a Docker web service with `rootDir: server`). Set `DATABASE_URL`, `FRONTEND_URL` (the Vercel URL, comma-separated for previews) and let Render generate `JWT_SECRET`. The container runs `prisma migrate deploy` on boot; `/health` is the readiness check.
3. **Frontend** — import the repo into Vercel (Vite preset, `dist` output) and set `VITE_API_URL` to the Render URL. The value is injected at build time and takes precedence over `meta[name="ledgerly-api"]` and the localStorage override.
4. **Seed the demo (optional)** — `DATABASE_URL=<supabase-direct-url> npm run db:seed`. This resets the demo user's data, so never point it at real users.

`FRONTEND_URL` is also the CORS allow-list: requests from other origins are rejected. Local development needs no env at all — the web app defaults to `http://localhost:4000` on localhost and keeps working offline in demo mode.

## Data sources & disclaimers

Reference rates come from [Frankfurter](https://frankfurter.dev/) (central-bank blended), with a wide-coverage fallback for currencies the ECB feed does not publish. Rates are informational, dated, and can be revised — they are not provider quotes and Ledgerly never executes an exchange.

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

## Privacy

Ledgerly stores only what you enter, scoped to your account, and deletes everything when you delete your account. The anonymous demo never leaves the browser. There is no third-party analytics and no advertising tracking.
