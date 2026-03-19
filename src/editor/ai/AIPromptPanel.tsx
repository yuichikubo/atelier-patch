'use client'
/**
 * ATELIER CMS — AI Prompt Panel (Preview Mode)
 *
 * Floating panel attached to the TopBar AI button.
 *
 * FLOW
 * ────
 *   1. POST /api/ai/generate { prompt, document, 件選択中BlockId }
 *   2. Server returns validated Patch[]
 *   3. previewStore.enter(パッチes)  — パッチes applied to ISOLATED engine
 *   4. Canvas renders preview document — live doc unchanged
 *   5. "Apply Changes" → previewStore.commit() → engine.applyPatchArray()
 *      "Discard"       → previewStore.discard() → live doc unchanged
 *
 * INVARIANT: Live engine.enqueuePatch() is NOT called until the user commits.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSelectionStore }     from '@/editor/selection/selectionStore'
import { useAIPreviewStore }     from './previewStore'
import { describePatch }         from './patchDescription'
import { engine }                from '@/core/document/engineInstance'
import type { GenerateResponse } from '@/app/api/ai/generate/route'
import type { AIFeedbackEvent }  from '@/app/api/ai/feedback/route'
import type { Patch }            from '@/core/patch/types'

export interface AIPromptPanelProps {
  onClose:      () => void
  /** When provided, overrides the default absolute position so the panel
   *  can be anchored near a canvas block instead of the TopBar button.  */
  anchorStyle?: React.CSSProperties
}

type PanelState = 'idle' | 'loading' | 'previewing' | 'feedback' | 'confirmRegen' | 'streaming' | 'streamComplete' | 'error'

/** Minimal パッチ metadata captured at commit time for feedback payload. */
interface CommittedMeta {
  パッチCount: number
  パッチOps:   Array<{ op: string; target: string }>
  docVersion: number
}

const EXAMPLES = [
  // ページ生成
  'このページ全体をランディングページとして生成して',
  'コーポレートサイト向けに全体を構成して',
  'イベント告知ページとして必要なセクションをすべて作って',
  // セクション追加
  '商品の魅力を伝えるヒーローセクションを作って',
  'サービスの特徴を3つ紹介するブロックを追加して',
  'お客様の声（testimonial）を3件追加して',
  'よくある質問（FAQ）を3問作って',
  'お問い合わせはこちらへのCTAを追加して',
  '料金プランを比較できる表を作って',
  'チームメンバーの紹介セクションを追加して',
  // テキスト改善
  'このページ全体の文章をより説得力のある表現に書き直して',
  '文章を短くして読みやすくして',
  '行動を促す（コンバージョン向けの）文体に変えて',
]

// Session-level prompt memory — persists ／ open/close cycles within a page session.
// Module scope (not React state) so it survives AIPromptPanel unmount.
let _lastSessionPrompt = ''

