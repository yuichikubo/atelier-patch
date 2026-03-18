/**
 * ATELIER CMS — Trigger System
 *
 * Defines all trigger types and provides the runtime that evaluates
 * which triggers should fire given current conditions.
 *
 * Triggers NEVER apply patches — they only decide when an automation rule
 * should run. The AutomationEngine receives the fired trigger and dispatches
 * the associated rule, which generates patches via engine.enqueuePatch().
 */

import { patchEventBus }  from '@/core/patch/eventBus'
import type { PatchEventType } from '@/core/patch/eventBus'

// ─────────────────────────────────────────────────────────────────────────────
// Trigger type catalogue
// ─────────────────────────────────────────────────────────────────────────────

export type TriggerType =
  // ── Time-based ────────────────────────────────────────────────────────────
  | 'schedule:interval'   // fires every N milliseconds
  | 'schedule:cron'       // fires on a cron expression (string-based, parsed by engine)
  | 'schedule:once'       // fires once after a delay

  // ── Document lifecycle ─────────────────────────────────────────────────────
  | 'event:document-saved'
  | 'event:document-published'
  | 'event:document-changed'
  | 'event:document-loaded'

  // ── Patch lifecycle ────────────────────────────────────────────────────────
  | 'event:patch-applied'
  | 'event:block-added'
  | 'event:block-updated'
  | 'event:block-removed'
  | 'event:section-added'

  // ── Manual ────────────────────────────────────────────────────────────────
  | 'manual'              // triggered programmatically via engine.fire(ruleId)

// ─────────────────────────────────────────────────────────────────────────────
// Trigger configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleIntervalConfig {
  /** Interval in milliseconds. Minimum: 5000 (5 s). */
  intervalMs: number
}

export interface ScheduleCronConfig {
  /**
   * Simplified cron-like expression.
   * Format: "HH:MM" for daily at a specific time (UTC).
   * Example: "09:00" = every day at 9:00 AM UTC.
   */
  time: string
  /** Days of week (0=Sun … 6=Sat). Omit for every day. */
  days?: number[]
}

export interface ScheduleOnceConfig {
  /** Delay before firing, in milliseconds. */
  delayMs: number
}

export type TriggerConfig =
  | ({ type: 'schedule:interval' } & ScheduleIntervalConfig)
  | ({ type: 'schedule:cron' }     & ScheduleCronConfig)
  | ({ type: 'schedule:once' }     & ScheduleOnceConfig)
  | { type: 'event:document-saved' }
  | { type: 'event:document-published' }
  | { type: 'event:document-changed'; minChanges?: number }
  | { type: 'event:document-loaded' }
  | { type: 'event:patch-applied' }
  | { type: 'event:block-added';    blockType?: string }
  | { type: 'event:block-updated';  blockType?: string }
  | { type: 'event:block-removed' }
  | { type: 'event:section-added' }
  | { type: 'manual' }

// ─────────────────────────────────────────────────────────────────────────────
// Trigger context — passed to rule handlers when they fire
// ─────────────────────────────────────────────────────────────────────────────

