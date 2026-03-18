import type { Patch, PatchArray } from './types'

export class PatchValidationError extends Error {
  constructor(message:string, public code:string) { super(message); this.name='PatchValidationError' }
}
export interface ValidationResult { valid:boolean; errors:PatchValidationError[]; warnings:string[] }

const VALID_OPS     = new Set(['add','update','remove','move','move-block'])
const VALID_TARGETS = new Set(['page','section','block','asset'])

export function validatePatch(patch:unknown): ValidationResult {
  const errors: PatchValidationError[] = []
  const p = patch as Record<string,unknown>
  if (!p.op)                              errors.push(new PatchValidationError('Missing op','MISSING_OP'))
  else if (!VALID_OPS.has(String(p.op))) errors.push(new PatchValidationError(`Invalid op "${p.op}"`,'INVALID_OP'))
  if (p.op !== 'move-block') {
    if (!p.target)                               errors.push(new PatchValidationError('Missing target','MISSING_TARGET'))
    else if (!VALID_TARGETS.has(String(p.target))) errors.push(new PatchValidationError(`Invalid target "${p.target}"`,'INVALID_TARGET'))
  }
  if (p.op==='update'||p.op==='remove'||p.op==='move') {
    if (!p.id) errors.push(new PatchValidationError(`${p.op} requires id`,'MISSING_ID'))
  }
  if (p.op==='add' && !p.position) errors.push(new PatchValidationError('add requires position','MISSING_POSITION'))
  if (p.op==='move-block') {
    if (!p.blockId)     errors.push(new PatchValidationError('move-block requires blockId','MISSING_FIELD'))
    if (!p.fromSection) errors.push(new PatchValidationError('move-block requires fromSection','MISSING_FIELD'))
    if (!p.toSection)   errors.push(new PatchValidationError('move-block requires toSection','MISSING_FIELD'))
  }
  return { valid: errors.length===0, errors, warnings:[] }
}

export function validatePatchArray(pa:PatchArray): PatchValidationError[] {
  if (!pa.patch?.length) return [new PatchValidationError('Empty patch array','EMPTY')]
  return pa.patch.flatMap(p => validatePatch(p).errors)
}
