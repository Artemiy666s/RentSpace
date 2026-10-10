# Production frontend (canonical)

This repository keeps the **exact frontend currently deployed** on Vercel (`rentspace.site`) as the source of truth.

## Where it lives

- `backups/production-current/` — exact snapshot from production
- `server/public/` — same files, served locally and by Vercel

Production JS: `assets/index-DGrUP6as.js`  
SHA-256: `A9D51FE783B203474DD3F1863A4EB24418744B6A9741C32A85B785839CCBCAE7`

## Local run (matches production UI)

```bash
npm run restore:production
npm start
```

Open http://localhost:3000

Do **not** use `npm run dev:source` if you need the deployed UI — that runs older `client/src` via Vite.

## Vercel

`vercel.json` deploys the committed `server/public` build and does **not** rebuild from `client/src`, so a push cannot accidentally replace production UI with the outdated source tree.

## API contract (frontend ↔ server)

Production UI and Express routes must stay in lockstep. Before shipping server or frontend changes:

```bash
npm run audit:api
```

This fails if `server/public/assets/index-DGrUP6as.js` calls any `/api` path that is not registered in `server/routes`.

Rules:
- Never ship UI that calls a missing route (causes silent save failures / “blocked” tables).
- Never patch only `client/src` expecting production to change — update `server/public` (+ hash in `scripts/restore-production-frontend.js`) or keep server compatible with the frozen bundle.
- Prefer adding the missing server endpoint over hot-patching minified JS when the prod UI already expects an API.
