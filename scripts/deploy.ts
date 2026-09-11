// scripts/deploy.ts — one-command deploy of this checkout onto the local
// NixOS host (`bun run deploy`; supersedes the manual sequence in AGENTS.md →
// "NixOS service deploy").
//
// Steps, in order:
//   1. preflight: repo root, branch `main`, `forgejo` remote. Working-tree
//      changes are staged and must be committed by this run (`--message`),
//      because the system flake pins the *pushed* revision and untracked
//      files are invisible to the flake's `src = ./.`.
//   2. gate: `bun run lint`, `bun test`, `bun run build`, `bun run
//      smoke:bundle` — prepares and exercises the executable
//      (`dist-bundle/localaction.js`).
//   3. `nix build .#localaction` — the derivation `nix/module.nix` installs.
//   4. commit (if staged) + `git push forgejo main`; the repo's pre-push hook
//      runs the full gate (e2e included) unless `--skip-checks`.
//   5. assert `forgejo/main` == HEAD, then `nix flake update localaction` in
//      the system flake (`NH_FLAKE`, default `/etc/nixos`) — new `rev` +
//      `narHash` in `flake.lock` — and assert the pin is that HEAD.
//   6. `nh os switch` — build and activate the system configuration; on
//      failure the previous generation stays current.
//   7. assert the `localaction` unit is active again and report ExecStart.
//
// Usage: bun scripts/deploy.ts [-m "type(scope): …"] [--skip-checks] [--dry-run]

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

const ROOT = realpathSync(join(import.meta.dir, '..'));
const BRANCH = 'main';
const REMOTE = 'forgejo';
const INPUT = 'localaction';
const SERVICE = 'localaction';
const SYSTEM_FLAKE = realpathSync(process.env.NH_FLAKE?.trim() || '/etc/nixos');
const HOST = hostname();
const PHASES = 7;

const USAGE = `Usage: bun run deploy [-m <message>] [--skip-checks] [--dry-run]

Deploys this checkout to the local NixOS host (${HOST}): gate → nix build →
push ${REMOTE}/${BRANCH} → repin ${SYSTEM_FLAKE}/flake.lock → nh os switch.

  -m, --message <message>  commit message for working-tree changes (required
                           when the tree is dirty)
      --skip-checks        skip the lint/test/build/smoke gate and push with
                           --no-verify (the pre-push hook is bypassed too)
      --dry-run            print the commands that would run; read-only probes
                           still run, but nothing is staged, built, pushed,
                           or activated
  -h, --help               show this help`;

type Options = {
  message?: string;
  skipChecks: boolean;
  dryRun: boolean;
  help: boolean;
};

type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  /** Stream stdout/stderr straight to the terminal instead of capturing them. */
  inherit?: boolean;
};

type ShResult = { status: number; stdout: string; stderr: string };

let DRY_RUN = false;
let phase = 0;

function begin(label: string): void {
  phase += 1;
  console.log(`\n[deploy] ${phase}/${PHASES} ${label}`);
}

function info(message: string): void {
  console.log(`         ${message}`);
}

function sh(command: string, args: string[], options: RunOptions = {}): ShResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

/** Mutating command: echoed, output streamed to the terminal, non-zero exit aborts the deploy. */
function run(command: string, args: string[], options: RunOptions = {}): void {
  info(`$ ${command} ${args.join(' ')}`);
  if (DRY_RUN) return;
  const { status } = sh(command, args, { ...options, inherit: true });
  if (status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${status}; output above)`);
}

/** Read-only probe: captures stdout, throws on non-zero exit. */
function capture(command: string, args: string[], options: RunOptions = {}): string {
  const { status, stdout, stderr } = sh(command, args, options);
  if (status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (exit ${status})\n${stderr.trim() || stdout.trim()}`);
  }
  return stdout.trim();
}

function short(rev: string): string {
  return rev.slice(0, 12);
}

function parseArgs(argv: string[]): Options {
  const options: Options = { skipChecks: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--skip-checks') options.skipChecks = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '-m' || arg === '--message') {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a value\n\n${USAGE}`);
      options.message = value;
      i += 1;
    } else if (arg.startsWith('--message=')) options.message = arg.slice('--message='.length);
    else throw new Error(`unknown argument: ${arg}\n\n${USAGE}`);
  }
  return options;
}

function preflight(options: Options): boolean {
  begin('preflight: checkout, branch, remote, working tree');

  const top = realpathSync(capture('git', ['rev-parse', '--show-toplevel']));
  if (top !== ROOT) throw new Error(`run this from the localaction checkout (${ROOT}), not ${top}`);

  const branch = capture('git', ['branch', '--show-current']);
  if (branch !== BRANCH) {
    throw new Error(`system flake pins input ${INPUT} at ref=${BRANCH} — deploy from ${BRANCH} (currently on ${branch || 'detached HEAD'})`);
  }

  info(`remote ${REMOTE} = ${capture('git', ['remote', 'get-url', REMOTE])}`);

  const changes = capture('git', ['status', '--porcelain']);
  if (!changes) {
    info('working tree clean');
    return false;
  }
  if (!options.message) {
    throw new Error(
      `working tree has changes; pass -m "type(scope): message" so they are committed and pushed:\n${changes}\n` +
        '  (the flake input pins the pushed revision — uncommitted work would not be deployed)',
    );
  }
  info(`staging ${changes.split('\n').length} changed path(s)`);
  run('git', ['add', '-A']);
  return true;
}

