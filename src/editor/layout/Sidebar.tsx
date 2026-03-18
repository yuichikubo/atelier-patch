'use client'
/**
 * ATELIER CMS — Editor Sidebar Panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * Sidebar is the composable left-panel component for the ATELIER editor.
 * It provides three tabs:
 *
 *   Blocks   — palette of all available block types (add to page)
 *   Sections — list of current page sections (reorder, delete)
 *   Pages    — quick navigation link to the pages list
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Sidebar dispatches ADD patches through PatchEngine when a block is added.
 * • It does NOT read selection state — that is the Canvas's concern.
 * • It does NOT render any document content — it only provides tools.
 * • Sidebar is fully self-contained: it can be dropped into any layout
 *   with no required props.
 *
 * USAGE
 * ─────
 *   <Sidebar />                          // all tabs, default width
 *   <Sidebar defaultTab="sections" />    // open on sections tab
 *   <Sidebar showPagesLink={false} />    // hide the pages nav link
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react'
import { BlockLibrary }       from '@/editor/blocks/BlockLibrary'
import { useAddBlock }        from '@/editor/blocks/useAddBlock'
import { engine }             from '@/core/document/engineInstance'
import { HTMLImportPanel }    from '@/editor/import/HTMLImportPanel'
import type { BlockTypeDefinition } from '@/editor/blocks/blockTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SidebarTab = 'blocks' | 'sections' | 'pages' | 'import'

export interface SidebarProps {
  /**
   * Which tab is open initially.
   * Default: 'blocks'.
   */
  defaultTab?: SidebarTab

  /**
   * Whether to show the "← All pages" navigation link in the Pages tab.
   * Set to false when the sidebar is used outside the CMS pages context.
   * Default: true.
   */
  showPagesLink?: boolean

  /**
   * URL for the pages list link. Defaults to '/cms/pages'.
   */
  pagesHref?: string

  /** Inline style merged onto the outer container. */
  style?: React.CSSProperties
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style tokens
// ─────────────────────────────────────────────────────────────────────────────

