# Task ownership and containment

A top-level Task has exactly one of three mutually exclusive ownership states: Project-owned, Area-owned, or unassociated and therefore derived into the Inbox. Only the top-level Task stores that owner; Sub-Tasks resolve ownership through their ancestry so a Task tree cannot span views, and moving its root moves the whole tree. Deleting an owner cascades through its full containment subtree—including descendant Areas, Projects, Task trees, Notes, and associations—because preserving detached records would create unreachable or invalid domain entities, while blocking deletion would shift containment cleanup onto the user. Permanent synchronized deletion tombstones make deletion win over delayed or concurrent assignments, preventing deleted owners or invalid Task ownership from resurfacing after offline replicas merge.

## Considered options

Independent ownership for Sub-Tasks was rejected because it would split Task trees across views and make ordering ambiguous. Preserving Tasks in the Inbox after deleting an owner was rejected because deletion is intended to remove the owner's complete containment subtree. Requiring owners to be empty before deletion was rejected as unnecessary manual cleanup.

## Consequences

Every Task stores one mergeable discriminated placement reference: `area:<id>` for an Area root, `project:<id>` for a Project root, `task:<id>` for a Sub-Task, or no reference for an Inbox root. Sub-Tasks resolve ownership through their Task ancestry. One cell preserves a single placement under concurrent moves because the store resolves it with its existing last-writer-wins rule. Deletion removes every contained entity and its attached Notes atomically from the local store and records permanent typed tombstones for deleted Areas, Projects, and Tasks; descendants and attachments of a tombstoned target are removed whenever synchronized state merges. This is a clean schema cutover; existing databases are intentionally wiped rather than migrated.