export interface TriggerContext {
  /** The trigger type that fired. */
  triggerType:  TriggerType
  /** ISO timestamp of when the trigger fired. */
  firedAt:      string
  /** Event payload (for event-type triggers). */
  eventPayload: unknown
  /** Rule id that owns this trigger. */
  ruleId:       string
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration record (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface TriggerRegistration {
  ruleId:    string
  config:    TriggerConfig
  callback:  (ctx: TriggerContext) => void
  cleanup?:  () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron-like helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse "HH:MM" into { hours, minutes } in UTC. */
function parseCronTime(time: string): { hours: number; minutes: number } | null {
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return { hours: h, minutes: m }
}

/** Returns ms until the next occurrence of the given UTC time. */
function msUntilNext(hours: number, minutes: number, days?: number[]): number {
  const now   = new Date()
  const next  = new Date(now)
  next.setUTCHours(hours, minutes, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)

  if (days?.length) {
    // Advance until a matching day of week is found (max 7 iterations)
    for (let i = 0; i < 7; i++) {
      if (days.includes(next.getUTCDay())) break
      next.setUTCDate(next.getUTCDate() + 1)
    }
  }

  return next.getTime() - now.getTime()
}

// ─────────────────────────────────────────────────────────────────────────────
// PatchEvent → TriggerType mapping
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_MAP: Partial<Record<PatchEventType, TriggerType>> = {
  'document-saved':      'event:document-saved',
  'document-published':  'event:document-published',
  'document-changed':    'event:document-changed',
  'document-loaded':     'event:document-loaded',
  'patch-applied':       'event:patch-applied',
  'block-added':         'event:block-added',
  'block-updated':       'event:block-updated',
  'block-removed':       'event:block-removed',
  'section-added':       'event:section-added',
}

// ─────────────────────────────────────────────────────────────────────────────
// TriggerSystem
// ─────────────────────────────────────────────────────────────────────────────

class TriggerSystemClass {
  private registrations = new Map<string, TriggerRegistration[]>()
  private busUnsubs     = new Map<string, () => void>()

  /**
   * Register a trigger for a rule.
   * When the trigger fires, the callback receives a TriggerContext.
   *
   * @returns  An unregister function.
   */
  register(
    ruleId:   string,
    config:   TriggerConfig,
    callback: (ctx: TriggerContext) => void,
  ): () => void {
    const fire = (payload: unknown = null) => callback({
      triggerType:  config.type,
      firedAt:      new Date().toISOString(),
      eventPayload: payload,
      ruleId,
    })

    let cleanup: (() => void) | undefined

    // ── Schedule triggers ────────────────────────────────────────────────────
    if (config.type === 'schedule:interval') {
      const ms  = Math.max(config.intervalMs, 5000)
      const tid = setInterval(() => fire(), ms)
      cleanup   = () => clearInterval(tid)
    }

    else if (config.type === 'schedule:once') {
      const ms  = Math.max(config.delayMs, 0)
      const tid = setTimeout(() => fire(), ms)
      cleanup   = () => clearTimeout(tid)
    }

    else if (config.type === 'schedule:cron') {
      const parsed = parseCronTime(config.time)
      if (!parsed) {
        console.warn(`[TriggerSystem] Invalid cron time "${config.time}" for rule "${ruleId}"`)
        return () => {}
      }

      let tid: ReturnType<typeof setTimeout>
      const schedule = () => {
        const delay = msUntilNext(parsed.hours, parsed.minutes, config.days)
        tid = setTimeout(() => { fire(); schedule() }, delay)
      }
      schedule()
      cleanup = () => clearTimeout(tid)
    }

    // ── Event triggers ───────────────────────────────────────────────────────
    else if (config.type !== 'manual') {
      const patchEventType = Object.entries(EVENT_MAP).find(
        ([, t]) => t === config.type,
      )?.[0] as PatchEventType | undefined

      if (patchEventType) {
        const unsub = patchEventBus.on(patchEventType, (event) => {
          // Optional filtering
          if (config.type === 'event:document-changed') {
            const min = (config as any).minChanges ?? 1
            if (((event.payload as any)?.changeCount ?? 1) < min) return
          }
          if (config.type === 'event:block-added' || config.type === 'event:block-updated') {
            const reqType = (config as any).blockType
            if (reqType && (event.payload as any)?.blockType !== reqType) return
          }
          fire(event.payload)
        })
        cleanup = unsub
      }
    }
    // 'manual' has no subscription — fired via fireTrigger()

    const reg: TriggerRegistration = { ruleId, config, callback, cleanup }
    const existing = this.registrations.get(ruleId) ?? []
    this.registrations.set(ruleId, [...existing, reg])

    return () => {
      reg.cleanup?.()
      const regs = this.registrations.get(ruleId) ?? []
      this.registrations.set(ruleId, regs.filter(r => r !== reg))
    }
  }

  /**
   * Manually fire all triggers registered for a rule.
   * Used for 'manual' triggers and testing.
   */
  fireTrigger(ruleId: string, payload: unknown = null): void {
    const regs = this.registrations.get(ruleId) ?? []
    for (const reg of regs) {
      reg.callback({
        triggerType:  reg.config.type,
        firedAt:      new Date().toISOString(),
        eventPayload: payload,
        ruleId,
      })
    }
  }

  /** Unregister all triggers for a rule and release resources. */
  unregisterAll(ruleId: string): void {
    const regs = this.registrations.get(ruleId) ?? []
    for (const reg of regs) reg.cleanup?.()
    this.registrations.delete(ruleId)
  }

  /** Unregister all triggers across all rules. */
  destroy(): void {
    for (const [ruleId] of this.registrations) {
      this.unregisterAll(ruleId)
    }
    for (const unsub of this.busUnsubs.values()) unsub()
    this.busUnsubs.clear()
  }
}

export const TriggerSystem = new TriggerSystemClass()
