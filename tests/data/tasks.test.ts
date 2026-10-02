import { describe, expect, it, beforeEach, afterEach, vi } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TABLES, COLUMNS, TASK_STATUS } from '../../src/data/schema.ts';
import {
  createTask,
  createTaskAfter,
  updateTask,
  setTaskStatus,
  getTask,
  getInboxTaskIds,
  getAreaTaskIds,
  getRootPlacement,
  getDerivedStatus,
  getRootTriState,
  setRootBacklog,
  snapshotDerivedIntoStored,
  getSubtreeProgress,
  getRootTaskId,
  childTaskIds,
  descendantTaskIds,
  buildTaskTree,
  pruneCompletedTasks,
  encodePlacement,
  decodePlacement,
} from '../../src/data/tasks.ts';
import { deleteTask } from '../../src/data/deletion.ts';
import { createArea } from '../../src/data/areas.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('task placement', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createTask defaults to the Inbox and stores an open task', () => {
    const t = createTask(store, { title: 'Ship it' });
    const row = getTask(store, t);
    expect(row).toBeDefined();
    expect(row?.title).toBe('Ship it');
    expect(row?.status).toBe(TASK_STATUS.open);
    expect(row?.placement).toEqual({ kind: 'inbox' });
    expect(getInboxTaskIds(store)).toContain(t);
  });

  it('createTask stores area / sub-task placements', () => {
    const a = createArea(store, { name: 'Work' });
    const areaTask = createTask(store, {
      title: 'at',
      placement: { kind: 'area', id: a },
    });
    const subTask = createTask(store, {
      title: 'st',
      placement: { kind: 'task', id: areaTask },
    });
    expect(getTask(store, areaTask)?.placement).toEqual({ kind: 'area', id: a });
    expect(getTask(store, subTask)?.placement).toEqual({ kind: 'task', id: areaTask });
  });

  it('updateTask reparents via placement', () => {
    const a = createArea(store, { name: 'Work' });
    const parent = createTask(store, { title: 'parent' });
    const t = createTask(store, { title: 'x', placement: { kind: 'area', id: a } });
    updateTask(store, t, { placement: { kind: 'task', id: parent } });
    expect(getTask(store, t)?.placement).toEqual({ kind: 'task', id: parent });
    updateTask(store, t, { placement: { kind: 'inbox' } });
    expect(getTask(store, t)?.placement).toEqual({ kind: 'inbox' });
  });

  it('updateTask sets and clears a due date (absent cell, never null)', () => {
    const t = createTask(store, { title: 'x' });
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.dueDate)).toBeUndefined();
    expect(getTask(store, t)?.dueDate).toBeNull();
    updateTask(store, t, { dueDate: '2026-08-14' });
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.dueDate)).toBe('2026-08-14');
    expect(getTask(store, t)?.dueDate).toBe('2026-08-14');
    updateTask(store, t, { dueDate: null });
    expect(store.hasCell(TABLES.tasks, t, COLUMNS.tasks.dueDate)).toBe(false);
    expect(getTask(store, t)?.dueDate).toBeNull();
  });

  it('encodePlacement / decodePlacement round-trip the supported kinds', () => {
    const cases = [
      { kind: 'area', id: 'abc' },
      { kind: 'task', id: 'ghi' },
      { kind: 'inbox' },
    ] as const;
    for (const c of cases) {
      expect(decodePlacement(encodePlacement(c))).toEqual(c);
    }
  });

  it('decodePlacement maps legacy project / section placements to Inbox', () => {
    expect(decodePlacement('project:p1')).toEqual({ kind: 'inbox' });
    expect(decodePlacement('section:s1')).toEqual({ kind: 'inbox' });
  });

  it('decodePlacement treats garbage / empty as Inbox', () => {
    expect(decodePlacement(undefined)).toEqual({ kind: 'inbox' });
    expect(decodePlacement('')).toEqual({ kind: 'inbox' });
    expect(decodePlacement('nope:1')).toEqual({ kind: 'inbox' });
    expect(decodePlacement('area:')).toEqual({ kind: 'inbox' });
  });
});

