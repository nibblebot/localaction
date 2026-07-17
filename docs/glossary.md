# Glossary

The domain vocabulary for LocalAction. Use these terms when writing issues, ADRs, or any project context. Don't drift to synonyms; if you need a concept that isn't here, that's a signal either to reconsider or to grow the glossary.

## Area

An ongoing area of life or practice that has no end state. Top-level container for Projects, sub-Areas, and Recurring Tasks. Examples: "Family", "Work", "Health".

## Sub-Area

A nested Area. Same semantics as Area — ongoing, container — but lives under a parent Area. (Historically, the glossary listed person-flavored sub-areas like `Family → Wife`; that pattern is **replaced by [Persons](#person)** — a Person is the orthogonal facet, not a sub-area node.)

## Project

A bounded effort with a clear end state, owned by an Area (or sub-Area). Projects have tasks that, when completed, mean the project is done. NOT used for ongoing concerns; use an Area (or sub-Area) for those.

## Task

A unit of action. A one-off Task lives under a Project, and may itself have sub-Tasks nested under it. Has an `open` / `done` status.

## Recurring Task (reserved)

A Task that fires on a recurrence rule (e.g. every Monday). Lives directly under an Area (no Project wrapper). Not implemented in phase 0; reserved in schema (`tasks.projectId` is nullable).

## Note

A markdown body attached to exactly one entity (Area, Project, or Task).
Supports standard markdown rendering (CommonMark subset).

## Slug

A URL-safe identifier for a Note, derived from its title. Stable across renames unless something resolves them differently.

## Person

An individual a LocalAction entity (Area, Project, or Task) is associated with. The app's own user is always represented by a distinguished Person called **Self**. Persons carry a name and a colour; their avatar is derived from their name (see [ux.md](./ux.md)). A Person is **not** a node in the Area trie — it is an orthogonal facet, M:N across every entity type.

## Cast

The set of Persons associated with an Area. The cast is a **declaration**: it is the constraint pool its descendant entities (sub-areas, projects, tasks) draw from (the [D4 cast-as-hard-constraint](#) invariant is enforced at read time by intersection). A cast is edited through the Area's header cast chips. Sub-areas / Projects / Tasks also carry a set, but that set is "this entity's persons" — the term **cast** specifically denotes the role an Area's set plays.

## Effective Person Set

The Persons an entity actually resolves to at read time:
`{Self} ∪ ( storedSet(e) ∩ effectiveCast(parent(e)) )`, or `{Self}` when that yields empty. Always non-empty. Stored rows are never mutated to enforce it — see [architecture.md](./architecture.md) for the read path.

## Person Link

A row in the `person_links` table expressing that a non-Self Person is associated with a specific `(entityType, entityId)` target. Self is **never** stored as a link — it is force-unioned at read time.
