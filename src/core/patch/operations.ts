/**
 * ATELIER CMS — Operation Schema
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file is the single source of truth for every editing action that can
 * be performed on an ATELIER document.
 *
 * Architecture contract
 * ─────────────────────
 * • Operation Schema  — describes WHAT actions are allowed (this file)
 * • PatchEngine       — executes operations by translating them into patches
 * • Editor            — creates operations from user gestures
 * • AI / Automation   — creates operations from generated instructions
 * • Plugins           — create operations from external triggers
 *
 * This file is READ-ONLY from the PatchEngine's perspective.
 * It does NOT modify PatchEngine behaviour.
 * Importing this file does NOT cause any side effects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  BlockType,
  SectionType,
  BlockContent,
  BlockSettings,
  SectionSettings,
  SEOMeta,
  PageStatus,
} from '@/core/document/types'

import type { PatchSource, PatchPosition } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Operation type constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All valid operation identifiers.
 * Use these constants instead of raw strings to prevent typos and enable
 * autocomplete when building operations in the Editor, AI adapter, or plugins.
 */
export const OperationTypes = {
  // ── Page ──────────────────────────────────────────────────────────────────
  UPDATE_PAGE:       'update-page',

  // ── Section ───────────────────────────────────────────────────────────────
  ADD_SECTION:       'add-section',
  UPDATE_SECTION:    'update-section',
  REMOVE_SECTION:    'remove-section',
  MOVE_SECTION:      'move-section',

  // ── Block ─────────────────────────────────────────────────────────────────
  ADD_BLOCK:         'add-block',
  UPDATE_BLOCK:      'update-block',
  MOVE_BLOCK:        'move-block',
  DELETE_BLOCK:      'delete-block',

  // ── Compound ──────────────────────────────────────────────────────────────
  DUPLICATE_BLOCK:   'duplicate-block',
  DUPLICATE_SECTION: 'duplicate-section',
  CLEAR_SECTION:     'clear-section',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Derived types
// ─────────────────────────────────────────────────────────────────────────────

/** All valid operation type strings derived from OperationTypes. */
export type OperationType = (typeof OperationTypes)[keyof typeof OperationTypes]

/** Where in a list the operation should be applied. */
export type OperationPlacement = PatchPosition   // 'start'|'end'|'before'|'after'|'index'

/** Which subsystem is issuing the operation. */
export type OperationSource = PatchSource        // 'editor'|'ai'|'automation'|'plugin'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Base operation interface
// ─────────────────────────────────────────────────────────────────────────────

/** Common metadata carried by every operation. */
export interface OperationMeta {
  /** Subsystem that produced this operation. */
  source?:    OperationSource
  /** ISO timestamp — set automatically if omitted. */
  timestamp?: string
  /** Originating plugin, if applicable. */
  pluginId?:  string
  /** User who triggered the operation. */
  userId?:    string
}

/**
 * Base interface for all ATELIER operations.
 * Every typed operation below extends or narrows this shape.
 */
export interface Operation {
  /** Identifies the kind of edit to perform. */
  type:       OperationType
  /** Primary entity this operation acts on (section id, block id, etc.). */
  targetId?:  string
  /** Payload describing what the operation should do. */
  data?:      unknown
  /** Contextual metadata. */
  meta?:      OperationMeta
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Typed operation interfaces
// ─────────────────────────────────────────────────────────────────────────────

// ── Page operations ──────────────────────────────────────────────────────────

export interface UpdatePageOperation extends Operation {
  type: 'update-page'
  data: {
    title?:  string
    slug?:   string
    status?: PageStatus
    themeId?: string
    seo?:    Partial<SEOMeta>
  }
}

// ── Section operations ───────────────────────────────────────────────────────

export interface AddSectionOperation extends Operation {
  type: 'add-section'
  data: {
    sectionType: SectionType
    label?:      string
    settings?:   Partial<SectionSettings>
    placement:   OperationPlacement
    /** Reference section id (required for 'before' / 'after' placements). */
    ref?:        string
    /** Numeric index (required for 'index' placement). */
    index?:      number
  }
}

export interface UpdateSectionOperation extends Operation {
  type:     'update-section'
  targetId: string           // section id
  data: {
    label?:    string
    settings?: Partial<SectionSettings>
  }
}

export interface RemoveSectionOperation extends Operation {
  type:     'remove-section'
  targetId: string           // section id
}

export interface MoveSectionOperation extends Operation {
  type:     'move-section'
  targetId: string           // section id to move
  data: {
    placement: OperationPlacement
    ref?:      string
    index?:    number
  }
}

export interface DuplicateSectionOperation extends Operation {
  type:     'duplicate-section'
  targetId: string           // section id to clone
}

export interface ClearSectionOperation extends Operation {
  type:     'clear-section'
  targetId: string           // section id — removes all its blocks
}

// ── Block operations ─────────────────────────────────────────────────────────

export interface AddBlockOperation extends Operation {
  type: 'add-block'
  data: {
    blockType:       BlockType
    parentSectionId: string
    content?:        Partial<BlockContent>
    settings?:       Partial<BlockSettings>
    placement?:      OperationPlacement
    /** Reference block id (required for 'before' / 'after' placements). */
    ref?:            string
    index?:          number
  }
}

export interface UpdateBlockOperation extends Operation {
  type:     'update-block'
  targetId: string           // block id
  data: {
    content?:  Partial<BlockContent>
    settings?: Partial<BlockSettings>
  }
}

export interface MoveBlockOperation extends Operation {
  type:     'move-block'
  targetId: string           // block id to move
  data: {
    fromSectionId: string
    toSectionId:   string
    placement:     OperationPlacement
    ref?:          string
    index?:        number
  }
}

export interface DeleteBlockOperation extends Operation {
  type:     'delete-block'
  targetId: string           // block id
}

export interface DuplicateBlockOperation extends Operation {
  type:     'duplicate-block'
  targetId: string           // block id to clone
  data: {
    parentSectionId: string  // section to place the clone in
  }
}

// ── Discriminated union of all operation types ───────────────────────────────

export type AnyOperation =
  | UpdatePageOperation
  | AddSectionOperation
  | UpdateSectionOperation
  | RemoveSectionOperation
  | MoveSectionOperation
  | DuplicateSectionOperation
  | ClearSectionOperation
  | AddBlockOperation
  | UpdateBlockOperation
  | MoveBlockOperation
  | DeleteBlockOperation
  | DuplicateBlockOperation

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Helper factory functions
// ─────────────────────────────────────────────────────────────────────────────
//
// These helpers construct valid operation objects.
// They do NOT call PatchEngine — callers are responsible for execution.
//
// Typical usage:
//   const op = createAddBlockOperation({ blockType:'hero', parentSectionId:sId })
//   engine.enqueuePatch(operationToPatch(op))   // adapter not included here

/** Attaches a timestamp to meta if none is provided. */
function withMeta(meta?: OperationMeta): OperationMeta {
  return { timestamp: new Date().toISOString(), ...meta }
}

// ── Page helpers ─────────────────────────────────────────────────────────────

export function createUpdatePageOperation(
  data: UpdatePageOperation['data'],
  meta?: OperationMeta,
): UpdatePageOperation {
  return { type: OperationTypes.UPDATE_PAGE, data, meta: withMeta(meta) }
}

// ── Section helpers ──────────────────────────────────────────────────────────

export function createAddSectionOperation(
  data: AddSectionOperation['data'],
  meta?: OperationMeta,
): AddSectionOperation {
  return { type: OperationTypes.ADD_SECTION, data, meta: withMeta(meta) }
}

export function createUpdateSectionOperation(
  sectionId: string,
  data: UpdateSectionOperation['data'],
  meta?: OperationMeta,
): UpdateSectionOperation {
  return { type: OperationTypes.UPDATE_SECTION, targetId: sectionId, data, meta: withMeta(meta) }
}

export function createRemoveSectionOperation(
  sectionId: string,
  meta?: OperationMeta,
): RemoveSectionOperation {
  return { type: OperationTypes.REMOVE_SECTION, targetId: sectionId, meta: withMeta(meta) }
}

export function createMoveSectionOperation(
  sectionId: string,
  data: MoveSectionOperation['data'],
  meta?: OperationMeta,
): MoveSectionOperation {
  return { type: OperationTypes.MOVE_SECTION, targetId: sectionId, data, meta: withMeta(meta) }
}

export function createDuplicateSectionOperation(
  sectionId: string,
  meta?: OperationMeta,
): DuplicateSectionOperation {
  return { type: OperationTypes.DUPLICATE_SECTION, targetId: sectionId, meta: withMeta(meta) }
}

export function createClearSectionOperation(
  sectionId: string,
  meta?: OperationMeta,
): ClearSectionOperation {
  return { type: OperationTypes.CLEAR_SECTION, targetId: sectionId, meta: withMeta(meta) }
}

// ── Block helpers ────────────────────────────────────────────────────────────

export function createAddBlockOperation(
  data: AddBlockOperation['data'],
  meta?: OperationMeta,
): AddBlockOperation {
  return { type: OperationTypes.ADD_BLOCK, data, meta: withMeta(meta) }
}

export function createUpdateBlockOperation(
  blockId: string,
  data: UpdateBlockOperation['data'],
  meta?: OperationMeta,
): UpdateBlockOperation {
  return { type: OperationTypes.UPDATE_BLOCK, targetId: blockId, data, meta: withMeta(meta) }
}

export function createMoveBlockOperation(
  blockId: string,
  data: MoveBlockOperation['data'],
  meta?: OperationMeta,
): MoveBlockOperation {
  return { type: OperationTypes.MOVE_BLOCK, targetId: blockId, data, meta: withMeta(meta) }
}

export function createDeleteBlockOperation(
  blockId: string,
  meta?: OperationMeta,
): DeleteBlockOperation {
  return { type: OperationTypes.DELETE_BLOCK, targetId: blockId, meta: withMeta(meta) }
}

export function createDuplicateBlockOperation(
  blockId: string,
  parentSectionId: string,
  meta?: OperationMeta,
): DuplicateBlockOperation {
  return {
    type:     OperationTypes.DUPLICATE_BLOCK,
    targetId: blockId,
    data:     { parentSectionId },
    meta:     withMeta(meta),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Type guard utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true if `op` targets the page level. */
export function isPageOperation(op: Operation): op is UpdatePageOperation {
  return op.type === OperationTypes.UPDATE_PAGE
}

/** Returns true if `op` targets a section. */
export function isSectionOperation(op: Operation): op is
  | AddSectionOperation
  | UpdateSectionOperation
  | RemoveSectionOperation
  | MoveSectionOperation
  | DuplicateSectionOperation
  | ClearSectionOperation {
  return (
    op.type === OperationTypes.ADD_SECTION    ||
    op.type === OperationTypes.UPDATE_SECTION ||
    op.type === OperationTypes.REMOVE_SECTION ||
    op.type === OperationTypes.MOVE_SECTION   ||
    op.type === OperationTypes.DUPLICATE_SECTION ||
    op.type === OperationTypes.CLEAR_SECTION
  )
}

/** Returns true if `op` targets a block. */
export function isBlockOperation(op: Operation): op is
  | AddBlockOperation
  | UpdateBlockOperation
  | MoveBlockOperation
  | DeleteBlockOperation
  | DuplicateBlockOperation {
  return (
    op.type === OperationTypes.ADD_BLOCK       ||
    op.type === OperationTypes.UPDATE_BLOCK    ||
    op.type === OperationTypes.MOVE_BLOCK      ||
    op.type === OperationTypes.DELETE_BLOCK    ||
    op.type === OperationTypes.DUPLICATE_BLOCK
  )
}