describe('createTaskAfter', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  // Assert through buildTaskTree — the same ordering path the views
  // render with (raw id-list helpers return store insertion order).
  function renderedOrder(ids: readonly string[]): string[] {
    return buildTaskTree(store, ids).children.map((n) => n.id);
  }

  it('inserts the new task directly after the given inbox sibling', () => {
    const a = createTask(store, { title: 'a' });
    const b = createTask(store, { title: 'b' });
    const inserted = createTaskAfter(store, a, '');
    expect(inserted).not.toBeNull();
    expect(renderedOrder(getInboxTaskIds(store))).toEqual([a, inserted!, b]);
  });

  it('inherits the placement of an area / sub-task sibling', () => {
    const area = createArea(store, { name: 'Work' });
    const first = createTask(store, { title: 'one', placement: { kind: 'area', id: area } });
    const second = createTask(store, { title: 'two', placement: { kind: 'area', id: area } });
    const between = createTaskAfter(store, first, '');
    expect(getTask(store, between!)?.placement).toEqual({ kind: 'area', id: area });
    expect(renderedOrder(getAreaTaskIds(store, area))).toEqual([first, between!, second]);

    // Inserting after a top-level task produces a top-level task (never a
    // sub-task); inserting after a sub-task keeps the sub-task's parent.
    const afterBetween = createTaskAfter(store, between!, '');
    expect(getTask(store, afterBetween!)?.placement).toEqual({ kind: 'area', id: area });

    const sub = createTask(store, { title: 'sub', placement: { kind: 'task', id: first } });
    const afterSub = createTaskAfter(store, sub, '');
    expect(getTask(store, afterSub!)?.placement).toEqual({ kind: 'task', id: first });
    const tree = buildTaskTree(store, [first, between!, second, afterBetween!, sub, afterSub!]);
    const firstNode = tree.children.find((n) => n.id === first)!;
    expect(firstNode.children.map((n) => n.id)).toEqual([sub, afterSub!]);
  });

  it('appends at the end when the given task is the last sibling', () => {
    const a = createTask(store, { title: 'a' });
    const b = createTask(store, { title: 'b' });
    const inserted = createTaskAfter(store, b, '');
    expect(renderedOrder(getInboxTaskIds(store))).toEqual([a, b, inserted!]);
  });

  it('returns null and creates nothing when the anchor task is gone', () => {
    const a = createTask(store, { title: 'a' });
    deleteTask(store, a);
    expect(createTaskAfter(store, a, '')).toBeNull();
    expect(getInboxTaskIds(store)).toEqual([]);
  });
});

describe('task ancestry', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('childTaskIds / descendantTaskIds walk the placement `task:` chain', () => {
    const root = createTask(store, { title: 'root' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: root } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: root } });
    const gc = createTask(store, { title: 'gc', placement: { kind: 'task', id: c1 } });
    expect(childTaskIds(store, root).sort()).toEqual([c1, c2].sort());
    expect(descendantTaskIds(store, root).sort()).toEqual([root, c1, c2, gc].sort());
  });

  it('getRootPlacement resolves ownership through the chain', () => {
    const a = createArea(store, { name: 'Work' });
    const root = createTask(store, { title: 'root', placement: { kind: 'area', id: a } });
    const child = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    const gc = createTask(store, { title: 'gc', placement: { kind: 'task', id: child } });
    expect(getRootPlacement(store, gc)).toEqual({ kind: 'area', id: a });
    expect(getRootPlacement(store, root)).toEqual({ kind: 'area', id: a });
  });

  it('getRootPlacement resolves an orphaned sub-task to Inbox', () => {
    const orphan = createTask(store, {
      title: 'orphan',
      placement: { kind: 'task', id: 'missing-parent' },
    });
    expect(getRootPlacement(store, orphan)).toEqual({ kind: 'inbox' });
  });

  it('getAreaTaskIds and getInboxTaskIds partition top-level tasks', () => {
    const a = createArea(store, { name: 'Work' });
    const inbox = createTask(store, { title: 'i' });
    const areaT = createTask(store, { title: 'at', placement: { kind: 'area', id: a } });
    expect(getInboxTaskIds(store)).toEqual([inbox]);
    expect(getAreaTaskIds(store, a)).toEqual([areaT]);
  });
});

describe('getRootTaskId', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns the task itself for a top-level task', () => {
    const t = createTask(store, { title: 't' });
    expect(getRootTaskId(store, t)).toBe(t);
  });

  it('walks the placement `task:` chain to the top-level ancestor', () => {
    const root = createTask(store, { title: 'root' });
    const mid = createTask(store, { title: 'mid', placement: { kind: 'task', id: root } });
    const leaf = createTask(store, { title: 'leaf', placement: { kind: 'task', id: mid } });
    expect(getRootTaskId(store, leaf)).toBe(root);
    expect(getRootTaskId(store, mid)).toBe(root);
    expect(getRootTaskId(store, root)).toBe(root);
  });

  it('returns undefined for a missing row', () => {
    expect(getRootTaskId(store, 'missing')).toBeUndefined();
  });
});

