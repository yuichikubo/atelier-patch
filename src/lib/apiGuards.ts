import type { NextRequest } from 'next/server'
import { NextResponse }     from 'next/server'
import { getServerSession } from './auth'
import { documentRepository } from '@/core/persistence'

export interface GuardedSession { workspaceId:string; userId:string }

export async function requireSession(req:NextRequest): Promise<GuardedSession|NextResponse> {
  const s = await getServerSession(req)
  if (!s?.workspaceId) return NextResponse.json({ error:'Unauthorized' },{ status:401 })
  return { workspaceId:s.workspaceId, userId:s.userId??'' }
}

export async function requirePageOwnership(req:NextRequest, pageId:string): Promise<GuardedSession|NextResponse> {
  const s = await requireSession(req)
  if (s instanceof NextResponse) return s
  const exists = await documentRepository.existsInWorkspace(pageId, s.workspaceId)
  if (!exists) return NextResponse.json({ error:'Not found' },{ status:404 })
  return s
}
