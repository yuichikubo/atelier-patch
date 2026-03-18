'use client'
/**
 * ATELIER CMS — Editor Error Boundary
 *
 * Catches React render errors in editor panels so a single component crash
 * cannot bring down the entire editor. Shows a recoverable error state.
 *
 * Usage:
 *   <EditorErrorBoundary label="Canvas">
 *     <EditorCanvas />
 *   </EditorErrorBoundary>
 */

import React from 'react'

interface Props {
  children:   React.ReactNode
  /** Human-readable label shown in the error UI (e.g. "Canvas", "AI Panel") */
  label?:     string
  /** Called when the user clicks "Try again" — allows parent to reset state */
  onReset?:   () => void
}

interface State {
  hasError:  boolean
  message:   string
}

export class EditorErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error)
    return { hasError: true, message }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    // Log to console for demo observability; wire to logger in production
    console.error(`[ATELIER] ${this.props.label ?? 'Component'} error:`, error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ hasError: false, message: '' })
    this.props.onReset?.()
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children

    const label = this.props.label ?? 'Component'

    return (
      <div style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '32px 24px',
        gap:            12,
        height:         '100%',
        minHeight:      120,
        fontFamily:     'var(--font-ui, system-ui)',
        textAlign:      'center',
        background:     'var(--color-surface, #fff)',
        color:          'var(--color-text-secondary, #444)',
      }}>
        {/* Icon */}
        <div style={{ fontSize: 24, opacity: 0.3 }}>⚠</div>

        {/* Headline */}
        <div style={{
          fontSize:    13,
          fontWeight:  500,
          color:       'var(--color-text-primary, #111)',
        }}>
          {label} encountered an error
        </div>

        {/* Detail */}
        <div style={{
          fontSize:    11,
          color:       'var(--color-text-tertiary, #888)',
          maxWidth:    280,
          lineHeight:  1.5,
        }}>
          {this.state.message
            ? `"${this.state.message.slice(0, 120)}"`
            : 'An unexpected error occurred. The rest of the editor is unaffected.'}
        </div>

        {/* Reset button */}
        <button
          onClick={this.reset}
          style={{
            marginTop:    8,
            padding:      '6px 16px',
            background:   'var(--color-surface-3, #f3f3f1)',
            border:       '1px solid var(--color-border, rgba(0,0,0,0.08))',
            borderRadius: 'var(--radius-md, 8px)',
            cursor:       'pointer',
            fontSize:     11,
            fontFamily:   'inherit',
            color:        'var(--color-text-secondary, #444)',
          }}
        >
          Try again
        </button>
      </div>
    )
  }
}
