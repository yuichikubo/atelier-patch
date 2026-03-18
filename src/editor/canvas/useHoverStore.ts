/**
 * useHoverStore — re-exports hover actions from the unified SelectionStore.
 *
 * This file exists for backward compatibility only.
 * Prefer importing directly from '@/editor/selection/selectionStore'.
 *
 * @deprecated Use useSelectionStore from '@/editor/selection/selectionStore'
 */
export { useSelectionStore as useHoverStore } from '@/editor/selection/selectionStore'
