'use client'
/**
 * ATELIER CMS — CanvasContainer (Phase 3)
 * Centered white editing surface with paper-shadow depth cue.
 */

import React from 'react'

export interface CanvasContainerProps {
  children?: React.ReactNode
}

export function CanvasContainer({ children }: CanvasContainerProps) {
  return (
    <div className="atelier-canvas-scroll">
      <div className="atelier-canvas-well">
        {children ?? <CanvasPlaceholder />}
      </div>
    </div>
  )
}

function CanvasPlaceholder() {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      400,
      gap:            12,
      color:          'var(--color-text-ghost)',
    }}>
      <div style={{ fontSize: 32, opacity: 0.25 }}>✦</div>
      <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Empty page
      </div>
    </div>
  )
}