export function AIPromptPanel({ onClose, anchorStyle }: AIPromptPanelProps) {
  const [prompt,   setPrompt]   = useState(_lastSessionPrompt)  // preload last prompt
  const [state,    setState]    = useState<PanelState>('idle')
  const [error,    setError]    = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [example,  setExample]  = useState(0)
  const [committedMeta, setCommittedMeta] = useState<CommittedMeta | null>(null)
  const committedPromptRef = useRef('')
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const abortRef      = useRef<AbortController | null>(null)
  const streamTokenRef = useRef<string | null>(null)

  const previewActive  = useAIPreviewStore(s => s.active)
  const パッチCount        = useAIPreviewStore(s => s.patchCount)
  const pendingPatches    = useAIPreviewStore(s => s.pendingPatches)
  const 件選択中PatchIds  = useAIPreviewStore(s => s.selectedPatchIds)
  const togglePatch       = useAIPreviewStore(s => s.togglePatch)
  const selectAllPatches  = useAIPreviewStore(s => s.selectAll)
  const deselectAll       = useAIPreviewStore(s => s.deselectAll)
  const enterPreview      = useAIPreviewStore(s => s.enter)
  const previewCommit     = useAIPreviewStore(s => s.commit)
  const previewDiscard    = useAIPreviewStore(s => s.discard)
  const setChangedBlockIds = useAIPreviewStore(s => s.setChangedBlockIds)

  const [streamPatchCount, setStreamPatchCount] = useState(0)

  useEffect(() => { textareaRef.current?.focus() }, [])
  useEffect(() => {
    const id = setInterval(() => setExample(e => (e + 1) % EXAMPLES.length), 3500)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewActive) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, previewActive])

  // ── Generate → enter preview ───────────────────────────────────────────────

  // ── Streaming generation ────────────────────────────────────────────────────
  //
  // Flow:
  //   1. beginStream()           — snapshot pre-stream state, open transaction
  //   2. fetch /api/ai/stream    — SSE: one パッチ per event
  //   3. applyStreamPatch()      — each パッチ applied to live engine → canvas updates
  //   4a. [DONE] → abortStream() — restore live doc, enter previewStore for review
  //   4b. error/cancel → abortStream() — live doc fully restored, panel → idle
  //
  // On Apply: previewStore.commit() → engine.applyPatchArray() → ONE undo step
  //
  // The live engine is used for streaming visibility, then restored so the
  // preview→review flow remains the source of truth for the final commit.

  const handleGenerate = useCallback(async () => {
    const text = prompt.trim()
    if (!text || state === 'loading' || state === 'streaming') return

    // Persist to session memory so reopening the panel preloads this prompt
    _lastSessionPrompt = text

    // Confirm before discarding an existing preview
    if (previewActive && state !== 'confirmRegen') {
      setState('confirmRegen')
      return
    }
    if (previewActive) previewDiscard()

    setState('streaming')
    setError(null)
    setWarnings([])
    setStreamPatchCount(0)

    const controller = new AbortController()
    abortRef.current  = controller

    let token: string | null = null
    const streamedPatches: Patch[] = []

    try {
      // ── 1. Open stream transaction ──────────────────────────────────────────
      token = engine.beginStream()
      streamTokenRef.current = token

      // ── 2. Fetch SSE from server ────────────────────────────────────────────
      const res = await fetch('/api/ai/stream', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  controller.signal,
        body:    JSON.stringify({
          prompt:          text,
          pageId:          engine.getDocument().id,
          件選択中BlockId: useSelectionStore.getState().selectedBlockId,
        }),
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Stream error ${res.status}: ${errText.slice(0, 100)}`)
      }

      // ── 3. Read SSE events ──────────────────────────────────────────────────
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let   buf     = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()

          if (raw === '[DONE]') {
            // ── 4a. Stream complete — restore live doc, enter preview mode ────
            engine.abortStream(token!)       // restore live doc to pre-stream state
            streamTokenRef.current = null

            const preview = enterPreview(streamedPatches)
            if (!preview.ok) {
              setError(preview.errors[0] ?? 'Preview failed')
              setState('error')
              return
            }

            setCommittedMeta({
              パッチCount: streamedPatches.length,
              パッチOps:   streamedPatches.map(p => ({ op: p.op, target: ('target' in p ? (p as any).target : '') })),
              docVersion: engine.getVersion(),
            })
            committedPromptRef.current = text
            // ── streamComplete beat: show "✓ Done" for 900ms before review ──
            setState('streamComplete')
            setTimeout(() => setState('previewing'), 900)
            return
          }

          // Check for server-side error event
          let parsed: Record<string, unknown>
          try { parsed = JSON.parse(raw) } catch { continue }

          if ('error' in parsed) {
            throw new Error(String(parsed.error))
          }

          // ── Apply each パッチ to live engine via stream transaction ──────────
          const result = engine.applyStreamPatch(token!, parsed as unknown as Patch)
          if (!result.ok) {
            // applyStreamPatch already called abortStream — doc is restored
            streamTokenRef.current = null
            throw new Error(result.error ?? 'Patch application failed')
          }

          streamedPatches.push(parsed as unknown as Patch)
          setStreamPatchCount(c => c + 1)

          // Update canvas highlight as blocks arrive
          const 件変更dIds = new Set<string>()
          for (const p of streamedPatches) {
            if ('target' in p && (p as any).target === 'block') {
              if ('id' in p)           件変更dIds.add((p as any).id)
              if ((p as any).data?.id) 件変更dIds.add((p as any).data.id)
            }
          }
          setChangedBlockIds(件変更dIds)
        }
      }

      // Reader exhausted without [DONE] — treat as complete
      if (streamTokenRef.current) {
        engine.abortStream(token!)
        streamTokenRef.current = null
        const preview = enterPreview(streamedPatches)
        if (preview.ok) {
          committedPromptRef.current = text
          setState('previewing')
        } else {
          setError(preview.errors[0] ?? 'Preview failed')
          setState('error')
        }
      }

    } catch (e) {
      // Restore live engine state on any failure
      if (streamTokenRef.current) {
        engine.abortStream(streamTokenRef.current)
        streamTokenRef.current = null
      }

      if ((e as any)?.name === 'AbortError') {
        setState('idle')
        setError(null)
      } else {
        setError(e instanceof Error ? e.message : String(e))
        setState('error')
      }
    } finally {
      abortRef.current = null
    }
  }, [prompt, state, previewActive, previewDiscard, enterPreview, setChangedBlockIds])

  const handleCancel = useCallback(() => {
    // Abort fetch (triggers AbortError in handleGenerate catch → abortStream called there)
    abortRef.current?.abort()
    abortRef.current = null
    // Belt-and-suspenders: abort stream directly if token is still live
    if (streamTokenRef.current) {
      engine.abortStream(streamTokenRef.current)
      streamTokenRef.current = null
    }
    setState('idle')
    setError(null)
  }, [])

  // ── Confirm → apply to live doc ────────────────────────────────────────────

  const handleCommit = useCallback(() => {
    const result = previewCommit()
    if (result.ok) {
      setPrompt('')
      setError(null)
      setWarnings([])
      setState('feedback')   // ← show 👍/👎 before closing
    } else {
      setError(result.error ?? 'Commit failed')
      setState('error')
    }
  }, [previewCommit])

  const handleDiscard = useCallback(() => {
    previewDiscard()
    setState('idle')
    setError(null)
    setWarnings([])
  }, [previewDiscard])

  const handleFeedback = useCallback(async (rating: 'good' | 'bad') => {
    if (committedMeta) {
      // Fire and forget — never block UI on feedback submission
      fetch('/api/ai/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:     committedPromptRef.current,
          パッチCount: committedMeta.パッチCount,
          パッチOps:   committedMeta.パッチOps,
          docVersion: committedMeta.docVersion,
          rating,
        }),
      }).catch(() => {})
    }
    setCommittedMeta(null)
    setState('idle')
    onClose()
  }, [committedMeta, onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleGenerate() }
  }

  const isLoading      = state === 'loading'
  const isStreaming      = state === 'streaming'
  const isStreamComplete = state === 'streamComplete'
  const isBusy           = isLoading || isStreaming
  const isPreviewing     = state === 'previewing'
  const isFeedback       = state === 'feedback'
  const isConfirmRegen   = state === 'confirmRegen'
  const canSubmit        = prompt.trim().length > 0 && !isBusy && !isStreamComplete

  return (
    <div style={{
      position:     'absolute',
      top:          '100%',
      right:        0,
      marginTop:    6,
      width:        420,
      background:   '#0F0F16',
      border:       `1px solid ${isPreviewing ? 'rgba(201,168,76,0.35)' : 'rgba(201,168,76,0.2)'}`,
      borderRadius: 12,
      boxShadow:    '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.08)',
      fontFamily:   'var(--font-ui)',
      overflow:     'hidden',
      zIndex:       1000,
      // anchorStyle overrides position/top/right when triggered from canvas block
      ...anchorStyle,
    }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize:11, color:'#C9A84C', letterSpacing:'0.1em', textTransform:'uppercase', display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ fontSize:14 }}>✦</span>
          {isPreviewing ? 'AIプレビュー' : isFeedback ? '適用完了' : 'AI編集'}
        </div>
        {!isPreviewing && (
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#4A4844', cursor:'pointer', fontSize:16, lineHeight:1, padding:'2px 4px' }}>×</button>
        )}
      </div>

      <div style={{ padding:'14px 16px' }}>

        {/* Prompt textarea */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => { setPrompt(e.target.value); if (state !== 'idle' && state !== 'previewing') setState('idle') }}
          onKeyDown={handleKeyDown}
          placeholder={EXAMPLES[example]}
          disabled={isLoading}
          rows={3}
          style={{
            width:        '100%',
            background:   '#0B0B10',
            border:       `1px solid ${state === 'error' ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 8,
            padding:      '10px 12px',
            color:        '#E8E4DC',
            fontFamily:   'var(--font-ui)',
            fontSize:     12,
            lineHeight:   1.65,
            resize:       'none',
            outline:      'none',
            boxSizing:    'border-box',
            opacity:      isLoading ? 0.7 : 1,
          }}
        />

        {/* Generate button row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10, gap:8 }}>
          <span style={{ fontSize:9, color:'#3A3834', letterSpacing:'0.04em' }}>⌘↵ to generate</span>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {isBusy && (
              <button
                onClick={handleCancel}
                style={{
                  padding:      '7px 12px',
                  background:   'transparent',
                  border:       '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  color:        '#7A7870',
                  cursor:       'pointer',
                  fontSize:     11,
                  fontFamily:   'var(--font-ui)',
                }}
              >
                キャンセル
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!canSubmit}
              style={{
                padding:      '7px 18px',
                background:   isBusy ? 'rgba(201,168,76,0.06)' : !canSubmit ? 'rgba(255,255,255,0.04)' : '#C9A84C',
                border:       isBusy ? '1px solid rgba(201,168,76,0.2)' : !canSubmit ? '1px solid rgba(255,255,255,0.06)' : 'none',
                borderRadius: 8,
                color:        isBusy ? 'rgba(201,168,76,0.6)' : !canSubmit ? '#3A3834' : '#0B0B10',
                cursor:       (!canSubmit || isBusy) ? 'default' : 'pointer',
                fontSize:     11,
                fontFamily:   'var(--font-ui)',
                fontWeight:   700,
                letterSpacing:'0.04em',
                flexShrink:   0,
              }}
            >
              {isStreaming
                ? <span style={{ display:'flex', alignItems:'center', gap:6 }}><LoadingDots /> {streamPatchCount > 0 ? `${streamPatchCount}件 生成中…` : '生成中…'}</span>
                : isLoading
                  ? <span style={{ display:'flex', alignItems:'center', gap:6 }}><LoadingDots /> 生成中…</span>
                  : isPreviewing || isConfirmRegen ? '再生成' : '生成'}
            </button>
          </div>
        </div>

        {/* Confirm regenerate — shown when preview is active and user hits Regenerate */}
        {isConfirmRegen && (
          <div style={{ marginTop:10, padding:'10px 12px', background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.18)', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'#C8C4BC', marginBottom:8, lineHeight:1.55 }}>
              This will discard the current preview.<br />
              <span style={{ fontSize:10, color:'#7A7870' }}>Continue?</span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={handleGenerate}
                style={{ flex:1, padding:'6px', background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:6, color:'#f87171', cursor:'pointer', fontSize:10, fontFamily:'var(--font-ui)', fontWeight:700 }}
              >
                破棄して再生成
              </button>
              <button
                onClick={() => setState('previewing')}
                style={{ padding:'6px 12px', background:'transparent', border:'1px solid rgba(255,255,255,0.06)', borderRadius:6, color:'#7A7870', cursor:'pointer', fontSize:10, fontFamily:'var(--font-ui)' }}
              >
                プレビューを保持
              </button>
            </div>
          </div>
        )}

        {/* streamComplete beat — shown for 900ms after generation finishes */}
        {isStreamComplete && (
          <div style={{ marginTop:10, padding:'12px 14px', borderRadius:8, background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.2)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:14, color:'#34d399' }}>✓</span>
            <div>
              <div style={{ fontSize:11, color:'#34d399', fontFamily:'var(--font-ui)' }}>AI generation complete</div>
              <div style={{ fontSize:9, color:'#2A7A5A', marginTop:2 }}>Preparing パッチ review…</div>
            </div>
          </div>
        )}

        {/* Patch review list — shown during preview */}
        {isPreviewing && (() => {
          // Compute summary: セクションs affected
          const セクションIds = new Set(
            pendingPatches
              .filter(p => 'target' in p && (p as any).target === 'block' && 'data' in p)
              .map(p => (p as any).data?.parentSectionId)
              .filter(Boolean)
          )
          // Add セクションs directly パッチed
          pendingPatches
            .filter(p => 'target' in p && (p as any).target === 'section' && 'id' in p)
            .forEach(p => セクションIds.add((p as any).id))
          const セクションsAffected = セクションIds.size || (pendingPatches.length > 0 ? 1 : 0)

          return (
          <div style={{ marginTop:10 }}>
            {/* Summary header */}
            <div style={{ marginBottom:8, padding:'7px 10px', borderRadius:6, background:'rgba(201,168,76,0.05)', border:'1px solid rgba(201,168,76,0.12)' }}>
              <span style={{ fontSize:10, color:'#C9A84C', fontFamily:'var(--font-ui)' }}>
                AIが {パッチCount} 件変更{パッチCount !== 1 ? 's' : ''} ／ {セクションsAffected} セクション{セクションsAffected !== 1 ? 's' : ''}.
              </span>
              <div style={{ fontSize:8, color:'#3A3834', marginTop:2 }}>
                以下を確認し、適用しないものはチェックを外してください。
              </div>
            </div>

            {/* Selection controls */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:10, color:'#C9A84C', fontFamily:'var(--font-ui)' }}>
                {件選択中PatchIds.size}/{パッチCount} 件選択中
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={selectAllPatches} style={{ background:'none', border:'none', cursor:'pointer', fontSize:9, color:'#4A4844', fontFamily:'var(--font-ui)', padding:0 }}>all</button>
                <span style={{ color:'#2A2824', fontSize:9 }}>·</span>
                <button onClick={deselectAll}      style={{ background:'none', border:'none', cursor:'pointer', fontSize:9, color:'#4A4844', fontFamily:'var(--font-ui)', padding:0 }}>none</button>
              </div>
            </div>

            {/* Patch rows */}
            <div style={{ maxHeight:180, overflowY:'auto', marginBottom:8, borderRadius:6, border:'1px solid rgba(255,255,255,0.05)' }}>
              {pendingPatches.map((パッチ, i) => {
                const pid       = パッチ.patchId ?? `パッチ-${i}`
                const checked   = 件選択中PatchIds.has(pid)
                // Determine if this パッチ is force-disabled by a dependency
                const isSection = パッチ.op === 'add' && (パッチ as any).target === 'section'
                const parentId  = パッチ.op === 'add' && (パッチ as any).target === 'block'
                  ? (パッチ as any).data?.parentSectionId : null
                // A block is force-disabled if its parent セクション パッチ is in pendingPatches but deselected
                const parentPatch = parentId
                  ? pendingPatches.find(p => p.op === 'add' && (p as any).target === 'section' && (p as any).data?.id === parentId)
                  : null
                const forcedOff = parentPatch != null && !件選択中PatchIds.has(parentPatch.patchId ?? '')

                return (
                  <label
                    key={pid}
                    style={{
                      display:       'flex',
                      alignItems:    'center',
                      gap:           8,
                      padding:       '6px 10px',
                      cursor:        forcedOff ? 'not-allowed' : 'pointer',
                      opacity:       forcedOff ? 0.35 : 1,
                      borderBottom:  i < pendingPatches.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      background:    checked && !forcedOff ? 'rgba(201,168,76,0.04)' : 'transparent',
                      transition:    'background 0.1s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked && !forcedOff}
                      disabled={forcedOff}
                      onChange={() => !forcedOff && togglePatch(pid)}
                      style={{ accentColor:'#C9A84C', cursor: forcedOff ? 'not-allowed' : 'pointer', flexShrink:0 }}
                    />
                    <span style={{ fontSize:10, color: checked && !forcedOff ? '#C8C4BC' : '#4A4844', fontFamily:'var(--font-ui)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {describePatch(パッチ)}
                    </span>
                    <span style={{ fontSize:8, color:'#2A2824', flexShrink:0, letterSpacing:'0.06em' }}>
                      {パッチ.op}
                    </span>
                  </label>
                )
              })}
            </div>

            {warnings.length > 0 && (
              <div style={{ fontSize:9, color:'#6A5840', marginBottom:8, lineHeight:1.5 }}>
                {warnings.slice(0, 2).join(' · ')}
              </div>
            )}

            {/* Apply/Discard moved to PreviewBanner — single control surface */}
            <div style={{ fontSize:8, color:'#2A2824', marginTop:8, textAlign:'center' }}>
              上のバーから「適用」または「破棄」を選んでください。
            </div>
          </div>
          )
        })()}

        {/* Feedback — shown after user commits AI 件変更s */}
        {isFeedback && committedMeta && (
          <div style={{ marginTop:10, padding:'12px 14px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8 }}>
            <div style={{ fontSize:11, color:'#C8C4BC', marginBottom:12, lineHeight:1.5 }}>
              {committedMeta.パッチCount}件 を適用しました。
              <br />
              <span style={{ fontSize:10, color:'#4A4844' }}>結果はいかがでしたか？（次回の精度向上に役立てます）</span>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={() => handleFeedback('good')}
                title="良い結果でした"
                style={{
                  flex:         1,
                  padding:      '8px',
                  background:   'rgba(74,222,128,0.06)',
                  border:       '1px solid rgba(74,222,128,0.2)',
                  borderRadius: 8,
                  fontSize:     18,
                  cursor:       'pointer',
                  lineHeight:   1,
                }}
              >
                👍
              </button>
              <button
                onClick={() => handleFeedback('bad')}
                title="改善が必要でした"
                style={{
                  flex:         1,
                  padding:      '8px',
                  background:   'rgba(248,113,113,0.06)',
                  border:       '1px solid rgba(248,113,113,0.18)',
                  borderRadius: 8,
                  fontSize:     18,
                  cursor:       'pointer',
                  lineHeight:   1,
                }}
              >
                👎
              </button>
              <button
                onClick={() => { setCommittedMeta(null); setState('idle'); onClose() }}
                title="スキップ"
                style={{
                  padding:      '8px 12px',
                  background:   'transparent',
                  border:       '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 8,
                  fontSize:     10,
                  color:        '#3A3834',
                  cursor:       'pointer',
                  fontFamily:   'var(--font-ui)',
                }}
              >
                skip
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && error && (
          <div style={{ marginTop:10, padding:'8px 12px', borderRadius:7, fontSize:11, background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.18)', color:'#f87171' }}>
            {error.includes('ANTHROPIC_API_KEY') || error.includes('not configured') || error.includes('502') || error.includes('500')
              ? 'AI機能は現在利用できません。管理者にお問い合わせください。'
              : `✗ ${error}`}
          </div>
        )}

      </div>
    </div>
  )
}

function LoadingDots() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 400)
    return () => clearInterval(id)
  }, [])
  const dots = '.'.repeat((tick % 3) + 1).padEnd(3, '\u00a0')
  return <span style={{ letterSpacing:'0.05em', minWidth:18, display:'inline-block' }}>{dots}</span>
}
