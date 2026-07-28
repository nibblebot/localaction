# Glossary

The domain vocabulary for LocalAction. Use these terms when writing issues or any project context. Don't drift to synonyms; if you need a concept that isn't here, that's a signal either to reconsider or to grow the glossary.

## Area

An ongoing area of life or practice that has no end state. Top-level container for Projects, sub-Areas, and Tasks. Examples: "Family", "Work", "Health".

## Sub-Area

A nested Area. Same semantics as Area — ongoing, container — but lives under a parent Area.

## Project

A bounded effort with a clear end state, owned by an Area (or sub-Area). Projects have tasks that, when completed, mean the project is done. NOT used for ongoing concerns; use an Area (or sub-Area) for those.

A Project has three presentation states in the [Projects section](#projects-section): **Backlog** (a stored status — the project is shelved out of the active list without touching its tasks), **Active** (the default; any project not in Backlog that is not Done), and **Done** (derived — the project has at least one task and every task in it is done; never stored, so an empty project reads Active). Only Backlog persists; a shelved project stays shelved even when its tasks complete (Backlog wins over the derived Done state), and dragging a project between the Active and Backlog groups writes the status and the new position in one transaction.

## Section

A named group of top-level Tasks inside a Project (e.g. "Phase 1", "Backlog"). Sections exist only at the top level of a Project — they never nest, belong to exactly one Project, and hold Tasks only (no Notes). A Task joins a Section through its `section:<id>` [placement](#placement); its owning Project resolves through the Section row. Sections are ordered by drag within their Project and always render after the Project's unsectioned Tasks. Deleting a Section deletes its Tasks (containment cascade, with a typed [tombstone](#tombstone)).

## Task

A unit of action. A top-level Task has exactly one of three ownership states: it belongs to a Project, belongs directly to an Area, or is unassociated and therefore appears in the Inbox. Only the top-level Task carries that ownership; every descendant resolves its owner through its ancestry, and moving the top-level Task moves the whole tree. Has an `open` / `done` status: a Task may be done only when all of its descendants are done, and reopening a descendant reopens every ancestor.

## Area Task

A Task that belongs directly to an Area rather than to one of its Projects.

## Inbox

The view of unassociated Tasks: Tasks that belong to neither a Project nor an Area. Inbox membership is derived from the absence of both associations; the Inbox is not another Task container.

## Recurring Task (reserved)

An Area Task that fires on a recurrence rule (e.g. every Monday). It is distinguished from a one-off Area Task by its recurrence rule, not by ownership. Not implemented; reserved for future work.

## Note

A markdown body attached to exactly one entity (Area, Project, or Task).
Rendered with markdown-it: CommonMark, raw HTML disabled, bare URLs auto-linked.

## Slug

A URL-safe identifier for a Note, derived from its title. Unique across all Notes (numeric suffixes break ties; an untitled Note starts from `note`) and re-derived whenever the title changes — renames do not preserve it.

## Placement

A Task's ownership cell: a discriminated string naming exactly one owner — `area:<id>`, `project:<id>`, or `section:<id>` for a top-level Task, `task:<id>` for a sub-task, absent for an Inbox root. Only the top-level Task carries ownership; descendants resolve theirs through ancestry (see [Task](#task)). One mergeable cell, so concurrent moves of the same Task resolve last-writer-wins.

## Tombstone

A typed deletion marker: a `(entityType, entityId)` row (Area, Project, Task, or Section) written when its entity is deleted. Tombstones make a deletion win after a sync merge even when the deletion and a concurrent edit arrive in either order, and they drive the containment cascade that removes an entity's whole subtree, attached Notes included.

---

# UI Structure

The canonical names for the shell's regions and their contents. Use these in issues and reviews instead of ad-hoc descriptions ("the left panel", "the expanded project thing"). Component names in `src/components/` mirror these terms.

## App Shell

The two-pane workspace (`.app-shell`): [Sidebar](#sidebar) on the left, [Main Pane](#main-pane) on the right. Below 768px the Sidebar becomes a modal **drawer** that slides over the Main Pane behind a backdrop.

## Sidebar

The left-hand navigation column (`Sidebar.tsx`). From top to bottom: the app-name row (the "LocalAction" title), the quick links (Inbox, [Today, Week](#today--week-view) — each with a live count), the Areas section, and the [Sidebar footer](#sidebar-footer). A resizer on its trailing edge drags to set its width.

## Areas Section

The Sidebar section titled "Areas": the **Area tree** (a flattened drag surface where vertical movement reorders and horizontal movement nests/unnests, recursively) plus the new-area input. Each **area row** shows a colour dot, the area name, and the recursive open-task count across its subtree; top-level rows with children carry a collapse caret.

## Sidebar Footer

The strip pinned to the bottom of the Sidebar holding the two app-wide status/settings controls: the **Sync Status Badge** (connection state: *Local only* → *Syncing…* → *Synced*, or *Retry #n…* / *Sync error*) and the **Appearance Menu** (theme, font, and density).

## Main Pane

The working area right of the Sidebar (`MainPane.tsx`). Renders one view at a time based on the current selection: the Welcome screen, an [Area view](#area-view), a [Project detail pane](#project-detail-pane), a [Project notes pane](#project-notes-pane), or the Inbox / Today / Week panes.

## Area View

The Main Pane view for a selected Area: an [Area header](#area-header) above three collapsible sections — [Area tasks](#area-tasks-section), [Projects](#projects-section), and [Notes](#notes-section). Sub-areas roll up into the Projects and Area tasks sections; the section counts include the full sub-area subtree.

## Area Header

The header of an Area view: the area's colour marker and name (inline-renamable via the area edit popover, which also picks the palette colour), a breadcrumb of the parent chain, the **Completed toggle** (show/hide done tasks in place), an add-sub-area action, and delete behind a confirm modal.

## Area Tasks Section

The Area view section holding the area-rooted Tasks — the [Area Tasks](#area-task) that belong directly to this Area rather than to one of its Projects. Rendered as a draggable task tree (sub-tasks nest), with an *Add task* affordance. Sub-areas (recursively) roll in below the Area's own tree as labeled, editable groups — one per sub-area that roots its own tasks — each scoped to that sub-area's placement.

## Projects Section

The Area view section listing every Project owned by the Area, grouped **Active** / **Backlog** / **Done**, drag-to-reorder within the Area. The viewed Area's **Backlog** group is a permanent standing drop zone — it renders on every Area view, even with no projects at all — and its **Active** group renders while the Area has any project in either group, so shelving or restoring a project is always a visible drag away (the **Done** group is derived, its rows are static, and it is never a drop target; a sub-area's empty slice appears only mid-drag). Each group header collapses its rows; group collapse state persists per device. Projects from sub-areas (recursively) roll in under clickable **sub-area headers**. When sub-areas roll in, the projects owned directly by the viewed Area are labeled with a static **Area projects** header (the Area's colour dot, no navigation target); with no sub-areas there is nothing to disambiguate and the slice stays headerless. A trailing collapse-all / expand-all button operates on every [Project card](#project-card) at once.

## Notes Section

The Area view section rolling up every [Note](#note) attached to the Area, its subtree, or their Projects/Tasks — each rendered as a **note line** with a markdown body preview. The add input creates Area-scoped Notes; note lines edit in place (click the title or body) and delete behind a confirm. Project-scoped Notes are created in the [Project notes pane](#project-notes-pane).

## Project Row

A single Project's row in the Projects section: a drag handle, the expand caret, the project name, a done/total **progress meter**, a due-date affordance, an **empty-sections toggle** (hides [Section](#section) headers with no visible tasks in the expanded card; per-project, persisted per device), a note icon (opens the [Project notes pane](#project-notes-pane)), rename, and delete behind a confirm. Clicking the row body opens the [Project detail pane](#project-detail-pane); the caret is the expand toggle.

## Project Card

A [Project row](#project-row) plus its expanded inline body — the [Project task list](#project-task-list). "Expand a project" means opening its card. Per-card collapse state persists per device.

## Project Task List

The body of an expanded [Project card](#project-card) (`ProjectTaskList.tsx`): one flattened drag surface spanning the unsectioned [Tasks](#task) and every [Section](#section), followed by the **task list footer** (the *Add task* / *Add section* inline-add buttons).

## Section Row

A [Section's](#section) header inside the Project task list: a drag handle, the inline-editable section name, and delete (containment cascade, behind a confirm). Section rows are pinned to the top level — they can reorder but never nest — and always render after the Project's unsectioned Tasks.

## Task Row

A single Task's row anywhere in the app: a drag handle (on sortable surfaces), the done checkbox, the inline-editable title, an optional due-date label, a subtask progress meter (when it has descendants), and the **row actions** — due date, add sub-task, and delete behind a confirm. Read-only rows (no handle, no actions) appear in the Today/Week due panes.

## Project Notes Pane

The notes-only Main Pane view for a single Project (`#/p/<id>/notes`): a project header with a breadcrumb back to its Area, plus the Project's Notes with an add input. The only place project-scoped Notes are created.

## Project Detail Pane

The Main Pane view for a single Project (`#/p/<id>`) — the standalone form of an expanded [Project card](#project-card). Its header shows the area breadcrumb, the Completed toggle, and the same row chrome the [Project row](#project-row) carries: the progress meter, the due-date affordance, the empty-sections toggle (per-project state shared with the card), the note icon, rename, and delete (which returns to the owning Area). The body is the [Project task list](#project-task-list).

## Today / Week View

The due-work [Main Pane](#main-pane) views (`#/today`, `#/week`) — one shared pane, two ranges: Today is the single day, Week the coming week. Open items due in range group under area headings with their projects; open items already past due collect in a collapsible *Overdue* section above the range groups; done items collect in a collapsible *Done* section. Both sections collapse from their header rows, persisted per device and keyed per view. In Today a project due today expands into its full editable task tree in place — the same one the [Project detail pane](#project-detail-pane) renders — which supersedes that project's read-only rows; in Week it stays a single link row into its area. Outside that expanded tree, task rows are read-only (see [Task Row](#task-row)).

## Completed Toggle

The show/hide-done switch (a check icon, accent-tinted while active) shared by the [Area header](#area-header), the [Project detail pane](#project-detail-pane) header, and the Inbox pane. While on, done tasks show in place; while off, they are pruned from the task tree. Per-device view state, never synced.

## Inline Add

The inline-creation affordance used wherever rows are added — new area, new note, the Inbox add input, *Add task* / *Add section* / *Add project*. Two forms: an always-visible single-line input appended to a list, or a dashed *Add …* button that reveals that input in place, focused. Enter commits the trimmed, non-empty value; Esc clears the draft (in the button form, Esc or blurring an empty input also collapses back to the button).

## Quick Add

Global quick capture: `Shift+A` (when no input is focused) opens a modal with a single title field. Enter commits a new unassociated Task — it lands in the [Inbox](#inbox); Esc or the backdrop cancels without saving.

## Undo Toast

The timed undo affordance shown after a task completion or a cascade delete: a toast offering to reopen the task or restore the deleted subtree (see [Tombstone](#tombstone)) for six seconds before the window closes. The timer pauses while the pointer or keyboard focus is inside the toast.

## Routes

The hash routes the [Main Pane](#main-pane) resolves (`src/router.ts`): `#/` (Welcome screen), `#/inbox`, `#/today`, `#/week`, `#/a/<id>` ([Area view](#area-view)), `#/p/<id>` ([Project detail pane](#project-detail-pane)), `#/p/<id>/notes` ([Project notes pane](#project-notes-pane)). Anything else — including legacy task/note shapes — collapses to the Welcome screen, so stale links degrade gracefully.
