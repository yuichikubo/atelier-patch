/**
 * ATELIER CMS — Timeline Persistence Manager
 *
 * Wires TimelineEngine (in-memory) to TimelineRepository (filesystem).
 *
 * Usage:
 *   // In the page component after loading a document:
 *   const manager = createTimelinePersistence(pageId)
 *   manager.load()    // hydrate timelineEngine with stored records
 *   manager.start()   // begin flushing new records to disk
 *   // On unmount:
 *   manager.stop()
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This module is a pure observer — never calls engine.enqueuePatch()
 * • Load only calls timelineEngine._appendRecord() — no document mutation
 * • Save only calls TimelineRepository.save() — no document mutation
 */

import { timelineEngine }   from './TimelineEngine'
import type { PatchRecord } from './PatchRecord'

// ─────────────────────────────────────────────────────────────────────────────
// Flush behaviour
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce window in ms for batching rapid patch events into a single write. */
const FLUSH_DEBOUNCE_MS = 1500

// ─────────────────────────────────────────────────────────────────────────────
// Manager
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelinePersistenceManager {
  /** Hydrate timelineEngine with records stored on disk. */
  load(): void
  /** Begin watching timelineEngine for new records and flushing them. */
  start(): void
  /** Stop watching and perform a final flush. */
  stop(): void
  /** Flush all pending records to disk immediately. */
  flush(): void
}

export function createTimelinePersistence(pageId: string): TimelinePersistenceManager {
  let unsub:  (() => void) | null = null
  let timer:  ReturnType<typeof setTimeout> | null = null

  function flush(): void {
    if (timer) { clearTimeout(timer); timer = null }
    const records = timelineEngine.getAll()
    fetch(`/api/timeline/${pageId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    }).catch(e => console.warn('[TimelinePersistence] flush failed:', e))
  }

  function scheduleFlush(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, FLUSH_DEBOUNCE_MS)
  }

  return {
    load(): void {
      fetch(`/api/timeline/${pageId}`)
        .then(r => r.ok ? r.json() : [])
        .then((stored: PatchRecord[]) => {
          if (!stored.length) return
          const existingIds = new Set(timelineEngine.getAll().map(r => r.id))
          for (const record of stored) {
            if (!existingIds.has(record.id)) {
              timelineEngine._appendRecord(record as PatchRecord)
            }
          }
        })
        .catch(e => console.warn('[TimelinePersistence] load failed:', e))
    },

    start(): void {
      if (unsub) return   // already started
      unsub = timelineEngine.subscribe(() => scheduleFlush())
    },

    stop(): void {
      flush()
      unsub?.()
      unsub = null
    },

    flush,
  }
}
