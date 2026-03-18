'use client'
/**
 * ATELIER CMS — Section Inspector
 *
 * Displays editable settings for the currently selected section.
 * All changes emit engine.enqueuePatch() — never mutates document directly.
 */

import React, { useCallback } from 'react'
import { engine }           from '@/core/document/engineInstance'

export interface SectionInspectorProps {
  sectionId: string
}

const SECTION_TYPES = ['hero', 'content', 'features', 'gallery', 'faq', 'cta', 'blank'] as const
const PADDING_OPTIONS = [
  { value: '',       label: 'Default' },
  { value: '0',      label: 'None' },
  { value: '2rem',   label: 'Small' },
  { value: '4rem',   label: 'Medium' },
  { value: '8rem',   label: 'Large' },
]
const BG_PRESETS = [
  { value: '',                 label: 'None' },
  { value: '#ffffff',          label: 'White' },
  { value: '#0B0B10',          label: 'Dark' },
  { value: '#F8F6F0',          label: 'Cream' },
  { value: 'rgba(201,168,76,0.06)', label: 'Gold tint' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 8, color: '#4A4844', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px',
  background: '#0B0B10', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 5, color: '#C8C4BC', fontSize: 10,
  fontFamily: 'var(--font-ui)', cursor: 'pointer',
  outline: 'none',
}

export function SectionInspector({ sectionId }: SectionInspectorProps) {
  const doc = engine.getDocument()
  const section = doc.sections.find(s => s.id === sectionId)
  if (!section) return null

  const patch = useCallback((data: Record<string, unknown>) => {
    engine.enqueuePatch({ op: 'update', target: 'section', id: sectionId, data, meta: { source: 'editor' } })
  }, [sectionId])

  const settings = (section.settings ?? {}) as Record<string, unknown>

  return (
    <div style={{ padding: '12px 14px', fontFamily: 'var(--font-ui)' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#60a5fa' }}>
          ⊞
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#C8C4BC' }}>Section</div>
          <div style={{ fontSize: 8, color: '#3A3834' }}>{section.type} · {section.blocks.length} block{section.blocks.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Section type */}
      <Field label="Type">
        <select
          style={selectStyle}
          value={section.type}
          onChange={e => patch({ type: e.target.value })}
        >
          {SECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>

      {/* Background */}
      <Field label="Background">
        <select
          style={selectStyle}
          value={(settings.background as string) ?? ''}
          onChange={e => patch({ settings: { ...settings, background: e.target.value || undefined } })}
        >
          {BG_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {/* Padding top */}
      <Field label="Padding top">
        <select
          style={selectStyle}
          value={(settings.paddingTop as string) ?? ''}
          onChange={e => patch({ settings: { ...settings, paddingTop: e.target.value || undefined } })}
        >
          {PADDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {/* Padding bottom */}
      <Field label="Padding bottom">
        <select
          style={selectStyle}
          value={(settings.paddingBottom as string) ?? ''}
          onChange={e => patch({ settings: { ...settings, paddingBottom: e.target.value || undefined } })}
        >
          {PADDING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      {/* Full width */}
      <Field label="Full width">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!(settings.fullWidth)}
            onChange={e => patch({ settings: { ...settings, fullWidth: e.target.checked || undefined } })}
            style={{ accentColor: '#C9A84C', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, color: '#C8C4BC' }}>Remove max-width container</span>
        </label>
      </Field>

      {/* Section ID (read-only, for reference) */}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 8, color: '#2A2824' }}>{sectionId}</div>
      </div>
    </div>
  )
}
