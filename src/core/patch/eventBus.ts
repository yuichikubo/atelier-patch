/**
 * ATELIER CMS — Patch Event Bus
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * This module provides a public, singleton event bus for patch lifecycle events.
 * It is the integration point for AI adapters, automation pipelines, and
 * third-party plugins that need to react to document changes without being
 * directly coupled to PatchEngine internals.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This module does NOT modify PatchEngine behaviour.
 * • PatchEngine MAY emit events here in a future integration pass.
 * • Current engine events are handled by PatchEventBus in ./events.ts
 *   (the internal, strongly-typed bus used by the engine itself).
 * • This bus provides a looser, document-lifecycle vocabulary suited to
 *   external consumers (AI, automation, plugins, analytics).
 *
 * RELATIONSHIP TO EXISTING BUSES
 * ────────────────────────────────
 * • ./events.ts      — internal typed bus, used by PatchEngine & globalEventBus
 * • ../system/eventBus.ts — window-level CustomEvent bridge for UI components
 * • THIS FILE        — public integration bus for AI / automation / plugins
 *
 * USAGE EXAMPLE
 * ─────────────
 *   import { patchEventBus } from '@/core/patch/eventBus'
 *
 *   const unsub = patchEventBus.subscribe(event => {
 *     if (event.type === 'document-changed') {
 *       console.log('Version:', event.payload.version)
 *     }
 *   })
 *
 *   // Clean up when done
 *   unsub()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { OperationSource } from './operations'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Event type catalogue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every patch lifecycle event that may be broadcast on the bus.
 *
 * Naming convention:
 *   "<noun>-<past-tense-verb>"  e.g. "block-added", "document-saved"
 *
 * Groups:
 *   patch-*      Low-level patch engine lifecycle
 *   block-*      Block-level document changes
 *   section-*    Section-level document changes
 *   page-*       Page metadata changes
 *   document-*   High-level document lifecycle
 *   session-*    Editor session events
 */
export type PatchEventType =
  // ── Patch lifecycle ────────────────────────────────────────────────────────
  | 'patch-applied'
  | 'patch-rejected'
  | 'patch-reverted'
  | 'patch-batch-applied'

  // ── Block changes ──────────────────────────────────────────────────────────
  | 'block-added'
  | 'block-updated'
  | 'block-removed'
  | 'block-moved'
  | 'block-duplicated'
  | 'block-selected'

  // ── Section changes ────────────────────────────────────────────────────────
  | 'section-added'
  | 'section-updated'
  | 'section-removed'
  | 'section-moved'
  | 'section-duplicated'
  | 'section-cleared'

  // ── Page metadata ──────────────────────────────────────────────────────────
  | 'page-updated'
  | 'page-theme-changed'
  | 'page-seo-updated'

  // ── Document lifecycle ─────────────────────────────────────────────────────
  | 'document-changed'
  | 'document-loaded'
  | 'document-saved'
  | 'document-published'
  | 'document-reset'

  // ── Session events ─────────────────────────────────────────────────────────
  | 'session-undo'
  | 'session-redo'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Event payload shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Context attached to every event. */
export interface PatchEventContext {
  /** Which subsystem produced this event. */
  source?:    OperationSource
  /** ISO timestamp of the event. */
  timestamp:  string
  /** Plugin identifier if source is 'plugin'. */
  pluginId?:  string
}

/** Base interface for all patch events. */
export interface PatchEvent<T extends PatchEventType = PatchEventType> {
  /** Event category. */
  type:      T
  /** Event-specific payload. Typed per event below. */
  payload?:  PatchEventPayloadMap[T]
  /** Contextual metadata. */
  context:   PatchEventContext
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Typed payload map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps each PatchEventType to its expected payload shape.
 * Extend this map when adding new event types.
 */
export interface PatchEventPayloadMap {
  // ── Patch lifecycle ────────────────────────────────────────────────────────
  'patch-applied': {
    patchId:   string
    op:        string
    target:    string
    version:   number
  }
  'patch-rejected': {
    patchId?:  string
    op:        string
    reason:    string
  }
  'patch-reverted': {
    patchId?:  string
    version:   number
  }
  'patch-batch-applied': {
    count:     number
    version:   number
  }

