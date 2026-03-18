'use client'
/**
 * ATELIER CMS — Suggestion Highlight Store
 *
 * Holds a transient Set of block IDs to visually highlight when the user
 * hovers a suggestion card in the Suggestion panel.
 *
 * READ-ONLY from document perspective — never calls engine.enqueuePatch().
 * Populated by SuggestionPanel. Consumed by EditorCanvas (live path).
 *
 * Follows the same pattern as useStrategyHighlightStore.
 */

import { create } from 'zustand'

interface SuggestionHighlightState {
  /** Block IDs currently highlighted due to suggestion hover. Empty when not hovering. */
  highlightedIds: Set<string>
  setHighlight:   (ids: Set<string>) => void
  clearHighlight: () => void
}

export const useSuggestionHighlightStore = create<SuggestionHighlightState>((set) => ({
  highlightedIds: new Set<string>(),
  setHighlight:   (ids) => set({ highlightedIds: ids }),
  clearHighlight: ()    => set({ highlightedIds: new Set<string>() }),
}))
