'use client'
import React from 'react'
import type { BlockComponentProps }  from '@/core/renderer/types'
import type { FeatureListContent }   from '@/core/document/types'
import { InlineTextEditor }          from '@/editor/inline/InlineTextEditor'

export function FeatureListComponent({ block, isEditing, isSelected, onUpdate }:BlockComponentProps) {
  const c = block.content as FeatureListContent
  const inline = isEditing && isSelected
  const features = c.features ?? []

  // Route per-feature updates through onUpdate → BlockRenderer → engine.enqueuePatch()
  // Design-system components must not import the engine directly.
  const updateFeature = (index: number, key: string, value: string) => {
    const next = features.map((f, i) => i === index ? { ...f, [key]: value } : f)
    onUpdate?.({ content: { ...c, features: next } } as any)
  }

  return (
    <div style={{ padding:'40px var(--page-padding,40px)', maxWidth:'var(--max-width,1080px)', margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:28 }}>
      {features.map((f, i) => (
        <div key={i}>
          {f.icon && <div style={{ fontSize:28, marginBottom:10 }}>{f.icon}</div>}

          <strong style={{ display:'block', fontSize:17, color:'var(--color-text)', marginBottom:6 }}>
            {inline ? (
              <InlineTextEditor
                blockId={`${block.id}-feat-${i}-title`}
                fieldKey="_unused"
                initialContent={f.title}
                placeholder="Feature title"
                style={{ fontSize:'inherit', color:'inherit', fontWeight:'inherit' }}
                onChange={(val) => updateFeature(i, 'title', val)}
              />
            ) : f.title}
          </strong>

          <div style={{ fontSize:14, color:'var(--color-text2)', lineHeight:1.65 }}>
            {inline ? (
              <InlineTextEditor
                blockId={`${block.id}-feat-${i}-desc`}
                fieldKey="_unused"
                initialContent={f.description}
                multiline
                placeholder="Feature description"
                style={{ fontSize:'inherit', color:'inherit', lineHeight:'inherit' }}
                onChange={(val) => updateFeature(i, 'description', val)}
              />
            ) : <p style={{ margin:0 }}>{f.description}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
