/**
 * Notes feature switch — disabled and hidden from the UI. The data
 * layer (the `notes` table, CRUD, selectors, and WS sync) stays fully
 * intact so existing note rows and the schema/persistence/sync shape
 * are unchanged; only the render sites are gated. Flip to `true` to
 * bring the surface back: the area-view Notes section, the project-row
 * note icon, and the `#/p/<id>/notes` pane.
 */
export const NOTES_ENABLED = false;
