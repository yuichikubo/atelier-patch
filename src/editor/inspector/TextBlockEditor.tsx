'use client'
/**
 * ATELIER CMS — Text Block Editors
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * This file provides purpose-built editing UI components for every block type
 * that contains text content. Each component is driven entirely by props —
 * it has no direct connection to PatchEngine or SelectionStore.
 *
 * All mutations flow upward through an `onChange` callback so the
 * parent (typically the BlockInspector panel or `useBlockInspector` hook)
 * is responsible for emitting the patch.
 *
 * DATA FLOW
 * ─────────
 *   User edits a field
 *     → TextBlockEditor onChange(key, value)
 *       → parent calls inspector.updateField(key, value)
 *         → engine.enqueuePatch({ op:'update', target:'block', … })
 *           → PatchEngine applies the patch
 *             → Renderer re-renders the block
 *
 * USAGE
 * ─────
 *   import { resolveBlockEditor } from '@/editor/inspector/TextBlockEditor'
 *
 *   const Editor = resolveBlockEditor(block.type)
 *   if (Editor) {
 *     return <Editor content={block.content} onChange={(k, v) => inspector.updateField(k, v)} />
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback } from 'react'
import type {
  BlockType,
  TextContent,
  HeroContent,
  CTAContent,
  FAQContent,
  FeatureListContent,
  ImageContent,
  GalleryContent,
  BlockContent,
} from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Shared style tokens (no external dependency)
// ─────────────────────────────────────────────────────────────────────────────

const T = {
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

  label: {
    display:       'block',
    fontSize:      9,
    color:         '#7A7870',
    marginBottom:  4,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  } as React.CSSProperties,

  field: {
    marginBottom: 12,
  } as React.CSSProperties,

  section: {
    marginTop:    18,
    paddingTop:   14,
    borderTop:    '1px solid rgba(255,255,255,0.04)',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize:      9,
    color:         '#4A4844',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    marginBottom:  10,
    display:       'block',
  } as React.CSSProperties,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Primitive field components
// ─────────────────────────────────────────────────────────────────────────────

function Field({
  label, children,
}: {
  label:    string
  children: React.ReactNode
}) {
  return (
    <div style={T.field}>
      <span style={T.label}>{label}</span>
      {children}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder, rows,
}: {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  rows?:        number
}) {
  if (rows && rows > 1) {
    return (
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...T.input, resize: 'vertical' }}
      />
    )
  }
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={T.input}
    />
  )
}

function UrlInput({
  value, onChange, placeholder,
}: {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="url"
      value={value}
      placeholder={placeholder ?? 'https://'}
      onChange={e => onChange(e.target.value)}
      style={T.input}
    />
  )
}

function SelectInput({
  value, options, onChange,
}: {
  value:   string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...T.input, cursor: 'pointer' }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared editor prop type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props passed to every block-type editor.
 * `content` is the raw block content cast to the appropriate type.
 * `onChange(key, value)` propagates a field-level change to the parent.
 */