describe('getDerivedStatus', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns undefined for a missing row', () => {
    expect(getDerivedStatus(store, 'missing')).toBeUndefined();
  });

  it('a leaf reflects its stored cell', () => {
    const t = createTask(store, { title: 'x' });
    expect(getDerivedStatus(store, t)).toBe(TASK_STATUS.open);
    setTaskStatus(store, t, TASK_STATUS.done);
    expect(getDerivedStatus(store, t)).toBe(TASK_STATUS.done);
  });

  it('a stored-open parent with all-done children reads done (stored cell ignored)', () => {
    const root = createTask(store, { title: 'root' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: root } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: root } });
    // The parent's stored cell is never written — it stays open.
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.open);
    setTaskStatus(store, c1, TASK_STATUS.done);
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.open);
    setTaskStatus(store, c2, TASK_STATUS.done);
    // Every descendant is now derived-done, so the parent derives done
    // even though its own stored cell is still open.
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.done);
  });

  it('a stored-done parent with an open child reads open (stored cell ignored)', () => {
    const root = createTask(store, { title: 'root' });
    const c = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    setTaskStatus(store, root, TASK_STATUS.done);
    // The child was never written, so it stays stored-open and the
    // parent derived status re-derives to open.
    expect(getDerivedStatus(store, c)).toBe(TASK_STATUS.open);
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.open);
    // Completing the last child flips the parent to derived-done.
    setTaskStatus(store, c, TASK_STATUS.done);
    expect(getDerivedStatus(store, c)).toBe(TASK_STATUS.done);
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.done);
  });

  it('a parent is derived-done only when EVERY descendant is derived-done', () => {
    const root = createTask(store, { title: 'root' });
    const mid = createTask(store, { title: 'mid', placement: { kind: 'task', id: root } });
    const leaf = createTask(store, { title: 'leaf', placement: { kind: 'task', id: mid } });
    const sibling = createTask(store, {
      title: 'sibling',
      placement: { kind: 'task', id: root },
    });
    setTaskStatus(store, leaf, TASK_STATUS.done);
    // mid derived-done (only child done), but sibling still open → root open.
    expect(getDerivedStatus(store, mid)).toBe(TASK_STATUS.done);
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.open);
    setTaskStatus(store, sibling, TASK_STATUS.done);
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.done);
  });

  it('reopening a descendant reopens every ancestor', () => {
    const root = createTask(store, { title: 'root' });
    const mid = createTask(store, { title: 'mid', placement: { kind: 'task', id: root } });
    const leaf = createTask(store, { title: 'leaf', placement: { kind: 'task', id: mid } });
    setTaskStatus(store, root, TASK_STATUS.done);
    setTaskStatus(store, leaf, TASK_STATUS.open);
    expect(getDerivedStatus(store, mid)).toBe(TASK_STATUS.open);
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.open);
  });
});

describe('getRootTriState / setRootBacklog', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('defaults to active for a root with no backlog and an incomplete subtree', () => {
    const root = createTask(store, { title: 'root' });
    expect(getRootTriState(store, root)).toBe('active');
  });

  it('reads backlog when the backlog cell is set', () => {
    const root = createTask(store, { title: 'root' });
    setRootBacklog(store, root, true);
    expect(getRootTriState(store, root)).toBe('backlog');
  });

  it('done wins over backlog when the subtree is fully complete', () => {
    const root = createTask(store, { title: 'root' });
    const c = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    setRootBacklog(store, root, true);
    setTaskStatus(store, c, TASK_STATUS.done);
    // Derived-done takes precedence over the stored backlog shelf.
    expect(getDerivedStatus(store, root)).toBe(TASK_STATUS.done);
    expect(getRootTriState(store, root)).toBe('done');
  });

  it('a done leaf root wins over backlog too', () => {
    const root = createTask(store, { title: 'root' });
    setRootBacklog(store, root, true);
    setTaskStatus(store, root, TASK_STATUS.done);
    expect(getRootTriState(store, root)).toBe('done');
  });

  it('setRootBacklog sets and clears the backlog cell', () => {
    const root = createTask(store, { title: 'root' });
    expect(store.hasCell(TABLES.tasks, root, COLUMNS.tasks.backlog)).toBe(false);
    setRootBacklog(store, root, true);
    expect(store.hasCell(TABLES.tasks, root, COLUMNS.tasks.backlog)).toBe(true);
    expect(getRootTriState(store, root)).toBe('backlog');
    setRootBacklog(store, root, false);
    expect(store.hasCell(TABLES.tasks, root, COLUMNS.tasks.backlog)).toBe(false);
    expect(getRootTriState(store, root)).toBe('active');
  });
});

