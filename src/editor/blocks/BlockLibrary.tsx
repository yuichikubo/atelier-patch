'use client'
/**
 * ATELIER CMS — Block Library
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * BlockLibrary is a UI component that displays all available block types and
 * lets the user select one to add to the page.
 *
 * When a block is clicked the component emits:
 *   onSelect(type: string, definition: BlockTypeDefinition)
 *
 * The CALLER is responsible for converting the selection into a Patch and
 * sending it to PatchEngine. This component has no direct coupling to the
 * engine, document, or selection store.
 *
 * DATA FLOW
 * ─────────
 *   User clicks a block in the library
 *     → BlockLibrary calls onSelect(type, definition)
 *       → caller calls engine.enqueuePatch({ op:'add', target:'block', … })
 *         → PatchEngine adds the block to the document
 *           → Renderer re-renders the canvas
 *
 * FEATURES
 * ────────
 * • Search / filter blocks by label, description, or keyword
 * • Category tabs (Layout / Content / Media)
 * • Hover tooltip with block description
 * • Active/hover states with ATELIER gold accent
 * • Zero dependencies outside this directory and core/document/types
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  blockTypes,
  searchBlockTypes,
  getBlocksByCategory,
  type BlockTypeDefinition,
  type BlockCategory,
  BLOCK_CATEGORIES,
} from './blockTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockLibraryProps {
  /**
   * Called when the user clicks a block entry.
   *
   * @param type        The block type string (e.g. 'hero', 'text')
   * @param definition  Full block type definition from the registry
   */
  onSelect: (type: string, definition: BlockTypeDefinition) => void

  /**
   * If provided, only blocks matching these categories are shown,
   * and the category tabs are hidden.
   */
  filterCategories?: BlockCategory[]

  /**
   * If true, the search bar is hidden.
   * Useful when the library is embedded in a compact sidebar.
   */
  hideSearch?: boolean

  /**
   * Custom style applied to the root container.
   */
  style?: React.CSSProperties
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal style tokens
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  root: {
    display:       'flex',
    flexDirection: 'column',
    height:        '100%',
    background:    '#0F0F14',
    fontFamily:    'var(--font-ui)',
    overflow:      'hidden',
  } as React.CSSProperties,

  searchWrap: {
    padding:      '10px 12px 8px',
    flexShrink:   0,
  } as React.CSSProperties,

  searchInput: {
    width:        '100%',
    background:   '#0B0B10',
    border:       '1px solid rgba(255,255,255,0.07)',
    borderRadius: 8,
    padding:      '7px 10px',
    color:        '#E8E4DC',
    fontFamily:   'var(--font-ui)',
    fontSize:     11,
    outline:      'none',
    boxSizing:    'border-box',
  } as React.CSSProperties,

  catBar: {
    display:        'flex',
    borderBottom:   '1px solid rgba(255,255,255,0.05)',
    flexShrink:     0,
  } as React.CSSProperties,

  catBtn: (active: boolean): React.CSSProperties => ({
    flex:          1,
    padding:       '8px 4px',
    fontSize:      9,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    background:    'transparent',
    border:        'none',
    cursor:        'pointer',
    fontFamily:    'var(--font-ui)',
    color:         active ? '#C9A84C' : '#3A3834',
    borderBottom:  active ? '2px solid #C9A84C' : '2px solid transparent',
    transition:    'color 0.12s, border-color 0.12s',
  }),

  list: {
    flex:       1,
    overflowY:  'auto',
    padding:    '8px 10px 16px',
  } as React.CSSProperties,

  catHeading: {
    fontSize:      8,
    color:         '#3A3834',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    padding:       '10px 4px 5px',
  } as React.CSSProperties,

  blockBtn: (hovered: boolean): React.CSSProperties => ({
    display:       'flex',
    alignItems:    'center',
    gap:           10,
    width:         '100%',
    padding:       '9px 10px',
    marginBottom:  3,
    background:    hovered ? 'rgba(201,168,76,0.07)' : 'rgba(255,255,255,0.02)',
    border:        hovered
                     ? '1px solid rgba(201,168,76,0.22)'
                     : '1px solid rgba(255,255,255,0.04)',
    borderRadius:  9,
    cursor:        'pointer',
    textAlign:     'left',
    transition:    'background 0.1s, border-color 0.1s',
    fontFamily:    'var(--font-ui)',
  }),

  blockIcon: {
    fontSize:   18,
    lineHeight:  1,
    flexShrink:  0,
    width:       24,
    textAlign:   'center',
  } as React.CSSProperties,

  blockMeta: {
    flex:     1,
    overflow: 'hidden',
  } as React.CSSProperties,

  blockLabel: {
    fontSize:   11,
    color:      '#C8C4BC',
    fontWeight: 500,
    display:    'block',
    lineHeight: 1.3,
  } as React.CSSProperties,

  blockDesc: {
    fontSize:     9,
    color:        '#4A4844',
    marginTop:    2,
    lineHeight:   1.5,
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  } as React.CSSProperties,

  arrow: {
    fontSize:   10,
    color:      '#3A3834',
    flexShrink:  0,
  } as React.CSSProperties,

  empty: {
    padding:    '32px 16px',
    textAlign:  'center',
    color:      '#2A2824',
    fontSize:   11,
    lineHeight: 1.7,
  } as React.CSSProperties,
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function BlockEntry({
  definition,
  onSelect,
}: {
  definition: BlockTypeDefinition
  onSelect:   (type: string, def: BlockTypeDefinition) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      style={S.blockBtn(hovered)}
      onClick={() => onSelect(definition.type, definition)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={definition.description}
      aria-label={`Add ${definition.label} block`}
    >
      <span style={S.blockIcon}>{definition.icon}</span>
      <span style={S.blockMeta}>
        <span style={S.blockLabel}>{definition.label}</span>
        <span style={S.blockDesc}>{definition.description}</span>
      </span>
      {hovered && <span style={S.arrow}>+</span>}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block Library UI — lists all available block types grouped by category.
 *
 * Emits `onSelect(type, definition)` when a block is clicked.
 * Does NOT modify the document — the caller is responsible for applying a patch.
 */
export function BlockLibrary({
  onSelect,
  filterCategories,
  hideSearch = false,
  style,
}: BlockLibraryProps) {
  const [search,  setSearch]  = useState('')
  const [activeCategory, setActiveCategory] = useState<BlockCategory | 'all'>('all')

  // ── Derived block list ────────────────────────────────────────────────────

  const visibleBlocks = useMemo(() => {
    // Start from search results (or full list if no query)
    let results = searchBlockTypes(search)

    // Apply caller-supplied category filter
    if (filterCategories && filterCategories.length > 0) {
      results = results.filter(b => filterCategories.includes(b.category))
    }

    // Apply active category tab
    if (activeCategory !== 'all') {
      results = results.filter(b => b.category === activeCategory)
    }

    return results
  }, [search, activeCategory, filterCategories])

  // ── Group by category for display ────────────────────────────────────────

  const groupedBlocks = useMemo(() => {
    const groups: Array<{ category: BlockCategory; label: string; blocks: BlockTypeDefinition[] }> = []
    const CATEGORY_LABELS: Record<BlockCategory, string> = {
      layout:  'Layout',
      content: 'Content',
      media:   'Media',
      data:    'Data',
    }

    const categories = BLOCK_CATEGORIES.filter(c =>
      visibleBlocks.some(b => b.category === c),
    )

    for (const cat of categories) {
      const blocks = visibleBlocks.filter(b => b.category === cat)
      if (blocks.length > 0) {
        groups.push({ category: cat, label: CATEGORY_LABELS[cat], blocks })
      }
    }

    return groups
  }, [visibleBlocks])

  // ── Whether to show category tabs ─────────────────────────────────────────

  const showTabs = !filterCategories || filterCategories.length === 0

  // ── Available tabs (only categories that have blocks) ────────────────────

  const availableCats = useMemo(() =>
    BLOCK_CATEGORIES.filter(c => blockTypes.some(b => b.category === c)),
  [])

  const handleSelect = useCallback((type: string, def: BlockTypeDefinition) => {
    onSelect(type, def)
  }, [onSelect])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ ...S.root, ...style }}>

      {/* Search */}
      {!hideSearch && (
        <div style={S.searchWrap}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search blocks…"
            style={S.searchInput}
            aria-label="Search block library"
          />
        </div>
      )}

      {/* Category tabs */}
      {showTabs && !search && (
        <div style={S.catBar} role="tablist" aria-label="Block categories">
          <button
            role="tab"
            aria-selected={activeCategory === 'all'}
            style={S.catBtn(activeCategory === 'all')}
            onClick={() => setActiveCategory('all')}
          >
            All
          </button>
          {availableCats.map(cat => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCategory === cat}
              style={S.catBtn(activeCategory === cat)}
              onClick={() => setActiveCategory(cat)}
            >
              {(cat as string) === 'feature-list' ? 'feat.' : cat}
            </button>
          ))}
        </div>
      )}

      {/* Block list */}
      <div style={S.list} role="list" aria-label="Available blocks">

        {visibleBlocks.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◈</div>
            No blocks match<br />
            <span style={{ color: '#C9A84C', fontSize: 10 }}>"{search}"</span>
          </div>
        )}

        {/* When searching: flat list, no category headings */}
        {search
          ? visibleBlocks.map(def => (
              <BlockEntry
                key={def.type}
                definition={def}
                onSelect={handleSelect}
              />
            ))
          /* When browsing: grouped by category with headings */
          : groupedBlocks.map(group => (
              <div key={group.category} role="group" aria-label={group.label}>
                <div style={S.catHeading}>{group.label}</div>
                {group.blocks.map(def => (
                  <BlockEntry
                    key={def.type}
                    definition={def}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            ))
        }
      </div>
    </div>
  )
}
