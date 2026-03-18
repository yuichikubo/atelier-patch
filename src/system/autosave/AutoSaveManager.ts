/**
 * ATELIER CMS — AutoSaveManager
 *
 * Observes engine state and persists the document whenever it changes.
 * Pure observer — never calls engine.enqueuePatch() or mutates the document.
 *
 * Usage:
 *   const manager = new AutoSaveManager(pageId, workspaceId)
 *   manager.start()        // begin watching
 *   manager.stop()         // stop and clean up
 *   manager.flush()        // save immediately (call before unmount)
 *
 * The save is debounced so rapid patches (inline typing, AI batch apply)
 * produce only one API call after the burst settles.
 */

import { engine }             from '@/core/document/engineInstance'
import { emitDocumentSaved }  from '@/core/patch/eventBus'
import type { Page }          from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Status type (exposed for UI indicators)
// ─────────────────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export type StatusListener = (status: SaveStatus) => void

// ─────────────────────────────────────────────────────────────────────────────
// AutoSaveManager
// ─────────────────────────────────────────────────────────────────────────────

export class AutoSaveManager {
  private pageId:       string
  private workspaceId:  string
  private debounceMs:   number

  private unsub:        (() => void) | null = null
  private timer:        ReturnType<typeof setTimeout> | null = null
  private status:       SaveStatus = 'idle'
  private listeners:    Set<StatusListener> = new Set()
  private pendingDoc:   Page | null = null

  constructor(pageId: string, workspaceId: string, debounceMs = 2000) {
    this.pageId      = pageId
    this.workspaceId = workspaceId
    this.debounceMs  = debounceMs
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Begin watching the engine. Safe to call multiple times — only one subscription is held. */
  start(): void {
    if (this.unsub) return   // already running

    this.unsub = engine.subscribe((doc: Page) => {
      this.pendingDoc = doc
      this.setStatus('pending')
      this.scheduleFlush()
    })
  }

  /** Stop watching. Cancels any pending debounced save. */
  stop(): void {
    this.unsub?.()
    this.unsub = null
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Force an immediate save of the current document state.
   * Cancels any pending debounced save.
   * Returns a promise that resolves when the save completes.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const doc = this.pendingDoc ?? (engine.getDocument() as Page)
    await this.persist(doc)
  }

  // ── Status ────────────────────────────────────────────────────────────────

  /** Subscribe to save status updates for UI indicators. */
  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): SaveStatus {
    return this.status
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const doc = this.pendingDoc
      // In-flight guard: if a save is already running, the next subscribe
      // notification will schedule another flush after it completes
      if (doc && this.status !== 'saving') this.persist(doc)
    }, this.debounceMs)
  }

  private async persist(doc: Page): Promise<void> {
    this.setStatus('saving')
    try {
      const res = await fetch(`/api/pages/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.pendingDoc = null
      this.setStatus('saved')
      emitDocumentSaved(doc.id, doc.version, doc.status ?? 'draft')
      // Return to idle after a brief "saved" display window
      setTimeout(() => {
        if (this.status === 'saved') this.setStatus('idle')
      }, 2000)
    } catch (e) {
      console.error('[AutoSaveManager] Save failed:', e)
      this.setStatus('error')
    }
  }

  private setStatus(next: SaveStatus): void {
    if (this.status === next) return
    this.status = next
    this.listeners.forEach(fn => fn(next))
  }
}
