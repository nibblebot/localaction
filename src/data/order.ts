import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { normalizeRelation, nowIso, row } from './internal.ts';

/**
 * Ordering helpers for entities that support drag-and-drop reordering.
 *
 * The strategy is a "float key between neighbours": each row carries a
 * `number` `order` cell; the relative order of rows is the order of
 * their keys. To move a row to a position between two neighbours, set
 * its `order` to the midpoint of the two neighbours' keys. If the new
 * position is at an end, pick the nearest neighbour's key ± 1.
 *
 * When the gap between neighbours is too small to add new rows without
 * losing precision, the parent's full set is renormalised to evenly
 * spaced integers (1, 2, 3, …). This keeps floats from collapsing
 * after many reorders.
 *
 * `order` is purely relative — its absolute value is not meaningful
 * across reorders or devices. Row-level LWW (ADR-0002) keeps the
 * last-edit's position authoritative when two devices move a row
 * concurrently.
 */

const RENORMALIZE_SPACING = 1000;
const MIN_GAP = 1e-6;

interface SiblingRow {
  id: string;
  order: number;
}

type OrderedTable =
  | typeof TABLES.areas
  | typeof TABLES.projects
  | typeof TABLES.tasks;

interface OrderColumns {
  table: OrderedTable;
  parent: string;
  order: string;
  updatedAt: string;
}

const ORDER_COLUMNS: Record<OrderedTable, OrderColumns> = {
  [TABLES.areas]: {
    table: TABLES.areas,
    parent: COLUMNS.areas.parentId,
    order: COLUMNS.areas.order,
    updatedAt: COLUMNS.areas.updatedAt,
  },
  [TABLES.projects]: {
    table: TABLES.projects,
    parent: COLUMNS.projects.areaId,
    order: COLUMNS.projects.order,
    updatedAt: COLUMNS.projects.updatedAt,
  },
  [TABLES.tasks]: {
    table: TABLES.tasks,
    parent: COLUMNS.tasks.placement,
    order: COLUMNS.tasks.order,
    updatedAt: COLUMNS.tasks.updatedAt,
  },
};

