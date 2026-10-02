# UX

Shell, navigation, views, and appearance. The system underneath lives in [`architecture.md`](./architecture.md); vocabulary lives in [`glossary.md`](./glossary.md).

## Shell

Two-pane workspace: Sidebar for navigation plus MainPane as the working area, with a dev-only TinyBase Inspector overlay.

Below 768px the sidebar becomes a modal drawer — hamburger toggle, backdrop or Escape to close, focus trapped while open; the sync badge pins to the shell top-right while the drawer is closed.

## Navigation

Tiny hash router with no library: `#/` home, `#/inbox`, `#/today`, `#/week`, `#/a/<id>` area, `#/t/<id>` task pane.

Back and forward buttons plus deep links work through the hash. Legacy shapes fall back to home. `Shift+A` with no input focused quick-adds an Inbox task.

## Sidebar

Quick links Inbox / Today / Week, each with a live count.

The area tree holds top-level areas with recursive sub-areas and never collapses, so the selection stays visible with its subtree. Each row shows a colour dot, name, and recursive open-task count. One drag context spans every level and a row's subtree always moves with it: vertical position picks the row, dragging right nests under the row above, dragging left unnests. A new-area input sits at the section foot; area headers add sub-areas.

The footer holds the sync badge and the appearance menu. The badge is a toggle that opens the sync-activity popover. Appearance holds theme, font, and density.

## MainPane views

### Welcome

Centred empty state when nothing is selected, pointing at area pick or area creation.

### Area view

Header with parent `..` link when nested, renamable name plus colour dot, sub-area add, and delete behind confirm — above task groups and Notes, each with a live subtree count.

Task groups unify the area's roots as Active / Backlog / Done, with sub-area roots rolled in as labeled slices beneath the area's own. Each root renders its whole subtree inline; a parent row carries a progress meter while a leaf keeps its checkbox, and opening a parent name lands in its task pane.

- Active is the default.
- Backlog is a standing zone that renders even when empty, so shelving stays a visible drag away.
- Done is derived and static, never accepting drops.

One completed toggle shared with the task pane and stored per device hides Done and prunes completed rows when off. Notes roll up the area plus its subtree task notes; the add input makes area-scoped notes while task notes belong to their pane.

### Inbox

Unassociated roots in the same Active / Backlog / Done groups with no sub-area slices, plus an add input. Quick-add lands here.

### Today / Week

A single shared DuePane under two ranges: Today covers one day, Week covers its range. Past-due open items gather in a collapsible Overdue section above the in-range groups. In-range items sit under area headings. Today expands a due root into its full editable tree in place; Week nests in-range items under collapsible per-day sections and keeps due roots as link rows. A collapsible Done section closes each view. Collapse persists per device, keyed per view.

### Task detail pane

Every parent task opens its own pane at any depth from its name, with a back affordance toward the owner; leaf names edit in place and never open panes. The header carries rename, due date, the shared completed toggle, delete returning to the owning view, and a Backlog toggle on roots that shelves or restores the whole subtree at once. The body renders the full subtree with area-view row chrome plus the task markdown note, the sole creation point for task notes.

## Drag and drop

One drag surface per task tree. Roots dropped onto rows nest as subtasks; subtasks dragged to top level become roots. Dropping a root into a sub-area slice re-owns it there. Dropping onto Backlog shelves the subtree, kept atomic across groups. Done never accepts drops. Inbox and area views share no drag surface; moves between them go through the task pane.

## Interaction patterns

Collapse sets, sidebar width, and appearance stay in `localStorage` per device and never sync. Task completion offers a timed undo. Rows arriving from sync flash an entrance highlight; local adds stay still, bulk arrivals skip it, and reduced-motion renders instantly.

## Appearance

Theme, font, and density from the sidebar footer menu; all tokens and shell rules live in `src/index.css` (component rules alongside in `src/App.css`).

## Colour system

Area palette ids and fallback live in `src/data/colors.ts`.
