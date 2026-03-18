/**
 * ATELIER CMS — Suggestion Rules
 *
 * Each rule is a pure function:
 *   (analysis: DocumentAnalysis, page: Page) => PatchProposal[]
 *
 * Rules NEVER mutate the document.
 * The patches inside proposals are inert until applied via engine.enqueuePatch().
 */

import type { Page }               from '@/core/document/types'
import type { DocumentAnalysis, PatchProposal } from './SuggestionTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Rule type
// ─────────────────────────────────────────────────────────────────────────────

export type SuggestionRule = (
  analysis: DocumentAnalysis,
  page:     Page,
) => PatchProposal[]

// ─────────────────────────────────────────────────────────────────────────────
// Structure rules
// ─────────────────────────────────────────────────────────────────────────────

/** Empty page — suggest adding a hero section. */
const emptyPageRule: SuggestionRule = (a) => {
  if (!a.isEmpty) return []
  return [{
    id:          'structure/empty-page',
    description: 'Add a Hero section to get started',
    rationale:   'The page has no sections. A hero section establishes the primary message and visual anchor.',
    severity:    'critical',
    category:    'structure',
    blockType:   'hero',
    patch:       [
      {
        op:       'add',
        target:   'section',
        data:     { type: 'hero' },
        position: { placement: 'end' },
        meta:     { source: 'ai' },
      },
      {
        op:       'add',
        target:   'block',
        data:     {
          type:            'hero',
          parentSectionId: '__new_section__',  // resolved by SuggestionEngine at apply time
          content:         { title: 'Your Headline', subtitle: 'Supporting text', buttonText: 'Get Started', buttonUrl: '#' },
        },
        position: { placement: 'end' },
        meta:     { source: 'ai' },
      },
    ] as any,
  }]
}

/** Hero exists but no CTA anywhere on the page. */
const missingCTARule: SuggestionRule = (a) => {
  if (!a.hasHero || a.hasCTA || a.isEmpty) return []
  return [{
    id:          'structure/missing-cta',
    description: 'Add a Call-to-Action section',
    rationale:   'The page has a hero section but no CTA. Adding one increases conversion potential.',
    severity:    'warning',
    category:    'conversion',
    blockType:   'cta',
    patch: {
      op:       'add',
      target:   'block',
      data:     {
        type:            'cta',
        parentSectionId: a.lastSectionId ?? '',
        content:         {
          headline:    'Ready to get started?',
          primaryText: 'Get Started',
          primaryUrl:  '#',
        },
      },
      position: { placement: 'end' },
      meta:     { source: 'ai' },
    },
  }]
}

/** Hero exists but no feature list to support it. */
const missingFeaturesRule: SuggestionRule = (a) => {
  if (!a.hasHero || a.hasFeatureList || a.blockCount < 2) return []
  return [{
    id:          'structure/missing-features',
    description: 'Add a Feature List section',
    rationale:   'Pages with a hero benefit from a features section that explains key value propositions.',
    severity:    'info',
    category:    'structure',
    blockType:   'feature-list',
    patch: {
      op:       'add',
      target:   'block',
      data:     {
        type:            'feature-list',
        parentSectionId: a.lastSectionId ?? '',
        content:         {
          features: [
            { icon: '✦', title: 'Feature One',   description: 'Describe this feature.' },
            { icon: '◈', title: 'Feature Two',   description: 'Describe this feature.' },
            { icon: '▣', title: 'Feature Three', description: 'Describe this feature.' },
          ],
          layout: 'grid',
        },
      },
      position: { placement: 'end' },
      meta:     { source: 'ai' },
    },
  }]
}

