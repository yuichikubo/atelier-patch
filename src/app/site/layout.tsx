/**
 * /site/* layout
 * Public-facing pages — NO editor CSS, NO preview-skin.
 * Theme tokens are applied inline via PageRenderer / SitePage.
 */
import type { Metadata } from 'next'
import { registerBuiltInThemes }     from '@/design-system/themes'
import { registerBuiltInComponents } from '@/design-system/registry/registerBuiltInComponents'

registerBuiltInThemes()
registerBuiltInComponents()

export const metadata: Metadata = {
  title:       'ATELIER',
  description: '',
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return children
}
