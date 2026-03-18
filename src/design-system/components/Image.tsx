'use client'
import React from 'react'
import type { BlockComponentProps } from '@/core/renderer/types'
import type { ImageContent }        from '@/core/document/types'
import { InlineTextEditor }         from '@/editor/inline/InlineTextEditor'

export function ImageComponent({ block, isEditing, isSelected, onUpdate }:BlockComponentProps) {
  const c = block.content as ImageContent
  const inline = isEditing && isSelected

  if (!c.url && !inline) return null

  return (
    <figure style={{ margin:'24px auto', maxWidth:'var(--max-width,1080px)', padding:'0 var(--page-padding,40px)' }}>

      {c.url
        ? <img src={c.url} alt={c.alt ?? ''} loading="lazy" style={{ maxWidth:'100%', height:'auto', display:'block', borderRadius:'var(--radius-md,8px)' }} />
        : inline && (
            <div style={{ padding:'40px 20px', textAlign:'center', color:'#4A4844', fontFamily:'var(--font-ui)', fontSize:12, border:'1px dashed rgba(255,255,255,0.08)', borderRadius:8 }}>
              Add an image URL via the Inspector →
            </div>
          )
      }

      {inline && (
        <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8 }}>
          <div>
            <div style={{ fontSize:9, color:'#7A7870', fontFamily:'var(--font-ui)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:3 }}>
              Alt text
            </div>
            <InlineTextEditor
              blockId={block.id}
              fieldKey="alt"
              initialContent={c.alt ?? ''}
              placeholder="Describe the image for accessibility…"
              style={{ fontSize:12, color:'var(--color-text2)', fontFamily:'var(--font-ui)' }}
              onChange={(val) => onUpdate?.({ content: { ...c, alt: val } } as any)}
            />
          </div>
          <div>
            <div style={{ fontSize:9, color:'#7A7870', fontFamily:'var(--font-ui)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:3 }}>
              Caption (optional)
            </div>
            <InlineTextEditor
              blockId={block.id}
              fieldKey="caption"
              initialContent={c.caption ?? ''}
              placeholder="Add a caption…"
              style={{ fontSize:13, color:'var(--color-text2)', textAlign:'center' }}
              onChange={(val) => onUpdate?.({ content: { ...c, caption: val } } as any)}
            />
          </div>
        </div>
      )}

      {!inline && c.caption && (
        <figcaption style={{ marginTop:8, fontSize:13, color:'var(--color-text2)', textAlign:'center' }}>
          {c.caption}
        </figcaption>
      )}

    </figure>
  )
}
