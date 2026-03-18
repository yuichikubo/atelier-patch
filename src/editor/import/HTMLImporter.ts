/**
 * ATELIER CMS — HTML Importer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Converts raw HTML into a list of Patch operations that build a
 * Page → Section → Block document inside the ATELIER editor.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This module is a PURE FUNCTION — it never calls engine.enqueuePatch()
 *   or modifies any document state.
 * • The returned Patch[] is inert data until the caller passes it to
 *   engine.applyPatchArray(). All mutations still go through PatchEngine.
 * • This module runs only in the browser (uses DOMParser).
 *
 * ELEMENT → BLOCK MAPPING
 * ────────────────────────
 *   h1                       → hero block   (title = text content)
 *   h2, h3, h4, h5, h6       → text block   (text = heading text)
 *   p                        → text block
 *   img                      → image block
 *   button, a[href].btn-like → cta block
 *   ul (with li children)    → feature-list block
 *   section, article, header,
 *   footer, main, div        → section boundary
 *
 * SECTION GROUPING STRATEGY
 * ──────────────────────────
 * • Semantic containers (section, article, header, footer, main) always
 *   start a new section.
 * • A top-level h1 starts a new section (hero anchor).
 * • If no semantic containers exist in the HTML, all blocks are grouped
 *   into a single 'blank' section.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Patch } from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface ImportedBlock {
  type:    string
  content: Record<string, unknown>
}

interface ImportedSection {
  type:   string
  blocks: ImportedBlock[]
}

export interface ImportResult {
  /** Number of sections created. */
  sectionCount: number
  /** Total number of blocks created. */
  blockCount:   number
  /** The patches that build the imported document. */
  patches:      Patch[]
  /** Non-fatal warnings produced during parsing. */
  warnings:     string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Return trimmed text content of an element, collapsing whitespace. */