function gate(options: Options): void {
  begin('executable: lint, test, build, smoke:bundle');
  if (options.skipChecks) {
    info('skipped (--skip-checks)');
    return;
  }
  run('bun', ['run', 'lint']);
  run('bun', ['test']);
  run('bun', ['run', 'build']);
  run('bun', ['run', 'smoke:bundle']);
}

function buildFlake(): void {
  begin('flake: nix build .#localaction');
  run('nix', ['build', '--no-link', '.#localaction']);
  if (DRY_RUN) return;
  const exe = join(capture('nix', ['path-info', '.#localaction']), 'bin', 'localaction');
  if (!existsSync(exe)) throw new Error(`flake built but ${exe} is missing`);
  info(`executable: ${exe}`);
}

function publish(dirty: boolean, options: Options): string {
  begin(`publish: commit, push ${REMOTE}/${BRANCH}`);
  if (dirty) run('git', ['commit', '-m', options.message ?? '']);
  run('git', options.skipChecks ? ['push', '--no-verify', REMOTE, BRANCH] : ['push', REMOTE, BRANCH]);

  const head = capture('git', ['rev-parse', 'HEAD']);
  if (DRY_RUN) return head;
  const remoteHead = capture('git', ['ls-remote', REMOTE, `refs/heads/${BRANCH}`]).split(/\s+/)[0] ?? '';
  if (remoteHead !== head) {
    throw new Error(`${REMOTE}/${BRANCH} is ${short(remoteHead) || '(missing)'} but HEAD is ${short(head)} — push did not land; nothing was repinned`);
  }
  info(`pushed ${short(head)}`);
  return head;
}

type LockedInput = { rev: string; narHash: string };

function readLocked(lockPath: string): LockedInput {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
    nodes?: Record<string, { locked?: LockedInput }>;
  };
  const locked = lock.nodes?.[INPUT]?.locked;
  if (!locked?.rev) throw new Error(`${lockPath} has no nodes.${INPUT}.locked.rev`);
  return locked;
}

function repin(head: string): void {
  const lockPath = join(SYSTEM_FLAKE, 'flake.lock');
  if (!existsSync(join(SYSTEM_FLAKE, 'flake.nix'))) throw new Error(`no flake.nix in ${SYSTEM_FLAKE}`);
  const before = readLocked(lockPath);

  begin(`system flake: repin ${INPUT} to ${short(head)} (${SYSTEM_FLAKE})`);
  run('nix', ['flake', 'update', INPUT], { cwd: SYSTEM_FLAKE });
  if (DRY_RUN) return;

  const after = readLocked(lockPath);
  if (after.rev !== head) {
    throw new Error(`${lockPath} pins ${INPUT} at ${short(after.rev)}, not the pushed ${short(head)} — refusing to activate`);
  }
  if (before.rev === after.rev && before.narHash === after.narHash) {
    info(`${short(after.rev)} unchanged (narHash ${after.narHash})`);
  } else {
    info(`${short(before.rev)} → ${short(after.rev)} (narHash ${after.narHash})`);
  }
}

function activate(): void {
  begin('activate: nh os switch');
  try {
    run('nh', ['os', 'switch', '--hostname', HOST], { cwd: SYSTEM_FLAKE, env: { NH_FLAKE: SYSTEM_FLAKE } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\n  the system keeps its previous generation; retry with: NH_FLAKE=${SYSTEM_FLAKE} nh os switch` +
        `\n  to undo the repin: git -C ${SYSTEM_FLAKE} checkout -- flake.lock`,
    );
  }
  if (DRY_RUN) return;
}

async function verifyService(): Promise<void> {
  begin(`verify: ${SERVICE} unit active`);
  if (DRY_RUN) {
    info('skipped (--dry-run)');
    return;
  }
  const deadline = Date.now() + 30_000;
  let state = '';
  for (;;) {
    state = sh('systemctl', ['is-active', SERVICE]).stdout.trim();
    if (state === 'active') break;
    if (Date.now() >= deadline) {
      throw new Error(
        `services.${SERVICE} is ${state || 'unknown'} 30s after the switch\n` +
          `  diagnose: systemctl status ${SERVICE}; journalctl -u ${SERVICE} --since -5min`,
      );
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 1_000);
    await promise;
  }
  const execStart = sh('systemctl', ['show', '-p', 'ExecStart', '--value', SERVICE]).stdout;
  info(`active — ${/path=([^\s;]+)/.exec(execStart)?.[1] ?? execStart.trim()}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  DRY_RUN = options.dryRun;
  if (DRY_RUN) console.log('[deploy] dry run — mutating steps are printed, not executed');

  const dirty = preflight(options);
  gate(options);
  buildFlake();
  const head = publish(dirty, options);
  repin(head);
  activate();
  await verifyService();

  console.log(`\n[deploy] done — ${REMOTE}/${BRANCH} @ ${short(head)}, ${SYSTEM_FLAKE}/flake.lock repinned, system switched`);
  if (!DRY_RUN && existsSync(join(SYSTEM_FLAKE, '.git'))) {
    info(`note: ${SYSTEM_FLAKE}/flake.lock is modified but uncommitted`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\n[deploy] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
