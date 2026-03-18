/**
 * ATELIER CMS — Strategy Highlighter
 *
 * Maps ABCDE strategy dimensions to the block types that contribute to them.
 * Used by StrategyPanel to highlight contributing blocks when hovering a metric.
 *
 * READ-ONLY — never calls engine.enqueuePatch() or mutates document state.
 */

import type { ABCDEKey } from './AnalysisTypes'
import type { Page }     from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Dimension → block type mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block types that are the primary contributor to each dimension.
 * Mirrors the BLOCK_WEIGHTS in ABCDEAnalyzer.
 */
const DIM_BLOCK_TYPES: Record<ABCDEKey, string[]> = {
  C1: ['cta', 'hero'],             // Action — conversion, urgency
  C2: ['gallery'],                 // Trust — social proof, community
  C3: ['text', 'hero'],            // Purpose — story, mission, philosophy
  C4: ['faq', 'feature-list'],     // Information — facts, features
  C5: ['image', 'gallery', 'hero'],// Emotion — imagery, aspiration
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all block IDs in the page that contribute primarily to the given dimension.
 *
 * @param page  A Page snapshot — never mutated.
 * @param dim   The dimension to highlight.
 * @returns     Set of block IDs to highlight.
 */
export function getBlockIdsForDimension(page: Page, dim: ABCDEKey): Set<string> {
  const types = new Set(DIM_BLOCK_TYPES[dim] ?? [])
  const ids   = new Set<string>()
  for (const section of page.sections) {
    for (const block of section.blocks) {
      if (types.has(block.type)) ids.add(block.id)
    }
  }
  return ids
}

/**
 * Return the block types associated with a dimension.
 * Used to describe what will be highlighted in the UI.
 */
export function getBlockTypesForDimension(dim: ABCDEKey): string[] {
  return DIM_BLOCK_TYPES[dim] ?? []
}

/**
 * Human-readable description of what will be highlighted.
 * Example: "CTA and Hero blocks"
 */
export function highlightDescription(dim: ABCDEKey): string {
  const types = DIM_BLOCK_TYPES[dim] ?? []
  if (!types.length) return 'no blocks'
  if (types.length === 1) return `${types[0]} blocks`
  const last  = types[types.length - 1]
  const rest  = types.slice(0, -1)
  return `${rest.join(', ')} and ${last} blocks`
}
