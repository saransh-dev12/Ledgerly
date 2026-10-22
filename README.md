# Ledgerly

Ledgerly is an early product implementation for personal finance and public currency tools. The initial product scope is locked by the product specification for this task; this repository does not yet meet its launch definition.

## Current implementation

- The served application is the standalone Vite page in [`index.html`](index.html). It contains the public landing page, an INR sample dashboard, and the currency tools dialog.
- The React files in `src/` are an archived implementation and are not mounted by the current `index.html` entry point.
- The landing page has a blue accent theme and a currency converter available without registration.
- The converter reads the supported currency directory and reference rates from [Frankfurter's v2 API](https://frankfurter.dev/v2/). It displays the observation date, source, inverse rate, stale and unavailable states, and preserves a dated cached observation when offline.
- The fee estimator compares the reference amount with a manually entered provider quote. Fixed fees use the destination currency, the percentage fee applies to the provider amount, and tax applies to the configured fees. Estimates are not provider guarantees.
- Currency search, favorites, recent conversions, and the dashboard's sample transactions are stored in this browser's local storage.

## Run locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Create a production build with:

```sh
npm run build
```

The converter needs an internet connection to fetch current reference observations and the full currency directory. If those requests fail, it shows an explicit error or a dated cached rate. No API key is required for the public reference endpoint.

## Demo data and privacy

The dashboard is a **single-currency INR sample ledger**, not a private account. It stores added transactions in `localStorage` on the current browser. There is no authentication, server-side storage, authorization, cross-device synchronization, export, or account deletion flow. Do not enter real financial records into this demo.

## Work remaining before public launch

The locked specification covers substantially more than this first implementation. In particular, the repository still needs:

- Secure sign-up, sign-in, recovery, sessions, server-side authorization, user isolation, export, and deletion workflows.
- A relational backend, migrations, input validation, backup and recovery procedures, and production operations configuration.
- Multi-currency accounts and transactions that preserve original amounts, transaction-time rates, historical valuations, and current estimated valuations.
- Transfers, refunds, reversals, recurring rules, budgets, goals, category management, and reconciled reporting/export.
- Public historical charts and currency movers with period definitions and provider-specific freshness handling.
- Saved provider profiles and quote comparisons, plus broader independent calculation coverage.
- Localization preferences, accessibility review, privacy documentation, and security review.
- Grounded, optional AI insights with consent and deterministic financial calculations.

The dashboard is labeled as a local demo to make these limits visible. The implementation is not launch-ready until the acceptance criteria in the product specification are met.
