export type PatchOperation = 'add'|'update'|'remove'|'move'|'move-block'
export type PatchTarget    = 'page'|'section'|'block'|'asset'
export type PatchPosition  = 'start'|'end'|'before'|'after'|'index'
export type PatchSource    = 'editor'|'ai'|'automation'|'plugin'

export interface PatchMeta {
  source?: PatchSource; timestamp?: string; pluginId?: string; userId?: string
  [key: string]: unknown
}
export interface PatchPositionDescriptor { placement: PatchPosition; ref?: string; index?: number }

export interface AddPatch      { patchId?: string; op:'add';        target:PatchTarget; data:Record<string,unknown>; position:PatchPositionDescriptor; meta?: PatchMeta }
export interface UpdatePatch   { patchId?: string; op:'update';     target:PatchTarget; id:string; data:Record<string,unknown>; meta?: PatchMeta }
export interface RemovePatch   { patchId?: string; op:'remove';     target:PatchTarget; id:string; meta?: PatchMeta }
export interface MovePatch     { patchId?: string; op:'move';       target:PatchTarget; id:string; position:PatchPositionDescriptor; meta?: PatchMeta }
export interface MoveBlockPatch{ patchId?: string; op:'move-block'; blockId:string; fromSection:string; toSection:string; position:PatchPositionDescriptor; meta?: PatchMeta }

export type Patch = AddPatch|UpdatePatch|RemovePatch|MovePatch|MoveBlockPatch

export interface PatchArray       { patch: Patch[]; meta?: PatchMeta }
export interface PatchResult      { ok:boolean; patchId:string; patch:Patch; error?: Error }
export interface PatchArrayResult { ok:boolean; results:PatchResult[]; applied:number; errors:Error[] }
