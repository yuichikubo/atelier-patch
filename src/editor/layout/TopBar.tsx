'use client'
/**
 * ATELIER CMS — Editor Top Bar Panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * TopBar is the composable top-bar component for the ATELIER editor.
 * It provides:
 *
 *   • Logo / back navigation
 *   • Page title + dirty state indicator
 *   • Publication status badge
 *   • Undo / Redo buttons (wired to PatchEngine)
 *   • Save button (PATCH /api/pages/:id)
 *   • Publish button (POST /api/pages/:id/publish)
 *   • Preview link
 *   • Keyboard shortcut listener (Ctrl+S / Cmd+S → save)
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • TopBar does NOT hold document data — it reads from PatchEngine.
 * • Save / Publish call the API routes directly via `fetch`.
 * • Undo / Redo call `engine.undo()` / `engine.redo()` — the engine
 *   handles all document mutation.
 * • TopBar is fully self-contained and works with no required props.
 *   All props are optional overrides.
 *
 * USAGE
 * ─────
 *   <TopBar pageId="home-dev-001" pageSlug="home" />
 *   <TopBar pageId={id} pageSlug={slug} height={48} showLogo={false} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { engine }                from '@/core/document/engineInstance'
import { emitDocumentPublished, patchEventBus } from '@/core/patch/eventBus'
import { useHistory }            from '@/editor/history/useHistory'
import { AIPromptPanel }         from '@/editor/ai/AIPromptPanel'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TopBarProps {
  /** The page id used for API save / publish calls. */
  pageId?:    string
  /** The page slug used to open the live public URL after publish. */
  pageSlug?:  string
  /**
   * Height of the top bar in pixels.
   * Default: 56.
   */
  height?:    number
  /**
   * Whether to show the ATELIER logo / back button on the left.
   * Default: true.
   */
  showLogo?:  boolean
  /**
   * Custom content rendered on the right side of the bar,
   * between the Preview link and the Save/Publish buttons.
   */
  actions?:   React.ReactNode
  /** Inline style merged onto the outer container. */
  style?:     React.CSSProperties
}

// ─────────────────────────────────────────────────────────────────────────────
// Icon button — minimal style helper
// ─────────────────────────────────────────────────────────────────────────────

function IconButton({
  label, title, onClick, disabled = false,
}: {
  label:     React.ReactNode
  title?:    string
  onClick:   () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background:  'none',
        border:      'none',
        color:       disabled ? '#CCCCCC' : '#8A8480',
        cursor:      disabled ? 'default' : 'pointer',
        fontSize:    12,
        fontFamily:  'var(--font-ui)',
        padding:     '4px 9px',
        borderRadius:6,
        lineHeight:  1,
        transition:  'color 0.12s',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.color = '#2C2A28' }}
      onMouseLeave={e => { if (!disabled) (e.currentTarget as HTMLElement).style.color = '#8A8480' }}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TopBar component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composable top bar panel.
 *
 * Wires PatchEngine undo/redo and the pages API save/publish endpoints.
 * Registers a Ctrl+S / Cmd+S keyboard shortcut for quick save.
 */