  // ── Block payloads ─────────────────────────────────────────────────────────
  'block-added': {
    blockId:    string
    blockType:  string
    sectionId:  string
  }
  'block-updated': {
    blockId:    string
    blockType:  string
    fields:     string[]       // names of updated content keys
  }
  'block-removed': {
    blockId:    string
    sectionId:  string
  }
  'block-moved': {
    blockId:    string
    fromSection: string
    toSection:  string
  }
  'block-duplicated': {
    sourceBlockId: string
    newBlockId:    string
    sectionId:     string
  }
  'block-selected': {
    blockId:    string | null
  }

  // ── Section payloads ───────────────────────────────────────────────────────
  'section-added': {
    sectionId:   string
    sectionType: string
  }
  'section-updated': {
    sectionId:   string
  }
  'section-removed': {
    sectionId:   string
  }
  'section-moved': {
    sectionId:   string
    fromIndex:   number
    toIndex:     number
  }
  'section-duplicated': {
    sourceSectionId: string
    newSectionId:    string
  }
  'section-cleared': {
    sectionId:   string
    blocksRemoved: number
  }

  // ── Page payloads ──────────────────────────────────────────────────────────
  'page-updated': {
    fields:      string[]
  }
  'page-theme-changed': {
    themeId:     string
    previousThemeId?: string
  }
  'page-seo-updated': {
    fields:      string[]
  }

  // ── Document lifecycle payloads ────────────────────────────────────────────
  'document-changed': {
    version:     number
    changeCount: number
  }
  'document-loaded': {
    pageId:      string
    version:     number
  }
  'document-saved': {
    pageId:      string
    version:     number
    status:      string
  }
  'document-published': {
    pageId:      string
    publishedAt: string
  }
  'document-reset': {
    pageId:      string
  }

