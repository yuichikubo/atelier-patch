'use client'
/**
 * ATELIER CMS — Text Property Editor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `TextPropertyEditor` is an inline property editor that displays every
 * editable text field of the currently selected block and patches the
 * document whenever a field changes.
 *
 * It is the direct binding between:
 *   • SelectionStore  — knows which block is selected
 *   • PatchEngine     — holds the live block data
 *   • useUpdateBlock  — converts field changes into patches
 *
 * DATA FLOW
 * ─────────
 *   User edits a field in TextPropertyEditor
 *     → handleChange(key, value)
 *       → updateField(blockId, key, value)      ← useUpdateBlock
 *         → createUpdateBlockFieldPatch(…)      builds patch
 *           → dispatchPatch(patch)              sends to engine
 *             → engine.enqueuePatch(patch)      PatchEngine applies
 *               → Renderer re-renders block     canvas updates
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • TextPropertyEditor does NOT modify the document directly.
 * • It reads block data live from the engine on each render cycle, so it
 *   is always in sync with undo/redo and AI-driven changes.
 * • It does NOT import PatchEngine — all engine access goes through
 *   useUpdateBlock → dispatchPatch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useSelectionStore }     from '@/editor/selection/selectionStore'
import { useUpdateBlock }        from '@/editor/patch/useUpdateBlock'
import { engine }                from '@/core/document/engineInstance'
import type { Block }            from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  root: {
    padding:    '14px',
    fontFamily: 'var(--font-ui)',
  } as React.CSSProperties,

  field: {
    marginBottom: 14,
  } as React.CSSProperties,

  label: {
    display:       'block',
    fontSize:      9,
    color:         '#7A7870',
    marginBottom:  4,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  } as React.CSSProperties,

  input: {
    width:        '100%',
    background:   '#0B0B10',
    border:       '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding:      '7px 10px',
    color:        '#E8E4DC',
    fontFamily:   'var(--font-ui)',
    fontSize:     11,
    outline:      'none',
    boxSizing:    'border-box',
  } as React.CSSProperties,

  sectionLabel: {
    display:       'block',
    fontSize:      8,
    color:         '#3A3834',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    marginBottom:  8,
    marginTop:     16,
    paddingTop:    12,
    borderTop:     '1px solid rgba(255,255,255,0.04)',
  } as React.CSSProperties,

  hint: {
    fontSize:   9,
    color:      '#3A3834',
    marginTop:  3,
    lineHeight: 1.5,
  } as React.CSSProperties,

  saveIndicator: {
    fontSize:    9,
    color:       'rgba(201,168,76,0.6)',
    marginLeft:  6,
    verticalAlign: 'middle',
  } as React.CSSProperties,

  empty: {
    padding:    '24px 14px',
    textAlign:  'center',
    color:      '#2A2824',
    fontSize:   11,
    lineHeight: 1.7,
  } as React.CSSProperties,
}

// ─────────────────────────────────────────────────────────────────────────────
// Field renderer — single property row
// ─────────────────────────────────────────────────────────────────────────────

function PropertyField({
  label,
  fieldKey,
  value,
  onChange,
  hint,
  rows,
  type,
}: {
  label:    string
  fieldKey: string
  value:    unknown
  onChange: (key: string, value: unknown) => void
  hint?:    string
  rows?:    number
  type?:    'text' | 'url' | 'number' | 'checkbox'
}) {
  const strVal = typeof value === 'string'  ? value  : ''
  const numVal = typeof value === 'number'  ? value  : 0
  const boolVal= typeof value === 'boolean' ? value  : false

  if (type === 'checkbox' || typeof value === 'boolean') {
    return (
      <div style={S.field}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={boolVal}
            onChange={e => onChange(fieldKey, e.target.checked)}
            style={{ accentColor: '#C9A84C' }}
          />
          <span style={{ ...S.label, marginBottom: 0, textTransform: 'none', fontSize: 11, color: '#C8C4BC' }}>
            {label}
          </span>
        </label>
        {hint && <p style={S.hint}>{hint}</p>}
      </div>
    )
  }

  if (type === 'number' || typeof value === 'number') {
    return (
      <div style={S.field}>
        <label style={S.label}>{label}</label>
        <input
          type="number"
          value={numVal}
          onChange={e => onChange(fieldKey, Number(e.target.value))}
          style={S.input}
        />
        {hint && <p style={S.hint}>{hint}</p>}
      </div>
    )
  }

  if (type === 'url') {
    return (
      <div style={S.field}>
        <label style={S.label}>{label}</label>
        <input
          type="url"
          value={strVal}
          placeholder="https://"
          onChange={e => onChange(fieldKey, e.target.value)}
          style={S.input}
        />
        {hint && <p style={S.hint}>{hint}</p>}
      </div>
    )
  }

  if (rows && rows > 1) {
    return (
      <div style={S.field}>
        <label style={S.label}>{label}</label>
        <textarea
          value={strVal}
          rows={rows}
          onChange={e => onChange(fieldKey, e.target.value)}
          style={{ ...S.input, resize: 'vertical' }}
        />
        {hint && <p style={S.hint}>{hint}</p>}
      </div>
    )
  }

  return (
    <div style={S.field}>
      <label style={S.label}>{label}</label>
      <input
        type="text"
        value={strVal}
        onChange={e => onChange(fieldKey, e.target.value)}
        style={S.input}
      />
      {hint && <p style={S.hint}>{hint}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-type property layouts
// ─────────────────────────────────────────────────────────────────────────────

function renderFields(
  block:    Block,
  onChange: (key: string, value: unknown) => void,
): React.ReactNode {
  const c = block.content as Record<string, unknown>
  const type = block.type

  switch (type) {

    case 'text':
      return (
        <>
          <PropertyField label="Text"   fieldKey="text"   value={c.text   ?? ''} rows={5} onChange={onChange} />
          <PropertyField label="Format" fieldKey="format" value={c.format ?? 'plain'} onChange={onChange}
            hint="plain · markdown · html" />
        </>
      )

    case 'hero':
      return (
        <>
          <PropertyField label="Headline" fieldKey="title"    value={c.title    ?? ''} onChange={onChange} />
          <PropertyField label="Subtitle" fieldKey="subtitle" value={c.subtitle ?? ''} rows={3} onChange={onChange} />
          <span style={S.sectionLabel}>Call to action</span>
          <PropertyField label="Button text" fieldKey="buttonText" value={c.buttonText ?? ''} onChange={onChange} />
          <PropertyField label="Button URL"  fieldKey="buttonUrl"  value={c.buttonUrl  ?? ''} type="url" onChange={onChange} />
          <span style={S.sectionLabel}>Background</span>
          <PropertyField label="Image URL"   fieldKey="imageUrl"   value={c.imageUrl   ?? ''} type="url" onChange={onChange} />
        </>
      )

    case 'cta':
      return (
        <>
          <PropertyField label="Headline"    fieldKey="headline"    value={c.headline    ?? ''} onChange={onChange} />
          <PropertyField label="Description" fieldKey="description" value={c.description ?? ''} rows={3} onChange={onChange} />
          <span style={S.sectionLabel}>Primary button</span>
          <PropertyField label="Label" fieldKey="primaryText" value={c.primaryText ?? ''} onChange={onChange} />
          <PropertyField label="URL"   fieldKey="primaryUrl"  value={c.primaryUrl  ?? ''} type="url" onChange={onChange} />
          <span style={S.sectionLabel}>Secondary button</span>
          <PropertyField label="Label" fieldKey="secondaryText" value={c.secondaryText ?? ''} onChange={onChange} />
          <PropertyField label="URL"   fieldKey="secondaryUrl"  value={c.secondaryUrl  ?? ''} type="url" onChange={onChange} />
        </>
      )

    case 'faq':
      return (
        <>
          <PropertyField label="Question" fieldKey="question" value={c.question ?? ''} onChange={onChange} />
          <PropertyField label="Answer"   fieldKey="answer"   value={c.answer   ?? ''} rows={4} onChange={onChange} />
          <PropertyField label="Open by default" fieldKey="open" value={!!(c.open)} type="checkbox" onChange={onChange} />
        </>
      )

    case 'image':
      return (
        <>
          <PropertyField label="URL"     fieldKey="url"     value={c.url     ?? ''} type="url" onChange={onChange} />
          <PropertyField label="Alt text" fieldKey="alt"    value={c.alt     ?? ''} onChange={onChange}
            hint="Required for accessibility" />
          <PropertyField label="Caption" fieldKey="caption" value={c.caption ?? ''} onChange={onChange} />
        </>
      )

    default:
      // Generic fallback — renders every string/number/boolean content field
      return (
        <>
          {Object.entries(c).map(([key, val]) =>
            (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') ? (
              <PropertyField
                key={key}
                label={key}
                fieldKey={key}
                value={val}
                onChange={onChange}
              />
            ) : null,
          )}
        </>
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export interface TextPropertyEditorProps {
  /**
   * Optional explicit block id — overrides the one from SelectionStore.
   * Useful when embedding the editor in a context outside the main inspector.
   */
  blockId?: string
  /** Applied to the outer container. */
  style?:   React.CSSProperties
}

