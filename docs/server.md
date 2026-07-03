# Server configuration

The same Node process handles all three modes:

- `pnpm dev` — Vite dev server, with the WS handler attached via
  `vite.config.ts -> configureServer`.
- `pnpm preview` — Vite's preview server over `dist/`, with the WS handler
  attached via `configurePreviewServer`.
- `pnpm start` — production deployment: boots `server/index.ts` which serves
  `dist/` and upgrades `/ws` on a single Node process.

The Node process reads these environment variables:

| Variable                  | Required | Default          | Purpose                                                                |
| ------------------------- | -------- | ---------------- | ---------------------------------------------------------------------- |
| `LOCALACTION_PORT`        | No       | `5173`           | TCP port to serve on. Honoured by `pnpm start` only.                   |
| `LOCALACTION_SYNC_SECRET` | No       | `''` (open)      | Shared secret expected on `?secret=…` query for every `/ws` upgrade. Leave empty in dev only. |
| `LOCALACTION_DB_PATH`     | No       | `./data.db`      | Path to the SQLite file the sync server persists to.                   |

The matching browser-side variable is `VITE_LOCALACTION_SYNC_SECRET`
(consumed by `src/data/sync.ts`). It must match the server value so client WS
upgrades succeed.

## Quick reference

```bash
# Dev — no secret required, SQLite at ./data.db
pnpm dev

# Build the SPA, then preview with WS support.
pnpm build
pnpm preview

# Production: single Node process with auth + persistent volume.
pnpm build
LOCALACTION_PORT=8080 \
LOCALACTION_SYNC_SECRET="$(openssl rand -hex 32)" \
LOCALACTION_DB_PATH=/var/lib/localaction/data.db \
pnpm start

# Smoke test the full stack in Node (no browser needed).
pnpm smoke
```

## Sharing the secret with the client

`vite.config.ts` passes any `VITE_LOCALACTION_SYNC_SECRET` value through to
the browser bundle. Either:

- export it before `pnpm build` / `pnpm dev`, or
- drop it into a `.env` / `.env.local` (Vite loads these automatically).

If the value is missing on the server, the server logs a warning on start
and accepts unauthenticated upgrades — fine for dev, not for prod.

