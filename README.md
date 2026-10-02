# LocalAction

**Offline-first, self-hosted task manager with multi-device sync.**

![LocalAction offline and sync demo](assets/localaction-sync.gif)

Persists work locally for offline use and syncs w/ server for automatic conflict resolution.

Offline-first: the app runs against an in-browser store persisted to OPFS — no account, no login,
works without a network. Self-hosted: one Bun process serves static files, WebSocket sync, and one
SQLite DB file. Clients converge over WebSocket via CRDT-style merge (per-cell HLC timestamps,
last-writer-wins) — no conflict dialogs.

Stack: Vite 8 · React 19 · TypeScript · TinyBase 9 · SQLite (`bun:sqlite`) · `ws`.

```text
Browser                        Server                            Browser
┌────────────────────┐         ┌───────────────────────────┐       ┌────────────────────┐
│ React SPA          │         │ static file server        │       │ React SPA          │
│ MergeableStore ◄───┼── /ws ──┤► sync (createWsServer)   ◄┼─ /ws ─┼──► MergeableStore  │
│ OPFS persister     │         │ persist (SQLite)          │       │ OPFS persister     │
└────────────────────┘         └───────────────────────────┘       └────────────────────┘
```

## Quick start

Requires [Bun](https://bun.sh/) (package manager _and_ runtime — the server uses `bun:sqlite`).

```bash
bun install
bun run dev     # Vite dev server + sync WS (http://localhost:5173)
```

```bash
bun run build
bun pm pack
bun install -g ./localaction-<version>.tgz
localaction                  # port 7373, SQLite in the platform user-data dir
```

Daemon setup, NixOS module, and multi-device sync: see [CONTRIBUTING.md](CONTRIBUTING.md) and
[AGENTS.md](AGENTS.md).

Stack, commands, and verification: see [AGENTS.md](AGENTS.md).

## License

AGPL-3.0-or-later
