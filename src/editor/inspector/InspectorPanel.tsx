'use client'
/**
 * ATELIER CMS — Inspector Panel
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `InspectorPanel` is the smart container that connects the Zustand selection
 * store to the block editing UI.
 *
 * RESPONSIBILITIES
 * ────────────────
 * • Reads `selectedBlockId` from `useSelectionStore` (Zustand)
 * • Passes it to `BlockInspector` — the field-editing UI that already exists
 * • Shows a type-specific editor (from `TextBlockEditor`) when available,
 *   surfaced as a dedicated "Quick Edit" tab
 * • Provides header actions: Delete and Duplicate, via `useBlockInspector`
 * • Renders an empty state when nothing is selected
 *
 * DATA FLOW
 * ─────────
 *   useSelectionStore (Zustand)        ← updated by SelectionOutline / canvas
 *     selectedBlockId
 *       ↓
 *   InspectorPanel reads it
 *     ↓
 *   BlockInspector(selectedBlockId)    ← renders all content fields
 *   useBlockInspector()                ← provides delete / duplicate actions
 *   resolveBlockEditor(block.type)     ← optional type-specific quick editor
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • InspectorPanel does NOT modify the document directly.
 * • All mutations flow through `useBlockInspector` → `engine.enqueuePatch()`.
 * • InspectorPanel does NOT modify any existing file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState }          from 'react'
import { useSelectionStore }        from '@/editor/selection/selectionStore'
import { BlockInspector }           from './BlockInspector'
import { useBlockInspector }        from './useBlockInspector'
import { resolveBlockEditor }       from './TextBlockEditor'
import { SectionInspector }         from './SectionInspector'
import { blockTypes, BLOCK_DEFAULTS } from '@/editor/blocks/blockTypes'
import { engine }                   from '@/core/document/engineInstance'

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Rendered when no block is selected. */
function EmptyState() {
  const hints = [
    { key: 'Click block',    desc: 'select + inspect' },
    { key: '⌘Z',             desc: 'undo last change' },
    { key: '⌘⇧Z',           desc: 'redo' },
    { key: 'Delete',         desc: 'remove selected block' },
    { key: '/',              desc: 'insert block below' },
  ]
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      height:         '100%',
      fontFamily:     'var(--font-ui)',
      padding:        '24px 16px',
      gap:            20,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, opacity: 0.15, color: '#C9A84C', marginBottom: 10 }}>◈</div>
        <div style={{ fontSize: 11, color: '#6A6460', lineHeight: 1.7 }}>
          Select a block to<br />inspect its settings
        </div>
      </div>
      <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
        <div style={{ fontSize: 8, color: '#2A2824', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 10 }}>
          Shortcuts
        </div>
        {hints.map(h => (
          <div key={h.key} style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 7,
          }}>
            <kbd style={{
              fontSize: 9, padding: '2px 6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4, color: '#6A6460',
              fontFamily: 'var(--font-ui)',
            }}>
              {h.key}
            </kbd>
            <span style={{ fontSize: 9, color: '#3A3834' }}>{h.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab bar shared style helper
// ─────────────────────────────────────────────────────────────────────────────

type InspectorTab = 'fields' | 'quick-edit'

function TabBar({
  active,
  hasQuickEdit,
  onChange,
}: {
  active:       InspectorTab
  hasQuickEdit: boolean
  onChange:     (tab: InspectorTab) => void
}) {
  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    flex:          1,
    padding:       '9px 6px',
    fontSize:      9,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    background:    'transparent',
    border:        'none',
    cursor:        'pointer',
    fontFamily:    'var(--font-ui)',
    color:         isActive ? '#C9A84C' : '#3A3834',
    borderBottom:  isActive ? '2px solid #C9A84C' : '2px solid transparent',
    transition:    'color 0.1s, border-color 0.1s',
  })

  return (
    <div style={{
      display:      'flex',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      flexShrink:   0,
    }}>
      <button style={tabStyle(active === 'fields')} onClick={() => onChange('fields')}>
        Fields
      </button>
      {hasQuickEdit && (
        <button style={tabStyle(active === 'quick-edit')} onClick={() => onChange('quick-edit')}>
          Quick Edit
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InspectorPanel
// ─────────────────────────────────────────────────────────────────────────────

export interface InspectorPanelProps {
  /**
   * Applied to the outermost container div.
   * Use to set width, height, or border from the parent layout.
   */
  style?: React.CSSProperties
}

/**
 * InspectorPanel — the Zustand-connected inspector container.
 *
 * Reads `selectedBlockId` from the Zustand selection store and delegates
 * all field rendering to the existing `BlockInspector` component.
 *
 * @example — in EditorLayout (replaces the inline <BlockInspector>)
 *   import { InspectorPanel } from '@/editor/inspector/InspectorPanel'
 *   // …
 *   <InspectorPanel />
 */
export function InspectorPanel({ style }: InspectorPanelProps) {
  // ── Selection state from Zustand ───────────────────────────────────────────
  const selectedBlockId   = useSelectionStore((s) => s.selectedBlockId)
  const selectedSectionId = useSelectionStore((s) => s.selectedSectionId)

  // ── Block data + actions from the inspector engine hook ───────────────────
  const inspector = useBlockInspector()

  // ── Type-specific quick editor ────────────────────────────────────────────
  const QuickEditor = inspector.block
    ? resolveBlockEditor(inspector.block.type)
    : null

  // ── Active tab — only relevant when quick editor is available ─────────────
  const [activeTab, setActiveTab] = useState<InspectorTab>('fields')

  // Reset to 'fields' tab whenever the selected block changes
  React.useEffect(() => {
    setActiveTab('fields')
  }, [selectedBlockId])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    '#0F0F14',
      fontFamily:    'var(--font-ui)',
      overflow:      'hidden',
      ...style,
    }}>

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {!selectedBlockId && !selectedSectionId && <EmptyState />}

      {/* ── Section selected (no block) ────────────────────────────────── */}
      {!selectedBlockId && selectedSectionId && (
        <SectionInspector sectionId={selectedSectionId} />
      )}

      {/* ── Block selected ─────────────────────────────────────────────── */}
      {selectedBlockId && (
        <>
          {/* Block type header + actions */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '10px 14px 8px',
            borderBottom:   '1px solid rgba(255,255,255,0.05)',
            flexShrink:     0,
          }}>
            {/* Block type swap — select changes block type, resets to new defaults */}
            <select
              value={inspector.block?.type ?? ''}
              disabled={!inspector.hasBlock}
              onChange={e => {
                if (!selectedBlockId || !inspector.block) return
                const newType = e.target.value
                if (newType === inspector.block.type) return
                // Type swap resets all block content — confirm before proceeding
                const ok = window.confirm(
                  `Change block type to "${newType}"?\n\nThis will reset the block's content to defaults. This action can be undone with Cmd+Z.`
                )
                if (!ok) return
                // Swap type and reset content to new type's defaults
                engine.enqueuePatch({
                  op:     'update',
                  target: 'block',
                  id:     selectedBlockId,
                  data:   {
                    type:    newType,
                    content: { ...(BLOCK_DEFAULTS[newType] ?? {}) },
                  },
                  meta: { source: 'editor' },
                })
              }}
              title="Change block type"
              style={{
                padding:      '3px 8px',
                background:   'rgba(201,168,76,0.08)',
                border:       '1px solid rgba(201,168,76,0.22)',
                borderRadius: 6,
                color:        '#C9A84C',
                fontSize:     10,
                fontFamily:   'var(--font-ui)',
                cursor:       inspector.hasBlock ? 'pointer' : 'default',
                outline:      'none',
                appearance:   'none',
                paddingRight: 20,
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'8\' height=\'5\' viewBox=\'0 0 8 5\'%3E%3Cpath d=\'M0 0l4 5 4-5z\' fill=\'%23C9A84C\' opacity=\'0.6\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {blockTypes.map(bt => (
                <option key={bt.type} value={bt.type} style={{ background: '#111', color: '#eee' }}>
                  {bt.type}
                </option>
              ))}
            </select>

            {/* Header actions — Duplicate + Delete */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={inspector.duplicateBlock}
                disabled={!inspector.hasBlock}
                title="Duplicate block"
                style={{
                  background:   'rgba(255,255,255,0.04)',
                  border:       '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 6,
                  color:        '#7A7870',
                  cursor:       inspector.hasBlock ? 'pointer' : 'default',
                  fontSize:     11,
                  padding:      '3px 9px',
                  fontFamily:   'var(--font-ui)',
                  opacity:      inspector.hasBlock ? 1 : 0.4,
                }}
              >
                ⊕
              </button>
              <button
                onClick={inspector.deleteBlock}
                disabled={!inspector.hasBlock}
                title="Delete block"
                style={{
                  background:   'rgba(220,80,80,0.08)',
                  border:       '1px solid rgba(220,80,80,0.18)',
                  borderRadius: 6,
                  color:        '#cc6666',
                  cursor:       inspector.hasBlock ? 'pointer' : 'default',
                  fontSize:     11,
                  padding:      '3px 9px',
                  fontFamily:   'var(--font-ui)',
                  opacity:      inspector.hasBlock ? 1 : 0.4,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Block id — subtle, for debug */}
          <div style={{
            padding:       '4px 14px',
            fontSize:      8,
            color:         '#252320',
            letterSpacing: '0.05em',
            overflow:      'hidden',
            textOverflow:  'ellipsis',
            whiteSpace:    'nowrap',
            flexShrink:    0,
          }}>
            {selectedBlockId}
          </div>

          {/* Tab bar — only shown when a quick editor exists */}
          {QuickEditor && (
            <TabBar
              active={activeTab}
              hasQuickEdit={!!QuickEditor}
              onChange={setActiveTab}
            />
          )}

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto' }}>

            {/* Fields tab — delegates to the full BlockInspector */}
            {activeTab === 'fields' && (
              <BlockInspector selectedBlockId={selectedBlockId ?? undefined} />
            )}

            {/* Quick Edit tab — type-specific editor from TextBlockEditor.tsx */}
            {activeTab === 'quick-edit' && QuickEditor && inspector.block && (
              <div style={{ padding: '12px 14px' }}>
                <QuickEditor
                  content={inspector.block.content as Record<string, unknown>}
                  onChange={(key, value) => inspector.updateField(key, value)}
                />
              </div>
            )}
          </div>

          {/* Move up / down footer — shown only when a block is active */}
          {inspector.hasBlock && (
            <div style={{
              display:      'flex',
              gap:          4,
              padding:      '8px 14px',
              borderTop:    '1px solid rgba(255,255,255,0.04)',
              flexShrink:   0,
            }}>
              <button
                onClick={inspector.moveUp}
                title="Move block up"
                style={{
                  flex:         1,
                  padding:      '6px',
                  background:   'rgba(255,255,255,0.03)',
                  border:       '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 7,
                  color:        '#5A5854',
                  cursor:       'pointer',
                  fontFamily:   'var(--font-ui)',
                  fontSize:     11,
                }}
              >
                ↑ Move up
              </button>
              <button
                onClick={inspector.moveDown}
                title="Move block down"
                style={{
                  flex:         1,
                  padding:      '6px',
                  background:   'rgba(255,255,255,0.03)',
                  border:       '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 7,
                  color:        '#5A5854',
                  cursor:       'pointer',
                  fontFamily:   'var(--font-ui)',
                  fontSize:     11,
                }}
              >
                ↓ Move down
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
