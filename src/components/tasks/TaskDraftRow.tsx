/**
 * The pending draft row — renders exactly where a requested task will
 * land (see hooks/taskDraft.ts) WITHOUT touching the store. The task is
 * created only on commit (Enter or blur with non-empty text); Escape,
 * an empty Enter, and an empty blur close the draft creating nothing.
 * Shift+Enter with text commits and chains a fresh draft after the new
 * task (quick entry).
 *
 * Commit and cancel are idempotent through a settled ref: React does
 * not reliably fire onBlur on unmount, and StrictMode double-mounts —
 * the first settlement wins and every later path is a no-op.
 *
 * The row is a static (non-sortable) tree node: it takes the slot's
 * `ref`/`style` for alignment but never the listeners/attributes, so
 * it can never be dragged. No trash, no menu, no due date, no progress.
 */
import { useEffect, useRef, useState } from 'react';
import { useDataLayer, createTask, createTaskAfter } from '../../data/index.ts';
import type { SortableHandleProps } from '../dnd/SortableList.tsx';
import { cancelTaskDraft, requestTaskDraft } from '../hooks/taskDraft.ts';
import type { PendingTaskDraft } from '../hooks/taskDraft.ts';
import { useAutogrowTextarea } from './useAutogrowTextarea.ts';

export default function TaskDraftRow({
  draft,
  handle,
}: {
  draft: PendingTaskDraft;
  /** SortableTree slot handle — only `ref` and `style` are used. */
  handle?: SortableHandleProps;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const settledRef = useRef(false);
  useAutogrowTextarea(ref, text);

  // The draft row always takes focus on mount — every request exists so
  // the user can type immediately. Unique node ids make chained drafts
  // remount, re-running this effect for each quick-entry step.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  /** Create the task from a non-empty trimmed title; returns its id. */
  function createFromDraft(title: string): string | null {
    if (settledRef.current) return null;
    settledRef.current = true;
    if (draft.afterId !== undefined) {
      return createTaskAfter(store, draft.afterId, title);
    }
    if (draft.placement !== undefined) {
      return createTask(store, { title, placement: draft.placement });
    }
    return null;
  }

  function settleCancel(): void {
    if (settledRef.current) return;
    settledRef.current = true;
    cancelTaskDraft();
  }

  function commit(): void {
    // Already settled (Enter / Shift+Enter ran first): the settle path
    // owns the module draft — a late blur (e.g. on unmount) must never
    // cancel a chained draft requested after this row settled.
    if (settledRef.current) return;
    const title = text.trim();
    if (title === '') {
      settleCancel();
      return;
    }
    createFromDraft(title);
    cancelTaskDraft();
  }

  return (
    <div ref={handle?.ref} style={handle?.style} className="task-line">
      {/* Inert drag handle: keeps the draft row aligned with real task
          rows but never activates a drag (the row is a static node). */}
      <button
        type="button"
        className="task-line-drag-handle icon-button"
        disabled
        aria-hidden="true"
        tabIndex={-1}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#drag-icon" />
        </svg>
      </button>
      <input type="checkbox" className="task-line-check" disabled aria-hidden="true" />
      <textarea
        ref={ref}
        className="task-line-title"
        rows={1}
        value={text}
        placeholder="New task…"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
              // Quick entry: commit this draft and open the next one
              // directly below the task just created. Empty = no-op.
              const title = text.trim();
              if (title === '') return;
              const newId = createFromDraft(title);
              if (newId !== null) {
                requestTaskDraft({ afterId: newId });
              } else {
                cancelTaskDraft();
              }
              return;
            }
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            settleCancel();
          }
        }}
        aria-label="Task title"
      />
    </div>
  );
}
