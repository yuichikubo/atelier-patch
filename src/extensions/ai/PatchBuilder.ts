/**
 * ATELIER CMS — Patch Builder
 *
 * Takes raw JSON from the AI model and validates it against the Patch schema.
 * Returns typed Patch[] safe to pass to engine.enqueuePatch().
 *
 * The AI response uses a special placeholder "__FIRST_NEW_SECTION__" when it
 * needs to reference a section it is creating in the same batch.
 * PatchBuilder resolves this by tracking the first add-section patch and
 * substituting its auto-generated id into subsequent add-block patches.
 *
 * Pure module — no side effects, no document mutation.
 */

import type { Patch, AddPatch, UpdatePatch, RemovePatch } from '@/core/patch/types'
import { validatePatch } from '@/core/patch/validation'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildResult {
  ok:      boolean
  patches: Patch[]
  errors:  string[]
  /** Count of patches that failed validation (included in errors). */
  rejected: number
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a JSON array from raw AI text output.
 * Handles cases where the model wraps the array in markdown fences.
 */
export function extractJSON(raw: string): unknown[] {
  let text = raw.trim()

  // Strip markdown fences if present
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  // Extract first [...] array found
  const start = text.indexOf('[')
  const end   = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI response does not contain a JSON array')
  }

  text = text.slice(start, end + 1)

  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) {
      throw new Error('Parsed JSON is not an array')
    }
    return parsed
  } catch (e) {
    throw new Error(`JSON parse failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual patch normalisation
// ─────────────────────────────────────────────────────────────────────────────

function normaliseOp(raw: Record<string, unknown>): string {
  return String(raw.op ?? '').toLowerCase().trim()
}

function normalisePatch(raw: unknown): Patch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const op = normaliseOp(r)
  if (!op) return null

  // Always stamp source as 'ai'
  const meta = { source: 'ai' as const, timestamp: new Date().toISOString() }

  switch (op) {
    case 'add': {
      if (!r.target || !r.data) return null
      // Guard: block patches must have a non-empty parentSectionId
      if (r.target === 'block') {
        const parentId = (r.data as any)?.parentSectionId
        if (!parentId || typeof parentId !== 'string') return null
      }
      const pos = (r.position as any) ?? { placement: 'end' }
      return {
        op:       'add',
        target:   r.target as any,
        data:     r.data as Record<string, unknown>,
        position: { placement: pos.placement ?? 'end', ref: pos.ref, index: pos.index },
        meta,
      } satisfies AddPatch
    }

    case 'update': {
      if (!r.target || !r.id || !r.data) return null
      return {
        op:     'update',
        target: r.target as any,
        id:     String(r.id),
        data:   r.data as Record<string, unknown>,
        meta,
      } satisfies UpdatePatch
    }

    case 'remove': {
      if (!r.target || !r.id) return null
      return {
        op:     'remove',
        target: r.target as any,
        id:     String(r.id),
        meta,
      } satisfies RemovePatch
    }

    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section id placeholder resolution
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER = '__FIRST_NEW_SECTION__'

/**
 * When the AI creates a section and then references it in the same batch,
 * it uses the placeholder "__FIRST_NEW_SECTION__".
 *
 * We resolve this by:
 * 1. Finding the first add-section patch in the batch.
 * 2. Generating the id the engine will assign (using the same uid formula).
 * 3. Substituting the placeholder in all subsequent add-block patches.
 *
 * This works because the engine generates ids as `${target}_${uid()}` and
 * we need a stable id before the engine processes the patch. Instead of
 * pre-generating, we let the engine assign the id and post-process using
 * an id we inject into the section patch data.
 *
 * Simpler approach: we inject a stable client-generated id into the section
 * patch's data.patchId field, then use that same id for blocks.
 */
function resolvePlaceholders(patches: Patch[]): Patch[] {
  // Find the first add-section patch
  const sectionPatchIdx = patches.findIndex(
    p => p.op === 'add' && (p as AddPatch).target === 'section',
  )
  if (sectionPatchIdx === -1) return patches

  // Generate a stable id for the new section
  const sectionId = `section_${Date.now().toString(36)}_ai`

  // Inject the id into the section patch data so the engine uses it
  const resolved = patches.map((p, i) => {
    if (i === sectionPatchIdx) {
      const ap = p as AddPatch
      return {
        ...ap,
        data: { ...ap.data, id: sectionId },
      }
    }

    // Replace placeholder in block parentSectionId
    if (p.op === 'add') {
      const ap = p as AddPatch
      if (ap.target === 'block') {
        const data = ap.data as Record<string, unknown>
        if (data.parentSectionId === PLACEHOLDER) {
          return {
            ...ap,
            data: { ...data, parentSectionId: sectionId },
          }
        }
      }
    }

    return p
  })

  return resolved
}

/**
 * Normalise and type-check a single raw AI patch object.
 * Returns null if the shape is unrecognisable.
 * Exported for use by the streaming route.
 */
export function normaliseSinglePatch(raw: unknown): Patch | null {
  return normalisePatch(raw)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and validate a raw AI response string into typed Patch objects.
 *
 * @param raw  Raw text from the AI model.
 * @returns    BuildResult with validated patches and any errors.
 */
export function buildPatches(raw: string): BuildResult {
  const errors: string[] = []
  const patches: Patch[] = []
  let rejected = 0

  // ── Step 1: extract JSON array ───────────────────────────────────────────
  let items: unknown[]
  try {
    items = extractJSON(raw)
  } catch (e) {
    return {
      ok:       false,
      patches:  [],
      errors:   [e instanceof Error ? e.message : String(e)],
      rejected: 0,
    }
  }

  if (items.length === 0) {
    return { ok: false, patches: [], errors: ['AI returned an empty patch array'], rejected: 0 }
  }

  // Enforce max patches per response
  const MAX = 20
  if (items.length > MAX) {
    errors.push(`AI returned ${items.length} patches; truncated to ${MAX}`)
    items = items.slice(0, MAX)
  }

  // ── Step 2: normalise and validate each patch ────────────────────────────
  for (let i = 0; i < items.length; i++) {
    const normalised = normalisePatch(items[i])
    if (!normalised) {
      errors.push(`Patch[${i}]: unrecognised shape — ${JSON.stringify(items[i]).slice(0, 80)}`)
      rejected++
      continue
    }

    const validation = validatePatch(normalised)
    if (!validation.valid) {
      errors.push(`Patch[${i}]: ${validation.errors.map(e => e.message).join('; ')}`)
      rejected++
      continue
    }

    patches.push(normalised)
  }

  // ── Step 3: resolve section id placeholders ──────────────────────────────
  const resolved = resolvePlaceholders(patches)

  return {
    ok:       resolved.length > 0,
    patches:  resolved,
    errors,
    rejected,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Structure → Patch[] converter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MVP JSON structure format produced by the AI generate endpoint:
 *
 *   {
 *     "sections": [
 *       {
 *         "type": "hero",
 *         "blocks": [
 *           { "type": "hero", "content": { "title": "...", "subtitle": "..." } }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Each section gets a stable pre-generated id so that the block patches can
 * reference it via parentSectionId. The engine now respects data.id (see
 * engine.ts execAdd), so these ids are honoured rather than replaced.
 */

export interface JsonSection {
  type?:   string
  label?:  string
  blocks?: JsonBlock[]
}

export interface JsonBlock {
  type?:    string
  content?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface JsonStructure {
  sections?: JsonSection[]
}

export interface ConvertResult {
  ok:       boolean
  patches:  Patch[]
  errors:   string[]
}

function uid_local(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Convert a JSON structure object into Patch[] that can be passed to
 * engine.applyPatchArray().
 *
 * This function never touches the engine — it only produces inert Patch[].
 */
export function convertJsonToPatches(json: JsonStructure): ConvertResult {
  const errors:  string[] = []
  const patches: Patch[]  = []

  if (!json || typeof json !== 'object') {
    return { ok: false, patches: [], errors: ['Input is not an object'] }
  }

  const sections = json.sections
  if (!Array.isArray(sections) || sections.length === 0) {
    return { ok: false, patches: [], errors: ['sections must be a non-empty array'] }
  }

  sections.forEach((section, si) => {
    if (!section || typeof section !== 'object') {
      errors.push(`Section[${si}]: not an object — skipped`)
      return
    }

    // ── Section ADD patch ──────────────────────────────────────────────────
    // Pre-generate a stable id so block patches can reference it.
    // engine.execAdd now respects data.id, so this id is preserved.
    const sectionId = `section_${uid_local()}`

    patches.push({
      op:       'add',
      target:   'section',
      data:     {
        id:    sectionId,
        type:  section.type ?? 'blank',
        label: section.label,
      } as Record<string, unknown>,
      position: { placement: 'end' },
      meta:     { source: 'ai' },
    } as Patch)

    // ── Block ADD patches ──────────────────────────────────────────────────
    const blocks = section.blocks
    if (!Array.isArray(blocks)) {
      // Section with no blocks is valid — e.g. AI adds a blank section
      return
    }

    blocks.forEach((block, bi) => {
      if (!block || typeof block !== 'object') {
        errors.push(`Section[${si}].Block[${bi}]: not an object — skipped`)
        return
      }
      if (!block.type) {
        errors.push(`Section[${si}].Block[${bi}]: missing type — skipped`)
        return
      }

      patches.push({
        op:       'add',
        target:   'block',
        data:     {
          type:            block.type,
          parentSectionId: sectionId,   // references the pre-generated section id
          content:         block.content  ?? {},
          settings:        block.settings ?? {},
        } as Record<string, unknown>,
        position: { placement: 'end' },
        meta:     { source: 'ai' },
      } as Patch)
    })
  })

  return {
    ok:      patches.length > 0,
    patches,
    errors,
  }
}

