# Glossary

The domain vocabulary for LocalAction. Use these terms when writing issues, ADRs, or any project context. Don't drift to synonyms; if you need a concept that isn't here, that's a signal either to reconsider or to grow the glossary.

## Domain

An ongoing area of life or practice that has no end state. Top-level container for Projects, sub-Domains, and Recurring Tasks. Examples: "Family", "Work", "Health".

## Sub-Domain

A nested Domain. Same semantics as Domain — ongoing, container — but lives under a parent Domain. Examples: "Family" → "Wife", "Family" → "Daughter".

## Project

A bounded effort with a clear end state, owned by a Domain (or sub-Domain). Projects have tasks that, when completed, mean the project is done. NOT used for ongoing concerns; use a Domain (or sub-Domain) for those.

## Task

A unit of action. A one-off Task lives under a Project, and may itself have sub-Tasks nested under it. Has an `open` / `done` status.

## Recurring Task (reserved)

A Task that fires on a recurrence rule (e.g. every Monday). Lives directly under a Domain (no Project wrapper). Not implemented in phase 0; reserved in schema (`tasks.projectId` is nullable).

## Note

A markdown body attached to exactly one entity (Domain, Project, or Task).
Supports standard markdown rendering (CommonMark subset).

## Slug

A URL-safe identifier for a Note, derived from its title. Stable across renames unless something resolves them differently.
