/**
 * ATELIER CMS — Block Type Registry
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * This file is the single source of truth for all block types available in the
 * ATELIER editor. Every block entry describes:
 *
 *   • type          — the identifier used in the Document model
 *   • label         — human-readable display name
 *   • icon          — emoji or symbol for the Block Library UI
 *   • category      — grouping used to organise the palette
 *   • description   — tooltip / helper text shown in the Block Library
 *   • defaultContent — the initial content object applied when a block is added
 *   • keywords      — search terms the library uses to filter blocks
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This file has zero runtime dependencies — it is pure data.
 * • It does NOT import from PatchEngine, DocumentRepository, or React.
 * • BlockLibrary.tsx imports this file to render the library UI.
 * • PalettePanel.tsx may import BLOCK_DEFAULTS to replace its inline object.
 * • The `type` field must match the BlockType union in core/document/types.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Block category type
// ─────────────────────────────────────────────────────────────────────────────

/** Visual grouping for the Block Library UI. */
export type BlockCategory =
  | 'layout'    // Full-width structural blocks: Hero, Banner, Divider
  | 'content'   // Inline text and copy blocks: Text, CTA, FAQ
  | 'media'     // Image and multimedia blocks: Image, Gallery, Video
  | 'data'      // Dynamic data blocks (future): Reviews, Events, Services

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Block type definition interface
// ─────────────────────────────────────────────────────────────────────────────

