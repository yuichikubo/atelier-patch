'use client'
/**
 * ATELIER CMS — BlockPicker
 *
 * Floating block-type selector shown when the user clicks an InsertIndicator.
 * Calls onSelect(type) with the chosen block type; caller passes that to
 * handleInsertBlock(sectionId, afterBlockId, type).
 *
 * Rendered inline inside SectionRow — no portal needed because the
 * canvas has no overflow:hidden ancestor above SectionRow.
 */

import React, { useEffect, useRef } from 'react'

interface BlockPickerOption {
  type:  string
  label: string
  icon:  string
}

const PICKER_OPTIONS: BlockPickerOption[] = [
  { type: 'text',         label: 'Text',    icon: '✎' },
  { type: 'hero',         label: 'Hero',    icon: '✦' },
  { type: 'cta',          label: 'CTA',     icon: '→' },
  { type: 'feature-list', label: 'Features',icon: '⊞' },
  { type: 'faq',          label: 'FAQ',     icon: '?' },
  { type: 'image',        label: 'Image',   icon: '◻' },
]

interface BlockPickerProps {
  onSelect:     (type: string) => void
  onDismiss:    () => void
  /** Optional inline styles — used by the portaled version for fixed positioning */
  style?:       React.CSSProperties
  /** Name of the section this picker will insert into — shown as context label */
  sectionLabel?: string
}

export function BlockPicker({ onSelect, onDismiss, style, sectionLabel }: BlockPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    // Delay so the same click that opens the picker doesn't close it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onDismiss])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onDismiss])

  return (
    <div
      ref={ref}
      className="atelier-block-picker"
      role="listbox"
      aria-label="Choose block type"
      style={style}
    >
      <div className="atelier-block-picker__label">Add block</div>
      {sectionLabel && (
        <div style={{
          fontSize: 8, color: 'var(--color-text-ghost)', padding: '0 4px 6px',
          fontFamily: 'var(--font-ui)', letterSpacing: '0.06em',
          borderBottom: '1px solid var(--color-divider)', marginBottom: 6,
        }}>
          Adding to: {sectionLabel}
        </div>
      )}
      <div className="atelier-block-picker__grid">
        {PICKER_OPTIONS.map(opt => (
          <button
            key={opt.type}
            role="option"
            className="atelier-block-picker__item"
            onClick={e => { e.stopPropagation(); onSelect(opt.type) }}
          >
            <span className="atelier-block-picker__icon">{opt.icon}</span>
            <span className="atelier-block-picker__name">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
