'use client'
/**
 * ATELIER CMS — useUpdateBlock Hook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `useUpdateBlock` provides React callbacks for updating block content and
 * settings. It combines the patch factory (createUpdateBlockPatch) with the
 * patch dispatcher (dispatchPatch) into a single, ergonomic hook.
 *
 * DATA FLOW
 * ─────────
 *   Component calls updateBlock(blockId, data)    ← this hook
 *     → createUpdateBlockPatch(blockId, data)     builds the patch
 *       → dispatchPatch(patch)                    sends to engine
 *         → engine.enqueuePatch(patch)            PatchEngine applies
 *         → patchEventBus.emit('patch-applied')   bus notified
 *           → Renderer re-renders block           canvas updates
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Hook never calls PatchEngine directly — all engine access goes through
 *   dispatchPatch, keeping the editor layer decoupled from the engine.
 * • All callbacks are memoised with useCallback so they are stable across
 *   re-renders and safe to pass as props or put in dependency arrays.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback }                         from 'react'
import { dispatchPatch }                        from './dispatchPatch'
import {
  createUpdateBlockPatch,
  createUpdateBlockContentPatch,
  createUpdateBlockSettingsPatch,
  createUpdateBlockFieldPatch,
}                                              from './createUpdateBlockPatch'
import type { PatchSource }                     from '@/core/patch/types'
import type { PatchResult }                     from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseUpdateBlockReturn {
  /**
   * Update a block's `data` object (may include `content`, `settings`, or both).
   * The patch is built and dispatched immediately.
   *
   * @param blockId  Block to update.
   * @param data     Partial data object — merged over the block by PatchEngine.
   *
   * @example
   *   updateBlock('block_001', { content: { text: 'New copy' } })
   *   updateBlock('block_001', { settings: { align: 'center' } })
   */
  updateBlock(blockId: string, data: Record<string, unknown>): PatchResult

  /**
   * Update only the block's content fields.
   * Equivalent to `updateBlock(id, { content: { …fields } })`.
   *
   * @example
   *   updateBlockContent('block_001', { title: 'Welcome', subtitle: 'Tagline' })
   */
  updateBlockContent(
    blockId: string,
    content: Record<string, unknown>,
  ): PatchResult

  /**
   * Update only the block's settings fields (alignment, className, etc.).
   *
   * @example
   *   updateBlockSettings('block_001', { align: 'right' })
   */
  updateBlockSettings(
    blockId: string,
    settings: Record<string, unknown>,
  ): PatchResult

  /**
   * Update a single named content field on a block.
   * Produces the same patch as `updateBlockContent({ [key]: value })` but
   * expressed as a key/value pair — convenient for generic field editors.
   *
   * @example
   *   updateField('block_001', 'text',      'Hello world')
   *   updateField('block_001', 'buttonUrl', 'https://example.com')
   *   updateField('block_001', 'open',      true)
   */
  updateField(
    blockId: string,
    key:     string,
    value:   unknown,
  ): PatchResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that provides stable, memoised callbacks for block property edits.
 *
 * @param source  Optional source label passed through to the patch meta.
 *               Defaults to 'editor'. Use 'ai' when called from AI adapters.
 *
 * @example — in a custom field component
 *   function MyEditor({ blockId }: { blockId: string }) {
 *     const { updateField } = useUpdateBlock()
 *     return (
 *       <input onChange={e => updateField(blockId, 'text', e.target.value)} />
 *     )
 *   }
 *
 * @example — bulk update
 *   const { updateBlockContent } = useUpdateBlock()
 *   updateBlockContent(blockId, { title: 'New', subtitle: 'Sub' })
 */
export function useUpdateBlock(source: PatchSource = 'editor'): UseUpdateBlockReturn {

  const updateBlock = useCallback((
    blockId: string,
    data:    Record<string, unknown>,
  ): PatchResult => {
    const patch = createUpdateBlockPatch(blockId, data, source)
    return dispatchPatch(patch, { source })
  }, [source])

  const updateBlockContent = useCallback((
    blockId: string,
    content: Record<string, unknown>,
  ): PatchResult => {
    const patch = createUpdateBlockContentPatch(blockId, content, source)
    return dispatchPatch(patch, { source })
  }, [source])

  const updateBlockSettings = useCallback((
    blockId:  string,
    settings: Record<string, unknown>,
  ): PatchResult => {
    const patch = createUpdateBlockSettingsPatch(blockId, settings, source)
    return dispatchPatch(patch, { source })
  }, [source])

  const updateField = useCallback((
    blockId: string,
    key:     string,
    value:   unknown,
  ): PatchResult => {
    const patch = createUpdateBlockFieldPatch(blockId, key, value, source)
    return dispatchPatch(patch, { source })
  }, [source])

  return {
    updateBlock,
    updateBlockContent,
    updateBlockSettings,
    updateField,
  }
}
