import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import { newId, row } from './internal.ts';

/**
 * Legacy table/cell identifiers. Projects and Sections were removed
 * from the schema (and `TABLES`/`COLUMNS` constants) in Task v2, so the
 * migration reads and writes these by literal string only — it must run
 * against stores that predate the new schema. The tasks table uses the
 * (current) `TABLES.tasks` constant and the new `backlog` column.
 */
const LEGACY_TABLES = {
  projects: 'projects',
  sections: 'sections',
  notes: 'notes',
  tombstones: 'tombstones',
} as const;

/** Legacy placement prefixes — project roots referenced their container directly. */
const LEGACY_PROJECT_PLACEMENT = 'project:';
const LEGACY_SECTION_PLACEMENT = 'section:';

const LEGACY_STATUS_BACKLOG = 'backlog';

/** Spacing between sibling `order` values in the renumbered lists. */
const ORDER_SPACING = 1000;

interface LegacyProjectSnapshot {
  id: string;
  name: string;
  areaId: string | null;
  dueDate: string | null;
  backlog: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface SectionRef {
  id: string;
  projectId: string;
  order: number;
}

interface LegacyTaskOrder {
  id: string;
  order: number;
}

/**
 * Migrate legacy Projects and Sections into the Tasks-only model.
 *
 * Boot-time, idempotent, and runs before `backfillOrder` in the data
 * layer. When the legacy `projects` table has no rows (a post-migration
 * store, or a second run) this is a no-op.
 *
 * The whole migration is one `store.transaction`, so subscribers observe
 * a single change.
 */
export function migrateProjectsToTasks(store: MergeableStore): void {
  const projectIds = store.getRowIds(LEGACY_TABLES.projects);
  if (projectIds.length === 0) return;

  store.transaction(() => {
    const legacyCell = (table: string, rowId: string, cell: string): string | null => {
      const value = store.getCell(table, rowId, cell);
      if (value === undefined || value === null || value === '') return null;
      return String(value);
    };
    const legacyOrder = (table: string, rowId: string): number =>
      Number(store.getCell(table, rowId, 'order') ?? 0);

    const projects = projectIds
      .map(
        (id): LegacyProjectSnapshot => ({
          id,
          name: legacyCell(LEGACY_TABLES.projects, id, 'name') ?? '',
          areaId: legacyCell(LEGACY_TABLES.projects, id, 'areaId'),
          dueDate: legacyCell(LEGACY_TABLES.projects, id, 'dueDate'),
          backlog:
            store.getCell(LEGACY_TABLES.projects, id, 'status') === LEGACY_STATUS_BACKLOG,
          order: legacyOrder(LEGACY_TABLES.projects, id),
          createdAt: legacyCell(LEGACY_TABLES.projects, id, 'createdAt') ?? '',
          updatedAt: legacyCell(LEGACY_TABLES.projects, id, 'updatedAt') ?? '',
        }),
      )
      .sort((a, b) =>
        a.order !== b.order
          ? a.order - b.order
          : a.createdAt !== b.createdAt
            ? a.createdAt.localeCompare(b.createdAt)
            : a.id.localeCompare(b.id),
      );

    // Create a root task per project, reusing the project's own id
    // whenever possible (note entityIds then stay valid). When a task row
    // already occupies that id, generate a fresh id and use it everywhere.
    const rootIdByProject = new Map<string, string>();
    for (const p of projects) {
      const rootId = store.hasRow(TABLES.tasks, p.id) ? newId() : p.id;
      rootIdByProject.set(p.id, rootId);
      store.setRow(
        TABLES.tasks,
        rootId,
        row({
          [COLUMNS.tasks.title]: p.name,
          [COLUMNS.tasks.placement]: p.areaId === null ? null : `area:${p.areaId}`,
          [COLUMNS.tasks.status]: TASK_STATUS.open,
          [COLUMNS.tasks.dueDate]: p.dueDate,
          [COLUMNS.tasks.backlog]: p.backlog ? true : undefined,
          [COLUMNS.tasks.order]: p.order,
          [COLUMNS.tasks.createdAt]: p.createdAt,
          [COLUMNS.tasks.updatedAt]: p.updatedAt,
        }),
      );
    }

    // Flatten sections: each root's direct children are the unsectioned
    // project-rooted tasks first, then each section's tasks ordered by
    // (section order, in-section order). Only this flattened top level is
    // renumbered 1000-spaced — nested subtasks keep their sibling orders.
    for (const p of projects) {
      const rootId = rootIdByProject.get(p.id)!;
      const unsectioned = legacyTasksWithPlacement(store, LEGACY_PROJECT_PLACEMENT + p.id);
      const sections = store
        .getRowIds(LEGACY_TABLES.sections)
        .map(
          (id): SectionRef => ({
            id,
            projectId: String(
              store.getCell(LEGACY_TABLES.sections, id, 'projectId') ?? '',
            ),
            order: legacyOrder(LEGACY_TABLES.sections, id),
          }),
        )
        .filter((s) => s.projectId === p.id)
        .sort((a, b) =>
          a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id),
        );
      const children = [...unsectioned];
      for (const s of sections) {
        children.push(...legacyTasksWithPlacement(store, LEGACY_SECTION_PLACEMENT + s.id));
      }
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i]!;
        store.setCell(
          TABLES.tasks,
          child.id,
          COLUMNS.tasks.placement,
          `task:${rootId}`,
        );
        store.setCell(
          TABLES.tasks,
          child.id,
          COLUMNS.tasks.order,
          (i + 1) * ORDER_SPACING,
        );
      }
    }