function readOrder(store: MergeableStore, table: OrderedTable, rowId: string): number {
  const v = store.getCell(table, rowId, ORDER_COLUMNS[table].order);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function writeOrder(
  store: MergeableStore,
  table: OrderedTable,
  rowId: string,
  value: number,
): void {
  store.setCell(table, rowId, ORDER_COLUMNS[table].order, value);
}

/**
 * Read all `order` cells for a sibling group in one pass, returning a
 * dense array of `{ id, order }` ordered ascending by `order`. Used
 * internally by the reorder helpers and exported so callers can render
 * a list in the canonical order without re-implementing the walk.
 */
export function readSiblingOrders(
  store: MergeableStore,
  table: OrderedTable,
  parentColumn: string,
  parentId: string | null,
): SiblingRow[] {
  const out: SiblingRow[] = [];
  for (const id of store.getRowIds(table)) {
    const p = store.getCell(table, id, parentColumn);
    const pNorm = p === undefined || p === null || p === '' ? null : String(p);
    if (pNorm !== parentId) continue;
    out.push({ id, order: readOrder(store, table, id) });
  }
  out.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
  return out;
}

/**
 * Renormalise the entire sibling group to evenly-spaced integers
 * starting at `RENORMALIZE_SPACING`. Single transaction so subscribers
 * see one change.
 */
function renormalize(
  store: MergeableStore,
  table: OrderedTable,
  siblings: SiblingRow[],
): void {
  store.transaction(() => {
    for (let i = 0; i < siblings.length; i += 1) {
      const item = siblings[i]!;
      writeOrder(store, table, item.id, (i + 1) * RENORMALIZE_SPACING);
    }
  });
}

/**
 * Compute the `order` value to place `movingId` immediately before
 * `beforeId` (i.e. between the previous neighbour and `beforeId`). If
 * `beforeId` is undefined, the row moves to the end of the list.
 *
 * If the gap between the previous neighbour and `beforeId` is smaller
 * than `MIN_GAP`, renormalises the whole sibling group to make room.
 *
 * Returns the new `order` value the caller should write into the
 * moving row.
 */
function computeInsertOrder(
  store: MergeableStore,
  table: OrderedTable,
  siblings: SiblingRow[],
  movingId: string,
  beforeId: string | undefined,
): number {
  const filtered = siblings.filter((s) => s.id !== movingId);
  const beforeIdx = beforeId
    ? filtered.findIndex((s) => s.id === beforeId)
    : -1;
  if (beforeIdx === -1) {
    // Move to end
    const last = filtered[filtered.length - 1];
    if (!last) return RENORMALIZE_SPACING;
    if (
      !Number.isFinite(last.order + RENORMALIZE_SPACING) ||
      last.order + RENORMALIZE_SPACING === last.order
    ) {
      renormalize(store, table, filtered);
      return computeInsertOrder(store, table, filtered, movingId, beforeId);
    }
    return last.order + RENORMALIZE_SPACING - MIN_GAP;
  }
  const prev = filtered[beforeIdx - 1];
  const next = filtered[beforeIdx]!;
  if (!prev) {
    // Move to start
    const half = next.order / 2;
    if (!Number.isFinite(half) || half <= 0 || half === next.order) {
      renormalize(store, table, filtered);
      return computeInsertOrder(store, table, filtered, movingId, beforeId);
    }
    return half;
  }
  const midpoint = (prev.order + next.order) / 2;
  if (
    !Number.isFinite(midpoint) ||
    midpoint === prev.order ||
    midpoint === next.order
  ) {
    renormalize(store, table, filtered);
    return computeInsertOrder(store, table, filtered, movingId, beforeId);
  }
  return midpoint;
}

/**
 * Move `movingId` to the position immediately before `beforeId` within
 * the sibling group defined by (`parentColumn` = `parentId`). If
 * `beforeId` is undefined, the row is moved to the end of the group.
 */
function moveWithinSiblings(
  store: MergeableStore,
  columns: OrderColumns,
  parentId: string | null,
  movingId: string,
  beforeId: string | undefined,
): void {
  if (!store.hasRow(columns.table, movingId)) return;
  if (beforeId !== undefined && !store.hasRow(columns.table, beforeId)) return;
  if (beforeId === movingId) return;
  const siblings = readSiblingOrders(store, columns.table, columns.parent, parentId);
  const newOrder = computeInsertOrder(store, columns.table, siblings, movingId, beforeId);
  store.transaction(() => {
    // A null parent is stored as an absent cell (mirrors updateArea /
    // updateTask); `row()` strips nulls, so delete the cell explicitly.
    if (parentId === null) {
      store.delCell(columns.table, movingId, columns.parent);
    }
    store.setPartialRow(
      columns.table,
      movingId,
      row({
        [columns.parent]: parentId,
        [columns.order]: newOrder,
        [columns.updatedAt]: nowIso(),
      }),
    );
  });
}

/**
 * Move an area to a new sibling position under `parentId`, reparenting
 * it when `parentId` differs from its current parent (`null` = root
 * areas). A single write updates parent + order so subscribers see one
 * change.
 *
 * Refused (no-op) when the target parent is missing, or when the move
 * would create a cycle — `parentId` being the area itself or one of
 * its descendants.
 */
export function moveArea(
  store: MergeableStore,
  areaId: string,
  parentId: string | null,
  beforeId: string | undefined,
): void {
  if (!store.hasRow(TABLES.areas, areaId)) return;
  if (parentId !== null) {
    if (!store.hasRow(TABLES.areas, parentId)) return;
    // Cycle guard: walking up the ancestor chain from the target
    // parent must never reach the moving area.
    let cur: string | null = parentId;
    while (cur !== null) {
      if (cur === areaId) return;
      cur = normalizeRelation(store.getCell(TABLES.areas, cur, COLUMNS.areas.parentId));
    }
  }
  moveWithinSiblings(
    store,
    ORDER_COLUMNS[TABLES.areas],
    parentId,
    areaId,
    beforeId,
  );
}

/**
 * Move a project to a new sibling position within its current area.
 * Reordering across areas is not supported by this helper — move
 * the project with `updateProject({ areaId })` first.
 */
export function reorderProject(
  store: MergeableStore,
  projectId: string,
  beforeId: string | undefined,
): void {
  if (!store.hasRow(TABLES.projects, projectId)) return;
  const areaId = normalizeRelation(
    store.getCell(TABLES.projects, projectId, COLUMNS.projects.areaId),
  );
  moveWithinSiblings(
    store,
    ORDER_COLUMNS[TABLES.projects],
    areaId,
    projectId,
    beforeId,
  );
}

/**
 * Move a task to a new sibling position within `placement`, reparenting
 * it when the placement differs from its current one. `placement` is
 * the encoded cell value (ADR-0001: `project:<id>`, `area:<id>`,
 * `task:<id>`, or `null` for the Inbox). A single write updates
 * placement + order so subscribers see one change.
 *
 * Refused (no-op) when the target parent row is missing, or when the
 * target is `task:<id>` and the move would create a cycle — the parent
 * task being the moving task itself or one of its descendants.
 *
 * The placement string is parsed locally to avoid an import cycle
 * (tasks.ts already imports this module).
 */
export function moveTask(
  store: MergeableStore,
  taskId: string,
  placement: string | null,
  beforeId: string | undefined,
): void {
  if (!store.hasRow(TABLES.tasks, taskId)) return;
  if (placement !== null) {
    const sep = placement.indexOf(':');
    const kind = sep > 0 ? placement.slice(0, sep) : '';
    const parentRef = sep > 0 ? placement.slice(sep + 1) : '';
    if (kind === 'task') {
      if (!store.hasRow(TABLES.tasks, parentRef)) return;
      // Cycle guard: walking up the placement chain from the target
      // parent must never reach the moving task.
      let cur: string | null = parentRef;
      while (cur !== null) {
        if (cur === taskId) return;
        const p = normalizeRelation(
          store.getCell(TABLES.tasks, cur, COLUMNS.tasks.placement),
        );
        cur = p !== null && p.startsWith('task:') ? p.slice(5) : null;
      }
    } else if (kind === 'project') {
      if (!store.hasRow(TABLES.projects, parentRef)) return;
    } else if (kind === 'area') {
      if (!store.hasRow(TABLES.areas, parentRef)) return;
    } else {
      return;
    }
  }
  moveWithinSiblings(
    store,
    ORDER_COLUMNS[TABLES.tasks],
    placement,
    taskId,
    beforeId,
  );
}

/**
 * Backfill `order` for any rows that are missing it. Called from the
 * data-layer provider on first boot after a schema upgrade so legacy
 * rows get a deterministic float spread that doesn't collide.
 *
 * Idempotent: rows that already have an `order` are left alone.
 */
export function backfillOrder(store: MergeableStore): void {
  // Tasks already had `order` per the original schema; skip if all set.
  // Areas and projects are the new ones.
  store.transaction(() => {
    for (const table of [TABLES.areas, TABLES.projects] as const) {
      const columns = ORDER_COLUMNS[table];
      // Group row ids by their parent scope.
      const groups = new Map<string, string[]>();
      for (const id of store.getRowIds(table)) {
        const p = store.getCell(table, id, columns.parent);
        const key = p === undefined || p === null || p === '' ? '' : String(p);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(id);
      }
      for (const ids of groups.values()) {
        // Stable initial order: by createdAt asc, then id. We have to
        // read cells imperatively; this is a one-time migration.
        ids.sort((a, b) => {
          const ta = String(store.getCell(table, a, 'createdAt') ?? '');
          const tb = String(store.getCell(table, b, 'createdAt') ?? '');
          if (ta !== tb) return ta.localeCompare(tb);
          return a.localeCompare(b);
        });
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i]!;
          const cur = store.getCell(table, id, columns.order);
          if (cur === undefined || cur === null) {
            const seed = (i + 1) * RENORMALIZE_SPACING + idHash(id);
            writeOrder(store, table, id, seed);
          }
        }
      }
    }
  });
}

/**
 * Cheap deterministic 32-bit hash of an id string. Used to seed
 * initial `order` values so distinct rows get distinct float keys
 * even when their creation timestamps collide.
 */
function idHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mix into [1, 999) so the seed never collides with the integer
  // spacing used during renormalisation.
  return ((h >>> 0) % 999) + 1;
}
