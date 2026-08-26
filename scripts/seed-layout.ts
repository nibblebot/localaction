/**
 * Layout seed: populates a throwaway SQLite file in the OS temp dir with an
 * area tree + root tasks/subtasks so the layout pass has a
 * representative working surface in the browser.
 *
 * Usage: bun scripts/seed-layout.ts
 *   → prints the exact `bun run dev --db "<tmp path>"` command to browse it.
 *
 * Strategy: write directly to the SQLite file via the same tabular
 * persister the dev server uses, so no server / mergeable-sync dance
 * is needed and the autoSave timer never races a closed handle.
 */
import { createStore } from 'tinybase';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Row, Tables } from 'tinybase';
import { openDatabase } from '../server/db.ts';
import { createServerTabularPersister } from '../server/persister.ts';
import { newId, nowIso } from '../src/data/internal.ts';
import {
  TABLES,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
} from '../src/data/schema.ts';

// Unique per run, so a stale -wal/-shm pair from a previous seed can never
// trip the open; the OS reaps tmp.
const DB_PATH = join(
  tmpdir(),
  `localaction-test-layout-${Date.now()}-${process.pid}.db`,
);

function buildTables(): Tables {
  const ts = nowIso();

  const areas: Record<string, Row> = {};
  const tasks: Record<string, Row> = {};
  const notes: Record<string, Row> = {};

  // Areas
  const aWork = newId();
  areas[aWork] = {
    name: 'Work',
    color: 'purple',
    parentId: null,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };

  const aPersonal = newId();
  areas[aPersonal] = {
    name: 'Personal',
    color: 'blue',
    parentId: null,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Sub-areas under Work (two levels deep — exercises breadcrumb chain)
  const aClientA = newId();
  areas[aClientA] = {
    name: 'Client A',
    color: 'pink',
    parentId: aWork,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const aClientASprint = newId();
  areas[aClientASprint] = {
    name: 'Q3 Sprint',
    color: 'amber',
    parentId: aClientA,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };

  const aClientB = newId();
  areas[aClientB] = {
    name: 'Client B',
    color: 'green',
    parentId: aWork,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Root tasks (former top-level groupings, now plain task trees)

  // Website redesign — root under Client A with a deep subtree
  const rRedesign = newId();
  tasks[rRedesign] = {
    title: 'Website redesign',
    placement: `area${':'}${aClientA}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };

  const tSetup = newId();
  tasks[tSetup] = {
    title: 'Set up staging environment',
    placement: `task${':'}${rRedesign}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };

  const tResearch = newId();
  tasks[tResearch] = {
    title: 'Audit current site analytics',
    placement: `task${':'}${rRedesign}`,
    status: TASK_STATUS.open,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tResearchGA = newId();
  tasks[tResearchGA] = {
    title: 'Pull last 90 days of GA4 traffic',
    placement: `task${':'}${tResearch}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tResearchGAExport = newId();
  tasks[tResearchGAExport] = {
    title: 'Export the raw CSV to shared drive',
    placement: `task${':'}${tResearchGA}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tResearchInterviews = newId();
  tasks[tResearchInterviews] = {
    title: 'Schedule 5 user interviews',
    placement: `task${':'}${tResearch}`,
    status: TASK_STATUS.open,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tSitemap = newId();
  tasks[tSitemap] = {
    title: 'Draft new sitemap',
    placement: `task${':'}${rRedesign}`,
    status: TASK_STATUS.open,
    order: 3000,
    createdAt: ts,
    updatedAt: ts,
  };

  const tTokens = newId();
  tasks[tTokens] = {
    title: 'Lock in colour and type tokens',
    placement: `task${':'}${rRedesign}`,
    status: TASK_STATUS.open,
    order: 4000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tTokensIris = newId();
  tasks[tTokensIris] = {
    title: 'Iris ramp from wash → 700',
    placement: `task${':'}${tTokens}`,
    status: TASK_STATUS.done,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tComponents = newId();
  tasks[tComponents] = {
    title: 'Component inventory: buttons, rows, inputs',
    placement: `task${':'}${rRedesign}`,
    status: TASK_STATUS.open,
    order: 5000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Database migration — root under Client A
  const rMigration = newId();
  tasks[rMigration] = {
    title: 'Database migration to Postgres',
    placement: `area${':'}${aClientA}`,
    status: TASK_STATUS.open,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tSchema = newId();
  tasks[tSchema] = {
    title: 'Reverse-engineer existing schema',
    placement: `task${':'}${rMigration}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tSqlite = newId();
  tasks[tSqlite] = {
    title: 'A very long task title that should wrap inside the row without breaking the card layout or pushing the actions cluster out of the available width — used to verify the squint test under text-heavy content',
    placement: `task${':'}${rMigration}`,
    status: TASK_STATUS.open,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Client onboarding playbook — root under Client B
  const rOnboarding = newId();
  tasks[rOnboarding] = {
    title: 'Client onboarding playbook',
    placement: `area${':'}${aClientB}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tIntake = newId();
  tasks[tIntake] = {
    title: 'Welcome email sequence',
    placement: `task${':'}${rOnboarding}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Done root (exercises the done-group styling): every subtask done
  const rLegacy = newId();
  tasks[rLegacy] = {
    title: 'Legacy CMS deprecation',
    placement: `area${':'}${aClientA}`,
    status: TASK_STATUS.open,
    order: 3000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tLegacy1 = newId();
  tasks[tLegacy1] = {
    title: 'Identify in-flight content',
    placement: `task${':'}${rLegacy}`,
    status: TASK_STATUS.done,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tLegacy2 = newId();
  tasks[tLegacy2] = {
    title: 'Redirect map to new structure',
    placement: `task${':'}${rLegacy}`,
    status: TASK_STATUS.done,
    order: 2000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Personal root
  const rBudget = newId();
  tasks[rBudget] = {
    title: 'Household budget review',
    placement: `area${':'}${aPersonal}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tBudget = newId();
  tasks[tBudget] = {
    title: 'Categorise last 3 months of expenses',
    placement: `task${':'}${rBudget}`,
    status: TASK_STATUS.open,
    order: 1000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Area-level leaf tasks on Client A (no subtasks)
  const tArea = newId();
  tasks[tArea] = {
    title: 'Renew vendor insurance',
    placement: `area${':'}${aClientA}`,
    status: TASK_STATUS.open,
    order: 4000,
    createdAt: ts,
    updatedAt: ts,
  };
  const tArea2 = newId();
  tasks[tArea2] = {
    title: 'Q3 capacity planning conversation with PM',
    placement: `area${':'}${aClientA}`,
    status: TASK_STATUS.open,
    order: 5000,
    createdAt: ts,
    updatedAt: ts,
  };

  // Notes
  notes[newId()] = {
    slug: 'client-a-context',
    title: 'Client A context',
    body: 'Client A — strategic partner since 2022, ~40% of annual revenue. Quarterly business reviews in March, June, September, December.',
    entityType: NOTE_ENTITY_TYPE.area,
    entityId: aClientA,
    createdAt: ts,
    updatedAt: ts,
  };
  notes[newId()] = {
    slug: 'design-principles',
    title: 'Design principles for the redesign',
    body: 'One voice. Tonal elevation. Inline-first. No features without craft.',
    entityType: NOTE_ENTITY_TYPE.task,
    entityId: rRedesign,
    createdAt: ts,
    updatedAt: ts,
  };

  return {
    [TABLES.areas]: areas,
    [TABLES.tasks]: tasks,
    [TABLES.notes]: notes,
  };
}

async function main(): Promise<void> {
  const tables = buildTables();
  const store = createStore().setTables(tables);

  const db = await openDatabase(DB_PATH);
  const persister = createServerTabularPersister(store, db);
  await persister.save();

  const rowCounts = Object.fromEntries(
    Object.entries(tables).map(([t, rows]) => [t, Object.keys(rows).length]),
  );
  console.log('seed: wrote', DB_PATH);
  console.log('seed: rows', rowCounts);
  console.log(`seed: next → bun run dev --db "${DB_PATH}"`);

  db.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('seed: failed', err);
    process.exit(1);
  },
);
