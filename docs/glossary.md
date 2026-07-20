# Glossary

The domain vocabulary for LocalAction. Use these terms when writing issues, ADRs, or any project context. Don't drift to synonyms; if you need a concept that isn't here, that's a signal either to reconsider or to grow the glossary.

## Area

An ongoing area of life or practice that has no end state. Top-level container for Projects, sub-Areas, and Recurring Tasks. Examples: "Family", "Work", "Health".

## Sub-Area

A nested Area. Same semantics as Area — ongoing, container — but lives under a parent Area. (Historically, the glossary listed person-flavored sub-areas like `Family → Wife`; that pattern is **replaced by [Persons](#person)** — a Person is the orthogonal facet, not a sub-area node.)

## Project

A bounded effort with a clear end state, owned by an Area (or sub-Area). Projects have tasks that, when completed, mean the project is done. NOT used for ongoing concerns; use an Area (or sub-Area) for those.

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
Supports standard markdown rendering (CommonMark subset).

## Slug

A URL-safe identifier for a Note, derived from its title. Stable across renames unless something resolves them differently.

## Person

An individual a LocalAction entity (Area, Project, or Task) is associated with. The app's own user is always represented by a distinguished Person called **Self**. Persons carry a name and a colour; their avatar is derived from their name (see [ux.md](./ux.md)). A Person is **not** a node in the Area trie — it is an orthogonal facet, M:N across every entity type.

Self's name is a display name, not an identity: the user can rename Self like any other Person, and every canonical behaviour (always present, always assigned, non-deletable, sorted first, never stored as a link) keys off the fixed row id `"self"`, so a rename changes only what is rendered.

## Cast

The set of Persons associated with an Area — simply the Area's own [Person Links](#person-link), edited through the Area's header cast chips. Sub-areas / Projects / Tasks also carry a set, but that set is "this entity's persons" — the term **cast** specifically denotes an Area's set. There is no inheritance or constraint: every entity's set stands alone, and assignment popovers list every present Person.

## Effective Person Set

The Persons an entity actually resolves to at read time:
`{Self} ∪ ( storedSet(e) ∩ persons_present )`. Always non-empty. Stored rows are never mutated to enforce it — see [architecture.md](./architecture.md) for the read path.

## Person Link

A row in the `person_links` table expressing that a non-Self Person is associated with a specific `(entityType, entityId)` target. Self is **never** stored as a link — it is force-unioned at read time.
