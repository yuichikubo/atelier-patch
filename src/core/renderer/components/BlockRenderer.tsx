'use client'
import React, { memo }           from 'react'
import type { Block }            from '@/core/document/types'
import { componentRegistry }     from '@/design-system/registry/ComponentRegistry'
import { FallbackBlockComponent, BlockErrorBoundary } from './FallbackRenderers'
import { useRendererContext }     from '../context/RendererContext'

// Block types that support InlineTextEditor — get cursor:text hint on hover
const INLINE_EDITABLE_TYPES = new Set(['text', 'hero', 'cta', 'faq', 'feature-list', 'image'])

function hasCriticalSuggestion(blockId: string): boolean {
  // Reads the body attribute set by EditorLayout's suggestion tracker.
  // Pure DOM read — no subscription, no re-render pressure.
  const raw = typeof document !== 'undefined'
    ? document.body.getAttribute('data-critical-blocks') ?? ''
    : ''
  return raw.split(',').includes(blockId)
}

export const BlockRenderer = memo(function BlockRenderer({ block, onError }:{ block:Block; onError?:(e:unknown)=>void }) {
  const ctx   = useRendererContext()
  const Comp  = componentRegistry.get(block.type) ?? FallbackBlockComponent
  const isSel = ctx.isEditing && ctx.selectedBlockId === block.id
  const hasSuggestion = ctx.isEditing && hasCriticalSuggestion(block.id)

  // Merge block.settings.style into the wrapper so visual design settings
  // (background, padding, border, etc.) are applied in both live and preview paths.
  const settingsStyle: React.CSSProperties = {
    position: 'relative',
    ...(block.settings.align ? { textAlign: block.settings.align as React.CSSProperties['textAlign'] } : {}),
    ...((block.settings.style as Record<string, string> | undefined) ?? {}),
  }

  const classes = [
    block.settings.className as string | undefined,
    isSel           && 'is-selected',
    hasSuggestion   && 'has-suggestion',
  ].filter(Boolean).join(' ') || undefined

  return (
    <BlockErrorBoundary block={block} isEditing={ctx.isEditing} onError={onError}>
      <div
        data-block-id={block.id}
        data-block-type={block.type}
        data-inline-editable={INLINE_EDITABLE_TYPES.has(block.type) ? 'true' : undefined}
        className={classes}
        style={settingsStyle}
      >
        <Comp
          block={block}
          isEditing={ctx.isEditing}
          isSelected={isSel}
          onUpdate={d => ctx.onPatch?.({ op:'update', target:'block', id:block.id, data:d, meta:{ source:'editor' } })}
        />
      </div>
    </BlockErrorBoundary>
  )
})
