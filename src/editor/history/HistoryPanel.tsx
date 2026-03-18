'use client'
/**
 * ATELIER CMS — History Panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `HistoryPanel` renders the undo/redo controls for the editor.
 * It reads live history availability from `useHistory` and disables buttons
 * when there is nothing to undo or redo.
 *
 * HOW HISTORY WORKS
 * ─────────────────
 * History is managed entirely by PatchEngine:
 *
 *   Undo  — reverts the last applied patch by restoring a document snapshot.
 *           The canvas re-renders immediately. The reverted patch is moved
 *           to the redo stack.
 *
 *   Redo  — reapplies the most recently undone patch. The canvas re-renders.
 *           The patch is moved back to the undo stack.
 *
 * This component contains no document logic — it is a pure UI adapter.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react'
import { useHistory } from './useHistory'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryPanelProps {
  /**
   * Layout orientation.
   * 'horizontal' — buttons side by side (default, suits a toolbar).
   * 'vertical'   — buttons stacked (suits a sidebar panel).
   */
  orientation?: 'horizontal' | 'vertical'

  /**
   * Visual style variant.
   * 'icon'  — compact glyph-only buttons.
   * 'text'  — label-only buttons.
   * 'full'  — icon + label (default).
   */
  variant?: 'icon' | 'text' | 'full'

  /**
   * If true, Ctrl+Z / Ctrl+Y keyboard shortcuts are registered on the window.
   * Useful when HistoryPanel is mounted inside the editor layout and no other
   * component already registers these shortcuts.
   * Default: false.
   */
  enableKeyboard?: boolean

  /** Applied to the root container. */
  style?: React.CSSProperties
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Undo / Redo controls for the ATELIER editor.
 *
 * Buttons are automatically disabled when there is nothing to undo or redo.
 * Reads live state from the Patch Engine via `useHistory`.
 *
 * @example — toolbar usage (horizontal, icon+label)
 *   <HistoryPanel enableKeyboard />
 *
 * @example — sidebar usage (vertical, icon only)
 *   <HistoryPanel orientation="vertical" variant="icon" />
 */
export function HistoryPanel({
  orientation    = 'horizontal',
  variant        = 'full',
  enableKeyboard = false,
  style,
}: HistoryPanelProps) {
  const { undo, redo, canUndo, canRedo } = useHistory({ enableKeyboard })

  const isRow = orientation === 'horizontal'

  const containerStyle: React.CSSProperties = {
    display:        'flex',
    flexDirection:  isRow ? 'row' : 'column',
    alignItems:     'center',
    gap:            4,
    fontFamily:     'DM Mono, monospace',
    ...style,
  }

  return (
    <div style={containerStyle} role="toolbar" aria-label="Undo / Redo">
      <HistoryButton
        onClick={undo}
        disabled={!canUndo}
        icon="↩"
        label="Undo"
        shortcut="Ctrl+Z"
        variant={variant}
        direction="undo"
      />
      <HistoryButton
        onClick={redo}
        disabled={!canRedo}
        icon="↪"
        label="Redo"
        shortcut="Ctrl+Y"
        variant={variant}
        direction="redo"
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HistoryButton — individual undo or redo button
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryButtonProps {
  onClick:   () => boolean
  disabled:  boolean
  icon:      string
  label:     string
  shortcut:  string
  variant:   'icon' | 'text' | 'full'
  direction: 'undo' | 'redo'
}

function HistoryButton({
  onClick,
  disabled,
  icon,
  label,
  shortcut,
  variant,
}: HistoryButtonProps) {
  const [flash, setFlash] = React.useState(false)

  const handleClick = () => {
    const acted = onClick()
    if (acted) {
      setFlash(true)
      setTimeout(() => setFlash(false), 200)
    }
  }

  const base: React.CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            5,
    padding:        variant === 'icon' ? '5px 8px' : '5px 10px',
    background:     flash
                      ? 'rgba(201,168,76,0.12)'
                      : disabled
                      ? 'transparent'
                      : 'rgba(255,255,255,0.04)',
    border:         flash
                      ? '1px solid rgba(201,168,76,0.3)'
                      : '1px solid rgba(255,255,255,0.06)',
    borderRadius:   7,
    color:          disabled ? '#2A2824' : flash ? '#C9A84C' : '#7A7870',
    cursor:         disabled ? 'not-allowed' : 'pointer',
    fontSize:       variant === 'icon' ? 14 : 11,
    fontFamily:     'DM Mono, monospace',
    opacity:        disabled ? 0.4 : 1,
    transition:     'background 0.1s, border-color 0.1s, color 0.1s',
    userSelect:     'none',
    pointerEvents:  disabled ? 'none' : 'auto',
  }

  const showIcon  = variant === 'icon'  || variant === 'full'
  const showLabel = variant === 'text'  || variant === 'full'

  return (
    <button
      style={base}
      onClick={handleClick}
      disabled={disabled}
      title={`${label} (${shortcut})`}
      aria-label={`${label} — ${shortcut}`}
      aria-disabled={disabled}
    >
      {showIcon  && <span style={{ lineHeight: 1 }}>{icon}</span>}
      {showLabel && (
        <span style={{ fontSize: 11, letterSpacing: '0.04em' }}>{label}</span>
      )}
    </button>
  )
}
