'use client'
/**
 * ATELIER CMS — Unified Selection Store
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SINGLE SOURCE OF TRUTH for all editor selection state.
 *
 * State:
 *   selectedBlockId   — block currently selected (inspector + inline editing)
 *   selectedSectionId — section currently selected (section chrome)
 *   hoveredBlockId    — block the cursor is over (hover ring)
 *   editingBlockId    — block currently being inline-edited (text cursor active)
 *
 * Rules:
 *   • Selection is UI state only. Never calls engine.enqueuePatch().
 *   • All editor components read from THIS store — no local useState for selection.
 *   • Non-React systems (AI, automation) use the core store at
 *     src/core/editor/selectionStore.ts, which this store bridges to.
 *   • editorEvents CustomEvents are fired here so Stickman and legacy
 *     listeners stay in sync without any component needing to call them.
 *
 * Architecture:
 *   EditorCanvas click → store.selectBlock(id)
 *     → Zustand re-renders Canvas, InspectorPanel, InlineTextEditor
 *     → coreStore.selectBlock(id) for AI/automation
 *     → window CustomEvent for Stickman
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create }          from 'zustand'
import { selectionStore as coreStore } from '@/core/editor/selectionStore'

// ─────────────────────────────────────────────────────────────────────────────
// State shape
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectionState {
  // ── Selection ──────────────────────────────────────────────────────────────

  /** Block currently selected. Inspector reads this. */
  selectedBlockId:    string | null

  /** Section currently selected. Section chrome reads this. */
  selectedSectionId:  string | null

  /** Block the cursor is hovering over. HoverOutline reads this. */
  hoveredBlockId:     string | null

  /**
   * Block currently being inline-edited (text cursor is active inside it).
   * Set when InlineTextEditor receives focus; cleared on blur.
   * Distinct from selectedBlockId: a block can be selected without the
   * inline editor being active, but editingBlockId implies selectedBlockId.
   */
  editingBlockId:     string | null

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Select a block. Clears section selection.
   * Fires 'block-selected' CustomEvent for Stickman.
   */
  selectBlock: (id: string | null) => void

  /**
   * Select a section. Clears block selection and editing state.
   * Fires 'section-select' CustomEvent.
   */
  selectSection: (id: string | null) => void

  /**
   * Update hover without touching selection.
   */
  hoverBlock: (id: string | null) => void

  /**
   * Mark a block as actively being inline-edited.
   * Also ensures the block is selected.
   */
  startEditing: (blockId: string) => void

  /**
   * Clear the inline editing state. Block remains selected.
   */
  stopEditing: () => void

  /**
   * Clear all selection, hover, and editing state.
   * Called on canvas background click.
   */
  clearSelection: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomEvent helpers (Stickman + legacy listeners)
// ─────────────────────────────────────────────────────────────────────────────

function fireEvent(name: string, detail?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedBlockId:   null,
  selectedSectionId: null,
  hoveredBlockId:    null,
  editingBlockId:    null,

  selectBlock: (id) => {
    set({ selectedBlockId: id, selectedSectionId: null })
    coreStore.selectBlock(id, { source: 'click', keepSection: false })
    fireEvent('block-selected', { blockId: id })
  },

  selectSection: (id) => {
    set({ selectedSectionId: id, selectedBlockId: null, editingBlockId: null })
    coreStore.selectSection(id, { source: 'click', keepBlock: false })
    if (id) fireEvent('section-select', { sectionId: id })
  },

  hoverBlock: (id) => {
    set({ hoveredBlockId: id })
    coreStore.hoverBlock(id)
  },

  startEditing: (blockId) => {
    set({ editingBlockId: blockId, selectedBlockId: blockId, selectedSectionId: null })
    coreStore.selectBlock(blockId, { source: 'click', keepSection: false })
  },

  stopEditing: () => {
    set({ editingBlockId: null })
  },

  clearSelection: () => {
    set({ selectedBlockId: null, selectedSectionId: null, hoveredBlockId: null, editingBlockId: null })
    coreStore.clearSelection('click')
    fireEvent('block-selected', { blockId: null })
  },
}))

// ─────────────────────────────────────────────────────────────────────────────
// Core store → Zustand sync
// (AI / automation / keyboard shortcuts write to coreStore; reflect here)
// ─────────────────────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  coreStore.subscribe((state) => {
    const z = useSelectionStore.getState()
    const blockChanged   = state.selectedBlockId   !== z.selectedBlockId
    const sectionChanged = state.selectedSectionId !== z.selectedSectionId
    const hoverChanged   = state.hoveredBlockId    !== z.hoveredBlockId

    if (blockChanged || sectionChanged || hoverChanged) {
      useSelectionStore.setState({
        selectedBlockId:   state.selectedBlockId,
        selectedSectionId: state.selectedSectionId,
        hoveredBlockId:    state.hoveredBlockId,
        // editingBlockId is UI-only — never driven by coreStore
      })
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience selectors (use in components to minimise re-renders)
// ─────────────────────────────────────────────────────────────────────────────

export const selectBlock       = () => useSelectionStore.getState().selectedBlockId
export const selectSection     = () => useSelectionStore.getState().selectedSectionId
export const selectHovered     = () => useSelectionStore.getState().hoveredBlockId
export const selectEditingBlock = () => useSelectionStore.getState().editingBlockId

/** True when any block or section is selected. */
export const hasSelection = (): boolean => {
  const s = useSelectionStore.getState()
  return s.selectedBlockId !== null || s.selectedSectionId !== null
}
