'use client'
/**
 * ATELIER CMS — Automation Panel
 *
 * Displays the registered automation rules and lets the user enable or disable
 * each one. Enabled rules watch for their trigger and apply patches
 * automatically when conditions are met.
 *
 * INVARIANT — automation never mutates the document directly.
 * The flow is always:
 *
 *   User enables rule → automationEngine.enable(id)
 *     → TriggerSystem registers the trigger
 *       → trigger fires
 *         → rule.handler() returns Patch[]
 *           → engine.enqueuePatch()   ← ONLY mutation path
 *
 * User disables rule → automationEngine.disable(id)
 *     → TriggerSystem unregisters trigger, no more patches
 */

import React, { useState, useEffect, useCallback } from 'react'
import { automationEngine }       from '@/extensions/automation/AutomationEngine'
import { BUILT_IN_RULES }         from '@/extensions/automation/AutomationRules'
import type { RunResult }          from '@/extensions/automation/AutomationEngine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RuleRow {
  id:         string
  name:       string
  enabled:    boolean
  runCount:   number
  lastRunAt:  string | null
  lastResult: RunResult | null
  trigger:    string
}

// ─────────────────────────────────────────────────────────────────────────────
// Trigger type → readable label
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_LABEL: Record<string, string> = {
  'on-save':         'On save',
  'on-publish':      'On publish',
  'interval':        'Scheduled',
  'document-change': 'On change',
  'block-added':     'On block add',
  'manual':          'Manual only',
}

function triggerLabel(type: string): string {
  return TRIGGER_LABEL[type] ?? type
}

// ─────────────────────────────────────────────────────────────────────────────
// Category badge derived from rule id prefix
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  seo:       '#60a5fa',
  structure: '#a78bfa',
  quality:   '#fbbf24',
  media:     '#34d399',
}

