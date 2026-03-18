/**
 * ATELIER CMS — Automation Engine
 *
 * The Automation Engine registers automation rules, listens for triggers,
 * and applies the resulting patches through engine.enqueuePatch().
 *
 * INVARIANT: Automation NEVER mutates the document directly.
 * The flow is always:
 *
 *   Trigger fires
 *     → rule.handler() returns Patch[]
 *       → patchTransactionManager.run()
 *         → engine.enqueuePatch(patch)   ← ONLY mutation path
 *           → patchEventBus.emit(...)    ← subscribers notified
 */

import { engine }                  from '@/core/document/engineInstance'
import { patchTransactionManager } from '@/core/patch/transaction'
import { patchEventBus }           from '@/core/patch/eventBus'
import type { Patch }              from '@/core/patch/types'
import { TriggerSystem }           from './TriggerSystem'
import type { TriggerContext }     from './TriggerSystem'
import { BUILT_IN_RULES }         from './AutomationRules'
import type { AutomationRuleDefinition } from './AutomationRules'

// ─────────────────────────────────────────────────────────────────────────────
// Runtime record — stored per registered rule
// ─────────────────────────────────────────────────────────────────────────────

interface RuleRecord {
  definition:  AutomationRuleDefinition
  enabled:     boolean
  unregister:  () => void
  runCount:    number
  lastRunAt:   string | null
  lastResult:  RunResult | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Run result
// ─────────────────────────────────────────────────────────────────────────────

export interface RunResult {
  ok:        boolean
  ruleId:    string
  applied:   number
  skipped:   boolean   // handler returned [] — condition not met
  error?:    string
  timestamp: string
}

// ─────────────────────────────────────────────────────────────────────────────
// AutomationEngine
// ─────────────────────────────────────────────────────────────────────────────

class AutomationEngineClass {
  private rules     = new Map<string, RuleRecord>()
  private listeners = new Set<(result: RunResult) => void>()

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register an automation rule. If the rule is enabled, its trigger
   * is activated immediately.
   */
  register(definition: AutomationRuleDefinition): void {
    if (this.rules.has(definition.id)) {
      console.warn(`[AutomationEngine] Rule "${definition.id}" is already registered — skipping.`)
      return
    }

    const unregister = definition.enabled
      ? this.activateTrigger(definition)
      : () => {}

    this.rules.set(definition.id, {
      definition,
      enabled:    definition.enabled,
      unregister,
      runCount:   0,
      lastRunAt:  null,
      lastResult: null,
    })
  }

  /**
   * Register multiple rules at once.
   */
  registerAll(definitions: AutomationRuleDefinition[]): void {
    for (const def of definitions) this.register(def)
  }

  /**
   * Unregister a rule and deactivate its trigger.
   */
  unregister(ruleId: string): void {
    const record = this.rules.get(ruleId)
    if (!record) return
    record.unregister()
    TriggerSystem.unregisterAll(ruleId)
    this.rules.delete(ruleId)
  }

  // ── Enable / disable ──────────────────────────────────────────────────────

  /**
   * Enable a rule — activates its trigger subscription.
   */
  enable(ruleId: string): void {
    const record = this.rules.get(ruleId)
    if (!record || record.enabled) return
    record.unregister = this.activateTrigger(record.definition)
    record.enabled    = true
  }

  /**
   * Disable a rule — removes trigger subscription. Rule stays registered.
   */
  disable(ruleId: string): void {
    const record = this.rules.get(ruleId)
    if (!record || !record.enabled) return
    record.unregister()
    TriggerSystem.unregisterAll(ruleId)
    record.enabled    = false
    record.unregister = () => {}
  }

  // ── Manual execution ──────────────────────────────────────────────────────

  /**
   * Manually run a rule immediately, regardless of its trigger.
   * Useful for testing, user-initiated automation, and AI-driven workflows.
   */
  async run(ruleId: string, payload: unknown = null): Promise<RunResult> {
    const record = this.rules.get(ruleId)
    if (!record) {
      return this.makeResult(ruleId, false, 0, false, `Rule "${ruleId}" not registered`)
    }

    const ctx: TriggerContext = {
      triggerType:  'manual',
      firedAt:      new Date().toISOString(),
      eventPayload: payload,
      ruleId,
    }

    return this.executeRule(record, ctx)
  }

