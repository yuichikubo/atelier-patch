/**
 * ATELIER CMS — Add Block Patch Factory
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * Factory functions that build the typed Patch objects needed to add blocks
 * and sections to the document. These functions produce pure data — they do
 * NOT touch the engine, selection store, or event bus.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • All functions in this file are pure (no side effects).
 * • They return valid Patch objects compatible with PatchEngine.enqueuePatch().
 * • Callers pass the result to `dispatchPatch` to apply it.
 * • Default content comes from `BLOCK_DEFAULTS` in blockTypes.ts so both
 *   PalettePanel and BlockLibrary use the same starting values.
 *
 * DATA FLOW
 * ─────────
 *   useAddBlock(type, sectionId)
 *     → createAddBlockPatch(type, sectionId, options?)  ← this file
 *       → dispatchPatch(patch)
 *         → engine.enqueuePatch(patch)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BLOCK_DEFAULTS, getBlockTypeDefinition } from '@/editor/blocks/blockTypes'
import type { AddPatch, PatchPositionDescriptor, PatchSource } from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AddBlockOptions {
  /**
   * Where in the section the new block should be inserted.
   * Defaults to 'end' (appended after all existing blocks).
   */
  placement?: PatchPositionDescriptor['placement']
  /** Reference block id — required for 'before' / 'after' placements. */
  ref?:       string
  /** Numeric index — required for 'index' placement. */
  index?:     number
  /**
   * Override the default content for this block type.
   * Merged over the type's defaultContent, so partial overrides are safe.
   */
  content?:   Record<string, unknown>
  /** Subsystem issuing this patch. Defaults to 'editor'. */
  source?:    PatchSource
}

export interface AddSectionWithBlockOptions {
  /** Section type. Defaults to 'blank'. */
  sectionType?: string
  /** Where in the page to insert the section. Defaults to 'end'. */
  sectionPlacement?: PatchPositionDescriptor['placement']
  /** Options for the block added inside the new section. */
  blockOptions?: Omit<AddBlockOptions, 'placement' | 'ref' | 'index'>
  source?: PatchSource
}

// ─────────────────────────────────────────────────────────────────────────────
// createAddBlockPatch — add a single block to an existing section
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an AddPatch that inserts a new block into an existing section.
 *
 * The block's initial content is sourced from `BLOCK_DEFAULTS[type]` and can
 * be partially overridden via `options.content`.
 *
 * @param type       Block type identifier — e.g. 'hero', 'text', 'gallery'
 * @param sectionId  The section that will receive the new block
 * @param options    Placement, content overrides, source
 *
 * @example
 *   const patch = createAddBlockPatch('text', 'section_001')
 *   dispatchPatch(patch)
 *
 * @example — insert before an existing block
 *   const patch = createAddBlockPatch('image', 'section_001', {
 *     placement: 'before',
 *     ref:       'block_abc',
 *   })
 */
export function createAddBlockPatch(
  type:      string,
  sectionId: string,
  options:   AddBlockOptions = {},
): AddPatch {
  const {
    placement = 'end',
    ref,
    index,
    content,
    source = 'editor',
  } = options

  // Merge caller-supplied content over the registered defaults
  const baseContent = BLOCK_DEFAULTS[type] ?? {}
  const finalContent = content
    ? { ...baseContent, ...content }
    : baseContent

  return {
    op:       'add',
    target:   'block',
    data:     {
      type,
      parentSectionId: sectionId,
      content:         finalContent,
    },
    position: { placement, ref, index },
    meta:     {
      source,
      timestamp: new Date().toISOString(),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createAddSectionPatch — add a blank section to the page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an AddPatch that inserts a new section into the page.
 * The engine assigns the section a new id automatically.
 *
 * @param sectionType  Section type, e.g. 'blank', 'content', 'hero'.
 *                     Defaults to 'blank'.
 * @param placement    Where in the page to insert. Defaults to 'end'.
 * @param ref          Reference section id for 'before'/'after' placements.
 * @param source       Patch source subsystem.
 *
 * @example
 *   const patch = createAddSectionPatch()
 *   dispatchPatch(patch)
 */
export function createAddSectionPatch(
  sectionType: string = 'blank',
  placement:   PatchPositionDescriptor['placement'] = 'end',
  ref?:        string,
  source:      PatchSource = 'editor',
): AddPatch {
  return {
    op:       'add',
    target:   'section',
    data:     { type: sectionType },
    position: { placement, ref },
    meta:     {
      source,
      timestamp: new Date().toISOString(),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// createAddBlockToPagePatch — ensure a section exists, then add a block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the target section id for a new block.
 *
 * • If `sectionId` is provided, that section is used directly.
 * • If `sectionId` is null / undefined, the function looks up the last
 *   section in the current document. If none exists, returns null so the
 *   caller knows it must create a section first (see `useAddBlock`).
 *
 * @param sectionId  Explicit section id, or null to auto-resolve.
 * @returns          Resolved section id, or null if the page has no sections.
 */
export function resolveTargetSection(
  sectionId?: string | null,
): string | null {
  if (sectionId) return sectionId

  // Dynamic import avoided — access engine lazily to prevent SSR cycles
  // We import the module synchronously here since it's always available
  // in the client bundle where this function is called.
  const { engine } = require('@/core/document/engineInstance') as typeof import('@/core/document/engineInstance')
  const doc = engine.getDocument()
  const sections = [...(doc.sections ?? [])].sort((a, b) => a.order - b.order)
  return sections.length > 0 ? sections[sections.length - 1].id : null
}

// ─────────────────────────────────────────────────────────────────────────────
// getBlockLabel — convenience util used by UI toast / aria labels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the human-readable label for a block type.
 * Falls back to the capitalised type string if the type is not registered.
 *
 * @example
 *   getBlockLabel('feature-list')  // → 'Feature List'
 *   getBlockLabel('custom-widget') // → 'Custom-widget'
 */
export function getBlockLabel(type: string): string {
  const def = getBlockTypeDefinition(type)
  if (def) return def.label
  return type.charAt(0).toUpperCase() + type.slice(1)
}
