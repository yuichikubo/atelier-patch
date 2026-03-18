import type { Patch, AddPatch, UpdatePatch, RemovePatch, MovePatch, MoveBlockPatch, PatchArray, PatchArrayResult, PatchResult } from './types'
import type { Page, Section, Block } from '../document/types'
import { validatePatch, validatePatchArray } from './validation'
import { PatchHistoryStore } from './history'
import { PatchEventBus }     from './events'

function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return `${prefix}_${crypto.randomUUID().replace(/-/g,'').slice(0,12)}`
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming transaction state
// ─────────────────────────────────────────────────────────────────────────────

interface StreamTransaction {
  token:      string
  snapshot:   Page             // pre-stream document state for rollback
  patches:    Patch[]          // accumulates every successfully applied patch
}

export interface StreamPatchResult {
  ok:        boolean
  patchId:   string
  applied:   number            // running total
  error?:    string
}

export class PatchEngine {
  private subs:   Array<(doc:Page, version:number) => void> = []
  private stream: StreamTransaction | null = null

  constructor(
    private doc:  Page,
    private hist: PatchHistoryStore = new PatchHistoryStore(),
    private bus:  PatchEventBus     = new PatchEventBus(),
  ) {}

  enqueuePatch(raw: Patch): PatchResult {
    const patch = { ...raw, patchId: raw.patchId ?? uid('patch') }
    const check = validatePatch(patch)
    if (!check.valid) return { ok:false, patchId:patch.patchId!, patch, error:new Error(check.errors[0]?.message ?? 'Invalid patch') }
    const snap = this.snap()
    try {
      this.applyOne(patch)
      this.doc.version++
      this.doc.updatedAt = new Date().toISOString()
      this.hist.push(patch, snap)
      this.bus.emit('patch-applied', { patch, version:this.doc.version })
      this.emitTarget(patch)
      this.notify()
      return { ok:true, patchId:patch.patchId!, patch }
    } catch(e:unknown) {
      this.restore(snap)
      return { ok:false, patchId:patch.patchId!, patch, error:new Error(String(e)) }
    }
  }

  applyPatchArray(pa: PatchArray): PatchArrayResult {
    const errs = validatePatchArray(pa)
    if (errs.length) return { ok:false, results:[], applied:0, errors:errs as Error[] }
    const snap = this.snap(); const results: PatchResult[] = []
    try {
      for (const raw of pa.patch) {
        const p = { ...raw, patchId: raw.patchId ?? uid('patch') }
        this.applyOne(p); results.push({ ok:true, patchId:p.patchId!, patch:p })
      }
      this.doc.version++; this.doc.updatedAt = new Date().toISOString()
      this.hist.pushBatch(results.map(r=>r.patch), snap)
      this.bus.emit('patch-applied', { patch: results[results.length-1]?.patch, version:this.doc.version })
      this.notify()
      return { ok:true, results, applied:results.length, errors:[] }
    } catch(e:unknown) {
      this.restore(snap); this.bus.emit('patch-array-failed',{error:String(e)})
      return { ok:false, results:[], applied:0, errors:[new Error(String(e))] }
    }
  }

  // ── Streaming transaction API ─────────────────────────────────────────────
  //
  // Used by the AI streaming pipeline.
  //
  // Contract:
  //   1. beginStream()       — snapshot pre-stream state, open transaction
  //   2. applyStreamPatch()  — validate + apply to document + notify canvas
  //                            (NO history recording yet)
  //   3. commitStream()      — record entire batch as ONE history entry (one undo step)
  //      OR abortStream()    — restore pre-stream snapshot, discard all stream patches
  //
  // The patch invariant is maintained: every mutation still goes through applyOne().
  // History recording is deferred to commitStream() to produce a single undo batch.

  /**
   * Open a streaming transaction.
   * Returns a token that must be passed to subsequent stream methods.
   * Throws if a stream is already open.
   */
  beginStream(): string {
    if (this.stream) throw new Error('[PatchEngine] A stream transaction is already open')
    const token = uid('stream')
    this.stream = { token, snapshot: this.snap(), patches: [] }
    return token
  }