const TAB_BASE: React.CSSProperties = {
  flex:          1,
  padding:       '10px 8px',
  fontSize:      9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  background:    'transparent',
  border:        'none',
  cursor:        'pointer',
  fontFamily:    'var(--font-ui)',
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionList — shows current sections, allows reorder + delete
// ─────────────────────────────────────────────────────────────────────────────

function SectionList() {
  const [doc, setDoc] = React.useState(() => engine.getDocument())

  React.useEffect(() => engine.subscribe(d => setDoc({ ...d })), [])

  const sorted = [...(doc.sections ?? [])].sort((a, b) => a.order - b.order)

  const addSection = () =>
    engine.enqueuePatch({
      op:       'add',
      target:   'section',
      data:     { type: 'blank' },
      position: { placement: 'end' },
      meta:     { source: 'editor' },
    })

  const deleteSection = (id: string) =>
    engine.enqueuePatch({ op: 'remove', target: 'section', id, meta: { source: 'editor' } })

  const moveSection = (id: string, dir: 1 | -1) => {
    const idx    = sorted.findIndex(s => s.id === id)
    const target = sorted[idx + dir]
    if (!target) return
    // Swap order fields atomically
    engine.applyPatchArray({
      patch: [
        { op: 'update', target: 'section', id, data: { order: target.order }, meta: { source: 'editor' } },
        { op: 'update', target: 'section', id: target.id, data: { order: sorted[idx].order }, meta: { source: 'editor' } },
      ],
    })
  }

  return (
    <div style={{ padding: '10px 12px', fontFamily: 'var(--font-ui)' }}>
      <div style={{ fontSize: 9, color: '#4A4844', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
        Sections ({sorted.length})
      </div>

      {sorted.length === 0 && (
        <div style={{ fontSize: 11, color: '#2A2824', textAlign: 'center', padding: '24px 0' }}>
          No sections yet
        </div>
      )}

      {sorted.map((s, i) => (
        <div
          key={s.id}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            padding:      '6px 8px',
            borderRadius: 7,
            background:   '#13131A',
            marginBottom: 4,
            border:       '1px solid rgba(255,255,255,0.04)',
          }}
        >
          {/* Info */}
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#C8C4BC', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {s.label || s.type}
            </div>
            <div style={{ fontSize: 8, color: '#3A3834', marginTop: 1 }}>
              {s.blocks.length} block{s.blocks.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
            <button
              onClick={() => moveSection(s.id, -1)}
              disabled={i === 0}
              title="上へ"
              style={{
                background: 'none', border: 'none', fontFamily: 'var(--font-ui)',
                color: i === 0 ? '#2A2824' : '#5A5854',
                cursor: i === 0 ? 'default' : 'pointer',
                fontSize: 11, padding: '2px 4px', lineHeight: 1,
              }}
            >↑</button>
            <button
              onClick={() => moveSection(s.id, 1)}
              disabled={i === sorted.length - 1}
              title="下へ"
              style={{
                background: 'none', border: 'none', fontFamily: 'var(--font-ui)',
                color: i === sorted.length - 1 ? '#2A2824' : '#5A5854',
                cursor: i === sorted.length - 1 ? 'default' : 'pointer',
                fontSize: 11, padding: '2px 4px', lineHeight: 1,
              }}
            >↓</button>
            <button
              onClick={() => deleteSection(s.id)}
              title="削除"
              style={{
                background: 'none', border: 'none',
                color: '#6A4040', cursor: 'pointer',
                fontSize: 11, padding: '2px 5px', lineHeight: 1,
              }}
            >✕</button>
          </div>
        </div>
      ))}

      <button
        onClick={addSection}
        style={{
          width:        '100%',
          marginTop:    6,
          padding:      '8px',
          background:   'transparent',
          border:       '1px dashed rgba(201,168,76,0.18)',
          borderRadius: 8,
          color:        'rgba(201,168,76,0.4)',
          cursor:       'pointer',
          fontFamily:   'var(--font-ui)',
          fontSize:     10,
        }}
      >
        + Add section
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PagesTab — navigation + current page info
// ─────────────────────────────────────────────────────────────────────────────

function PagesTab({ pagesHref }: { pagesHref: string }) {
  const [doc, setDoc] = React.useState(() => engine.getDocument())
  React.useEffect(() => engine.subscribe(d => setDoc({ ...d })), [])

  return (
    <div style={{ padding: '14px 14px', fontFamily: 'var(--font-ui)' }}>
      {/* Nav link */}
      <a
        href={pagesHref}
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            6,
          color:          '#C9A84C',
          textDecoration: 'none',
          fontSize:       11,
          marginBottom:   20,
          letterSpacing:  '0.04em',
        }}
      >
        ← All pages
      </a>

      {/* Current page info */}
      <div style={{ fontSize: 9, color: '#4A4844', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
        Current page
      </div>

      <div
        style={{
          padding:      '10px 12px',
          background:   '#13131A',
          borderRadius: 8,
          border:       '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ fontSize: 12, color: '#C8C4BC', marginBottom: 4, fontWeight: 500 }}>
          {doc.title || 'Untitled'}
        </div>
        <div style={{ fontSize: 9, color: '#4A4844', marginBottom: 6 }}>
          /{doc.slug || '—'}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 20,
            background: doc.status === 'published' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
            color:      doc.status === 'published' ? '#4ade80' : '#5A5854',
            border:     doc.status === 'published' ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(255,255,255,0.06)',
          }}>
            {doc.status}
          </span>
          {doc.themeId && (
            <span style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 20,
              background: 'rgba(201,168,76,0.08)',
              color: 'rgba(201,168,76,0.6)',
              border: '1px solid rgba(201,168,76,0.15)',
            }}>
              {doc.themeId}
            </span>
          )}
          <span style={{ fontSize: 9, color: '#3A3834' }}>
            v{doc.version}
          </span>
        </div>
      </div>

      {/* Section summary */}
      <div style={{ marginTop: 16, fontSize: 9, color: '#3A3834', lineHeight: 1.8 }}>
        <div>{doc.sections.length} section{doc.sections.length !== 1 ? 's' : ''}</div>
        <div>{doc.sections.reduce((n, s) => n + s.blocks.length, 0)} total blocks</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composable sidebar panel.
 *
 * Contains the block palette, section list, and page navigation.
 * Fully self-contained — drop it into any layout with no required props.
 */
export function Sidebar({
  defaultTab    = 'blocks',
  showPagesLink = true,
  pagesHref     = '/cms/pages',
  style,
}: SidebarProps) {
  const [tab, setTab] = useState<SidebarTab>(defaultTab)

  // ── Block library wiring ─────────────────────────────────────────────────
  const { addBlockFromDefinition } = useAddBlock()

  const handleBlockSelect = useCallback((_type: string, def: BlockTypeDefinition) => {
    addBlockFromDefinition(def)
  }, [addBlockFromDefinition])

  const TABS: { id: SidebarTab; label: string }[] = [
    { id: 'blocks',   label: 'ブロック' },
    { id: 'sections', label: 'セクション' },
    { id: 'import',   label: 'Import' },
    ...(showPagesLink ? [{ id: 'pages' as SidebarTab, label: 'Pages' }] : []),
  ]

  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        height:        '100%',
        overflow:      'hidden',
        background:    '#0F0F14',
        ...style,
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display:      'flex',
          flexShrink:   0,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              ...TAB_BASE,
              color:        tab === t.id ? '#C9A84C' : '#4A4844',
              borderBottom: tab === t.id ? '2px solid #C9A84C' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'blocks'   && <BlockLibrary onSelect={handleBlockSelect} style={{ height:'100%' }} />}
        {tab === 'import'   && <HTMLImportPanel />}
        {tab === 'sections' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <SectionList />
          </div>
        )}
        {tab === 'pages' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <PagesTab pagesHref={pagesHref} />
          </div>
        )}
      </div>
    </div>
  )
}
