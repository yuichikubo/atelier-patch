'use client'
import { useState }  from 'react'
import { useRouter } from 'next/navigation'

const toSlug = (t:string) => t.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')

const TEMPLATES = [
  {
    id: 'lp',
    icon: '🎯',
    name: 'ランディングページ',
    desc: '商品・サービスのLP。ヒーロー、特徴紹介、よくある質問、CTAで構成。',
    title: 'ランディングページ',
    slug: 'landing-page',
  },
  {
    id: 'corporate',
    icon: '🏢',
    name: 'コーポレートサイト',
    desc: '企業・ブランド向け。会社概要、サービス紹介、お問い合わせ先付き。',
    title: 'コーポレートサイト',
    slug: 'corporate',
  },
  {
    id: 'event',
    icon: '📅',
    name: 'イベント告知',
    desc: 'セミナー・イベント用。開催概要、タイムライン、参加申込み案内。',
    title: 'イベント',
    slug: 'event',
  },
  {
    id: 'profile',
    icon: '👤',
    name: 'プロフィール・ポートフォリオ',
    desc: '個人・クリエイター向け。自己紹介、実績・作品紹介、連絡先。',
    title: 'プロフィール',
    slug: 'profile',
  },
  {
    id: 'blank',
    icon: '✦',
    name: '白紙から始める',
    desc: 'テンプレートなしで、AIまたは手動でゼロから構築します。',
    title: '',
    slug: '',
  },
]

export default function NewPagePage() {
  const router = useRouter()
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [slug,  setSlug]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')
  const [slugHint, setSlugHint] = useState('')

  const selectTemplate = (tpl: typeof TEMPLATES[0]) => {
    setSelectedTemplate(tpl.id)
    if (tpl.title) setTitle(tpl.title)
    if (tpl.slug)  setSlug(tpl.slug)
    setErr('')
  }

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const converted = toSlug(raw)
    setSlug(converted)
    if (raw.length > 0 && converted.length === 0) {
      setSlugHint('英数字・ハイフンで入力してください（例: my-page）')
    } else if (raw !== converted && converted.length > 0) {
      setSlugHint('英数字・ハイフン以外の文字は除外されます')
    } else {
      setSlugHint('')
    }
  }

  const submit = async (e:React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()||!slug.trim()) { setErr('タイトルとスラッグは必須です'); return }
    setBusy(true)
    const res = await fetch('/api/pages',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ title:title.trim(), slug:slug.trim() }) })
    if (!res.ok) { const b=await res.json().catch(()=>({})); setErr((b as any).error??'Error'); setBusy(false); return }
    const page = await res.json(); router.push(`/cms/${page.id}`)
  }

  const inp:React.CSSProperties = { width:'100%', background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.12)', borderRadius:8, padding:'9px 12px', color:'#2C2A28', fontFamily:'var(--font-ui)', fontSize:13, outline:'none', boxSizing:'border-box' }
  const lbl:React.CSSProperties = { display:'block', fontSize:10, color:'#9A9490', marginBottom:5, letterSpacing:'0.1em', textTransform:'uppercase' }

  return (
    <div style={{ maxWidth:560, margin:'60px auto', padding:'0 24px', fontFamily:'var(--font-ui)', color:'#2C2A28', background:'var(--color-bg)', minHeight:'100vh' }}>
      <a href="/cms/pages" style={{ fontSize:11, color:'#B8903C', textDecoration:'none', display:'block', marginBottom:20 }}>← ページ一覧へ</a>
      <h1 style={{ fontSize:20, fontWeight:700, marginBottom:6, color:'#2C2A28' }}>新しいページを作成</h1>
      <p style={{ fontSize:12, color:'#9A9490', marginBottom:28 }}>テンプレートを選ぶか、白紙から始めてください</p>

      {/* Template selector */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:28 }}>
        {TEMPLATES.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => selectTemplate(tpl)}
            style={{
              padding:'14px 14px',
              background: selectedTemplate === tpl.id ? 'rgba(201,168,76,0.08)' : '#FFFFFF',
              border: selectedTemplate === tpl.id ? '1.5px solid #C9A84C' : '1px solid rgba(0,0,0,0.10)',
              borderRadius:10,
              cursor:'pointer',
              textAlign:'left',
              fontFamily:'var(--font-ui)',
              transition:'all 0.12s',
              ...(tpl.id === 'blank' ? { gridColumn: '1 / -1' } : {}),
            }}
          >
            <div style={{ fontSize:20, marginBottom:6 }}>{tpl.icon}</div>
            <div style={{ fontSize:12, fontWeight:600, color: selectedTemplate === tpl.id ? '#B8903C' : '#2C2A28', marginBottom:4 }}>{tpl.name}</div>
            <div style={{ fontSize:10, color:'#9A9490', lineHeight:1.5 }}>{tpl.desc}</div>
          </button>
        ))}
      </div>

      {/* Form */}
      {selectedTemplate && (
        <form onSubmit={submit}>
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>タイトル</label>
            <input value={title} onChange={e=>{ setTitle(e.target.value); if(!slug) setSlug(toSlug(e.target.value)) }} placeholder="例：LP・ランディングページ" style={inp} />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={lbl}>スラッグ</label>
            <input value={slug} onChange={handleSlugChange} placeholder="my-landing-page" style={inp} />
            {slugHint ? (
              <div style={{ fontSize:10, color: slug.length === 0 && slugHint ? '#f87171' : '#9A9490', marginTop:5, letterSpacing:'0.04em' }}>
                {slugHint}
              </div>
            ) : (
              <div style={{ fontSize:10, color:'#9A9490', marginTop:5, letterSpacing:'0.04em' }}>
                公開URLの末尾に使われます: /site/<span style={{color:'#C9A84C'}}>{slug||'my-landing-page'}</span>
              </div>
            )}
          </div>
          {err && <div style={{ marginBottom:12, fontSize:11, color:'#f87171' }}>{err}</div>}
          <button type="submit" disabled={busy}
            style={{ width:'100%', padding:'12px', background:'#C9A84C', color:'#FEFCF8', border:'none', borderRadius:8, fontFamily:'var(--font-ui)', fontWeight:700, fontSize:13, cursor:busy?'default':'pointer', opacity:busy?0.5:1 }}>
            {busy?'作成中…':'ページを作成 →'}
          </button>
          {selectedTemplate !== 'blank' && (
            <p style={{ fontSize:10, color:'#B0A898', textAlign:'center', marginTop:12, lineHeight:1.6 }}>
              作成後、AIボタンで「{TEMPLATES.find(t=>t.id===selectedTemplate)?.name}を生成して」と入力するとコンテンツが自動生成されます
            </p>
          )}
        </form>
      )}
    </div>
  )
}