    // Sibling interleave: ex-project roots join the area's existing
    // area-rooted tasks (or inbox roots when areaId is null) in one
    // sibling space. Merge by (order, createdAt, id) so the unified list
    // reproduces each source's relative order without collisions, then
    // renumber every root in the group 1000-spaced.
    const rootsByArea = new Map<
      string | null,
      Array<{ id: string; order: number; createdAt: string }>
    >();
    for (const p of projects) {
      const rootId = rootIdByProject.get(p.id)!;
      const roots = rootsByArea.get(p.areaId);
      const entry = {
        id: rootId,
        order: Number(store.getCell(TABLES.tasks, rootId, COLUMNS.tasks.order) ?? 0),
        createdAt: String(store.getCell(TABLES.tasks, rootId, COLUMNS.tasks.createdAt) ?? ''),
      };
      if (roots) roots.push(entry);
      else rootsByArea.set(p.areaId, [entry]);
    }
    for (const [areaId, roots] of rootsByArea) {
      const encoded = areaId === null ? null : `area:${areaId}`;
      const siblings = [...roots];
      for (const id of store.getRowIds(TABLES.tasks)) {
        const placement = store.getCell(TABLES.tasks, id, COLUMNS.tasks.placement);
        const key = placement === undefined || placement === null ? null : String(placement);
        if (key !== encoded) continue;
        if (roots.some((r) => r.id === id)) continue;
        siblings.push({
          id,
          order: Number(store.getCell(TABLES.tasks, id, COLUMNS.tasks.order) ?? 0),
          createdAt: String(store.getCell(TABLES.tasks, id, COLUMNS.tasks.createdAt) ?? ''),
        });
      }
      siblings.sort((a, b) =>
        a.order !== b.order
          ? a.order - b.order
          : a.createdAt !== b.createdAt
            ? a.createdAt.localeCompare(b.createdAt)
            : a.id.localeCompare(b.id),
      );
      for (let i = 0; i < siblings.length; i += 1) {
        store.setCell(
          TABLES.tasks,
          siblings[i]!.id,
          COLUMNS.tasks.order,
          (i + 1) * ORDER_SPACING,
        );
      }
    }

    // Project notes re-attach to the new root task (entityType 'task').
    // When the project id was reused the entityId already points at the
    // task, so only the type flips; a regenerated id also rewrites entityId.
    // Area notes are untouched.
    for (const nid of store.getRowIds(LEGACY_TABLES.notes)) {
      if (store.getCell(LEGACY_TABLES.notes, nid, 'entityType') !== 'project') continue;
      const entityId = String(store.getCell(LEGACY_TABLES.notes, nid, 'entityId') ?? '');
      const rootId = rootIdByProject.get(entityId);
      if (rootId === undefined) continue;
      store.setCell(LEGACY_TABLES.notes, nid, 'entityType', 'task');
      if (rootId !== entityId) {
        store.setCell(LEGACY_TABLES.notes, nid, 'entityId', rootId);
      }
    }

    // Drop the legacy rows and the tombstones that referenced them.
    for (const id of store.getRowIds(LEGACY_TABLES.sections)) {
      store.delRow(LEGACY_TABLES.sections, id);
    }
    for (const id of projectIds) {
      store.delRow(LEGACY_TABLES.projects, id);
    }
    for (const tid of store.getRowIds(LEGACY_TABLES.tombstones)) {
      const entityType = store.getCell(LEGACY_TABLES.tombstones, tid, 'entityType');
      if (entityType === 'project' || entityType === 'section') {
        store.delRow(LEGACY_TABLES.tombstones, tid);
      }
    }
  });
}

/** Top-level legacy tasks whose placement cell equals exactly `encoded`. */
function legacyTasksWithPlacement(
  store: MergeableStore,
  encoded: string,
): LegacyTaskOrder[] {
  const out: LegacyTaskOrder[] = [];
  for (const id of store.getRowIds(TABLES.tasks)) {
    const p = store.getCell(TABLES.tasks, id, COLUMNS.tasks.placement);
    if (String(p ?? '') !== encoded) continue;
    out.push({
      id,
      order: Number(store.getCell(TABLES.tasks, id, COLUMNS.tasks.order) ?? 0),
    });
  }
  out.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id),
  );
  return out;
}