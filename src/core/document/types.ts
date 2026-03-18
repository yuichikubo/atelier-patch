export type PageId    = string
export type SectionId = string
export type BlockId   = string
export type PageStatus = 'draft' | 'published' | 'archived'

export interface SEOMeta {
  title?: string; description?: string; ogImage?: string; noIndex?: boolean
  [key: string]: unknown
}
export interface SectionSettings {
  fullWidth?: boolean; paddingTop?: string; paddingBottom?: string
  background?: string; className?: string; style?: Record<string,string>
  [key: string]: unknown
}
export interface BlockSettings {
  align?: 'left'|'center'|'right'; className?: string; style?: Record<string,string>
  [key: string]: unknown
}
export interface HeroContent {
  title: string; subtitle?: string; buttonText?: string; buttonUrl?: string; imageUrl?: string
}
export interface TextContent { text: string; format?: 'plain'|'markdown'|'html' }
export interface ImageContent { url: string; alt: string; caption?: string; width?: number; height?: number }
export interface GalleryContent { images: Array<{url:string;alt:string;caption?:string}>; columns?: 2|3|4; gap?: string }
export interface CTAContent {
  headline: string; description?: string; primaryText: string; primaryUrl: string
  secondaryText?: string; secondaryUrl?: string
}
export interface FAQContent { question: string; answer: string; open?: boolean }
export interface FeatureListContent {
  features: Array<{icon?:string;title:string;description:string}>; layout?: 'grid'|'list'
}
export type BlockContent =
  | HeroContent | TextContent | ImageContent | GalleryContent
  | CTAContent  | FAQContent  | FeatureListContent | Record<string,unknown>

export type BlockType   = 'hero'|'text'|'image'|'gallery'|'cta'|'faq'|'feature-list'|(string&{})
export type SectionType = 'hero'|'content'|'features'|'gallery'|'faq'|'cta'|'blank'|(string&{})

export interface Block {
  id: BlockId; type: BlockType; content: BlockContent; settings: BlockSettings; order: number; source?: string
}
export interface Section {
  id: SectionId; type: SectionType; blocks: Block[]; settings: SectionSettings; order: number; label?: string
}
export interface Page {
  id: PageId; title: string; slug: string; status: PageStatus; seo: SEOMeta
  sections: Section[]; workspaceId: string; themeId?: string; version: number
  createdAt: string; updatedAt: string; publishedAt?: string
}
export type CorePage = Page & { seoTitle?: string; seoDesc?: string; noIndex?: boolean }
