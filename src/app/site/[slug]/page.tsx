import { notFound }      from 'next/navigation'
import type { Metadata } from 'next'
import { documentRepository } from '@/core/persistence'
import { themeRegistry }      from '@/design-system/themes'
import { PageRenderer }       from '@/core/renderer/components/PageRenderer'

export const revalidate = 60

export async function generateStaticParams(): Promise<{ slug:string }[]> {
  const pages = await documentRepository.list('dev-workspace')
  return (pages as Array<{status:string;slug:string}>).filter(p=>p.status==='published').map(p=>({ slug:p.slug }))
}

export async function generateMetadata({ params }:{ params:{ slug:string } }): Promise<Metadata> {
  const page = await documentRepository.loadBySlug(params.slug)
  if (!page||page.status!=='published') return { title:'Not found' }
  return { title:(page.seo as any)?.title??page.title, description:(page.seo as any)?.description }
}

export default async function SitePage({ params }:{ params:{ slug:string } }) {
  const page = await documentRepository.loadBySlug(params.slug)
  if (!page||page.status!=='published') notFound()

  const theme   = themeRegistry.resolve(page.themeId??'luxury')
  const cssVars = themeRegistry.toCSSVars(theme)

  return (
    <div
      data-theme={page.themeId??'luxury'}
      style={{
        ...(cssVars as React.CSSProperties),
        background: theme.colors.background,
        minHeight:  '100vh',
      }}
    >
      <PageRenderer page={page} context={{ isEditing:false, themeId:page.themeId??'luxury' }} />
    </div>
  )
}
