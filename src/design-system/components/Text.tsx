'use client'
import React from 'react'
import type { BlockComponentProps } from '@/core/renderer/types'
import type { TextContent }         from '@/core/document/types'
import { InlineTextEditor }         from '@/editor/inline/InlineTextEditor'

export function TextComponent({ block, isEditing, isSelected }:BlockComponentProps) {
  const c = block.content as TextContent

  return (
    <div style={{ padding:'24px var(--page-padding,40px)', maxWidth:'var(--max-width,1080px)', margin:'0 auto' }}>
      {isEditing && isSelected ? (
        <InlineTextEditor
          blockId={block.id}
          fieldKey="text"
          initialContent={c.text ?? ''}
          multiline
          placeholder="Enter your text…"
          style={{ fontFamily:'var(--font-body)', fontSize:17, lineHeight:1.7, color:'var(--color-text)', whiteSpace:'pre-wrap' }}
        />
      ) : (
        <p style={{ fontFamily:'var(--font-body)', fontSize:17, lineHeight:1.7, color:'var(--color-text)', whiteSpace:'pre-wrap' }}>{c.text}</p>
      )}
    </div>
  )
}
