'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { engine }     from '@/core/document/engineInstance'
import type { Block } from '@/core/document/types'

const inputStyle: React.CSSProperties = {
  width:'100%', background:'#0B0B10',
  border:'1px solid rgba(255,255,255,0.08)', borderRadius:8,
  padding:'7px 10px', color:'#E8E4DC',
  fontFamily:'var(--font-ui)', fontSize:11,
  outline:'none', boxSizing:'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize:9, color:'#7A7870', marginBottom:4,
  letterSpacing:'0.08em', textTransform:'uppercase',
}

function ArrayEditor({ fieldKey, items, onChange }:{
  fieldKey:string; items:Record<string,unknown>[]; onChange:(k:string,v:unknown)=>void
}) {
  const update = (i:number,k:string,v:unknown) =>
    onChange(fieldKey, items.map((item,idx)=>idx===i?{...item,[k]:v}:item))
  const remove = (i:number) =>
    onChange(fieldKey, items.filter((_,idx)=>idx!==i))
  const add = () => {
    const tpl = items[0] ? Object.fromEntries(Object.keys(items[0]).map(k=>[k,''])) : {value:''}
    onChange(fieldKey, [...items,tpl])
  }
  return (
    <div>
      {items.map((item,i)=>(
        <div key={i} style={{background:'#111118',borderRadius:8,padding:'8px 10px',marginBottom:6,border:'1px solid rgba(255,255,255,0.05)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:9,color:'#4A4844',letterSpacing:'0.1em'}}>ITEM {i+1}</span>
            <button onClick={()=>remove(i)} style={{background:'none',border:'none',color:'#7A5050',cursor:'pointer',fontSize:12,padding:'0 2px',lineHeight:1}}>✕</button>
          </div>
          {Object.entries(item).map(([k,v])=>(
            <div key={k} style={{marginBottom:6}}>
              <div style={{...labelStyle,marginBottom:2}}>{k}</div>
              {typeof v==='string'
                ? <input value={v} onChange={e=>update(i,k,e.target.value)} style={{...inputStyle,fontSize:10,padding:'5px 8px'}} />
                : <div style={{color:'#4A4844',fontSize:10,padding:'4px 0'}}>{String(v)}</div>
              }
            </div>
          ))}
        </div>
      ))}
      <button onClick={add} style={{width:'100%',padding:'7px',background:'transparent',border:'1px dashed rgba(201,168,76,0.2)',borderRadius:8,color:'rgba(201,168,76,0.45)',cursor:'pointer',fontFamily:'var(--font-ui)',fontSize:10}}>
        + Add item
      </button>
    </div>
  )
}

function FieldEditor({fieldKey,val,onChange}:{fieldKey:string;val:unknown;onChange:(k:string,v:unknown)=>void}) {
  if (typeof val==='string')
    return val.length<120
      ? <input value={val} onChange={e=>onChange(fieldKey,e.target.value)} style={inputStyle} />
      : <textarea value={val} rows={4} onChange={e=>onChange(fieldKey,e.target.value)} style={{...inputStyle,resize:'vertical'}} />
  if (typeof val==='number')
    return <input type="number" value={val} onChange={e=>onChange(fieldKey,Number(e.target.value))} style={inputStyle} />
  if (typeof val==='boolean')
    return (
      <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
        <input type="checkbox" checked={val} onChange={e=>onChange(fieldKey,e.target.checked)} style={{accentColor:'#C9A84C'}} />
        <span style={{fontSize:11,color:'#C8C4BC'}}>{val?'true':'false'}</span>
      </label>
    )
  if (Array.isArray(val))
    return <ArrayEditor fieldKey={fieldKey} items={val as Record<string,unknown>[]} onChange={onChange} />
  return <div style={{color:'#4A4844',fontSize:10,fontFamily:'var(--font-ui)',padding:'6px 8px',background:'#0B0B10',borderRadius:6,wordBreak:'break-all'}}>{JSON.stringify(val).slice(0,120)}</div>
}

export function BlockInspector({selectedBlockId}:{selectedBlockId?:string}) {
  const [block,     setBlock]     = useState<Block|null>(null)
  const [sectionId, setSectionId] = useState<string|null>(null)

  useEffect(()=>{
    if (!selectedBlockId){setBlock(null);setSectionId(null);return}
    for (const s of engine.getDocument().sections){
      const b=s.blocks.find(b=>b.id===selectedBlockId)
      if(b){setBlock(b);setSectionId(s.id);return}
    }
    setBlock(null);setSectionId(null)
  },[selectedBlockId])

  useEffect(()=>engine.subscribe(()=>{
    if(!selectedBlockId)return
    for(const s of engine.getDocument().sections){
      const b=s.blocks.find(b=>b.id===selectedBlockId)
      if(b){setBlock({...b});setSectionId(s.id);return}
    }
    setBlock(null);setSectionId(null)
  }),[selectedBlockId])

  const handleChange = useCallback((key:string,value:unknown)=>{
    if(!block)return
    engine.enqueuePatch({op:'update',target:'block',id:block.id,
      data:{content:{...(block.content as any),[key]:value}},meta:{source:'editor'}})
  },[block])

  const handleDelete = useCallback(()=>{
    if(!block)return
    engine.enqueuePatch({op:'remove',target:'block',id:block.id,meta:{source:'editor'}})
  },[block])

  const handleDuplicate = useCallback(()=>{
    if(!block||!sectionId)return
    engine.enqueuePatch({op:'add',target:'block',
      data:{type:block.type,parentSectionId:sectionId,content:{...(block.content as any)}},
      position:{placement:'after',ref:block.id},meta:{source:'editor'}})
  },[block,sectionId])

  const setAlign = useCallback((align:string)=>{
    if(!block)return
    engine.enqueuePatch({op:'update',target:'block',id:block.id,
      data:{settings:{...(block.settings as any),align}},meta:{source:'editor'}})
  },[block])

  if(!block) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:12,fontFamily:'var(--font-ui)'}}>
      <div style={{fontSize:36,opacity:0.2,color:'#C9A84C'}}>◈</div>
      <div style={{fontSize:11,color:'#3A3834',textAlign:'center',lineHeight:1.7}}>Click a block<br/>to inspect</div>
    </div>
  )

  const content  = block.content as Record<string,unknown>
  const curAlign = (block.settings as any)?.align ?? 'left'

  return (
    <div style={{fontFamily:'var(--font-ui)',background:'#0F0F14',height:'100%',overflow:'auto',display:'flex',flexDirection:'column'}}>
      {/* header */}
      <div style={{padding:'12px 14px 10px',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{padding:'3px 10px',background:'rgba(201,168,76,0.1)',border:'1px solid rgba(201,168,76,0.22)',borderRadius:6,color:'#C9A84C',fontSize:11}}>{block.type}</div>
          <div style={{display:'flex',gap:4}}>
            <button onClick={handleDuplicate} title="Duplicate"
              style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:6,color:'#7A7870',cursor:'pointer',fontSize:11,padding:'3px 9px',fontFamily:'var(--font-ui)'}}>⊕</button>
            <button onClick={handleDelete} title="Delete"
              style={{background:'rgba(220,80,80,0.08)',border:'1px solid rgba(220,80,80,0.18)',borderRadius:6,color:'#cc6666',cursor:'pointer',fontSize:11,padding:'3px 9px',fontFamily:'var(--font-ui)'}}>✕</button>
          </div>
        </div>
        <div style={{fontSize:8,color:'#2E2C28',letterSpacing:'0.05em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{block.id}</div>
      </div>
      {/* fields */}
      <div style={{padding:'12px 14px',flex:1,overflow:'auto'}}>
        <div style={{...labelStyle,marginBottom:10}}>Content</div>
        {Object.entries(content).map(([key,val])=>(
          <div key={key} style={{marginBottom:14}}>
            <div style={labelStyle}>{key}</div>
            <FieldEditor fieldKey={key} val={val} onChange={handleChange} />
          </div>
        ))}
        {/* alignment */}
        <div style={{marginTop:20,paddingTop:14,borderTop:'1px solid rgba(255,255,255,0.04)'}}>
          <div style={{...labelStyle,marginBottom:8}}>Alignment</div>
          <div style={{display:'flex',gap:4}}>
            {(['left','center','right'] as const).map(a=>(
              <button key={a} onClick={()=>setAlign(a)}
                style={{flex:1,padding:'6px 0',borderRadius:6,fontFamily:'var(--font-ui)',fontSize:12,cursor:'pointer',
                  background:curAlign===a?'rgba(201,168,76,0.14)':'rgba(255,255,255,0.03)',
                  border:curAlign===a?'1px solid rgba(201,168,76,0.28)':'1px solid rgba(255,255,255,0.06)',
                  color:curAlign===a?'#C9A84C':'#5A5854'}}>
                {a==='left'?'⇤':a==='center'?'⇔':'⇥'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