  /**
   * Apply a single patch within an open stream transaction.
   * Validates the patch, applies it to the document, and notifies subscribers
   * (canvas updates immediately). Does NOT record to history.
   *
   * If validation or application fails, the stream is NOT automatically aborted —
   * the caller must call abortStream() to roll back.
   */
  applyStreamPatch(token: string, raw: Patch): StreamPatchResult {
    if (!this.stream || this.stream.token !== token) {
      return { ok: false, patchId: '', applied: 0, error: 'No open stream transaction with this token' }
    }

    const patch = { ...raw, patchId: raw.patchId ?? uid('patch') }
    const check = validatePatch(patch)
    if (!check.valid) {
      // Fail closed — invalid patch aborts the entire stream
      this.abortStream(token)
      return { ok: false, patchId: patch.patchId!, applied: 0, error: check.errors[0]?.message ?? 'Invalid patch' }
    }

    try {
      this.applyOne(patch)
      this.doc.version++
      this.doc.updatedAt = new Date().toISOString()
      this.stream.patches.push(patch)
      this.bus.emit('patch-applied', { patch, version: this.doc.version })
      this.emitTarget(patch)
      this.notify()
      return { ok: true, patchId: patch.patchId!, applied: this.stream.patches.length }
    } catch (e: unknown) {
      // Fail closed — applyOne failure aborts the stream and restores pre-stream state
      this.abortStream(token)
      return { ok: false, patchId: patch.patchId!, applied: 0, error: String(e) }
    }
  }

  /**
   * Commit a stream transaction.
   * Records all accumulated stream patches as a SINGLE history batch.
   * One undo step reverts the entire stream.
   */
  commitStream(token: string): { ok: boolean; applied: number; error?: string } {
    if (!this.stream || this.stream.token !== token) {
      return { ok: false, applied: 0, error: 'No open stream transaction with this token' }
    }

    const { snapshot, patches } = this.stream
    this.stream = null

    if (patches.length === 0) return { ok: true, applied: 0 }

    // Record the full batch as one history entry using the pre-stream snapshot
    this.hist.pushBatch(patches, snapshot)
    this.bus.emit('patch-applied', { patch: patches[patches.length - 1], version: this.doc.version })

    return { ok: true, applied: patches.length }
  }

  /**
   * Abort a stream transaction.
   * Restores the document to the pre-stream snapshot.
   * All canvas changes from the stream are reverted.
   */
  abortStream(token: string): void {
    if (!this.stream || this.stream.token !== token) return
    const { snapshot } = this.stream
    this.stream = null
    this.restore(snapshot)
    this.notify()
    this.bus.emit('patch-array-failed', { error: 'Stream aborted' })
  }

  /** Whether a streaming transaction is currently open. */
  get isStreaming(): boolean { return this.stream !== null }

  loadDocument(doc: Page): void { this.doc=structuredClone(doc); this.hist.clear(); this.notify() }
  getDocument(): Page   { return this.doc }
  getVersion():  number { return this.doc.version }

  /** Top of the undo stack — read-only, does not pop. */
  peekUndo() { return this.hist.peekUndo() }
  /** Top of the redo stack — read-only, does not pop. */
  peekRedo() { return this.hist.peekRedo() }

  subscribe(fn:(doc:Page,version:number)=>void): ()=>void {
    this.subs.push(fn)
    return () => { this.subs = this.subs.filter(l=>l!==fn) }
  }

  undo(): boolean {
    const e=this.hist.pop(); if(!e) return false
    this.restore(e.snapshot as Page); this.doc.version=Math.max(0,this.doc.version-1)
    this.bus.emit('patch-rolled-back',{patchId:e.patch.patchId, version:this.doc.version})
    this.notify(); return true
  }
  redo(): boolean {
    const e=this.hist.forward(); if(!e) return false
    const patches = (e.isBatch && e.patches?.length) ? e.patches : [e.patch]
    // Snapshot before redo so a partial failure can roll back cleanly
    const snap = this.snap()
    try {
      for (const p of patches) this.applyOne(p)
      this.doc.version++; this.notify(); return true
    } catch {
      this.restore(snap)
      // Put the entry back so the user can try again after fixing the document
      this.hist.forward()   // undo the pop that forward() did
      return false
    }
  }

  private applyOne(p:Patch): void {
    switch(p.op) {
      case 'add':        this.execAdd(p as AddPatch);             break
      case 'update':     this.execUpdate(p as UpdatePatch);       break
      case 'remove':     this.execRemove(p as RemovePatch);       break
      case 'move':       this.execMoveSection(p as MovePatch);    break
      case 'move-block': this.execMoveBlock(p as MoveBlockPatch); break
    }
  }

  private execAdd(p:AddPatch): void {
    // If the caller supplied a stable id in data.id, reuse it — this allows
    // PatchBuilder, HTMLImporter, and SuggestionRules to pre-coordinate
    // section ids before calling applyPatchArray (e.g. placeholder resolution).
    const id = (p.data as any)?.id ?? uid(p.target)
    const { placement, ref, index } = p.position
    if (p.target==='section') {
      const s:Section = { id, type:(p.data.type as string)?? 'blank', settings:(p.data.settings as any)??{}, blocks:[], order:0 }
      this.ins(this.doc.sections, s, placement, ref, index); this.reorder(this.doc.sections); return
    }
    if (p.target==='block') {
      const { parentSectionId, ...bd } = p.data as any
      const sec = this.doc.sections.find(s=>s.id===parentSectionId)
      if (!sec) throw new Error(`Section "${parentSectionId}" not found`)
      const b:Block = { id, type:bd.type??'text', content:bd.content??{}, settings:bd.settings??{}, order:0 }
      this.ins(sec.blocks, b, placement, ref, index); this.reorder(sec.blocks)
    }
  }

