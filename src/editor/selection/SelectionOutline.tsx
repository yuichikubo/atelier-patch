'use client'
/**
 * ATELIER CMS — SelectionOutline
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `SelectionOutline` is a zero-overhead wrapper that visually highlights a
 * block when it is selected or hovered.
 *
 * It subscribes to the Zustand selection store and applies CSS outline /
 * ring styles depending on whether `blockId` matches the current selection.
 * It also wires the block's click and hover handlers from `useBlockSelection`.
 *
 * USAGE
 * ─────
 * Wrap any block renderer with SelectionOutline in the canvas:
 *
 *   <SelectionOutline blockId={block.id}>
 *     <HeroComponent block={block} />
 *   </SelectionOutline>
 *
 * The component handles onClick, onMouseEnter, and onMouseLeave internally —
 * the caller does not need to attach any event handlers.
 *
 * VISUAL STATES
 * ─────────────
 *   default    — transparent outline (no visual change)
 *   hover      — dashed gold ring (rgba(201,168,76,0.4))
 *   selected   — solid gold ring (#C9A84C) + subtle background tint
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useCallback }  from 'react'
import { useSelectionStore }   from './selectionStore'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface SelectionOutlineProps {
  /** The block id this wrapper represents. */
  blockId:   string

  /** The block content to render inside the outline. */
  children:  React.ReactNode

  /**
   * Additional styles applied to the wrapper div.
   * Merged after the selection outline styles — caller styles can override.
   */
  style?:    React.CSSProperties

  /**
   * Additional CSS class names on the wrapper div.
   */
  className?: string

  /**
   * Called after the block is selected (click).
   * Optional — useful when a parent also needs to know about the click.
   */
  onSelect?: (blockId: string) => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapper component that highlights a block when selected or hovered.
 *
 * Reads selection and hover state from the Zustand store — no props needed
 * for state, only `blockId` to identify which block this wraps.
 *
 * @example
 *   <SelectionOutline blockId="block_abc">
 *     <TextComponent block={block} />
 *   </SelectionOutline>
 */
export function SelectionOutline({
  blockId,
  children,
  style,
  className,
  onSelect,
}: SelectionOutlineProps) {
  // Only subscribe to the slice of state this component cares about
  // — avoids re-renders when unrelated state changes.
  const isSelected = useSelectionStore((s) => s.selectedBlockId === blockId)
  const isHovered  = useSelectionStore((s) => s.hoveredBlockId  === blockId)
  const selectBlock = useSelectionStore((s) => s.selectBlock)
  const hoverBlock  = useSelectionStore((s) => s.hoverBlock)

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    selectBlock(blockId)
    onSelect?.(blockId)
  }, [blockId, selectBlock, onSelect])

  const handleMouseEnter = useCallback(() => {
    hoverBlock(blockId)
  }, [blockId, hoverBlock])

  const handleMouseLeave = useCallback(() => {
    hoverBlock(null)
  }, [hoverBlock])

  // ── Computed outline style ─────────────────────────────────────────────────

  const outlineStyle: React.CSSProperties = isSelected
    ? {
        outline:         '2px solid #C9A84C',
        outlineOffset:   '2px',
        borderRadius:    '4px',
        backgroundColor: 'rgba(201,168,76,0.03)',
      }
    : isHovered
    ? {
        outline:       '2px dashed rgba(201,168,76,0.4)',
        outlineOffset: '2px',
        borderRadius:  '4px',
      }
    : {
        outline:       '2px solid transparent',
        outlineOffset: '2px',
        borderRadius:  '4px',
      }

  // ── Derive data attribute and class for external CSS hooks ─────────────────

  const selectionClass = [
    'atelier-block-outline',
    isSelected && 'is-selected',
    isHovered  && 'is-hovered',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      data-block-id={blockId}
      data-selected={isSelected || undefined}
      data-hovered={isHovered  || undefined}
      className={selectionClass}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        cursor:     'pointer',
        transition: 'outline-color 0.1s ease, background-color 0.1s ease',
        ...outlineStyle,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
