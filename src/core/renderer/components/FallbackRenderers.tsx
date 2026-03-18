'use client'
import React, { Component, type ReactNode } from 'react'
import type { Block }                        from '@/core/document/types'
import type { BlockComponentProps }          from '../types'

export function FallbackBlockComponent({ block, isEditing }:BlockComponentProps) {
  if (!isEditing) return null
  return (
    <div style={{ padding:12, border:'1px dashed rgba(201,168,76,0.4)', borderRadius:8, background:'rgba(201,168,76,0.05)', fontFamily:'monospace', fontSize:11, color:'#C9A84C' }}>
      ⊠ Unknown block: <code>{block.type}</code>
    </div>
  )
}

interface S { hasError:boolean; msg:string }
interface P { block:Block; isEditing?:boolean; onError?:(e:unknown)=>void; children:ReactNode }

export class BlockErrorBoundary extends Component<P,S> {
  state:S = { hasError:false, msg:'' }
  static getDerivedStateFromError(e:Error):S { return { hasError:true, msg:e.message } }
  componentDidCatch(e:Error): void { this.props.onError?.({ blockId:this.props.block.id, error:e.message }) }
  render():ReactNode {
    if (!this.state.hasError) return this.props.children
    if (!this.props.isEditing) return null
    return <div style={{ padding:12, border:'1px solid rgba(248,113,113,0.5)', borderRadius:8, fontFamily:'monospace', fontSize:11, color:'#f87171' }}>⚠ Error in {this.props.block.type}: {this.state.msg}</div>
  }
}
