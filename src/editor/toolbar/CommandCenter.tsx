'use client'
import React, { useState, useCallback, useEffect } from 'react'
import { engine } from '@/core/document/engineInstance'

interface Props {
  pageId?:    string
  pageTitle?: string
  pageSlug?:  string
  status?:    string
}

export function CommandCenter({ pageId, pageTitle, pageSlug, status }: Props) {
  const [saving,     setSaving]     = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [msg,        setMsg]        = useState('')
  const [isDirty,    setIsDirty]    = useState(false)
  const [docStatus,  setDocStatus]  = useState(status ?? 'draft')

  // Track dirty state by watching engine version
  useEffect(() => {
    let savedVersion = engine.getVersion()
    const unsub = engine.subscribe((_, version) => {
      setIsDirty(version !== savedVersion)
    })
    return unsub
  }, [])

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

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
        setIsDirty(false)
        showMsg('Saved ✓')
      } else {
        showMsg('Save failed')
      }
    } finally {
      setSaving(false)
    }
  }, [pageId, saving])

  const handlePublish = useCallback(async () => {
    if (!pageId || publishing) return
    setPublishing(true)
    try {
      await handleSave()
      const res = await fetch(`/api/pages/${pageId}/publish`, { method: 'POST' })
      if (res.ok) {
        setDocStatus('published')
        showMsg('Published ✓')
        if (pageSlug) window.open(`/site/${pageSlug}`, '_blank', 'noopener')
      } else {
        showMsg('Publish failed')
      }
    } finally {
      setPublishing(false)
    }
  }, [pageId, publishing, pageSlug, handleSave])

  const btnBase: React.CSSProperties = {
    background: 'none', border: 'none', color: '#7A7870',
    cursor: 'pointer', fontSize: 12,
    fontFamily: 'DM Mono,monospace', padding: '4px 8px',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '0 20px', height: 56,
      background: '#0B0B10',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      fontFamily: 'DM Mono,monospace',
    }}>
      {/* Logo */}
      <a href="/cms/pages" style={{ fontSize: 12, color: '#C9A84C', fontWeight: 600, letterSpacing: '0.12em', textDecoration: 'none', flexShrink: 0 }}>
        ✦ ATELIER
      </a>

      {/* Page title */}
      <div style={{ fontSize: 12, color: '#5A5854', flexShrink: 0, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {pageTitle || 'Untitled'}
      </div>

      {/* Status badge */}
      <span style={{
        fontSize: 9, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.06em',
        background:  docStatus === 'published' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
        color:       docStatus === 'published' ? '#4ade80' : '#5A5854',
        border:      docStatus === 'published' ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {docStatus}
      </span>

      {/* Dirty indicator */}
      {isDirty && (
        <span style={{ fontSize: 9, color: 'rgba(201,168,76,0.6)', letterSpacing: '0.06em' }}>
          ● unsaved
        </span>
      )}

      <div style={{ flex: 1 }} />

      {/* Toast */}
      {msg && (
        <span style={{ fontSize: 11, color: '#4ade80', flexShrink: 0 }}>{msg}</span>
      )}

      {/* Undo / Redo */}
      <button onClick={() => engine.undo()} title="Undo (Ctrl+Z)" style={btnBase}>↩</button>
      <button onClick={() => engine.redo()} title="Redo (Ctrl+Y)" style={btnBase}>↪</button>

      {/* Preview */}
      {pageId && (
        <a href={`/preview/${pageId}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#7A7870', textDecoration: 'none', padding: '5px 11px', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, flexShrink: 0 }}>
          Preview
        </a>
      )}

      {/* Save */}
      <button onClick={handleSave} disabled={saving || !isDirty}
        style={{
          padding: '6px 14px', borderRadius: 7, fontSize: 11,
          fontFamily: 'DM Mono,monospace', cursor: saving || !isDirty ? 'default' : 'pointer',
          background: isDirty && !saving ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.04)',
          border:     isDirty && !saving ? '1px solid rgba(201,168,76,0.25)' : '1px solid rgba(255,255,255,0.07)',
          color:      isDirty && !saving ? '#C9A84C' : '#3A3834',
          opacity: saving ? 0.5 : 1,
          flexShrink: 0,
        }}>
        {saving ? 'Saving…' : 'Save'}
      </button>

      {/* Publish */}
      <button onClick={handlePublish} disabled={publishing}
        style={{
          padding: '6px 16px', background: '#C9A84C', border: 'none', borderRadius: 7,
          color: '#0B0B10', cursor: publishing ? 'default' : 'pointer',
          fontSize: 11, fontFamily: 'DM Mono,monospace', fontWeight: 700,
          opacity: publishing ? 0.5 : 1, flexShrink: 0,
        }}>
        {publishing ? '…' : docStatus === 'published' ? 'Update' : 'Publish'}
      </button>
    </div>
  )
}
