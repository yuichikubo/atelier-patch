/**
 * ATELIER CMS — ABCDE Analyzer
 *
 * Observes a Page document and produces normalized energy scores.
 * Pure function — no side effects, no patches, no engine calls.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * This module is READ-ONLY.
 * It never calls engine.enqueuePatch() or mutates any document field.
 * Input: Page snapshot → Output: ABCDEResult
 *
 * DIMENSIONS
 * ──────────
 * C1 — Action energy     Drive, urgency, conversion intent
 * C2 — Relational energy Trust, community, social proof
 * C3 — Meaning structure Purpose, story, philosophy
 * C4 — Informational     Facts, features, specifics
 * C5 — Emotional         Imagery, feeling, aspiration
 *
 * SCORING
 * ───────
 * Each block type and content signal contributes to one or more dimensions.
 * Raw counts are normalized so the total across all dimensions sums to 1.
 * A balanced page scores ~0.2 across all five dimensions.
 */

import type { Page }                    from '@/core/document/types'
import type { ABCDEResult, ABCDESignals, ABCDEKey } from './AnalysisTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Block-type → dimension weights
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each block type carries a weight distribution across the five dimensions.
 * Weights do not need to sum to 1 — they are accumulated and then normalized.
 */
const BLOCK_WEIGHTS: Record<string, Partial<Record<ABCDEKey, number>>> = {
  // Action-heavy
  cta:          { C1: 1.0 },
  // Features explain what you do — informational + slight action
  'feature-list': { C4: 0.7, C1: 0.3 },
  // Hero anchors the page — action + emotion
  hero:          { C1: 0.4, C5: 0.4, C3: 0.2 },
  // FAQ is purely informational
  faq:           { C4: 1.0 },
  // Text varies — analysed further by content heuristics below
  text:          { C3: 0.5, C4: 0.3, C5: 0.2 },
  // Images and galleries are purely emotional/aspirational
  image:         { C5: 1.0 },
  gallery:       { C5: 0.8, C2: 0.2 },
}

// ─────────────────────────────────────────────────────────────────────────────
// Content keyword → dimension boost
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keywords found in block content that adjust dimension scores.
 * Applied to all text fields (title, subtitle, text, description, question, answer).
 */
const CONTENT_SIGNALS: Array<{ keywords: RegExp; dim: ABCDEKey; weight: number }> = [
  // C1 — Action energy
  { keywords: /\b(start|buy|get|try|join|sign up|subscribe|free|now|today|limited)\b/i, dim: 'C1', weight: 0.15 },
  // C2 — Relational energy
  { keywords: /\b(community|team|together|trust|review|testimonial|clients|partner|story|our)\b/i, dim: 'C2', weight: 0.15 },
  // C3 — Meaning / purpose
  { keywords: /\b(mission|vision|why|purpose|belief|value|philosophy|transform|impact|change)\b/i, dim: 'C3', weight: 0.15 },
  // C4 — Informational
  { keywords: /\b(how|feature|include|detail|spec|pricing|plan|option|compare|learn)\b/i, dim: 'C4', weight: 0.10 },
  // C5 — Emotional
  { keywords: /\b(beautiful|amazing|love|dream|imagine|feel|inspire|discover|experience)\b/i, dim: 'C5', weight: 0.10 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractText(content: Record<string, unknown>): string {
  return Object.values(content)
    .filter(v => typeof v === 'string')
    .join(' ')
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyze a Page document and return normalized ABCDE energy scores.
 *
 * @param page  A Page snapshot — never mutated.
 * @returns     ABCDEResult with scores in [0, 1].
 */
export function analyzeDocument(page: Page): ABCDEResult {
  const raw: ABCDESignals = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0 }
  const blocksByDim: Record<ABCDEKey, string[]> = { C1: [], C2: [], C3: [], C4: [], C5: [] }

  for (const section of page.sections) {
    for (const block of section.blocks) {
      // ── Block-type weights ──────────────────────────────────────────────
      const weights = BLOCK_WEIGHTS[block.type]
      if (weights) {
        // Find the primary dimension (highest weight) for this block
        const entries = Object.entries(weights) as [ABCDEKey, number][]
        const primary = entries.reduce((a, b) => b[1] > a[1] ? b : a)[0]
        blocksByDim[primary].push(block.id)
        for (const [dim, w] of entries) {
          raw[dim] += w
        }
      }

      // ── Content keyword signals ─────────────────────────────────────────
      const text = extractText(block.content as Record<string, unknown>)
      if (text) {
        for (const signal of CONTENT_SIGNALS) {
          if (signal.keywords.test(text)) {
            raw[signal.dim] += signal.weight
            if (!blocksByDim[signal.dim].includes(block.id)) {
              blocksByDim[signal.dim].push(block.id)
            }
          }
        }
      }
    }
  }

  // ── Page-level signals ───────────────────────────────────────────────────
  // SEO description → informational
  if ((page.seo as any)?.description?.trim()) raw.C4 += 0.2
  // Page title with action word → action energy
  if (page.title && /\b(start|get|discover|try)\b/i.test(page.title)) raw.C1 += 0.2

  // ── Normalize ────────────────────────────────────────────────────────────
  const total = (raw.C1 + raw.C2 + raw.C3 + raw.C4 + raw.C5) || 1

  const C1 = clamp(raw.C1 / total)
  const C2 = clamp(raw.C2 / total)
  const C3 = clamp(raw.C3 / total)
  const C4 = clamp(raw.C4 / total)
  const C5 = clamp(raw.C5 / total)

  // ── Dominant dimension ───────────────────────────────────────────────────
  const scored: [ABCDEKey, number][] = [
    ['C1', C1], ['C2', C2], ['C3', C3], ['C4', C4], ['C5', C5],
  ]
  const [topDim, topScore] = scored.reduce((a, b) => b[1] > a[1] ? b : a)
  const dominant = topScore > 0.05 ? topDim : null
  const isBalanced = scored.every(([, v]) => v < 0.5)

  return { C1, C2, C3, C4, C5, signals: { ...raw }, dominant, isBalanced, blocksByDim }
}
