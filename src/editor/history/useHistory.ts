'use client'
/**
 * ATELIER CMS — useHistory Hook
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `useHistory` exposes undo and redo to React components.
 * History is managed by the Patch Engine — this hook is a reactive adapter
 * that reads history availability and provides keyboard-shortcut support.
 *
 * HOW UNDO/REDO WORKS
 * ────────────────────
 * Every time `engine.enqueuePatch()` succeeds, PatchHistoryStore saves a
 * snapshot of the document before that patch. `engine.undo()` restores the
 * most recent snapshot and moves the patch to a redo stack. `engine.redo()`
 * reapplies the patch from the redo stack.
 *
 *   Patch applied   → snapshot pushed to undo stack, redo stack cleared
 *   engine.undo()   → snapshot restored, entry moved to redo stack
 *   engine.redo()   → patch re-applied, entry moved back to undo stack
 *
 * Both operations call `engine.notify()`, which causes `engine.subscribe()`
 * listeners to fire — so the canvas re-renders after every undo/redo.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This hook does NOT modify PatchEngine.
 * • `canUndo` and `canRedo` are tracked reactively via `globalEventBus`
 *   events (`patch-applied` and `patch-rolled-back`) rather than polling.
 * • Keyboard shortcut handling is opt-in via `enableKeyboard: true`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { engine, globalEventBus } from '@/core/document/engineInstance'

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseHistoryReturn {
  /**
   * Reverts the most recently applied patch.
   * No-op when there is nothing to undo.
   * Returns true if an undo was performed, false otherwise.
   */
  undo: () => boolean

  /**
   * Reapplies the most recently undone patch.
   * No-op when there is nothing to redo.
   * Returns true if a redo was performed, false otherwise.
   */
  redo: () => boolean

  /**
   * True when at least one patch is available to undo.
   * Reflects live engine state — updates whenever a patch is applied or undone.
   */
  canUndo: boolean

  /**
   * True when at least one patch is available to redo.
   * Reflects live engine state — updates whenever a patch is undone or reapplied.
   */
  canRedo: boolean

  /**
   * The document version at the time of the last undo or redo call.
   * Useful for animating toolbar state or triggering autosave on redo.
   */
  lastActionVersion: number | null

  /**
   * Human-readable label for the next undo operation.
   * Derived from the top of the undo stack.
   * Examples: "Undo: AI added hero section", "Undo: edit block"
   */
  undoLabel: string

  /**
   * Human-readable label for the next redo operation.
   */
  redoLabel: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

export interface UseHistoryOptions {
  /**
   * If true, Ctrl+Z and Ctrl+Y (Windows/Linux) / Cmd+Z and Cmd+Shift+Z (Mac)
   * are wired to undo and redo on the window object.
   * The listeners are removed on unmount.
   * Default: false.
   */
  enableKeyboard?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook for document undo / redo.
 *
 * @param options  Optional keyboard shortcut enablement.
 *
 * @example — basic
 *   const { undo, redo, canUndo, canRedo } = useHistory()
 *
 * @example — with keyboard shortcuts
 *   const history = useHistory({ enableKeyboard: true })
 *
 * @example — in a toolbar button
 *   <button onClick={undo} disabled={!canUndo}>↩ Undo</button>
 *   <button onClick={redo} disabled={!canRedo}>↪ Redo</button>
 */
export function useHistory(options: UseHistoryOptions = {}): UseHistoryReturn {
  const { enableKeyboard = false } = options

  // ── Track canUndo / canRedo via event bus ───────────────────────────────────
  // The engine's hist is private, but we can infer state from events:
  //   patch-applied     → undoStack grew, redoStack cleared
  //   patch-rolled-back → undoStack shrunk, redoStack grew
  //
  // We use an optimistic counter approach: start at 0 and increment/decrement.
  // The counters never go below 0.

  const undoCountRef = useRef(0)
  const redoCountRef = useRef(0)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [lastActionVersion, setLastActionVersion] = useState<number | null>(null)

  useEffect(() => {
    // New patch applied → undo stack grows, redo stack resets
    const unsubApplied = globalEventBus.on('patch-applied', () => {
      undoCountRef.current++
      redoCountRef.current = 0
      setCanUndo(true)
      setCanRedo(false)
    })

    // Batch of patches applied — treat as one undoable unit
    const unsubBatch = globalEventBus.on('patch-array-applied', () => {
      undoCountRef.current++
      redoCountRef.current = 0
      setCanUndo(true)
      setCanRedo(false)
    })

    // Patch rolled back (undo performed) → undo stack shrinks, redo stack grows
    const unsubRolledBack = globalEventBus.on('patch-rolled-back', (p) => {
      const { version } = p as { version: number }
      undoCountRef.current = Math.max(0, undoCountRef.current - 1)
      redoCountRef.current++
      setCanUndo(undoCountRef.current > 0)
      setCanRedo(true)
      setLastActionVersion(version)
    })

    return () => {
      unsubApplied()
      unsubBatch()
      unsubRolledBack()
    }
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const undo = useCallback((): boolean => {
    const ok = engine.undo()
    if (ok) {
      setLastActionVersion(engine.getVersion())
      // State will also update via the patch-rolled-back event listener above
    }
    return ok
  }, [])

  const redo = useCallback((): boolean => {
    const ok = engine.redo()
    if (ok) {
      // redo fires notify() → patch-applied equivalent via bus
      // Counter updates handled by patch-applied listener, but redo is a
      // special case: the redo stack shrinks rather than clears
      redoCountRef.current = Math.max(0, redoCountRef.current - 1)
      undoCountRef.current++
      setCanUndo(true)
      setCanRedo(redoCountRef.current > 0)
      setLastActionVersion(engine.getVersion())
    }
    return ok
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!enableKeyboard) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Undo: Ctrl+Z / Cmd+Z
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      // Redo: Ctrl+Y / Cmd+Shift+Z / Ctrl+Shift+Z
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enableKeyboard, undo, redo])

  // ── Human-readable undo/redo labels ─────────────────────────────────────────

  function entryLabel(entry: ReturnType<typeof engine.peekUndo>, verb: 'Undo' | 'Redo'): string {
    if (!entry) return verb
    const patch  = entry.patch
    const source = patch.meta?.source ?? 'editor'
    const op     = patch.op
    const target = 'target' in patch ? (patch as any).target : ''

    if (source === 'ai') {
      // AI batches — use op+target from the representative patch
      const action = op === 'add'    ? `added ${target}`
                   : op === 'update' ? `updated ${target}`
                   : op === 'remove' ? `removed ${target}`
                   : op
      return `${verb}: AI ${action}`
    }

    if (source === 'automation') return `${verb}: automation (${op} ${target})`

    // Human editor
    const action = op === 'add'    ? `add ${target}`
                 : op === 'update' ? `edit ${target}`
                 : op === 'remove' ? `remove ${target}`
                 : op
    return `${verb}: ${action}`
  }

  const undoLabel = entryLabel(engine.peekUndo(), 'Undo')
  const redoLabel = entryLabel(engine.peekRedo(), 'Redo')

  return { undo, redo, canUndo, canRedo, lastActionVersion, undoLabel, redoLabel }
}
