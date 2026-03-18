import type { ComponentType } from 'react'
import type { Block }         from '../document/types'

export interface BlockComponentProps {
  block:Block; isEditing?:boolean; isSelected?:boolean; onUpdate?:(data:Partial<Block>)=>void
}
export type BlockComponent = ComponentType<BlockComponentProps>

export interface RendererContextType {
  isEditing:boolean; themeId?:string; onPatch?:(patch:unknown)=>void
  selectedBlockId?:string; selectedSectionId?:string
}
