'use client'
/**
 * ATELIER CMS — Timeline Panel (with Strategy Evolution)
 *
 * Displays edit history with:
 *   1. Actor visualization — icons + colour per actor type
 *   2. Relative timestamps and time grouping
 *   3. Patch diff preview (+ / ~ / −)
 *   4. Strategy delta per record (ΔC1, ΔC2, …)
 *   5. Strategy evolution graph across all versions
 *   6. Replay preview with strategy metrics at that version
 *   7. Hover canvas highlight for affected blocks
 *   8. Restore button
 *
 * INVARIANT: This panel is READ-ONLY.
 * It never calls engine.enqueuePatch() or modifies the live document.
 * Restore uses timelinePreviewStore.restoreTo() → engine.loadDocument().
 * Strategy analysis uses analyzeDocument() — pure function.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { timelineEngine }            from '@/system/timeline/TimelineEngine'
import { useTimelinePreviewStore }   from './timelinePreviewStore'
import { strategyCache }             from '@/analysis/StrategyCache'
import { analyzeDocument }           from '@/analysis/ABCDEAnalyzer'
import type { PatchRecord }          from '@/system/timeline/PatchRecord'
import type { Patch }                from '@/core/patch/types'
import type { StrategySnapshot, StrategyDelta } from '@/analysis/StrategyCache'
import type { ABCDEKey }             from '@/analysis/AnalysisTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ACTOR: Record<string, { color: string; icon: string; label: string }> = {
  editor:     { color: '#C9A84C', icon: '✎',  label: 'Human'      },
  ai:         { color: '#a78bfa', icon: '✦',  label: 'AI'         },
  automation: { color: '#34d399', icon: '⚙',  label: 'Automation' },
  plugin:     { color: '#60a5fa', icon: '⊞',  label: 'Plugin'     },
  system:     { color: '#4A4844', icon: '◈',  label: 'System'     },
}
const actorMeta = (type?: string) => ACTOR[type ?? 'system'] ?? ACTOR.system

// Strategy dimension colours — must match StrategyPanel
const DIM_COLOR: Record<ABCDEKey, string> = {
  C1: '#f87171', C2: '#34d399', C3: '#a78bfa', C4: '#60a5fa', C5: '#fbbf24',
}
const DIM_LABEL: Record<ABCDEKey, string> = {
  C1: 'Action', C2: 'Trust', C3: 'Purpose', C4: 'Info', C5: 'Emotion',
}
const DIMS: ABCDEKey[] = ['C1', 'C2', 'C3', 'C4', 'C5']

// Only show C1/C2/C3 in compact views (spec focuses on these three)
const COMPACT_DIMS: ABCDEKey[] = ['C1', 'C2', 'C3']

type TimeGroup = 'Just now' | 'Recent' | 'Today' | 'Yesterday' | 'Older'
const GROUP_ORDER: TimeGroup[] = ['Just now', 'Recent', 'Today', 'Yesterday', 'Older']

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeGroup(iso: string): TimeGroup {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 120_000)   return 'Just now'
  if (diff < 3_600_000) return 'Recent'
  const today = new Date(); today.setHours(0,0,0,0)
  const yday  = new Date(today); yday.setDate(yday.getDate() - 1)
  const ts    = new Date(iso)
  if (ts >= today)      return 'Today'
  if (ts >= yday)       return 'Yesterday'
  return 'Older'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)   return `${Math.round(diff / 1000)}s`
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}m`
  return new Date(iso).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
}

const BLOCK_LABELS: Record<string, string> = {
  hero: 'hero', text: 'text', cta: 'CTA', faq: 'FAQ',
  'feature-list': 'features', image: 'image', gallery: 'gallery',
}
function describeOnePatch(p: Patch): string {
  const target = 'target' in p ? (p as any).target as string : ''
  const type   = (p as any).data?.type as string | undefined
  if (p.op === 'add')    return `add ${type ? (BLOCK_LABELS[type] ?? type) : target}`
  if (p.op === 'update') {
    if (target === 'page') return 'update page'
    const content = (p as any).data?.content
    if (content?.title) return 'update headline'
    if (content?.text)  return 'update text'
    return `update ${target}`
  }
  if (p.op === 'remove')     return `remove ${target}`
  if (p.op === 'move')       return 'reorder section'
  if (p.op === 'move-block') return 'move block'
  return (p as any).op as string
}
function recordLabel(r: PatchRecord): string {
  if (r.label)              return r.label
  if (!r.patches.length)    return 'undo'
  if (r.patches.length > 1) return `batch (${r.patches.length})`
  return describeOnePatch(r.patches[0])
}
function patchSymbol(op: string): string {
  if (op === 'add')    return '+'
  if (op === 'remove') return '−'
  return '~'
}
function patchSymbolColor(op: string): string {
  if (op === 'add')    return '#34d399'
  if (op === 'remove') return '#f87171'
  return '#fbbf24'
}

// ─────────────────────────────────────────────────────────────────────────────
// Strategy Evolution Graph
// ─────────────────────────────────────────────────────────────────────────────

interface EvolutionGraphProps {
  snapshots: StrategySnapshot[]
}

function EvolutionGraph({ snapshots }: EvolutionGraphProps) {
  if (snapshots.length < 2) return null

  const W = 260, H = 56, PAD = 4
  const innerW = W - PAD * 2
  const innerH = H - PAD * 2

  const xFor = (i: number) => PAD + (i / (snapshots.length - 1)) * innerW
  const yFor = (v: number) => PAD + (1 - v) * innerH

  const pathFor = (dim: ABCDEKey) => {
    return snapshots.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(s.result[dim]).toFixed(1)}`).join(' ')
  }

  return (
    <div style={{ padding:'8px 14px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ fontSize:8, color:'#2A2824', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:4 }}>
        Strategy evolution
      </div>
      <svg width={W} height={H} style={{ display:'block', overflow:'visible' }}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(v => (
          <line key={v}
            x1={PAD} y1={yFor(v)} x2={W - PAD} y2={yFor(v)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1"
          />
        ))}
        {/* Dimension lines — C1, C2, C3 only */}
        {COMPACT_DIMS.map(dim => (
          <path key={dim}
            d={pathFor(dim)}
            fill="none"
            stroke={DIM_COLOR[dim]}
            strokeWidth="1.5"
            strokeOpacity="0.7"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* Latest value dots */}
        {COMPACT_DIMS.map(dim => {
          const last = snapshots.at(-1)!
          return (
            <circle key={dim}
              cx={xFor(snapshots.length - 1)}
              cy={yFor(last.result[dim])}
              r="2.5"
              fill={DIM_COLOR[dim]}
            />
          )
        })}
      </svg>
      {/* Legend */}
      <div style={{ display:'flex', gap:10, marginTop:3, marginBottom:8 }}>
        {COMPACT_DIMS.map(dim => (
          <div key={dim} style={{ display:'flex', alignItems:'center', gap:3 }}>
            <div style={{ width:10, height:2, background:DIM_COLOR[dim], borderRadius:1, opacity:0.8 }} />
            <span style={{ fontSize:7, color:DIM_COLOR[dim], opacity:0.7 }}>{DIM_LABEL[dim]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StrategyDeltaBadge — compact inline delta shown on RecordRow hover
// ─────────────────────────────────────────────────────────────────────────────

function StrategyDeltaBadge({ delta }: { delta: StrategyDelta }) {
  const significant = COMPACT_DIMS.filter(k => Math.abs(delta[k]) > 0.02)
  if (!significant.length) return null
  return (
    <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginTop:4 }}>
      {significant.map(k => {
        const v = delta[k]
        const sign = v > 0 ? '+' : ''
        return (
          <span key={k} style={{
            fontSize:   8,
            color:      v > 0 ? DIM_COLOR[k] : '#f87171',
            fontFamily: 'DM Mono,monospace',
            background: `${DIM_COLOR[k]}12`,
            borderRadius: 3,
            padding:    '1px 5px',
          }}>
            Δ{k} {sign}{(v * 100).toFixed(0)}%
          </span>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RecordRow
// ─────────────────────────────────────────────────────────────────────────────

interface RecordRowProps {
  record:    PatchRecord
  snapshot:  StrategySnapshot | undefined
  delta:     StrategyDelta | null
  isActive:  boolean
  onPreview: (r: PatchRecord) => void
  onHover:   (r: PatchRecord | null) => void
}

function RecordRow({ record, snapshot, delta, isActive, onPreview, onHover }: RecordRowProps) {
  const [hovered, setHovered] = useState(false)
  const actor  = actorMeta(record.actor.type)
  const label  = recordLabel(record)
  const isUndo = record.patches.length === 0

  return (
    <div
      onMouseEnter={() => { setHovered(true); onHover(record) }}
      onMouseLeave={() => { setHovered(false); onHover(null) }}
      onClick={() => onPreview(record)}
      style={{
        display:      'flex',
        alignItems:   'flex-start',
        gap:          8,
        padding:      '7px 12px',
        borderRadius: 6,
        background:   isActive ? 'rgba(96,165,250,0.06)' : hovered ? 'rgba(255,255,255,0.02)' : 'transparent',
        border:       isActive ? '1px solid rgba(96,165,250,0.15)' : '1px solid transparent',
        cursor:       'pointer',
        marginBottom: 2,
        transition:   'background 0.1s',
      }}
    >
      {/* Actor badge */}
      <div style={{
        width:36, height:36, borderRadius:'50%', flexShrink:0,
        background:`${actor.color}15`, border:`1px solid ${actor.color}30`,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:1,
      }}>
        <span style={{ fontSize:9, color: actor.color }}>{actor.icon}</span>
        <span style={{ fontSize:6, color: actor.color, opacity:0.6, letterSpacing:'0.04em' }}>
          {actor.label.slice(0, 4).toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex:1, minWidth:0 }}>
        {/* Label + patch symbols */}
        <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2, flexWrap:'wrap' }}>
          <span style={{ fontSize:10, color: isUndo ? '#4A4844' : '#C8C4BC', fontFamily:'DM Mono,monospace', fontStyle: isUndo ? 'italic' : 'normal' }}>
            {label}
          </span>
          <div style={{ display:'flex', gap:3 }}>
            {record.patches.slice(0, 3).map((p, i) => (
              <span key={i} style={{ fontSize:8, color: patchSymbolColor(p.op), fontFamily:'DM Mono,monospace' }}>
                {patchSymbol(p.op)}
              </span>
            ))}
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <span style={{ fontSize:8, color: actor.color, opacity:0.7 }}>{actor.label}</span>
          <span style={{ fontSize:8, color:'#2A2824' }}>v{record.version}</span>
          <span style={{ fontSize:8, color:'#2A2824' }}>{relativeTime(record.timestamp)}</span>
        </div>

        {/* Strategy delta — shown when hovered and data is available */}
        {hovered && delta && <StrategyDeltaBadge delta={delta} />}

        {/* Compact strategy bar — shown on active/hovered when snapshot available */}
        {(hovered || isActive) && snapshot && (
          <div style={{ display:'flex', gap:4, marginTop:5 }}>
            {COMPACT_DIMS.map(k => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <div style={{
                  width: Math.round(snapshot.result[k] * 32),
                  height: 3,
                  background: DIM_COLOR[k],
                  borderRadius: 2,
                  opacity: 0.7,
                  transition: 'width 0.3s',
                  minWidth: 2,
                }} />
                <span style={{ fontSize:7, color: DIM_COLOR[k], opacity:0.7 }}>
                  {k}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span style={{ fontSize:7, color:'#2A2824', flexShrink:0, fontFamily:'DM Mono,monospace', marginTop:2 }}>
        {relativeTime(record.timestamp)}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ReplayPreviewPane — inline pane with strategy metrics for replayed version
// ─────────────────────────────────────────────────────────────────────────────

function ReplayPreviewPane({ record, onClose }: { record: PatchRecord; onClose: () => void }) {
  const { previewAt, exitPreview, restoreTo, isReplaying, replayError, previewDoc } =
    useTimelinePreviewStore()
  const [restoreResult, setRestoreResult] = useState<string | null>(null)
  const [strategyResult, setStrategyResult] = useState<ReturnType<typeof analyzeDocument> | null>(null)

  useEffect(() => {
    previewAt(record)
    return () => { exitPreview() }
  }, [record.id])

  // Compute strategy for the replayed document
  useEffect(() => {
    if (previewDoc) {
      setStrategyResult(analyzeDocument(previewDoc))
    }
  }, [previewDoc])

  const handleRestore = () => {
    const result = restoreTo(record)
    setRestoreResult(result.ok ? 'Restored ✓' : result.error ?? 'Failed')
    if (result.ok) setTimeout(onClose, 800)
  }

  return (
    <div style={{
      padding:'10px 14px',
      borderTop:'1px solid rgba(255,255,255,0.06)',
      background:'#0D0D18',
      fontFamily:'DM Mono,monospace',
    }}>
      {/* Version header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:9, color:'#60a5fa', letterSpacing:'0.1em', textTransform:'uppercase' }}>
          v{record.version} — {record.label ?? 'patch'}
        </span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'#3A3834', cursor:'pointer', fontSize:13, lineHeight:1 }}>×</button>
      </div>

      {/* Patch diff */}
      {record.patches.length > 0 && (
        <div style={{ marginBottom:8 }}>
          {record.patches.slice(0, 5).map((p, i) => (
            <div key={i} style={{ fontSize:9, color:'#5A5854', lineHeight:1.8, display:'flex', gap:6 }}>
              <span style={{ color: patchSymbolColor(p.op), width:8, flexShrink:0 }}>
                {patchSymbol(p.op)}
              </span>
              <span>{describeOnePatch(p)}</span>
            </div>
          ))}
          {record.patches.length > 5 && (
            <div style={{ fontSize:8, color:'#3A3834' }}>+{record.patches.length - 5} more</div>
          )}
        </div>
      )}

      {/* Strategy metrics at this version */}
      {isReplaying && <div style={{ fontSize:9, color:'#3A3834', marginBottom:6 }}>Replaying…</div>}
      {replayError && <div style={{ fontSize:9, color:'#f87171', marginBottom:6 }}>{replayError}</div>}
      {!isReplaying && strategyResult && (
        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:8, color:'#3A3834', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:5 }}>
            Strategy at this version
          </div>
          {COMPACT_DIMS.map(k => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
              <span style={{ fontSize:8, color: DIM_COLOR[k], width:18 }}>{k}</span>
              <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                <div style={{
                  height:'100%', width:`${Math.round(strategyResult[k] * 100)}%`,
                  background: DIM_COLOR[k], borderRadius:2, opacity:0.7, transition:'width 0.4s',
                }} />
              </div>
              <span style={{ fontSize:8, color: DIM_COLOR[k], width:28, textAlign:'right', opacity:0.8 }}>
                {Math.round(strategyResult[k] * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Document stats */}
      {!isReplaying && !replayError && previewDoc && (
        <div style={{ fontSize:8, color:'#3A3834', lineHeight:1.8, marginBottom:8 }}>
          <div>{previewDoc.sections.length} section{previewDoc.sections.length !== 1 ? 's' : ''}</div>
          <div>{previewDoc.sections.reduce((n, s) => n + s.blocks.length, 0)} blocks</div>
          <div style={{ color:'#252320', marginTop:2 }}>Canvas showing this state →</div>
        </div>
      )}

      {/* Restore */}
      <button
        onClick={handleRestore}
        style={{
          width:'100%', padding:'5px', fontSize:9,
          background:'rgba(96,165,250,0.08)', border:'1px solid rgba(96,165,250,0.2)',
          borderRadius:6, color:'#60a5fa', cursor:'pointer', fontFamily:'DM Mono,monospace', fontWeight:700,
        }}
      >
        {restoreResult ?? 'Restore this version'}
      </button>
      <div style={{ fontSize:7, color:'#252320', marginTop:4 }}>
        Restore creates one undo entry — Cmd+Z to revert.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TimelinePanel
// ─────────────────────────────────────────────────────────────────────────────

export function TimelinePanel() {
  const [records, setRecords]       = useState<PatchRecord[]>([])
  const [snapshots, setSnapshots]   = useState<Map<string, StrategySnapshot>>(new Map())
  const [selected, setSelected]     = useState<PatchRecord | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const computingRef = useRef(false)
  const { hoverRecord } = useTimelinePreviewStore()

  // Load records (newest first for display)
  useEffect(() => {
    const all = timelineEngine.getAll()
    setRecords([...all].reverse())
    const unsub = timelineEngine.subscribe(r => {
      setRecords(prev => [r, ...prev])
    })
    return unsub
  }, [])

  // Compute strategy snapshots lazily in idle time
  useEffect(() => {
    if (computingRef.current) return
    computingRef.current = true
    const run = () => {
      const all = [...records].reverse()  // oldest-first for replay
      const computed = strategyCache.computeBatch(all, 20)
      const map = new Map<string, StrategySnapshot>()
      for (const s of computed) map.set(s.recordId, s)
      setSnapshots(map)
      computingRef.current = false
    }
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 2000 })
    } else {
      setTimeout(run, 100)
    }
  }, [records.length])

  // Evolution graph data — oldest-first, limited to last 40 records
  const graphSnapshots = useMemo(() => {
    const oldest = [...records].reverse().slice(-40)
    return oldest.map(r => snapshots.get(r.id)).filter(Boolean) as StrategySnapshot[]
  }, [records, snapshots])

  // Per-record delta vs previous
  const getDelta = useCallback((record: PatchRecord, idx: number): StrategyDelta | null => {
    const cur  = snapshots.get(record.id)
    if (!cur) return null
    const prev = idx < records.length - 1 ? snapshots.get(records[idx + 1].id) : undefined
    return strategyCache.delta(cur, prev)
  }, [snapshots, records])

  // Actor counts for legend
  const actorCounts = useMemo(() =>
    records.reduce<Record<string, number>>((acc, r) => {
      const t = r.actor.type ?? 'system'
      acc[t] = (acc[t] ?? 0) + 1
      return acc
    }, {}),
  [records])

  // Group records
  const grouped = useMemo(() => {
    const map = new Map<TimeGroup, PatchRecord[]>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const r of records) map.get(timeGroup(r.timestamp))!.push(r)
    return map
  }, [records])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', fontFamily:'DM Mono,monospace', background:'#0F0F14' }}>

      {/* Header */}
      <div style={{ padding:'10px 14px 6px', borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:9, color:'#4A4844', letterSpacing:'0.15em', textTransform:'uppercase' }}>
            Timeline
          </span>
          <div style={{ display:'flex', gap:8 }}>
            {Object.entries(actorCounts).map(([type, count]) => {
              const a = actorMeta(type)
              return <span key={type} style={{ fontSize:8, color:a.color, opacity:0.7 }}>{a.icon} {count}</span>
            })}
          </div>
        </div>
        <div style={{ fontSize:8, color:'#2A2824', marginTop:2 }}>
          {records.length} entries · {snapshots.size} analyzed
        </div>
      </div>

      {/* Strategy evolution graph */}
      <EvolutionGraph snapshots={graphSnapshots} />

      {/* Record list */}
      <div ref={listRef} style={{ flex:1, overflow:'auto', padding:'6px 8px' }}>
        {records.length === 0 ? (
          <div style={{ padding:'32px 0', textAlign:'center', color:'#2A2824', fontSize:11 }}>
            No patches recorded yet.
          </div>
        ) : (
          GROUP_ORDER.map(group => {
            const groupRecords = grouped.get(group)!
            if (!groupRecords.length) return null
            return (
              <React.Fragment key={group}>
                <div style={{ fontSize:7, color:'#2A2824', letterSpacing:'0.12em', textTransform:'uppercase', padding:'6px 4px 3px' }}>
                  {group}
                </div>
                {groupRecords.map((record, i) => {
                  // Index in the full records array (for delta computation)
                  const globalIdx = records.indexOf(record)
                  return (
                    <React.Fragment key={record.id}>
                      <RecordRow
                        record={record}
                        snapshot={snapshots.get(record.id)}
                        delta={getDelta(record, globalIdx)}
                        isActive={selected?.id === record.id}
                        onPreview={r => setSelected(prev => prev?.id === r.id ? null : r)}
                        onHover={hoverRecord}
                      />
                      {selected?.id === record.id && (
                        <ReplayPreviewPane record={record} onClose={() => setSelected(null)} />
                      )}
                    </React.Fragment>
                  )
                })}
              </React.Fragment>
            )
          })
        )}
      </div>
    </div>
  )
}
