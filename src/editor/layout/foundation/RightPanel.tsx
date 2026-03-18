'use client'
/**
 * ATELIER CMS — RightPanel (Phase 3)
 * 320px light panel with tab routing.
 */

import React, { useState } from 'react'
import { PanelTabs }        from './PanelTabs'
import { type PanelTabId }  from './tokens'

export interface RightPanelProps {
  defaultTab?:   PanelTabId
  renderContent?: (tab: PanelTabId) => React.ReactNode
}

export function RightPanel({
  defaultTab    = 'inspector',
  renderContent,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTabId>(defaultTab)

  return (
    <aside className="atelier-panel" aria-label="Context panel">
      <PanelTabs activeTab={activeTab} onTabChange={setActiveTab} />
      <div
        className="atelier-panel-content"
        role="tabpanel"
        id={`panel-content-${activeTab}`}
        aria-labelledby={`panel-tab-${activeTab}`}
      >
        {renderContent
          ? renderContent(activeTab)
          : <PanelPlaceholder tab={activeTab} />}
      </div>
    </aside>
  )
}

function PanelPlaceholder({ tab }: { tab: PanelTabId }) {
  return (
    <div style={{
      paddingTop: 32,
      textAlign:  'center',
      color:      'var(--color-text-ghost)',
      fontSize:   12,
    }}>
      {tab} panel
    </div>
  )
}