/** Page has gallery blocks but no hero — structure feels unanchored. */
const galleryWithoutHeroRule: SuggestionRule = (a) => {
  if (a.hasHero || !a.hasGallery) return []
  return [{
    id:          'structure/gallery-needs-hero',
    description: 'Add a Hero section above your gallery',
    rationale:   'Gallery pages benefit from a hero that sets context before showing images.',
    severity:    'info',
    category:    'structure',
    blockType:   'hero',
    patch: {
      op:       'add',
      target:   'block',
      data:     {
        type:            'hero',
        parentSectionId: a.lastSectionId ?? '',
        content:         { title: 'Gallery', subtitle: 'Explore our work.' },
      },
      position: { placement: 'start' },
      meta:     { source: 'ai' },
    },
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// Content rules
// ─────────────────────────────────────────────────────────────────────────────

/** Hero block with empty title. */
const emptyHeroTitleRule: SuggestionRule = (a) => {
  return a.emptyHeroTitles.map(blockId => ({
    id:          `content/empty-hero-title/${blockId}`,
    description: 'Add a headline to your Hero block',
    rationale:   'The hero title is the primary message visitors see. An empty title hurts first impressions.',
    severity:    'critical',
    category:    'content',
    targetId:    blockId,
    blockType:   'hero',
    patch: {
      op:     'update',
      target: 'block',
      id:     blockId,
      data:   { content: { title: 'Your Headline Here' } },
      meta:   { source: 'ai' },
    },
  }))
}

/** Text block with empty content. */
const emptyTextRule: SuggestionRule = (a) => {
  return a.emptyTextBlocks.map(blockId => ({
    id:          `content/empty-text/${blockId}`,
    description: 'Add content to empty Text block',
    rationale:   'This text block has no content. Add copy or remove the block.',
    severity:    'warning',
    category:    'content',
    targetId:    blockId,
    blockType:   'text',
    patch: {
      op:     'update',
      target: 'block',
      id:     blockId,
      data:   { content: { text: 'Enter your content here.', format: 'plain' } },
      meta:   { source: 'ai' },
    },
  }))
}

/** Image block missing alt text. */
const missingAltTextRule: SuggestionRule = (a, page) => {
  return a.emptyImageAlts.map(blockId => {
    const block = (page.sections as any[])
      .flatMap((s: any) => s.blocks)
      .find((b: any) => b.id === blockId)
    const filename = (block?.content as any)?.url?.split('/').pop() ?? 'image'
    return {
      id:          `content/missing-alt/${blockId}`,
      description: 'Add alt text to image',
      rationale:   'Images without alt text are inaccessible to screen readers and hurt SEO.',
      severity:    'warning',
      category:    'content',
      targetId:    blockId,
      blockType:   'image',
      patch: {
        op:     'update',
        target: 'block',
        id:     blockId,
        data:   { content: { alt: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ') } },
        meta:   { source: 'ai' },
      },
    }
  })
}

/** Gallery block with no images. */
const emptyGalleryRule: SuggestionRule = (a) => {
  return a.emptyGalleries.map(blockId => ({
    id:          `content/empty-gallery/${blockId}`,
    description: 'Add images to your Gallery',
    rationale:   'This gallery has no images. Add image URLs via the Inspector panel.',
    severity:    'warning',
    category:    'media',
    targetId:    blockId,
    blockType:   'gallery',
    patch: {
      op:     'update',
      target: 'block',
      id:     blockId,
      data:   {
        content: {
          images: [
            { url: 'https://picsum.photos/800/600?random=1', alt: 'Gallery image 1' },
            { url: 'https://picsum.photos/800/600?random=2', alt: 'Gallery image 2' },
            { url: 'https://picsum.photos/800/600?random=3', alt: 'Gallery image 3' },
          ],
        },
      },
      meta: { source: 'ai' },
    },
  }))
}

/** CTA block with empty button label. */
const emptyCTAButtonRule: SuggestionRule = (a) => {
  return a.emptyCTAButtons.map(blockId => ({
    id:          `content/empty-cta-button/${blockId}`,
    description: 'Add a label to your CTA button',
    rationale:   'A CTA without a button label cannot drive conversions.',
    severity:    'critical',
    category:    'conversion',
    targetId:    blockId,
    blockType:   'cta',
    patch: {
      op:     'update',
      target: 'block',
      id:     blockId,
      data:   { content: { primaryText: 'Get Started', primaryUrl: '#' } },
      meta:   { source: 'ai' },
    },
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO rules
// ─────────────────────────────────────────────────────────────────────────────

/** Page has no SEO title. */
const missingSeoTitleRule: SuggestionRule = (a, page) => {
  if (a.hasSeoTitle) return []
  return [{
    id:          'seo/missing-title',
    description: 'Add a meta title for SEO',
    rationale:   'Pages without a meta title appear as "Untitled" in search results.',
    severity:    'warning',
    category:    'seo',
    patch: {
      op:     'update',
      target: 'page',
      id:     page.id,
      data:   { seo: { ...page.seo, title: page.title || 'Page Title' } },
      meta:   { source: 'ai' },
    },
  }]
}

/** Page has no SEO description. */
const missingSeoDescriptionRule: SuggestionRule = (a, page) => {
  if (a.hasSeoDescription) return []
  return [{
    id:          'seo/missing-description',
    description: 'Add a meta description for SEO',
    rationale:   'A meta description improves click-through rates from search results.',
    severity:    'info',
    category:    'seo',
    patch: {
      op:     'update',
      target: 'page',
      id:     page.id,
      data:   { seo: { ...page.seo, description: 'Add a description for this page.' } },
      meta:   { source: 'ai' },
    },
  }]
}

/** Page title is missing or untitled. */
const missingPageTitleRule: SuggestionRule = (a, page) => {
  if (a.hasTitle) return []
  return [{
    id:          'seo/missing-page-title',
    description: 'Give your page a title',
    rationale:   'Pages without a title are hard to manage and invisible to search engines.',
    severity:    'critical',
    category:    'seo',
    patch: {
      op:     'update',
      target: 'page',
      id:     page.id,
      data:   { title: 'My Page' },
      meta:   { source: 'ai' },
    },
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules required by spec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Missing Hero in first section.
 * Page has sections but no hero block in the first one.
 */
const missingHeroFirstRule: SuggestionRule = (a, page) => {
  if (a.isEmpty || a.heroIsFirst) return []
  const sections = [...page.sections].sort((s1, s2) => s1.order - s2.order)
  const firstId  = sections[0]?.id
  if (!firstId) return []
  return [{
    id:          'structure/missing-hero-first',
    description: 'Add a Hero block at the top of the page',
    rationale:   'The first section should anchor the page with a clear headline and call-to-action.',
    severity:    'warning',
    category:    'structure',
    blockType:   'hero',
    patch: {
      op:       'add',
      target:   'block',
      data:     {
        type:            'hero',
        parentSectionId: firstId,
        content:         { title: 'Your Headline', subtitle: 'Supporting text', buttonText: 'Get Started', buttonUrl: '#' },
      },
      position: { placement: 'start' },
      meta:     { source: 'ai' },
    },
  }]
}

/**
 * 2. Missing CTA — already exists as missingCTARule.
 * This version fires even without a hero (spec condition: no CTA block anywhere).
 */
const missingCTAAnywhere: SuggestionRule = (a) => {
  if (a.isEmpty || a.hasCTA) return []
  if (a.hasHero) return []  // missingCTARule already handles this case
  return [{
    id:          'conversion/no-cta',
    description: 'Add a Call-to-Action block',
    rationale:   'Pages without a CTA miss the opportunity to guide visitors toward an action.',
    severity:    'warning',
    category:    'conversion',
    blockType:   'cta',
    patch: {
      op:       'add',
      target:   'block',
      data:     {
        type:            'cta',
        parentSectionId: a.lastSectionId ?? '',
        content:         { headline: 'Ready to get started?', primaryText: 'Get Started', primaryUrl: '#' },
      },
      position: { placement: 'end' },
      meta:     { source: 'ai' },
    },
  }]
}

/**
 * 3. Missing FAQ section.
 * Page has no FAQ block anywhere.
 */
const missingFAQRule: SuggestionRule = (a) => {
  if (a.isEmpty || a.hasFAQ) return []
  return [{
    id:          'structure/missing-faq',
    description: 'Add a FAQ section',
    rationale:   'FAQ sections address common visitor questions and improve SEO through long-tail keyword coverage.',
    severity:    'info',
    category:    'structure',
    blockType:   'faq',
    patch: [
      {
        op:       'add',
        target:   'section',
        data:     { type: 'faq', id: '__faq_section__' },
        position: { placement: 'end' },
        meta:     { source: 'ai' },
      },
      {
        op:       'add',
        target:   'block',
        data:     {
          type:            'faq',
          parentSectionId: '__faq_section__',
          content:         {
            question: 'What is your main offering?',
            answer:   'Describe your product or service here.',
          },
        },
        position: { placement: 'end' },
        meta:     { source: 'ai' },
      },
    ] as any,
  }]
}

/**
 * 4. Page title too short (< 20 characters).
 */
const titleTooShortRule: SuggestionRule = (a, page) => {
  if (!a.titleTooShort) return []
  return [{
    id:          'seo/title-too-short',
    description: 'Improve your page title length',
    rationale:   `Page titles under 20 characters (current: ${page.title.trim().length}) are too brief for SEO and navigation clarity.`,
    severity:    'warning',
    category:    'seo',
    patch: {
      op:     'update',
      target: 'page',
      id:     page.id,
      data:   { title: `${page.title.trim()} — Your Brand` },
      meta:   { source: 'ai' },
    },
  }]
}

/**
 * 5. Missing internal link.
 * No block contains a URL beginning with '/'.
 */
const missingInternalLinkRule: SuggestionRule = (a) => {
  if (a.isEmpty || a.hasInternalLinks) return []
  if (!a.hasCTA && !a.hasHero) return []  // nowhere sensible to point
  return [{
    id:          'structure/no-internal-links',
    description: 'Add an internal navigation link',
    rationale:   'Internal links improve site navigation and help search engines understand your content structure.',
    severity:    'info',
    category:    'structure',
    blockType:   'cta',
    patch: {
      op:       'add',
      target:   'block',
      data:     {
        type:            'cta',
        parentSectionId: a.lastSectionId ?? '',
        content:         {
          headline:    'Explore more',
          primaryText: 'See all pages',
          primaryUrl:  '/pages',
        },
      },
      position: { placement: 'end' },
      meta:     { source: 'ai' },
    },
  }]
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported rule set
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_RULES: SuggestionRule[] = [
  // Critical structure
  emptyPageRule,
  emptyHeroTitleRule,
  emptyCTAButtonRule,
  missingPageTitleRule,

  // Content quality
  emptyTextRule,
  missingAltTextRule,
  emptyGalleryRule,

  // Structure suggestions
  missingHeroFirstRule,
  missingCTARule,
  missingCTAAnywhere,
  missingFAQRule,
  missingFeaturesRule,
  galleryWithoutHeroRule,
  missingInternalLinkRule,

  // Title quality
  titleTooShortRule,

  // SEO
  missingSeoTitleRule,
  missingSeoDescriptionRule,
]
