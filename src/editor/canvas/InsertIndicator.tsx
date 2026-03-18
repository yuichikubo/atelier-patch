'use client'
/**
 * ATELIER CMS — Insert Indicator
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `InsertIndicator` is a visual affordance that marks positions where new
 * blocks or sections can be inserted into the canvas.
 *
 * It renders as a horizontal rule with a glyph and optional label.
 * It is shown programmatically by the parent when a drag, keyboard
 * navigation, or explicit insert mode is active — it does not manage
 * its own visibility.
 *
 * VARIANTS
 * ────────
 *   'block'   — thin line between blocks within a section (default)
 *   'section' — thicker line between sections at the page level
 *
 * USAGE PATTERNS
 * ──────────────
 * 1. Between blocks — shown while a block is being dragged or during
 *    keyboard-driven repositioning:
 *
 *      {insertIndex === idx && <InsertIndicator />}
 *      <BlockWrapper key={block.id} … />
 *
 * 2. At end of section — shown when palette is open and cursor is in section:
 *
 *      <InsertIndicator label="Drop here" active />
 *
 * 3. Clickable insert zone — calls onInsert when clicked:
 *
 *      <InsertIndicator
 *        onInsert={() => addBlock('text', { placement:'after', ref:prevBlockId })}
 *      />
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • InsertIndicator is purely presentational — it emits via onInsert callback.
 * • It does NOT call PatchEngine directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertIndicatorProps {
  /**
   * Visual weight of the indicator.
   * 'block'   — thin line, used between blocks (default).
   * 'section' — thicker line, used between page-level sections.
   */
  variant?: 'block' | 'section'

  /**
   * Override the accent colour.
   * Defaults to '#C9A84C' (ATELIER gold) for block variant,
   * '#60A5FA' (blue) for section variant.
   */
  color?: string

  /**
   * Optional label shown beside the centre glyph.
   * Useful for "Drop here" or "Insert section" affordances.
   */
  label?: string

  /**
   * When true, the indicator is rendered at full opacity regardless of hover.
   * Use this when the insert zone is explicitly active (e.g. during drag).
   * Default: false — indicator is subtle until hovered.
   */
  active?: boolean

  /**
   * If provided, the indicator is rendered as a clickable zone.
   * Calls `onInsert` when the user clicks or presses Enter/Space.
   */
  onInsert?: () => void

  /** Applied to the root container. */
  style?: React.CSSProperties

  /** Additional class names. */
  className?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Visual insert position indicator for the editor canvas.
 *
 * Shows a horizontal line with an optional label to mark where new content
 * will be inserted. Brightens on hover. Supports click-to-insert.
 *
 * @example — passive indicator (parent controls visibility)
 *   {insertAfterBlock === block.id && <InsertIndicator />}
 *
 * @example — active drag indicator
 *   <InsertIndicator variant="section" active label="Drop section here" />
 *
 * @example — clickable insert zone
 *   <InsertIndicator
 *     onInsert={() => addBlock('text', { placement: 'after', ref: block.id })}
 *     label="+ Add block"
 *   />
 */
export function InsertIndicator({
  variant   = 'block',
  color,
  label,
  active    = false,
  onInsert,
  style,
  className,
}: InsertIndicatorProps) {
  const [hovered, setHovered] = useState(false)

  const isSection   = variant === 'section'
  const accentColor = color ?? (isSection ? '#60A5FA' : '#C9A84C')
  const isVisible   = active || hovered

  // ── Outer container ────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    gap:            8,
    margin:         isSection ? '6px 0' : '3px 0',
    padding:        onInsert ? '4px 0' : '2px 0',
    cursor:         onInsert ? 'pointer' : 'default',
    opacity:        isVisible ? 1 : 0.2,
    transition:     'opacity 0.15s ease',
    ...style,
  }

  // ── Horizontal rule ────────────────────────────────────────────────────────

  const lineStyle: React.CSSProperties = {
    flex:        1,
    height:      isSection ? 2 : 1,
    background:  isVisible
                   ? accentColor
                   : `color-mix(in srgb, ${accentColor} 50%, transparent)`,
    borderRadius: 1,
    transition:  'background 0.15s ease',
  }

  // ── Centre node ─────────────────────────────────────────────────────────────

  const nodeStyle: React.CSSProperties = {
    display:        'flex',
    alignItems:     'center',
    gap:            5,
    flexShrink:     0,
    fontSize:       isSection ? 11 : 9,
    color:          isVisible ? accentColor : 'transparent',
    fontFamily:     'var(--font-ui)',
    letterSpacing:  '0.06em',
    transition:     'color 0.15s ease',
    userSelect:     'none',
  }

  const handleClick = () => {
    if (onInsert) onInsert()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onInsert && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onInsert()
    }
  }

  const classes = [
    'atelier-insert-indicator',
    isSection  && 'atelier-insert-indicator--section',
    active     && 'is-active',
    hovered    && 'is-hovered',
    onInsert   && 'is-clickable',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={containerStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onInsert ? 'button' : undefined}
      tabIndex={onInsert ? 0 : undefined}
      aria-label={onInsert ? (label ?? 'Insert block here') : undefined}
    >
      {/* Left rule */}
      <div style={lineStyle} />

      {/* Centre glyph + optional label */}
      <div style={nodeStyle}>
        {isSection ? '⊕' : '＋'}
        {label && <span>{label}</span>}
      </div>

      {/* Right rule */}
      <div style={lineStyle} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionInsertIndicator — convenience alias for section-level inserts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convenience alias for `<InsertIndicator variant="section" />`.
 * Used between page-level sections rather than between blocks.
 *
 * @example
 *   <SectionInsertIndicator onInsert={() => addSection('blank')} />
 */
export function SectionInsertIndicator(
  props: Omit<InsertIndicatorProps, 'variant'>,
) {
  return <InsertIndicator {...props} variant="section" />
}
