'use client'
/**
 * ATELIER CMS — PageAtmosphere
 *
 * Reactive ambient gradient layer inside PageRenderer.
 * Analyzes the page ABCDE strategy balance and paints behind sections.
 *
 * BOUNDARY RULE
 * ─────────────
 * This component is part of the renderer layer — it must NOT import
 * engine or any editor-layer module. It receives the current page via
 * the 'page' prop and re-analyzes whenever that prop changes.
 *
 * In the editor, Canvas.tsx passes an updated page on every engine notify.
 * In preview/route contexts, the page is static — one analysis on mount.
 *
 * STRATEGY → COLOR MAP
 * ────────────────────
 * C1 Action   → amber/gold   (top-left  bloom)
 * C2 Trust    → green        (top-right bloom)
 * C3 Purpose  → violet       (bottom-right haze)
 * C4 Info     → blue         (bottom-left haze)
 * C5 Emotion  → pink         (center pulse)
 */

import React, { useState, useEffect } from 'react'
import type { Page }            from '@/core/document/types'
import { analyzeDocument }      from '@/analysis/ABCDEAnalyzer'

// ── Atmosphere computation ─────────────────────────────────────────────────

function computeAtmosphere(
  signals: { C1: number; C2: number; C3: number; C4: number; C5: number },
): string {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v))
  const o = (score: number, base = 0.04, scale = 0.12) =>
    clamp(base + score * scale, base, base + scale).toFixed(3)

  return [
    `radial-gradient(circle at 18% 28%, rgba(251,191,36,${o(signals.C1,0.05,0.13)}), transparent 40%)`,
    `radial-gradient(circle at 82% 22%, rgba(16,185,129,${o(signals.C2,0.02,0.08)}), transparent 35%)`,
    `radial-gradient(circle at 78% 72%, rgba(139,92,246,${o(signals.C3,0.04,0.10)}), transparent 42%)`,
    `radial-gradient(circle at 22% 78%, rgba(59,130,246,${o(signals.C4,0.02,0.07)}), transparent 38%)`,
    `radial-gradient(circle at 50% 50%, rgba(244,114,182,${o(signals.C5,0.01,0.06)}), transparent 30%)`,
  ].join(', ')
}

const DEFAULT_ATMOSPHERE = [
  'radial-gradient(circle at 20% 30%, rgba(251,191,36,0.10), transparent 40%)',
  'radial-gradient(circle at 80% 70%, rgba(139,92,246,0.08), transparent 40%)',
].join(', ')

function analyzePageSafe(page: Page): string {
  try {
    return computeAtmosphere(analyzeDocument(page).signals)
  } catch {
    return DEFAULT_ATMOSPHERE
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export interface PageAtmosphereProps {
  /**
   * The current page document. This component re-analyzes whenever this
   * prop changes, producing a new gradient. The caller (Canvas or preview
   * route) is responsible for providing an up-to-date page object.
   */
  page: Page
}

export function PageAtmosphere({ page }: PageAtmosphereProps) {
  const [gradient, setGradient] = useState(() => analyzePageSafe(page))

  useEffect(() => {
    setGradient(analyzePageSafe(page))
  }, [page])

  return (
    <div
      aria-hidden="true"
      style={{
        position:      'absolute',
        inset:         0,
        background:    gradient,
        filter:        'blur(40px)',
        pointerEvents: 'none',
        zIndex:        0,
        transition:    'background 3000ms ease',
      }}
    />
  )
}
