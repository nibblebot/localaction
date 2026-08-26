/**
 * DB size growth benchmark. Boots the real server persistence path
 * (`createServerPersister`: MergeableStore → mirror bridge → tabular
 * SQLite autoSave) against a throwaway `os.tmpdir()/localaction-bench-size/`
 * dir, seeds
 * areas/root tasks/subtasks through the app's own creators, then deletes half
 * through the app's cascade deleters — snapshotting on-disk file sizes,
 * page stats, and row counts at each of the 5 cases.
 *
 * Run: bun run benchmark-size
 */
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { openDatabase, type ServerDatabase } from '../server/db.ts';
import { createServerPersister } from '../server/persister.ts';
import { createArea } from '../src/data/areas.ts';
import { createTask } from '../src/data/tasks.ts';
import {
  deleteArea,
  deleteTask,
} from '../src/data/deletion.ts';
import { TABLES } from '../src/data/schema.ts';

// Dedicated tmpdir subdir: never in the repo, and the readdir sweeps below
// (which also pick up -wal/-shm sidecars for accurate on-disk sizes) only
// ever see this benchmark's own files. The OS reaps tmp.
const DATA_DIR = join(tmpdir(), 'localaction-bench-size');
const DB_PATH = join(DATA_DIR, 'test-bench-size.db');
const VACUUM_PATH = join(DATA_DIR, 'test-bench-size-vacuum.db');

// Deterministic PRNG so runs are comparable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

const AREA_WORDS = ['Family', 'Health', 'Work', 'Finance', 'Home', 'Travel', 'Learning', 'Side efforts', 'Admin', 'Fitness'];
const ROOT_WORDS = ['Plan vacation', 'Quarterly budget', 'Kitchen renovation', 'Tax filing', 'Marathon training', 'Website redesign', 'Reading list', 'Car maintenance', 'Garden overhaul', 'Conference talk'];
const TASK_WORDS = ['review', 'draft', 'schedule', 'call', 'buy', 'research', 'book', 'write', 'fix', 'compare', 'submit', 'organize'];
const TASK_OBJECTS = ['quarterly budget proposal', 'flight options', 'insurance paperwork', 'meeting notes', 'vendor quotes', 'weekend itinerary', 'grocery list', 'tax documents', 'training plan', 'design mockups'];

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const areaName = (i: number) => `${pick(AREA_WORDS)} ${i}`;
const rootName = (i: number) => `${pick(ROOT_WORDS)} #${i}`;
const taskTitle = (i: number) => `${pick(TASK_WORDS)} ${pick(TASK_OBJECTS)} (${i})`;

