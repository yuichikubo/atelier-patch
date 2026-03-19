import Link                                    from 'next/link'
import { documentRepository }                 from '@/core/persistence'
import type { PageMeta }                      from '@/core/persistence'

export const dynamic = 'force-dynamic'

export default async function PagesListPage() {
  const pages = await documentRepository.list('dev-workspace')

  return (
    <div style={{ maxWidth:760, margin:'0 auto', padding:'0 24px', fontFamily:'var(--font-ui)', background:'#F8F5F0', minHeight:'100vh', color:'#2C2A28' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28, paddingTop:48 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:'#B8903C', letterSpacing:'0.06em' }}>✦ ATELIER</h1>
          <p style={{ fontSize:11, color:'#9A9490', marginTop:2 }}>AIで作るウェブサイトビルダー</p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <Link href="/cms/help"
            style={{ padding:'7px 14px', background:'transparent', color:'#9A9490', borderRadius:8, textDecoration:'none', fontSize:11, border:'1px solid rgba(0,0,0,0.10)' }}>
            使い方
          </Link>
          <Link href="/cms/new"
            style={{ padding:'8px 18px', background:'#C9A84C', color:'#FEFCF8', borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:12 }}>
            ＋ 新しいページ
          </Link>
        </div>
      </div>

      {!pages.length && (
        <div style={{ textAlign:'center', padding:'80px 0', color:'#B0A898' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>✦</div>
          <p style={{ fontSize:14, fontWeight:500, color:'#6A6560', marginBottom:8 }}>最初のページを作成しましょう</p>
          <p style={{ fontSize:12, color:'#B0A898', marginBottom:24 }}>テンプレートを選ぶか、白紙から始めてAIで生成できます</p>
          <Link href="/cms/new"
            style={{ padding:'10px 24px', background:'#C9A84C', color:'#FEFCF8', borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:13 }}>
            ページを作成する →
          </Link>
        </div>
      )}

      {(pages as PageMeta[]).map(p => (
        <div key={p.id}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', border:'1px solid rgba(0,0,0,0.08)', borderRadius:10, marginBottom:6, background:'#FFFFFF' }}>
          <div>
            <div style={{ fontWeight:500, fontSize:13, color:'#2C2A28' }}>{p.title}</div>
            <div style={{ fontSize:10, color:'#B0A898', marginTop:2 }}>/{p.slug}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:p.status==='published'?'rgba(34,197,94,0.1)':'rgba(0,0,0,0.05)', color:p.status==='published'?'#16a34a':'#8A8480', border:p.status==='published'?'1px solid rgba(34,197,94,0.25)':'1px solid rgba(0,0,0,0.08)' }}>
              {p.status === 'published' ? '公開済み' : p.status === 'draft' ? '下書き' : p.status}
            </span>
            <Link href={`/cms/${p.id}`} style={{ fontSize:12, color:'#B8903C', textDecoration:'none', padding:'4px 10px', border:'1px solid rgba(201,168,76,0.3)', borderRadius:6 }}>編集</Link>
            {p.status==='published' && (
              <Link href={`/site/${p.slug}`} target="_blank" style={{ fontSize:12, color:'#9A9490', textDecoration:'none' }}>確認 ↗</Link>
            )}
          </div>
        </div>
      ))}

      {pages.length > 0 && (
        <div style={{ textAlign:'center', padding:'32px 0', color:'#B0A898', fontSize:11 }}>
          {pages.length}件のページ
        </div>
      )}
    </div>
  )
}
