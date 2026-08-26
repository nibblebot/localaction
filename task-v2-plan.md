# Task v2 — Projects and Sections removed, all-in on Tasks

Locked decisions from the design interview (2026-08-26). Implement in phase
order; each phase leaves the app buildable.

## The model

1. **Projects and Sections are deleted as concepts.** Only Areas, Tasks, Notes remain.
2. Every task is a **leaf** (stored open/done checkbox) when it has no subtasks,
   or a **parent** (done state derived: every descendant done) when it has ≥1.
   Conversion is dynamic and bidirectional.
3. Parent→leaf conversion **snapshots** the derived state into the stored cell
   (full meter → checked box; partial → open).
4. Roots (top-level tasks) carry a tri-state: **Active** (default) / **Backlog**
   (stored; shelves the whole subtree untouched) / **Done** (fully-complete
   subtree — wins over Backlog). Subtasks inherit through ancestry; no
   per-subtask status.
5. Notes attach to **Areas and Tasks only**. A task's note lives in its detail
   pane; the area Notes section stays.

## Views

6. Area view: one unified list of the area's root tasks grouped
   **Active / Backlog / Done**, with sub-area labeled slices per group,
   standing Backlog drop zone, static Done group. TASKS and Projects headers
   gone; Notes section stays (area + subtree task notes).
7. Inbox: same three groups, no slices.
8. Active and Backlog roots render their **entire** subtree inline (completed
   subtasks visible in place, strikethrough), caret-collapsible.
   `CompletedToggle` deleted.
9. Parent rows show a done/total **progress meter** instead of a checkbox,
   everywhere (area view, inbox, detail panes).
10. Any task with subtasks, any depth, gets a detail pane at `#/t/<id>`:
    subtree, note body, due date, rename/delete. Caret expands inline;
    name-click opens pane. Leaf tasks have no pane.

## Interaction

11. Drag to any position and any level within a rendered view: root↔subtask
    re-parenting both ways, slice-drop changes area ownership, Backlog-drop
    shelves. Done is never a drop target. No Inbox↔area drag (moves happen
    via the detail pane).

## Migration

12. Boot-time, idempotent, runs before `backfillOrder`:
    - project → root task (`placement: area:<id>`, or Inbox when `areaId` null;
      name/dueDate/order copied; backlog status copied)
    - sections flatten: their tasks become direct children of the new root,
      ordered by (section order, task order)
    - project notes re-attach to the new root task (`entityType: 'task'`)
    - area notes untouched
    - project/section rows and tombstones dropped
    - empty project → leaf root task (stored status: open)

---

## Phase 1 — Schema & status core

- [ ] Delete `TABLES.projects`, `TABLES.sections` and their `COLUMNS` from
  `src/data/schema.ts`; drop `PROJECT_STATUS`, `NOTE_ENTITY_TYPE.project`,
  `TOMBSTONE_ENTITY_TYPE.project/.section`.
- [ ] Add a `backlog` cell to the tasks columns (absent = active; only
  meaningful on roots).
- [ ] `src/data/types.ts`: delete `Project`, `Section`, `ProjectInput`,
  `ProjectPatch`, `SectionInput`, `SectionPatch`; remove `project`/`section`
  kinds from `TaskPlacement` (placement becomes `area:<id>` | `task:<id>` |
  absent).
- [ ] `src/data/tasks.ts`: add `getDerivedStatus(store, id)` — leaf → stored
  cell; parent → done iff every descendant effectively done. Replace
  `getEffectiveTaskStatus` internals with it; delete the reopen-ancestors
  gating in `setTaskStatus` (derived parents need no gating).
- [ ] Add `getRootTriState(store, rootId)` → `'active' | 'backlog' | 'done'`
  (done wins over backlog). Backlog read = root's `backlog` cell.
- [ ] Add `setRootBacklog(store, rootId, shelved: boolean)` mutator.
- [ ] Add `snapshotDerivedIntoStored(store, id)` helper for parent→leaf
  conversion (used by move/delete paths in Phase 2).

## Phase 2 — Data layer cutover

- [ ] Delete `src/data/projects.ts`, `src/data/sections.ts`; remove their
  exports from `src/data/index.ts`.
- [ ] `src/data/tasks.ts`: rewrite placement parsing (`parsePlacement`,
  `getRootPlacement`) for the two remaining kinds; orphan/missing-parent
  still resolves to Inbox.
- [ ] Delete `getTasksForProjectDeep` / `useTasksForProjectDeep`; add
  `getAreaRootTaskIds` / `useAreaRootTaskIds` (area-rooted top-level tasks)
  if not already covered by `getAreaTaskIds`.
- [ ] `src/data/order.ts`: remove projects/sections from `ORDER_COLUMNS`;
  delete `reorderProject`, `moveProjectToStatus`. Add
  `moveRootToBacklog(store, rootId, beforeId?)` — sets backlog + sibling
  position in one transaction (cross-group drag writes both).
- [ ] `src/data/deletion.ts`: remove project/section branches; cascade is
  now areas → tasks/notes, tasks → subtree/notes.
- [ ] `src/data/undo.ts`: drop projects/sections from snapshot sets.
- [ ] `src/data/notes.ts`: `entityType` narrows to `area | task`.
- [ ] `src/data/selectors.ts`: `taskOwnership` returns `{ areaId }` only
  (root task name is read at render time); delete `useProjectRollups` /
  `getProjectRollups`; `AreaCount` drops `projectCount`.
- [ ] Conversion writes: in `moveTask` and `deleteTask` paths, when a task
  loses its last subtask, call `snapshotDerivedIntoStored`.

