import type { AreaColorId } from '../../data/colors.ts';

/** A rolled-in descendant area surfaced inside the viewed area's view. */
export interface SubAreaRef {
  id: string;
  name: string;
  color: AreaColorId;
}

/** Parent-area breadcrumb target (id + name only — no chrome needed). */
export interface HeaderArea {
  id: string;
  name: string;
}
