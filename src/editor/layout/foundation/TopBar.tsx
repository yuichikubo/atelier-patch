'use client'
/**
 * ATELIER CMS — TopBar (Phase 3)
 * 64px frosted-glass top bar with logo, title, and action buttons.
 */

import React from 'react'

export interface TopBarProps {
  pageTitle?:    string
  onSave?:       () => void
  onAI?:         () => void
  saveLabel?:    string
  isSaving?:     boolean
}

export function TopBar({
  pageTitle = 'Untitled',
  onSave,
  onAI,
  saveLabel = 'Save',
  isSaving  = false,
}: TopBarProps) {
  return (
    <header className="atelier-topbar">
      {/* Logo */}
      <div style={{ width: 140 }}>
        <span className="atelier-topbar__logo">ATELIER</span>
      </div>

      {/* Page title */}
      <div style={{ flex: 1, textAlign: 'center' }}>
        <span className="atelier-topbar__title">{pageTitle}</span>
      </div>

      {/* Actions */}
      <div className="atelier-topbar__actions" style={{ width: 140, justifyContent: 'flex-end' }}>
        <button
          className="atelier-btn atelier-btn--ghost"
          onClick={onAI}
          aria-label="Open AI assistant"
          style={{ fontSize: 11, padding: '5px 12px' }}
        >
          ✦ AI
        </button>
        <button
          className="atelier-btn atelier-btn--primary"
          onClick={onSave}
          disabled={isSaving}
          aria-label="Save page"
          style={{ fontSize: 11, padding: '5px 12px' }}
        >
          {isSaving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </header>
  )
}
