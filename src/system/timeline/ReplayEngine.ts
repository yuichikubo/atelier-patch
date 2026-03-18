/**
 * ATELIER CMS — Replay Engine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The ReplayEngine reconstructs a document at any point in the timeline by
 * replaying patch records from the beginning (or a known checkpoint) up to
 * a target record.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Replay applies patches through PatchEngine — never directly to documents.
 * • The main engine singleton is NOT used for replay (it would overwrite the
 *   live document). Replay creates an isolated PatchEngine instance.
 * • This module only reads the timeline — it never writes to it.
 *
 * USE CASES
 * ─────────
 * • "What did the page look like 10 edits ago?" → replay up to that record
 * • "Preview what the AI changed" → replay just the AI records
 * • "Restore to this point" → replay up to here, then load into live engine
 * • Phase 2: document analysis for Suggestion Engine
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PatchEngine }       from '@/core/patch/engine'
import { PatchHistoryStore } from '@/core/patch/history'
import { PatchEventBus }     from '@/core/patch/events'
import type { Page }         from '@/core/document/types'
import type { Patch }        from '@/core/patch/types'
import type { PatchRecord }  from './PatchRecord'
import type { TimelineActor } from './PatchRecord'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReplayOptions {
  /**
   * Only replay records from this actor type.
   * Omit to replay all actors.
   */
  filterActor?: TimelineActor

  /**
   * Only replay records in this branch. Default: 'main'.
   */
  branchId?: string

  /**
   * A checkpoint document to start replay from instead of an empty document.
   * Use when you have a known good state at a prior version.
   */
  checkpoint?: Page
}

export interface ReplayResult {
  /** The reconstructed document after applying all patches up to `targetRecord`. */
  document:    Page
  /** Number of records replayed. */
  recordCount: number
  /** Number of individual patches applied. */
  patchCount:  number
  /** Whether all patches applied without errors. */
  ok:          boolean
  /** Errors encountered during replay (patches that failed are skipped). */
  errors:      string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty document factory
// ─────────────────────────────────────────────────────────────────────────────

function emptyDocument(base?: Partial<Page>): Page {
  const now = new Date().toISOString()
  return {
    id:          base?.id          ?? 'replay_doc',
    title:       base?.title       ?? '',
    slug:        base?.slug        ?? '',
    status:      base?.status      ?? 'draft',
    workspaceId: base?.workspaceId ?? 'replay',
    themeId:     base?.themeId,
    version:     0,
    seo:         base?.seo         ?? {},
    sections:    [],
    createdAt:   base?.createdAt   ?? now,
    updatedAt:   base?.updatedAt   ?? now,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ReplayEngine
// ─────────────────────────────────────────────────────────────────────────────

class ReplayEngine {

  /**
   * Replay all records up to and including `targetRecord`.
   * Returns the reconstructed document state at that point.
   *
   * @param records       Ordered list of timeline records (from timelineEngine.getAll())
   * @param targetRecord  The record to stop at (inclusive). Pass the last record for latest state.
   * @param options       Filtering and checkpoint options.
   *
   * @example
   *   const all    = timelineEngine.getAll()
   *   const target = all[all.length - 5]  // 5 records before latest
   *   const result = replayEngine.replayTo(all, target)
   *   console.log(result.document.sections.length)
   */
  replayTo(
    records:      readonly PatchRecord[],
    targetRecord: PatchRecord,
    options:      ReplayOptions = {},
  ): ReplayResult {
    const { filterActor, branchId = 'main', checkpoint } = options

    // Build an isolated engine for replay — never touches the live document
    const replayDoc = emptyDocument(checkpoint)
    const bus       = new PatchEventBus()
    const hist      = new PatchHistoryStore()
    const eng       = new PatchEngine(replayDoc, hist, bus)

    if (checkpoint) {
      eng.loadDocument(checkpoint)
    }

    const errors:     string[] = []
    let   recordCount = 0
    let   patchCount  = 0
    let   reached     = false

    for (const record of records) {
      // Stop after processing the target record
      if (reached) break

      if (record.branchId !== branchId) continue
      if (filterActor && record.actor.type !== filterActor) continue

      for (const patch of record.patches) {
        const result = eng.enqueuePatch(patch as Patch)
        patchCount++
        if (!result.ok) {
          errors.push(`Record ${record.id} patch ${result.patchId}: ${result.error?.message ?? 'unknown'}`)
        }
      }

      recordCount++

      if (record.id === targetRecord.id) {
        reached = true
      }
    }

    return {
      document:    eng.getDocument(),
      recordCount,
      patchCount,
      ok:          errors.length === 0,
      errors,
    }
  }

  /**
   * Replay all records in the timeline, returning the latest reconstructed state.
   * Equivalent to replaying to the last record.
   *
   * @example
   *   const result = replayEngine.replayAll(timelineEngine.getAll())
   */
  replayAll(
    records:  readonly PatchRecord[],
    options?: ReplayOptions,
  ): ReplayResult {
    if (records.length === 0) {
      return { document: emptyDocument(), recordCount: 0, patchCount: 0, ok: true, errors: [] }
    }
    const target = [...records].reverse().find(
      r => !options?.branchId || r.branchId === (options.branchId ?? 'main'),
    )
    if (!target) {
      return { document: emptyDocument(), recordCount: 0, patchCount: 0, ok: true, errors: [] }
    }
    return this.replayTo(records, target, options)
  }

  /**
   * Replay only records from a specific actor type.
   * Useful for previewing what an AI or automation system changed.
   *
   * @example
   *   const aiChanges = replayEngine.replayActor(timeline, 'ai')
   */
  replayActor(
    records: readonly PatchRecord[],
    actor:   TimelineActor,
  ): ReplayResult {
    return this.replayAll(records, { filterActor: actor })
  }

  /**
   * Extract just the patches from a slice of the timeline.
   * Useful for the AI Patch Generator to analyse recent edit history.
   *
   * @example
   *   const recent = replayEngine.extractPatches(timeline, { since: 10 })
   */
  extractPatches(
    records: readonly PatchRecord[],
    options?: {
      /** Only include records at or after this version. */
      since?:       number
      filterActor?: TimelineActor
      branchId?:    string
    },
  ): Patch[] {
    return records
      .filter(r => {
        if (options?.branchId && r.branchId !== options.branchId) return false
        if (options?.filterActor && r.actor.type !== options.filterActor) return false
        if (options?.since && r.version < options.since) return false
        return true
      })
      .flatMap(r => r.patches as Patch[])
  }

  /**
   * Check whether a set of patches can be cleanly applied to a document.
   * Used by the AI Patch Generator to validate generated patches before
   * sending them to the live engine.
   *
   * @returns true if all patches apply without error, false otherwise.
   */
  validatePatches(baseDocument: Page, patches: Patch[]): { ok: boolean; errors: string[] } {
    const bus  = new PatchEventBus()
    const hist = new PatchHistoryStore()
    const eng  = new PatchEngine(JSON.parse(JSON.stringify(baseDocument)), hist, bus)

    const errors: string[] = []
    for (const patch of patches) {
      const result = eng.enqueuePatch(patch)
      if (!result.ok) {
        errors.push(`${patch.op}:${(patch as any).target ?? ''} — ${result.error?.message ?? 'failed'}`)
      }
    }
    return { ok: errors.length === 0, errors }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const replayEngine = new ReplayEngine()
