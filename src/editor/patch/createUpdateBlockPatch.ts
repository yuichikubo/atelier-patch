/**
 * ATELIER CMS — Update Block Patch Factory
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * Pure factory functions that build typed UpdatePatch objects for block edits.
 * These functions produce only data — no side effects, no engine calls.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • All functions are pure — zero imports at runtime, only type imports.
 * • They return valid UpdatePatch objects that PatchEngine.enqueuePatch()
 *   accepts without modification.
 * • Callers pass the result to `dispatchPatch` (see dispatchPatch.ts).
 *
 * DATA FLOW
 * ─────────
 *   TextPropertyEditor / useUpdateBlock
 *     → createUpdateBlockPatch(blockId, { content:{ text:'…' } })
 *       → dispatchPatch(patch)
 *         → engine.enqueuePatch(patch)   ← PatchEngine applies
 *           → Renderer re-renders block
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { UpdatePatch, PatchSource } from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// createUpdateBlockPatch — update content and/or settings on a block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an UpdatePatch that modifies an existing block's content, settings,
 * or both. The `data` object is merged into the block by PatchEngine.
 *
 * @param blockId  The id of the block to update.
 * @param data     The fields to merge — typically `{ content: {…} }` or
 *                 `{ settings: {…} }` or both.
 * @param source   Subsystem sending the patch. Defaults to 'editor'.
 *
 * @example — update a single content field
 *   const patch = createUpdateBlockPatch('block_001', {
 *     content: { text: 'New headline copy' },
 *   })
 *   dispatchPatch(patch)
 *
 * @example — update block settings (alignment)
 *   const patch = createUpdateBlockPatch('block_001', {
 *     settings: { align: 'center' },
 *   })
 *   dispatchPatch(patch)
 *
 * @example — update content and settings in one patch
 *   const patch = createUpdateBlockPatch('block_001', {
 *     content:  { title: 'New title', subtitle: 'New subtitle' },
 *     settings: { align: 'left' },
 *   })
 */
export function createUpdateBlockPatch(
  blockId: string,
  data:    Record<string, unknown>,
  source:  PatchSource = 'editor',
): UpdatePatch {
  return {
    op:     'update',
    target: 'block',
    id:     blockId,
    data,
    meta: {
      source,
      timestamp: new Date().toISOString(),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createUpdateBlockContentPatch — convenience: update only content fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shorthand for updating a block's content object.
 * The provided `content` is merged over the block's existing content by
 * PatchEngine — existing keys not listed here are preserved.
 *
 * @param blockId  The block to update.
 * @param content  Partial content fields to apply.
 * @param source   Patch source. Defaults to 'editor'.
 *
 * @example
 *   dispatchPatch(
 *     createUpdateBlockContentPatch('block_001', { text: 'Hello world' })
 *   )
 */
export function createUpdateBlockContentPatch(
  blockId: string,
  content: Record<string, unknown>,
  source:  PatchSource = 'editor',
): UpdatePatch {
  return createUpdateBlockPatch(blockId, { content }, source)
}

// ─────────────────────────────────────────────────────────────────────────────
// createUpdateBlockSettingsPatch — convenience: update only settings fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shorthand for updating a block's settings object (alignment, className, etc.).
 *
 * @param blockId   The block to update.
 * @param settings  Partial settings fields to apply.
 * @param source    Patch source. Defaults to 'editor'.
 *
 * @example
 *   dispatchPatch(
 *     createUpdateBlockSettingsPatch('block_001', { align: 'center' })
 *   )
 */
export function createUpdateBlockSettingsPatch(
  blockId:  string,
  settings: Record<string, unknown>,
  source:   PatchSource = 'editor',
): UpdatePatch {
  return createUpdateBlockPatch(blockId, { settings }, source)
}

// ─────────────────────────────────────────────────────────────────────────────
// createUpdateBlockFieldPatch — convenience: update a single content field
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shorthand for changing a single named field inside block content.
 * Produces the same patch as `createUpdateBlockContentPatch` but expressed
 * as a key/value pair — useful in generic field editors.
 *
 * @param blockId  The block to update.
 * @param key      The content field name, e.g. 'text', 'title', 'buttonUrl'.
 * @param value    The new value for that field.
 * @param source   Patch source. Defaults to 'editor'.
 *
 * @example
 *   dispatchPatch(createUpdateBlockFieldPatch('block_001', 'title', 'Welcome'))
 *   dispatchPatch(createUpdateBlockFieldPatch('block_001', 'open',  true))
 */
export function createUpdateBlockFieldPatch(
  blockId: string,
  key:     string,
  value:   unknown,
  source:  PatchSource = 'editor',
): UpdatePatch {
  return createUpdateBlockContentPatch(blockId, { [key]: value }, source)
}
