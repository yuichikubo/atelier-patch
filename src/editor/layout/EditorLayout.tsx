'use client'
import React, { useState, useCallback, useEffect } from 'react'
import { engine }                       from '@/core/document/engineInstance'
import { useSelectionStore }            from '@/editor/selection/selectionStore'
import { Sidebar }                      from './Sidebar'
import { TopBar }                       from './TopBar'
import { Canvas }                       from './Canvas'
import { InspectorPanel }               from '../inspector/InspectorPanel'
import { SuggestionPanel }              from '../suggestions/SuggestionPanel'
import { EditorErrorBoundary }          from '../components/EditorErrorBoundary'
import { suggestionEngine }             from '@/extensions/suggestion/SuggestionEngine'

// ─────────────────────────────────────────────────────────────────────────────
// PageSettingsPanel — SEO + page metadata (title, slug, theme)
// Kept here because InspectorPanel focuses on block editing only.
// ─────────────────────────────────────────────────────────────────────────────
function PageSettingsPanel() {
  const [doc, setDoc] = useState(() => engine.getDocument())
  React.useEffect(() => engine.subscribe(d => setDoc({ ...d })), [])

  const set = useCallback((field: string, val: unknown) => {
    engine.enqueuePatch({ op:'update', target:'page', id:'page', data:{ [field]:val }, meta:{ source:'editor' } })
  }, [])

  const setSeo = useCallback((field: string, val: string) => {
    const seo = { ...(doc.seo as any), [field]: val }
    engine.enqueuePatch({ op:'update', target:'page', id:'page', data:{ seo }, meta:{ source:'editor' } })
  }, [doc.seo])

  const inp: React.CSSProperties = {
    width: '100%',
    background:   'var(--color-surface)',
    border:       '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding:      '6px 10px',
    color:        'var(--color-text-primary)',
    fontFamily:   'var(--font-ui)',
    fontSize:     12,
    outline:      'none',
    boxSizing:    'border-box',
    transition:   'border-color 0.12s',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, color: 'var(--color-text-tertiary)', marginBottom: 4,
    letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block',
    fontFamily: 'var(--font-ui)', fontWeight: 500,
  }
  const THEMES = ['luxury', 'minimal', 'soft', 'dark']

  return (
    <div style={{ padding: '16px', fontFamily: 'var(--font-ui)', overflow: 'auto', height: '100%', background: 'var(--color-surface-2)' }}>
      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12, fontFamily: 'var(--font-ui)', fontWeight: 500 }}>Page</div>

      <div style={{ marginBottom:12 }}>
        <label style={lbl}>タイトル</label>
        <input value={doc.title} onChange={e => set('title', e.target.value)} style={inp} />
      </div>

      <div style={{ marginBottom:12 }}>
        <label style={lbl}>スラッグ</label>
        <input
          value={doc.slug}
          onChange={e => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
          style={inp}
        />
      </div>

      <div style={{ marginBottom:20 }}>
        <label style={lbl}>テーマ</label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
          {THEMES.map(t => (
            <button key={t} onClick={() => set('themeId', t)}
              style={{
                padding:'7px 8px', borderRadius:7, cursor:'pointer',
                fontFamily:'var(--font-ui)', fontSize:10,
                background: doc.themeId===t ? 'var(--color-accent-light)' : 'var(--color-surface)',
                border:     doc.themeId===t ? '1px solid var(--color-accent-mid)' : '1px solid var(--color-border)',
                color:      doc.themeId===t ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12, paddingTop: 14, borderTop: '1px solid var(--color-divider)', fontFamily: 'var(--font-ui)', fontWeight: 500 }}>SEO</div>

      <div style={{ marginBottom:12 }}>
        <label style={lbl}>メタタイトル</label>
        <input value={(doc.seo as any)?.title ?? ''} onChange={e => setSeo('title', e.target.value)} style={inp} placeholder="未入力時はページタイトルを使用" />
      </div>

      <div style={{ marginBottom:12 }}>
        <label style={lbl}>メタ説明</label>
        <textarea value={(doc.seo as any)?.description ?? ''} rows={3} onChange={e => setSeo('description', e.target.value)} style={{ ...inp, resize:'vertical' }} placeholder="160文字以内" />
      </div>

      <div style={{ marginBottom:12 }}>
        <label style={{ ...lbl, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <input type="checkbox" checked={!!(doc.seo as any)?.noIndex} onChange={e => setSeo('noIndex', String(e.target.checked))} style={{ accentColor:'#C9A84C' }} />
          <span style={{ fontSize:9, color:'#7A7870', letterSpacing:'0.08em', textTransform:'uppercase' }}>検索エンジン非公開</span>
        </label>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EditorLayout
// ─────────────────────────────────────────────────────────────────────────────

export interface EditorLayoutProps {
  /** Page id — forwarded to TopBar for save / publish API calls. */
  pageId?:   string
  /** Page slug — forwarded to TopBar for the live-site preview link. */
  pageSlug?: string
}

/**
 * Root editor shell.
 *
 * Renders a three-column grid:
 *   Left   — Sidebar  (blocks palette, sections list, page nav)
 *   Center — Canvas   (live block rendering with selection feedback)
 *   Right  — InspectorPanel (block editing) + PageSettingsPanel (SEO / theme)
 *
 * TopBar spans the full width above all three columns.
 *
 * All child components are self-contained:
 *   • Sidebar   reads/writes engine directly for section ops
 *   • Canvas    reads selectionStore (core) and engine
 *   • TopBar    reads engine for dirty state; calls API routes for save/publish
 *   • InspectorPanel reads Zustand useSelectionStore (bridged to core store)
 */
export function EditorLayout({ pageId, pageSlug }: EditorLayoutProps) {
  const [rightTab, setRightTab] = useState<'inspector' | 'settings' | 'suggestions'>('inspector')

  // Focus mode — true while a block is being inline-edited.
  const editingBlockId  = useSelectionStore(s => s.editingBlockId)
  const selectedBlockId = useSelectionStore(s => s.selectedBlockId)
  const focusMode = editingBlockId !== null

  // Auto-switch to Inspector whenever a block is selected.
  useEffect(() => {
    if (selectedBlockId !== null) setRightTab('inspector')
  }, [selectedBlockId])

  // ── Suggestion badge + canvas block indicators ─────────────────────────────
  // Re-analyzes on every document change, matching SuggestionPanel's own cadence.
  const [criticalCount, setCriticalCount] = useState<number>(() => {
    const all = suggestionEngine.analyze()
    return all.filter((p: any) => p.severity === 'critical').length
  })
  // Block IDs that have at least one critical proposal targeting them.
  // Written to a CSS custom property on document.body so EditorCanvas CSS
  // can apply the indicator — no prop drilling, no new context.
  useEffect(() => {
    const recount = () => {
      const all = suggestionEngine.analyze()
      const critical = all.filter((p: any) => p.severity === 'critical')
      setCriticalCount(critical.length)
      // Collect targeted block IDs from critical proposals
      const ids = new Set<string>()
      critical.forEach((p: any) => { if (p.targetId) ids.add(p.targetId) })
      // Store as data attribute on body so pure CSS selector can target
      // [data-block-id] elements without prop threading.
      document.body.setAttribute(
        'data-critical-blocks',
        Array.from(ids).join(','),
      )
    }
    const unsub = engine.subscribe(() => recount())
    recount()
    return unsub
  }, [])

  const tab = (label: string, active: boolean, onClick: () => void, badge?: number) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        flex: 1, padding: '10px 8px',
        fontSize: 10, letterSpacing: '0.05em',
        textTransform: 'uppercase', background: 'transparent', border: 'none',
        cursor: 'pointer', fontFamily: 'var(--font-ui)',
        fontWeight: active ? 600 : 400,
        color:        active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        transition: 'color 0.12s, border-color 0.12s',
        display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span style={{
          display:      'inline-flex',
          alignItems:   'center',
          justifyContent: 'center',
          minWidth:     14,
          height:       14,
          borderRadius: 7,
          background:   '#ef4444',
          color:        '#fff',
          fontSize:     8,
          fontWeight:   700,
          fontFamily:   'var(--font-ui)',
          padding:      '0 3px',
          lineHeight:   1,
        }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )

  return (
    <div
      className={focusMode ? 'atelier-editor atelier-focus-mode' : 'atelier-editor'}
      style={{
      display:             'grid',
      gridTemplateColumns: '260px 1fr 300px',
      gridTemplateRows:    '56px 1fr',
      height:              '100vh',
      background:          'var(--color-bg)',
      overflow:            'hidden',
      fontFamily:          'var(--font-ui)',
      color:               'var(--color-text-primary)',
    }}>

      {/* ── Top bar — full width ── */}
      <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
        <TopBar pageId={pageId} pageSlug={pageSlug} />
        {process.env.NODE_ENV !== 'production' && <DevModeBadge />}
      </div>

      {/* ── Left — Sidebar ── */}
      <div style={{ borderRight:'1px solid var(--color-border)', overflow:'hidden' }}>
        <Sidebar pagesHref="/cms/pages" />
      </div>

      {/* ── Center — Canvas ── */}
      <EditorErrorBoundary label="Canvas"><Canvas background="var(--color-bg)" /></EditorErrorBoundary>

      {/* ── Right — Inspector / Settings ── */}
      <div style={{ borderLeft:'1px solid var(--color-border)', overflow:'hidden', display:'flex', flexDirection:'column', background:'var(--color-surface-2)' }}>
        <div style={{ display:'flex', borderBottom:'1px solid var(--color-border)', flexShrink:0, background:'var(--color-surface)' }}>
          {tab('編集', rightTab === 'inspector',  () => setRightTab('inspector'))}
          <span className="atelier-tab-group-sep" />
          {tab('改善',   rightTab === 'suggestions',() => setRightTab('suggestions'), criticalCount)}
          <span className="atelier-tab-group-sep" />
          {tab('設定',  rightTab === 'settings',   () => setRightTab('settings'))}
        </div>
        <div style={{ flex:1, overflow:'auto' }}>
          {rightTab === 'inspector'   && <EditorErrorBoundary label="Inspector"><InspectorPanel /></EditorErrorBoundary>}
          {rightTab === 'suggestions' && <EditorErrorBoundary label="Suggestions"><SuggestionPanel /></EditorErrorBoundary>}
          {rightTab === 'settings'    && <PageSettingsPanel />}
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DevModeBadge — visible reminder that auth is bypassed
// Rendered only when NODE_ENV !== 'production'
// ─────────────────────────────────────────────────────────────────────────────

function DevModeBadge() {
  return (
    <div
      aria-label="Development mode active — authentication is bypassed"
      title="Dev auth: all requests run as dev-user / dev-workspace"
      style={{
        position:     'absolute',
        top:          '50%',
        right:        16,
        transform:    'translateY(-50%)',
        display:      'flex',
        alignItems:   'center',
        gap:          5,
        padding:      '3px 8px',
        borderRadius: 5,
        background:   'rgba(245, 158, 11, 0.12)',
        border:       '1px solid rgba(245, 158, 11, 0.35)',
        color:        '#d97706',
        fontSize:     9,
        fontFamily:   'var(--font-mono, monospace)',
        fontWeight:   600,
        letterSpacing:'0.06em',
        textTransform:'uppercase',
        userSelect:   'none',
        pointerEvents:'none',
        zIndex:       200,
      }}
    >
      <span style={{ opacity: 0.8 }}>◆</span>
      Dev Mode
    </div>
  )
}
