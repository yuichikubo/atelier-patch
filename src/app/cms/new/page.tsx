'use client'
import { useState }  from 'react'
import { useRouter } from 'next/navigation'

const toSlug = (t:string) => t.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')

export default function NewPagePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [slug,  setSlug]  = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  const [slugHint, setSlugHint] = useState('')

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

  const inp:React.CSSProperties = { width:'100%', background:'var(--color-surface)', border:'1px solid var(--color-border)', borderRadius:8, padding:'9px 12px', color:'var(--color-text-primary)', fontFamily:'var(--font-ui)', fontSize:13, outline:'none', boxSizing:'border-box' }
  const lbl:React.CSSProperties = { display:'block', fontSize:10, color:'#7A7870', marginBottom:5, letterSpacing:'0.1em', textTransform:'uppercase' }

  return (
    <div style={{ maxWidth:440, margin:'72px auto', padding:'0 24px', fontFamily:'var(--font-ui)', color:'var(--color-text-primary)' }}>
      <h1 style={{ fontSize:18, fontWeight:700, marginBottom:28, color:'#C9A84C' }}>新しいページ</h1>
      <form onSubmit={submit}>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>タイトル</label>
          <input value={title} onChange={e=>{ setTitle(e.target.value); if(!slug) setSlug(toSlug(e.target.value)) }} placeholder="例：LP・ランディングページ" style={inp} />
        </div>
        <div style={{ marginBottom:24 }}>
          <label style={lbl}>スラッグ</label>
          <input value={slug} onChange={handleSlugChange} placeholder="my-landing-page" style={inp} />
          {slugHint ? (
            <div style={{ fontSize:10, color: slug.length === 0 && slugHint ? '#f87171' : '#7A7870', marginTop:5, letterSpacing:'0.04em' }}>
              {slugHint}
            </div>
          ) : (
            <div style={{ fontSize:10, color:'#7A7870', marginTop:5, letterSpacing:'0.04em' }}>
              公開URLの末尾に使われます: /site/<span style={{color:'#C9A84C'}}>{slug||'my-landing-page'}</span>
            </div>
          )}
        </div>
        {err && <div style={{ marginBottom:12, fontSize:11, color:'#f87171' }}>{err}</div>}
        <button type="submit" disabled={busy}
          style={{ width:'100%', padding:'12px', background:'#C9A84C', color:'var(--color-bg)', border:'none', borderRadius:8, fontFamily:'var(--font-ui)', fontWeight:700, fontSize:13, cursor:busy?'default':'pointer', opacity:busy?0.5:1 }}>
          {busy?'作成中…':'ページを作成 →'}
        </button>
      </form>
    </div>
  )
}
