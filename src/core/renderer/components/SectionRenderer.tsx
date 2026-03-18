'use client'
import React, { memo }       from 'react'
import type { Section }      from '@/core/document/types'
import { BlockRenderer }     from './BlockRenderer'

export const SectionRenderer = memo(function SectionRenderer({
  section,
  onBlockError,
  children,
}: {
  section:       Section
  onBlockError?: (e: unknown) => void
  /**
   * When provided, replaces the default block list with custom children.
   * Used by the live editor path to inject interaction chrome (toolbars,
   * insert indicators, drag wrappers) inside the same section shell as preview.
   * When omitted (preview / timeline / AI-preview paths), the default
   * sorted BlockRenderer list is used — identical visual output.
   */
  children?:     React.ReactNode
}) {
  const sorted = [...section.blocks].sort((a, b) => a.order - b.order)

  return (
    <section
      id={section.type}
      data-section-id={section.id}
      data-section-type={section.type}
      className={[
        'atelier-section',
        `atelier-section--${section.type}`,
        section.settings.className as string | undefined,
      ].filter(Boolean).join(' ')}
      style={{
        paddingTop:    (section.settings.paddingTop    as string) ?? undefined,
        paddingBottom: (section.settings.paddingBottom as string) ?? undefined,
        background:    (section.settings.background    as string) ?? undefined,
        ...((section.settings.style as Record<string, string>) ?? {}),
      }}
    >
      <div className={section.settings.fullWidth ? undefined : 'atelier-section__inner'}>
        {children ?? sorted.map(b => (
          <BlockRenderer key={b.id} block={b} onError={onBlockError} />
        ))}
      </div>
    </section>
  )
})
