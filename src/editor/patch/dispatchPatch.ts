/**
 * ATELIER CMS — Patch Dispatcher
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `dispatchPatch` and `dispatchPatchArray` are the single entry points that
 * editor-layer code (Block Library, sidebar, inspector) uses to send patches
 * to the Patch Engine.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This file never modifies PatchEngine — it only calls its public API.
 * • Callers hand a typed Patch object to this module; this module forwards
 *   it to `engine.enqueuePatch()` and returns the result.
 * • After a successful patch this module also fires the public `patchEventBus`
 *   so AI adapters, plugins, and analytics receive the lifecycle event.
 * • If the engine is unavailable (SSR / test contexts), the call is a safe
 *   no-op and returns an `ok: false` result.
 *
 * DATA FLOW
 * ─────────
 *   BlockLibrary / inspector / AI adapter
 *     → createAddBlockPatch(…) / createUpdateBlockPatch(…)
 *       → dispatchPatch(patch)
 *         → engine.enqueuePatch(patch)          ← PatchEngine applies
 *         → patchEventBus.emit('patch-applied') ← public bus notified
 *           → Renderer re-renders canvas
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { engine }          from '@/core/document/engineInstance'
import { patchEventBus,
         emitDocumentChanged } from '@/core/patch/eventBus'
import type { Patch,
              PatchArray,
              PatchResult,
              PatchArrayResult,
              PatchSource }    from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchOptions {
  /** Subsystem sending the patch. Defaults to 'editor'. */
  source?: PatchSource
  /**
   * If true, the patch is applied silently — no events are emitted on the
   * public bus. Useful for internal preview / preflight checks.
   * Default: false.
   */
  silent?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// dispatchPatch — single patch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a single patch to the Patch Engine and emits lifecycle events.
 *
 * @param patch    A valid Patch object (AddPatch, UpdatePatch, RemovePatch, …)
 * @param options  Optional source and silent flag
 * @returns        PatchResult — `{ ok, patchId, patch, error? }`
 *
 * @example
 *   const result = dispatchPatch({
 *     op:       'add',
 *     target:   'block',
 *     data:     { type:'text', parentSectionId:'s_001', content:{ text:'' } },
 *     position: { placement:'end' },
 *   })
 *   if (!result.ok) console.error(result.error)
 */
export function dispatchPatch(
  patch:   Patch,
  options: DispatchOptions = {},
): PatchResult {
  const { source = 'editor', silent = false } = options

  // Attach source to meta if not already set
  const enriched: Patch = {
    ...patch,
    meta: {
      source,
      timestamp: new Date().toISOString(),
      ...patch.meta,
    },
  }

  const result = engine.enqueuePatch(enriched)

  if (result.ok && !silent) {
    const version = engine.getVersion()

    // Fire the public event bus so plugins and AI adapters are notified
    patchEventBus.emit({
      type:    'patch-applied',
      payload: {
        patchId: result.patchId,
        op:      patch.op,
        target:  'target' in patch ? (patch as any).target : 'block',
        version,
      },
      context: { source },
    })

    // Emit a document-changed event so analytics and autosave hooks react
    emitDocumentChanged(version, 1, source)
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// dispatchPatchArray — batch of patches applied atomically
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an array of patches to the Patch Engine as a single atomic operation.
 * All patches succeed together or are all rejected.
 *
 * Prefer this over multiple `dispatchPatch` calls when changes are logically
 * related (e.g. adding a section and its first block together).
 *
 * @example
 *   dispatchPatchArray([
 *     { op:'add', target:'section', data:{ type:'blank' }, position:{ placement:'end' } },
 *     { op:'add', target:'block',   data:{ type:'hero', parentSectionId:'…', … }, position:{ placement:'end' } },
 *   ])
 */
export function dispatchPatchArray(
  patches: Patch[],
  options: DispatchOptions = {},
): PatchArrayResult {
  const { source = 'editor', silent = false } = options

  const enriched = patches.map(p => ({
    ...p,
    meta: { source, timestamp: new Date().toISOString(), ...p.meta },
  }))

  const result = engine.applyPatchArray({
    patch: enriched,
    meta:  { source },
  })

  if (result.ok && !silent) {
    const version = engine.getVersion()

    patchEventBus.emit({
      type:    'patch-batch-applied',
      payload: { count: result.applied, version },
      context: { source },
    })

    emitDocumentChanged(version, result.applied, source)
  }

  return result
}
