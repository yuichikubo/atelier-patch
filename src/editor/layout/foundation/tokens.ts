/**
 * ATELIER CMS — Design Token Foundation
 * Phase 3: Full design system tokens
 * Quiet Energy Interface — calm, minimal, premium, intelligent
 */

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

export const LAYOUT = {
  topBarHeight:    64,
  rightPanelWidth: 320,
  canvasMaxWidth:  900,
  canvasPadding:   80,
  tabBarHeight:    40,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Color palette
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  // Surface
  bg:         '#F8F8F8',
  surface:    '#FFFFFF',
  surface2:   '#FAFAFA',
  surface3:   '#F3F3F1',

  // Text
  textPrimary:   '#111111',
  textSecondary: '#444444',
  textTertiary:  '#888888',
  textGhost:     '#BBBBBB',

  // Borders
  border:       'rgba(0, 0, 0, 0.08)',
  borderSoft:   'rgba(0, 0, 0, 0.05)',
  divider:      'rgba(0, 0, 0, 0.06)',

  // Accent — Gold
  accent:       '#D4AF37',
  accentLight:  'rgba(212, 175, 55, 0.12)',
  accentMid:    'rgba(212, 175, 55, 0.35)',

  // Semantic
  danger:  '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Strategy energy colors
// ─────────────────────────────────────────────────────────────────────────────

export const ENERGY = {
  C1: '#F59E0B',   // Action
  C2: '#10B981',   // Trust
  C3: '#8B5CF6',   // Purpose
  C4: '#3B82F6',   // Information
  C5: '#F472B6',   // Emotion
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────

export const TYPE = {
  fontUi:   "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono: "'JetBrains Mono', 'DM Mono', monospace",
  xs:   '10px',
  sm:   '11px',
  base: '13px',
  md:   '14px',
  lg:   '16px',
  xl:   '20px',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Spacing
// ─────────────────────────────────────────────────────────────────────────────

export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 80,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Radius
// ─────────────────────────────────────────────────────────────────────────────

export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Panel tabs
// ─────────────────────────────────────────────────────────────────────────────

export const PANEL_TABS = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'suggest',   label: 'Suggest'   },
  { id: 'ai',        label: 'AI'        },
  { id: 'strategy',  label: 'Strategy'  },
  { id: 'timeline',  label: 'Timeline'  },
] as const

export type PanelTabId = typeof PANEL_TABS[number]['id']