function categoryFromId(id: string): { label: string; color: string } {
  const prefix = id.split('/')[0] ?? 'other'
  return {
    label: prefix.charAt(0).toUpperCase() + prefix.slice(1),
    color: CATEGORY_COLOR[prefix] ?? '#4A4844',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RuleCard
// ─────────────────────────────────────────────────────────────────────────────

interface RuleCardProps {
  rule:       RuleRow
  onToggle:   (id: string, enabled: boolean) => void
  lastFlash?: RunResult | null
}

function RuleCard({ rule, onToggle, lastFlash }: RuleCardProps) {
  const cat = categoryFromId(rule.id)

  const hasFlash = lastFlash && lastFlash.ruleId === rule.id

  return (
    <div style={{
      padding:      '10px 12px',
      borderRadius: 8,
      background:   '#13131C',
      border:       rule.enabled
        ? '1px solid rgba(201,168,76,0.15)'
        : '1px solid rgba(255,255,255,0.05)',
      marginBottom: 6,
      transition:   'border-color 0.15s',
    }}>

      {/* Top row: toggle + name */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        {/* Toggle */}
        <button
          onClick={() => onToggle(rule.id, !rule.enabled)}
          title={rule.enabled ? 'Disable rule' : 'Enable rule'}
          style={{
            width:         34,
            height:        18,
            borderRadius:  9,
            border:        'none',
            cursor:        'pointer',
            background:    rule.enabled ? '#C9A84C' : 'rgba(255,255,255,0.1)',
            position:      'relative',
            flexShrink:    0,
            marginTop:     1,
            transition:    'background 0.2s',
          }}
        >
          <span style={{
            position:   'absolute',
            top:        2,
            left:       rule.enabled ? 17 : 2,
            width:      14,
            height:     14,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
          }} />
        </button>

        {/* Name + meta */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:11, color: rule.enabled ? '#C8C4BC' : '#5A5854', fontFamily:'DM Mono,monospace' }}>
            {rule.name}
          </div>
          <div style={{ marginTop:4, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{
              fontSize:8, padding:'1px 6px', borderRadius:10,
              background:`${cat.color}18`, color:cat.color,
              border:`1px solid ${cat.color}30`,
            }}>
              {cat.label}
            </span>
            <span style={{ fontSize:8, color:'#3A3834', fontFamily:'DM Mono,monospace' }}>
              {triggerLabel(rule.trigger)}
            </span>
            {rule.runCount > 0 && (
              <span style={{ fontSize:8, color:'#3A3834' }}>
                ran {rule.runCount}×
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Last run flash */}
      {hasFlash && !lastFlash!.skipped && (
        <div style={{
          marginTop:   8,
          padding:     '4px 8px',
          borderRadius: 6,
          fontSize:    9,
          fontFamily:  'DM Mono,monospace',
          background:  lastFlash!.ok ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
          color:       lastFlash!.ok ? '#4ade80' : '#f87171',
          border:      `1px solid ${lastFlash!.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'}`,
        }}>
          {lastFlash!.ok
            ? `✓ Applied ${lastFlash!.applied} patch${lastFlash!.applied !== 1 ? 'es' : ''}`
            : `✗ ${lastFlash!.error ?? 'Failed'}`
          }
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AutomationPanel
// ─────────────────────────────────────────────────────────────────────────────

export function AutomationPanel() {
  const [rules,     setRules]     = useState<RuleRow[]>([])
  const [lastFlash, setLastFlash] = useState<RunResult | null>(null)

  // ── Bootstrap: register all built-in rules once, then read state ──────────

  useEffect(() => {
    // ── Load persisted enabled state ────────────────────────────────────────
    let saved: Record<string, boolean> = {}
    try {
      const raw = localStorage.getItem('atelier_automation_rules')
      if (raw) saved = JSON.parse(raw)
    } catch { /* ignore parse errors */ }

    // Register built-in rules, applying saved enabled state where available
    for (const def of BUILT_IN_RULES) {
      const patchedDef = (def.id in saved)
        ? { ...def, enabled: saved[def.id] }
        : def
      try { automationEngine.register(patchedDef) } catch { /* already registered */ }
    }

    // Sync enabled state for already-registered rules
    for (const [id, enabled] of Object.entries(saved)) {
      if (enabled) { try { automationEngine.enable(id)  } catch {} }
      else         { try { automationEngine.disable(id) } catch {} }
    }

    setRules(automationEngine.listRules())

    // Subscribe to run results for feedback flashes
    const unsub = automationEngine.onRun((result) => {
      setRules(automationEngine.listRules())     // refresh counts + lastRunAt
      if (!result.skipped) {
        setLastFlash(result)
        setTimeout(() => setLastFlash(r => r?.ruleId === result.ruleId ? null : r), 3000)
      }
    })

    return unsub
  }, [])

  // ── Toggle handler ────────────────────────────────────────────────────────

  const handleToggle = useCallback((id: string, shouldEnable: boolean) => {
    if (shouldEnable) {
      automationEngine.enable(id)
    } else {
      automationEngine.disable(id)
    }
    const updated = automationEngine.listRules()
    setRules(updated)

    // Persist enabled state
    try {
      const state: Record<string, boolean> = {}
      for (const r of updated) state[r.id] = r.enabled
      localStorage.setItem('atelier_automation_rules', JSON.stringify(state))
    } catch { /* localStorage unavailable — incognito/SSR */ }
  }, [])

  // ── Split into enabled / disabled for clarity ─────────────────────────────

  const enabled  = rules.filter(r => r.enabled)
  const disabled = rules.filter(r => !r.enabled)

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      fontFamily:    'DM Mono, monospace',
      background:    '#0F0F14',
    }}>

      {/* Header */}
      <div style={{
        padding:      '10px 14px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink:   0,
        display:      'flex',
        alignItems:   'center',
        justifyContent:'space-between',
      }}>
        <span style={{ fontSize:9, color:'#4A4844', letterSpacing:'0.15em', textTransform:'uppercase' }}>
          Automation
        </span>
        {enabled.length > 0 && (
          <span style={{
            fontSize:8, padding:'1px 6px', borderRadius:10,
            background:'rgba(201,168,76,0.1)', color:'rgba(201,168,76,0.7)',
            border:'1px solid rgba(201,168,76,0.2)',
          }}>
            {enabled.length} active
          </span>
        )}
      </div>

      {/* Rule list */}
      <div style={{ flex:1, overflow:'auto', padding:'10px 12px' }}>

        {rules.length === 0 ? (
          <div style={{ padding:'32px 0', textAlign:'center', color:'#3A3834', fontSize:11 }}>
            No automation rules available.
          </div>
        ) : (
          <>
            {/* Active rules */}
            {enabled.length > 0 && (
              <>
                <div style={{ fontSize:8, color:'#2A2824', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6 }}>
                  Active
                </div>
                {enabled.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    lastFlash={lastFlash}
                  />
                ))}
              </>
            )}

            {/* Available rules */}
            {disabled.length > 0 && (
              <>
                <div style={{ fontSize:8, color:'#2A2824', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:6, marginTop: enabled.length > 0 ? 14 : 0 }}>
                  Available
                </div>
                {disabled.map(rule => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    lastFlash={lastFlash}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* Footer note */}
        <div style={{ marginTop:16, fontSize:9, color:'#252320', lineHeight:1.7, textAlign:'center' }}>
          Enabled rules run automatically.<br />
          All changes go through the Patch Engine.
        </div>
      </div>
    </div>
  )
}
