'use client'
/**
 * ATELIER CMS — Canvas Panel
 *
 * Self-contained canvas wrapper.
 * Selection state is read from the Zustand useSelectionStore — no props needed.
 * EditorCanvas writes to the same store on every click, so all subscribed
 * components (InspectorPanel, InlineTextEditor) stay in sync automatically.
 */

import React, { useEffect, useState } from 'react'
import { EditorCanvas }   from '../canvas/EditorCanvas'
import { engine }         from '@/core/document/engineInstance'
import { PageAtmosphere } from '@/core/renderer/components/PageAtmosphere'

/**
 * Stable ref to the InteractionLayer DOM node.
 * Exported so portal consumers (e.g. EditorCanvas SectionRow) can target it
 * without DOM queries or new context/state systems.
 * Value is null until Canvas mounts.
 */
export const interactionLayerRef: React.MutableRefObject<HTMLDivElement | null> =
  { current: null }

export interface CanvasProps {
  /** Zoom level (50–200%). Default: 100. */
  zoom?: number
  /** Show the canvas frame / ruler chrome. Default: false. */
  showFrame?: boolean
  /** Background colour outside the page card. */
  background?: string
  /** Max width of the page preview. Default: '100%'. */
  maxPageWidth?: string | number
  /** Optional overlay content (guides, handles). */
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

function CanvasFrame({ zoom }: { zoom: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 16px',
      background:   'var(--color-surface-2)',
      borderBottom: '1px solid var(--color-border)',
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 9, color: 'var(--color-text-ghost)',
      letterSpacing: '0.08em', userSelect: 'none',
    }}>
      <span>CANVAS</span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>{zoom}%</span>
      <span>PAGE</span>
    </div>
  )
}

function EmptyCanvas() {
  const addSection = () =>
    engine.enqueuePatch({
      op:'add', target:'section',
      data:{ type:'blank' }, position:{ placement:'end' },
      meta:{ source:'editor' },
    })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 320, gap: 16,
      fontFamily: 'var(--font-ui)',
      color: 'var(--color-text-ghost)',
      userSelect: 'none',
    }}>
      <div style={{ fontSize: 36, opacity: 0.22, color: 'var(--color-accent)' }}>✦</div>
      <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
        Start your page
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.8, maxWidth: 220 }}>
        Add a section below, import HTML<br />from the sidebar, or ask AI for help
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <button onClick={addSection} style={{
          padding: '9px 28px',
          background:   'var(--color-accent-light)',
          border:       '1px solid var(--color-accent-mid)',
          borderRadius: 'var(--radius-md)',
          color:        'var(--color-accent)',
          cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
          transition: 'background 0.15s',
        }}>
          + Add first section
        </button>
        <div style={{ fontSize: 10, color: 'var(--color-text-ghost)' }}>
          or use ✦ AI in the top bar
        </div>
      </div>
    </div>
  )
}

export function Canvas({
  zoom         = 100,
  showFrame    = false,
  background   = '#f0f0eb',
  maxPageWidth = '100%',
  children,
  className,
  style,
}: CanvasProps) {
  const [hasSections, setHasSections] = useState(
    () => engine.getDocument().sections.length > 0,
  )

  // Live page reference — updated on every engine notify so PageAtmosphere
  // (inside EditorCanvas → SectionRow → PageRenderer path) gets fresh page data.
  // Canvas is the editor-layer owner of this subscription; it does NOT belong
  // in the renderer layer.
  const [livePage, setLivePage] = useState(() => engine.getDocument())

  useEffect(() =>
    engine.subscribe(doc => {
      setHasSections(doc.sections.length > 0)
      setLivePage({ ...doc })
    }),
  [])

  const scaleFactor = zoom / 100

  return (
    // CanvasRoot — position:relative so InteractionLayer can be absolute-positioned inside.
    // No overflow clipping — the surface layer owns scroll/clip.
    <div className={`atelier-canvas-root ${className ?? ''}`} style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      position: 'relative',
      // overflow: 'hidden' intentionally removed — it clipped pseudo-elements
      // and fixed-position atmosphere layers. Clipping now lives only on
      // the scroll surface layer below.
      ...style,
    }}>
      {showFrame && <CanvasFrame zoom={zoom} />}

      {/* ── PageAtmosphere — rendered here in editor context.
          Canvas is the editor-layer owner; it passes the live page document
          so PageAtmosphere can analyze it without touching engine directly.
          In preview/route contexts, PageRenderer renders PageAtmosphere instead. */}
      <PageAtmosphere page={livePage} />

      {/* ── Layer 1: CanvasSurface — scrollable editing area ────────────── */}
      <div
        className="atelier-canvas-scroll atelier-canvas-surface"
        style={{
          flex:     1,
          overflow: 'auto',          // scroll clipping lives HERE only
          position: 'relative',
          zIndex:   1,
        }}
      >
        <div style={{
          transformOrigin: 'top center',
          transform:       scaleFactor !== 1 ? `scale(${scaleFactor})` : undefined,
          minHeight:       `${100 / scaleFactor}%`,
          maxWidth:        900,
          margin:          '0 auto',
          background:      '#FBFBFA',
          boxShadow:       'var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.6)',
          minWidth:        0,
        }}>
          {hasSections ? <EditorCanvas /> : <EmptyCanvas />}
        </div>
      </div>

      {/* ── Layer 2: InteractionLayer ──────────────────────────────────────
          Sibling of CanvasSurface. Covers full CanvasRoot area.
          pointer-events:none — all clicks fall through to CanvasSurface.
          overflow:hidden — clips overlays to CanvasRoot bounds.
          z-index:10 — sits above surface (1).
          children prop routes external overlays here.                     */}
      <div
        className="atelier-canvas-interaction"
        ref={interactionLayerRef}
        aria-hidden={!children}
      >
        {children}
      </div>
    </div>
  )
}
