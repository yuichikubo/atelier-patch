/**
 * ATELIER CMS — Patch Description
 *
 * Converts a Patch into a short human-readable label for the review UI.
 * Pure function — no side effects.
 */

import type { Patch, AddPatch, UpdatePatch, RemovePatch } from '@/core/patch/types'

const BLOCK_LABELS: Record<string, string> = {
  hero:         'hero section',
  text:         'text block',
  cta:          'call-to-action',
  faq:          'FAQ block',
  'feature-list': 'feature list',
  image:        'image block',
  gallery:      'gallery',
}

function blockLabel(type?: string): string {
  return type ? (BLOCK_LABELS[type] ?? `${type} block`) : 'block'
}

export function describePatch(patch: Patch): string {
  const op     = patch.op
  const target = 'target' in patch ? (patch as any).target as string : ''

  if (op === 'add') {
    const p    = patch as AddPatch
    const type = p.data?.type as string | undefined
    if (target === 'section') return `Add ${type ?? 'section'} section`
    if (target === 'block')   return `Add ${blockLabel(type)}`
    return `Add ${target}`
  }

  if (op === 'update') {
    const p  = patch as UpdatePatch
    if (target === 'page') {
      const fields = Object.keys(p.data ?? {})
      if (fields.includes('seo'))   return 'Update SEO metadata'
      if (fields.includes('title')) return 'Update page title'
      return 'Update page settings'
    }
    if (target === 'section') return 'Update section settings'
    if (target === 'block') {
      const content = (p.data as any)?.content
      if (content?.title)       return 'Update headline'
      if (content?.text)        return 'Update text content'
      if (content?.description) return 'Update description'
      if (content?.question)    return 'Update FAQ question'
      if (content?.answer)      return 'Update FAQ answer'
      if (content?.primaryText) return 'Update CTA button'
      if (content?.features)    return 'Update feature list'
      if (content?.alt)         return 'Update image alt text'
      return 'Update block content'
    }
    return `Update ${target}`
  }

  if (op === 'remove') {
    if (target === 'section') return 'Remove section'
    if (target === 'block')   return 'Remove block'
    return `Remove ${target}`
  }

  if (op === 'move')        return 'Reorder section'
  if (op === 'move-block')  return 'Move block'

  return op
}
