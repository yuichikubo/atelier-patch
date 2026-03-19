'use client'
/**
 * ATELIER CMS — HTML Import Panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * UI panel that accepts HTML input from the creator and converts it into
 * an ATELIER document by calling importHTML() → engine.applyPatchArray().
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This component never modifies the document directly.
 * • All document mutations go through engine.applyPatchArray() — PatchEngine
 *   remains the single mutation gateway.
 * • importHTML() is a pure function — it only produces Patch[].
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from 'react'
import { engine }       from '@/core/document/engineInstance'
import { importHTML }   from './HTMLImporter'

// ─────────────────────────────────────────────────────────────────────────────
// State types
// ─────────────────────────────────────────────────────────────────────────────

type PanelState = 'idle' | 'preview' | 'importing' | 'done' | 'error'

// ─────────────────────────────────────────────────────────────────────────────
// Styles (inline — consistent with existing editor panel pattern)
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  root: {
    display:       'flex',
    flexDirection: 'column' as const,
    height:        '100%',
    padding:       '16px',
    gap:           '12px',
    fontFamily:    'var(--font-ui)',
    color:         'var(--color-text-primary)',
    fontSize:      '12px',
    overflowY:     'auto' as const,
  },
  label: {
    fontSize:      '10px',
    fontWeight:    500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color:         'var(--color-text-tertiary)',
    marginBottom:  '4px',
  },
  textarea: {
    width:       '100%',
    height:      '200px',
    resize:      'vertical' as const,
    background:  'var(--color-surface)',
    border:      '1px solid var(--color-border)',
    borderRadius:'var(--radius-md)',
    padding:     '10px',
    fontFamily:  'var(--font-mono)',
    fontSize:    '11px',
    color:       'var(--color-text-secondary)',
    lineHeight:  1.5,
    outline:     'none',
  },
  previewBox: {
    background:  'var(--color-surface-3)',
    border:      '1px solid var(--color-border)',
    borderRadius:'var(--radius-md)',
    padding:     '10px 12px',
    fontSize:    '11px',
    lineHeight:  1.6,
  },
  btnPrimary: {
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    gap:           '6px',
    width:         '100%',
    padding:       '9px 14px',
    background:    'var(--color-accent)',
    border:        'none',
    borderRadius:  'var(--radius-md)',
    color:         '#000',
    fontFamily:    'var(--font-ui)',
    fontSize:      '12px',
    fontWeight:    600,
    cursor:        'pointer',
    transition:    'opacity 0.15s',
  },
  btnSecondary: {
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    width:         '100%',
    padding:       '8px 14px',
    background:    'transparent',
    border:        '1px solid var(--color-border)',
    borderRadius:  'var(--radius-md)',
    color:         'var(--color-text-secondary)',
    fontFamily:    'var(--font-ui)',
    fontSize:      '12px',
    cursor:        'pointer',
    transition:    'background 0.15s',
  },
  warning: {
    fontSize:   '10px',
    color:      'var(--color-warning)',
    lineHeight: 1.5,
  },
  success: {
    fontSize:   '11px',
    color:      'var(--color-success)',
    lineHeight: 1.5,
    textAlign:  'center' as const,
  },
  error: {
    fontSize:   '11px',
    color:      'var(--color-danger)',
    lineHeight: 1.5,
  },
  divider: {
    height:     '1px',
    background: 'var(--color-divider)',
    flexShrink: 0,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function HTMLImportPanel() {
  const [html,        setHtml]        = useState('')
  const [panelState,  setPanelState]  = useState<PanelState>('idle')
  const [preview,     setPreview]     = useState<{ sections: number; blocks: number; warnings: string[] } | null>(null)
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)

  // ── Step 1: Preview — parse HTML and show stats before committing ─────────
  const handlePreview = useCallback(() => {
    if (!html.trim()) return

    try {
      const result = importHTML(html)

      if (result.sectionCount === 0) {
        setPanelState('error')
        setErrorMsg('No importable content found in the provided HTML.')
        return
      }

      setPreview({
        sections: result.sectionCount,
        blocks:   result.blockCount,
        warnings: result.warnings,
      })
      setPanelState('preview')
      setErrorMsg(null)
    } catch (e) {
      setPanelState('error')
      setErrorMsg(e instanceof Error ? e.message : 'Failed to parse HTML.')
    }
  }, [html])

  // ── Step 2: Import — generate patches and apply through PatchEngine ───────
  const handleImport = useCallback(() => {
    if (!html.trim()) return
    setPanelState('importing')

    try {
      const result = importHTML(html)

      if (result.patches.length === 0) {
        setPanelState('error')
        setErrorMsg('No patches were generated from the provided HTML.')
        return
      }

      // All mutations go through PatchEngine — architecture rule preserved.
      const applyResult = engine.applyPatchArray({
        patch: result.patches,
        meta:  { source: 'editor' },
      })

      if (!applyResult.ok) {
        const msg = applyResult.errors[0]?.message ?? 'Import failed'
        setPanelState('error')
        setErrorMsg(msg)
        return
      }

      setPanelState('done')
    } catch (e) {
      setPanelState('error')
      setErrorMsg(e instanceof Error ? e.message : 'An unexpected error occurred.')
    }
  }, [html])

  // ── Reset panel to idle ───────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setHtml('')
    setPreview(null)
    setErrorMsg(null)
    setPanelState('idle')
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (panelState === 'done') {
    return (
      <div style={S.root}>
        <div style={{ textAlign:'center', padding:'24px 0', display:'flex', flexDirection:'column', gap:12, alignItems:'center' }}>
          <div style={{ fontSize:28 }}>✓</div>
          <div style={S.success}>
            インポート完了！
            <br />
            コンテンツがキャンバスに追加されました。
          </div>
          <button style={S.btnSecondary} onClick={handleReset}>
            別のHTMLをインポート
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={S.root}>

      {/* Header */}
      <div>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--color-text-primary)', marginBottom:4 }}>
          HTMLをインポート
        </div>
        <div style={{ fontSize:10, color:'var(--color-text-tertiary)', lineHeight:1.6 }}>
          AIツールやWebサイトビルダーで生成したHTMLを貼り付けると、編集可能なブロックに変換されます。
        </div>
      </div>

      <div style={S.divider} />

      {/* HTML textarea */}
      <div>
        <div style={S.label}>HTMLソース</div>
        <textarea
          style={S.textarea}
          value={html}
          onChange={e => {
            setHtml(e.target.value)
            if (panelState !== 'idle') {
              // Reset preview when content changes
              setPreview(null)
              setPanelState('idle')
              setErrorMsg(null)
            }
          }}
          placeholder={'<section>\n  <h1>Your Headline</h1>\n  <p>Your content here.</p>\n</section>'}
          spellCheck={false}
        />
      </div>

      {/* Error message */}
      {panelState === 'error' && errorMsg && (
        <div style={S.error}>⚠ {errorMsg}</div>
      )}

      {/* Preview stats */}
      {panelState === 'preview' && preview && (
        <div style={S.previewBox}>
          <div style={{ fontWeight:600, marginBottom:6, color:'var(--color-text-primary)' }}>
            インポート準備完了
          </div>
          <div style={{ color:'var(--color-text-secondary)', lineHeight:1.8 }}>
            <span style={{ color:'var(--color-accent)', fontWeight:600 }}>{preview.sections}</span> セクション、&nbsp;
            <span style={{ color:'var(--color-accent)', fontWeight:600 }}>{preview.blocks}</span> ブロック
          </div>
          {preview.warnings.length > 0 && (
            <div style={{ ...S.warning, marginTop:8, borderTop:'1px solid var(--color-divider)', paddingTop:8 }}>
              {preview.warnings.slice(0, 3).map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
              {preview.warnings.length > 3 && (
                <div>…and {preview.warnings.length - 3} more</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {panelState === 'idle' || panelState === 'error' ? (
        <button
          style={{ ...S.btnPrimary, opacity: html.trim() ? 1 : 0.4 }}
          disabled={!html.trim()}
          onClick={handlePreview}
        >
          HTMLを解析
        </button>
      ) : panelState === 'preview' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <button
            style={S.btnPrimary}
            onClick={handleImport}
          >
            ✦ キャンバスにインポート
          </button>
          <button style={S.btnSecondary} onClick={handleReset}>
            キャンセル
          </button>
        </div>
      ) : panelState === 'importing' ? (
        <button style={{ ...S.btnPrimary, opacity:0.6 }} disabled>
          インポート中…
        </button>
      ) : null}

      {/* Note */}
      <div style={{ fontSize:10, color:'var(--color-text-ghost)', lineHeight:1.6 }}>
        インポートしたコンテンツはページ末尾に追加されます。
        ⌘Z で元に戻せます。
      </div>

    </div>
  )
}
