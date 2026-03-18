'use client'
import React from 'react'
import type { BlockComponentProps } from '@/core/renderer/types'
import type { HeroContent }         from '@/core/document/types'
import { InlineTextEditor }         from '@/editor/inline/InlineTextEditor'

export function HeroComponent({ block, isEditing, isSelected }:BlockComponentProps) {
  const c = block.content as HeroContent
  const inline = isEditing && isSelected

  return (
    <div style={{ padding:'var(--space-section,80px) var(--page-padding,40px)', textAlign:'center', background:'var(--color-bg,#fff)' }}>

      {c.title != null && (
        <h1 style={{ fontFamily:'var(--font-heading)', fontSize:'clamp(32px,5vw,60px)', color:'var(--color-text)', marginBottom:16, lineHeight:1.2 }}>
          {inline ? (
            <InlineTextEditor
              blockId={block.id}
              fieldKey="title"
              initialContent={c.title}
              placeholder="Your headline…"
              style={{ fontFamily:'inherit', fontSize:'inherit', lineHeight:'inherit', color:'inherit', fontWeight:'inherit', textAlign:'inherit' }}
            />
          ) : c.title}
        </h1>
      )}

      {c.subtitle != null && (
        <p style={{ fontSize:'clamp(16px,2vw,20px)', color:'var(--color-text2)', margin:'0 auto 32px', maxWidth:600 }}>
          {inline ? (
            <InlineTextEditor
              blockId={block.id}
              fieldKey="subtitle"
              initialContent={c.subtitle}
              placeholder="Supporting text…"
              style={{ fontSize:'inherit', color:'inherit', lineHeight:'inherit', textAlign:'inherit' }}
            />
          ) : c.subtitle}
        </p>
      )}

      {c.buttonText && (
        <a
          href={isEditing ? undefined : (c.buttonUrl ?? '#')}
          onClick={isEditing ? e => e.preventDefault() : undefined}
          style={{ display:'inline-block', padding:'14px 36px', background:'var(--color-accent)', color:'var(--color-accent-text,#000)', borderRadius:'var(--radius-md,8px)', fontWeight:700, textDecoration:'none', fontSize:16, cursor:'pointer' }}
        >
          {c.buttonText}
        </a>
      )}
    </div>
  )
}
