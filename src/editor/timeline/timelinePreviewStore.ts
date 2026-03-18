'use client'
/**
 * ATELIER CMS — Timeline Preview Store
 *
 * Manages document state previews triggered by timeline navigation.
 * All previews run on an isolated ReplayEngine instance.
 * The live document is NEVER modified during preview.
 *
 * RESTORE FLOW
 * ─────────────
 *   1. replayEngine.replayTo(records, target) → isolated engine → ReplayResult
 *   2. engine.loadDocument(result.document)   → replaces live doc, clears history
 *   3. Canvas re-renders immediately via engine.notify()
 *
 * INVARIANT: Preview never touches the live engine.
 * Restore uses engine.loadDocument() — not applyPatchArray() — because SAFE_PAGE_FIELDS
 * would otherwise strip the sections field from any update-page patch.
 */

import { create }           from 'zustand'
import { engine }           from '@/core/document/engineInstance'
import { timelineEngine }   from '@/system/timeline/TimelineEngine'
import { replayEngine }     from '@/system/timeline/ReplayEngine'
import type { PatchRecord } from '@/system/timeline/PatchRecord'
import type { Page }        from '@/core/document/types'

export interface TimelinePreviewState {
  active:          boolean
  previewRecord:   PatchRecord | null
  previewDoc:      Page | null
  hoveredRecord:   PatchRecord | null
  hoveredBlockIds: Set<string>
  isReplaying:     boolean
  replayError:     string | null

  /** Enter preview mode for a specific record. Runs replay on isolated engine. */
  previewAt(record: PatchRecord): Promise<void>
  /** Exit preview — returns canvas to live document. */
  exitPreview(): void
  /** Set hover state for highlight ring. */
  hoverRecord(record: PatchRecord | null): void
  /**
   * Restore the live document to the state at a given timeline record.
   * Uses ReplayEngine on an isolated instance, then calls engine.loadDocument()
   * to replace the live document in one operation.
   * Clears undo history — this is intentional for a version restore.
   */
  restoreTo(record: PatchRecord): { ok: boolean; error?: string }
}

export const useTimelinePreviewStore = create<TimelinePreviewState>((set, get) => ({
  active:          false,
  previewRecord:   null,
  previewDoc:      null,
  hoveredRecord:   null,
  hoveredBlockIds: new Set<string>(),
  isReplaying:     false,
  replayError:     null,

  async previewAt(record) {
    set({ isReplaying: true, replayError: null })
    try {
      const all    = timelineEngine.getAll()
      const result = replayEngine.replayTo(all, record)
      set({
        active:        true,
        previewRecord: record,
        previewDoc:    result.ok ? result.document : null,
        isReplaying:   false,
        replayError:   result.ok ? null : result.errors[0] ?? 'Replay failed',
      })
    } catch (e) {
      set({ isReplaying: false, replayError: e instanceof Error ? e.message : String(e) })
    }
  },

  exitPreview() {
    set({ active: false, previewRecord: null, previewDoc: null, isReplaying: false, replayError: null })
  },

  hoverRecord(record) {
    if (!record) {
      set({ hoveredRecord: null, hoveredBlockIds: new Set() })
      return
    }
    // Collect block IDs from the hovered record's patches for highlight rings
    const ids = new Set<string>()
    for (const p of record.patches) {
      if ('target' in p && (p as any).target === 'block') {
        if ('id' in p)           ids.add((p as any).id)
        if ((p as any).data?.id) ids.add((p as any).data.id)
      }
    }
    set({ hoveredRecord: record, hoveredBlockIds: ids })
  },

  restoreTo(record) {
    // 1. Replay all patches up to the target record in an isolated PatchEngine instance.
    //    This is the same replay used for preview — no live document mutation occurs here.
    try {
      const all    = timelineEngine.getAll()
      const result = replayEngine.replayTo(all, record)

      if (!result.ok) {
        return { ok: false, error: result.errors[0] ?? 'Replay failed' }
      }

      // 2. Load the replayed document into the live engine.
      //    engine.loadDocument() deep-clones the document, clears undo history,
      //    and notifies all subscribers — the canvas re-renders immediately.
      //    No patch is applied so SAFE_PAGE_FIELDS is not involved.

      // Guard: warn if undo history will be lost.
      // peekUndo() reads the top entry without mutating — safe canUndo check.
      const hasHistory = !!(engine as any).hist?.peekUndo?.()
      if (hasHistory) {
        const confirmed = window.confirm(
          'Restoring this version will clear your undo history. Continue?',
        )
        if (!confirmed) {
          return { ok: false, error: 'Cancelled' }
        }
      }

      engine.loadDocument(result.document)

      // 3. Exit preview mode — canvas now shows the restored live document.
      set({ active: false, previewRecord: null, previewDoc: null, isReplaying: false, replayError: null })

      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },
}))
