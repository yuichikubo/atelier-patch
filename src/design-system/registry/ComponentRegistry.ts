import type { BlockComponent } from '@/core/renderer/types'

export interface ComponentRegistryEntry {
  type:string; component:BlockComponent; label:string
  icon?:string; source:'built-in'|'plugin'; category?:string; pluginId?:string
}

class ComponentRegistryClass {
  private entries = new Map<string,ComponentRegistryEntry>()

  register(entry:ComponentRegistryEntry): void {
    if (this.entries.has(entry.type)) {
      const ex = this.entries.get(entry.type)!
      if (ex.source==='built-in' && entry.source==='plugin') throw new Error(`Cannot override built-in "${entry.type}"`)
    }
    this.entries.set(entry.type, Object.freeze({...entry}))
  }

  get(type:string): BlockComponent|null { return this.entries.get(type)?.component ?? null }
  has(type:string): boolean             { return this.entries.has(type) }
  getAll(): ComponentRegistryEntry[]    { return [...this.entries.values()] }
}

export const componentRegistry = new ComponentRegistryClass()

export function registerComponent(type:string, component:BlockComponent, options?:Omit<ComponentRegistryEntry,'type'|'component'>): void {
  componentRegistry.register({ type, component, label:options?.label??type, source:options?.source??'built-in', icon:options?.icon, category:options?.category, pluginId:options?.pluginId })
}
