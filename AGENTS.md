# Ledgerly — agent workflow

## Autonomy
- Commit after each coherent unit of work (feature, fix, test or docs) without waiting to be asked.
- Push to `origin/main` once the verification below passes. Never force-push or amend someone else's commit.
- Create a GitHub issue when you find a bug, a missing test, a deployment blocker or a worthwhile feature, and close it with the fixing commit when resolved.

## Commits
- Conventional Commits: `feat(api)`, `feat(web)`, `fix(web)`, `test(e2e)`, `docs`, `chore`.
- One concern per commit; keep generated files, screenshots and secrets out.
- Reference issues in the body (`Refs #12`, `Closes #12`).

## Verification before every commit
```sh
npm run build
npm run api:build
npm run test:unit
node --check <inline JS>    # or rely on the build for index.html
npm run test:e2e            # reseeds the demo; requires Postgres + API + web running
```

## Guardrails
- Never commit `.env` files or credentials; `.env.example` documents required keys.
- `src/App.jsx` is the archived React prototype — the live app is `index.html`.
- Keep the local offline demo working; cloud features are additive.
- Preserve the money rule: integer minor units + ISO currency, converted through `toMajorUnits`/`minorScale`.
