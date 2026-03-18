/**
 * ATELIER CMS — Branch Manager
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The BranchManager creates named branches off the main timeline.
 * A branch is an alternative patch sequence rooted at a specific record.
 *
 * INTENDED USE CASES
 * ──────────────────
 * • AI preview: apply AI-generated patches on a branch without touching 'main'
 * • A/B layout testing: two branches with different layout choices
 * • Safe automation: automation runs on a branch, human approves the merge
 * • Version review: named snapshots ("before-redesign", "v1.0")
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Branches are pure metadata. The underlying patches still go through
 *   PatchEngine when being applied.
 * • Merging a branch replays its patches on top of the current main document
 *   via the live engine — all patches travel through engine.enqueuePatch().
 * • BranchManager never mutates the document directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { engine }          from '@/core/document/engineInstance'
import { timelineEngine }  from './TimelineEngine'
import { replayEngine }    from './ReplayEngine'
import {
  createPatchRecord,
  actorFromSource,
  type PatchRecord,
} from './PatchRecord'
import type { Patch }      from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Branch descriptor
// ─────────────────────────────────────────────────────────────────────────────

export interface Branch {
  /** Unique branch id. Format: 'branch_<name>_<timestamp>'. */
  id:          string
  /** Human-readable name (e.g. 'ai-redesign', 'v1.0'). */
  name:        string
  /** The main-branch record this branch forks from. */
  rootRecordId: string
  /** Document version at the fork point. */
  rootVersion:  number
  /** ISO timestamp of creation. */
  createdAt:   string
  /** Short description of the branch purpose. */
  description?: string
  /** Whether this branch has been merged back into main. */
  merged:      boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge result
// ─────────────────────────────────────────────────────────────────────────────

export interface MergeResult {
  /** Whether the merge completed without errors. */
  ok:          boolean
  /** Number of patches applied to the live document. */
  applied:     number
  /** Error messages for patches that failed to apply. */
  errors:      string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// BranchManager
// ─────────────────────────────────────────────────────────────────────────────

class BranchManager {
  private branches: Map<string, Branch> = new Map()

  // ── Branch lifecycle ───────────────────────────────────────────────────────

  /**
   * Create a new branch forking from the current latest timeline record.
   *
   * @param name         Identifier for the branch (e.g. 'ai-draft', 'v2-layout')
   * @param description  Optional description
   *
   * @example
   *   const branch = branchManager.createBranch('ai-preview', 'AI-generated layout')
   */
  createBranch(name: string, description?: string): Branch {
    const latest = timelineEngine.latest
    if (!latest) {
      throw new Error('[BranchManager] Cannot create a branch on an empty timeline.')
    }

    const id: string = `branch_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`

    const branch: Branch = {
      id,
      name,
      rootRecordId: latest.id,
      rootVersion:  latest.version,
      createdAt:    new Date().toISOString(),
      description,
      merged:       false,
    }

    this.branches.set(id, Object.freeze({ ...branch }))
    return branch
  }

  /**
   * Get a branch by id.
   */
  getBranch(id: string): Branch | undefined {
    return this.branches.get(id)
  }

  /**
   * All registered branches.
   */
  getAll(): Branch[] {
    return [...this.branches.values()]
  }

  /**
   * All records that belong to a specific branch.
   */
  getRecords(branchId: string): readonly PatchRecord[] {
    return timelineEngine.getBranch(branchId)
  }

  // ── Branch application ─────────────────────────────────────────────────────

  /**
   * Apply an array of patches to a named branch.
   * Patches go through the live engine and are tagged with the branch id
   * in the resulting timeline record.
   *
   * Important: this DOES apply to the live document via engine.enqueuePatch().
   * To preview without applying, use replayEngine.validatePatches() first.
   *
   * @example
   *   const branch = branchManager.createBranch('ai-preview')
   *   branchManager.applyToBranch(branch.id, aiGeneratedPatches, 'AI: homepage redesign')
   */
  applyToBranch(branchId: string, patches: Patch[], label?: string): MergeResult {
    const branch = this.branches.get(branchId)
    if (!branch) {
      return { ok: false, applied: 0, errors: [`Branch '${branchId}' not found`] }
    }
    if (branch.merged) {
      return { ok: false, applied: 0, errors: [`Branch '${branchId}' is already merged`] }
    }

    const errors:  string[] = []
    let   applied  = 0

    for (const patch of patches) {
      // All mutations go through engine.enqueuePatch() — never direct
      const result = engine.enqueuePatch({ ...patch, meta: { ...patch.meta, source: patch.meta?.source ?? 'editor' } })
      if (result.ok) {
        applied++
      } else {
        errors.push(result.error?.message ?? `Patch ${result.patchId} failed`)
      }
    }

    // Tag the resulting timeline record with the branch id
    // (The TimelineEngine will have recorded the individual patches;
    //  here we annotate the latest record with the branch context.)
    const latestRecord = timelineEngine.latest
    if (latestRecord && label) {
      // Record a summary branch record for grouping
      const record = createPatchRecord({
        version:  engine.getVersion(),
        patches,
        actor:    actorFromSource(patches[0]?.meta?.source as any),
        label:    label ?? `Branch: ${branch.name}`,
        branchId,
      })
      timelineEngine._appendRecord(record)
    }

    return { ok: errors.length === 0, applied, errors }
  }

  // ── Merge ──────────────────────────────────────────────────────────────────

  /**
   * Merge a branch into the main timeline by replaying its unique patches
   * on top of the current live document.
   *
   * All patches are applied through engine.enqueuePatch().
   *
   * @example
   *   const result = branchManager.mergeBranch('branch_ai-preview_xyz')
   *   if (result.ok) console.log(`Merged ${result.applied} patches`)
   */
  mergeBranch(branchId: string): MergeResult {
    const branch = this.branches.get(branchId)
    if (!branch) return { ok: false, applied: 0, errors: [`Branch '${branchId}' not found`] }
    if (branch.merged) return { ok: false, applied: 0, errors: [`Branch '${branchId}' already merged`] }

    // Collect patches from branch records
    const branchRecords = timelineEngine.getBranch(branchId)
    const patches = replayEngine.extractPatches(branchRecords, { branchId })

    if (patches.length === 0) {
      return { ok: true, applied: 0, errors: [] }
    }

    const errors: string[] = []
    let   applied = 0

    for (const patch of patches) {
      const result = engine.enqueuePatch(patch)
      if (result.ok) {
        applied++
      } else {
        errors.push(result.error?.message ?? `Patch ${result.patchId} failed`)
      }
    }

    // Mark merged
    this.branches.set(branchId, Object.freeze({ ...branch, merged: true }))

    // Record the merge event on main
    const mergeRecord = createPatchRecord({
      version:  engine.getVersion(),
      patches,
      actor:    actorFromSource('editor'),
      label:    `Merge branch: ${branch.name}`,
      branchId: 'main',
    })
    timelineEngine._appendRecord(mergeRecord)

    return { ok: errors.length === 0, applied, errors }
  }

  /**
   * Discard a branch without merging it.
   */
  discardBranch(branchId: string): void {
    const branch = this.branches.get(branchId)
    if (branch) {
      this.branches.set(branchId, Object.freeze({ ...branch, merged: true }))
    }
  }

  /**
   * Preview what a branch would look like when merged, without applying to live doc.
   * Returns the reconstructed document that would result from the merge.
   */
  previewMerge(branchId: string) {
    const branchRecords = timelineEngine.getBranch(branchId)
    return replayEngine.replayAll(branchRecords, { branchId })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const branchManager = new BranchManager()
