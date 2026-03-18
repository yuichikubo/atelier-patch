'use client'
/**
 * ATELIER CMS — AI Preview Store
 *
 * Manages the lifecycle of AI Preview Mode including selective patch apply.
 *
 * FLOW
 * ────
 *   1. AI generates Patch[]
 *   2. previewStore.enter(patches) — applies ALL patches to an isolated engine,
 *      stores the resulting document in previewDoc, ALL patches selected by default
 *   3. EditorCanvas renders previewDoc (full preview — unchanged by selection)
 *   4. User toggles individual patches via togglePatch(patchId)
 *   5. User clicks "Apply" → commit() → engine.applyPatchArray(selectedPatches)
 *      User clicks "Discard" → discard() → live doc unchanged
 *
 * INVARIANT
 * ─────────
 * The live engine is NEVER called during preview.
 * Only commit() sends patches to the live Patch Engine.
 * Preview rendering always shows the FULL patch set regardless of selection.
 * Selective apply only affects the final commit.
 */

import { create }            from 'zustand'
import { engine }            from '@/core/document/engineInstance'
import { PatchEngine }       from '@/core/patch/engine'
import { PatchHistoryStore } from '@/core/patch/history'
import { PatchEventBus }     from '@/core/patch/events'
import type { Patch, AddPatch } from '@/core/patch/types'
import type { Page }         from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

export interface AIPreviewState {
  active:          boolean
  previewDoc:      Page | null
  pendingPatches:  Patch[]
  /** patchIds that are checked — defaults to all. Drives the final commit. */
  selectedPatchIds: Set<string>
  patchCount:      number
  /** Block IDs touched by AI patches — used for canvas highlight rings. */
  changedBlockIds: Set<string>

  enter(patches: Patch[]): { ok: boolean; applied: number; errors: string[] }
  /** Toggle a patch on/off. Handles dependency propagation. */
  togglePatch(patchId: string): void
  /** Select all patches. */
  selectAll(): void
  /** Deselect all patches. */
  deselectAll(): void
  /** Commit only the selected patches to the live engine. */
  commit(): { ok: boolean; applied: number; error?: string }
  /** Update changed block IDs (streaming path). */
  setChangedBlockIds(ids: Set<string>): void
  discard(): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the set of patch IDs that must be disabled when `disabledId` is disabled.
 *
 * Dependency rule:
 *   An "add block" patch that references a newly-created section (via parentSectionId)
 *   depends on the "add section" patch that creates that section.
 *   If the section patch is deselected, its dependent block patches must also deselect.
 */
function computeForceDisabled(patches: Patch[], selectedIds: Set<string>): Set<string> {
  const forceDisabled = new Set<string>()

  // Build a map: sectionClientId → patchId (for add-section patches)
  const sectionPatchById = new Map<string, string>()
  for (const p of patches) {
    if (p.op === 'add' && (p as AddPatch).target === 'section') {
      const sectionId = (p as AddPatch).data?.id as string | undefined
      if (sectionId && p.patchId) sectionPatchById.set(sectionId, p.patchId)
    }
  }

  // For each add-block patch, check if its parentSection was deselected
  for (const p of patches) {
    if (p.op === 'add' && (p as AddPatch).target === 'block') {
      const parentId = (p as AddPatch).data?.parentSectionId as string | undefined
      if (parentId) {
        const sectionPatchId = sectionPatchById.get(parentId)
        if (sectionPatchId && !selectedIds.has(sectionPatchId)) {
          if (p.patchId) forceDisabled.add(p.patchId)
        }
      }
    }
  }

  return forceDisabled
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useAIPreviewStore = create<AIPreviewState>((set, get) => ({
  active:           false,
  previewDoc:       null,
  pendingPatches:   [],
  selectedPatchIds: new Set<string>(),
  patchCount:       0,
  changedBlockIds:  new Set<string>(),

  enter(patches) {
    const liveDoc    = engine.getDocument() as Page
    const clonedDoc  = JSON.parse(JSON.stringify(liveDoc)) as Page
    const previewEng = new PatchEngine(clonedDoc, new PatchHistoryStore(), new PatchEventBus())

    const errors: string[] = []
    const successfulPatches: Patch[] = []

    for (const patch of patches) {
      const result = previewEng.enqueuePatch(patch)
      if (result.ok) {
        successfulPatches.push(result.patch)  // use stamped patch (has patchId)
      } else {
        errors.push(result.error?.message ?? `Patch failed: ${patch.op}`)
      }
    }

    if (successfulPatches.length === 0) return { ok: false, applied: 0, errors }

    const previewDoc = previewEng.getDocument() as Page

    // Collect block IDs touched by patches for canvas highlights
    const changedBlockIds = new Set<string>()
    for (const p of successfulPatches) {
      if ('target' in p && (p as any).target === 'block') {
        if ('id' in p)               changedBlockIds.add((p as any).id)
        if ((p as any).data?.id)     changedBlockIds.add((p as any).data.id)
      }
    }

    // All patches selected by default
    const selectedPatchIds = new Set(successfulPatches.map(p => p.patchId!).filter((id): id is string => Boolean(id)))

    set({
      active:           true,
      previewDoc,
      pendingPatches:   successfulPatches,
      selectedPatchIds,
      patchCount:       successfulPatches.length,
      changedBlockIds,
    })

    return { ok: true, applied: successfulPatches.length, errors }
  },

  togglePatch(patchId) {
    const { pendingPatches, selectedPatchIds } = get()
    const next = new Set<string>(selectedPatchIds)

    if (next.has(patchId)) {
      next.delete(patchId)
    } else {
      next.add(patchId)
    }

    // Propagate dependency constraints — block patches depending on a deselected section
    const forced = computeForceDisabled(pendingPatches, next)
    for (const fid of forced) next.delete(fid)

    set({ selectedPatchIds: next })
  },

  selectAll() {
    const { pendingPatches } = get()
    set({ selectedPatchIds: new Set(pendingPatches.map(p => p.patchId!).filter((id): id is string => Boolean(id))) })
  },

  deselectAll() {
    set({ selectedPatchIds: new Set() })
  },

  commit() {
    const { pendingPatches, selectedPatchIds } = get()

    const toApply = pendingPatches.filter(p => p.patchId && selectedPatchIds.has(p.patchId))

    const reset = { active: false, previewDoc: null, pendingPatches: [], selectedPatchIds: new Set<string>(), patchCount: 0, changedBlockIds: new Set<string>() }

    if (toApply.length === 0) {
      set(reset)
      return { ok: true, applied: 0 }
    }

    // Apply as ONE atomic batch → one undo step for the entire AI operation
    const result = engine.applyPatchArray({ patch: toApply, meta: { source: 'ai' } })
    set(reset)

    return { ok: result.ok, applied: result.applied, error: result.errors[0]?.message }
  },

  setChangedBlockIds(ids) {
    set({ changedBlockIds: ids })
  },

  discard() {
    set({ active: false, previewDoc: null, pendingPatches: [], selectedPatchIds: new Set(), patchCount: 0, changedBlockIds: new Set() })
  },
}))
