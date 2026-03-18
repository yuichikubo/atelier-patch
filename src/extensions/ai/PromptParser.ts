/**
 * ATELIER CMS — Prompt Parser
 *
 * Converts a user prompt and the current document state into a structured
 * context package that the AI model will use to generate patches.
 *
 * CONTEXT WINDOW MANAGEMENT
 * ─────────────────────────
 * Rather than sending the full document (which would exceed token limits for
 * large pages), the parser builds a focused context containing:
 *
 *   1. Page metadata          — title, slug, status, SEO
 *   2. Focused section        — the section containing the selected block (if any)
 *   3. Focused block          — the currently selected block (if any)
 *   4. Nearby blocks          — siblings of the focused block for context
 *   5. First N sections       — structural overview, capped at MAX_CONTEXT_SECTIONS
 *   6. Document summary       — aggregate stats (total sections, block types)
 *
 * This keeps the prompt size bounded regardless of document length while
 * preserving the context the AI needs to produce accurate patches.
 *
 * Pure module — no side effects, no document mutation.
 */

import type { Page, Section, Block } from '@/core/document/types'
import type { DocumentAnalysis }      from '@/extensions/suggestion/SuggestionTypes'
import { analyzeDocument }            from '@/extensions/suggestion/DocumentAnalyzer'
import { analyzeDocument as analyzeStrategy } from '@/analysis/ABCDEAnalyzer'
import type { ABCDEResult }           from '@/analysis/AnalysisTypes'
import { BLOCK_DEFAULTS }             from '@/editor/blocks/blockTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Context window limits
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of sections to include in the structural overview. */
const MAX_CONTEXT_SECTIONS = 5

/** Maximum number of sibling blocks to include around the focused block. */
const MAX_NEARBY_BLOCKS = 3

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedPrompt {
  userPrompt:      string
  documentContext: DocumentContext
  systemPrompt:    string
  userMessage:     string
}

export interface DocumentContext {
  // Page-level metadata
  pageTitle:    string
  pageSlug:     string
  pageStatus:   string
  sectionCount: number
  blockCount:   number
  isEmpty:      boolean
  blockTypes:   string[]
  lastSectionId: string | null
  analysis:     DocumentAnalysis
  /** ABCDE strategic energy analysis — read-only, never mutates document */
  strategyAnalysis: ABCDEResult

  // Focused context (populated when a block/section is selected)
  focusedSection: FocusedSection | null
  focusedBlock:   FocusedBlock   | null

  // Structural overview: first N sections
  firstSections:  SectionSummary[]

  /** True when the document was truncated for context-window safety. */
  isTruncated: boolean
}

export interface FocusedSection {
  id:         string
  type:       string
  blockCount: number
  blocks:     BlockSummary[]
}

export interface FocusedBlock {
  id:      string
  type:    string
  content: Record<string, unknown>
}

export interface SectionSummary {
  id:         string
  type:       string
  order:      number
  blockCount: number
  /** First MAX_NEARBY_BLOCKS blocks for overview. */
  blocks:     BlockSummary[]
}

