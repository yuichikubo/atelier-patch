// stickmanController.ts
// Self-contained controller — reacts to the CustomEvents already fired
// by editorEvents.ts. No AI or flow-detection dependencies.

export type StickmanMood =
  | 'idle'
  | 'waving'
  | 'observing'
  | 'thinking'
  | 'celebrating'
  | 'helping'
  | 'excited'
  | 'sleeping'

export interface StickmanState {
  mood:       StickmanMood
  message:    string | null
  patchCount: number
  isOpen:     boolean
}

export interface StickmanControllerOptions {
  onStateChange: (state: StickmanState) => void
}

const GREETINGS = [
  'Add a block from the palette ✦',
  "Click a block to inspect it ✦",
  'Use Publish to go live ✦',
  'Save often with Ctrl+S ✦',
]

export class StickmanController {
  private state: StickmanState = {
    mood:       'waving',
    message:    'Hi! I\'m your assistant ✦',
    patchCount: 0,
    isOpen:     false,
  }

  private opts:         StickmanControllerOptions
  private moodTimer:    ReturnType<typeof setTimeout> | null = null
  private msgTimer:     ReturnType<typeof setTimeout> | null = null
  private idleTimer:    ReturnType<typeof setTimeout> | null = null
  private greetIdx     = 0
  private destroyed    = false
  private abortCtrl    = new AbortController()

  constructor(opts: StickmanControllerOptions) {
    this.opts = opts
    this.listenToEditorEvents()
    // Show greeting, then settle to idle
    setTimeout(() => this.setMessage('Hi! I\'m your assistant ✦', 3500), 400)
    this.resetIdleTimer()
  }

  // ── Wire to window CustomEvents ──────────────────────────────────────────

  private listenToEditorEvents(): void {
    const sig = this.abortCtrl.signal
    const add  = (ev: string, fn: (e: Event) => void) =>
      window.addEventListener(ev, fn, { signal: sig } as any)

    add('block-added', (e: Event) => {
      const type = (e as CustomEvent).detail?.type ?? 'Block'
      this.state.patchCount++
      this.react('block-added', type)
    })

    add('block-selected', (e: Event) => {
      const id = (e as CustomEvent).detail?.blockId
      if (id) this.react('block-selected')
    })

    add('section-select', () => this.react('section-selected'))

    add('save', () => {
      this.react('saved')
      this.state.patchCount = 0
    })

    add('publish', () => this.react('published'))
  }

  // ── React to events ──────────────────────────────────────────────────────

  react(event: string, label?: string): void {
    if (this.destroyed) return
    this.resetIdleTimer()

    switch (event) {
      case 'block-added':
        this.mood('celebrating', 1600)
        this.setMessage(`${label ?? 'Block'} added ✦`, 2000)
        break
      case 'block-selected':
        this.mood('observing', 1200)
        break
      case 'section-selected':
        this.mood('observing', 800)
        break
      case 'saved':
        this.mood('celebrating', 1800)
        this.setMessage('Saved ✓', 2200)
        break
      case 'published':
        this.mood('excited', 2400)
        this.setMessage('Published 🎉', 3000)
        break
    }
  }

  // ── Idle timer — switch to sleeping after 90 s of no events ─────────────

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.state.mood === 'sleeping') this.mood('idle', 0)
    this.idleTimer = setTimeout(() => {
      if (!this.state.isOpen) this.mood('sleeping', 0)
    }, 90_000)
  }

  // ── Cycling tip shown when avatar is clicked ─────────────────────────────

  showNextTip(): void {
    const msg = GREETINGS[this.greetIdx % GREETINGS.length]
    this.greetIdx++
    this.setMessage(msg, 4000)
    this.mood('helping', 4200)
  }

  togglePanel(): void {
    this.setState({ isOpen: !this.state.isOpen })
  }

  // ── State helpers ────────────────────────────────────────────────────────

  private mood(m: StickmanMood, autoClearMs: number): void {
    if (this.moodTimer) clearTimeout(this.moodTimer)
    this.setState({ mood: m })
    if (autoClearMs > 0) {
      this.moodTimer = setTimeout(() => this.setState({ mood: 'idle' }), autoClearMs)
    }
  }

  private setMessage(msg: string | null, autoClearMs: number): void {
    if (this.msgTimer) clearTimeout(this.msgTimer)
    this.setState({ message: msg })
    if (autoClearMs > 0 && msg !== null) {
      this.msgTimer = setTimeout(() => this.setState({ message: null }), autoClearMs)
    }
  }

  private setState(patch: Partial<StickmanState>): void {
    if (this.destroyed) return
    this.state = { ...this.state, ...patch }
    this.opts.onStateChange({ ...this.state })
  }

  getState(): Readonly<StickmanState> { return { ...this.state } }

  destroy(): void {
    this.destroyed = true
    this.abortCtrl.abort()
    if (this.moodTimer) clearTimeout(this.moodTimer)
    if (this.msgTimer)  clearTimeout(this.msgTimer)
    if (this.idleTimer) clearTimeout(this.idleTimer)
  }
}
