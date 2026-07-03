# ADR-0002: Row-level last-write-wins as the conflict resolution strategy

## Status

Accepted.

## Context

Local-first sync needs a deterministic answer when two devices edit the same field offline. Options:

- **Field-level CRDT** (Yjs, Automerge) — preserves both edits at the field level via vector clocks. Complex; significant bundle weight.
- **Operational transforms** — proven in collaborative editors; rarely worth the complexity outside that domain.
- **Row-level last-write-wins (LWW)** — per cell, newer timestamp wins. Simple, deterministic, what TinyBase ships out of the box.

## Decision

Row-level LWW via TinyBase's sync protocol.

## Consequences

- (+) No additional code beyond TinyBase defaults.
- (+) Deterministic — no merge UI needed.
- (−) Concurrent edits to the same field on two devices will silently overwrite one.
- (−) No "show me both versions" affordance.

## Notes

This matches the mental model for a single-user personal app. If collaboration becomes a goal, revisit — likely toward a Yjs / Automerge hybrid scoped to Notes.
