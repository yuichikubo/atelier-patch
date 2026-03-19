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
    label:       'ヒーロー',
    icon:        '✦',
    category:    'layout',
    description: 'ページ最上部の大見出しエリア。キャッチコピー・サブテキスト・CTAボタン・背景画像を設定できます。',
    defaultContent: {
      title:      'キャッチコピーをここに入力',
      subtitle:   'サービスの価値や特徴を一文で説明するサブテキスト。',
      buttonText: '始める',
      buttonUrl:  '#',
      imageUrl:   '',
    },
    keywords: ['hero', 'header', 'banner', 'headline', 'キャッチ', 'トップ', 'ヒーロー'],
  },

  // ── Content ────────────────────────────────────────────────────────────────

  {
    type:        'text',
    label:       'テキスト',
    icon:        '✎',
    category:    'content',
    description: '本文テキストブロック。プレーンテキスト・Markdown・HTMLに対応しています。',
    defaultContent: {
      text:   'ここにテキストを入力してください。クリックして編集できます。',
      format: 'plain',
    },
    keywords: ['text', 'paragraph', 'body', 'markdown', 'テキスト', '本文', '段落'],
  },

  {
    type:        'cta',
    label:       '行動促進（CTA）',
    icon:        '→',
    category:    'content',
    description: '行動を促すブロック。見出し・説明文・ボタン（最大2つ）を配置できます。',
    defaultContent: {
      headline:       'さっそく始めてみましょう',
      description:    '',
      primaryText:    '今すぐ始める',
      primaryUrl:     '#',
      secondaryText:  '',
      secondaryUrl:   '',
    },
    keywords: ['cta', 'call to action', 'button', 'ボタン', 'CTA', '申し込み', '登録'],
  },

  {
    type:        'faq',
    label:       'よくある質問（FAQ）',
    icon:        '?',
    category:    'content',
    description: '開閉できる質問と回答のブロック。複数並べてFAQセクションが作れます。',
    defaultContent: {
      question: 'よくある質問をここに入力してください',
      answer:   '回答をここに入力してください。',
      open:     false,
    },
    keywords: ['faq', 'question', 'answer', 'よくある質問', '質問', '回答', 'アコーディオン'],
  },

  {
    type:        'feature-list',
    label:       '特徴・サービス一覧',
    icon:        '⊞',
    category:    'content',
    description: 'アイコン・タイトル・説明文付きの特徴カード。グリッド表示でサービス紹介に最適です。',
    defaultContent: {
      features: [
        { icon: '✦', title: '特徴 1', description: 'この特徴の説明文を入力してください。' },
        { icon: '◈', title: '特徴 2', description: 'この特徴の説明文を入力してください。' },
        { icon: '▣', title: '特徴 3', description: 'この特徴の説明文を入力してください。' },
      ],
      layout: 'grid',
    },
    keywords: ['feature', 'features', 'benefits', 'grid', '特徴', 'サービス', '強み', 'カード'],
  },

  // ── Media ──────────────────────────────────────────────────────────────────

  {
    type:        'image',
    label:       '画像',
    icon:        '🖼',
    category:    'media',
    description: '1枚の画像ブロック。altテキストとキャプションを設定できます。',
    defaultContent: {
      url:     '',
      alt:     '',
      caption: '',
    },
    keywords: ['image', 'photo', 'picture', '画像', '写真', 'イメージ'],
  },

  {
    type:        'gallery',
    label:       'ギャラリー',
    icon:        '▣',
    category:    'media',
    description: '複数枚の画像をグリッド表示するギャラリーブロック。列数を調整できます。',
    defaultContent: {
      images:  [],
      columns: 3,
      gap:     '16px',
    },
    keywords: ['gallery', 'photos', 'images', 'ギャラリー', '写真一覧', 'ポートフォリオ'],
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
