'use client'
import React, { useState } from 'react'
import type { BlockComponentProps } from '@/core/renderer/types'
import type { FAQContent }          from '@/core/document/types'
import { InlineTextEditor }         from '@/editor/inline/InlineTextEditor'

export function FAQComponent({ block, isEditing, isSelected }:BlockComponentProps) {
  const c = block.content as FAQContent
  const [open, setOpen] = useState(c.open ?? false)
  const inline = isEditing && isSelected

  return (
    <div style={{ borderBottom:'1px solid var(--color-border)', padding:'20px var(--page-padding,40px)', maxWidth:'var(--max-width,1080px)', margin:'0 auto' }}>
      <button
        onClick={() => !inline && setOpen(v => !v)}
        style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor: inline ? 'default' : 'pointer', textAlign:'left', fontSize:17, fontWeight:600, color:'var(--color-text)', fontFamily:'var(--font-body)', padding:0 }}
      >
        {inline ? (
          <InlineTextEditor
            blockId={block.id}
            fieldKey="question"
            initialContent={c.question ?? ''}
            placeholder="Enter your question…"
            style={{ fontSize:'inherit', fontWeight:'inherit', color:'inherit', fontFamily:'inherit', flex:1 }}
          />
        ) : c.question}
        {!inline && <span style={{ fontSize:22, lineHeight:1, marginLeft:16, flexShrink:0 }}>{open ? '−' : '+'}</span>}
      </button>

      {(open || inline) && (
        <div style={{ marginTop:12 }}>
          {inline ? (
            <InlineTextEditor
              blockId={block.id}
              fieldKey="answer"
              initialContent={c.answer ?? ''}
              multiline
              placeholder="Enter your answer…"
              style={{ color:'var(--color-text2)', lineHeight:1.65, fontSize:15 }}
            />
          ) : (
            <p style={{ color:'var(--color-text2)', lineHeight:1.65, fontSize:15, margin:0 }}>{c.answer}</p>
          )}
        </div>
      )}
    </div>
  )
}
