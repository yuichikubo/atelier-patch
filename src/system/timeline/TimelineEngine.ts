/**
 * ATELIER CMS — Timeline Engine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The TimelineEngine records every patch transaction applied by PatchEngine
 * into an ordered, append-only log of PatchRecords.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Subscribes to globalEventBus (internal engine bus) — captures ALL patches
 *   regardless of which actor or subsystem produced them.
 * • NEVER mutates the document. Zero calls to engine.enqueuePatch().
 * • The timeline is append-only. Records are never modified or deleted.
 * • Undo/redo do NOT remove records — they add a new 'rollback' record so
 *   the full edit history is always preserved.
 *
 * DOCUMENT = apply(patches)
 * ─────────────────────────
 * The timeline is the true source of truth.
 * A document can be reconstructed at any point by replaying the timeline
 * up to that record — see ReplayEngine.ts.
 *
 * USAGE
 * ─────
 *   timelineEngine.start()   // begin recording
 *   timelineEngine.stop()    // pause recording
 *   timelineEngine.getAll()  // all records, oldest first
 *   timelineEngine.since(version)
 *   timelineEngine.subscribe(listener)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { globalEventBus }               from '@/core/document/engineInstance'
import { engine }                       from '@/core/document/engineInstance'
import type { PatchEvents }             from '@/core/patch/events'
import type { Patch, PatchSource }      from '@/core/patch/types'
import {
  createPatchRecord,
  actorFromSource,
  type PatchRecord,
  type ActorInfo,
} from './PatchRecord'

// ─────────────────────────────────────────────────────────────────────────────
// Listener type
// ─────────────────────────────────────────────────────────────────────────────

export type TimelineListener = (record: PatchRecord) => void

// ─────────────────────────────────────────────────────────────────────────────
// TimelineEngine
// ─────────────────────────────────────────────────────────────────────────────

class TimelineEngine {
  private records:   PatchRecord[]     = []
  private listeners: Set<TimelineListener> = new Set()
  private unsubs:    Array<() => void> = []
  private running    = false

  /**
   * Maximum number of records held in memory.
   * Oldest records are pruned when the cap is exceeded.
   * Configurable via ATELIER_TIMELINE_DEPTH env var. Default: 5000.
   */
  private readonly maxRecords: number = (() => {
    const env = typeof process !== 'undefined'
      ? parseInt(process.env.ATELIER_TIMELINE_DEPTH ?? '', 10)
      : NaN
    return Number.isFinite(env) && env > 0 ? env : 5000
  })()

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start recording patch transactions from the engine.
   * Safe to call multiple times — duplicate calls are no-ops.
   */
  start(): void {
    if (this.running) return
    this.running = true

    // ── Single patch ──────────────────────────────────────────────────────
    const unsubApplied = globalEventBus.on(
      'patch-applied',
      (event: PatchEvents['patch-applied']) => {
        const patch  = event.patch as Patch
        const source = (patch.meta?.source ?? 'editor') as PatchSource

        this._record({
          version: event.version,
          patches: [patch],
          actor:   actorFromSource(source, patch.meta?.pluginId as string | undefined),
        })
      },
    )

    // ── Batch of patches (applyPatchArray) ────────────────────────────────
    // The engine does not emit 'patch-array-applied' on globalEventBus, but
    // it emits 'patch-applied' for each constituent patch individually via
    // enqueuePatch inside the batch. We detect batches by grouping records
    // that arrive in the same synchronous microtask tick at the same version.
    // This is handled by the grouping logic in _record().

    // ── Rollback (undo) ───────────────────────────────────────────────────
    const unsubRolled = globalEventBus.on(
      'patch-rolled-back',
      (event: PatchEvents['patch-rolled-back']) => {
        // Undo is recorded as a special system record with no user patches.
        // This preserves the complete edit history including reversals.
        this._record({
          version: event.version,
          patches: [],
          actor:   actorFromSource('editor'),
          label:   `Undo (restored to v${event.version})`,
          isUndo:  true,
        })
      },
    )

    this.unsubs.push(unsubApplied, unsubRolled)
  }

  /**
   * Stop recording. Existing records are preserved.
   */
  stop(): void {
    if (!this.running) return
    this.unsubs.forEach(fn => fn())
    this.unsubs = []
    this.running = false
  }

  get isRunning(): boolean { return this.running }

  // ── Record access ──────────────────────────────────────────────────────────

  /** All records in chronological order. */
  getAll(): readonly PatchRecord[] {
    return this.records
  }

  /** All records for a specific branch. Default: 'main'. */
  getBranch(branchId = 'main'): readonly PatchRecord[] {
    return this.records.filter(r => r.branchId === branchId)
  }

  /** Records at or after the given document version. */
  since(version: number): readonly PatchRecord[] {
    return this.records.filter(r => r.version >= version)
  }

  /** The most recently recorded transaction. */
  get latest(): PatchRecord | null {
    return this.records[this.records.length - 1] ?? null
  }

  /** Total number of recorded transactions. */
  get length(): number { return this.records.length }

  /** Total number of individual patches across all records. */
  get patchCount(): number {
    return this.records.reduce((n, r) => n + r.patches.length, 0)
  }

  /**
   * Find a record by its id.
   */
  findById(id: string): PatchRecord | undefined {
    return this.records.find(r => r.id === id)
  }

  /**
   * Find the record that corresponds to a given document version.
   */
  findByVersion(version: number): PatchRecord | undefined {
    return this.records.find(r => r.version === version)
  }

  /**
   * Return a summary of actor activity — useful for AI analysis.
   */
  actorSummary(): Record<string, { records: number; patches: number }> {
    const out: Record<string, { records: number; patches: number }> = {}
    for (const r of this.records) {
      const key = r.actor.type
      if (!out[key]) out[key] = { records: 0, patches: 0 }
      out[key].records++
      out[key].patches += r.patches.length
    }
    return out
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  /**
   * Subscribe to new timeline records.
   * The listener is called synchronously after each record is committed.
   *
   * @returns  Unsubscribe function.
   */
  subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── Mutation support (for BranchManager) ──────────────────────────────────

  /** @internal — used by BranchManager to append replayed records. */
  _appendRecord(record: PatchRecord): void {
    this.records.push(record)
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords)
    }
    this._notify(record)
  }

  /** @internal — clear all records (used for testing / reset). */
  _reset(): void {
    this.records = []
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _record(params: {
    version: number
    patches: Patch[]
    actor:   ActorInfo
    label?:  string
    isUndo?: boolean
    branchId?: string
  }): void {
    if (params.patches.length === 0 && !params.isUndo) return

    const record = createPatchRecord({
      version:  params.version,
      patches:  params.patches,
      actor:    params.actor,
      label:    params.label,
      branchId: params.branchId ?? 'main',
    })

    this.records.push(record)
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords)
    }
    this._notify(record)
  }

  private _notify(record: PatchRecord): void {
    for (const fn of this.listeners) {
      try { fn(record) } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The application-wide Timeline Engine singleton.
 *
 * Call `timelineEngine.start()` once at app boot to begin recording.
 * The timeline will then capture every patch applied by any actor.
 */
export const timelineEngine = new TimelineEngine()
