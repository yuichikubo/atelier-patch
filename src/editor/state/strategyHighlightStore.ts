'use client'
/**
 * ATELIER CMS — Strategy Highlight Store
 *
 * Holds a transient Set of block IDs to visually highlight when the user
 * hovers a strategy dimension in the Strategy panel.
 *
 * READ-ONLY from document perspective — never calls engine.enqueuePatch().
 * The set is populated by StrategyPanel and consumed by EditorCanvas.
 */

import { create } from 'zustand'

interface StrategyHighlightState {
  /** Block IDs currently highlighted due to strategy hover. Empty when not hovering. */
  highlightedIds: Set<string>
  setHighlight: (ids: Set<string>) => void
  clearHighlight: () => void
}

export const useStrategyHighlightStore = create<StrategyHighlightState>((set) => ({
  highlightedIds: new Set<string>(),
  setHighlight:   (ids) => set({ highlightedIds: ids }),
  clearHighlight: ()    => set({ highlightedIds: new Set<string>() }),
}))