/**
 * TextPropertyEditor — inline property editor for the selected block.
 *
 * Reads `selectedBlockId` from the Zustand selection store, fetches live block
 * data from the engine, and renders editable fields. Every field change
 * immediately dispatches an update patch to PatchEngine.
 *
 * @example — standalone use (reads selection from store automatically)
 *   <TextPropertyEditor />
 *
 * @example — explicit block id
 *   <TextPropertyEditor blockId="block_001" />
 */
export function TextPropertyEditor({
  blockId:  propBlockId,
  style,
}: TextPropertyEditorProps = {}) {
  // ── Selection ──────────────────────────────────────────────────────────────
  const storeBlockId    = useSelectionStore((s) => s.selectedBlockId)
  const activeBlockId   = propBlockId ?? storeBlockId

  // ── Live block data from engine ────────────────────────────────────────────
  const [block, setBlock] = useState<Block | null>(null)

  // Saved indicator — briefly shown after each patch
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!activeBlockId) { setBlock(null); return }
    const findBlock = () => {
      for (const s of engine.getDocument().sections) {
        const b = s.blocks.find(b => b.id === activeBlockId)
        if (b) return b
      }
      return null
    }
    setBlock(findBlock())
    // Re-sync whenever the document changes (undo/redo, AI patches, etc.)
    return engine.subscribe(() => setBlock(findBlock()))
  }, [activeBlockId])

  // ── Patch dispatcher ───────────────────────────────────────────────────────
  const { updateField } = useUpdateBlock()

  const handleChange = useCallback((key: string, value: unknown) => {
    if (!activeBlockId) return
    updateField(activeBlockId, key, value)
    // Brief "saved" indicator
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }, [activeBlockId, updateField])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!activeBlockId || !block) {
    return (
      <div style={{ ...S.empty, ...style }}>
        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.2 }}>✎</div>
        Select a block to edit its properties
      </div>
    )
  }

  return (
    <div style={{ ...S.root, ...style }}>
      {/* Header row */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   14,
      }}>
        <span style={{
          fontSize:      9,
          color:         '#4A4844',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}>
          {block.type}
        </span>
        {saved && (
          <span style={S.saveIndicator}>● saved</span>
        )}
      </div>

      {/* Type-specific property fields */}
      {renderFields(block, handleChange)}
    </div>
  )
}