export interface BlockSummary {
  id:   string
  type: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema — injected into the system prompt
// ─────────────────────────────────────────────────────────────────────────────

const PATCH_SCHEMA = `
## Patch Schema

Every patch must be one of these exact shapes:

ADD SECTION:
{ "op": "add", "target": "section", "data": { "type": "<sectionType>" }, "position": { "placement": "end" }, "meta": { "source": "ai" } }

ADD BLOCK:
{ "op": "add", "target": "block", "data": { "type": "<blockType>", "parentSectionId": "<sectionId>", "content": <contentObject> }, "position": { "placement": "end" }, "meta": { "source": "ai" } }

UPDATE BLOCK:
{ "op": "update", "target": "block", "id": "<blockId>", "data": { "content": <partialContent> }, "meta": { "source": "ai" } }

UPDATE PAGE:
{ "op": "update", "target": "page", "data": { "title": "...", "seo": { "title": "...", "description": "..." } }, "meta": { "source": "ai" } }

REMOVE BLOCK:
{ "op": "remove", "target": "block", "id": "<blockId>", "meta": { "source": "ai" } }

## Section types
hero, content, features, gallery, faq, cta, blank

## Block types and their content shapes
${Object.entries(BLOCK_DEFAULTS).map(([type, content]) =>
  `${type}: ${JSON.stringify(content)}`
).join('\n')}
`.trim()

const SYSTEM_PROMPT = `You are the ATELIER CMS AI Patch Generator.

Your ONLY job is to translate user instructions into a JSON array of patch operations.

Rules:
1. Respond with ONLY a valid JSON array of patch objects. No prose, no markdown, no explanation.
2. Every patch must conform exactly to the Patch Schema below.
3. When adding blocks, always provide realistic example content, not placeholders.
4. When adding a block to an existing section, use the lastSectionId from the document context.
5. If the page is empty, add a section first, then add blocks inside it.
6. Only generate patches that address the user's request. Do not generate extras.
7. Maximum 20 patches per response.
8. When a focused block is provided, prefer updating it over creating new blocks unless instructed otherwise.

${PATCH_SCHEMA}

Respond with a JSON array only. Example:
[
  { "op": "add", "target": "section", "data": { "type": "hero" }, "position": { "placement": "end" }, "meta": { "source": "ai" } },
  { "op": "add", "target": "block", "data": { "type": "hero", "parentSectionId": "__FIRST_NEW_SECTION__", "content": { "title": "Welcome", "subtitle": "Your subtitle", "buttonText": "Get Started", "buttonUrl": "#" } }, "position": { "placement": "end" }, "meta": { "source": "ai" } }
]`

// ─────────────────────────────────────────────────────────────────────────────
// Context builders
// ─────────────────────────────────────────────────────────────────────────────

function toBlockSummary(block: Block): BlockSummary {
  return { id: block.id, type: block.type }
}

function toSectionSummary(section: Section): SectionSummary {
  const sorted = [...section.blocks].sort((a, b) => a.order - b.order)
  return {
    id:         section.id,
    type:       section.type,
    order:      section.order,
    blockCount: section.blocks.length,
    blocks:     sorted.slice(0, MAX_NEARBY_BLOCKS).map(toBlockSummary),
  }
}

/**
 * Resolve the focused section and block from an optional selectedBlockId.
 * Falls back to the last section when no block is selected.
 */
function resolveFocus(
  page:            Page,
  selectedBlockId: string | null,
  sortedSections:  Section[],
): { focusedSection: FocusedSection | null; focusedBlock: FocusedBlock | null } {
  if (!sortedSections.length) return { focusedSection: null, focusedBlock: null }

  let targetSection: Section | undefined
  let targetBlock:   Block   | undefined

  if (selectedBlockId) {
    // Find the section containing the selected block
    for (const s of sortedSections) {
      const b = s.blocks.find(b => b.id === selectedBlockId)
      if (b) { targetSection = s; targetBlock = b; break }
    }
  }

  // Fall back to the last section if no block is selected
  if (!targetSection) {
    targetSection = sortedSections[sortedSections.length - 1]
  }

  const sectionBlocks = [...targetSection.blocks].sort((a, b) => a.order - b.order)

  // Build nearby blocks: up to MAX_NEARBY_BLOCKS around the focused block
  let nearbyBlocks: Block[]
  if (targetBlock) {
    const idx = sectionBlocks.indexOf(targetBlock)
    const start = Math.max(0, idx - Math.floor(MAX_NEARBY_BLOCKS / 2))
    const end   = Math.min(sectionBlocks.length, start + MAX_NEARBY_BLOCKS + 1)
    nearbyBlocks = sectionBlocks.slice(start, end)
  } else {
    nearbyBlocks = sectionBlocks.slice(0, MAX_NEARBY_BLOCKS)
  }

  return {
    focusedSection: {
      id:         targetSection.id,
      type:       targetSection.type,
      blockCount: targetSection.blocks.length,
      blocks:     nearbyBlocks.map(toBlockSummary),
    },
    focusedBlock: targetBlock
      ? {
          id:      targetBlock.id,
          type:    targetBlock.type,
          content: targetBlock.content as Record<string, unknown>,
        }
      : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt text builder
// ─────────────────────────────────────────────────────────────────────────────

function buildContextText(ctx: DocumentContext): string {
  const lines: string[] = []

  // ── Page metadata ─────────────────────────────────────────────────────────
  lines.push('## Page')
  lines.push(`- Title: "${ctx.pageTitle || '(untitled)'}"`)
  lines.push(`- Slug: /${ctx.pageSlug || ''}`)
  lines.push(`- Status: ${ctx.pageStatus}`)
  lines.push(`- Sections: ${ctx.sectionCount}${ctx.isTruncated ? ` (showing first ${MAX_CONTEXT_SECTIONS})` : ''}`)
  lines.push(`- Total blocks: ${ctx.blockCount}`)
  lines.push(`- Block types: ${ctx.blockTypes.length ? ctx.blockTypes.join(', ') : 'none'}`)
  lines.push(`- Default insert section: ${ctx.lastSectionId ?? 'none — page is empty'}`)
  lines.push(`- Has hero: ${ctx.analysis.hasHero} | Has CTA: ${ctx.analysis.hasCTA}`)
  lines.push('')

  // ── Strategic energy analysis ──────────────────────────────────────────────
  const s = ctx.strategyAnalysis
  const scoreLabel = (v: number) => v < 0.10 ? 'low' : v < 0.30 ? 'medium' : 'strong'
  lines.push('## Page Strategy Analysis')
  lines.push(`- Action energy (conversion intent, CTAs): ${scoreLabel(s.C1)} (${Math.round(s.C1 * 100)}%)`)
  lines.push(`- Trust energy (social proof, community): ${scoreLabel(s.C2)} (${Math.round(s.C2 * 100)}%)`)
  lines.push(`- Purpose energy (mission, narrative, story): ${scoreLabel(s.C3)} (${Math.round(s.C3 * 100)}%)`)
  lines.push(`- Information energy (facts, features, specs): ${scoreLabel(s.C4)} (${Math.round(s.C4 * 100)}%)`)
  lines.push(`- Emotional energy (imagery, aspiration): ${scoreLabel(s.C5)} (${Math.round(s.C5 * 100)}%)`)
  if (s.dominant) lines.push(`- Dominant dimension: ${s.dominant}`)
  if (!s.isBalanced && s.dominant) {
    const gaps = (['C1','C2','C3','C4','C5'] as const)
      .filter(k => s[k] < 0.10)
      .map(k => ({ C1:'Action', C2:'Trust', C3:'Purpose', C4:'Information', C5:'Emotion' }[k]))
    if (gaps.length) lines.push(`- Strategy gaps (low energy): ${gaps.join(', ')} — consider addressing these`)
  }
  lines.push('')

  // ── Focused block ─────────────────────────────────────────────────────────
  if (ctx.focusedBlock) {
    lines.push('## Selected Block (user is focused here)')
    lines.push(`- ID: ${ctx.focusedBlock.id}`)
    lines.push(`- Type: ${ctx.focusedBlock.type}`)
    lines.push(`- Content: ${JSON.stringify(ctx.focusedBlock.content)}`)
    lines.push('')
  }

  // ── Focused section ───────────────────────────────────────────────────────
  if (ctx.focusedSection) {
    lines.push('## Focused Section')
    lines.push(`- ID: ${ctx.focusedSection.id} (type: ${ctx.focusedSection.type})`)
    lines.push(`- Total blocks in section: ${ctx.focusedSection.blockCount}`)
    lines.push(`- Blocks: ${ctx.focusedSection.blocks.map(b => `${b.type}[${b.id}]`).join(', ') || 'empty'}`)
    lines.push('')
  }

  // ── First N sections ──────────────────────────────────────────────────────
  if (ctx.isEmpty) {
    lines.push('## Structure')
    lines.push('(page is empty — create sections before adding blocks)')
  } else {
    lines.push('## Section Overview')
    for (const s of ctx.firstSections) {
      const blockList = s.blocks.map(b => `${b.type}[${b.id}]`).join(', ')
      const extra = s.blockCount > s.blocks.length ? ` +${s.blockCount - s.blocks.length} more` : ''
      lines.push(`  Section "${s.id}" (${s.type}): ${blockList || 'empty'}${extra}`)
    }
    if (ctx.isTruncated) {
      lines.push(`  … ${ctx.sectionCount - MAX_CONTEXT_SECTIONS} more sections not shown`)
    }
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsePromptOptions {
  /**
   * The currently selected block id — used to focus the AI context on the
   * relevant part of the document. Optional; falls back to last section.
   */
  selectedBlockId?: string | null
}

/**
 * Build the AI prompt context for a user request.
 * Trims the document to a bounded, focused context to stay within token limits.
 */
export function parsePrompt(
  userPrompt:  string,
  page:        Page,
  options:     ParsePromptOptions = {},
): ParsedPrompt {
  const prompt          = userPrompt.trim()
  const { selectedBlockId = null } = options

  const analysis          = analyzeDocument(page)
  const strategyAnalysis  = analyzeStrategy(page)
  const sortedSections  = [...page.sections].sort((a, b) => a.order - b.order)
  const isTruncated     = sortedSections.length > MAX_CONTEXT_SECTIONS

  // Unique block types across whole document
  const blockTypes = sortedSections
    .flatMap(s => s.blocks)
    .map(b => b.type)
    .filter((t, i, a) => a.indexOf(t) === i)

  // Focused context
  const { focusedSection, focusedBlock } = resolveFocus(page, selectedBlockId, sortedSections)

  // First N sections for structural overview
  const firstSections = sortedSections
    .slice(0, MAX_CONTEXT_SECTIONS)
    .map(toSectionSummary)

  const documentContext: DocumentContext = {
    pageTitle:     page.title,
    pageSlug:      page.slug,
    pageStatus:    page.status,
    sectionCount:  analysis.sectionCount,
    blockCount:    analysis.blockCount,
    isEmpty:       analysis.isEmpty,
    blockTypes,
    lastSectionId: analysis.lastSectionId,
    analysis,
    strategyAnalysis,
    focusedSection,
    focusedBlock,
    firstSections,
    isTruncated,
  }

  const contextBlock = buildContextText(documentContext)
  const userMessage  = `${contextBlock}\n\n## User request\n${prompt}`

  return {
    userPrompt:      prompt,
    documentContext,
    systemPrompt:    SYSTEM_PROMPT,
    userMessage,
  }
}