export interface BlockEditorProps<C = Record<string, unknown>> {
  content:  C
  onChange: (key: string, value: unknown) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITORS — one per block type
// ─────────────────────────────────────────────────────────────────────────────

// ── Text block ───────────────────────────────────────────────────────────────

/**
 * Editor for `text` blocks.
 * Provides a resizable textarea for the main body copy and a format selector.
 */
export function TextBlockEditor({ content, onChange }: BlockEditorProps<TextContent>) {
  const FORMAT_OPTIONS = [
    { label: 'Plain text',     value: 'plain'    },
    { label: 'Markdown',       value: 'markdown' },
    { label: 'HTML',           value: 'html'     },
  ]

  return (
    <div>
      <Field label="Text">
        <TextInput
          value={content.text ?? ''}
          rows={6}
          placeholder="Enter your text here…"
          onChange={v => onChange('text', v)}
        />
      </Field>
      <Field label="Format">
        <SelectInput
          value={content.format ?? 'plain'}
          options={FORMAT_OPTIONS}
          onChange={v => onChange('format', v)}
        />
      </Field>
    </div>
  )
}

// ── Hero block ───────────────────────────────────────────────────────────────

/**
 * Editor for `hero` blocks.
 * Covers headline, subtitle, CTA button text + URL, and background image.
 */
export function HeroBlockEditor({ content, onChange }: BlockEditorProps<HeroContent>) {
  return (
    <div>
      <Field label="Headline">
        <TextInput
          value={content.title ?? ''}
          placeholder="Your headline"
          onChange={v => onChange('title', v)}
        />
      </Field>
      <Field label="Subtitle">
        <TextInput
          value={content.subtitle ?? ''}
          rows={3}
          placeholder="Supporting text"
          onChange={v => onChange('subtitle', v)}
        />
      </Field>

      <div style={T.section}>
        <span style={T.sectionLabel}>Call to action</span>
        <Field label="Button text">
          <TextInput
            value={content.buttonText ?? ''}
            placeholder="Get Started"
            onChange={v => onChange('buttonText', v)}
          />
        </Field>
        <Field label="Button URL">
          <UrlInput
            value={content.buttonUrl ?? ''}
            onChange={v => onChange('buttonUrl', v)}
          />
        </Field>
      </div>

      <div style={T.section}>
        <span style={T.sectionLabel}>Background</span>
        <Field label="Image URL">
          <UrlInput
            value={content.imageUrl ?? ''}
            placeholder="https://… (optional)"
            onChange={v => onChange('imageUrl', v)}
          />
        </Field>
      </div>
    </div>
  )
}

// ── CTA block ────────────────────────────────────────────────────────────────

/**
 * Editor for `cta` (Call to Action) blocks.
 * Headline, description, primary button, and optional secondary button.
 */
export function CTABlockEditor({ content, onChange }: BlockEditorProps<CTAContent>) {
  return (
    <div>
      <Field label="Headline">
        <TextInput
          value={content.headline ?? ''}
          placeholder="Ready to get started?"
          onChange={v => onChange('headline', v)}
        />
      </Field>
      <Field label="Description">
        <TextInput
          value={content.description ?? ''}
          rows={3}
          placeholder="Supporting copy (optional)"
          onChange={v => onChange('description', v)}
        />
      </Field>

      <div style={T.section}>
        <span style={T.sectionLabel}>Primary button</span>
        <Field label="Label">
          <TextInput
            value={content.primaryText ?? ''}
            placeholder="Start Now"
            onChange={v => onChange('primaryText', v)}
          />
        </Field>
        <Field label="URL">
          <UrlInput
            value={content.primaryUrl ?? ''}
            onChange={v => onChange('primaryUrl', v)}
          />
        </Field>
      </div>

      <div style={T.section}>
        <span style={T.sectionLabel}>Secondary button (optional)</span>
        <Field label="Label">
          <TextInput
            value={content.secondaryText ?? ''}
            placeholder="Learn more"
            onChange={v => onChange('secondaryText', v)}
          />
        </Field>
        <Field label="URL">
          <UrlInput
            value={content.secondaryUrl ?? ''}
            onChange={v => onChange('secondaryUrl', v)}
          />
        </Field>
      </div>
    </div>
  )
}

// ── FAQ block ────────────────────────────────────────────────────────────────

/**
 * Editor for `faq` blocks.
 * Question, answer, and default open/collapsed state.
 */
export function FAQBlockEditor({ content, onChange }: BlockEditorProps<FAQContent>) {
  return (
    <div>
      <Field label="Question">
        <TextInput
          value={content.question ?? ''}
          placeholder="Your question here?"
          onChange={v => onChange('question', v)}
        />
      </Field>
      <Field label="Answer">
        <TextInput
          value={content.answer ?? ''}
          rows={4}
          placeholder="Your answer here."
          onChange={v => onChange('answer', v)}
        />
      </Field>
      <Field label="Default state">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={content.open ?? false}
            onChange={e => onChange('open', e.target.checked)}
            style={{ accentColor: '#C9A84C' }}
          />
          <span style={{ fontSize: 11, color: '#C8C4BC' }}>Open by default</span>
        </label>
      </Field>
    </div>
  )
}

// ── Image block ──────────────────────────────────────────────────────────────

/**
 * Editor for `image` blocks.
 * URL, alt text, optional caption.
 */
export function ImageBlockEditor({ content, onChange }: BlockEditorProps<ImageContent>) {
  return (
    <div>
      <Field label="Image URL">
        <UrlInput
          value={content.url ?? ''}
          placeholder="https://…"
          onChange={v => onChange('url', v)}
        />
      </Field>
      <Field label="Alt text">
        <TextInput
          value={content.alt ?? ''}
          placeholder="Describe the image for accessibility"
          onChange={v => onChange('alt', v)}
        />
      </Field>
      <Field label="Caption">
        <TextInput
          value={content.caption ?? ''}
          placeholder="Optional caption"
          onChange={v => onChange('caption', v)}
        />
      </Field>
    </div>
  )
}

// ── Gallery block ─────────────────────────────────────────────────────────────

/**
 * Editor for `gallery` blocks.
 * Column count, gap, and a list of image items each with url + alt.
 */
export function GalleryBlockEditor({ content, onChange }: BlockEditorProps<GalleryContent>) {
  const images  = content.images  ?? []
  const columns = content.columns ?? 3

  const COLUMN_OPTIONS = [
    { label: '2 columns', value: '2' },
    { label: '3 columns', value: '3' },
    { label: '4 columns', value: '4' },
  ]

  const updateImage = useCallback((i: number, key: string, val: string) => {
    const next = images.map((img, idx) => idx === i ? { ...img, [key]: val } : img)
    onChange('images', next)
  }, [images, onChange])

  const removeImage = useCallback((i: number) => {
    onChange('images', images.filter((_, idx) => idx !== i))
  }, [images, onChange])

  const addImage = useCallback(() => {
    onChange('images', [...images, { url: '', alt: '' }])
  }, [images, onChange])

  return (
    <div>
      <Field label="Columns">
        <SelectInput
          value={String(columns)}
          options={COLUMN_OPTIONS}
          onChange={v => onChange('columns', Number(v))}
        />
      </Field>
      <Field label="Gap">
        <TextInput
          value={content.gap ?? '16px'}
          placeholder="16px"
          onChange={v => onChange('gap', v)}
        />
      </Field>

      <div style={T.section}>
        <span style={T.sectionLabel}>Images ({images.length})</span>
        {images.map((img, i) => (
          <div
            key={i}
            style={{
              background:   '#111118',
              borderRadius: 8,
              padding:      '8px 10px',
              marginBottom: 6,
              border:       '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: '#4A4844', letterSpacing: '0.1em' }}>
                IMAGE {i + 1}
              </span>
              <button
                onClick={() => removeImage(i)}
                style={{
                  background: 'none', border: 'none', color: '#7A5050',
                  cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ ...T.label, marginBottom: 2 }}>URL</span>
              <UrlInput value={img.url} onChange={v => updateImage(i, 'url', v)} />
            </div>
            <div>
              <span style={{ ...T.label, marginBottom: 2 }}>Alt text</span>
              <TextInput value={img.alt} placeholder="Image description" onChange={v => updateImage(i, 'alt', v)} />
            </div>
          </div>
        ))}
        <button
          onClick={addImage}
          style={{
            width: '100%', padding: '7px', background: 'transparent',
            border: '1px dashed rgba(201,168,76,0.2)', borderRadius: 8,
            color: 'rgba(201,168,76,0.45)', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 10,
          }}
        >
          + Add image
        </button>
      </div>
    </div>
  )
}

// ── FeatureList block ─────────────────────────────────────────────────────────

/**
 * Editor for `feature-list` blocks.
 * Layout toggle and a list of feature items (icon, title, description).
 */
export function FeatureListBlockEditor({ content, onChange }: BlockEditorProps<FeatureListContent>) {
  const features = content.features ?? []

  const LAYOUT_OPTIONS = [
    { label: 'Grid',  value: 'grid' },
    { label: 'List',  value: 'list' },
  ]

  const updateFeature = useCallback((i: number, key: string, val: string) => {
    const next = features.map((f, idx) => idx === i ? { ...f, [key]: val } : f)
    onChange('features', next)
  }, [features, onChange])

  const removeFeature = useCallback((i: number) => {
    onChange('features', features.filter((_, idx) => idx !== i))
  }, [features, onChange])

  const addFeature = useCallback(() => {
    onChange('features', [...features, { icon: '✦', title: 'New Feature', description: 'Describe this feature.' }])
  }, [features, onChange])

  return (
    <div>
      <Field label="Layout">
        <SelectInput
          value={content.layout ?? 'grid'}
          options={LAYOUT_OPTIONS}
          onChange={v => onChange('layout', v)}
        />
      </Field>

      <div style={T.section}>
        <span style={T.sectionLabel}>Features ({features.length})</span>
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              background:   '#111118',
              borderRadius: 8,
              padding:      '8px 10px',
              marginBottom: 6,
              border:       '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: '#4A4844', letterSpacing: '0.1em' }}>FEATURE {i + 1}</span>
              <button
                onClick={() => removeFeature(i)}
                style={{
                  background: 'none', border: 'none', color: '#7A5050',
                  cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ ...T.label, marginBottom: 2 }}>Icon</span>
              <TextInput value={f.icon ?? ''} placeholder="✦" onChange={v => updateFeature(i, 'icon', v)} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ ...T.label, marginBottom: 2 }}>Title</span>
              <TextInput value={f.title} placeholder="Feature title" onChange={v => updateFeature(i, 'title', v)} />
            </div>
            <div>
              <span style={{ ...T.label, marginBottom: 2 }}>Description</span>
              <TextInput value={f.description} rows={2} placeholder="Describe this feature." onChange={v => updateFeature(i, 'description', v)} />
            </div>
          </div>
        ))}
        <button
          onClick={addFeature}
          style={{
            width: '100%', padding: '7px', background: 'transparent',
            border: '1px dashed rgba(201,168,76,0.2)', borderRadius: 8,
            color: 'rgba(201,168,76,0.45)', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 10,
          }}
        >
          + Add feature
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION — Resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic editor component type — works for any block content shape.
 */
export type BlockEditorComponent = React.ComponentType<BlockEditorProps<any>>

/**
 * Map of block types to their purpose-built editor components.
 * Extend this map when new block types are added to the system.
 */
export const BLOCK_EDITOR_MAP: Partial<Record<BlockType, BlockEditorComponent>> = {
  'text':         TextBlockEditor,
  'hero':         HeroBlockEditor,
  'cta':          CTABlockEditor,
  'faq':          FAQBlockEditor,
  'image':        ImageBlockEditor,
  'gallery':      GalleryBlockEditor,
  'feature-list': FeatureListBlockEditor,
}

/**
 * Returns the purpose-built editor component for the given block type,
 * or `null` if no dedicated editor exists (the generic FieldEditor in
 * BlockInspector.tsx handles the fallback).
 *
 * @example
 *   const Editor = resolveBlockEditor('hero')
 *   if (Editor) return <Editor content={content} onChange={handleChange} />
 */
export function resolveBlockEditor(type: BlockType): BlockEditorComponent | null {
  return BLOCK_EDITOR_MAP[type] ?? null
}
