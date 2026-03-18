'use client'
/**
 * ATELIER CMS — Block Inspector Engine Hook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `useBlockInspector` is the business-logic layer for the block inspector panel.
 * It wires three systems together with no direct coupling between them:
 *
 *   SelectionStore  →  reads which block is selected
 *   PatchEngine     →  reads the live block data from the document
 *   PatchEngine     →  emits patches when the user edits a field
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This hook does NOT modify PatchEngine, SelectionStore, or any document
 *   model directly — it is purely a coordinator.
 * • All edits flow through:
 *     Inspector field change
 *       → hook.updateField(key, value)
 *         → engine.enqueuePatch({ op:'update', target:'block', … })
 *           → PatchEngine applies the patch
 *             → Renderer re-renders
 * • The hook subscribes to BOTH the SelectionStore (for selection changes)
 *   AND the PatchEngine (for document changes) so it is always up to date.
 * • Safe to use in any React component — unsubscribes on unmount.
 *
 * USAGE
 * ─────
 *   function MyInspector() {
 *     const inspector = useBlockInspector()
 *     if (!inspector.block) return <p>No block selected</p>
 *     return (
 *       <input
 *         value={(inspector.block.content as any).text ?? ''}
 *         onChange={e => inspector.updateField('text', e.target.value)}
 *       />
 *     )
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { engine }              from '@/core/document/engineInstance'
import { useSelectionStore }   from '@/editor/selection/selectionStore'
import type { Block }          from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockInspectorState {
  /** The currently selected and inspected block, or null. */
  block:      Block | null
  /** The parent section id of the selected block, or null. */
  sectionId:  string | null
  /** Whether any block is currently selected. */
  hasBlock:   boolean
}

export interface BlockInspectorActions {
  /**
   * Update a single top-level content field on the selected block.
   * Emits an 'update' patch to the PatchEngine.
   *
   * @param key    The content field name (e.g. 'text', 'title', 'buttonUrl')
   * @param value  The new value — may be string, number, boolean, or array
   *
   * @example
   *   inspector.updateField('title', 'New headline')
   *   inspector.updateField('buttonUrl', 'https://example.com')
   */
  updateField(key: string, value: unknown): void

  /**
   * Replace the entire content object on the selected block.
   * Emits an 'update' patch containing the full merged content.
   *
   * @param content  Partial content object — merged over current content
   */
  updateContent(content: Record<string, unknown>): void

  /**
   * Update block settings (alignment, className, style, etc.).
   *
   * @param settings  Partial settings — merged over current settings
   *
   * @example
   *   inspector.updateSettings({ align: 'center' })
   */
  updateSettings(settings: Record<string, unknown>): void

  /**
   * Delete the currently selected block.
   * Emits a 'remove' patch and clears the selection.
   */
  deleteBlock(): void

  /**
   * Duplicate the currently selected block.
   * The clone is inserted immediately after the original in the same section.
   */
  duplicateBlock(): void

  /**
   * Move the block up one position within its section.
   * No-op if the block is already first.
   */
  moveUp(): void

  /**
   * Move the block down one position within its section.
   * No-op if the block is already last.
   */
  moveDown(): void
}

/** Combined return value of the hook. */
export type UseBlockInspectorReturn = BlockInspectorState & BlockInspectorActions

// ─────────────────────────────────────────────────────────────────────────────
// Helper — find a block and its parent section in the current document
// ─────────────────────────────────────────────────────────────────────────────

function findBlock(blockId: string): { block: Block; sectionId: string } | null {
  for (const section of engine.getDocument().sections) {
    const block = section.blocks.find(b => b.id === blockId)
    if (block) return { block, sectionId: section.id }
  }
  return null
}

