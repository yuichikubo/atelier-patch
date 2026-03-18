import type { Metadata }              from 'next'
import './globals.css'
import { registerBuiltInThemes }     from '@/design-system/themes'
import { registerBuiltInComponents } from '@/design-system/registry/registerBuiltInComponents'

registerBuiltInThemes()
registerBuiltInComponents()

export const metadata: Metadata = {
  title:       'ATELIER CMS',
  description: 'Patch-driven website builder',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* meta charset for Japanese content */}
        <meta charSet="utf-8" />
      </head>
      <body>{children}</body>
    </html>
  )
}
