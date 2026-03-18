export interface PatchEvents {
  'patch-applied':       { patch:unknown; version:number }
  'patch-rolled-back':   { patchId?:string; version:number }
  'patch-array-applied': { patchIds:string[]; count:number; version:number }
  'patch-array-failed':  { error:string }
  'section-added': {patch:unknown}; 'section-updated': {patch:unknown}
  'section-removed':{patch:unknown}; 'section-moved':  {patch:unknown}
  'block-added':   {patch:unknown}; 'block-updated':   {patch:unknown}
  'block-removed': {patch:unknown}; 'block-moved':     {patch:unknown}
  'page-updated':  {patch:unknown}
}

export type PatchEventName = keyof PatchEvents
type H<K extends PatchEventName> = (p:PatchEvents[K]) => void

export class PatchEventBus {
  private ls: Map<string,Set<H<any>>> = new Map()

  on<K extends PatchEventName>(event:K, h:H<K>): () => void {
    if (!this.ls.has(event)) this.ls.set(event, new Set())
    this.ls.get(event)!.add(h)
    return () => this.ls.get(event)?.delete(h)
  }
  emit<K extends PatchEventName>(event:K, p:PatchEvents[K]): void {
    this.ls.get(event)?.forEach(h => { try { h(p) } catch {} })
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(event, { detail:p }))
  }
  clear(): void { this.ls.clear() }
}