describe('getSubtreeProgress', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('counts derived-done over all descendants', () => {
    const root = createTask(store, { title: 'root' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: root } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: root } });
    const gc = createTask(store, { title: 'gc', placement: { kind: 'task', id: c1 } });
    setTaskStatus(store, gc, TASK_STATUS.done);
    // Descendants of root: c1, c2, gc (total 3). gc stored-done; c1
    // derived-done (its only child is done); c2 still open → done = 2.
    expect(getSubtreeProgress(store, root)).toEqual({ done: 2, total: 3 });
    setTaskStatus(store, c2, TASK_STATUS.done);
    expect(getSubtreeProgress(store, root)).toEqual({ done: 3, total: 3 });
  });

  it('a leaf has an empty subtree', () => {
    const leaf = createTask(store, { title: 'leaf' });
    expect(getSubtreeProgress(store, leaf)).toEqual({ done: 0, total: 0 });
  });
});

describe('deleteTask conversion snapshot', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('deleting the last child snapshots the parent derived status into its stored cell', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, {
      title: 'child',
      placement: { kind: 'task', id: parent },
    });
    setTaskStatus(store, child, TASK_STATUS.done);
    // The parent's stored cell is still open but it is derived-done
    // because its only child is done.
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.done);
    deleteTask(store, child);
    // The parent is now a leaf; its stored cell must carry the
    // snapshotted derived status (done) with a completedAt stamp.
    expect(childTaskIds(store, parent)).toEqual([]);
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.done);
    expect(store.hasCell(TABLES.tasks, parent, COLUMNS.tasks.completedAt)).toBe(true);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.done);
  });

  it('deleting the last open child snapshots the parent as open', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, {
      title: 'child',
      placement: { kind: 'task', id: parent },
    });
    // A stored-done parent with an open child derives open. Deleting the
    // last child converts the parent to a leaf, so the derived-open
    // status is snapshotted into its stored cell (overwriting done).
    setTaskStatus(store, parent, TASK_STATUS.done);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.open);
    deleteTask(store, child);
    expect(childTaskIds(store, parent)).toEqual([]);
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.open);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.open);
  });

  it('does not snapshot when the parent still has other children', () => {
    const parent = createTask(store, { title: 'parent' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: parent } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: parent } });
    setTaskStatus(store, c2, TASK_STATUS.done);
    deleteTask(store, c1);
    // The parent still has c2, so no conversion snapshot is written.
    // The tell is completedAt: a done snapshot would stamp it, and a
    // still-parented task is never stamped.
    expect(childTaskIds(store, parent)).toEqual([c2]);
    expect(store.hasCell(TABLES.tasks, parent, COLUMNS.tasks.completedAt)).toBe(false);
  });
});

describe('snapshotDerivedIntoStored', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('writes the current derived status into the stored cell', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, {
      title: 'child',
      placement: { kind: 'task', id: parent },
    });
    setTaskStatus(store, child, TASK_STATUS.done);
    // createTask stores status:open on the parent; its derived status is
    // done via the child, so the snapshot must overwrite open with done.
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.open);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.done);
    snapshotDerivedIntoStored(store, parent);
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.done);
    expect(store.hasCell(TABLES.tasks, parent, COLUMNS.tasks.completedAt)).toBe(true);
  });
});

