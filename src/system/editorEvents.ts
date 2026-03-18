export const editorEvents = {
  blockAdded(type:string): void {
    if (typeof window==='undefined') return
    window.dispatchEvent(new CustomEvent('block-added',{ detail:{ type } }))
  },
  blockSelected(id:string|null): void {
    if (typeof window==='undefined') return
    window.dispatchEvent(new CustomEvent('block-selected',{ detail:{ blockId:id } }))
  },
  sectionSelect(id:string): void {
    if (typeof window==='undefined') return
    window.dispatchEvent(new CustomEvent('section-select',{ detail:{ sectionId:id } }))
  },
  save(): void {
    if (typeof window==='undefined') return
    window.dispatchEvent(new CustomEvent('save'))
  },
  publish(): void {
    if (typeof window==='undefined') return
    window.dispatchEvent(new CustomEvent('publish'))
  },
}
