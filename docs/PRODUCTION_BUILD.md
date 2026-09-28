# Production frontend (canonical)

This repository keeps the **exact frontend currently deployed** on Vercel (`rentspace.site`) as the source of truth.

## Where it lives

- `backups/production-current/` — exact snapshot from production
- `server/public/` — same files, served locally and by Vercel

Production JS: `assets/index-DGrUP6as.js`  
SHA-256: `C0B3937201439A837ABD99DA5FFB287D3B4B70B9986C8ED349DDBE223AB3EC85`

## Local run (matches production UI)

```bash
npm run restore:production
npm start
```

Open http://localhost:3000

Do **not** use `npm run dev:source` if you need the deployed UI — that runs older `client/src` via Vite.

## Vercel

`vercel.json` deploys the committed `server/public` build and does **not** rebuild from `client/src`, so a push cannot accidentally replace production UI with the outdated source tree.
