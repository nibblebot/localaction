// Shared e2e infrastructure: free-port allocation, the owner-pid watchdog
// armed inside e2e-spawned servers, the orphan reaper run before each e2e
// run, and the Playwright-chromium self-heal. Imported by
// playwright.config.ts, playwright.offline.config.ts, scripts/e2e.ts,
// vite.config.ts (localaction-sync plugin) and server/index.ts.
//
// Free ports and configs: Playwright 1.61 loads config files through ESM
// import() (this package is "type": "module") but does NOT await an async
// default export — `loadUserConfig` takes `module.default` synchronously
// (verified in node_modules/playwright/lib/common/index.js). So the configs
// resolve their port with top-level `await getE2eServerPort()` and
// default-export a plain object; an `async () => config` export would be
// handed to the validator as an unawaited Promise.
//
// Module-scope constraint: vite.config.ts and server/index.ts statically
// import this module inside long-lived dev/prod processes, so nothing here
// may import '@playwright/test' at top level — ensurePlaywrightChromium()
// imports it lazily.

import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Registry of e2e-spawned servers, one `<pid>.json` per armed watchdog.
 * Lets the reaper prove a process is a throwaway e2e server (and that its
 * owner is dead) without pattern-killing by port or vague argv matches.
 */
export const E2E_SERVER_REGISTRY_DIR = join(tmpdir(), 'localaction-e2e-servers');

/**
 * Throwaway-DB argv markers (see e2e/test-db-path.ts and
 * e2e/offline-test-db-path.ts). Only used to identify LEGACY orphans that
 * predate the registry; a process carrying one of these in its cmdline was
 * launched against a tmpdir throwaway DB and can never be a user's real
 * dev/prod server (those point at defaultDevDbPath()/defaultProdDbPath()).
 */
const E2E_DB_MARKERS: readonly string[] = [
  'localaction-test-e2e-',
  'localaction-test-offline-',
];

/** Absolute path of the Playwright CLI (`node_modules/.bin/playwright`). */
export const PLAYWRIGHT_BIN_PATH = resolve(
  import.meta.dirname,
  '..',
  'node_modules',
  '.bin',
  'playwright',
);

/**
 * NixOS cannot run Playwright's downloaded chromium (a generic dynamically
 * linked Linux binary — the kernel has no /lib64/ld-linux loader), so e2e
 * there must drive the Nix-packaged system chromium instead. Returns its
 * absolute path, resolved from PATH, or undefined off NixOS (where the
 * downloaded build works) / when no system chromium is installed.
 */
export function systemChromiumPath(): string | undefined {
  // /etc/NIXOS is NixOS's conventional marker file.
  if (!existsSync('/etc/NIXOS')) return undefined;
  for (const dir of (process.env['PATH'] ?? '').split(':')) {
    if (!dir) continue;
    for (const name of ['chromium', 'chromium-browser']) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not here / not executable — keep looking.
      }
    }
  }
  return undefined;
}

/** Allocate an OS-assigned free TCP port on 127.0.0.1. */
export function getFreePort(): Promise<number> {
  const { promise, resolve: resolvePort, reject } = Promise.withResolvers<number>();
  const server = createServer();
  server.unref();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo | null)?.port;
    server.close(() => {
      if (port) resolvePort(port);
      else reject(new Error('getFreePort: listen succeeded without an address'));
    });
  });
  return promise;
}

/**
 * The e2e server port for THIS run. Playwright loads the config file in the
 * runner AND again in every worker process, so a bare `getFreePort()` in the
 * config yields a different port per process (webServer listens on one port,
 * tests navigate to another). scripts/e2e.ts therefore allocates the port
 * once and hands it down via LOCALACTION_E2E_PORT; the getFreePort()
 * fallback only serves direct `playwright test` invocations, which are
 * unsupported for e2e (AGENTS.md agent port rule: go through the wrapper).
 */
