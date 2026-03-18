'use client'
/**
 * ATELIER CMS — BlockContextToolbar
 *
 * Small floating toolbar shown when a block is hovered or selected.
 * Provides quick access to Duplicate, Delete, and Add block actions.
 *
 * This is a SHORTCUT only — all actions remain available in the Inspector.
 * Actions call engine.enqueuePatch() via existing inspector hooks.
 *
 * Rendered absolutely inside the block's relative-positioned wrapper.
 */

import React from 'react'

/** Dimension contribution chip — display-only, derived from block type. */
export interface StrategyChip {
  key:   string   // e.g. 'C1'
  label: string   // e.g. 'Action'
  color: string   // hex
}

interface BlockContextToolbarProps {
  onDuplicate:    () => void
  onDelete:       () => void
  onInsertBelow:  () => void
  onAiImprove?:   (e?: React.MouseEvent) => void
  /** Strategic dimension chips — read-only, purely visual */
  strategyDims?:  StrategyChip[]
  /** Suggestion labels for this block — read-only, purely visual */
  suggestionChips?: string[]
  /** Called when the drag handle is mousedown'd — caller initiates drag on the block wrapper */
  onDragStart?:   (e: React.MouseEvent) => void
}

export function BlockContextToolbar({
  onDuplicate,
  onDelete,
  onInsertBelow,
  onAiImprove,
  strategyDims,
  suggestionChips,
  onDragStart,
}: BlockContextToolbarProps) {
  return (
    <div className="atelier-block-toolbar" aria-label="Block actions">

      {/* AI improve — shown only when handler is provided */}
      {onAiImprove && (
        <>
          <button
            className="atelier-block-toolbar__btn atelier-block-toolbar__btn--ai"
            title="Improve with AI (✦)"
            onClick={e => { e.stopPropagation(); onAiImprove(e) }}
          >
            ✦
          </button>
          <span className="atelier-block-toolbar__sep" />
        </>
      )}
      <button
        className="atelier-block-toolbar__btn"
        title="Duplicate block (⌘D)"
        onClick={e => { e.stopPropagation(); onDuplicate() }}
      >
        ⊕
      </button>
      <span className="atelier-block-toolbar__sep" />
      <button
        className="atelier-block-toolbar__btn"
        title="Insert block below (/)"
        onClick={e => { e.stopPropagation(); onInsertBelow() }}
      >
        +
      </button>
      <span className="atelier-block-toolbar__sep" />
      <button
        className="atelier-block-toolbar__btn atelier-block-toolbar__btn--danger"
        title="Delete block (⌫)"
        onClick={e => { e.stopPropagation(); onDelete() }}
      >
        ✕
      </button>

      {/* Chips: suggestions first (actionable), then strategy (informational).
          Total capped at 2 — keeps toolbar compact on blocks with many signals. */}
      {(() => {
        const allChips: Array<{ key: string; node: React.ReactNode }> = []

        // Suggestion chips (higher priority)
        for (const label of (suggestionChips ?? [])) {
          allChips.push({
            key: `sug-${label}`,
            node: <span key={`sug-${label}`} className="atelier-suggestion-chip" title={label}>⚠ {label}</span>,
          })
        }
        // Strategy chips (lower priority)
        for (const dim of (strategyDims ?? [])) {
          allChips.push({
            key: `str-${dim.key}`,
            node: (
              <span
                key={`str-${dim.key}`}
                className="atelier-strategy-chip"
                title={`This block contributes to ${dim.label} (${dim.key})`}
                style={{ borderColor: dim.color.replace(')', ', 0.35)').replace('rgb', 'rgba') }}
              >
                {dim.key} {dim.label}
              </span>
            ),
          })
        }

        const MAX_CHIPS = 2
        const visible  = allChips.slice(0, MAX_CHIPS)
        const overflow = allChips.length - MAX_CHIPS

        if (visible.length === 0) return null
        return (
          <>
            <span className="atelier-block-toolbar__sep" />
            {visible.map(c => c.node)}
            {overflow > 0 && (
              <span
                className="atelier-block-toolbar__btn"
                title={`${overflow} more signal${overflow > 1 ? 's' : ''}`}
                style={{ opacity: 0.5, fontSize: 8, cursor: 'default' }}
              >
                +{overflow}
              </span>
            )}
          </>
        )
      })()}
    </div>
  )
}
