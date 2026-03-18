'use client'
import React, { memo, useState, useCallback } from 'react'
import type { Page }               from '@/core/document/types'
import type { RendererContextType } from '../types'
import { RendererProvider }        from '../context/RendererContext'
import { SectionRenderer }         from './SectionRenderer'
import { PageAtmosphere }          from './PageAtmosphere'

export interface PageRendererProps {
  page:Page; context?:Partial<RendererContextType>
  onError?:(e:unknown[])=>void; onPatch?:(p:unknown)=>void
  className?:string; style?:React.CSSProperties
}

export const PageRenderer = memo(function PageRenderer({ page, context, onError, onPatch, className, style }:PageRendererProps) {
  const [, setErrors] = useState<unknown[]>([])
  const handleErr = useCallback((e:unknown) => setErrors(prev => { const next=[...prev,e]; onError?.(next); return next }), [onError])
  const sorted = [...(page.sections??[])].sort((a,b)=>a.order-b.order)

  return (
    <RendererProvider context={{ ...context, onPatch:onPatch??context?.onPatch }}>
      <div
        data-page-id={page.id}
        className={['atelier-page',className].filter(Boolean).join(' ')}
        style={{ position: 'relative', background: 'var(--color-bg, #fff)', minHeight: '100vh', overflow: 'hidden', ...style }}
      >
        {/* PageAtmosphere — reactive gradient layer, behind all sections.
            Responds to ABCDE strategy balance in both editor and preview.   */}
        <PageAtmosphere page={page} />

        {/* Page content — sits above atmosphere via position:relative/z-index */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {sorted.map(s => <SectionRenderer key={s.id} section={s} onBlockError={handleErr} />)}
        </div>
      </div>
    </RendererProvider>
  )
})
