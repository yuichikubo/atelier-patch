/**
 * ATELIER CMS — Suggestion Engine Types
 *
 * PatchProposals are read-only suggestions.
 * They NEVER mutate the document.
 * Applying a proposal is an explicit user/AI action that calls engine.enqueuePatch().
 */

import type { Patch }      from '@/core/patch/types'
import type { BlockType }  from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Severity and category
// ─────────────────────────────────────────────────────────────────────────────

export type SuggestionSeverity =
  | 'critical'   // broken or empty content that will confuse visitors
  | 'warning'    // missing recommended content
  | 'info'       // improvement opportunity

export type SuggestionCategory =
  | 'structure'  // page layout and section composition
  | 'content'    // block content quality (empty text, missing alt)
  | 'seo'        // meta tags, headings, page title
  | 'conversion' // CTAs, calls to action, engagement
  | 'media'      // images, galleries

// ─────────────────────────────────────────────────────────────────────────────
// Patch proposal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A PatchProposal describes a potential document improvement.
 * It carries the exact Patch (or Patch[]) needed to apply it.
 *
 * IMPORTANT: PatchProposals do NOT modify the document.
 * The Patch inside is inert data until a caller passes it to engine.enqueuePatch().
 */
export interface PatchProposal {
  /** Unique, stable identifier for this proposal (used for dedup and tracking). */
  id:          string

  /** One-line human-readable description of the improvement. */
  description: string

  /** Why this suggestion is being made — longer explanation for the UI. */
  rationale:   string

  /** The patch (or patches) that would implement this suggestion. */
  patch:       Patch | Patch[]

  /** How important this suggestion is. */
  severity:    SuggestionSeverity

  /** What aspect of the page this suggestion addresses. */
  category:    SuggestionCategory

  /** Block or section this suggestion targets, for UI highlighting. */
  targetId?:   string

  /** Block type being added or modified, for UI preview. */
  blockType?:  BlockType
}

// ─────────────────────────────────────────────────────────────────────────────
// Document analysis result
// ─────────────────────────────────────────────────────────────────────────────

/** Structured summary of the document state produced by DocumentAnalyzer. */
export interface DocumentAnalysis {
  // ── Page metadata ──────────────────────────────────────────────────────────
  hasTitle:           boolean
  hasSlug:            boolean
  hasSeoTitle:        boolean
  hasSeoDescription:  boolean
  pageStatus:         string

  // ── Section inventory ──────────────────────────────────────────────────────
  sectionCount:       number
  blockCount:         number
  isEmpty:            boolean  // no sections at all

  // ── Block type presence ────────────────────────────────────────────────────
  hasHero:        boolean
  hasCTA:         boolean
  hasText:        boolean
  hasImage:       boolean
  hasGallery:     boolean
  hasFAQ:         boolean
  hasFeatureList: boolean

  // ── Content quality ────────────────────────────────────────────────────────
  emptyTextBlocks:   string[]   // block ids with empty text
  emptyHeroTitles:   string[]   // block ids with empty hero title
  emptyImageAlts:    string[]   // block ids with empty alt text
  emptyGalleries:    string[]   // block ids with no images
  emptyCTAButtons:   string[]   // block ids with empty primaryText
  lastSectionId:     string | null

  // ── Extra quality checks ──────────────────────────────────────────────────
  /** True when page.title exists but is shorter than 20 characters. */
  titleTooShort:     boolean
  /** True when any text or CTA block contains an internal link (href starts with /). */
  hasInternalLinks:  boolean
  /** True when page has hero in first section. */
  heroIsFirst:       boolean
}
