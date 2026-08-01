/**
 * Focus handoff for freshly created task rows and section headers.
 * Row actions ("Add sub-task", "Add task to section", Shift+Enter
 * quick entry, the header add-affordances) create a task or section
 * whose title input should grab focus once mounted — but the input
 * mounts deep inside the (possibly re-navigated) task tree, so the
 * intent travels through these module-scoped slots rather than props.
 * `TaskTitleInput` consumes the task slot, `SectionRow` the section
 * slot, each in its mount effect.
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

let pendingSectionTitleFocus: string | null = null;

/** Queue a freshly created section's title input to grab focus once mounted. */
export function queueSectionTitleFocus(sectionId: string): void {
  pendingSectionTitleFocus = sectionId;
}

/** True (once) when `sectionId` was queued via `queueSectionTitleFocus`. */
export function consumeSectionTitleFocus(sectionId: string): boolean {
  if (pendingSectionTitleFocus !== sectionId) return false;
  pendingSectionTitleFocus = null;
  return true;
}