  private execUpdate(p:UpdatePatch): void {
    if (p.target==='page') {
      // Allowlist: only these fields may be set via a patch.
      // Internal fields (workspaceId, id, createdAt, status via publish flow, etc.)
      // must never be patchable by AI or editor components.
      const SAFE_PAGE_FIELDS = new Set(['title','slug','seo','themeId'])
      const safe = Object.fromEntries(
        Object.entries(p.data as Record<string,unknown>).filter(([k]) => SAFE_PAGE_FIELDS.has(k))
      )
      Object.assign(this.doc, safe)
      return
    }
    if (p.target==='section') {
      const s=this.doc.sections.find(s=>s.id===p.id); if(!s) throw new Error(`Section "${p.id}" not found`)
      Object.assign(s, p.data); return
    }
    if (p.target==='block') {
      const b=this.findBlock(p.id); if(!b) throw new Error(`Block "${p.id}" not found`)
      if (p.data.content) b.content = { ...b.content, ...(p.data.content as any) }
      Object.assign(b, { ...p.data, content:b.content })
    }
  }

  private execRemove(p:RemovePatch): void {
    if (p.target==='section') {
      const i=this.doc.sections.findIndex(s=>s.id===p.id); if(i<0) throw new Error(`Section "${p.id}" not found`)
      this.doc.sections.splice(i,1); this.reorder(this.doc.sections); return
    }
    if (p.target==='block') {
      for (const sec of this.doc.sections) {
        const i=sec.blocks.findIndex(b=>b.id===p.id)
        if (i>=0) { sec.blocks.splice(i,1); this.reorder(sec.blocks); return }
      }
      throw new Error(`Block "${p.id}" not found`)
    }
  }

  private execMoveSection(p:MovePatch): void {
    const i=this.doc.sections.findIndex(s=>s.id===p.id); if(i<0) throw new Error(`Section "${p.id}" not found`)
    const [s]=this.doc.sections.splice(i,1)
    this.ins(this.doc.sections, s, p.position.placement, p.position.ref, p.position.index)
    this.reorder(this.doc.sections)
  }

  private execMoveBlock(p:MoveBlockPatch): void {
    const from=this.doc.sections.find(s=>s.id===p.fromSection)
    if (!from) throw new Error(`fromSection "${p.fromSection}" not found`)
    const bi=from.blocks.findIndex(b=>b.id===p.blockId); if(bi<0) throw new Error(`block "${p.blockId}" not found`)
    const [block]=from.blocks.splice(bi,1)
    const to = p.fromSection===p.toSection ? from : this.doc.sections.find(s=>s.id===p.toSection)
    if (!to) { from.blocks.splice(bi,0,block); throw new Error(`toSection "${p.toSection}" not found`) }
    this.ins(to.blocks, block, p.position.placement, p.position.ref, p.position.index)
    this.reorder(from.blocks); if(from!==to) this.reorder(to.blocks)
  }

  private ins<T extends {id:string}>(arr:T[], item:T, pl:string, ref?:string, idx?:number): void {
    switch(pl) {
      case 'start':  arr.unshift(item); break
      case 'end':    arr.push(item);    break
      case 'before': { const i=arr.findIndex(x=>x.id===ref); arr.splice(Math.max(0,i),0,item); break }
      case 'after':  { const i=arr.findIndex(x=>x.id===ref); arr.splice(i+1,0,item); break }
      case 'index':  { arr.splice(Math.max(0,Math.min(idx??0,arr.length)),0,item); break }
      default: arr.push(item)
    }
  }
  private reorder(arr:Array<{order:number}>): void { arr.forEach((x,i)=>{x.order=i}) }
  private findBlock(id:string): Block|undefined {
    for (const s of this.doc.sections) { const b=s.blocks.find(b=>b.id===id); if(b) return b }
  }
  private snap():Page { return structuredClone(this.doc) }
  private restore(s:unknown): void { Object.assign(this.doc, s as Page) }
  private notify(): void { for(const fn of this.subs){try{fn(this.doc,this.doc.version)}catch{}} }

  private emitTarget(p:Patch): void {
    const m:Record<string,string> = {
      'add:section':'section-added','add:block':'block-added',
      'update:section':'section-updated','update:block':'block-updated','update:page':'page-updated',
      'remove:section':'section-removed','remove:block':'block-removed',
      'move:section':'section-moved','move-block:block':'block-moved',
    }
    const k = p.op==='move-block' ? 'move-block:block' : `${p.op}:${'target' in p?(p as any).target:'block'}`
    const ev = m[k]; if(ev) this.bus.emit(ev as any,{patch:p})
  }
}