function getBlockIndex(sectionId: string, blockId: string): number {
  const section = engine.getDocument().sections.find(s => s.id === sectionId)
  return section?.blocks.findIndex(b => b.id === blockId) ?? -1
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that provides the complete Block Inspector engine.
 *
 * Subscribes to SelectionStore and PatchEngine.
 * Returns the currently selected block and all editing actions.
 *
 * Re-renders only when the selected block or its content changes —
 * other document changes that don't affect the selected block are ignored.
 */
export function useBlockInspector(): UseBlockInspectorReturn {
  // ── State ──────────────────────────────────────────────────────────────────
  const [block,     setBlock]     = useState<Block | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)

  // Keep a ref to the current blockId so callbacks don't go stale
  const selectedBlockIdRef = useRef<string | null>(
    useSelectionStore.getState().selectedBlockId,
  )

  // ── Sync helper ────────────────────────────────────────────────────────────

  const syncFromEngine = useCallback((blockId: string | null) => {
    if (!blockId) {
      setBlock(null)
      setSectionId(null)
      return
    }
    const found = findBlock(blockId)
    if (found) {
      setBlock({ ...found.block })
      setSectionId(found.sectionId)
    } else {
      // Block was removed from the document
      setBlock(null)
      setSectionId(null)
    }
  }, [])

  // ── Subscribe to SelectionStore ────────────────────────────────────────────

  useEffect(() => {
    // Sync immediately with current selection
    syncFromEngine(useSelectionStore.getState().selectedBlockId)

    const unsub = useSelectionStore.subscribe(state => {
      const newId = state.selectedBlockId
      if (newId !== selectedBlockIdRef.current) {
        selectedBlockIdRef.current = newId
        syncFromEngine(newId)
      }
    })
    return unsub
  }, [syncFromEngine])

  // ── Subscribe to PatchEngine ───────────────────────────────────────────────
  // Re-read the block whenever the document changes (patch applied)

  useEffect(() => {
    const unsub = engine.subscribe(() => {
      const id = selectedBlockIdRef.current
      if (id) syncFromEngine(id)
    })
    return unsub
  }, [syncFromEngine])

  // ── Actions ────────────────────────────────────────────────────────────────

  const updateField = useCallback((key: string, value: unknown) => {
    if (!block) return
    engine.enqueuePatch({
      op:     'update',
      target: 'block',
      id:     block.id,
      data:   { content: { ...(block.content as Record<string, unknown>), [key]: value } },
      meta:   { source: 'editor' },
    })
  }, [block])

  const updateContent = useCallback((content: Record<string, unknown>) => {
    if (!block) return
    engine.enqueuePatch({
      op:     'update',
      target: 'block',
      id:     block.id,
      data:   { content: { ...(block.content as Record<string, unknown>), ...content } },
      meta:   { source: 'editor' },
    })
  }, [block])

  const updateSettings = useCallback((settings: Record<string, unknown>) => {
    if (!block) return
    engine.enqueuePatch({
      op:     'update',
      target: 'block',
      id:     block.id,
      data:   { settings: { ...(block.settings as Record<string, unknown>), ...settings } },
      meta:   { source: 'editor' },
    })
  }, [block])

  const deleteBlock = useCallback(() => {
    if (!block) return
    engine.enqueuePatch({
      op:     'remove',
      target: 'block',
      id:     block.id,
      meta:   { source: 'editor' },
    })
    useSelectionStore.getState().selectBlock(null)
  }, [block])

  const duplicateBlock = useCallback(() => {
    if (!block || !sectionId) return
    engine.enqueuePatch({
      op:       'add',
      target:   'block',
      data: {
        type:            block.type,
        parentSectionId: sectionId,
        content:         { ...(block.content as Record<string, unknown>) },
        settings:        { ...(block.settings as Record<string, unknown>) },
      },
      position: { placement: 'after', ref: block.id },
      meta:     { source: 'editor' },
    })
  }, [block, sectionId])

  const moveUp = useCallback(() => {
    if (!block || !sectionId) return
    const idx = getBlockIndex(sectionId, block.id)
    if (idx <= 0) return
    const section  = engine.getDocument().sections.find(s => s.id === sectionId)
    const prevBlock = section?.blocks[idx - 1]
    if (!prevBlock) return
    engine.enqueuePatch({
      op:       'move-block',
      blockId:  block.id,
      fromSection: sectionId,
      toSection:   sectionId,
      position: { placement: 'before', ref: prevBlock.id },
      meta:     { source: 'editor' },
    })
  }, [block, sectionId])

  const moveDown = useCallback(() => {
    if (!block || !sectionId) return
    const section = engine.getDocument().sections.find(s => s.id === sectionId)
    if (!section) return
    const idx      = getBlockIndex(sectionId, block.id)
    const nextBlock = section.blocks[idx + 1]
    if (!nextBlock) return
    engine.enqueuePatch({
      op:       'move-block',
      blockId:  block.id,
      fromSection: sectionId,
      toSection:   sectionId,
      position: { placement: 'after', ref: nextBlock.id },
      meta:     { source: 'editor' },
    })
  }, [block, sectionId])

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    block,
    sectionId,
    hasBlock:       block !== null,
    updateField,
    updateContent,
    updateSettings,
    deleteBlock,
    duplicateBlock,
    moveUp,
    moveDown,
  }
}
