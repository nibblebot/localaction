# Glossary

The domain vocabulary for LocalAction. Use these terms when writing issues or any project context. Don't drift to synonyms; if you need a concept that isn't here, that's a signal either to reconsider or to grow the glossary.

## Area

An ongoing area of life or practice that has no end state. Top-level container for sub-Areas and Tasks. Examples: "Family", "Work", "Health".

## Sub-Area

A nested Area. Same semantics as Area — ongoing, container — but lives under a parent Area.

## Task

The unit of action. A Task is either a **leaf** — the smallest owned, unowned, or contained responsibility — or a **parent** when it has at least one subtask.

A leaf Task carries a stored `open` / `done` status (the done checkbox). A parent Task has **no meaningful stored status of its own**: its done state is **derived** — it is done iff every descendant is derived-done. Parent rows therefore render a done/total [progress meter](#progress-meter) instead of a checkbox. Conversion is dynamic and bidirectional: adding a first subtask makes a leaf a parent (its stored status becomes the derived driver for the subtree); a parent whose last subtask is removed **snapshots** its current derived status into the stored cell, becoming a leaf again (full meter → checked box; partial → open).

A root Task (see [Root Task](#root-task)) carries a tri-state — **Active** / **Backlog** / **Done** — that every descendant inherits through ancestry; subtasks themselves carry no per-subtask status.

## Root Task

A top-level Task: one whose [placement](#placement) is `area:<id>` (owned by an Area) or absent (an [Inbox](#inbox) unassociated Task). Only root Tasks hold placement ownership; every descendant resolves its owner through ancestry, and moving a root Task moves the whole tree.

A root Task carries exactly one of three states — its **tri-state**:

- **Active** — the default when it has no stored [Backlog](#backlog) status.
- **Backlog** — a stored status that shelves the whole subtree untouched.
- **Done** — derived: every descendant is derived-done. Done **wins over** Backlog, so a shelved root whose subtree completes reads Done.

Only Backlog persists as a cell; Active and Done are derived.

## Area Task

A [Root Task](#root-task) that belongs directly to an Area (`placement: area:<id>`) and appears in that Area's [Area view](#area-view). Not yet a synonym for "task": a subtask's owner resolves through its root, not directly.

## Backlog

The stored root [tri-state](#root-task) that shelves a root Task and its entire subtree out of the Active group without touching any stored statuses. Backlog is the only persistent status cell (`backlog` on the tasks row); Active and Done are derived. Shelving or restoring a root is a single transaction that writes the status and the new sibling position together (see [Task Group](#task-group) drag).

## Inbox

The view of unassociated root Tasks — roots with no [placement](#placement). It shows the same three [Task groups](#task-group) as the [Area view](#area-view) — Active, Backlog, Done — with no sub-area slices. Inbox membership is derived from the absence of an `area:<id>` placement; the Inbox is not another task container.

## Recurring Task (reserved)

An Area Task that fires on a recurrence rule (e.g. every Monday). It is distinguished from a one-off Area Task by its recurrence rule, not by ownership. Not implemented; reserved for future work.

## Note

A markdown body attached to exactly one entity of type **Area** or **Task**. A Task's note lives in its detail pane; an Area's notes live in the [Notes section](#notes-section). Rendered with markdown-it: CommonMark, raw HTML disabled, bare URLs auto-linked.

## Slug

A URL-safe identifier for a Note, derived from its title. Unique across all Notes (numeric suffixes break ties; an untitled Note starts from `note`) and re-derived whenever the title changes — renames do not preserve it.

## Placement

A Task's ownership cell: a discriminated string naming exactly one owner — `area:<id>` for a root Task, `task:<id>` for a subtask, absent for an [Inbox](#inbox) root. Unknown or legacy placement strings resolve to Inbox. Only the root Task carries ownership; descendants resolve theirs through ancestry (see [Task](#task)). One mergeable cell, so concurrent moves of the same Task resolve last-writer-wins.

## Tombstone

A typed deletion marker: a `(entityType, entityId)` row (Area or Task) written when its entity is deleted. Tombstones make a deletion win after a sync merge even when the deletion and a concurrent edit arrive in either order, and they drive the containment cascade that removes an entity's whole subtree, attached Notes included.

## Task Group

The three status groupings shared by the [Area view](#area-view) and the [Inbox](#inbox): **Active**, **Backlog**, and **Done**. The Backlog group is a standing drop zone (shelving a root via `moveRootToBacklog`); the Done group is static and never a drop target.

## Progress Meter

The done/total indicator shown on a parent Task row instead of a checkbox: `n/m`, where `n` is the count of derived-done descendants and `m` the total descendants. A full meter (n = m) means the parent is derived-done; a partial meter means open. Parent rows everywhere — area view, inbox, and detail panes — render the meter.

## Task Detail Pane

The Main Pane view for a task with subtasks (`#/t/<id>`). Its header shows the breadcrumb / back affordance toward the owning root (or panes above), the due-date affordance, rename, and delete (which returns to the owning view) — plus, for root Tasks, the [Backlog](#backlog) toggle. The body is the full subtree rendered with the same [Task Row](#task-row) chrome: parent rows show their [progress meters](#progress-meter), and nested subtask names navigate to their own panes at any depth. Each pane also renders the Task's [Note](#note) body with an add/edit input; this is the only place a Task-scoped Note is created. Leaf tasks have no pane — their name is inline-editable in place.

---

# UI Structure

The canonical names for the shell's regions and their contents. Use these in issues and reviews instead of ad-hoc descriptions ("the left panel", "the expanded task thing"). Component names in `src/components/` mirror these terms.

## App Shell

The two-pane workspace (`.app-shell`): [Sidebar](#sidebar) on the left, [Main Pane](#main-pane) on the right. Below 768px the Sidebar becomes a modal **drawer** that slides over the Main Pane behind a backdrop.

## Sidebar

The left-hand navigation column (`sidebar/Sidebar.tsx`). From top to bottom: the app-name row (the "LocalAction" title), the quick links (Inbox, [Today, Week](#today--week-view) — each with a live count), the Areas section, and the [Sidebar footer](#sidebar-footer). A resizer on its trailing edge drags to set its width.

## Areas Section

The Sidebar section titled "Areas": the **Area tree** (a flattened drag surface where vertical movement reorders and horizontal movement nests/unnests, recursively) plus the new-area input. Each **area row** shows a colour dot, the area name, and the recursive open-task count across its subtree. Areas never collapse — the tree always renders fully expanded, so the selected area's whole subarea subtree stays visible.

## Sidebar Footer

The strip pinned to the bottom of the Sidebar holding the two app-wide status/settings controls: the **Sync Status Badge** (a colored dot — green: synced, yellow: syncing, red: sync failure after the reconnect loop gives up, with a retry button that re-arms it — plus a label: *Local only* → *Syncing…* → *Synced*, or *Retry #n…* / *Sync error*) and the **Appearance Menu** (theme, font, and density). The badge toggles the sync-activity popover (recent pulls/pushes, "Open full sync log" → `#/sync-log`); below 768px a second badge pins top-right of the shell instead.

## Main Pane

The working area right of the Sidebar (`MainPane.tsx`). Renders one view at a time based on the current selection: the Welcome screen, an [Area view](#area-view), a [Task detail pane](#task-detail-pane), or the Inbox / Today / Week panes.

## Area View

The Main Pane view for a selected Area: an [Area header](#area-header) above the [Task Groups section](#task-groups-section) — one unified list of the Area's [root Tasks](#root-task), grouped by [Task group](#task-group) — and the [Notes section](#notes-section). Sub-areas roll in as labeled slices within each task group; the group and note counts include the full sub-area subtree.

## Area Header

The header of an Area view: the area's colour marker and name (inline-renamable via the area edit popover, which also picks the palette colour), a `..` link back to the parent area (with `/` separator) when the area has a parent, an add-root-task affordance, an add-sub-area action, and delete behind a confirm modal.

## Task Groups Section

The Area view section holding the Area's root Tasks, grouped **Active** / **Backlog** / **Done**. The **Active** group lists the Area's Active roots (new roots land here); the **Backlog** group is a permanent standing drop zone — it renders on every Area view, even with no tasks at all, so shelving a root is always a visible drag away; the **Done** group is derived, static, and never a drop target. Each group is one draggable surface: within a group, roots reorder and drag onto other rows to nest (root↔subtask re-parenting); dropping a root into a sub-area's slice re-parents it to that sub-area; dropping onto the Backlog group shelves it via [Backlog](#backlog). Group headers collapse their rows; group collapse state persists per device. Within each group the viewed Area's own roots render headerless at the top; root rows from sub-areas (recursively) roll in below under clickable **sub-area headers**, one slice per sub-area — a sub-area with no rows in a group renders no slice there, so empty sub-area groupings never appear.

## Notes Section

The Area view section rolling up every [Note](#note) attached to the Area and its subtree (area-scoped plus the notes of the subtree's Tasks) — each rendered as a **note line** with a markdown body preview. The add input creates Area-scoped Notes; note lines edit in place (click the title or body) and delete behind a confirm. A Task's note is created and edited in the [Task detail pane](#task-detail-pane).

## Task Row

A single Task's row anywhere in the app. A **parent** row (has subtasks) shows the expand caret, the [progress meter](#progress-meter) in place of a checkbox, and the inline-editable title; clicking the title (or row body) opens the [Task detail pane](#task-detail-pane). A **leaf** row shows a done checkbox instead. Both carry a drag handle (on sortable surfaces), an optional due-date label, and the **row actions** — due date and add-sub-task (opens a [task draft row](#task-draft-row) at the end of the task's children), and delete behind a confirm. Read-only rows (no handle, no actions) appear in the Today/Week due panes.

## Today / Week View

The due-work [Main Pane](#main-pane) views (`#/today`, `#/week`) — one shared pane, two ranges: Today is the single day, Week the coming week. Open items already past due collect in a collapsible *Overdue* section above the range groups, grouped under the same area headings as in-range items (Inbox first) with every row dated by its actual past due date; a divider separates the section from the remaining in-range groups whenever both exist (present even while *Overdue* is collapsed, absent when nothing remains in range). Done items collect in a collapsible *Done* section; both collapse from their header rows, persisted per device and keyed per view. In Today, open items due in range group under area headings; in Week they group under collapsible per-day sections (ascending, weekday + date headers, each day's count in a badge, collapse state persisted independently), each day grouping its items under area headings as before. In Today a parent task due today expands into its full editable task tree in place — the same one the [Task detail pane](#task-detail-pane) renders — which supersedes that task's read-only rows; in Week it stays a single link row into its area, and rows inside a day section carry no individual weekday label. Outside that expanded tree, task rows are read-only (see [Task Row](#task-row)).

## Inline Add

The inline-creation affordance used wherever rows are added — new area, new note, the Inbox add input, an area's add-root-task. Two forms: an always-visible single-line input appended to a list, or a dashed *Add …* button that reveals that input in place, focused. Enter commits the trimmed, non-empty value; Esc clears the draft (in the button form, Esc or blurring an empty input also collapses back to the button). Adding a Task is the exception — every add-task affordance opens a [task draft row](#task-draft-row) instead of creating inline.

## Task Draft Row

The deferred add-task row. Clicking an add-task "+" — the [Area header](#area-header), the Inbox add input, a [Task Row's](#task-row) add-sub-task action — or pressing Shift+Enter in a task title opens a draft row exactly where the task will land: an inert task row carrying a focused, empty title input. Nothing is created until the input commits — Enter, or blur with a non-empty title; Escape, Enter on an empty input, or blurring an empty input discards the draft and creates nothing. Shift+Enter with a non-empty title commits and chains a fresh draft directly below the new task.

## Quick Add

Global quick capture: `Shift+A` (when no input is focused) opens a modal with a single title field. Enter commits a new unassociated [Root Task](#root-task) — it lands in the [Inbox](#inbox); Esc or the backdrop cancels without saving.

## Undo Toast

The timed undo affordance shown after a task completion or a cascade delete: a toast offering to reopen the task or restore the deleted subtree (see [Tombstone](#tombstone)) for six seconds before the window closes. The timer pauses while the pointer or keyboard focus is inside the toast.

## Routes

The hash routes the [Main Pane](#main-pane) resolves (`src/router.ts`): `#/` (Welcome screen), `#/inbox`, `#/today`, `#/week`, `#/a/<id>` ([Area view](#area-view)), `#/t/<id>` ([Task detail pane](#task-detail-pane)). Anything else — including legacy note/tag and pre-cutover `#/p/…` shapes — collapses to the Welcome screen, so stale links degrade gracefully.