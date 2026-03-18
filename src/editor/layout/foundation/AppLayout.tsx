'use client'
/**
 * ATELIER CMS — AppLayout (Phase 3)
 * Root layout shell with background art and full design system applied.
 */

import React, { useState } from 'react'
import { TopBar }          from './TopBar'
import { CanvasContainer } from './CanvasContainer'
import { RightPanel }      from './RightPanel'
import type { PanelTabId } from './tokens'

export interface AppLayoutProps {
  pageTitle?:    string
  renderCanvas?: React.ReactNode
  renderPanel?:  (tab: PanelTabId) => React.ReactNode
  defaultTab?:   PanelTabId
}

export function AppLayout({
  pageTitle,
  renderCanvas,
  renderPanel,
  defaultTab,
}: AppLayoutProps) {
  return (
    <div className="atelier-app">
      {/* Ambient background art — behind everything, never inside canvas */}
      <div className="atelier-bg-art" aria-hidden="true" />

      <TopBar pageTitle={pageTitle} />

      <main className="atelier-main">
        <CanvasContainer>{renderCanvas}</CanvasContainer>
        <RightPanel defaultTab={defaultTab} renderContent={renderPanel} />
      </main>
    </div>
  )
}
