'use client'
import React, { useState } from 'react'
import { engine }           from '@/core/document/engineInstance'
import { editorEvents }     from '@/system/editorEvents'

const BLOCKS = [
  { type:'hero',         label:'Hero',     icon:'✦', cat:'Layout'  },
  { type:'text',         label:'Text',     icon:'✎', cat:'Content' },
  { type:'image',        label:'Image',    icon:'🖼', cat:'Media'   },
  { type:'gallery',      label:'Gallery',  icon:'▣', cat:'Media'   },
  { type:'cta',          label:'CTA',      icon:'→', cat:'Content' },
  { type:'faq',          label:'FAQ',      icon:'?', cat:'Content' },
  { type:'feature-list', label:'Features', icon:'⊞', cat:'Content' },
]

const DEFAULTS: Record<string,Record<string,unknown>> = {
  hero:    { title:'Your Headline', subtitle:'Supporting text here', buttonText:'Get Started', buttonUrl:'#' },
  text:    { text:'Your content here.', format:'plain' },
  image:   { url:'', alt:'' },
  gallery: { images:[], columns:3 },
  cta:     { headline:'Ready to get started?', primaryText:'Start Now', primaryUrl:'#' },
  faq:     { question:'Your question here?', answer:'Your answer here.' },
  'feature-list': { features:[{title:'Feature One',description:'Describe this feature.',icon:'✦'}], layout:'grid' },
}

/* ── section list ──────────────────────────────────────────────────── */
function SectionList() {
  const [doc, setDoc] = React.useState(()=>engine.getDocument())
  React.useEffect(()=>engine.subscribe(d=>setDoc({...d})),[])

  const sorted = [...(doc.sections??[])].sort((a,b)=>a.order-b.order)

  const addSection = () =>
    engine.enqueuePatch({op:'add',target:'section',data:{type:'blank'},position:{placement:'end'},meta:{source:'editor'}})

  const deleteSection = (id:string) =>
    engine.enqueuePatch({op:'remove',target:'section',id,meta:{source:'editor'}})

  const moveSection = (id:string, dir:1|-1) => {
    const idx = sorted.findIndex(s=>s.id===id)
    const target = sorted[idx+dir]
    if (!target) return
    // swap orders via two patches
    engine.applyPatchArray({ patch:[
      {op:'update',target:'section',id,data:{order:target.order},meta:{source:'editor'}},
      {op:'update',target:'section',id:target.id,data:{order:sorted[idx].order},meta:{source:'editor'}},
    ]})
  }

  return (
    <div style={{padding:'10px 12px',fontFamily:'DM Mono,monospace'}}>
      <div style={{fontSize:9,color:'#4A4844',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:8}}>
        Sections ({sorted.length})
      </div>

      {sorted.map((s,i)=>(
        <div key={s.id} style={{display:'flex',alignItems:'center',gap:4,padding:'6px 8px',borderRadius:7,background:'#13131A',marginBottom:4,border:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{flex:1,overflow:'hidden'}}>
            <div style={{fontSize:10,color:'#C8C4BC',textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap'}}>
              {s.label || s.type}
            </div>
            <div style={{fontSize:8,color:'#3A3834',marginTop:1}}>{s.blocks.length} block{s.blocks.length!==1?'s':''}</div>
          </div>
          <div style={{display:'flex',gap:2,flexShrink:0}}>
            <button onClick={()=>moveSection(s.id,-1)} disabled={i===0}
              style={{background:'none',border:'none',color:i===0?'#2A2824':'#5A5854',cursor:i===0?'default':'pointer',fontSize:10,padding:'2px 3px',lineHeight:1}}>↑</button>
            <button onClick={()=>moveSection(s.id,1)} disabled={i===sorted.length-1}
              style={{background:'none',border:'none',color:i===sorted.length-1?'#2A2824':'#5A5854',cursor:i===sorted.length-1?'default':'pointer',fontSize:10,padding:'2px 3px',lineHeight:1}}>↓</button>
            <button onClick={()=>deleteSection(s.id)}
              style={{background:'none',border:'none',color:'#6A4040',cursor:'pointer',fontSize:10,padding:'2px 4px',lineHeight:1}}>✕</button>
          </div>
        </div>
      ))}

      <button onClick={addSection}
        style={{width:'100%',marginTop:6,padding:'8px',background:'transparent',border:'1px dashed rgba(201,168,76,0.18)',borderRadius:8,color:'rgba(201,168,76,0.4)',cursor:'pointer',fontFamily:'DM Mono,monospace',fontSize:10}}>
        + Add section
      </button>
    </div>
  )
}

/* ── palette panel ─────────────────────────────────────────────────── */
export function PalettePanel() {
  const [search, setSearch] = useState('')
  const [tab,    setTab]    = useState<'blocks'|'sections'>('blocks')

  const filtered = BLOCKS.filter(b=>b.label.toLowerCase().includes(search.toLowerCase()))

  const addBlock = (type:string) => {
    const doc = engine.getDocument()
    let sec   = doc.sections[doc.sections.length-1]
    if (!sec) {
      engine.enqueuePatch({op:'add',target:'section',data:{type:'blank'},position:{placement:'end'},meta:{source:'editor'}})
      sec = engine.getDocument().sections[0]
    }
    if (!sec) return
    engine.enqueuePatch({op:'add',target:'block',data:{type,parentSectionId:sec.id,content:DEFAULTS[type]??{}},position:{placement:'end'},meta:{source:'editor'}})
    editorEvents.blockAdded(type)
  }

  return (
    <div style={{height:'100%',display:'flex',flexDirection:'column',background:'#0F0F14'}}>
      {/* tab bar */}
      <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        {(['blocks','sections'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{flex:1,padding:'8px 6px',fontSize:9,letterSpacing:'0.1em',textTransform:'uppercase',
              background:'transparent',border:'none',cursor:'pointer',fontFamily:'DM Mono,monospace',
              color:tab===t?'#C9A84C':'#3A3834',
              borderBottom:tab===t?'2px solid #C9A84C':'2px solid transparent'}}>
            {t}
          </button>
        ))}
      </div>

      {tab==='sections' ? <SectionList /> : (
        <div style={{padding:12,flex:1,overflow:'auto'}}>
          <input
            placeholder="Search blocks…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{width:'100%',background:'#0B0B10',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'7px 10px',color:'#E8E4DC',fontFamily:'DM Mono,monospace',fontSize:11,outline:'none',boxSizing:'border-box',marginBottom:10}}
          />
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
            {filtered.map(b=>(
              <div key={b.type} onClick={()=>addBlock(b.type)}
                style={{padding:'10px 12px',background:'#1A1A24',border:'1px solid rgba(255,255,255,0.05)',borderRadius:10,cursor:'pointer',transition:'border-color 0.12s'}}
                onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(201,168,76,0.3)')}
                onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.05)')}>
                <div style={{fontSize:15,marginBottom:4}}>{b.icon}</div>
                <div style={{fontSize:11,color:'#C8C4BC'}}>{b.label}</div>
                <div style={{fontSize:9,color:'#4A4844',marginTop:2}}>{b.cat}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
