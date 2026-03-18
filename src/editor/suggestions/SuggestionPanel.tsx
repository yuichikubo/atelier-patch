'use client'
/**
 * ATELIER CMS — Suggestion Panel
 *
 * Displays PatchProposal[] from the SuggestionEngine.
 * Proposals are read-only until the user explicitly accepts one.
 *
 * ARCHITECTURE INVARIANTS
 * ───────────────────────
 * • Suggestions never mutate the document.
 * • Accept → suggestionEngine.applyProposal(proposal) → engine.enqueuePatch()
 * • Dismiss → local UI state only — document unchanged.
 * • Hover highlight → useSuggestionHighlightStore (never calls selectBlock)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { engine }              from '@/core/document/engineInstance'
import { suggestionEngine }    from '@/extensions/suggestion/SuggestionEngine'
import { useSuggestionHighlightStore } from '@/editor/state/suggestionHighlightStore'
import { describePatch }       from '@/editor/ai/patchDescription'
import type { PatchProposal, SuggestionSeverity, SuggestionCategory }
  from '@/extensions/suggestion/SuggestionTypes'
import type { Patch }          from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY: Record<SuggestionSeverity, { color: string; label: string; dot: string }> = {
  critical: { color: '#f87171', label: '重要', dot: '●' },
  warning:  { color: '#fbbf24', label: '警告',  dot: '◆' },
  info:     { color: '#60a5fa', label: '提案',     dot: '◈' },
}

const CATEGORY_ICON: Record<SuggestionCategory, string> = {
  structure:  '⊞',
  content:    '✎',
  seo:        '◎',
  conversion: '→',
  media:      '🖼',
}

// Sort order: critical first, then warning, then info
const SEVERITY_ORDER: Record<SuggestionSeverity, number> = {
  critical: 0,
  warning:  1,
  info:     2,
}

// Never show more than 3 — keeps the decision surface minimal
const MAX_VISIBLE = 3

// ─────────────────────────────────────────────────────────────────────────────
// Patch preview — textual summary of what will change
// ─────────────────────────────────────────────────────────────────────────────

function getPatchLines(patch: Patch | Patch[]): string[] {
  const patches = Array.isArray(patch) ? patch : [patch]
  return patches.map(p => describePatch(p))
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionCard
// ─────────────────────────────────────────────────────────────────────────────

interface SuggestionCardProps {
  proposal:         PatchProposal
  onAccept:         (id: string) => void
  onDismiss:        (id: string) => void
  onHoverIn:        (targetId: string | null) => void
  onHoverOut:       () => void
  isApplying:       boolean
  isPrimary:        boolean
  showMoreCritical: boolean
}

function SuggestionCard({
  proposal, onAccept, onDismiss, onHoverIn, onHoverOut, isApplying, isPrimary, showMoreCritical,
}: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const sev  = SEVERITY[proposal.severity]
  const icon = CATEGORY_ICON[proposal.category] ?? '◈'
  const patchLines = getPatchLines(proposal.patch as any)

  return (
    <div
      onMouseEnter={() => onHoverIn(proposal.targetId ?? null)}
      onMouseLeave={onHoverOut}
      style={{
        padding:      '11px 12px',
        borderRadius: 8,
        background:   '#13131C',
        border:       isPrimary
          ? `1px solid rgba(201,168,76,0.25)`
          : `1px solid rgba(255,255,255,0.05)`,
        marginBottom: 6,
        opacity:      isApplying ? 0.5 : isPrimary ? 1 : 0.7,
        transition:   'opacity 0.15s, border-color 0.15s',
      }}
    >
      {/* Header: severity + title */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
        <span style={{ color: sev.color, fontSize: 8, marginTop: 3, flexShrink:0 }}>
          {sev.dot}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#C8C4BC', lineHeight: 1.5, wordBreak:'break-word' }}>
            {proposal.description}
          </div>
          {showMoreCritical && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#f87171', opacity: 0.7, letterSpacing: '0.04em' }}>
              他にも重要な改善があります
            </div>
          )}
          <div style={{ marginTop: 3, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize: 9, color: '#4A4844' }}>{icon} {proposal.category}</span>
            {proposal.blockType && (
              <span style={{
                fontSize: 8, padding:'1px 6px', borderRadius:10,
                background:'rgba(255,255,255,0.04)', color:'#4A4844',
              }}>
                {proposal.blockType}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rationale */}
      {proposal.rationale && (
        <div style={{
          fontSize: 10, color: '#6A6460', lineHeight: 1.6,
          marginBottom: 8,
        }}>
          {proposal.rationale}
        </div>
      )}

      {/* Patch preview — expandable */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 9, color: '#4A4844', padding: 0,
            fontFamily: 'var(--font-ui)', letterSpacing: '0.04em',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', display:'inline-block', transition:'transform 0.15s' }}>
            ▶
          </span>
          変更内容を見る
        </button>
        {expanded && (
          <div style={{
            marginTop: 6,
            padding: '7px 10px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.04)',
          }}>
            {patchLines.map((line, i) => (
              <div key={i} style={{
                fontSize: 10, color: '#6A6460', lineHeight: 1.7,
                fontFamily: 'var(--font-ui)',
              }}>
                <span style={{ color: '#2A5A3A', marginRight: 6 }}>+</span>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:6 }}>
        <button
          onClick={() => !isApplying && onAccept(proposal.id)}
          disabled={isApplying}
          style={{
            flex:         1,
            padding:      '6px 8px',
            background:   'rgba(201,168,76,0.08)',
            border:       '1px solid rgba(201,168,76,0.2)',
            borderRadius: 6,
            color:        isApplying ? '#4A4844' : '#C9A84C',
            cursor:       isApplying ? 'default' : 'pointer',
            fontSize:     10,
            fontFamily:   'var(--font-ui)',
            fontWeight:   600,
            letterSpacing:'0.04em',
            transition:   'background 0.15s',
          }}
        >
          {isApplying ? '…' : '✓ 適用'}
        </button>
        <button
          onClick={() => !isApplying && onDismiss(proposal.id)}
          disabled={isApplying}
          style={{
            padding:      '6px 8px',
            background:   'transparent',
            border:       '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
            color:        '#4A4844',
            cursor:       isApplying ? 'default' : 'pointer',
            fontSize:     10,
            fontFamily:   'var(--font-ui)',
            transition:   'color 0.15s',
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty states
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ isLoading }: { isLoading: boolean }) {
  if (isLoading) {
    return (
      <div style={{ padding:'32px 16px', textAlign:'center', fontFamily:'var(--font-ui)' }}>
        <div style={{ fontSize: 28, opacity:0.2, color:'#C9A84C', marginBottom:10 }}>◈</div>
        <div style={{ fontSize: 11, color:'#3A3834' }}>分析中…</div>
      </div>
    )
  }
  return (
    <div style={{ padding:'32px 16px', textAlign:'center', fontFamily:'var(--font-ui)' }}>
      <div style={{ fontSize: 28, opacity:0.2, color:'#4ade80', marginBottom:10 }}>✓</div>
      <div style={{ fontSize: 11, color:'#4A4844', lineHeight:1.7 }}>
        改善提案はありません。
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionPanel
// ─────────────────────────────────────────────────────────────────────────────

export function SuggestionPanel() {
  const [proposals,   setProposals]   = useState<PatchProposal[]>([])
  const [aiProposals, setAiProposals] = useState<PatchProposal[]>([])
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())
  const [applying,    setApplying]    = useState<string | null>(null)
  const [isLoading,   setIsLoading]   = useState(true)
  const [lastResult,  setLastResult]  = useState<{ id:string; ok:boolean } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { setHighlight, clearHighlight } = useSuggestionHighlightStore()

  // ── AI analysis — runs once on mount, results merged with rule-based ──────
  // AISuggestion local type (matches /api/ai/analyze response)
  type AIAnalyzeSuggestion = {
    category:   'structure' | 'copy' | 'conversion' | 'seo'
    title:      string
    description: string
    priority:   'high' | 'medium' | 'low'
    targetHint?: string
  }

  const fetchAIAnalysis = React.useCallback(() => {
    const pageId = engine.getDocument().id
    fetch('/api/ai/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ pageId }),
    })
      .then(r => r.json())
      .then((data: { ok: boolean; suggestions?: AIAnalyzeSuggestion[] }) => {
        if (!data.ok || !data.suggestions?.length) return
        const pid = engine.getDocument().id
        const mapped: PatchProposal[] = data.suggestions.map(s => ({
          id:          `ai/${s.category}/${s.title.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}`,
          description: s.title,
          rationale:   s.description,
          severity:    (s.priority === 'high' ? 'warning' : 'info') as SuggestionSeverity,
          category:    (s.category === 'copy' || s.category === 'conversion'
            ? 'content' : s.category) as SuggestionCategory,
          // Placeholder patch — never applied directly.
          // If targetId maps to a block, handleAccept replaces this with a live
          // /api/ai/rewrite call at the moment the user clicks Accept.
          // If targetId is absent, Accept is a no-op (suggestion dismissed only).
          patch: {
            op:     'update',
            target: 'page',
            id:     pid,
            data:   {} as Record<string, unknown>,
            meta:   { source: 'ai' as const },
          } as Patch,
          targetId: s.targetHint,
        }))
        setAiProposals(mapped)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchAIAnalysis() }, [fetchAIAnalysis])

  // ── Analyze document (debounced) ─────────────────────────────────────────

  const analyze = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const all = suggestionEngine.analyze()
      setProposals(all)
      setIsLoading(false)
    }, 500)
  }, [])

  useEffect(() => {
    analyze()
    const unsub = engine.subscribe(() => analyze())
    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      clearHighlight()
    }
  }, [analyze, clearHighlight])

  // ── Visible proposals — sorted by priority, capped at MAX_VISIBLE ─────────
  // Sort first, then slice — so we always drop lowest-priority items, never
  // silently hide critical issues by cutting them from the top.

  const allProposals = [...proposals, ...aiProposals]
  const sorted = allProposals
    .filter(p => !dismissed.has(p.id))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  // Detect hidden criticals BEFORE slicing so the primary card can surface them
  const totalCritical  = sorted.filter(p => p.severity === 'critical').length
  const hasMoreCritical = totalCritical > MAX_VISIBLE

  const visible = sorted.slice(0, MAX_VISIBLE)

  // Flash a block element briefly to confirm the change was applied
function flashBlock(blockId: string) {
  const el = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null
  if (!el) return
  const prev = el.style.transition
  el.style.transition = 'outline-color 0ms, background 0ms'
  el.style.outline = '2px solid rgba(110, 42, 31, 0.70)'
  el.style.background = 'rgba(110, 42, 31, 0.06)'
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = 'outline-color 600ms ease, background 600ms ease'
      el.style.outline = '2px solid transparent'
      el.style.background = ''
      setTimeout(() => {
        el.style.transition = prev
        el.style.outline = ''
      }, 700)
    })
  })
}

  const handleHoverIn = useCallback((targetId: string | null) => {
    if (!targetId) return
    setHighlight(new Set([targetId]))
  }, [setHighlight])

  const handleHoverOut = useCallback(() => {
    clearHighlight()
  }, [clearHighlight])

  // ── Accept / Dismiss ─────────────────────────────────────────────────────

  const handleAccept = useCallback((id: string) => {
    const proposal = allProposals.find(p => p.id === id)
    if (!proposal || applying) return
    if (engine.isStreaming) return

    setApplying(id)
    clearHighlight()

    // AI proposals (id starts with 'ai/') that carry a targetId pointing to a
    // specific block are fulfilled via /api/ai/rewrite at the moment of Accept.
    // This is the ONLY path where rewrite is triggered — explicit user action.
    const isAIProposal = id.startsWith('ai/')

    // AI proposals without a targetId cannot be applied automatically.
    // Dismiss them cleanly rather than silently running a no-op patch.
    if (isAIProposal && !proposal.targetId) {
      setDismissed(prev => new Set([...prev, id]))
      setApplying(null)
      return
    }

    if (isAIProposal && proposal.targetId) {
      const doc    = engine.getDocument()
      const blockId = proposal.targetId!

      // Verify the target block still exists
      const blockExists = doc.sections.some(s => s.blocks.some(b => b.id === blockId))
      if (!blockExists) {
        // Block was deleted; dismiss cleanly
        setDismissed(prev => new Set([...prev, id]))
        setApplying(null)
        return
      }

      fetch('/api/ai/rewrite', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pageId:      doc.id,
          blockId,
          instruction: proposal.description,
        }),
      })
        .then(r => r.json())
        .then((data: { ok: boolean; patch?: unknown }) => {
          if (data.ok && data.patch) {
            engine.enqueuePatch(data.patch as Parameters<typeof engine.enqueuePatch>[0])
            setLastResult({ id, ok: true })
            flashBlock(blockId)
          } else {
            setLastResult({ id, ok: false })
          }
          setDismissed(prev => new Set([...prev, id]))
          setApplying(null)
          setTimeout(() => setLastResult(null), 2000)
        })
        .catch(() => {
          // Silent fail — never block the editing flow
          setApplying(null)
          setDismissed(prev => new Set([...prev, id]))
        })
      return
    }

    // Rule-based proposals go through the existing synchronous path
    const result = suggestionEngine.applyProposal(proposal)
    setLastResult({ id, ok: result.ok })
    if (result.ok && proposal.targetId) flashBlock(proposal.targetId)
    setApplying(null)
    if (result.ok) setDismissed(prev => new Set([...prev, id]))
    setTimeout(() => setLastResult(null), 2000)
  }, [allProposals, applying, clearHighlight])

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set([...prev, id]))
  }, [])

  const handleDismissAll = useCallback(() => {
    setDismissed(new Set(allProposals.map(p => p.id)))
    clearHighlight()
  }, [allProposals, clearHighlight])

  const handleRefresh = useCallback(() => {
    setIsLoading(true)
    setDismissed(new Set())
    setAiProposals([])
    clearHighlight()
    analyze()
    fetchAIAnalysis()
  }, [analyze, clearHighlight, fetchAIAnalysis])

  // ── Counts ───────────────────────────────────────────────────────────────

  const criticalCount = visible.filter(p => p.severity === 'critical').length
  const warningCount  = visible.filter(p => p.severity === 'warning').length

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      fontFamily:    'var(--font-ui)',
      background:    '#0F0F14',
    }}>

      {/* Header */}
      <div style={{
        padding:       '10px 14px 8px',
        borderBottom:  '1px solid rgba(255,255,255,0.05)',
        flexShrink:    0,
        display:       'flex',
        alignItems:    'center',
        justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:9, color:'#4A4844', letterSpacing:'0.15em', textTransform:'uppercase' }}>
            改善提案
          </span>
          {criticalCount > 0 && (
            <span style={{ fontSize:8, padding:'1px 6px', borderRadius:10, background:'rgba(248,113,113,0.1)', color:'#f87171', border:'1px solid rgba(248,113,113,0.2)' }}>
              {criticalCount} 重要
            </span>
          )}
          {warningCount > 0 && (
            <span style={{ fontSize:8, padding:'1px 6px', borderRadius:10, background:'rgba(251,191,36,0.08)', color:'#fbbf24', border:'1px solid rgba(251,191,36,0.18)' }}>
              {warningCount} 警告
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {visible.length > 1 && (
            <button onClick={handleDismissAll} style={{
              background:'none', border:'none', color:'#3A3834',
              cursor:'pointer', fontSize:9, padding:'2px 6px',
              fontFamily:'var(--font-ui)',
            }}>
              すべて閉じる
            </button>
          )}
          <button onClick={handleRefresh} title="更新" style={{
            background:'none', border:'none', color:'#3A3834',
            cursor:'pointer', fontSize:11, padding:'2px 5px', lineHeight:1,
          }}>
            ↺
          </button>
        </div>
      </div>

      {/* Apply result flash */}
      {lastResult && (
        <div style={{
          padding:     '6px 14px',
          fontSize:    10,
          color:       lastResult.ok ? '#4ade80' : '#f87171',
          background:  lastResult.ok ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
          borderBottom:'1px solid rgba(255,255,255,0.04)',
          flexShrink:  0,
        }}>
          {lastResult.ok ? '✓ 適用しました' : '✗ 適用できませんでした'}
        </div>
      )}

      {/* Proposal list */}
      <div style={{ flex:1, overflow:'auto', padding:'10px 12px' }}>
        {isLoading ? (
          <EmptyState isLoading />
        ) : visible.length === 0 ? (
          <EmptyState isLoading={false} />
        ) : (
          <>
            {visible.map((proposal, idx) => (
              <SuggestionCard
                key={proposal.id}
                proposal={proposal}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onHoverIn={handleHoverIn}
                onHoverOut={handleHoverOut}
                isApplying={applying === proposal.id}
                isPrimary={idx === 0}
                showMoreCritical={idx === 0 && hasMoreCritical}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
