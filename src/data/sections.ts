import { useRow } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row, useTableVersion } from './internal.ts';
import type { Section, SectionInput, SectionPatch } from './types.ts';
import { readSiblingOrders } from './order.ts';

/**
 * Sections (glossary: Section) — named groups of top-level tasks inside
 * a project. A section never nests and never owns sub-tasks directly;
 * tasks join one via the `section:<id>` placement.
 */

function nextOrder(store: MergeableStore, projectId: string): number {
  const siblings = readSiblingOrders(
    store,
    TABLES.sections,
    COLUMNS.sections.projectId,
    projectId,
  );
  const last = siblings[siblings.length - 1];
  if (!last) return 1000;
  return last.order + 1000;
}

export function createSection(
  store: MergeableStore,
  input: SectionInput,
): string {
  const id = newId();
  const ts = nowIso();
  store.setRow(
    TABLES.sections,
    id,
    row({
      [COLUMNS.sections.name]: input.name,
      [COLUMNS.sections.projectId]: input.projectId,
      [COLUMNS.sections.order]: nextOrder(store, input.projectId),
      [COLUMNS.sections.createdAt]: ts,
      [COLUMNS.sections.updatedAt]: ts,
    }),
  );
  return id;
}

export function updateSection(
  store: MergeableStore,
  id: string,
  patch: SectionPatch,
): void {
  if (!store.hasRow(TABLES.sections, id)) return;
  const next: Record<string, string | number | null | undefined> = {
    [COLUMNS.sections.updatedAt]: nowIso(),
  };
  if (patch.name !== undefined) next[COLUMNS.sections.name] = patch.name;
  if (patch.order !== undefined) next[COLUMNS.sections.order] = patch.order;
  store.setPartialRow(TABLES.sections, id, row(next));
}

export function getSection(store: MergeableStore, id: string): Section | undefined {
  const r = store.getRow(TABLES.sections, id);
  if (!r || Object.keys(r).length === 0) return undefined;
  return decodeSectionRow(id, r);
}

/**
 * Non-reactive: a project's sections in stored order (`order` cell,
 * ties broken by id). Use `useSectionIdsForProject` from React.
 */
export function getSectionIdsForProject(
  store: MergeableStore,
  projectId: string,
  _version = 0,
): string[] {
  const out: { id: string; order: number }[] = [];
  for (const id of store.getRowIds(TABLES.sections)) {
    const pid = normalizeRelation(
      store.getCell(TABLES.sections, id, COLUMNS.sections.projectId),
    );
    if (pid !== projectId) continue;
    out.push({
      id,
      order: Number(store.getCell(TABLES.sections, id, COLUMNS.sections.order) ?? 0),
    });
  }
  out.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id)));
  return out.map((s) => s.id);
}

export function useSectionIdsForProject(store: MergeableStore, projectId: string): string[] {
  // Version token feeds the React Compiler's memo cache so the result
  // re-derives when the sections table changes (same pattern as
  // useInboxTaskIds).
  const v = useTableVersion(store, TABLES.sections);
  return getSectionIdsForProject(store, projectId, v);
}

export function useSection(store: MergeableStore, id: string | undefined): Section | undefined {
  const r = useRow(TABLES.sections, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return decodeSectionRow(id, r);
}

function decodeSectionRow(id: string, r: Record<string, unknown>): Section {
  return {
    id,
    name: String(r[COLUMNS.sections.name] ?? ''),
    projectId: String(r[COLUMNS.sections.projectId] ?? ''),
    order: Number(r[COLUMNS.sections.order] ?? 0),
    createdAt: String(r[COLUMNS.sections.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.sections.updatedAt] ?? ''),
  };
}
