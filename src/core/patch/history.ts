import type { Patch } from './types'

export interface PatchHistoryEntry {
  patchId:    string
  patch:      Patch          // representative patch (first of batch) — used by engine for bus.emit
  patches?:   Patch[]        // full batch — present only for batch entries, used by redo
  snapshot:   unknown
  appliedAt:  string
  isBatch:    boolean
}

export class PatchHistoryStore {
  private undo: PatchHistoryEntry[] = []
  private redo: PatchHistoryEntry[] = []
  private max: number

  constructor(historyDepth?: number) {
    const envDepth = typeof process !== 'undefined'
      ? parseInt(process.env.ATELIER_HISTORY_DEPTH ?? '', 10)
      : NaN
    this.max = historyDepth ?? (Number.isFinite(envDepth) && envDepth > 0 ? envDepth : 100)
  }

  push(patch:Patch, snapshot:unknown): void {
    this.undo.push({ patchId:patch.patchId??'', patch, snapshot, appliedAt:new Date().toISOString(), isBatch:false })
    this.redo = []
    if (this.undo.length > this.max) this.undo = this.undo.slice(-this.max)
  }

  /**
   * Store the entire batch as ONE history entry.
   * Undo restores the pre-batch snapshot in a single pop.
   * Redo re-applies all patches in order via the patches[] array.
   */
  pushBatch(patches:Patch[], snapshot:unknown): void {
    if (patches.length === 0) return
    this.undo.push({
      patchId:   patches[0].patchId ?? '',
      patch:     patches[0],          // representative — used for bus.emit on undo
      patches,                        // full list — used for redo in engine
      snapshot,
      appliedAt: new Date().toISOString(),
      isBatch:   true,
    })
    this.redo = []
    if (this.undo.length > this.max) this.undo = this.undo.slice(-this.max)
  }

  pop(): PatchHistoryEntry|undefined    { const e=this.undo.pop(); if(e)this.redo.push(e); return e }
  forward(): PatchHistoryEntry|undefined{ const e=this.redo.pop(); if(e)this.undo.push(e); return e }
  peekUndo(): PatchHistoryEntry|undefined { return this.undo[this.undo.length - 1] }
  peekRedo(): PatchHistoryEntry|undefined { return this.redo[this.redo.length - 1] }
  canUndo(): boolean { return this.undo.length>0 }
  canRedo(): boolean { return this.redo.length>0 }
  clear(): void      { this.undo=[]; this.redo=[] }
}