export async function getE2eServerPort(): Promise<number> {
  const fromEnv = Number.parseInt(process.env['LOCALACTION_E2E_PORT'] ?? '', 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return getFreePort();
}

/**
 * No-op unless LOCALACTION_OWNER_PID names a live watch target. When armed:
 * polls the owner every 500ms and exits this process once the owner is gone
 * (ESRCH), so e2e-spawned servers self-terminate when the Playwright runner
 * dies. EPERM counts as alive (owner under another uid). Also writes a
 * registry file for reapOrphanE2eServers() and removes it on clean exit.
 */
export function startOwnerWatchdog(info: { port?: number; dbPath?: string } = {}): void {
  const raw = process.env['LOCALACTION_OWNER_PID'];
  if (!raw) return;
  const ownerPid = Number.parseInt(raw, 10);
  if (!Number.isInteger(ownerPid) || ownerPid <= 0 || ownerPid === process.pid) return;

  const registryFile = join(E2E_SERVER_REGISTRY_DIR, `${process.pid}.json`);
  try {
    mkdirSync(E2E_SERVER_REGISTRY_DIR, { recursive: true });
    writeFileSync(
      registryFile,
      JSON.stringify({
        pid: process.pid,
        ownerPid,
        ...(info.port !== undefined ? { port: info.port } : {}),
        ...(info.dbPath !== undefined ? { dbPath: info.dbPath } : {}),
        startedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // The registry only helps the reaper; never block a server over it.
  }

  const removeRegistryFile = (): void => {
    try {
      rmSync(registryFile, { force: true });
    } catch {
      // best effort
    }
  };
  process.once('exit', removeRegistryFile);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      removeRegistryFile();
      // Re-raise so default termination semantics (exit code/signal) hold.
      process.kill(process.pid, signal);
    });
  }

  const timer = setInterval(() => {
    if (pidAlive(ownerPid)) return;
    process.stderr.write(
      `localaction: owner process ${ownerPid} is gone; stopping e2e server (pid ${process.pid})\n`,
    );
    process.exit(0);
  }, 500);
  // The watchdog must never keep an otherwise-finished server alive.
  timer.unref();
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** SIGTERM the process group (falling back to the lone pid), then SIGKILL. */
function killProcessGroup(pid: number): void {
  const send = (signal: 'SIGTERM' | 'SIGKILL'): void => {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // already gone
      }
    }
  };
  send('SIGTERM');
  // Reaping runs once before tests spawn, so blocking briefly while the
  // group shuts down is acceptable and keeps this synchronous.
  const deadline = Date.now() + 2_000;
  while (pidAlive(pid) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (pidAlive(pid)) send('SIGKILL');
}

/**
 * Best-effort cleanup of orphaned e2e servers; MUST never throw.
 * (a) Registry: dead pid → drop the file; live pid with dead ownerPid →
 * kill the process group and drop the file. Entries whose owner is alive
 * are protected (another run may be in progress).
 * (b) Legacy orphans with no registry entry: Linux /proc scan for argv
 * containing a throwaway-DB marker, killed the same way.
 */
export function reapOrphanE2eServers(): void {
  const protectedPids = new Set<number>();
  try {
    for (const file of readdirSync(E2E_SERVER_REGISTRY_DIR)) {
      if (!file.endsWith('.json')) continue;
      const path = join(E2E_SERVER_REGISTRY_DIR, file);
      try {
        const entry = JSON.parse(readFileSync(path, 'utf8')) as {
          pid?: unknown;
          ownerPid?: unknown;
        };
        const pid = typeof entry.pid === 'number' ? entry.pid : NaN;
        const ownerPid = typeof entry.ownerPid === 'number' ? entry.ownerPid : NaN;
        if (!Number.isInteger(pid) || pid <= 0 || !pidAlive(pid)) {
          rmSync(path, { force: true });
          continue;
        }
        if (Number.isInteger(ownerPid) && ownerPid > 0 && !pidAlive(ownerPid)) {
          process.stderr.write(
            `localaction: reaping orphaned e2e server (pid ${pid}, owner ${ownerPid} gone)\n`,
          );
          killProcessGroup(pid);
          rmSync(path, { force: true });
        } else {
          protectedPids.add(pid);
        }
      } catch {
        // Unreadable/corrupt entry — leave it; next run retries.
      }
    }
  } catch {
    // Registry dir missing or unreadable — nothing to reap there.
  }

  try {
    for (const dirent of readdirSync('/proc')) {
      const pid = Number.parseInt(dirent, 10);
      if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid || protectedPids.has(pid)) {
        continue;
      }
      try {
        const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
        if (!E2E_DB_MARKERS.some((marker) => cmdline.includes(marker))) continue;
        process.stderr.write(`localaction: reaping legacy e2e server (pid ${pid})\n`);
        killProcessGroup(pid);
      } catch {
        // Process vanished or cmdline unreadable.
      }
    }
  } catch {
    // No /proc (non-Linux) — registry reaping above still applies.
  }
}

/**
 * Self-heal for `bun install --ignore-scripts`: ensure a runnable chromium
 * exists for the e2e run. On NixOS the downloaded Playwright build cannot
 * execute (see systemChromiumPath), so the Nix-packaged system chromium is
 * required instead and no download is attempted. Elsewhere, install the
 * Playwright build via the package's own CLI if missing. Unlike the reaper
 * this fails loudly — there is no e2e run without a browser.
 */
export async function ensurePlaywrightChromium(): Promise<void> {
  if (systemChromiumPath() !== undefined) return;
  if (existsSync('/etc/NIXOS')) {
    throw new Error(
      'localaction: no system chromium on PATH — Playwright’s downloaded build cannot run on NixOS. Install one (e.g. `nix profile add nixpkgs#chromium`, or add `chromium` to environment.systemPackages).',
    );
  }
  // Dynamic import on purpose (rule exception): vite.config.ts and
  // server/index.ts statically import this module inside long-lived
  // dev/prod processes, and a static '@playwright/test' import would drag
  // the test runner into them (see the module header).
  const { chromium } = await import('@playwright/test');
  if (existsSync(chromium.executablePath())) return;
  process.stderr.write('localaction: playwright chromium missing — installing…\n');
  const result = spawnSync(PLAYWRIGHT_BIN_PATH, ['install', 'chromium'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`playwright install chromium exited with code ${result.status ?? 'unknown'}`);
  }
}
