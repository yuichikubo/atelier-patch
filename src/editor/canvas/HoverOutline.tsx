'use client'
/**
 * ATELIER CMS — Hover Outline
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `HoverOutline` is a wrapper component that highlights a block when the
 * cursor moves over it. It is the hover-only counterpart to `SelectionOutline`,
 * which handles selection highlighting.
 *
 * It reads from `useHoverStore` and writes back to it via onMouseEnter /
 * onMouseLeave, so the hovered block id is always up to date in both the
 * hover store and the selection store.
 *
 * VISUAL STATES
 * ─────────────
 *   default  — no outline (invisible)
 *   hover    — subtle blue-tinted dashed ring
 *
 * The selection outline (gold ring) is handled separately by SelectionOutline.
 * HoverOutline and SelectionOutline can be composed:
 *
 *   <SelectionOutline blockId={id}>
 *     <HoverOutline blockId={id}>
 *       <HeroComponent block={block} />
 *     </HoverOutline>
 *   </SelectionOutline>
 *
 * Or, for simpler cases, HoverOutline alone suffices when only hover feedback
 * is needed without selection tracking.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • HoverOutline does NOT modify the Document or call PatchEngine.
 * • It only manages transient CSS styling driven by hover state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback } from 'react'
import { useHoverStore }      from './useHoverStore'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface HoverOutlineProps {
  /** The block id this wrapper represents. */
  blockId:    string

  /** The block content to render inside. */
  children:   React.ReactNode

  /**
   * Colour of the hover ring.
   * Defaults to a soft blue: 'rgba(99,179,237,0.5)'
   */
  color?:     string

  /**
   * Ring style — 'dashed' (default) or 'solid'.
   */
  ringStyle?: 'dashed' | 'solid'

  /**
   * Additional styles applied to the wrapper div.
   */
  style?:     React.CSSProperties

  /** Additional class names. */
  className?: string

  /**
   * Called when the block enters hover state.
   * Useful when a parent also needs to react to hover.
   */
  onHover?:   (blockId: string) => void

  /**
   * Called when the block leaves hover state.
   */
  onLeave?:   () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hover highlight wrapper for editor blocks.
 *
 * Renders a subtle outline when the cursor is over this block.
 * Reads and writes hover state through `useHoverStore`.
 *
 * @example — standalone hover
 *   <HoverOutline blockId={block.id}>
 *     <TextComponent block={block} />
 *   </HoverOutline>
 *
 * @example — composed with SelectionOutline
 *   <SelectionOutline blockId={block.id}>
 *     <HoverOutline blockId={block.id}>
 *       <HeroComponent block={block} />
 *     </HoverOutline>
 *   </SelectionOutline>
 */
export function HoverOutline({
  blockId,
  children,
  color     = 'rgba(99,179,237,0.5)',
  ringStyle = 'dashed',
  style,
  className,
  onHover,
  onLeave,
}: HoverOutlineProps) {
  // Only subscribe to this block's own slice — avoids re-renders for
  // unrelated hover state changes
  const isHovered  = useHoverStore((s) => s.hoveredBlockId === blockId)
  const hoverBlock = useHoverStore((s) => s.hoverBlock)

  const handleMouseEnter = useCallback(() => {
    hoverBlock(blockId)
    onHover?.(blockId)
  }, [blockId, hoverBlock, onHover])

  const handleMouseLeave = useCallback(() => {
    hoverBlock(null)
    onLeave?.()
  }, [hoverBlock, onLeave])

  const outlineStyle: React.CSSProperties = isHovered
    ? {
        outline:       `1px ${ringStyle} ${color}`,
        outlineOffset: '2px',
        borderRadius:  '4px',
      }
    : {
        outline:       '1px solid transparent',
        outlineOffset: '2px',
        borderRadius:  '4px',
      }

  const classes = [
    'atelier-hover-outline',
    isHovered && 'is-hovered',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      data-hover-block-id={blockId}
      data-hovered={isHovered || undefined}
      className={classes}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transition: 'outline-color 0.1s ease',
        ...outlineStyle,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
