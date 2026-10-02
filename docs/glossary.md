# Glossary

Domain vocabulary. Use these exact senses in issues and reviews; behavior details live in code (`src/data/schema.ts`, `src/data/tasks.ts`), views in [`ux.md`](./ux.md).

- **Area** — an ongoing container with no end state; a Sub-Area is an Area nested under a parent.
- **Task** — the unit of action; a leaf holds its own open/done state while a parent with subtasks derives it from descendants and shows a meter.
- **Root Task** — a top-level Task owned directly by an Area or unassociated; moving it moves its whole subtree.
- **Area Task** — a Root Task owned by an Area and shown in that Area's view.
- **Backlog** — the one stored root state, shelving a subtree untouched; Active and Done are derived around it.
- **Inbox** — the unassociated roots, grouped like an Area view but with no sub-area slices.
- **Placement** — the ownership cell naming a root's Area or a subtask's parent Task, absent for Inbox roots.
- **Note** — a markdown body attached to exactly one Area or Task, rendered CommonMark with raw HTML off.
- **Slug** — the URL-safe Note identifier re-derived from its title on rename.
- **Tombstone** — the typed deletion marker that lets a delete win over concurrent edits and cascades to the subtree.
- **Task Group** — the Active / Backlog / Done status grouping shared by Area and Inbox views.
- **Progress Meter** — the done/total readout on a parent row in place of a checkbox.
- **Routes** — the hash shapes resolving the main pane: `#/`, `#/inbox`, `#/today`, `#/week`, `#/a/<id>`, `#/t/<id>`, with anything else falling back home.