describe('buildTaskTree', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns an empty tree for an empty input', () => {
    const tree = buildTaskTree(store, []);
    expect(tree.id).toBe('__root__');
    expect(tree.children).toEqual([]);
  });

  it('treats every task as a root when none have a task placement', () => {
    const a = createTask(store, { title: 'A' });
    const b = createTask(store, { title: 'B', order: 500 });
    const tree = buildTaskTree(store, [a, b]);
    expect(tree.children.map((n) => n.id)).toEqual([b, a]);
    expect(tree.children.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests sub-tasks under their parent and orders siblings by order cell', () => {
    const root = createTask(store, { title: 'root' });
    const c1 = createTask(store, {
      title: 'c1',
      placement: { kind: 'task', id: root },
    });
    const c2 = createTask(store, {
      title: 'c2',
      placement: { kind: 'task', id: root },
      order: 500,
    });
    const g1 = createTask(store, {
      title: 'g1',
      placement: { kind: 'task', id: c1 },
    });
    const tree = buildTaskTree(store, [root, c1, c2, g1]);
    expect(tree.children.map((n) => n.id)).toEqual([root]);
    const rootNode = tree.children[0]!;
    expect(rootNode.children.map((n) => n.id)).toEqual([c2, c1]);
    expect(rootNode.children[1]!.children.map((n) => n.id)).toEqual([g1]);
  });

  it('orphans any sub-task whose parent is not in the input list', () => {
    const orphan = createTask(store, {
      title: 'orphan',
      placement: { kind: 'task', id: 'missing-parent' },
    });
    const tree = buildTaskTree(store, [orphan]);
    // Orphaned sub-task is rendered as a top-level row so it is not
    // dropped from the visible list.
    expect(tree.children.map((n) => n.id)).toEqual([orphan]);
  });
});

describe('pruneCompletedTasks', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  /** A root with two children, the first of them done. */
  function mixedRoot(): { root: string; doneChild: string; openChild: string } {
    const root = createTask(store, { title: 'root' });
    const doneChild = createTask(store, {
      title: 'done child',
      placement: { kind: 'task', id: root },
    });
    const openChild = createTask(store, {
      title: 'open child',
      placement: { kind: 'task', id: root },
      order: 500,
    });
    setTaskStatus(store, doneChild, TASK_STATUS.done);
    return { root, doneChild, openChild };
  }

  it('drops a fully-completed root with its whole subtree', () => {
    const { root, doneChild, openChild } = mixedRoot();
    setTaskStatus(store, openChild, TASK_STATUS.done);
    const tree = buildTaskTree(store, [root, doneChild, openChild]);
    expect(pruneCompletedTasks(store, tree.children)).toEqual([]);
  });

  it('keeps a not-done parent and prunes only its completed children', () => {
    const { root, doneChild, openChild } = mixedRoot();
    const tree = buildTaskTree(store, [root, doneChild, openChild]);
    const pruned = pruneCompletedTasks(store, tree.children);
    expect(pruned.map((n) => n.id)).toEqual([root]);
    expect(pruned[0]!.children.map((n) => n.id)).toEqual([openChild]);
  });

  it('preserves sibling order among the surviving roots', () => {
    // Explicit orders: the default `nextOrder` is last+1000, so mixing
    // default and explicit orders can collide and fall to the id
    // tiebreak (nondeterministic UUIDs).
    const first = createTask(store, { title: 'first', order: 1000 });
    const second = createTask(store, { title: 'second', order: 2000 });
    const third = createTask(store, { title: 'third', order: 3000 });
    setTaskStatus(store, second, TASK_STATUS.done);
    const tree = buildTaskTree(store, [first, second, third]);
    expect(pruneCompletedTasks(store, tree.children).map((n) => n.id)).toEqual([first, third]);
  });
});