  // ── Session payloads ───────────────────────────────────────────────────────
  'session-undo': {
    version:     number
  }
  'session-redo': {
    version:     number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Listener and subscription types
// ─────────────────────────────────────────────────────────────────────────────

/** A function that handles a specific or generic patch event. */
export type PatchEventListener<T extends PatchEventType = PatchEventType> =
  (event: PatchEvent<T>) => void

/**
 * Returned by `subscribe` and `on`.
 * Call it to remove the listener without holding a reference to the original function.
 */
export type Unsubscribe = () => void

/** Options for filtering which events a listener receives. */
export interface SubscribeOptions {
  /**
   * If provided, the listener only fires for events whose type matches
   * one of the listed types. Omit to receive all events.
   */
  filter?: PatchEventType[]
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — PatchEventBusPublic class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public event bus for patch lifecycle events.
 *
 * Distinct from the internal `PatchEventBus` in `./events.ts` which is
 * tightly coupled to PatchEngine. This bus is designed for loose coupling
 * with external consumers (AI, automation, plugins, analytics).
 */
class PatchEventBusPublic {
  private listeners = new Map<symbol, { fn: PatchEventListener; filter?: Set<PatchEventType> }>()

  /**
   * Subscribe to all patch events, or a filtered subset.
   *
   * @param listener  Called for each matching event.
   * @param options   Optional filter to receive only specific event types.
   * @returns         An unsubscribe function.
   *
   * @example
   *   const unsub = patchEventBus.subscribe(e => console.log(e.type))
   *   const unsub2 = patchEventBus.subscribe(
   *     e => console.log('block changed'),
   *     { filter: ['block-added', 'block-updated', 'block-removed'] }
   *   )
   */
  subscribe(listener: PatchEventListener, options?: SubscribeOptions): Unsubscribe {
    const key    = Symbol()
    const filter = options?.filter ? new Set(options.filter) : undefined
    this.listeners.set(key, { fn: listener, filter })
    return () => { this.listeners.delete(key) }
  }

  /**
   * Alias for `subscribe`. Subscribes to a single specific event type
   * with full payload typing.
   *
   * @example
   *   patchEventBus.on('block-added', e => console.log(e.payload.blockId))
   */
  on<T extends PatchEventType>(
    type:     T,
    listener: PatchEventListener<T>,
  ): Unsubscribe {
    return this.subscribe(listener as PatchEventListener, { filter: [type] })
  }

  /**
   * Emit an event to all matching listeners.
   * Errors thrown by individual listeners are caught and logged so they
   * cannot disrupt the emit loop or the calling code.
   *
   * @example
   *   patchEventBus.emit({
   *     type:    'block-added',
   *     payload: { blockId: 'b_001', blockType: 'hero', sectionId: 's_001' },
   *   })
   */
  emit<T extends PatchEventType>(
    event: Omit<PatchEvent<T>, 'context'> & { context?: Partial<PatchEventContext> },
  ): void {
    const full: PatchEvent<T> = {
      ...event,
      context: {
        timestamp: new Date().toISOString(),
        ...event.context,
      },
    } as PatchEvent<T>

    for (const { fn, filter } of this.listeners.values()) {
      if (filter && !filter.has(full.type as PatchEventType)) continue
      try {
        fn(full as PatchEvent)
      } catch (err) {
        // Listeners must not crash the emit loop
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[PatchEventBus] listener error:', err)
        }
      }
    }
  }

  /**
   * Returns a promise that resolves the next time the given event type fires.
   * Useful in tests and async automation flows.
   *
   * @example
   *   const event = await patchEventBus.once('document-saved')
   *   console.log(event.payload.version)
   */
  once<T extends PatchEventType>(type: T): Promise<PatchEvent<T>> {
    return new Promise(resolve => {
      const unsub = this.on(type, event => {
        unsub()
        resolve(event)
      })
    })
  }

  /** Total number of currently active listener subscriptions. */
  get listenerCount(): number {
    return this.listeners.size
  }

  /**
   * Remove all listeners.
   * Useful in test teardown to prevent cross-test contamination.
   */
  clear(): void {
    this.listeners.clear()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Singleton export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The application-wide Patch Event Bus singleton.
 *
 * Import this anywhere to subscribe to or emit patch lifecycle events:
 *
 *   import { patchEventBus } from '@/core/patch/eventBus'
 *
 * AI adapters, automation pipelines, and plugins should subscribe here
 * rather than directly to PatchEngine internals.
 */
export const patchEventBus = new PatchEventBusPublic()

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Convenience emit helpers
// ─────────────────────────────────────────────────────────────────────────────
//
// Pre-typed emit wrappers so callers don't need to construct full event
// objects manually. These are pure functions — no side effects beyond emit.

/** Convenience: emit a 'document-changed' event. */
export function emitDocumentChanged(version: number, changeCount = 1, source?: OperationSource): void {
  patchEventBus.emit({
    type:    'document-changed',
    payload: { version, changeCount },
    context: { source },
  })
}

/** Convenience: emit a 'block-added' event. */
export function emitBlockAdded(
  blockId:   string,
  blockType: string,
  sectionId: string,
  source?:   OperationSource,
): void {
  patchEventBus.emit({
    type:    'block-added',
    payload: { blockId, blockType, sectionId },
    context: { source },
  })
}

/** Convenience: emit a 'block-removed' event. */
export function emitBlockRemoved(
  blockId:   string,
  sectionId: string,
  source?:   OperationSource,
): void {
  patchEventBus.emit({
    type:    'block-removed',
    payload: { blockId, sectionId },
    context: { source },
  })
}

/** Convenience: emit a 'section-added' event. */
export function emitSectionAdded(
  sectionId:   string,
  sectionType: string,
  source?:     OperationSource,
): void {
  patchEventBus.emit({
    type:    'section-added',
    payload: { sectionId, sectionType },
    context: { source },
  })
}

/** Convenience: emit a 'document-saved' event. */
export function emitDocumentSaved(
  pageId:  string,
  version: number,
  status:  string,
  source?: OperationSource,
): void {
  patchEventBus.emit({
    type:    'document-saved',
    payload: { pageId, version, status },
    context: { source },
  })
}

/** Convenience: emit a 'document-published' event. */
export function emitDocumentPublished(
  pageId:      string,
  publishedAt: string,
  source?:     OperationSource,
): void {
  patchEventBus.emit({
    type:    'document-published',
    payload: { pageId, publishedAt },
    context: { source },
  })
}
