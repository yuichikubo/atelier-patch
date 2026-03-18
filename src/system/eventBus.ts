// Tiny in-process pub/sub that also mirrors events to window.CustomEvent
// so both server-safe imports and browser listeners can coexist.

type Handler = (detail: unknown) => void

class EventBus {
  private listeners = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return () => this.listeners.get(event)?.delete(handler)
  }

  emit(event: string, payload?: unknown): void {
    this.listeners.get(event)?.forEach(h => { try { h(payload) } catch {} })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(event, { detail: payload }))
    }
  }
}

const bus = new EventBus()

export const emit = (event: string, payload?: unknown): void => bus.emit(event, payload)
export const on   = (event: string, handler: Handler): (() => void) => bus.on(event, handler)
