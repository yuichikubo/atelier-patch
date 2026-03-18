/**
 * ATELIER CMS — Suggestion Engine
 *
 * Analyzes a document and produces PatchProposals.
 *
 * INVARIANT: this engine NEVER mutates the document.
 *
 * Flow:
 *   engine.getDocument()
 *     → DocumentAnalyzer.analyzeDocument(page)
 *       → ALL_RULES.flatMap(rule => rule(analysis, page))
 *         → PatchProposal[]   ← read-only suggestions
 *
 * Applying a suggestion:
 *   suggestionEngine.applyProposal(proposal)
 *     → engine.enqueuePatch(proposal.patch)   ← patch goes through PatchEngine as always
 */

import { engine }          from '@/core/document/engineInstance'
import { patchEventBus }   from '@/core/patch/eventBus'
import type { Page }       from '@/core/document/types'
import type { Patch }      from '@/core/patch/types'
import { analyzeDocument } from './DocumentAnalyzer'
import { ALL_RULES, type SuggestionRule } from './SuggestionRules'
import type { PatchProposal, DocumentAnalysis, SuggestionSeverity, SuggestionCategory } from './SuggestionTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface SuggestionEngineOptions {
  /** Only return suggestions at or above this severity. Default: 'info' (all). */
  minSeverity?: SuggestionSeverity
  /** Only return suggestions in these categories. Default: all. */
  categories?:  SuggestionCategory[]
  /** Maximum number of proposals to return. Default: unlimited. */
  limit?:       number
  /** Additional custom rules beyond the built-in set. */
  extraRules?:  SuggestionRule[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Apply result
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyResult {
  ok:           boolean
  proposalId:   string
  /** Number of patches actually sent to the engine. */
  applied:      number
  error?:       string
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity ordering
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<SuggestionSeverity, number> = {
  critical: 3,
  warning:  2,
  info:     1,
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionEngine
// ─────────────────────────────────────────────────────────────────────────────

class SuggestionEngine {
  private customRules: SuggestionRule[] = []

  /** Register an additional rule at runtime (used by plugins). */
  addRule(rule: SuggestionRule): void {
    this.customRules.push(rule)
  }

  /**
   * Analyze the current document and return patch proposals.
   * Does NOT modify the document.
   */
  analyze(options: SuggestionEngineOptions = {}): PatchProposal[] {
    const {
      minSeverity = 'info',
      categories,
      limit,
      extraRules = [],
    } = options

    const page = engine.getDocument() as Page
    const analysis = analyzeDocument(page)

    const allRules = [...ALL_RULES, ...this.customRules, ...extraRules]

    let proposals = allRules.flatMap(rule => {
      try {
        return rule(analysis, page)
      } catch (e) {
        console.warn('[SuggestionEngine] Rule threw:', e)
        return []
      }
    })

    // Deduplicate by id (rules can only produce each id once by design,
    // but plugins could overlap)
    const seen = new Set<string>()
    proposals = proposals.filter(p => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    // Filter by severity
    const minRank = SEVERITY_RANK[minSeverity]
    proposals = proposals.filter(p => SEVERITY_RANK[p.severity] >= minRank)

    // Filter by category
    if (categories?.length) {
      proposals = proposals.filter(p => categories.includes(p.category))
    }

    // Sort: critical first, then warning, then info
    proposals.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])

    // Limit
    if (limit && limit > 0) {
      proposals = proposals.slice(0, limit)
    }

    return proposals
  }

  /**
   * Apply a single proposal by sending its patch(es) to engine.enqueuePatch().
   * This is the ONLY way proposals should reach the document.
   *
   * All mutations go through PatchEngine — the invariant is never broken.
   */
  applyProposal(proposal: PatchProposal): ApplyResult {
    const patches: Patch[] = Array.isArray(proposal.patch)
      ? proposal.patch as Patch[]
      : [proposal.patch as Patch]

    let applied = 0

    try {
      for (const patch of patches) {
        const result = engine.enqueuePatch(patch)
        if (!result.ok) {
          return {
            ok:          false,
            proposalId:  proposal.id,
            applied,
            error:       result.error?.message ?? 'Patch failed',
          }
        }
        applied++
      }

      // Broadcast that a suggestion was applied
      patchEventBus.emit({
        type:    'patch-applied',
        payload: {
          patchId:  `suggestion/${proposal.id}`,
          op:       'suggestion',
          target:   'document',
          version:  engine.getVersion(),
        },
        context: { source: 'ai' },
      })

      return { ok: true, proposalId: proposal.id, applied }
    } catch (e: unknown) {
      return {
        ok:         false,
        proposalId: proposal.id,
        applied,
        error:      e instanceof Error ? e.message : String(e),
      }
    }
  }

  /**
   * Apply all proposals in the given array atomically via engine.applyPatchArray().
   * All patches succeed together or the array is discarded.
   */
  applyAll(proposals: PatchProposal[]): ApplyResult {
    const patches = proposals.flatMap(p =>
      Array.isArray(p.patch) ? p.patch as Patch[] : [p.patch as Patch]
    )

    if (patches.length === 0) {
      return { ok: true, proposalId: 'batch', applied: 0 }
    }

    const result = engine.applyPatchArray({ patch: patches, meta: { source: 'ai' } })
    return {
      ok:          result.ok,
      proposalId:  'batch',
      applied:     result.applied,
      error:       result.errors[0]?.message,
    }
  }

  /**
   * Get a fresh analysis without generating proposals.
   * Useful for reading document stats in the UI.
   */
  getAnalysis(): DocumentAnalysis {
    return analyzeDocument(engine.getDocument() as Page)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────────────────────────────────────

export const suggestionEngine = new SuggestionEngine()
