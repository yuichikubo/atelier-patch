/**
 * ATELIER CMS — Selection Store
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * SelectionStore is the single source of truth for editor UI selection state.
 * It tracks which block, section, and hovered element are currently active in
 * the editor canvas — without touching the Document model or PatchEngine.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This store manages EDITOR STATE only — it never modifies document data.
 * • PatchEngine, DocumentRepository, and the Renderer are completely unaware
 *   of this store's existence.
 * • The store auto-syncs with existing window CustomEvents fired by
 *   `editorEvents.ts` so legacy event-driven code and store subscribers
 *   always see the same selection state — with no changes to editorEvents.ts.
 * • React components use the exported `useSelectionStore` hook.
 * • Non-React code (AI, automation, plugins) uses `subscribe` directly.
 *
 * RELATIONSHIP TO EXISTING SELECTION
 * ────────────────────────────────────
 * The editor page currently manages selection via React useState:
 *   const [selBlock, setSelBlock] = useState<string|undefined>()
 *   const [selSec,   setSelSec]   = useState<string|undefined>()
 *
 * This store is the next step — a standalone, framework-agnostic store that
 * all subsystems can read from and write to. React components can gradually
 * migrate to use `useSelectionStore` instead of prop-drilling.
 *
 * USAGE — React
 * ─────────────
 *   const { selectedBlockId } = useSelectionStore()
 *   selectionStore.selectBlock('block_abc', 'click')
 *
 * USAGE — Non-React
 * ─────────────────
 *   const unsub = selectionStore.subscribe(state => {
 *     console.log('selected block:', state.selectedBlockId)
 *   })
 *   selectionStore.selectBlock('block_abc', 'programmatic')
 *   unsub()
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Selection types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What triggered a selection change.
 * Used by the inspector and AI adapter to adjust their behaviour.
 */
export type SelectionSource =
  | 'click'          // User clicked directly on a block or section
  | 'keyboard'       // Keyboard navigation (Tab, arrow keys)
  | 'programmatic'   // Code-driven selection (AI, automation, tests)
  | 'event'          // Synced from a window CustomEvent

/**
 * Editor element types that can hold selection.
 */
export type SelectionTarget = 'block' | 'section' | 'none'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Selection state interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete snapshot of editor selection state.
 * All fields are nullable — `null` means nothing is selected/hovered.
 */
export interface SelectionState {
  // ── Primary selection ──────────────────────────────────────────────────────

  /** The currently selected block id, or null. */
  selectedBlockId:    string | null

  /** The currently selected section id, or null. */
  selectedSectionId:  string | null

  // ── Hover state ────────────────────────────────────────────────────────────

  /** Block id the cursor is currently hovering over, or null. */
  hoveredBlockId:     string | null

  /** Section id the cursor is currently hovering over, or null. */
  hoveredSectionId:   string | null

  // ── Selection metadata ─────────────────────────────────────────────────────

  /** What triggered the most recent selection change. */
  selectionSource:    SelectionSource | null

  /**
   * Which target type is currently focused.
   * Derived from selectedBlockId / selectedSectionId — provided for
   * convenience so consumers don't have to check both.
   */
  focusedTarget:      SelectionTarget

  /**
   * ISO timestamp of the last selection change.
   * Useful for animation sequencing and analytics.
   */
  lastChangedAt:      string | null

  // ── Multi-select (future) ──────────────────────────────────────────────────

  /**
   * Whether multi-select mode is active.
   * Reserved for future drag-select / Shift+click interactions.
   */
  isMultiSelect:      boolean

