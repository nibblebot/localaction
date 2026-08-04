/**
 * Focus handoff for freshly created section headers.
 * Add-section affordances (the project row's add-section button)
 * create a section whose rename input should grab focus once mounted —
 * but the input mounts deep inside the (possibly re-navigated) task
 * tree, so the intent travels through this module-scoped slot rather
 * than props. `SectionRow` consumes it in its mount initializer.
 * (Task rows no longer need a handoff: add-task affordances open a
 * draft row that focuses itself on mount — see hooks/taskDraft.ts.)
 */
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
