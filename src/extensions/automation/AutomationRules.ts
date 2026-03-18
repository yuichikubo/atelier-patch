/**
 * ATELIER CMS — Automation Rules
 *
 * Each rule pairs a trigger with a patch generator.
 * The patch generator receives context and returns Patch[] to apply.
 *
 * Rules NEVER mutate the document.
 * All changes go through engine.enqueuePatch() via the AutomationEngine.
 */

import { engine }            from '@/core/document/engineInstance'
import { suggestionEngine }  from '@/extensions/suggestion/SuggestionEngine'
import type { Patch }        from '@/core/patch/types'
import type { TriggerConfig, TriggerContext } from './TriggerSystem'

// ─────────────────────────────────────────────────────────────────────────────
// Rule types
// ─────────────────────────────────────────────────────────────────────────────

export interface AutomationRuleDefinition {
  /** Unique, stable identifier. */
  id:          string
  /** Display name shown in the automation manager UI. */
  name:        string
  /** Longer description of what this rule does. */
  description: string
  /** What condition fires this rule. */
  trigger:     TriggerConfig
  /**
   * The handler runs when the trigger fires.
   * Must return an array of Patch objects to apply.
   * Return [] to skip (e.g. when preconditions are not met).
   */
  handler:     (ctx: TriggerContext) => Patch[] | Promise<Patch[]>
  /** Whether this rule is active. Can be toggled at runtime. */
  enabled:     boolean
  /** Optional metadata for the UI. */
  meta?: {
    category?:  'seo' | 'content' | 'structure' | 'analytics'
    icon?:      string
    tags?:      string[]
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SEO auto-fill — on save, populate empty meta title/description from page content.
 */
const seoAutoFillRule: AutomationRuleDefinition = {
  id:          'seo/auto-fill-on-save',
  name:        'Auto-fill SEO on save',
  description: 'When the page is saved, automatically fills in missing meta title and description using the page title and hero text.',
  trigger:     { type: 'event:document-saved' },
  enabled:     true,
  meta:        { category: 'seo', icon: '🔍', tags: ['seo', 'meta'] },

  handler: (_ctx) => {
    const page    = engine.getDocument()
    const patches: Patch[] = []
    const seo     = (page.seo ?? {}) as Record<string, unknown>

    // Only fill fields that are genuinely empty
    const needsTitle = !seo.title?.toString().trim()
    const needsDesc  = !seo.description?.toString().trim()

    if (!needsTitle && !needsDesc) return []

    const heroBlock = page.sections
      .flatMap(s => s.blocks)
      .find(b => b.type === 'hero')

    const heroTitle    = (heroBlock?.content as any)?.title ?? ''
    const heroSubtitle = (heroBlock?.content as any)?.subtitle ?? ''

    const newSeo = { ...seo }
    if (needsTitle)  newSeo.title       = page.title || heroTitle || 'My Page'
    if (needsDesc)   newSeo.description = heroSubtitle || `${page.title} — Learn more.`

    patches.push({
      op:     'update',
      target: 'page',
      id:     'page',
      data:   { seo: newSeo },
      meta:   { source: 'automation', timestamp: new Date().toISOString() },
    })

    return patches
  },
}

/**
 * Missing CTA alert — on publish, add a CTA block if none exists.
 */
const ctaOnPublishRule: AutomationRuleDefinition = {
  id:          'structure/cta-on-publish',
  name:        'Add CTA on publish',
  description: 'When a page is published without a CTA block, automatically adds one.',
  trigger:     { type: 'event:document-published' },
  enabled:     false,  // opt-in — can be enabled by the user
  meta:        { category: 'structure', icon: '→', tags: ['cta', 'conversion'] },

  handler: (_ctx) => {
    const analysis = suggestionEngine.getAnalysis()
    if (analysis.hasCTA || analysis.isEmpty) return []

    return [{
      op:       'add',
      target:   'block',
      data:     {
        type:            'cta',
        parentSectionId: analysis.lastSectionId ?? '',
        content:         {
          headline:    'Ready to get started?',
          primaryText: 'Get Started',
          primaryUrl:  '#',
        },
      },
      position: { placement: 'end' },
      meta:     { source: 'automation', timestamp: new Date().toISOString() },
    }] as Patch[]
  },
}

/**
 * Suggestion sweep — every 30 minutes, apply critical-severity suggestions automatically.
 */
const criticalSuggestionSweep: AutomationRuleDefinition = {
  id:          'quality/critical-sweep',
  name:        'Critical quality sweep',
  description: 'Every 30 minutes, automatically applies critical suggestions such as empty hero titles and missing CTA buttons.',
  trigger:     { type: 'schedule:interval', intervalMs: 30 * 60 * 1000 },
  enabled:     false,  // opt-in
  meta:        { category: 'content', icon: '⚡', tags: ['quality', 'automated'] },

  handler: (_ctx) => {
    const proposals = suggestionEngine.analyze({ minSeverity: 'critical' })
    return proposals.flatMap(p =>
      Array.isArray(p.patch) ? p.patch as Patch[] : [p.patch as Patch]
    )
  },
}

/**
 * Daily SEO report — fires every day at 09:00 UTC, logs a suggestion count.
 * Demonstrates cron-style scheduling. Does not apply patches itself;
 * could be extended to auto-apply SEO suggestions.
 */
const dailySEOReport: AutomationRuleDefinition = {
  id:          'seo/daily-report',
  name:        'Daily SEO check',
  description: 'Every morning at 09:00 UTC, checks for SEO issues and emits a patchEventBus notification. Extend to auto-apply patches.',
  trigger:     { type: 'schedule:cron', time: '09:00' },
  enabled:     false,
  meta:        { category: 'seo', icon: '📊', tags: ['seo', 'report'] },

  handler: (_ctx) => {
    const proposals = suggestionEngine.analyze({ categories: ['seo'] })
    if (proposals.length > 0) {
      console.info(`[AutomationEngine] Daily SEO check: ${proposals.length} issue(s) found.`)
      // Returning [] — report only, no auto-apply. Extend to return proposals[…].patch to auto-fix.
    }
    return []
  },
}

/**
 * New block welcome — when the first block is added to an empty page,
 * automatically add a text block below the hero for body copy.
 */
const newBlockWelcomeRule: AutomationRuleDefinition = {
  id:          'structure/first-hero-companion',
  name:        'Add text block below first hero',
  description: 'When a hero block is added to an empty page, automatically adds a companion text block for body copy.',
  trigger:     { type: 'event:block-added', blockType: 'hero' },
  enabled:     true,
  meta:        { category: 'structure', icon: '✦', tags: ['structure', 'hero'] },

  handler: (_ctx) => {
    const page = engine.getDocument()
    const allBlocks = page.sections.flatMap(s => s.blocks)

    // Only fire when this is the very first hero and there's no existing text block
    const heroBlocks = allBlocks.filter(b => b.type === 'hero')
    const textBlocks = allBlocks.filter(b => b.type === 'text')
    if (heroBlocks.length !== 1 || textBlocks.length > 0) return []

    const heroSection = page.sections.find(s => s.blocks.some(b => b.type === 'hero'))
    if (!heroSection) return []

    return [{
      op:       'add',
      target:   'block',
      data:     {
        type:            'text',
        parentSectionId: heroSection.id,
        content:         { text: 'Start writing your story here.', format: 'plain' },
      },
      position: { placement: 'end' },
      meta:     { source: 'automation', timestamp: new Date().toISOString() },
    }] as Patch[]
  },
}

/**
 * Section order validation — on save, if the hero section is not first,
 * move it to position 0.
 */
const sectionOrderRule: AutomationRuleDefinition = {
  id:          'structure/hero-first-on-save',
  name:        'Keep Hero section first',
  description: 'On save, if a hero section exists but is not the first section, automatically moves it to the top.',
  trigger:     { type: 'event:document-saved' },
  enabled:     false,  // opt-in: moving sections is a structural change the user should confirm
  meta:        { category: 'structure', icon: '⬆', tags: ['structure', 'hero', 'order'] },

  handler: (_ctx) => {
    const page     = engine.getDocument()
    const sections = [...page.sections].sort((a, b) => a.order - b.order)
    if (sections.length < 2) return []

    // Find the first section that contains a hero block
    const heroSectionIdx = sections.findIndex(s => s.blocks.some(b => b.type === 'hero'))
    if (heroSectionIdx <= 0) return []  // already first or no hero

    const heroSection = sections[heroSectionIdx]

    return [{
      op:       'move',
      target:   'section',
      id:       heroSection.id,
      position: { placement: 'start' },
      meta:     { source: 'automation', timestamp: new Date().toISOString() },
    }] as Patch[]
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported rule set
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_RULES: AutomationRuleDefinition[] = [
  seoAutoFillRule,
  ctaOnPublishRule,
  sectionOrderRule,
  criticalSuggestionSweep,
  dailySEOReport,
  newBlockWelcomeRule,
]
