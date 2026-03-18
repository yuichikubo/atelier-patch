import type { NextRequest } from 'next/server'

export interface Session {
  userId: string; workspaceId: string; email: string; role: 'admin'|'editor'|'viewer'
}

export async function getServerSession(_req: NextRequest): Promise<Session|null> {
  if (process.env.NODE_ENV === 'development') {
    return { userId:'dev-user', workspaceId:'dev-workspace', email:'dev@localhost', role:'admin' }
  }
  return null
}
