'use client'
import React, { createContext, useContext } from 'react'
import type { RendererContextType }         from '../types'

const Ctx = createContext<RendererContextType>({ isEditing:false })

export function RendererProvider({ context, children }:{ context:Partial<RendererContextType>; children:React.ReactNode }) {
  return <Ctx.Provider value={{ isEditing:false, ...context }}>{children}</Ctx.Provider>
}
export function useRendererContext(): RendererContextType { return useContext(Ctx) }
