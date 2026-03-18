'use client'
/**
 * ATELIER CMS — Strategy Panel
 *
 * Visualizes the ABCDE strategic energy analysis of the current document.
 *
 * Features:
 *   1. Energy bars (C1–C5) with animated fill
 *   2. Section contribution highlight — hover a metric to highlight contributing
 *      blocks in the canvas via selectionStore
 *   3. Strategic warnings when dimensions fall below threshold
 *   4. Quick-suggestion buttons that generate patches via engine.enqueuePatch()
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • analyzeDocument() is pure — no mutations
 * • Quick-fix buttons are the only code that calls engine.enqueuePatch()
 * • All other interactions are read-only
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { engine }                        from '@/core/document/engineInstance'
import { analyzeDocument }               from '@/analysis/ABCDEAnalyzer'
import { getBlockIdsForDimension, highlightDescription } from '@/analysis/StrategyHighlighter'
import { useStrategyHighlightStore }     from '@/editor/state/strategyHighlightStore'
import { useSelectionStore }             from '@/editor/selection/selectionStore'
import type { ABCDEResult, ABCDEKey }    from '@/analysis/AnalysisTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Dimension config
// ─────────────────────────────────────────────────────────────────────────────

const DIMS: Array<{
  key:    ABCDEKey
  label:  string
  detail: string
  color:  string
  cssVar: string
}> = [
  { key: 'C1', label: 'Action',      detail: 'Conversion intent and call-to-action strength',  color: '#F59E0B', cssVar: 'var(--color-energy-action)'  },
  { key: 'C2', label: 'Trust',       detail: 'Social proof, community signals, credibility',   color: '#10B981', cssVar: 'var(--color-energy-trust)'   },
  { key: 'C3', label: 'Purpose',     detail: 'Mission, narrative, and philosophical depth',    color: '#8B5CF6', cssVar: 'var(--color-energy-purpose)' },
  { key: 'C4', label: 'Information', detail: 'Facts, features, and clarity of offering',       color: '#3B82F6', cssVar: 'var(--color-energy-info)'    },
  { key: 'C5', label: 'Emotion',     detail: 'Imagery, aspiration, and felt experience',       color: '#F472B6', cssVar: 'var(--color-energy-emotion)' },
]

/** Score below this triggers a strategic gap warning. */
const LOW_THRESHOLD = 0.08

// ─────────────────────────────────────────────────────────────────────────────
// Warning config — one per dimension
// ─────────────────────────────────────────────────────────────────────────────

interface Warning {
  dim:        ABCDEKey
  message:    string
  fix:        string   // button label
  patch:      object   // passed to engine.enqueuePatch()
}

function buildWarnings(result: ABCDEResult, lastSectionId: string): Warning[] {
  const warnings: Warning[] = []
  if (result.C1 < LOW_THRESHOLD) {
    warnings.push({
      dim:     'C1',
      message: 'Weak conversion structure — no clear call to action.',
      fix:     'Add CTA block',
      patch: {
        op: 'add', target: 'block',
        data: { type: 'cta', parentSectionId: lastSectionId,
          content: { headline: 'Ready to get started?', primaryText: 'Get Started', primaryUrl: '#' } },
        position: { placement: 'end' },
        meta: { source: 'editor' },
      },
    })
  }
  if (result.C2 < LOW_THRESHOLD) {
    warnings.push({
      dim:     'C2',
      message: 'Lacks trust signals — no social proof or relational content.',
      fix:     'Add text with trust signals',
      patch: {
        op: 'add', target: 'block',
        data: { type: 'text', parentSectionId: lastSectionId,
          content: { text: 'Trusted by our community of clients and partners.', format: 'plain' } },
        position: { placement: 'end' },
        meta: { source: 'editor' },
      },
    })
  }
  if (result.C3 < LOW_THRESHOLD) {
    warnings.push({
      dim:     'C3',
      message: 'No narrative or philosophical structure — purpose is unclear.',
      fix:     'Add mission section',
      patch: {
        op: 'add', target: 'block',
        data: { type: 'text', parentSectionId: lastSectionId,
          content: { text: 'Our mission is to make a meaningful impact through thoughtful work.', format: 'plain' } },
        position: { placement: 'end' },
        meta: { source: 'editor' },
      },
    })
  }
  return warnings
}

// ─────────────────────────────────────────────────────────────────────────────
// EnergyBar
// ─────────────────────────────────────────────────────────────────────────────

interface EnergyBarProps {
  dim:          ABCDEKey
  label:        string
  detail:       string
  color:        string
  cssVar:       string
  value:        number
  isDominant:   boolean
  blockIds:     string[]
  onHoverStart: (dim: ABCDEKey) => void
  onHoverEnd:   () => void
}

