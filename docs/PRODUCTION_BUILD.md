# Production frontend (canonical)

This repository keeps the **exact frontend currently deployed** on Vercel (`rentspace.site`) as the source of truth.

## Where it lives

- `backups/production-current/` — exact snapshot from production
- `server/public/` — same files, served locally and by Vercel

Production JS: `assets/index-DGrUP6as.js`  
SHA-256: `424E779F48A51CC85790A89A6989DF4EB806033365540BF4D273760D98B85C07`

## Local run (matches production UI)

```bash
npm run restore:production
npm start
```

Open http://localhost:3000

Do **not** use `npm run dev:source` if you need the deployed UI — that runs older `client/src` via Vite.

## Vercel

`vercel.json` deploys the committed `server/public` build and does **not** rebuild from `client/src`, so a push cannot accidentally replace production UI with the outdated source tree.
