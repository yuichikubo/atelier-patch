'use client'
/**
 * ATELIER CMS — useBlockSelection Hook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `useBlockSelection` provides event handlers that Canvas and block wrapper
 * components attach to DOM elements to drive selection state.
 *
 * Calling `onBlockClick(blockId)` selects the block and fires the
 * 'block-selected' CustomEvent so the Stickman controller and other listeners
 * react accordingly.
 *
 * DATA FLOW
 * ─────────
 *   User clicks a block in the Canvas
 *     → onBlockClick(blockId) — from this hook
 *       → useSelectionStore.selectBlock(id)
 *         → Zustand re-renders all subscribed components (Inspector, outlines)
 *         → coreStore.selectBlock(id)  — mirrors to core store
 *           → window CustomEvent 'block-selected' fired
 *             → Stickman controller reacts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback }        from 'react'
import { useSelectionStore }  from './selectionStore'

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseBlockSelectionReturn {
  /**
   * The currently selected block id, or null.
   * Use this to apply conditional styles or pass to the Inspector.
   */
  selectedBlockId: string | null

  /**
   * Attach to the block's onClick handler.
   * Selects the block and stops the click from bubbling to the canvas.
   *
   * @example
   *   <div onClick={(e) => { e.stopPropagation(); onBlockClick(block.id) }}>
   */
  onBlockClick: (blockId: string) => void

  /**
   * Attach to the block's onMouseEnter handler.
   * Sets hover state used by SelectionOutline for the hover ring.
   */
  onBlockMouseEnter: (blockId: string) => void

  /**
   * Attach to the block's onMouseLeave handler.
   * Clears hover state.
   */
  onBlockMouseLeave: () => void

  /**
   * Attach to the canvas background's onClick.
   * Deselects the current block when clicking outside any block.
   *
   * @example
   *   <div className="canvas" onClick={onCanvasClick}>…</div>
   */
  onCanvasClick: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that provides block click handlers for the editor canvas.
 *
 * Reads `selectedBlockId` from the Zustand selection store and returns
 * stable callback references (via `useCallback`) that won't cause
 * unnecessary re-renders in block wrapper components.
 *
 * @example — in a canvas wrapper
 *   function EditorCanvas() {
 *     const { onBlockClick, onCanvasClick } = useBlockSelection()
 *     return (
 *       <div onClick={onCanvasClick}>
 *         {blocks.map(b => (
 *           <div key={b.id} onClick={(e) => { e.stopPropagation(); onBlockClick(b.id) }}>
 *             <BlockRenderer block={b} />
 *           </div>
 *         ))}
 *       </div>
 *     )
 *   }
 */
export function useBlockSelection(): UseBlockSelectionReturn {
  const selectedBlockId  = useSelectionStore((s) => s.selectedBlockId)
  const selectBlock      = useSelectionStore((s) => s.selectBlock)
  const hoverBlock       = useSelectionStore((s) => s.hoverBlock)
  const clearSelection   = useSelectionStore((s) => s.clearSelection)

  const onBlockClick = useCallback((blockId: string) => {
    selectBlock(blockId)
  }, [selectBlock])

  const onBlockMouseEnter = useCallback((blockId: string) => {
    hoverBlock(blockId)
  }, [hoverBlock])

  const onBlockMouseLeave = useCallback(() => {
    hoverBlock(null)
  }, [hoverBlock])

  const onCanvasClick = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  return {
    selectedBlockId,
    onBlockClick,
    onBlockMouseEnter,
    onBlockMouseLeave,
    onCanvasClick,
  }
}