function EnergyBar({ dim, label, detail, color, cssVar, value, isDominant, blockIds, onHoverStart, onHoverEnd }: EnergyBarProps) {
  const [hovered, setHovered] = useState(false)
  const pct   = Math.round(value * 100)
  const isLow = value < LOW_THRESHOLD

  return (
    <div
      className="atelier-energy-bar"
      onMouseEnter={() => { setHovered(true); onHoverStart(dim) }}
      onMouseLeave={() => { setHovered(false); onHoverEnd() }}
      style={{
        background: hovered ? `color-mix(in srgb, ${color} 7%, transparent)` : 'transparent',
        outline:    hovered ? `1px solid color-mix(in srgb, ${color} 20%, transparent)` : '1px solid transparent',
        outlineOffset: 0,
      }}
    >
      {/* Label row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {/* Colour dot */}
          <div style={{ width:6, height:6, borderRadius:'50%', background:cssVar, opacity: isDominant ? 1 : 0.5, flexShrink:0 }} />
          <span style={{
            fontSize:   'var(--text-sm)',
            fontFamily: 'var(--font-ui)',
            fontWeight: isDominant ? 600 : 400,
            color:      isDominant ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          }}>
            {label}
          </span>
          {isLow && (
            <span style={{ fontSize:'var(--text-xs)', color:'var(--color-danger)', fontWeight:500 }}>
              low
            </span>
          )}
          {isDominant && (
            <span style={{ fontSize:9, color, fontWeight:500, opacity:0.8 }}>
              ↑
            </span>
          )}
        </div>
        <span className="atelier-strategy-label" style={{ color: isDominant ? color : 'var(--color-text-tertiary)' }}>
          {pct}%
        </span>
      </div>

      {/* Track + fill */}
      <div className="atelier-energy-track">
        <div
          className="atelier-energy-fill"
          style={{
            width:      `${pct}%`,
            background: isLow ? 'var(--color-danger)' : cssVar,
            opacity:    isDominant ? 1 : 0.6,
          }}
        />
      </div>

      {/* Detail + block count */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
        <span style={{ fontSize:'var(--text-xs)', color:'var(--color-text-tertiary)' }}>{detail}</span>
        {blockIds.length > 0 && (
          <span style={{
            fontSize: 9,
            color:    hovered ? color : 'var(--color-text-ghost)',
            fontFamily: 'var(--font-mono)',
            transition: 'color var(--duration-fast)',
          }}>
            {blockIds.length} block{blockIds.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StrategyPanel
// ─────────────────────────────────────────────────────────────────────────────

export function StrategyPanel() {
  const [result, setResult] = useState<ABCDEResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setHighlight   = useStrategyHighlightStore(s => s.setHighlight)
  const clearHighlight = useStrategyHighlightStore(s => s.clearHighlight)

  // ── Selected block context ─────────────────────────────────────────────────
  const selectedBlockId = useSelectionStore(s => s.selectedBlockId)

  const analyze = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setResult(analyzeDocument(engine.getDocument()))
    }, 500)
  }, [])

  useEffect(() => {
    analyze()
    const unsub = engine.subscribe(analyze)
    return () => { unsub(); if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [analyze])

  // Hover highlight: use StrategyHighlighter to find all blocks of contributing types
  const handleHoverStart = useCallback((dim: ABCDEKey) => {
    const ids = getBlockIdsForDimension(engine.getDocument(), dim)
    setHighlight(ids)
  }, [setHighlight])

  const handleHoverEnd = useCallback(() => {
    clearHighlight()
  }, [clearHighlight])

  // Quick-fix: dispatch patch via engine
  const handleFix = useCallback((patch: object) => {
    engine.enqueuePatch(patch as any)
  }, [])

  if (!result) {
    return (
      <div style={{ padding:'32px 16px', textAlign:'center', color:'#2A2824', fontSize:11, fontFamily:'DM Mono,monospace' }}>
        Analyzing…
      </div>
    )
  }

  const doc          = engine.getDocument()
  const lastSectionId = doc.sections.length > 0
    ? [...doc.sections].sort((a, b) => a.order - b.order).at(-1)!.id
    : ''

  const warnings = doc.sections.length > 0 ? buildWarnings(result, lastSectionId) : []

  return (
    <div style={{ fontFamily:'DM Mono,monospace', height:'100%', overflowY:'auto' }}>

      {/* ── Block contribution context ─────────────────────────────────────
          Shown when a block is selected. Reads from result.blocksByDim
          (already computed) — no new analysis triggered.                  */}
      {selectedBlockId && result && (() => {
        const dimKeys = (Object.keys(result.blocksByDim) as ABCDEKey[])
          .filter(k => result.blocksByDim[k].includes(selectedBlockId))
        const dimInfo = DIMS.filter(d => dimKeys.includes(d.key))
        return (
          <div style={{
            padding:      '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background:   'rgba(201,168,76,0.04)',
          }}>
            <div style={{ fontSize:8, color:'#4A4844', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>
              Selected block contributes to
            </div>
            {dimInfo.length > 0 ? (
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {dimInfo.map(d => (
                  <span key={d.key} style={{
                    display:      'inline-flex',
                    alignItems:   'center',
                    gap:          4,
                    padding:      '2px 7px',
                    borderRadius: 4,
                    fontSize:     9,
                    fontFamily:   'DM Mono,monospace',
                    background:   `${d.color}18`,
                    border:       `1px solid ${d.color}40`,
                    color:        d.color,
                  }}>
                    <span>{d.key}</span>
                    <span style={{ opacity:0.7 }}>{d.label}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize:9, color:'#3A3834', opacity:0.6 }}>
                No direct strategy contribution detected.
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ padding:'10px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:9, color:'#4A4844', letterSpacing:'0.15em', textTransform:'uppercase' }}>
            Strategic Energy
          </span>
          <span style={{ fontSize:8, color: result.isBalanced ? '#34d399' : '#fbbf24', opacity:0.8 }}>
            {result.isBalanced ? '◉ balanced' : '◯ unbalanced'}
          </span>
        </div>
        <div style={{ fontSize:9, color:'#2A2824', marginTop:4, lineHeight:1.5 }}>
          How balanced is your page's strategic energy?
        </div>
        {result.dominant && (
          <div style={{ fontSize:9, color:'#3A3834', marginTop:2 }}>
            Dominant: <span style={{ color: DIMS.find(d => d.key === result.dominant)?.color }}>{DIMS.find(d => d.key === result.dominant)?.label}</span> ({result.dominant})
          </div>
        )}
      </div>

      {/* ── Energy bars ───────────────────────────────────────────────────── */}
      <div style={{ padding:'4px 0' }}>
        {DIMS.map(d => (
          <EnergyBar
            key={d.key}
            dim={d.key}
            label={d.label}
            detail={d.detail}
            color={d.color}
            cssVar={d.cssVar}
            value={result[d.key]}
            isDominant={result.dominant === d.key}
            blockIds={result.blocksByDim[d.key]}
            onHoverStart={handleHoverStart}
            onHoverEnd={handleHoverEnd}
          />
        ))}
      </div>

      {/* ── Warnings + quick fixes ────────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div style={{ padding:'0 14px 14px' }}>
          <div style={{ fontSize:9, color:'#3A3834', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>
            Strategy Gaps
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {warnings.map(w => {
              const dim = DIMS.find(d => d.key === w.dim)!
              return (
                <div key={w.dim} style={{
                  padding:      '8px 10px',
                  borderRadius: 7,
                  background:   'rgba(248,113,113,0.04)',
                  border:       '1px solid rgba(248,113,113,0.12)',
                }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:6 }}>
                    <span style={{ fontSize:8, color: dim.color, marginTop:1, flexShrink:0 }}>◆</span>
                    <span style={{ fontSize:10, color:'#C8C4BC', lineHeight:1.45 }}>
                      {w.message}
                    </span>
                  </div>
                  <button
                    onClick={() => handleFix(w.patch)}
                    disabled={!lastSectionId}
                    style={{
                      width:        '100%',
                      padding:      '5px 10px',
                      background:   lastSectionId ? `${dim.color}12` : 'rgba(255,255,255,0.03)',
                      border:       `1px solid ${lastSectionId ? `${dim.color}30` : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: 5,
                      color:        lastSectionId ? dim.color : '#3A3834',
                      cursor:       lastSectionId ? 'pointer' : 'not-allowed',
                      fontSize:     9,
                      fontFamily:   'DM Mono,monospace',
                      fontWeight:   700,
                      letterSpacing:'0.06em',
                      textAlign:    'left',
                    }}
                  >
                    + {w.fix}
                  </button>
                  {!lastSectionId && (
                    <div style={{ fontSize:8, color:'#2A2824', marginTop:4 }}>
                      Add a section first to enable this fix.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {warnings.length === 0 && result.isBalanced && (
        <div style={{ padding:'0 14px 14px' }}>
          <div style={{
            padding:'8px 10px', borderRadius:7,
            background:'rgba(52,211,153,0.04)', border:'1px solid rgba(52,211,153,0.12)',
            fontSize:9, color:'#34d399',
          }}>
            ◉ No strategic gaps detected.
          </div>
        </div>
      )}

    </div>
  )
}
