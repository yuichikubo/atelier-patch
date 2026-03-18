import Link                                    from 'next/link'
import { documentRepository }                 from '@/core/persistence'
import type { PageMeta }                      from '@/core/persistence'

export const dynamic = 'force-dynamic'

export default async function PagesListPage() {
  const pages = await documentRepository.list('dev-workspace')

  return (
    <div style={{ maxWidth:760, margin:'48px auto', padding:'0 24px', fontFamily:'var(--font-ui)', background:'var(--color-bg)', minHeight:'100vh', color:'var(--color-text-primary)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28, paddingTop:48 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:'#C9A84C', letterSpacing:'0.08em' }}>✦ ATELIER</h1>
        <Link href="/cms/new"
          style={{ padding:'8px 18px', background:'#C9A84C', color:'#0B0B10', borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:12 }}>
          + 新しいページ
        </Link>
      </div>

      {!pages.length && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'var(--color-text-ghost)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✦</div>
          <p style={{ fontSize:13 }}>ページがありません。最初のページを作成しましょう。</p>
        </div>
      )}

      {(pages as PageMeta[]).map(p => (
        <div key={p.id}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, marginBottom:6, background:'var(--color-surface)' }}>
          <div>
            <div style={{ fontWeight:500, fontSize:13 }}>{p.title}</div>
            <div style={{ fontSize:10, color:'var(--color-text-ghost)', marginTop:2 }}>/{p.slug}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:p.status==='published'?'rgba(74,222,128,0.1)':'rgba(255,255,255,0.05)', color:p.status==='published'?'#4ade80':'#7A7870' }}>
              {p.status === 'published' ? '公開済み' : p.status === 'draft' ? '下書き' : p.status}
            </span>
            <Link href={`/cms/${p.id}`} style={{ fontSize:12, color:'#C9A84C', textDecoration:'none' }}>編集</Link>
            {p.status==='published' && (
              <Link href={`/site/${p.slug}`} target="_blank" style={{ fontSize:12, color:'var(--color-text-ghost)', textDecoration:'none' }}>確認 ↗</Link>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
