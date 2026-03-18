import { notFound }            from 'next/navigation'
import { documentRepository }  from '@/core/persistence'
import { themeRegistry }       from '@/design-system/themes'
import { PageRenderer }        from '@/core/renderer/components/PageRenderer'

export const dynamic    = 'force-dynamic'
export const revalidate = 0

export default async function PreviewPage({ params }:{ params:{ pageId:string } }) {
  const page = await documentRepository.loadById(params.pageId)
  if (!page) notFound()

  const theme   = themeRegistry.resolve(page.themeId??'luxury')
  const cssVars = themeRegistry.toCSSVars(theme)

  return (
    <>
      <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:9999, background:'#C9A84C', color:'#0B0B10', textAlign:'center', padding:'5px 16px', fontSize:11, fontFamily:'monospace', fontWeight:700 }}>
        PREVIEW — {page.title} ({page.status})
      </div>
      <div data-theme={page.themeId??'luxury'} style={{ paddingTop:30, ...(cssVars as React.CSSProperties) }}>
        <PageRenderer page={page} context={{ isEditing:false, themeId:page.themeId??'luxury' }} />
      </div>
    </>
  )
}
