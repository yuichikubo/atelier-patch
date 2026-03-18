'use client'
import React from 'react'
import type { BlockComponentProps } from '@/core/renderer/types'
import type { GalleryContent }      from '@/core/document/types'

export function GalleryComponent({ block, isEditing, isSelected }:BlockComponentProps) {
  const c = block.content as GalleryContent
  const images = c.images ?? []
  const inline = isEditing && isSelected

  return (
    <div style={{ padding:'24px var(--page-padding,40px)', maxWidth:'var(--max-width,1080px)', margin:'0 auto' }}>
      {/* Edit prompt when selected — images are managed via Inspector */}
      {inline && (
        <div style={{
          marginBottom: 12,
          padding:      '8px 12px',
          background:   'rgba(201,168,76,0.08)',
          border:       '1px dashed rgba(201,168,76,0.3)',
          borderRadius: 8,
          fontSize:     11,
          color:        'rgba(201,168,76,0.8)',
          fontFamily:   'var(--font-ui)',
          textAlign:    'center',
        }}>
          Edit image URLs and alt text in the Inspector panel →
        </div>
      )}

      {images.length > 0 ? (
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${c.columns ?? 3},1fr)`, gap:c.gap ?? '16px' }}>
          {images.map((img, i) => (
            <img
              key={i}
              src={img.url}
              alt={img.alt ?? ''}
              loading="lazy"
              style={{ width:'100%', height:'auto', display:'block', borderRadius:'var(--radius-sm,4px)' }}
            />
          ))}
        </div>
      ) : (
        <div style={{
          padding:      '40px 20px',
          textAlign:    'center',
          color:        '#4A4844',
          fontFamily:   'var(--font-ui)',
          fontSize:     12,
          border:       '1px dashed rgba(255,255,255,0.08)',
          borderRadius: 8,
        }}>
          {isEditing ? 'Add images via the Inspector panel →' : 'No images'}
        </div>
      )}
    </div>
  )
}