function all<T>(db: ServerDatabase, sql: string): T[] {
  return db.query(sql).all() as T[];
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function tableCounts(db: ServerDatabase): Promise<Record<string, number>> {
  const tables = await all<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  const out: Record<string, number> = {};
  for (const { name } of tables) {
    const rows = await all<{ n: number }>(db, `SELECT COUNT(*) AS n FROM "${name}"`);
    out[name] = rows[0]!.n;
  }
  return out;
}

async function waitForCounts(
  db: ServerDatabase,
  expected: Record<string, number>,
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const counts = await tableCounts(db);
    const match = Object.entries(expected).every(([t, n]) => counts[t] === n);
    if (match) return;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${JSON.stringify(expected)}; have ${JSON.stringify(counts)}`);
    }
    await sleep(250);
  }
}

interface Snapshot {
  label: string;
  files: Array<{ name: string; bytes: number }>;
  totalBytes: number;
  pageCount: number;
  pageSize: number;
  freelistPages: number;
  counts: Record<string, number>;
}

async function snapshot(db: ServerDatabase, label: string, fileBase: string): Promise<Snapshot> {
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.startsWith(fileBase))
    .sort()
    .map((name) => ({ name, bytes: statSync(join(DATA_DIR, name)).size }));
  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  const pageCount = (await all<{ page_count: number }>(db, 'PRAGMA page_count'))[0]!.page_count;
  const pageSize = (await all<{ page_size: number }>(db, 'PRAGMA page_size'))[0]!.page_size;
  const freelistPages = (await all<{ freelist_count: number }>(db, 'PRAGMA freelist_count'))[0]!.freelist_count;
  const counts = await tableCounts(db);
  const snap: Snapshot = { label, files, totalBytes, pageCount, pageSize, freelistPages, counts };
  printSnapshot(snap);
  return snap;
}

const fmt = (bytes: number): string =>
  bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(2)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`;

function printSnapshot(s: Snapshot): void {
  console.log(`\n=== ${s.label} ===`);
  for (const f of s.files) console.log(`  ${f.name}  ${f.bytes} B (${fmt(f.bytes)})`);
  console.log(`  total: ${s.totalBytes} B (${fmt(s.totalBytes)})`);
  console.log(`  pages: ${s.pageCount} x ${s.pageSize} B, freelist: ${s.freelistPages} pages (${fmt(s.freelistPages * s.pageSize)})`);
  console.log(`  rows: ${JSON.stringify(s.counts)}`);
}

// ---------------------------------------------------------------------------

const areaIds: string[] = [];
const rootTaskIds: string[] = [];
const subTaskIds: string[] = [];
const rootOrderByArea = new Map<string, number>();
const subOrderByRoot = new Map<string, number>();

function seedTo(store: MergeableStore, areas: number, roots: number, subtasks: number): void {
  store.transaction(() => {
    while (areaIds.length < areas) {
      const i = areaIds.length + 1;
      // ~10% sub-areas under a random earlier top-level area.
      const tops = areaIds.filter((id) => !store.getCell(TABLES.areas, id, 'parentId'));
      const parentId = i > 1 && rand() < 0.1 && tops.length > 0 ? pick(tops) : null;
      areaIds.push(createArea(store, { name: areaName(i), parentId }));
    }
    while (rootTaskIds.length < roots) {
      const i = rootTaskIds.length + 1;
      const areaId = areaIds[Math.floor(rand() * areaIds.length)]!;
      const order = (rootOrderByArea.get(areaId) ?? 0) + 1;
      rootOrderByArea.set(areaId, order);
      rootTaskIds.push(
        createTask(store, {
          title: rootName(i),
          placement: { kind: 'area', id: areaId },
          order: order * 1000,
        }),
      );
    }
    while (subTaskIds.length < subtasks) {
      const i = subTaskIds.length + 1;
      const rootId = rootTaskIds[Math.floor(rand() * rootTaskIds.length)]!;
      const order = (subOrderByRoot.get(rootId) ?? 0) + 1;
      subOrderByRoot.set(rootId, order);
      subTaskIds.push(
        createTask(store, {
          title: taskTitle(i),
          placement: { kind: 'task', id: rootId },
          order: order * 1000,
        }),
      );
    }
  });
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });
  for (const f of readdirSync(DATA_DIR)) {
    if (f.startsWith('test-bench-size')) unlinkSync(join(DATA_DIR, f));
  }

  const db = await openDatabase(DB_PATH);
  const store = createMergeableStore();
  const persister = createServerPersister(store, db);

  // Case 1a: brand-new file, nothing written yet.
  const snaps: Snapshot[] = [];
  snaps.push(await snapshot(db, '1a. empty file (openDatabase only, no writes)', 'test-bench-size.db'));

  // Case 1b: first boot — no version stamp, no eager table creation; the
  // file stays empty until the first user row. The settle delay makes the
  // snapshot catch any rogue initial write.
  await persister.startAutoLoad();
  await persister.startAutoSave();
  await sleep(500);
  snaps.push(await snapshot(db, '1b. initial boot (no writes, no user data)', 'test-bench-size.db'));

  // Case 2: 10 areas, 30 root tasks, 100 subtasks.
  let t0 = Date.now();
  seedTo(store, 10, 30, 100);
  await waitForCounts(db, { areas: 10, tasks: 130 });
  console.log(`  (seeded in ${Date.now() - t0} ms)`);
  snaps.push(await snapshot(db, '2. 10 areas / 30 root tasks / 100 subtasks', 'test-bench-size.db'));

  // Case 3: 100 areas, 500 root tasks, 1000 subtasks.
  t0 = Date.now();
  seedTo(store, 100, 500, 1000);
  await waitForCounts(db, { areas: 100, tasks: 1500 });
  console.log(`  (seeded in ${Date.now() - t0} ms)`);
  snaps.push(await snapshot(db, '3. 100 areas / 500 root tasks / 1000 subtasks', 'test-bench-size.db'));

  // Case 4: 1000 areas, 5000 root tasks, 10000 subtasks.
  t0 = Date.now();
  seedTo(store, 1000, 5000, 10000);
  await waitForCounts(db, { areas: 1000, tasks: 15000 });
  console.log(`  (seeded in ${Date.now() - t0} ms)`);
  snaps.push(await snapshot(db, '4. 1000 areas / 5000 root tasks / 10000 subtasks', 'test-bench-size.db'));

  // Case 5: delete half the entities via the app's cascade deleters.
  t0 = Date.now();
  store.transaction(() => {
    for (const id of areaIds) {
      if (store.getRowIds(TABLES.areas).length <= 500) break;
      if (store.hasRow(TABLES.areas, id)) deleteArea(store, id);
    }
  });
  store.transaction(() => {
    for (const id of rootTaskIds) {
      if (store.getRowIds(TABLES.tasks).length <= 12500) break;
      if (store.hasRow(TABLES.tasks, id)) deleteTask(store, id);
    }
  });
  store.transaction(() => {
    for (const id of subTaskIds) {
      if (store.getRowIds(TABLES.tasks).length <= 7500) break;
      if (store.hasRow(TABLES.tasks, id)) deleteTask(store, id);
    }
  });
  const remaining = {
    areas: store.getRowIds(TABLES.areas).length,
    tasks: store.getRowIds(TABLES.tasks).length,
    tombstones: store.getRowIds(TABLES.tombstones).length,
  };
  console.log(`  (deleted in ${Date.now() - t0} ms; remaining ${JSON.stringify(remaining)})`);
  await waitForCounts(db, {
    areas: remaining.areas,
    tasks: remaining.tasks,
    tombstones: remaining.tombstones,
  });
  snaps.push(await snapshot(db, '5. after deleting half (cascade deleters, with tombstones)', 'test-bench-size.db'));

  // Supplementary: same content after VACUUM (on a copy).
  copyFileSync(DB_PATH, VACUUM_PATH);
  const vacDb = await openDatabase(VACUUM_PATH);
  await all(vacDb, 'VACUUM');
  snaps.push(await snapshot(vacDb, '5b. case 5 content after VACUUM (copy)', 'test-bench-size-vacuum.db'));
  vacDb.close();

  // Summary table.
  console.log('\n=== SUMMARY ===');
  console.log('| case | total size | pages | free pages | rows (areas/tasks/tombstones) |');
  console.log('|---|---|---|---|---|');
  for (const s of snaps) {
    const c = s.counts;
    console.log(
      `| ${s.label} | ${fmt(s.totalBytes)} | ${s.pageCount} | ${s.freelistPages} | ${c.areas ?? 0}/${c.tasks ?? 0}/${c.tombstones ?? 0} |`,
    );
  }

  await persister.destroy();
  db.close();
}

main().then(
  () => {
    for (const f of readdirSync(DATA_DIR)) {
      if (f.startsWith('test-bench-size')) unlinkSync(join(DATA_DIR, f));
    }
    console.log('\nbench done; test DBs cleaned up');
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
