/**
 * Notes feature switch — disabled and hidden from the UI. The data
 * layer (the `notes` table, CRUD, selectors, and WS sync) stays fully
 * intact so existing note rows and the schema/persistence/sync shape
 * are unchanged; only the render sites are gated. Flip to `true` to
 * bring the surface back: the area-view Notes section and the task-pane
 * note body editor.
 */
export const NOTES_ENABLED = false;
