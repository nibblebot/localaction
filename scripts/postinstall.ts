// `bun install` postinstall: fetch the Playwright chromium build so e2e has a
// browser. Skipped on NixOS, where the downloaded build cannot execute
// (generic dynamically linked binary, no /lib64 loader) and the configs drive
// the Nix-packaged system chromium instead — see systemChromiumPath and
// ensurePlaywrightChromium in e2e/infra.ts. A NixOS machine without a system
// chromium gets a warning here and a loud failure at e2e run time.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PLAYWRIGHT_BIN_PATH, systemChromiumPath } from '../e2e/infra.ts';

if (existsSync('/etc/NIXOS')) {
  if (systemChromiumPath() === undefined) {
    process.stderr.write(
      'localaction: NixOS detected but no system chromium on PATH — e2e needs one (`nix profile add nixpkgs#chromium`, or `chromium` in environment.systemPackages).\n',
    );
  }
  process.exit(0);
}

const result = spawnSync(PLAYWRIGHT_BIN_PATH, ['install', 'chromium'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