## Phase 3 — Migration

- [ ] `src/data/migrate.ts` (new): idempotent boot migration per decision 12.
  Guard: skip when `TABLES.projects` has no rows (post-migration stores).
- [ ] Preserve `order` values so the unified list interleaves ex-projects and
  ex-area-tasks by their original relative order (they share one sibling
  space under the area now — renumber with midpoint gaps if the two `order`
  sequences collide).
- [ ] Section flattening: children ordered by (section order, in-section
  order); unsectioned project tasks keep their relative order; decide one
  canonical interleave (unsectioned first, then sections by order — matches
  today's render order).
- [ ] Project notes re-attach (`entityType: 'task'`, new entityId).
- [ ] Drop project/section rows + tombstones; leave area notes untouched.
- [ ] Wire into the data-layer boot before `backfillOrder`.
- [ ] Tests: round-trip a fixture store with projects/sections/notes through
  the migration; assert placements, order stability, note re-attachment,
  idempotence (second run is a no-op).

## Phase 4 — Task tree rendering

- [ ] `src/components/tasks/taskTree.ts`: replace `pruneDoneTasks` — done
  tasks are pruned **only** when their effective root is done; completed
  subtasks of an active/backlog parent render in place (checked +
  strikethrough). Delete the `showCompleted` plumbing.
- [ ] Parent rows render the progress meter (done/total) instead of a
  checkbox; leaves keep the checkbox. Meter component can be lifted from
  today's project row.
- [ ] Parent rows get an expand caret (inline collapse) and name-click →
  navigate to `#/t/<id>`.
- [ ] Delete `CompletedToggle.tsx` and `useShowCompleted.ts`; remove the
  toggle from area header, inbox header, project pane (pane dies in
  Phase 5).
- [ ] `TaskList` / `SectionedTaskTree`: collapse into a single tree
  component — no sections, no `hideEmptySections`, no `taskProgress` prop
  drilling (meter is per-row now).

## Phase 5 — Area view & Inbox

- [ ] `AreaView.tsx`: delete `ProjectsSection` + `AreaTasksSection`; add one
  `RootTaskGroups` component — Active / Backlog / Done groups of the area's
  root tasks, sub-area labeled slices per group (pattern from
  `ProjectStatusGroups.tsx`), standing Backlog drop zone, static Done group.
- [ ] Per-group collapse persisted per device (reuse
  `useCollapsedProjectGroups` pattern, renamed).
- [ ] Add affordance: a single add-task input creates Active roots.
- [ ] Notes section unchanged except the rollup no longer includes project
  notes (there are none).
- [ ] `InboxPane.tsx`: same three groups, no slices; remove CompletedToggle.
- [ ] Empty-area dimming in `Sidebar.tsx`: drop `projectCount` from the
  condition (tasks + notes only).

## Phase 6 — Detail pane (`#/t/<id>`)

- [ ] Router: add `#/t/<id>`; delete `#/p/<id>` and `#/p/<id>/notes`;
  selection kind `task`.
- [ ] `TaskPane.tsx` (new, modeled on `ProjectPane.tsx`): header with
  rename/delete/due-date/backlog toggle; body = full subtree (same tree
  component as Phase 4); note body editor (task-scoped notes, markdown,
  from today's project notes pane).
- [ ] Works at any depth: nested subtask name-click navigates to its own
  pane; breadcrumb or back affordance to the parent pane.
- [ ] Sidebar selection mapping: `#/t/<id>` selects the owning area via
  `getRootPlacement` (replaces the `useProject` lookup in `Sidebar.tsx`).
- [ ] Delete `src/components/projects/` wholesale.

## Phase 7 — Drag & drop

- [ ] Root↔subtask re-parenting both directions in the tree (drag onto a row
  = nest; drag between top-level rows = reorder/root). Horizontal intent
  from today's `moveTask` already handles nest/unnest — extend drop targets.
- [ ] Slice-drop changes ownership: dropping a root into a sub-area's slice
  writes `placement: area:<subAreaId>`.
- [ ] Backlog group is a drop target (shelves via `moveRootToBacklog`);
  Done group rejects drops.
- [ ] Cross-group drag within one view (Active ⇄ Backlog) writes status +
  order in one transaction.
- [ ] No drag between Inbox pane and area view (no shared view; moves go
  through the detail pane).

## Phase 8 — Remaining surfaces

- [ ] Due panes (Today/Week): `DueItem.projectName` → owning root task's
  title; `CompletedItem` likewise.
- [ ] `syncLog.ts`: drop Project/Section label maps.
- [ ] `backfillOrder`: areas + tasks only.
- [ ] Delete section-related hooks (`useCollapsedSections` usage for
  project sections; the area-view section collapse it also serves may need
  a renamed survivor).

## Phase 9 — Docs, tests, cleanup

- [ ] `docs/glossary.md`: delete Project, Section, Projects Section, Project
  Row, Project detail/notes pane entries; rewrite Task (tri-state roots,
  leaf/parent), Placement, Note (area|task), Area view, Inbox, UI
  Structure.
- [ ] `docs/architecture.md`: ER diagram + module list minus
  projects/sections; migration module documented.
- [ ] `docs/ux.md`: area view, inbox, task pane, drag behavior.
- [ ] `bun test`: update `tests/data/*` (placement, deletion, order,
  selectors), add migration tests, add derived-status + conversion-snapshot
  tests.
- [ ] `bun run lint` → `bun test` → `bun run build` → `bun run test:e2e`
  (UI behavior changed everywhere).
- [ ] Grep sweep: no remaining `project`/`section` references outside
  migration code and its tests.