  /**
   * Fire the trigger for a rule manually (useful for 'manual' trigger type).
   */
  fireTrigger(ruleId: string, payload: unknown = null): void {
    TriggerSystem.fireTrigger(ruleId, payload)
  }

  // ── Inspection ────────────────────────────────────────────────────────────

  /** All registered rules with their current runtime state. */
  listRules(): Array<{
    id:        string
    name:      string
    enabled:   boolean
    runCount:  number
    lastRunAt: string | null
    lastResult: RunResult | null
    trigger:   string
  }> {
    return [...this.rules.values()].map(r => ({
      id:         r.definition.id,
      name:       r.definition.name,
      enabled:    r.enabled,
      runCount:   r.runCount,
      lastRunAt:  r.lastRunAt,
      lastResult: r.lastResult,
      trigger:    r.definition.trigger.type,
    }))
  }

  /** Subscribe to run results (for UI notifications and logging). */
  onRun(listener: (result: RunResult) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private activateTrigger(definition: AutomationRuleDefinition): () => void {
    return TriggerSystem.register(
      definition.id,
      definition.trigger,
      (ctx) => { this.executeRule(this.rules.get(definition.id)!, ctx) },
    )
  }

  private async executeRule(record: RuleRecord, ctx: TriggerContext): Promise<RunResult> {
    const ruleId = record.definition.id
    let result: RunResult

    try {
      // ── Get patches from handler ─────────────────────────────────────────
      const patches: Patch[] = await Promise.resolve(record.definition.handler(ctx))

      if (patches.length === 0) {
        result = this.makeResult(ruleId, true, 0, true)
      } else {
        // ── Apply via transaction ──────────────────────────────────────────
        const txResult = await patchTransactionManager.run(
          (tx) => { for (const p of patches) tx.add(p) },
          (patch)      => engine.enqueuePatch(patch),
          (patchArray) => engine.applyPatchArray(patchArray),
          { label: `automation:${ruleId}`, source: 'automation', strategy: 'batch' },
        )

        if (txResult.ok) {
          // Notify the public bus
          patchEventBus.emit({
            type:    'document-changed',
            payload: {
              version:     engine.getVersion(),
              changeCount: txResult.applied,
            },
            context: { source: 'automation' },
          })
        }

        result = this.makeResult(
          ruleId,
          txResult.ok,
          txResult.applied,
          false,
          txResult.error,
        )
      }
    } catch (e: unknown) {
      result = this.makeResult(
        ruleId,
        false,
        0,
        false,
        e instanceof Error ? e.message : String(e),
      )
    }

    // Update runtime state
    record.runCount++
    record.lastRunAt  = result.timestamp
    record.lastResult = result

    // Notify listeners (UI, logging)
    for (const listener of this.listeners) {
      try { listener(result) } catch {}
    }

    return result
  }

  private makeResult(
    ruleId:  string,
    ok:      boolean,
    applied: number,
    skipped: boolean,
    error?:  string,
  ): RunResult {
    return { ok, ruleId, applied, skipped, error, timestamp: new Date().toISOString() }
  }

  /** Unregister all rules and release all trigger resources. */
  destroy(): void {
    for (const [ruleId] of this.rules) this.unregister(ruleId)
    TriggerSystem.destroy()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton + bootstrap
// ─────────────────────────────────────────────────────────────────────────────

export const automationEngine = new AutomationEngineClass()

/**
 * Bootstrap the Automation Engine with all built-in rules.
 * Call once at application startup (e.g. in AppBootstrap.tsx).
 *
 * @example
 *   import { bootstrapAutomation } from '@/extensions/automation/AutomationEngine'
 *   bootstrapAutomation()
 */
export function bootstrapAutomation(
  extra: AutomationRuleDefinition[] = [],
): void {
  automationEngine.registerAll([...BUILT_IN_RULES, ...extra])
}
