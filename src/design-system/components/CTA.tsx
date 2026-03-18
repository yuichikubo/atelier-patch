'use client'
import React from 'react'
import type { BlockComponentProps } from '@/core/renderer/types'
import type { CTAContent }          from '@/core/document/types'
import { InlineTextEditor }         from '@/editor/inline/InlineTextEditor'

export function CTAComponent({ block, isEditing, isSelected }:BlockComponentProps) {
  const c = block.content as CTAContent
  const inline = isEditing && isSelected

  return (
    <div style={{ padding:'var(--space-section,80px) var(--page-padding,40px)', textAlign:'center', background:'var(--color-surface)' }}>

      {c.headline != null && (
        <h2 style={{ fontFamily:'var(--font-heading)', fontSize:'clamp(24px,4vw,40px)', color:'var(--color-text)', marginBottom:16 }}>
          {inline ? (
            <InlineTextEditor
              blockId={block.id}
              fieldKey="headline"
              initialContent={c.headline}
              placeholder="Enter headline…"
              style={{ fontFamily:'inherit', fontSize:'inherit', color:'inherit', fontWeight:'inherit', textAlign:'inherit' }}
            />
          ) : c.headline}
        </h2>
      )}

      {c.description != null && (
        <div style={{ color:'var(--color-text2)', margin:'0 auto 32px', maxWidth:560 }}>
          {inline ? (
            <InlineTextEditor
              blockId={block.id}
              fieldKey="description"
              initialContent={c.description}
              multiline
              placeholder="Supporting copy…"
              style={{ color:'inherit', fontSize:16, lineHeight:1.6, textAlign:'inherit' }}
            />
          ) : <p style={{ margin:0 }}>{c.description}</p>}
        </div>
      )}

      <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
        {/* Button labels are edited via InlineTextEditor; URLs via Inspector */}
        <span style={{ padding:'13px 28px', background:'var(--color-accent)', color:'var(--color-accent-text,#000)', borderRadius:'var(--radius-md,8px)', fontWeight:700, fontSize:15, display:'inline-flex', alignItems:'center' }}>
          {inline ? (
            <InlineTextEditor
              blockId={block.id}
              fieldKey="primaryText"
              initialContent={c.primaryText ?? ''}
              placeholder="Button label"
              style={{ color:'inherit', fontWeight:'inherit', fontSize:'inherit' }}
            />
          ) : (
            <a href={isEditing ? undefined : (c.primaryUrl ?? '#')} onClick={isEditing ? e => e.preventDefault() : undefined} style={{ color:'inherit', textDecoration:'none' }}>
              {c.primaryText}
            </a>
          )}
        </span>

        {(c.secondaryText || inline) && (
          <span style={{ padding:'13px 28px', border:'2px solid var(--color-border)', color:'var(--color-text)', borderRadius:'var(--radius-md,8px)', fontSize:15, display:'inline-flex', alignItems:'center' }}>
            {inline ? (
              <InlineTextEditor
                blockId={block.id}
                fieldKey="secondaryText"
                initialContent={c.secondaryText ?? ''}
                placeholder="Secondary button (optional)"
                style={{ color:'inherit', fontSize:'inherit' }}
              />
            ) : (
              <a href={isEditing ? undefined : (c.secondaryUrl ?? '#')} onClick={isEditing ? e => e.preventDefault() : undefined} style={{ color:'inherit', textDecoration:'none' }}>
                {c.secondaryText}
              </a>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
