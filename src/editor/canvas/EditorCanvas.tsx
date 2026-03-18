'use client'
/**
 * ATELIER CMS — EditorCanvas
 *
 * RENDERING OPTIMIZATION
 * ─────────────────────
 * Sections are normalized into { sectionsById, sectionOrder } instead of
 * being mapped directly from doc.sections. This means React.memo on
 * SectionRow/SectionRenderer is effective:
 *
 *   • On every engine notify, each section is compared by fingerprint
 *   • Only sections whose content changed receive a new object reference
 *   • Sections with unchanged content reuse the same reference → memo skips them
 *   • A 50-section page with one edited block causes exactly one SectionRow re-render
 *
 * Normalization lives entirely in the rendering layer.
 * The engine document schema is untouched.
 */

import React, { useCallback, useState, useMemo, memo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { engine }                    from '@/core/document/engineInstance'
import { SectionRenderer }           from '@/core/renderer/components/SectionRenderer'
import { BlockRenderer }             from '@/core/renderer/components/BlockRenderer'
import { RendererProvider }          from '@/core/renderer/context/RendererContext'
import { useSelectionStore }         from '@/editor/selection/selectionStore'
import { useAIPreviewStore }         from '@/editor/ai/previewStore'
import { useSuggestionHighlightStore } from '@/editor/state/suggestionHighlightStore'
import { useKeyboardShortcuts }        from '@/editor/hooks/useKeyboardShortcuts'
import { BlockPicker }               from './BlockPicker'
import { BlockContextToolbar }       from './BlockContextToolbar'
import type { StrategyChip }         from './BlockContextToolbar'
import { InsertIndicator, SectionInsertIndicator } from '@/editor/canvas/InsertIndicator'
import { BLOCK_DEFAULTS }            from '@/editor/blocks/blockTypes'
import { interactionLayerRef }       from '@/editor/layout/Canvas'
import { suggestionEngine }          from '@/extensions/suggestion/SuggestionEngine'
import type { Section }              from '@/core/document/types'

// Dimension metadata for strategy chips — mirrors StrategyPanel's DIMS array
// Defined here to avoid importing the panel component into the canvas.
const STRATEGY_DIMS: Array<{ key: string; label: string; color: string; types: string[] }> = [
  { key: 'C1', label: 'Action',      color: '#F59E0B', types: ['cta', 'hero'] },
  { key: 'C2', label: 'Trust',       color: '#10B981', types: ['gallery'] },
  { key: 'C3', label: 'Purpose',     color: '#8B5CF6', types: ['text', 'hero'] },
  { key: 'C4', label: 'Information', color: '#3B82F6', types: ['faq', 'feature-list'] },
  { key: 'C5', label: 'Emotion',     color: '#F472B6', types: ['image', 'gallery'] },
]

/** Derive which strategy dimensions a block type contributes to. Pure, no side-effects. */
function getStrategyChips(blockType: string): StrategyChip[] {
  return STRATEGY_DIMS
    .filter(d => d.types.includes(blockType))
    .map(d => ({ key: d.key, label: d.label, color: d.color }))
}

/**
 * Read current suggestion descriptions that target a specific block.
 * Results are cached by document version so analyze() runs at most once
 * per patch — never on hover events.
 */
const _suggestionCache: { version: number | null; byBlock: Map<string, string[]> } = {
  version: null,
  byBlock: new Map(),
}

function getSuggestionChips(blockId: string): string[] {
  try {
    const docVersion = engine.getDocument().version
    if (docVersion !== _suggestionCache.version) {
      const proposals = suggestionEngine.analyze()
      const byBlock = new Map<string, string[]>()
      for (const p of proposals as any[]) {
        if (p.targetId && p.severity === 'critical') {
          const existing = byBlock.get(p.targetId) ?? []
          if (existing.length < 2) {
            existing.push(p.description as string)
            byBlock.set(p.targetId, existing)
          }
        }
      }
      _suggestionCache.version = docVersion
      _suggestionCache.byBlock = byBlock
    }
    return _suggestionCache.byBlock.get(blockId) ?? []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section fingerprint — lightweight change detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize the parts of a section that can change between patches.
 * Per-section cost is O(blocks) — much cheaper than a full-document clone.
 * Called on EVERY section on EVERY engine notify but only for changed sections
 * after the first time (unchanged sections exit early via stable reference).
 */
function fingerprint(s: Section): string {
  return `${s.type}|${s.order}|${JSON.stringify(s.settings)}|${
    s.blocks.map(b => `${b.id}:${b.order}:${JSON.stringify(b.content)}:${JSON.stringify(b.settings)}`).join(',')
  }`
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalized section state
// ─────────────────────────────────────────────────────────────────────────────

interface NormalizedSections {
  byId:        Record<string, Section>
  order:       string[]          // sorted section IDs
  fingerprints: Record<string, string>  // last known fingerprint per section
}

function normalizeSections(sections: readonly Section[]): NormalizedSections {
  const sorted = [...sections].sort((a, b) => a.order - b.order)
  const byId: Record<string, Section>   = {}
  const fingerprints: Record<string, string> = {}
  for (const s of sorted) {
    byId[s.id]          = structuredClone(s)   // isolated copy — stable reference until section changes
    fingerprints[s.id]  = fingerprint(s)
  }
  return { byId, order: sorted.map(s => s.id), fingerprints }
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionRow — memoized per-section wrapper
// ─────────────────────────────────────────────────────────────────────────────

interface SectionRowProps {
  section:          Section
  isSelected:       boolean
  isHovered:        boolean
  isPreview:        boolean
  isHighlighted:    boolean
  highlightColor:   string
  selectedBlockId:  string | null
  onSectionClick:   (id: string, e: React.MouseEvent) => void
  onMouseEnter:     (id: string) => void
  onMouseLeave:     () => void
  onDelete:         (id: string, e: React.MouseEvent) => void
  /** Insert a block of type `blockType` after `afterBlockId` (null = prepend) */
  onInsertBlock:    (sectionId: string, afterBlockId: string | null, blockType: string) => void
  /** Drag-drop reorder handlers */
  onBlockDragStart: (blockId: string, sectionId: string) => void
  onBlockDrop:      (targetSectionId: string, afterBlockId: string | null) => void
  onDragOver:       (e: React.DragEvent) => void
  isDragOver:       boolean
}

/**
 * Memoized wrapper around SectionRenderer.
 * Re-renders only when one of its specific props changes.
 * Adds insert indicators between blocks and drag-and-drop support.
 */
const SectionRow = memo(function SectionRow({
  section,
  isSelected,
  isHovered,
  isPreview,
  isHighlighted,
  highlightColor,
  selectedBlockId,
  onSectionClick,
  onMouseEnter,
  onMouseLeave,
  onDelete,
  onInsertBlock,
  onBlockDragStart,
  onBlockDrop,
  onDragOver,
  isDragOver,
}: SectionRowProps) {
  const sorted = [...section.blocks].sort((a, b) => a.order - b.order)
  const [dropAfter, setDropAfter] = useState<string | null | 'none'>('none')  // null = before first

  // ── Block picker state (Improvement 2) ───────────────────────────────────
  // null = closed; string = insert after this blockId ('' = prepend)
  const [pickerAfterBlockId, setPickerAfterBlockId] = useState<string | null>(null)
  // Bounding rect of the trigger element — used to position the portaled picker
  const [pickerTriggerRect, setPickerTriggerRect] = useState<DOMRect | null>(null)

  // ── Block hover state for context toolbar (Improvement 3) ────────────────
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null)

  // ── Ref map for draggable block wrappers — used by drag handle ────────────
  // Keyed by block.id so the toolbar handle can initiate drag on the correct wrapper.
  const draggableRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // ── "/" keyboard shortcut from InlineTextEditor opens picker ──────────────
  // InlineTextEditor fires 'atelier:open-picker' with blockId detail.
  // SectionRow listens and opens its picker only if the block belongs here.
  useEffect(() => {
    const handler = (e: Event) => {
      const { blockId } = (e as CustomEvent<{ blockId: string }>).detail ?? {}
      if (blockId && section.blocks.some(b => b.id === blockId)) {
        setPickerAfterBlockId(blockId)
      }
    }
    window.addEventListener('atelier:open-picker', handler)
    return () => window.removeEventListener('atelier:open-picker', handler)
  }, [section.blocks])

  const handleDragOver = (e: React.DragEvent, afterId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    onDragOver(e)
    setDropAfter(afterId === null ? null : afterId)
  }

  const handleDrop = (e: React.DragEvent, afterId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDropAfter('none')
    onBlockDrop(section.id, afterId)
  }

  return (
    <div
      onClick={e => onSectionClick(section.id, e)}
      onMouseEnter={() => onMouseEnter(section.id)}
      onMouseLeave={() => { onMouseLeave(); setDropAfter('none') }}
      onDragLeave={() => setDropAfter('none')}
      style={{
        position:     'relative',
        marginBottom: 8,
        border:       isSelected ? '2px solid #C9A84C' : isDragOver ? '2px solid rgba(96,165,250,0.4)' : '2px solid transparent',
        borderRadius: 8,
        transition:   'border-color 0.14s ease',
      }}
    >
      {/* Section label bar */}
      {(isHovered || isSelected) && (
        <div style={{
          position:'absolute', top:-22, left:0, right:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'2px 8px',
          background:'rgba(11,11,16,0.85)',
          borderRadius:'6px 6px 0 0',
          backdropFilter:'blur(4px)',
          zIndex:10,
          pointerEvents:'auto',
        }}>
          <span style={{ fontSize:9, color:'#C9A84C', letterSpacing:'0.1em', textTransform:'uppercase' }}>
            {(section as any).label || section.type} · {section.blocks.length} block{section.blocks.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={e => onDelete(section.id, e)}
            title="Delete section"
            style={{ background:'none', border:'none', color:'rgba(255,255,255,0.45)', cursor:'pointer', fontSize:12, padding:'0 4px', lineHeight:1, transition:'color 160ms ease' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.85)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Unified rendering path ───────────────────────────────────────────
          Both live editing and preview use SectionRenderer for the section
          shell (settings, className, background, padding). In live mode we
          pass the block list with interaction chrome as children; in preview
          mode we omit children so SectionRenderer renders plain BlockRenderers.
          This guarantees editor and preview are visually identical.           */}
      <SectionRenderer section={section}>
        {!isPreview ? (
          <>
            {/* Insert indicator before first block */}
            <div
              onDragOver={e => handleDragOver(e, null)}
              onDrop={e => handleDrop(e, null)}
            >
              <InsertIndicator
                onInsert={(e?: React.MouseEvent) => {
                  setPickerTriggerRect((e?.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null)
                  setPickerAfterBlockId('')
                }}
                active={dropAfter === null}
                style={{ marginBottom: 2 }}
              />
            </div>

            {sorted.map((block) => (
              <div
                key={block.id}
                style={{ position: 'relative' }}
                onMouseEnter={() => setHoveredBlockId(block.id)}
                onMouseLeave={() => setHoveredBlockId((prev: string | null) => prev === block.id ? null : prev)}
              >
                {/* BlockContextToolbar — shortcut actions on hover/selection */}
                {(hoveredBlockId === block.id || selectedBlockId === block.id) && (
                  <BlockContextToolbar
                    onDuplicate={() => {
                      engine.enqueuePatch({ op: 'duplicate' as any, target: 'block' as any, id: block.id, meta: { source: 'toolbar' } } as any)
                    }}
                    onDelete={() => {
                      engine.enqueuePatch({ op: 'remove', target: 'block', id: block.id, meta: { source: 'toolbar' } } as any)
                    }}
                    onInsertBelow={(e?: React.MouseEvent) => {
                      setPickerTriggerRect((e?.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null)
                      setPickerAfterBlockId(block.id)
                    }}
                    onAiImprove={(e?: React.MouseEvent) => {
                      const rect = (e?.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null
                      window.dispatchEvent(new CustomEvent('atelier:open-ai', { detail: { rect } }))
                    }}
                    strategyDims={getStrategyChips(block.type)}
                    suggestionChips={getSuggestionChips(block.id)}
                    onDragStart={undefined}
                  />
                )}
                {/* BlockPicker rendered as portal — see portaled picker below SectionRow */}
                {/* Draggable block wrapper — drag moves the block, BlockRenderer renders it */}
                <div
                  ref={el => {
                    if (el) draggableRefs.current.set(block.id, el)
                    else draggableRefs.current.delete(block.id)
                  }}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('application/atelier-block', block.id)
                    onBlockDragStart(block.id, section.id)
                    const source = e.currentTarget as HTMLElement
                    const ghost  = source.cloneNode(true) as HTMLElement
                    ghost.style.cssText = [
                      'position:fixed', 'top:-9999px', 'left:-9999px',
                      'opacity:0.45', `width:${source.offsetWidth}px`,
                      'pointer-events:none', 'border-radius:6px',
                      'box-shadow:0 8px 24px rgba(0,0,0,0.18)',
                      'background:var(--color-surface,#fff)',
                    ].join(';')
                    document.body.appendChild(ghost)
                    e.dataTransfer.setDragImage(ghost, 16, 16)
                    requestAnimationFrame(() => document.body.removeChild(ghost))
                    source.style.opacity = '0.35'
                  }}
                  onDragEnd={e => { ;(e.currentTarget as HTMLElement).style.opacity = '1' }}
                >
                  <BlockRenderer block={block} />
                </div>

                {/* Insert indicator after this block */}
                <div
                  onDragOver={e => handleDragOver(e, block.id)}
                  onDrop={e => handleDrop(e, block.id)}
                >
                  <InsertIndicator
                    onInsert={(e?: React.MouseEvent) => {
                      setPickerTriggerRect((e?.currentTarget as HTMLElement)?.getBoundingClientRect() ?? null)
                      setPickerAfterBlockId(block.id)
                    }}
                    active={dropAfter === block.id}
                    style={{ marginTop: 2 }}
                  />
                </div>
              </div>
            ))}
          </>
        ) : undefined}
      </SectionRenderer>

      {/* Highlight ring — AI changed blocks or timeline hover */}
      {isPreview && isHighlighted && (
        <div style={{
          position:      'absolute',
          inset:         0,
          borderRadius:  8,
          border:        `2px solid ${highlightColor}`,
          pointerEvents: 'none',
          boxShadow:     `0 0 16px 0 ${highlightColor.replace('0.5', '0.12')}`,
        }} />
      )}

      {/* ── Portaled BlockPicker ────────────────────────────────────────────
          Rendered into .atelier-canvas-interaction (the InteractionLayer)
          so it is never clipped by the scroll container.
          Position is fixed to the trigger's bounding rect.               */}
      {pickerAfterBlockId !== null && createPortal(
        <BlockPicker
          onSelect={type => {
            if (pickerAfterBlockId === '') onInsertBlock(section.id, null, type)
            else onInsertBlock(section.id, pickerAfterBlockId, type)
            setPickerAfterBlockId(null)
            setPickerTriggerRect(null)
          }}
          onDismiss={() => { setPickerAfterBlockId(null); setPickerTriggerRect(null) }}
          sectionLabel={(section as any).label || section.type}
          style={pickerTriggerRect ? {
            position: 'fixed',
            top:      pickerTriggerRect.bottom + 4,
            left:     Math.min(
              pickerTriggerRect.left,
              (typeof window !== 'undefined' ? window.innerWidth : 800) - 220,
            ),
          } : undefined}
        />,
        // Portal target: use the stable React ref to InteractionLayer.
        // Falls back to document.body if the ref hasn't mounted yet.
        interactionLayerRef.current ?? document.body,
      )}
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// EditorCanvas
// ─────────────────────────────────────────────────────────────────────────────

export function EditorCanvas() {

  // ── Normalized live-document section state ──────────────────────────────
  const [norm, setNorm] = React.useState<NormalizedSections>(
    () => normalizeSections(engine.getDocument().sections)
  )

  React.useEffect(() => engine.subscribe(d => {
    const newOrder = [...d.sections].sort((a, b) => a.order - b.order).map(s => s.id)

    setNorm(prev => {
      let changed     = false
      const byId      = { ...prev.byId }
      const prints    = { ...prev.fingerprints }
      const incomingIds = new Set(d.sections.map(s => s.id))

      // Remove deleted sections
      for (const id of Object.keys(byId)) {
        if (!incomingIds.has(id)) { delete byId[id]; delete prints[id]; changed = true }
      }

      // Update or add changed sections
      for (const s of d.sections) {
        const fp = fingerprint(s)
        if (fp !== prints[s.id]) {
          byId[s.id]   = structuredClone(s)  // new stable reference for changed section
          prints[s.id] = fp
          changed = true
        }
        // unchanged section: byId[s.id] keeps its old reference → SectionRow memo skips it
      }

      // Check order change
      const orderChanged = prev.order.length !== newOrder.length
        || prev.order.some((id, i) => id !== newOrder[i])
      if (orderChanged) changed = true

      if (!changed) return prev
      return { byId, order: newOrder, fingerprints: prints }
    })
  }), [])

  // ── AI preview ───────────────────────────────────────────────────────────
  const aiPreviewActive = useAIPreviewStore(s => s.active)
  const aiPreviewDoc    = useAIPreviewStore(s => s.previewDoc)
  const aiChangedIds       = useAIPreviewStore(s => s.changedBlockIds)
  const suggestionIds      = useSuggestionHighlightStore(s => s.highlightedIds)

  const previewActive = aiPreviewActive
  const previewDoc    = aiPreviewActive ? aiPreviewDoc : null

  // Priority: AI changed > suggestion hover
  const highlightIds   = aiPreviewActive ? aiChangedIds
                       : suggestionIds.size > 0 ? suggestionIds
                       : new Set<string>()
  const highlightColor = aiPreviewActive ? 'rgba(167,139,250,0.5)'
                       : 'rgba(248,113,113,0.5)'

  // ── During preview: use previewDoc sections directly (normalized live sections otherwise)
  const previewSorted = useMemo(() => {
    if (!previewActive || !previewDoc) return null
    return [...previewDoc.sections].sort((a, b) => a.order - b.order)
  }, [previewActive, previewDoc])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts()

  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedBlockId   = useSelectionStore(s => s.selectedBlockId)
  const selectedSectionId = useSelectionStore(s => s.selectedSectionId)
  const selectBlock       = useSelectionStore(s => s.selectBlock)
  const selectSection     = useSelectionStore(s => s.selectSection)
  const clearSelection    = useSelectionStore(s => s.clearSelection)

  const [hoveredSec, setHoveredSec] = useState<string | null>(null)

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const dragRef = useRef<{ blockId: string; fromSection: string } | null>(null)
  const [dragOverSection, setDragOverSection] = useState<string | null>(null)

  const handleBlockDragStart = useCallback((blockId: string, sectionId: string) => {
    dragRef.current = { blockId, fromSection: sectionId }
    setDragOverSection(sectionId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleBlockDrop = useCallback((targetSectionId: string, afterBlockId: string | null) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDragOverSection(null)

    // Determine target index
    const doc = engine.getDocument()
    const targetSection = doc.sections.find(s => s.id === targetSectionId)
    if (!targetSection) return

    const sorted = [...targetSection.blocks].sort((a, b) => a.order - b.order)
    const afterIdx = afterBlockId ? sorted.findIndex(b => b.id === afterBlockId) : -1
    const targetIndex = afterIdx + 1   // 0 = prepend, afterIdx+1 = after that block

    engine.enqueuePatch({
      op:          'move-block',
      blockId:     drag.blockId,
      fromSection: drag.fromSection,
      toSection:   targetSectionId,
      position:    { placement: 'index' as any, index: targetIndex },
      meta:        { source: 'editor' },
    } as any)
  }, [])

  // ── Insert block ──────────────────────────────────────────────────────────
  const handleInsertBlock = useCallback((sectionId: string, afterBlockId: string | null, _blockType: string) => {
    // Default to text block; future: open BlockLibrary picker
    const doc = engine.getDocument()
    const section = doc.sections.find(s => s.id === sectionId)
    if (!section) return

    const sorted  = [...section.blocks].sort((a, b) => a.order - b.order)
    const afterIdx = afterBlockId ? sorted.findIndex(b => b.id === afterBlockId) : -1
    const placement = afterBlockId ? 'after' : 'start'

    engine.enqueuePatch({
      op:       'add',
      target:   'block',
      data:     {
        type:            'text',
        parentSectionId: sectionId,
        content:         { text: '', format: 'plain' },
      },
      position: afterBlockId
        ? { placement: 'after', ref: afterBlockId }
        : { placement: 'start' },
      meta: { source: 'editor' },
    })
  }, [])

  // ── Stable callbacks ──────────────────────────────────────────────────────
  const handleSectionClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation(); selectSection(id)
  }, [selectSection])

  const handleMouseEnter = useCallback((id: string) => setHoveredSec(id), [])
  const handleMouseLeave = useCallback(() => setHoveredSec(null), [])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null
    if (blockEl) { e.stopPropagation(); selectBlock(blockEl.getAttribute('data-block-id')); return }
    clearSelection()
  }, [selectBlock, clearSelection])

  const handlePatch = useCallback((patch: unknown) => {
    engine.enqueuePatch(patch as any)
  }, [])

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    engine.enqueuePatch({ op: 'remove', target: 'section', id, meta: { source: 'editor' } })
    if (selectedSectionId === id) selectSection(null)
  }, [selectedSectionId, selectSection])

  // ── Add section — fired by SectionInsertIndicator ─────────────────────────
  const handleAddSection = useCallback((afterSectionId: string | null) => {
    engine.enqueuePatch({
      op:       'add',
      target:   'section',
      data:     { type: 'blank' },
      position: afterSectionId
        ? { placement: 'after' as const, ref: afterSectionId }
        : { placement: 'end' as const },
      meta:     { source: 'editor' },
    } as any)
  }, [])

  // ── Derived: is the page empty? ───────────────────────────────────────────
  const isEmpty = previewActive
    ? (previewDoc?.sections.length ?? 0) === 0
    : norm.order.length === 0

  // ── Empty state ──────────────────────────────────────────────────────────
  if (isEmpty) {
    return (
      <RendererProvider context={{ isEditing: true, selectedBlockId: selectedBlockId ?? undefined, onPatch: handlePatch }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12, fontFamily:'var(--font-ui)', textAlign:'center', padding:'0 40px' }}>
          <div style={{ fontSize:36, opacity:0.18, color:'var(--color-accent)' }}>✦</div>
          <div style={{ fontSize:14, fontWeight:500, color:'var(--color-text-secondary)', letterSpacing:'-0.01em' }}>
            ページはまだ空です
          </div>
          <div style={{ fontSize:11, color:'var(--color-text-ghost)', lineHeight:1.7, maxWidth:260 }}>
            AIに指示してページを生成するか、<br />左のサイドバーからブロックを選んで追加できます
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('atelier:open-ai'))}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              background: 'var(--color-accent)',
              color: 'rgba(248,245,240,0.95)',
              border: 'none',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              letterSpacing: '0.02em',
            }}
          >
            ✦ AIでページを生成する
          </button>
        </div>
      </RendererProvider>
    )
  }

  return (
    <RendererProvider context={{ isEditing: !previewActive, selectedBlockId: selectedBlockId ?? undefined, onPatch: handlePatch }}>
      <div style={{ position: 'relative', minHeight: '100%' }}>

        {/* Preview banner — shown during AI preview */}
        {aiPreviewActive && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }}>
              <PreviewBanner />
            </div>
          </div>
        )}

        <div
          onClick={handleCanvasClick}
          style={{
            padding: '60px 80px', minHeight: '100%',
            background:  previewActive ? 'var(--color-surface-3)' : 'var(--color-surface)',
            opacity:     previewActive ? 0.93 : 1,
            transition:  'opacity 0.2s',
            fontFamily:  'var(--font-ui)',
          }}
        >
          {/* Preview path — full previewDoc sections, no memo optimization needed */}
          {previewActive && previewSorted ? (
            previewSorted.map(s => (
              <SectionRow
                key={s.id}
                section={s}
                isSelected={selectedSectionId === s.id}
                isHovered={hoveredSec === s.id}
                isPreview={true}
                isHighlighted={s.blocks.some(b => highlightIds.has(b.id))}
                highlightColor={highlightColor}
                selectedBlockId={selectedBlockId}
                onSectionClick={handleSectionClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onDelete={handleDelete}
                onInsertBlock={handleInsertBlock}
                onBlockDragStart={handleBlockDragStart}
                onBlockDrop={handleBlockDrop}
                onDragOver={handleDragOver}
                isDragOver={dragOverSection === s.id}
              />
            ))
          ) : (
            /* Live path — normalized sections with SectionInsertIndicators between them */
            <>
              {/* Insert before first section */}
              {!previewActive && (
                <SectionInsertIndicator
                  onInsert={() => handleAddSection(null)}
                  style={{ marginBottom: 4 }}
                />
              )}
              {norm.order.map(id => {
                const s = norm.byId[id]
                if (!s) return null
                return (
                  <React.Fragment key={id}>
                    <SectionRow
                      section={s}
                      isSelected={selectedSectionId === id}
                      isHovered={hoveredSec === id}
                      isPreview={false}
                      isHighlighted={s.blocks.some(b => highlightIds.has(b.id))}
                      highlightColor={highlightColor}
                      selectedBlockId={selectedBlockId}
                      onSectionClick={handleSectionClick}
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave}
                      onDelete={handleDelete}
                      onInsertBlock={handleInsertBlock}
                      onBlockDragStart={handleBlockDragStart}
                      onBlockDrop={handleBlockDrop}
                      onDragOver={handleDragOver}
                      isDragOver={dragOverSection === id}
                    />
                    {/* Insert after each section */}
                    {!previewActive && (
                      <SectionInsertIndicator
                        onInsert={() => handleAddSection(id)}
                        style={{ marginTop: 4, marginBottom: 4 }}
                      />
                    )}
                  </React.Fragment>
                )
              })}
            </>
          )}
        </div>
      </div>
    </RendererProvider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PreviewBanner
// ─────────────────────────────────────────────────────────────────────────────

function PreviewBanner() {
  const patchCount       = useAIPreviewStore(s => s.patchCount)
  const pendingPatches   = useAIPreviewStore(s => s.pendingPatches)
  const selectedPatchIds = useAIPreviewStore(s => s.selectedPatchIds)
  const commit           = useAIPreviewStore(s => s.commit)
  const discard          = useAIPreviewStore(s => s.discard)

  const sectionIds = new Set(
    pendingPatches
      .filter(p => 'target' in p && (p as any).target === 'block')
      .map(p => (p as any).data?.parentSectionId).filter(Boolean)
  )
  pendingPatches
    .filter(p => 'target' in p && (p as any).target === 'section' && 'id' in p)
    .forEach(p => sectionIds.add((p as any).id))
  const sectionsAffected = sectionIds.size || (patchCount > 0 ? 1 : 0)
  const nSelected        = selectedPatchIds.size

  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'10px 24px',
      background:'rgba(11,11,16,0.95)',
      borderBottom:'1px solid rgba(201,168,76,0.3)',
      backdropFilter:'blur(6px)',
      fontFamily:'var(--font-ui)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:13, color:'#C9A84C' }}>✦</span>
        <div>
          <span style={{ fontSize:11, color:'#C9A84C', letterSpacing:'0.06em' }}>AIプレビュー</span>
          <span style={{ fontSize:9, color:'#4A4844', marginLeft:8 }}>
            {patchCount}件の変更 · {sectionsAffected}セクション
            {nSelected < patchCount ? ` · ${nSelected}件選択中` : ''}
          </span>
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={discard} style={{ padding:'5px 14px', background:'transparent', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, color:'#7A7870', cursor:'pointer', fontSize:10, fontFamily:'var(--font-ui)' }}>
          破棄
        </button>
        <button
          onClick={() => commit()}
          disabled={nSelected === 0}
          style={{ padding:'5px 14px', background: nSelected === 0 ? 'rgba(255,255,255,0.04)' : '#C9A84C', border: nSelected === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', borderRadius:7, color: nSelected === 0 ? '#3A3834' : '#0B0B10', cursor: nSelected === 0 ? 'default' : 'pointer', fontSize:10, fontFamily:'var(--font-ui)', fontWeight:700, letterSpacing:'0.04em' }}
        >
          {nSelected === 0 ? '未選択' : `${nSelected}件を適用`}
        </button>
      </div>
    </div>
  )
}
