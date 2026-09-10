import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Registry of e2e-spawned servers, one `<pid>.json` per armed watchdog.
 * Lets the reaper prove a process is a throwaway e2e server (and that its
 * owner is dead) without pattern-killing by port or vague argv matches.
 */
export const E2E_SERVER_REGISTRY_DIR = join(tmpdir(), 'localaction-e2e-servers');

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
