/**
 * ATELIER CMS — Patch Record
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A PatchRecord is the atomic unit of the patch timeline.
 * It captures a single committed transaction: who made it, when, and what
 * patches were applied in that transaction.
 *
 * PatchRecords are immutable once written.
 * The timeline is an ordered append-only log of PatchRecords.
 *
 * Architecture note:
 *   Document = reduce(timeline, (doc, record) => applyAll(doc, record.patches))
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Patch, PatchSource } from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Actor identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The actor type that produced the patch transaction.
 * Maps directly to PatchSource but is kept separate so the timeline
 * can evolve its actor model independently of the patch schema.
 */
export type TimelineActor = PatchSource  // 'editor' | 'ai' | 'automation' | 'plugin'

/** Rich actor identity for display and analysis. */
export interface ActorInfo {
  /** Actor category. */
  type:      TimelineActor
  /** Human-readable display name (e.g. 'User', 'GPT-4o', 'ScheduledJob'). */
  label:     string
  /** Plugin or AI model identifier, if applicable. */
  agentId?:  string
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single committed patch transaction in the timeline.
 *
 * One PatchRecord may contain multiple Patch objects when patches were
 * applied atomically (e.g. via applyPatchArray or a transaction group).
 */
export interface PatchRecord {
  /** Globally unique record id. Format: 'pr_<timestamp_b36>_<seq>'. */
  readonly id:         string

  /** ISO timestamp of when this transaction was committed. */
  readonly timestamp:  string

  /** Document version AFTER this record was applied. */
  readonly version:    number

  /** Who produced this transaction. */
  readonly actor:      ActorInfo

  /**
   * The patches in this transaction, in application order.
   * Always contains at least one patch.
   */
  readonly patches:    readonly Patch[]

  /**
   * Optional human or AI-authored label describing this transaction.
   * Examples: 'Added hero section', 'AI: generate landing page'
   */
  readonly label?:     string

  /**
   * If this record was produced by replaying another record
   * (e.g. during branch merge or redo), the id of the source record.
   */
  readonly replayOf?:  string

  /**
   * Branch this record belongs to. 'main' for the default timeline.
   */
  readonly branchId:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0

function uid(): string {
  _seq++
  return `pr_${Date.now().toString(36)}_${_seq.toString(36).padStart(4, '0')}`
}

/** Derive ActorInfo from a PatchSource string and optional patch meta. */
export function actorFromSource(
  source:  PatchSource | undefined,
  agentId?: string,
): ActorInfo {
  const LABELS: Record<PatchSource, string> = {
    editor:     'User',
    ai:         'AI',
    automation: 'Automation',
    plugin:     'Plugin',
  }
  const type = source ?? 'editor'
  return { type, label: LABELS[type], agentId }
}

/** Create an immutable PatchRecord. */
export function createPatchRecord(
  params: {
    version:    number
    patches:    Patch[]
    actor:      ActorInfo
    label?:     string
    replayOf?:  string
    branchId?:  string
  },
): PatchRecord {
  return Object.freeze({
    id:        uid(),
    timestamp: new Date().toISOString(),
    version:   params.version,
    actor:     Object.freeze({ ...params.actor }),
    patches:   Object.freeze([...params.patches]),
    label:     params.label,
    replayOf:  params.replayOf,
    branchId:  params.branchId ?? 'main',
  })
}
