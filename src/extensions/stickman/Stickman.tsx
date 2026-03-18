'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { StickmanController, type StickmanState, type StickmanMood } from './stickmanController'

// ── CSS injected once ────────────────────────────────────────────────────────

const CSS = `
.sm-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  font-family: 'DM Mono', monospace, system-ui;
  pointer-events: none;
}
.sm-root > * { pointer-events: auto; }

/* bubble */
.sm-bubble {
  background: rgba(11,11,16,0.96);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 14px 14px 2px 14px;
  padding: 9px 14px;
  font-size: 11px;
  color: #C8C4BC;
  letter-spacing: 0.03em;
  max-width: 220px;
  line-height: 1.5;
  backdrop-filter: blur(12px);
  animation: sm-in 0.22s cubic-bezier(0.34,1.56,0.64,1);
}

/* badge */
.sm-badge {
  position: absolute;
  top: -4px; right: -4px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #C9A84C;
  color: #0B0B10;
  font-size: 9px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  z-index: 3;
  animation: sm-pop 0.2s cubic-bezier(0.34,1.56,0.64,1);
}

/* avatar wrap */
.sm-avatar-wrap {
  position: relative;
  width: 60px; height: 60px;
}

/* orbit ring */
.sm-ring {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 1px dashed rgba(201,168,76,0.2);
  animation: sm-orbit 14s linear infinite;
  pointer-events: none;
}
.sm-ring::after {
  content: '';
  position: absolute;
  top: -3px; left: calc(50% - 3px);
  width: 6px; height: 6px;
  background: #C9A84C;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(201,168,76,0.8);
}

/* avatar button */
.sm-avatar {
  width: 60px; height: 60px;
  border-radius: 50%;
  background: #17171F;
  border: 1.5px solid rgba(201,168,76,0.35);
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
  cursor: pointer;
  position: relative; z-index: 2;
  box-shadow: 0 8px 28px rgba(0,0,0,0.65), 0 0 18px rgba(201,168,76,0.12);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  user-select: none;
}
.sm-avatar:hover {
  border-color: rgba(201,168,76,0.7);
  box-shadow: 0 10px 32px rgba(0,0,0,0.7), 0 0 24px rgba(201,168,76,0.28);
}
.sm-avatar:active { transform: scale(0.92); }

/* tooltip */
.sm-tooltip {
  position: absolute;
  bottom: calc(100% + 8px); right: 0;
  background: rgba(11,11,16,0.95);
  border: 1px solid rgba(201,168,76,0.2);
  border-radius: 10px;
  padding: 5px 11px;
  font-size: 10px;
  color: rgba(201,168,76,0.9);
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
  animation: sm-in 0.14s ease;
}

/* info panel */
.sm-panel {
  position: absolute;
  bottom: 72px; right: 0;
  width: 220px;
  background: rgba(13,13,20,0.97);
  border: 1px solid rgba(201,168,76,0.2);
  border-radius: 14px;
  padding: 16px;
  font-size: 11px;
  color: #C8C4BC;
  line-height: 1.7;
  backdrop-filter: blur(16px);
  animation: sm-in 0.2s cubic-bezier(0.34,1.56,0.64,1);
  transform-origin: bottom right;
}
.sm-panel-close {
  float: right;
  background: none; border: none;
  color: #5A5854; font-size: 14px;
  cursor: pointer; padding: 0; line-height: 1;
}
.sm-panel-title {
  font-size: 10px;
  color: #C9A84C;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 10px;
  display: block;
}
.sm-panel-tip {
  padding: 7px 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 10px;
  color: #9A9690;
  cursor: pointer;
  transition: background 0.12s;
}
.sm-panel-tip:hover { background: rgba(201,168,76,0.07); color: #C8C4BC; }

/* keyframes */
@keyframes sm-in {
  from { opacity:0; transform: scale(0.84) translateY(8px); }
  to   { opacity:1; transform: scale(1) translateY(0); }
}
@keyframes sm-orbit { to { transform: rotate(360deg); } }
@keyframes sm-pop   { from { transform: scale(0); } to { transform: scale(1); } }

/* mood animations */
@keyframes sm-float {
  0%,100% { transform: translateY(0) rotate(0deg); }
  40%     { transform: translateY(-6px) rotate(-1deg); }
  60%     { transform: translateY(-7px) rotate(0.5deg); }
}
@keyframes sm-wave {
  0%,100% { transform: translateY(0) rotate(0deg); }
  20%     { transform: translateY(-8px) rotate(10deg); }
  40%     { transform: translateY(-8px) rotate(-8deg); }
  60%     { transform: translateY(-6px) rotate(6deg); }
  80%     { transform: translateY(-3px) rotate(-2deg); }
}
@keyframes sm-bounce {
  0%   { transform: scale(1) translateY(0); }
  25%  { transform: scale(1.18) translateY(-14px) rotate(-5deg); }
  50%  { transform: scale(1.12) translateY(-9px) rotate(4deg); }
  75%  { transform: scale(1.06) translateY(-4px); }
  100% { transform: scale(1) translateY(0); }
}
@keyframes sm-excited {
  0%,100% { transform: scale(1); }
  25%     { transform: scale(1.14) rotate(-4deg); }
  50%     { transform: scale(1.1) rotate(4deg); }
  75%     { transform: scale(1.07) rotate(-2deg); }
}
@keyframes sm-think {
  0%,100% { transform: translateY(0) rotate(0deg); }
  33%     { transform: translateY(-4px) rotate(-2deg); }
  66%     { transform: translateY(-3px) rotate(2deg); }
}
@keyframes sm-sleep {
  0%,100% { transform: translateY(0) scale(1); opacity: 0.6; }
  50%     { transform: translateY(-3px) scale(1.02); opacity: 0.85; }
}
@keyframes sm-observe {
  0%,100% { transform: translateY(0) rotate(0deg); }
  50%     { transform: translateY(-5px) rotate(3deg); }
}

.sm-mood-idle        .sm-avatar { animation: sm-float   4s ease-in-out infinite; }
.sm-mood-waving      .sm-avatar { animation: sm-wave    2.4s ease-in-out forwards; }
.sm-mood-celebrating .sm-avatar { animation: sm-bounce  1.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
.sm-mood-excited     .sm-avatar { animation: sm-excited 0.5s ease-in-out infinite; }
.sm-mood-thinking    .sm-avatar { animation: sm-think   1.2s ease-in-out infinite; }
.sm-mood-helping     .sm-avatar { animation: sm-wave    2.4s ease-in-out infinite; border-color: rgba(96,165,250,0.55) !important; }
.sm-mood-observing   .sm-avatar { animation: sm-observe 3s ease-in-out infinite; border-color: rgba(74,222,128,0.4) !important; }
.sm-mood-sleeping    .sm-avatar { animation: sm-sleep   3.5s ease-in-out infinite; filter: saturate(0.25); }
.sm-mood-thinking    .sm-ring   { animation: sm-orbit   1s linear infinite; border-color: rgba(201,168,76,0.6); }
`

