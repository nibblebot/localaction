#!/usr/bin/env bun
/**
 * Bundle the production daemon and every Vite asset for package installation.
 *
 * `server/embedded-dist.ts` remains an empty source stub. During this build it
 * becomes Bun `type: "file"` imports, so the output contains both the executable
 * and its static assets without requiring a source checkout or a dist/ sibling.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const DIST_DIR = join(ROOT, 'dist');
const EMBEDDED_DIST_FILE = join(ROOT, 'server', 'embedded-dist.ts');
const OUT_DIR = join(ROOT, 'dist-bundle');
const OUTFILE = join(OUT_DIR, 'localaction.js');
const STUB =
  '// Replaced only while scripts/build-localaction.ts bundles the packaged daemon.\n' +
  '// Source and test runs serve the Vite dist/ directory directly.\n' +
  'export const EMBEDDED_DIST: Readonly<Record<string, string>> = {};\n';

function listFiles(directory: string, base: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path, base));
    } else if (entry.isFile()) {
      files.push(path.slice(base.length + 1).replaceAll('\\', '/'));
    }
  }
  return files;
}

function generateEmbeddedDist(): string {
  const files = listFiles(DIST_DIR, DIST_DIR)
    .filter((file) => !file.startsWith('.'))
    .sort();
  const indexAt = files.indexOf('index.html');
  if (indexAt === -1) {
    throw new Error(`Vite build produced no dist/index.html; got: ${files.join(', ')}`);
  }

  const imports = files.map(
    (file, index) =>
      `import file${index} from ${JSON.stringify(`../dist/${file}`)} with { type: 'file' };`,
  );
  const entries = files.map(
    (file, index) =>
      `  ${JSON.stringify(`/${file}`)}: new URL(file${index}, import.meta.url).pathname,`,
  );
  entries.push(`  '/': new URL(file${indexAt}, import.meta.url).pathname,`);

  return `${imports.join('\n')}\n\nexport const EMBEDDED_DIST: Readonly<Record<string, string>> = {\n${entries.join('\n')}\n};\n`;
}

try {
  writeFileSync(EMBEDDED_DIST_FILE, generateEmbeddedDist());
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const build = await Bun.build({
    entrypoints: [join(ROOT, 'server', 'index.ts')],
    outdir: OUT_DIR,
    minify: true,
    target: 'bun',
  });
  if (!build.success) {
    throw new Error(build.logs.map((log) => log.message).join('\n'));
  }

  const produced = build.outputs.find((output) => output.path.endsWith('.js'))?.path;
  if (!produced) {
    throw new Error('Bun build produced no JavaScript executable');
  }
  if (produced !== OUTFILE) {
    renameSync(produced, OUTFILE);
  }

  const shebang = readFileSync(OUTFILE, 'utf8').slice(0, '#!/usr/bin/env bun'.length);
  if (shebang !== '#!/usr/bin/env bun') {
    throw new Error(`bundle lost its shebang (got ${JSON.stringify(shebang)}...)`);
  }
  console.log(`built ${OUTFILE}`);
} finally {
  writeFileSync(EMBEDDED_DIST_FILE, STUB);
}