function text(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** True when an <a> or <button> visually looks like a CTA button. */
function looksLikeButton(el: Element): boolean {
  const cls = (el.getAttribute('class') ?? '').toLowerCase()
  const role = (el.getAttribute('role') ?? '').toLowerCase()
  return (
    cls.includes('btn') || cls.includes('button') || cls.includes('cta') ||
    cls.includes('action') || role === 'button'
  )
}

/** Semantic HTML5 container tags that always start a new section. */
const SECTION_TAGS = new Set(['section', 'article', 'header', 'footer', 'main', 'nav'])

// ─────────────────────────────────────────────────────────────────────────────
// Element → ImportedBlock converters
// ─────────────────────────────────────────────────────────────────────────────

function convertHeading(el: Element): ImportedBlock {
  const tag = el.tagName.toLowerCase()
  if (tag === 'h1') {
    // h1 → hero block (primary message anchor)
    return {
      type:    'hero',
      content: {
        title:      text(el),
        subtitle:   '',
        buttonText: '',
        buttonUrl:  '#',
        imageUrl:   '',
      },
    }
  }
  // h2–h6 → text block (treated as section headings)
  return {
    type:    'text',
    content: { text: text(el), format: 'plain' },
  }
}

function convertParagraph(el: Element): ImportedBlock | null {
  const content = text(el)
  if (!content) return null
  return {
    type:    'text',
    content: { text: content, format: 'plain' },
  }
}

function convertImage(el: Element): ImportedBlock | null {
  const src = el.getAttribute('src') ?? ''
  if (!src) return null
  return {
    type:    'image',
    content: {
      url:     src,
      alt:     el.getAttribute('alt')     ?? '',
      caption: el.getAttribute('title')   ?? '',
    },
  }
}

function convertButton(el: Element): ImportedBlock {
  const label = text(el)
  const href  = el.getAttribute('href') ?? '#'
  return {
    type:    'cta',
    content: {
      headline:    '',
      description: '',
      primaryText: label || 'Get Started',
      primaryUrl:  href,
    },
  }
}

function convertList(el: Element): ImportedBlock | null {
  const items = Array.from(el.querySelectorAll('li'))
  if (!items.length) return null
  const features = items.map(li => ({
    icon:        '•',
    title:       text(li).slice(0, 60),
    description: text(li).length > 60 ? text(li) : '',
  }))
  return {
    type:    'feature-list',
    content: { features, layout: 'grid' },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM walker — converts a container's direct children into ImportedBlocks
// ─────────────────────────────────────────────────────────────────────────────

function walkChildren(
  parent:   Element,
  warnings: string[],
): ImportedBlock[] {
  const blocks: ImportedBlock[] = []

  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase()

    if (tag === 'h1') {
      blocks.push(convertHeading(child))
    } else if (/^h[2-6]$/.test(tag)) {
      blocks.push(convertHeading(child))
    } else if (tag === 'p') {
      const b = convertParagraph(child)
      if (b) blocks.push(b)
    } else if (tag === 'img') {
      const b = convertImage(child)
      if (b) blocks.push(b)
    } else if (tag === 'button') {
      blocks.push(convertButton(child))
    } else if (tag === 'a' && looksLikeButton(child)) {
      blocks.push(convertButton(child))
    } else if (tag === 'ul' || tag === 'ol') {
      const b = convertList(child)
      if (b) blocks.push(b)
    } else if (tag === 'figure') {
      // figure > img
      const img = child.querySelector('img')
      if (img) {
        const b = convertImage(img)
        if (b) {
          const caption = child.querySelector('figcaption')
          if (caption) (b.content as any).caption = text(caption)
          blocks.push(b)
        }
      }
    } else if (tag === 'div' || tag === 'span') {
      // Recurse into generic containers — they may hold real content
      const inner = walkChildren(child, warnings)
      blocks.push(...inner)
    } else if (!SECTION_TAGS.has(tag) && tag !== 'style' && tag !== 'script') {
      warnings.push(`Skipped unrecognised element: <${tag}>`)
    }
  }

  return blocks
}

// ─────────────────────────────────────────────────────────────────────────────
// Section grouping
// ─────────────────────────────────────────────────────────────────────────────

function groupIntoSections(
  root:     Element,
  warnings: string[],
): ImportedSection[] {
  const sections: ImportedSection[] = []

  // Check whether the root contains semantic section containers
  const hasSemanticContainers = Array.from(root.children).some(c =>
    SECTION_TAGS.has(c.tagName.toLowerCase()),
  )

  if (hasSemanticContainers) {
    // Semantic mode: each section/article/header/footer/main → own section
    for (const child of Array.from(root.children)) {
      const tag = child.tagName.toLowerCase()
      if (SECTION_TAGS.has(tag)) {
        const blocks = walkChildren(child, warnings)
        if (blocks.length > 0) {
          const sectionType =
            tag === 'header' ? 'hero' :
            tag === 'footer' ? 'cta'  :
            'blank'
          sections.push({ type: sectionType, blocks })
        }
      } else {
        // Top-level element outside semantic containers → append to last section
        const block = (() => {
          const t = tag
          if (t === 'h1')          return convertHeading(child)
          if (/^h[2-6]$/.test(t)) return convertHeading(child)
          if (t === 'p')           return convertParagraph(child)
          if (t === 'img')         return convertImage(child)
          if (t === 'button')      return convertButton(child)
          if ((t === 'ul' || t === 'ol')) return convertList(child)
          return null
        })()
        if (block) {
          if (!sections.length) sections.push({ type: 'blank', blocks: [] })
          sections[sections.length - 1].blocks.push(block)
        }
      }
    }
  } else {
    // Flat mode: walk all children, split on each h1 encountered
    const allBlocks = walkChildren(root, warnings)

    let current: ImportedSection = { type: 'hero', blocks: [] }
    sections.push(current)

    for (const block of allBlocks) {
      if (block.type === 'hero' && current.blocks.length > 0) {
        // New h1 → start a fresh section
        current = { type: 'blank', blocks: [] }
        sections.push(current)
      }
      current.blocks.push(block)
    }
  }

  // Remove sections that ended up empty
  return sections.filter(s => s.blocks.length > 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Patch builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPatches(sections: ImportedSection[]): Patch[] {
  const patches: Patch[] = []

  // Use placeholder IDs that PatchEngine will replace with uid() values.
  // We need stable references so ADD_BLOCK patches can reference the right
  // parentSectionId.  We generate deterministic temp ids here and the engine
  // resolves them on apply (same pattern used by SuggestionRules).
  sections.forEach((section, si) => {
    const sectionPlaceholder = `__import_section_${si}__`

    patches.push({
      op:       'add',
      target:   'section',
      data:     { type: section.type, id: sectionPlaceholder },
      position: { placement: 'end' },
      meta:     { source: 'editor' },
    } as any)

    section.blocks.forEach(block => {
      patches.push({
        op:       'add',
        target:   'block',
        data:     {
          type:            block.type,
          parentSectionId: sectionPlaceholder,
          content:         block.content,
        },
        position: { placement: 'end' },
        meta:     { source: 'editor' },
      } as any)
    })
  })

  return patches
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse raw HTML and return Patch[] that represent the imported content.
 *
 * The caller is responsible for passing the patches to
 * `engine.applyPatchArray()` — this function never touches the engine.
 *
 * @param html   Raw HTML string (full document or fragment)
 * @returns      ImportResult with patches, counts, and warnings
 */
export function importHTML(html: string): ImportResult {
  const warnings: string[] = []

  if (!html.trim()) {
    return { sectionCount: 0, blockCount: 0, patches: [], warnings: ['Empty input'] }
  }

  // Parse using the browser's own DOMParser for full spec compliance
  const parser = new DOMParser()
  const doc    = parser.parseFromString(html, 'text/html')

  // Use <body> as the root, falling back to <html> if body is absent
  const root = doc.body ?? doc.documentElement

  if (!root) {
    return { sectionCount: 0, blockCount: 0, patches: [], warnings: ['Could not parse HTML'] }
  }

  const sections = groupIntoSections(root, warnings)
  const patches  = buildPatches(sections)

  const blockCount = sections.reduce((n, s) => n + s.blocks.length, 0)

  return {
    sectionCount: sections.length,
    blockCount,
    patches,
    warnings,
  }
}
