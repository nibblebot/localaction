/**
 * Focus handoff for freshly created task rows. Row actions ("Add
 * sub-task", "Add task to section", Shift+Enter quick entry) create a
 * task whose title input should grab focus once mounted — but the
 * input mounts deep inside the (possibly re-navigated) task tree, so
 * the intent travels through this module-scoped slot rather than props.
 * `TaskTitleInput` consumes the slot in its mount effect.
 */
let pendingTitleFocus: string | null = null;

/** Queue a freshly created task's title input to grab focus once mounted. */
export function queueTaskTitleFocus(taskId: string): void {
  pendingTitleFocus = taskId;
}

/** True (once) when `taskId` was queued via `queueTaskTitleFocus`. */
export function consumeTaskTitleFocus(taskId: string): boolean {
  if (pendingTitleFocus !== taskId) return false;
  pendingTitleFocus = null;
  return true;
}