// ── Mood map ─────────────────────────────────────────────────────────────────

const EMOJI: Record<StickmanMood, string> = {
  idle:        '🧍',
  waving:      '👋',
  observing:   '👀',
  thinking:    '🤔',
  celebrating: '🎉',
  helping:     '🤝',
  excited:     '🤩',
  sleeping:    '💤',
}

const TIPS = [
  '✦ Click any block to inspect and edit it',
  '✦ Use the Sections tab to reorder layouts',
  '✦ Ctrl+Z / ↩ undoes the last patch',
  '✦ Save keeps your draft; Publish goes live',
  '✦ Switch theme in Settings →',
  '✦ Gallery and feature-list support multiple items',
]

// ── Component ────────────────────────────────────────────────────────────────

export default function Stickman() {
  const [state, setState] = useState<StickmanState>({
    mood: 'waving', message: null, patchCount: 0, isOpen: false,
  })
  const [tooltip, setTooltip] = useState(false)
  const [tipIdx,  setTipIdx]  = useState(0)
  const ctrlRef = useRef<StickmanController | null>(null)

  useEffect(() => {
    const ctrl = new StickmanController({ onStateChange: s => setState({ ...s }) })
    ctrlRef.current = ctrl
    return () => ctrl.destroy()
  }, [])

  const handleClick = useCallback(() => {
    const ctrl = ctrlRef.current
    if (!ctrl) return
    if (state.isOpen) {
      ctrl.togglePanel()
    } else if (state.mood === 'sleeping') {
      ctrl.react('block-selected') // wake up
    } else {
      ctrl.togglePanel()
      ctrl.showNextTip()
    }
  }, [state.mood, state.isOpen])

  const nextTip = TIPS[tipIdx % TIPS.length]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className={`sm-root sm-mood-${state.mood}`}>

        {/* Message bubble */}
        {state.message && !state.isOpen && (
          <div key={state.message} className="sm-bubble">
            {state.message}
          </div>
        )}

        {/* Tips panel */}
        {state.isOpen && (
          <div className="sm-panel">
            <button className="sm-panel-close" onClick={() => ctrlRef.current?.togglePanel()}>✕</button>
            <span className="sm-panel-title">✦ Tips</span>
            {TIPS.map((tip, i) => (
              <div key={i} className="sm-panel-tip">{tip}</div>
            ))}
          </div>
        )}

        {/* Avatar */}
        <div className="sm-avatar-wrap">
          <div className="sm-ring" />

          {tooltip && !state.isOpen && (
            <div className="sm-tooltip">
              {state.mood === 'sleeping' ? 'Click to wake' : 'Click for tips'}
            </div>
          )}

          {state.patchCount > 0 && (
            <div className="sm-badge" title={`${state.patchCount} changes`}>
              {state.patchCount > 99 ? '99+' : state.patchCount}
            </div>
          )}

          <div
            className="sm-avatar"
            onClick={handleClick}
            onMouseEnter={() => setTooltip(true)}
            onMouseLeave={() => setTooltip(false)}
            role="button"
            tabIndex={0}
            aria-label="Assistant"
            onKeyDown={e => e.key === 'Enter' && handleClick()}
          >
            {EMOJI[state.mood]}
          </div>
        </div>

      </div>
    </>
  )
}
