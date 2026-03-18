/**
 * ATELIER CMS — Document Analyzer
 *
 * Reads a Page document and produces a DocumentAnalysis.
 * Pure function — no side effects, no document mutation.
 */

import type { Page, HeroContent, TextContent, ImageContent, GalleryContent, CTAContent } from '@/core/document/types'
import type { DocumentAnalysis } from './SuggestionTypes'

/** Analyze a document snapshot and return a structured description of its state. */
export function analyzeDocument(page: Page): DocumentAnalysis {
  const sections = [...(page.sections ?? [])].sort((a, b) => a.order - b.order)
  const allBlocks = sections.flatMap(s => s.blocks)

  // ── Block type presence ──────────────────────────────────────────────────
  const blocksByType = (type: string) => allBlocks.filter(b => b.type === type)

  const heroBlocks    = blocksByType('hero')
  const ctaBlocks     = blocksByType('cta')
  const textBlocks    = blocksByType('text')
  const imageBlocks   = blocksByType('image')
  const galleryBlocks = blocksByType('gallery')
  const faqBlocks     = blocksByType('faq')
  const featureBlocks = blocksByType('feature-list')

  // ── Content quality checks ───────────────────────────────────────────────
  const emptyTextBlocks = textBlocks
    .filter(b => !((b.content as TextContent).text?.trim()))
    .map(b => b.id)

  const emptyHeroTitles = heroBlocks
    .filter(b => !((b.content as HeroContent).title?.trim()))
    .map(b => b.id)

  const emptyImageAlts = imageBlocks
    .filter(b => {
      const c = b.content as ImageContent
      return c.url && !c.alt?.trim()
    })
    .map(b => b.id)

  const emptyGalleries = galleryBlocks
    .filter(b => !((b.content as GalleryContent).images?.length))
    .map(b => b.id)

  const emptyCTAButtons = ctaBlocks
    .filter(b => !((b.content as CTAContent).primaryText?.trim()))
    .map(b => b.id)

  // ── SEO ──────────────────────────────────────────────────────────────────
  const seo = page.seo ?? {}

  // ── Extra quality checks ─────────────────────────────────────────────────
  const titleTooShort = !!page.title?.trim() && page.title.trim().length < 20

  // Internal links: any block whose content contains a buttonUrl or url starting with '/'
  const hasInternalLinks = allBlocks.some(b => {
    const c = b.content as Record<string, unknown>
    return (typeof c.buttonUrl === 'string'    && c.buttonUrl.startsWith('/'))
        || (typeof c.primaryUrl === 'string'   && c.primaryUrl.startsWith('/'))
        || (typeof c.url === 'string'          && c.url.startsWith('/'))
        || (typeof c.href === 'string'         && c.href.startsWith('/'))
  })

  // Hero in first section check
  const firstSection = sections[0]
  const heroIsFirst  = !!firstSection?.blocks.some(b => b.type === 'hero')

  return {
    hasTitle:           !!page.title?.trim(),
    hasSlug:            !!page.slug?.trim(),
    hasSeoTitle:        !!(seo as any).title?.trim(),
    hasSeoDescription:  !!(seo as any).description?.trim(),
    pageStatus:         page.status,

    sectionCount: sections.length,
    blockCount:   allBlocks.length,
    isEmpty:      sections.length === 0,

    hasHero:        heroBlocks.length > 0,
    hasCTA:         ctaBlocks.length > 0,
    hasText:        textBlocks.length > 0,
    hasImage:       imageBlocks.length > 0,
    hasGallery:     galleryBlocks.length > 0,
    hasFAQ:         faqBlocks.length > 0,
    hasFeatureList: featureBlocks.length > 0,

    emptyTextBlocks,
    emptyHeroTitles,
    emptyImageAlts,
    emptyGalleries,
    emptyCTAButtons,
    lastSectionId: sections.at(-1)?.id ?? null,

    titleTooShort,
    hasInternalLinks,
    heroIsFirst,
  }
}