export function TopBar({
  pageId,
  pageSlug,
  height    = 56,
  showLogo  = true,
  actions,
  style,
}: TopBarProps) {
  // ── Engine-derived state ───────────────────────────────────────────────────

  const [pageTitle,  setPageTitle]  = useState(() => engine.getDocument().title)
  const [pageStatus, setPageStatus] = useState(() => engine.getDocument().status)
  const [docVersion, setDocVersion] = useState(() => engine.getDocument().version)

  // ── History (undo / redo) with keyboard shortcuts ──────────────────────────
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useHistory({ enableKeyboard: true })

  // ── AI prompt panel ────────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false)
  // When triggered from BlockContextToolbar, stores the trigger's bounding rect
  // so the panel can be positioned near the block instead of the TopBar.
  const [aiAnchorRect, setAiAnchorRect] = useState<DOMRect | null>(null)
  const aiRef = useRef<HTMLDivElement>(null)

  // Close panel on outside click
  useEffect(() => {
    if (!aiOpen) return
    const handler = (e: MouseEvent) => {
      if (aiRef.current && !aiRef.current.contains(e.target as Node)) {
        setAiOpen(false)
        setAiAnchorRect(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aiOpen])

  // Open AI panel when BlockContextToolbar fires the canvas shortcut.
  // detail.rect is the trigger button's bounding rect — used for canvas-relative positioning.
  useEffect(() => {
    const handler = (e: Event) => {
      const rect = (e as CustomEvent<{ rect: DOMRect | null }>).detail?.rect ?? null
      setAiAnchorRect(rect)
      setAiOpen(true)
    }
    window.addEventListener('atelier:open-ai', handler)
    return () => window.removeEventListener('atelier:open-ai', handler)
  }, [])

  // AutoSave error surface
  useEffect(() => {
    const handler = () => showToast('自動保存に失敗しました', false)
    window.addEventListener('atelier:autosave-error', handler)
    return () => window.removeEventListener('atelier:autosave-error', handler)
  }, [])

  // Dirty state — version at last save
  const [savedVersion, setSavedVersion] = useState(() => engine.getDocument().version)
  const isDirty = docVersion !== savedVersion

  useEffect(() => {
    return engine.subscribe(doc => {
      setPageTitle(doc.title)
      setPageStatus(doc.status)
      setDocVersion(doc.version)
    })
  }, [])

  // Sync savedVersion with AutoSave — so "unsaved" badge clears after background save
  useEffect(() => {
    return patchEventBus.on('document-saved', evt => {
      if (evt.payload) setSavedVersion(evt.payload.version)
    })
  }, [])

  // ── Save / Publish state ───────────────────────────────────────────────────

  const [saving,     setSaving]     = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true, duration = 2800) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), duration)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!pageId || saving) return
    setSaving(true)
    try {
      const doc = engine.getDocument()
      const res = await fetch(`/api/pages/${pageId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ document: doc, version: doc.version }),
      })
      if (res.ok) {
        setSavedVersion(doc.version)
        showToast('保存しました ✓')
      } else {
        showToast('保存に失敗しました', false)
      }
    } catch {
      showToast('保存に失敗しました', false)
    } finally {
      setSaving(false)
    }
  }, [pageId, saving])

  // ── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = useCallback(async () => {
    if (!pageId || publishing) return
    setPublishing(true)
    try {
      // Save first to ensure latest content is persisted
      await handleSave()
      const res = await fetch(`/api/pages/${pageId}/publish`, { method: 'POST' })
      if (res.ok) {
        setPageStatus('published')
        emitDocumentPublished(pageId, new Date().toISOString())
        const msg = pageSlug ? `公開しました → /site/${pageSlug}` : '公開しました ✓'
        showToast(msg, true, 5000)
        if (pageSlug) window.open(`/site/${pageSlug}`, '_blank', 'noopener')
      } else {
        showToast('公開に失敗しました', false)
      }
    } catch {
      showToast('公開に失敗しました', false)
    } finally {
      setPublishing(false)
    }
  }, [pageId, publishing, pageSlug, handleSave])

  // ── Keyboard shortcut: Ctrl+S / Cmd+S ────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        paddingInline:20,
        height,
        background:   '#FEFCF8',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        fontFamily:   'var(--font-ui)',
        flexShrink:   0,
        ...style,
      }}
    >
      {/* Logo / back link */}
      {showLogo && (
        <a
          href="/cms/pages"
          style={{
            fontSize:       12,
            color:          '#C9A84C',
            fontWeight:     600,
            letterSpacing:  '0.12em',
            textDecoration: 'none',
            flexShrink:     0,
          }}
        >
          ✦ ATELIER
        </a>
      )}

      {/* Divider */}
      {showLogo && (
        <span style={{ color: 'rgba(0,0,0,0.12)', flexShrink: 0 }}>│</span>
      )}

      {/* Page title */}
      <div
        style={{
          fontSize:       12,
          color:          '#6A6560',
          flexShrink:     0,
          maxWidth:       200,
          overflow:       'hidden',
          textOverflow:   'ellipsis',
          whiteSpace:     'nowrap',
        }}
      >
        {pageTitle || 'Untitled'}
      </div>

      {/* Status badge */}
      <span
        style={{
          fontSize:    9,
          padding:     '2px 8px',
          borderRadius:20,
          letterSpacing:'0.06em',
          background:  pageStatus === 'published' ? 'rgba(34,197,94,0.1)' : 'rgba(0,0,0,0.05)',
          color:       pageStatus === 'published' ? '#16a34a' : '#8A8480',
          border:      pageStatus === 'published' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(0,0,0,0.08)',
          flexShrink:  0,
        }}
      >
        {pageStatus === 'published' ? '公開済み' : pageStatus === 'draft' ? '下書き' : pageStatus}
      </span>

      {/* Dirty indicator */}
      {isDirty && (
        <span style={{
          fontSize: 9, color: 'rgba(201,168,76,0.75)',
          letterSpacing: '0.06em', flexShrink: 0,
          padding: '2px 7px',
          background: 'rgba(201,168,76,0.07)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: 10,
        }}>
          未保存
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Toast */}
      {toast && (
        <span
          style={{
            fontSize:    10,
            fontWeight:  600,
            color:       toast.ok ? '#4ade80' : '#f87171',
            flexShrink:  0,
            padding:     '3px 10px',
            background:  toast.ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
            border:      `1px solid ${toast.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
            borderRadius: 10,
            letterSpacing: '0.03em',
          }}
        >
          {toast.msg}
        </span>
      )}

      {/* Undo / Redo */}
      <IconButton label="↩" title={`${undoLabel} (Cmd+Z)`}         onClick={undo} disabled={!canUndo} />
      <IconButton label="↪" title={`${redoLabel} (Cmd+Shift+Z)`}   onClick={redo} disabled={!canRedo} />

      {/* AI prompt */}
      <div ref={aiRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setAiOpen(v => !v)}
          title="AI生成"
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           5,
            padding:       '5px 11px',
            background:    aiOpen ? 'rgba(201,168,76,0.12)' : 'rgba(0,0,0,0.04)',
            border:        aiOpen ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(0,0,0,0.10)',
            borderRadius:  7,
            color:         aiOpen ? '#B8903C' : '#8A8480',
            cursor:        'pointer',
            fontSize:      11,
            fontFamily:    'var(--font-ui)',
            letterSpacing: '0.04em',
            transition:    'all 0.15s',
          }}
        >
          <span style={{ fontSize: 13 }}>✦</span>
          AI
        </button>

        {aiOpen && (
          <AIPromptPanel
            onClose={() => { setAiOpen(false); setAiAnchorRect(null) }}
            anchorStyle={aiAnchorRect ? (() => {
              // Flip direction: open above trigger if room exists, else below.
              // Panel height ~420px; if top < 420px open downward instead.
              const PANEL_HEIGHT_APPROX = 420
              const openAbove = aiAnchorRect.top > PANEL_HEIGHT_APPROX
              const left = Math.max(8, aiAnchorRect.right)
              return openAbove ? {
                position:  'fixed',
                top:       aiAnchorRect.top - 8,
                left,
                transform: 'translateX(-100%) translateY(-100%)',
                right:     'auto',
                marginTop: 0,
              } : {
                position:  'fixed',
                top:       aiAnchorRect.bottom + 8,
                left,
                transform: 'translateX(-100%)',
                right:     'auto',
                marginTop: 0,
              }
            })() : undefined}
          />
        )}
      </div>

      {/* Preview link */}
      {pageId && (
        <a
          href={`/preview/${pageId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize:       11,
            color:          '#8A8480',
            textDecoration: 'none',
            padding:        '5px 11px',
            border:         '1px solid rgba(0,0,0,0.10)',
            borderRadius:   7,
            flexShrink:     0,
          }}
        >
          プレビュー
        </a>
      )}

      {/* Custom actions slot */}
      {actions}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        title="Save (Ctrl+S)"
        style={{
          padding:      '6px 14px',
          borderRadius: 7,
          fontSize:     11,
          fontFamily:   'var(--font-ui)',
          cursor:       saving || !isDirty ? 'default' : 'pointer',
          background:   isDirty && !saving ? 'rgba(201,168,76,0.1)' : 'rgba(0,0,0,0.03)',
          border:       isDirty && !saving ? '1px solid rgba(201,168,76,0.35)' : '1px solid rgba(0,0,0,0.10)',
          color:        isDirty && !saving ? '#B8903C' : '#BBBBBB',
          opacity:      saving ? 0.5 : 1,
          flexShrink:   0,
          transition:   'all 0.12s',
        }}
      >
        {saving ? '保存中…' : '保存'}
      </button>

      {/* Publish */}
      <button
        onClick={handlePublish}
        disabled={publishing}
        style={{
          padding:      '6px 16px',
          background:   '#C9A84C',
          border:       'none',
          borderRadius: 7,
          color:        '#0B0B10',
          cursor:       publishing ? 'default' : 'pointer',
          fontSize:     11,
          fontFamily:   'var(--font-ui)',
          fontWeight:   700,
          opacity:      publishing ? 0.5 : 1,
          flexShrink:   0,
        }}
      >
        {publishing ? '処理中…' : pageStatus === 'published' ? '更新' : '公開'}
      </button>
    </div>
  )
}