/** Complete descriptor for a single block type in the library. */
export interface BlockTypeDefinition {
  /** Matches BlockType in core/document/types.ts. */
  type:            string
  /** Displayed in the library, palette, and inspector header. */
  label:           string
  /** Single glyph or emoji shown as the block's visual identity. */
  icon:            string
  /** Groups blocks in the library sidebar. */
  category:        BlockCategory
  /** Short description for tooltips and onboarding. */
  description:     string
  /**
   * The initial `content` object applied when this block is first added.
   * Keys match the corresponding *Content interface in core/document/types.ts.
   */
  defaultContent:  Record<string, unknown>
  /**
   * Additional search terms that surface this block when the user types
   * in the library search box. The `label` is always matched implicitly.
   */
  keywords:        string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Block type definitions
// ─────────────────────────────────────────────────────────────────────────────

/** All block types available in the ATELIER editor. */
export const blockTypes: BlockTypeDefinition[] = [
  // ── Layout ─────────────────────────────────────────────────────────────────

  {
    type:        'hero',
    label:       'Hero',
    icon:        '✦',
    category:    'layout',
    description: 'Full-width headline section with subtitle, CTA button, and optional background image.',
    defaultContent: {
      title:      'Your Headline',
      subtitle:   'Supporting text that explains your value proposition.',
      buttonText: 'Get Started',
      buttonUrl:  '#',
      imageUrl:   '',
    },
    keywords: ['header', 'banner', 'headline', 'top', 'landing', 'above-fold'],
  },

  // ── Content ────────────────────────────────────────────────────────────────

  {
    type:        'text',
    label:       'Text',
    icon:        '✎',
    category:    'content',
    description: 'A block of body copy. Supports plain text, Markdown, and HTML.',
    defaultContent: {
      text:   'Your content here. Click to edit.',
      format: 'plain',
    },
    keywords: ['paragraph', 'copy', 'body', 'prose', 'markdown', 'html', 'write'],
  },

  {
    type:        'cta',
    label:       'CTA',
    icon:        '→',
    category:    'content',
    description: 'Call-to-action block with headline, description, and one or two buttons.',
    defaultContent: {
      headline:       'Ready to get started?',
      description:    '',
      primaryText:    'Start Now',
      primaryUrl:     '#',
      secondaryText:  '',
      secondaryUrl:   '',
    },
    keywords: ['call to action', 'button', 'cta', 'conversion', 'signup', 'action'],
  },

  {
    type:        'faq',
    label:       'FAQ',
    icon:        '?',
    category:    'content',
    description: 'Collapsible question and answer item. Stack multiples for a full FAQ section.',
    defaultContent: {
      question: 'What is your question?',
      answer:   'Your answer goes here.',
      open:     false,
    },
    keywords: ['question', 'answer', 'accordion', 'collapse', 'expand', 'faq', 'help'],
  },

  {
    type:        'feature-list',
    label:       'Feature List',
    icon:        '⊞',
    category:    'content',
    description: 'A grid or list of features, each with an icon, title, and description.',
    defaultContent: {
      features: [
        { icon: '✦', title: 'Feature One',   description: 'Describe this feature.' },
        { icon: '◈', title: 'Feature Two',   description: 'Describe this feature.' },
        { icon: '▣', title: 'Feature Three', description: 'Describe this feature.' },
      ],
      layout: 'grid',
    },
    keywords: ['features', 'benefits', 'grid', 'cards', 'icons', 'list', 'services'],
  },

  // ── Media ──────────────────────────────────────────────────────────────────

  {
    type:        'image',
    label:       'Image',
    icon:        '🖼',
    category:    'media',
    description: 'A single image with alt text and optional caption.',
    defaultContent: {
      url:     '',
      alt:     '',
      caption: '',
    },
    keywords: ['photo', 'picture', 'img', 'illustration', 'figure', 'caption'],
  },

  {
    type:        'gallery',
    label:       'Gallery',
    icon:        '▣',
    category:    'media',
    description: 'A responsive multi-column image grid.',
    defaultContent: {
      images:  [],
      columns: 3,
      gap:     '16px',
    },
    keywords: ['photos', 'images', 'grid', 'mosaic', 'portfolio', 'pictures'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Derived maps and helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All unique categories present in `blockTypes`, in display order.
 * Used by BlockLibrary to render category headings.
 */
export const BLOCK_CATEGORIES: BlockCategory[] = ['layout', 'content', 'media', 'data']

/**
 * Lookup map: block type → full definition.
 * O(1) access for resolvers that only have a type string.
 *
 * @example
 *   const def = BLOCK_TYPE_MAP['hero']
 *   console.log(def.icon)  // '✦'
 */
export const BLOCK_TYPE_MAP: Record<string, BlockTypeDefinition> = Object.fromEntries(
  blockTypes.map(b => [b.type, b]),
)

/**
 * Lookup map: block type → default content.
 * Imported by PalettePanel and any code that needs to construct a new block.
 *
 * @example
 *   const content = BLOCK_DEFAULTS['hero']
 *   engine.enqueuePatch({ op:'add', target:'block', data:{ type:'hero', content, … } … })
 */
export const BLOCK_DEFAULTS: Record<string, Record<string, unknown>> = Object.fromEntries(
  blockTypes.map(b => [b.type, b.defaultContent]),
)

/**
 * Returns all block type definitions belonging to the given category.
 *
 * @example
 *   const contentBlocks = getBlocksByCategory('content')
 */
export function getBlocksByCategory(category: BlockCategory): BlockTypeDefinition[] {
  return blockTypes.filter(b => b.category === category)
}

/**
 * Search block types by label, description, or keywords.
 * Case-insensitive. Returns all blocks if `query` is empty.
 *
 * @example
 *   const results = searchBlockTypes('image')
 *   // → [ ImageBlockDefinition, GalleryBlockDefinition ]
 */
export function searchBlockTypes(query: string): BlockTypeDefinition[] {
  const q = query.trim().toLowerCase()
  if (!q) return blockTypes
  return blockTypes.filter(b =>
    b.label.toLowerCase().includes(q) ||
    b.description.toLowerCase().includes(q) ||
    b.keywords.some(k => k.toLowerCase().includes(q)),
  )
}

/**
 * Returns the definition for the given block type, or `undefined` if unknown.
 */
export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return BLOCK_TYPE_MAP[type]
}
