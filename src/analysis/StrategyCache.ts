/**
 * ATELIER CMS — Strategy Cache
 *
 * Computes and caches ABCDE analysis for timeline records.
 * All computation is read-only. Never calls engine.enqueuePatch().
 *
 * Strategy snapshots are computed lazily by replaying records through an
 * isolated PatchEngine instance, then running analyzeDocument() on the
 * resulting document. Results are cached by record ID to avoid
 * recomputing on every render.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Pure observer — never mutates live document
 * • Uses isolated ReplayEngine instances only
 * • Cache is keyed by record.id (stable) and invalidated when
 *   the timeline record set changes
 */

import { replayEngine }    from '@/system/timeline/ReplayEngine'
import { analyzeDocument } from './ABCDEAnalyzer'
import type { PatchRecord } from '@/system/timeline/PatchRecord'
import type { ABCDEResult, ABCDEKey } from './AnalysisTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Strategy snapshot — analysis state after a given record was applied
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategySnapshot {
  recordId:  string
  version:   number
  result:    ABCDEResult
}

export interface StrategyDelta {
  C1: number; C2: number; C3: number; C4: number; C5: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

class StrategyCacheClass {
  private cache = new Map<string, StrategySnapshot>()

  /**
   * Compute snapshots for all provided records (oldest-first order).
   * Uses an incremental approach: replay records one-by-one and cache.
   * Skips records that are already cached.
   *
   * Heavy operation — call from a Web Worker or `requestIdleCallback` in
   * production. For this prototype, called with a small batch size limit.
   *
   * @param records  Ordered records (oldest first) from timelineEngine.getAll()
   * @param limit    Max number of records to compute per call (default 30)
   */
  computeBatch(records: readonly PatchRecord[], limit = 30): StrategySnapshot[] {
    const snapshots: StrategySnapshot[] = []
    let computed = 0

    for (let i = 0; i < records.length; i++) {
      const record = records[i]

      if (this.cache.has(record.id)) {
        const cached = this.cache.get(record.id)!
        snapshots.push(cached)
        continue
      }

      if (computed >= limit) break

      // Replay up to this record on an isolated engine
      const slice  = records.slice(0, i + 1)
      const result = replayEngine.replayTo(slice as PatchRecord[], record)
      if (!result.ok) continue

      const analysis = analyzeDocument(result.document)
      const snapshot: StrategySnapshot = {
        recordId: record.id,
        version:  record.version,
        result:   analysis,
      }
      this.cache.set(record.id, snapshot)
      snapshots.push(snapshot)
      computed++
    }

    return snapshots
  }

  /**
   * Get the cached snapshot for a specific record, if available.
   */
  get(recordId: string): StrategySnapshot | undefined {
    return this.cache.get(recordId)
  }

  /**
   * Compute delta between two consecutive snapshots.
   * Returns null if either snapshot is missing.
   */
  delta(current: StrategySnapshot, previous: StrategySnapshot | undefined): StrategyDelta | null {
    if (!previous) return null
    const keys: ABCDEKey[] = ['C1', 'C2', 'C3', 'C4', 'C5']
    return Object.fromEntries(
      keys.map(k => [k, current.result[k] - previous.result[k]])
    ) as unknown as StrategyDelta
  }

  /** Clear the entire cache (e.g. after a restore operation). */
  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

export const strategyCache = new StrategyCacheClass()