  /**
   * All block ids selected when `isMultiSelect` is true.
   * In single-select mode this contains at most one entry.
   */
  multiSelectedBlockIds: ReadonlySet<string>
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Listener and subscription types
// ─────────────────────────────────────────────────────────────────────────────

/** A function called whenever selection state changes. */
export type SelectionListener = (state: Readonly<SelectionState>) => void

/** Call to remove a listener without holding a reference to it. */
export type SelectionUnsubscribe = () => void

/** Options for `selectBlock` and `selectSection`. */
export interface SelectOptions {
  /** What triggered the selection. Defaults to 'programmatic'. */
  source?:    SelectionSource
  /**
   * If true, selecting a block will NOT auto-clear the section selection.
   * Defaults to false — block selection clears section selection by default.
   */
  keepSection?: boolean
  /**
   * If true, selecting a section will NOT auto-clear the block selection.
   * Defaults to false — section selection clears block selection by default.
   */
  keepBlock?:   boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Initial state factory
// ─────────────────────────────────────────────────────────────────────────────

function createInitialState(): SelectionState {
  return {
    selectedBlockId:       null,
    selectedSectionId:     null,
    hoveredBlockId:        null,
    hoveredSectionId:      null,
    selectionSource:       null,
    focusedTarget:         'none',
    lastChangedAt:         null,
    isMultiSelect:         false,
    multiSelectedBlockIds: new Set<string>(),
  }
}

function deriveFocusedTarget(state: SelectionState): SelectionTarget {
  if (state.selectedBlockId)   return 'block'
  if (state.selectedSectionId) return 'section'
  return 'none'
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — SelectionStore class
// ─────────────────────────────────────────────────────────────────────────────

class SelectionStore {
  private _state:      SelectionState = createInitialState()
  private _listeners:  Map<symbol, SelectionListener> = new Map()
  private _windowListenersAttached = false

  constructor() {
    // Attach window event listeners lazily — only in browser environments
    if (typeof window !== 'undefined') {
      this._attachWindowListeners()
    }
  }

  // ── State accessors ────────────────────────────────────────────────────────

  /**
   * Returns the current selection state snapshot.
   * The returned object is frozen — mutating it has no effect.
   */
  getState(): Readonly<SelectionState> {
    return this._state
  }

  /**
   * Returns a snapshot reference — compatible with React `useSyncExternalStore`.
   * A new object reference is created on every state change, satisfying
   * React's referential equality check.
   */
  getSnapshot(): Readonly<SelectionState> {
    return this._state
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  /**
   * Subscribe to all selection state changes.
   *
   * @param listener  Called synchronously after every state change.
   * @returns         An unsubscribe function.
   *
   * @example
   *   const unsub = selectionStore.subscribe(state => {
   *     inspector.setBlock(state.selectedBlockId)
   *   })
   */
  subscribe(listener: SelectionListener): SelectionUnsubscribe {
    const key = Symbol()
    this._listeners.set(key, listener)
    return () => { this._listeners.delete(key) }
  }

  // ── Selection actions ──────────────────────────────────────────────────────

  /**
   * Select a block by id.
   * By default, clears section selection so only one target is active.
   *
   * Fires the `block-selected` CustomEvent so existing window listeners
   * (including the Stickman controller) remain in sync.
   *
   * @example
   *   selectionStore.selectBlock('block_abc', { source: 'click' })
   */
  selectBlock(blockId: string | null, options: SelectOptions = {}): void {
    const { source = 'programmatic', keepSection = false } = options
    const next: SelectionState = {
      ...this._state,
      selectedBlockId:   blockId,
      selectedSectionId: keepSection ? this._state.selectedSectionId : null,
      selectionSource:   source,
      lastChangedAt:     new Date().toISOString(),
      // Update multi-select set
      multiSelectedBlockIds: blockId
        ? new Set([blockId])
        : new Set<string>(),
    }
    next.focusedTarget = deriveFocusedTarget(next)
    this._commit(next)

    // Mirror to window so existing editorEvents listeners stay in sync
    if (typeof window !== 'undefined' && source !== 'event') {
      window.dispatchEvent(
        new CustomEvent('block-selected', { detail: { blockId } }),
      )
    }
  }

  /**
   * Select a section by id.
   * By default, clears block selection so only one target is active.
   *
   * Fires the `section-select` CustomEvent so existing window listeners
   * remain in sync.
   *
   * @example
   *   selectionStore.selectSection('section_xyz', { source: 'click' })
   */
  selectSection(sectionId: string | null, options: SelectOptions = {}): void {
    const { source = 'programmatic', keepBlock = false } = options
    const next: SelectionState = {
      ...this._state,
      selectedSectionId: sectionId,
      selectedBlockId:   keepBlock ? this._state.selectedBlockId : null,
      selectionSource:   source,
      lastChangedAt:     new Date().toISOString(),
      multiSelectedBlockIds: keepBlock
        ? this._state.multiSelectedBlockIds
        : new Set<string>(),
    }
    next.focusedTarget = deriveFocusedTarget(next)
    this._commit(next)

    // Mirror to window so existing listeners stay in sync
    if (typeof window !== 'undefined' && source !== 'event' && sectionId) {
      window.dispatchEvent(
        new CustomEvent('section-select', { detail: { sectionId } }),
      )
    }
  }

  /**
   * Clear all selection state.
   * Deselects the current block and section, clears hover state.
   *
   * @example
   *   selectionStore.clearSelection()  // on canvas background click
   */
  clearSelection(source: SelectionSource = 'programmatic'): void {
    const next: SelectionState = {
      ...createInitialState(),
      hoveredBlockId:   this._state.hoveredBlockId,
      hoveredSectionId: this._state.hoveredSectionId,
      selectionSource:  source,
      lastChangedAt:    new Date().toISOString(),
    }
    this._commit(next)
  }

  // ── Hover actions ──────────────────────────────────────────────────────────

  /**
   * Set the currently hovered block id.
   * Pass `null` to clear block hover.
   */
  hoverBlock(blockId: string | null): void {
    if (this._state.hoveredBlockId === blockId) return   // no-op if unchanged
    this._commit({ ...this._state, hoveredBlockId: blockId })
  }

  /**
   * Set the currently hovered section id.
   * Pass `null` to clear section hover.
   */
  hoverSection(sectionId: string | null): void {
    if (this._state.hoveredSectionId === sectionId) return
    this._commit({ ...this._state, hoveredSectionId: sectionId })
  }

  // ── Multi-select (reserved for future use) ─────────────────────────────────

  /**
   * Enable multi-select mode and add a block to the selection set.
   * Reserved for Shift+click and drag-select interactions.
   */
  addToMultiSelect(blockId: string): void {
    const next = new Set(this._state.multiSelectedBlockIds)
    next.add(blockId)
    this._commit({
      ...this._state,
      isMultiSelect:         true,
      multiSelectedBlockIds: next,
      selectedBlockId:       blockId,   // most recently added is "primary"
      selectionSource:       'click',
      lastChangedAt:         new Date().toISOString(),
    })
  }

  /**
   * Remove a block from the multi-select set.
   * Exits multi-select mode automatically if the set becomes empty.
   */
  removeFromMultiSelect(blockId: string): void {
    const next = new Set(this._state.multiSelectedBlockIds)
    next.delete(blockId)
    const primary = next.size > 0 ? [...next][next.size - 1] : null
    this._commit({
      ...this._state,
      isMultiSelect:         next.size > 0,
      multiSelectedBlockIds: next,
      selectedBlockId:       primary,
      selectionSource:       'programmatic',
      lastChangedAt:         new Date().toISOString(),
    })
  }

  /** Exit multi-select mode and revert to single-select. */
  exitMultiSelect(): void {
    const primary = this._state.selectedBlockId
    this._commit({
      ...this._state,
      isMultiSelect:         false,
      multiSelectedBlockIds: primary ? new Set([primary]) : new Set<string>(),
      selectionSource:       'programmatic',
    })
  }

  // ── Low-level state update ─────────────────────────────────────────────────

  /**
   * Merge a partial state update into the current state.
   * Prefer the typed action methods above — use this only when a more
   * specific method doesn't exist.
   */
  setState(patch: Partial<SelectionState>): void {
    const next: SelectionState = {
      ...this._state,
      ...patch,
      lastChangedAt: new Date().toISOString(),
    }
    next.focusedTarget = deriveFocusedTarget(next)
    this._commit(next)
  }

  /**
   * Reset the store to its initial empty state.
   * Useful on page navigation or editor teardown.
   */
  reset(): void {
    this._commit(createInitialState())
  }

  // ── Window event bridging ──────────────────────────────────────────────────

  /**
   * Listen to existing window CustomEvents fired by editorEvents.ts and
   * mirror them into the store so both systems stay in sync.
   *
   * Called automatically in browser environments. Safe to call again —
   * duplicate attachment is guarded by `_windowListenersAttached`.
   */
  attachWindowListeners(): void {
    if (typeof window === 'undefined' || this._windowListenersAttached) return
    this._attachWindowListeners()
  }

  private _attachWindowListeners(): void {
    if (this._windowListenersAttached) return
    this._windowListenersAttached = true

    // editorEvents.blockSelected(id) → update selectedBlockId
    window.addEventListener('block-selected', (e: Event) => {
      const blockId = (e as CustomEvent).detail?.blockId ?? null
      // Use source:'event' to prevent re-emitting the CustomEvent (infinite loop)
      this.selectBlock(blockId, { source: 'event', keepSection: false })
    })

    // editorEvents.sectionSelect(id) → update selectedSectionId
    window.addEventListener('section-select', (e: Event) => {
      const sectionId = (e as CustomEvent).detail?.sectionId ?? null
      this.selectSection(sectionId, { source: 'event', keepBlock: false })
    })

    // block-removed → clear selection if the removed block was selected
    window.addEventListener('block-removed', (e: Event) => {
      const blockId = (e as CustomEvent).detail?.blockId
      if (blockId && this._state.selectedBlockId === blockId) {
        this.selectBlock(null, { source: 'event' })
      }
    })

    // section-removed → clear selection if the removed section was selected
    window.addEventListener('section-removed', (e: Event) => {
      const sectionId = (e as CustomEvent).detail?.sectionId
      if (sectionId && this._state.selectedSectionId === sectionId) {
        this.selectSection(null, { source: 'event' })
      }
    })
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private _commit(next: SelectionState): void {
    this._state = Object.freeze(next)
    this._notify()
  }

  private _notify(): void {
    for (const listener of this._listeners.values()) {
      try { listener(this._state) } catch {}
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Singleton export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The application-wide Selection Store singleton.
 *
 * Import anywhere that needs to read or change editor selection:
 *
 *   import { selectionStore } from '@/core/editor/selectionStore'
 *
 * React components should use the `useSelectionStore` hook below instead
 * of calling `subscribe` manually.
 */
export const selectionStore = new SelectionStore()

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — React hook (framework-agnostic implementation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook — subscribe to the selection store with automatic re-renders.
 *
 * Uses the React 18 `useSyncExternalStore` API for concurrent-safe
 * subscription. Falls back gracefully in React 16/17 environments.
 *
 * Must be called inside a React component or hook.
 *
 * @example
 *   function MyComponent() {
 *     const { selectedBlockId, hoveredBlockId } = useSelectionStore()
 *     return <div data-selected={!!selectedBlockId} />
 *   }
 *
 * For a subset of state to avoid unnecessary re-renders:
 *   const selectedBlockId = useSelectionStore(s => s.selectedBlockId)
 */
export function useSelectionStore(): Readonly<SelectionState>
export function useSelectionStore<T>(selector: (state: Readonly<SelectionState>) => T): T
export function useSelectionStore<T>(
  selector?: (state: Readonly<SelectionState>) => T,
): Readonly<SelectionState> | T {
  // Dynamic React import — keeps this file free of a React peer dependency
  // while still providing a first-class hook experience.
  // If React is not available (e.g. server-side non-Next context), fall back
  // to returning the current snapshot directly.
  let useSyncExternalStore: typeof import('react').useSyncExternalStore | undefined

  try {
    // Tree-shaking-safe dynamic require — bundler resolves this at build time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    useSyncExternalStore = (require('react') as typeof import('react')).useSyncExternalStore
  } catch {
    // React not available — return snapshot (no reactivity outside React)
    const snap = selectionStore.getSnapshot()
    return selector ? selector(snap) : snap
  }

  if (!useSyncExternalStore) {
    const snap = selectionStore.getSnapshot()
    return selector ? selector(snap) : snap
  }

  if (selector) {
    // Selector overload — only re-render when the selected slice changes
    return useSyncExternalStore(
      selectionStore.subscribe.bind(selectionStore),
      () => selector(selectionStore.getSnapshot()),
      () => selector(selectionStore.getSnapshot()),
    )
  }

  return useSyncExternalStore(
    selectionStore.subscribe.bind(selectionStore),
    selectionStore.getSnapshot.bind(selectionStore),
    selectionStore.getSnapshot.bind(selectionStore),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Convenience selector exports
// ─────────────────────────────────────────────────────────────────────────────

/** Returns the currently selected block id, or null. */
export const getSelectedBlockId    = (): string | null => selectionStore.getState().selectedBlockId

/** Returns the currently selected section id, or null. */
export const getSelectedSectionId  = (): string | null => selectionStore.getState().selectedSectionId

/** Returns the currently hovered block id, or null. */
export const getHoveredBlockId     = (): string | null => selectionStore.getState().hoveredBlockId

/** Returns the currently hovered section id, or null. */
export const getHoveredSectionId   = (): string | null => selectionStore.getState().hoveredSectionId

/** Returns true if a block or section is currently selected. */
export const hasSelection = (): boolean =>
  selectionStore.getState().focusedTarget !== 'none'
