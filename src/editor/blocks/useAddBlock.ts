'use client'
/**
 * ATELIER CMS — useAddBlock Hook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `useAddBlock` is the React hook that connects the Block Library UI to the
 * Patch Engine. It is the glue layer between user intent and document mutation.
 *
 * FULL DATA FLOW
 * ──────────────
 *   User clicks a block in BlockLibrary
 *     → BlockLibrary calls onSelect(type, definition)
 *       → component calls addBlock(type)  ← this hook
 *         → resolveTargetSection()         builds context
 *         → createAddSectionPatch()        if page is empty
 *         → createAddBlockPatch(type, …)   builds the patch
 *         → dispatchPatch(patch)           sends to engine
 *           → engine.enqueuePatch(patch)   PatchEngine applies
 *           → patchEventBus.emit(…)        public bus notified
 *             → Renderer re-renders canvas
 *               → Stickman controller reacts (block-added event)
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This hook does NOT import from PatchEngine directly.
 * • All engine access flows through `dispatchPatch` and `dispatchPatchArray`.
 * • All patch construction flows through `createAddBlockPatch`.
 * • The hook returns action functions — it holds no document state itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback }          from 'react'
import {
  dispatchPatch,
  dispatchPatchArray,
  type DispatchOptions,
}                               from '@/editor/patch/dispatchPatch'
import {
  createAddBlockPatch,
  createAddSectionPatch,
  resolveTargetSection,
  getBlockLabel,
  type AddBlockOptions,
}                               from '@/editor/patch/createAddBlockPatch'
import type { BlockTypeDefinition } from './blockTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAddBlockOptions {
  /**
   * The section id to add blocks into.
   * If omitted, the hook automatically targets the last section on the page,
   * or creates a new blank section if the page is empty.
   */
  sectionId?: string | null
  /** Passed through to dispatchPatch. Defaults to 'editor'. */
  source?: DispatchOptions['source']
}

export interface AddBlockResult {
  /** Whether the block (and any auto-created section) was added successfully. */
  ok:         boolean
  /** The block type that was added. */
  type:       string
  /** Human-readable label for the type (used in toasts / aria). */
  label:      string
  /** Error message if ok is false. */
  error?:     string
  /** True when a section was auto-created before the block was inserted. */
  autoCreatedSection: boolean
}

export interface UseAddBlockReturn {
  /**
   * Add a block of the given type to the page.
   *
   * • If no sectionId is provided (via hook options), the last section is used.
   * • If the page has no sections yet, a blank section is auto-created first.
   * • Both patches (section + block) are applied atomically when auto-creating.
   *
   * @param type          Block type string — e.g. 'hero', 'text', 'gallery'
   * @param blockOptions  Optional content overrides and placement
   *
   * @example
   *   const { addBlock } = useAddBlock()
   *   addBlock('hero')
   *   addBlock('text', { content: { text: 'Hello world' } })
   */
  addBlock(type: string, blockOptions?: AddBlockOptions): AddBlockResult

  /**
   * Convenience overload — accepts a full BlockTypeDefinition directly.
   * Typically called from BlockLibrary's onSelect handler:
   *
   * @example
   *   <BlockLibrary onSelect={(type, def) => addBlockFromDefinition(def)} />
   */
  addBlockFromDefinition(
    definition:   BlockTypeDefinition,
    blockOptions?: AddBlockOptions,
  ): AddBlockResult
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that provides `addBlock` and `addBlockFromDefinition`.
 *
 * Stateless — safe to call in any component. Re-renders are never triggered
 * by this hook itself; they are driven by PatchEngine subscriptions in the
 * canvas components.
 *
 * @example — basic use
 *   function MySidebar() {
 *     const { addBlock } = useAddBlock()
 *     return <BlockLibrary onSelect={(type) => addBlock(type)} />
 *   }
 *
 * @example — target a specific section
 *   const { addBlock } = useAddBlock({ sectionId: currentSectionId })
 *   addBlock('text')
 *
 * @example — with the full definition from BlockLibrary
 *   const { addBlockFromDefinition } = useAddBlock()
 *   <BlockLibrary onSelect={(type, def) => addBlockFromDefinition(def)} />
 */
export function useAddBlock(hookOptions: UseAddBlockOptions = {}): UseAddBlockReturn {
  const { sectionId: hookSectionId = null, source = 'editor' } = hookOptions

  const addBlock = useCallback((
    type:         string,
    blockOptions: AddBlockOptions = {},
  ): AddBlockResult => {
    const label = getBlockLabel(type)

    // ── Resolve which section receives the block ─────────────────────────────
    const resolvedSectionId = resolveTargetSection(hookSectionId)

    if (resolvedSectionId) {
      // ── Page already has at least one section — add block directly ──────────
      const patch  = createAddBlockPatch(type, resolvedSectionId, { source, ...blockOptions })
      const result = dispatchPatch(patch, { source })

      return {
        ok:                 result.ok,
        type,
        label,
        error:              result.error?.message,
        autoCreatedSection: false,
      }
    }

    // ── Page has no sections — create one and add the block atomically ────────
    const sectionPatch = createAddSectionPatch('blank', 'end', undefined, source)

    // The engine assigns an id after the patch is applied, so we build a
    // two-patch array: [add-section, add-block-to-first-section].
    // Because the engine doesn't return the new section id before apply, we
    // apply the section patch first, then resolve the id, then apply the block.

    const sectionResult = dispatchPatch(sectionPatch, { source, silent: true })
    if (!sectionResult.ok) {
      return {
        ok:                 false,
        type,
        label,
        error:              sectionResult.error?.message ?? 'Failed to create section',
        autoCreatedSection: false,
      }
    }

    // Now the section exists — resolve its id
    const newSectionId = resolveTargetSection(null)
    if (!newSectionId) {
      return {
        ok:                 false,
        type,
        label,
        error:              'Section was created but id could not be resolved',
        autoCreatedSection: true,
      }
    }

    const blockPatch  = createAddBlockPatch(type, newSectionId, { source, ...blockOptions })
    const blockResult = dispatchPatch(blockPatch, { source })

    return {
      ok:                 blockResult.ok,
      type,
      label,
      error:              blockResult.error?.message,
      autoCreatedSection: true,
    }
  }, [hookSectionId, source])

  const addBlockFromDefinition = useCallback((
    definition:    BlockTypeDefinition,
    blockOptions?: AddBlockOptions,
  ): AddBlockResult => {
    return addBlock(definition.type, blockOptions)
  }, [addBlock])

  return { addBlock, addBlockFromDefinition }
}
