# Glossary

The domain vocabulary for LocalAction. Use these terms when writing issues, ADRs, or any project context. Don't drift to synonyms; if you need a concept that isn't here, that's a signal either to reconsider or to grow the glossary.

## Area

An ongoing area of life or practice that has no end state. Top-level container for Projects, sub-Areas, and Recurring Tasks. Examples: "Family", "Work", "Health".

## Sub-Area

A nested Area. Same semantics as Area — ongoing, container — but lives under a parent Area. Examples: "Family" → "Wife", "Family" → "Daughter".

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