// SLICE 1 — extends below this line
describe('completedAt', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
    // vi.useFakeTimers pins Date.now + new Date() to a single instant
    // so every nowIso() call inside this test returns the same string.
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('setTaskStatus from open -> done stamps an ISO completedAt', () => {
    const t = createTask(store, { title: 'x' });
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt)).toBeUndefined();
    const before = new Date().toISOString();
    setTaskStatus(store, t, TASK_STATUS.done);
    const after = new Date().toISOString();
    const cell = store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(typeof cell).toBe('string');
    // The fake clock never advances, so before === after and the
    // stamped timestamp must equal both ends.
    expect(cell).toBe(before);
    expect(cell).toBe(after);
    expect(getTask(store, t)?.completedAt).toBe(before);
  });

  it('setTaskStatus from done -> open clears the completedAt cell', () => {
    const t = createTask(store, { title: 'x' });
    setTaskStatus(store, t, TASK_STATUS.done);
    expect(store.hasCell(TABLES.tasks, t, COLUMNS.tasks.completedAt)).toBe(true);
    setTaskStatus(store, t, TASK_STATUS.open);
    expect(store.hasCell(TABLES.tasks, t, COLUMNS.tasks.completedAt)).toBe(false);
    expect(getTask(store, t)?.completedAt).toBeNull();
  });

  it('setTaskStatus is a no-op for completedAt when the status is unchanged', () => {
    const t = createTask(store, { title: 'x' });
    setTaskStatus(store, t, TASK_STATUS.done);
    const first = store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(typeof first).toBe('string');
    // Re-set the same status — the timestamp must be preserved
    // (the no-op branch of writeCompletionTimestamp kicks in).
    setTaskStatus(store, t, TASK_STATUS.done);
    const second = store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(second).toBe(first);
  });

  it('updateTask status branch stamps and clears completedAt the same way', () => {
    const t = createTask(store, { title: 'x' });
    updateTask(store, t, { status: TASK_STATUS.done });
    const stamp = store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(typeof stamp).toBe('string');
    updateTask(store, t, { status: TASK_STATUS.open });
    expect(store.hasCell(TABLES.tasks, t, COLUMNS.tasks.completedAt)).toBe(false);
  });

  // SLICE 3 — extends below this line. Round-trip the decode, sibling
  // idempotency, and the bump-side cousin assertions.
  it('decodeTaskRow normalises missing / empty / non-string completedAt cells to null', () => {
    const t = createTask(store, { title: 'x' });
    // Brand-new task: cell is absent → null.
    expect(store.hasCell(TABLES.tasks, t, COLUMNS.tasks.completedAt)).toBe(false);
    expect(getTask(store, t)?.completedAt).toBeNull();

    // Handcraft an empty cell — the row-level reader still resolves to null.
    store.setCell(TABLES.tasks, t, COLUMNS.tasks.completedAt, '');
    expect(getTask(store, t)?.completedAt).toBeNull();

    // Numeric / pathological values stringify via normalizeCompletedAt
    // (CSV-import survival). The decode is permissive — only the
    // plugin path cares about ISO validity.
    store.setCell(TABLES.tasks, t, COLUMNS.tasks.completedAt, 1700000000000);
    expect(getTask(store, t)?.completedAt).toBe('1700000000000');

    // A real ISO string round-trips verbatim.
    const iso = '2026-07-23T10:00:00.000Z';
    store.setCell(TABLES.tasks, t, COLUMNS.tasks.completedAt, iso);
    expect(getTask(store, t)?.completedAt).toBe(iso);
  });

  it('repeated done -> done across the next-status helper keeps the original timestamp', () => {
    const t = createTask(store, { title: 'x' });
    setTaskStatus(store, t, TASK_STATUS.done);
    const first = store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(typeof first).toBe('string');
    // Open + redone must STILL preserve the original stamp — only the
    // non-done → done transition (the actual completion event) writes
    // a fresh timestamp. Replays / undos / sync retries should not
    // silently rewrite history.
    setTaskStatus(store, t, TASK_STATUS.open);
    setTaskStatus(store, t, TASK_STATUS.done);
    const after = store.getCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(after).toBe(first);
  });
});

describe('completion write atomicity', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  // Completion must be ONE transaction: the completedAt stamp and the
  // status/updatedAt write land together. Downstream observers (the sync
  // log's push capture) record one event per transaction — two implicit
  // transactions here read as "2 Tasks" for a single completion.
  const changedCellsFor = (
    s: MergeableStore,
    rowId: string,
    run: () => void,
  ): { finishes: number; cells: string[] } => {
    let finishes = 0;
    let cells: string[] = [];
    const listenerId = s.addDidFinishTransactionListener(() => {
      finishes += 1;
      const [changedTables] = s.getTransactionChanges();
      cells = Object.keys(changedTables[TABLES.tasks]?.[rowId] ?? {});
    });
    run();
    s.delListener(listenerId);
    return { finishes, cells };
  };

  it('setTaskStatus writes completedAt + status + updatedAt in one transaction', () => {
    const t = createTask(store, { title: 'x' });
    const { finishes, cells } = changedCellsFor(store, t, () =>
      setTaskStatus(store, t, TASK_STATUS.done),
    );
    expect(finishes).toBe(1);
    // updatedAt only appears in the net changes when the clock advanced
    // since creation — suite-wide fake timers can freeze it — so assert
    // the two transition cells and let updatedAt be incidental.
    expect(cells).toContain(COLUMNS.tasks.completedAt);
    expect(cells).toContain(COLUMNS.tasks.status);
  });

  it('updateTask with a status patch completes in one transaction', () => {
    const t = createTask(store, { title: 'x' });
    const { finishes, cells } = changedCellsFor(store, t, () =>
      updateTask(store, t, { status: TASK_STATUS.done }),
    );
    expect(finishes).toBe(1);
    expect(cells).toContain(COLUMNS.tasks.completedAt);
    expect(cells).toContain(COLUMNS.tasks.status);
  });
});
