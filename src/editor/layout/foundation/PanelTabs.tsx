'use client'
/**
 * ATELIER CMS — PanelTabs (Phase 3)
 * Gold-underlined tab bar with Inter typography.
 */

import React from 'react'
import { PANEL_TABS, type PanelTabId } from './tokens'

export interface PanelTabsProps {
  activeTab:   PanelTabId
  onTabChange: (tab: PanelTabId) => void
}

export function PanelTabs({ activeTab, onTabChange }: PanelTabsProps) {
  return (
    <div className="atelier-panel-tabs" role="tablist" aria-label="Inspector panels">
      {PANEL_TABS.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          aria-controls={`panel-content-${tab.id}`}
          id={`panel-tab-${tab.id}`}
          onClick={() => onTabChange(tab.id)}
          className={`atelier-panel-tab${tab.id === activeTab ? ' is-active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
