import type { NextRequest } from 'next/server'

export interface Session {
  userId: string; workspaceId: string; email: string; role: 'admin'|'editor'|'viewer'
}

export async function getServerSession(_req: NextRequest): Promise<Session|null> {
  // Single-user mode: always return a dev session.
  // Replace with real auth (Supabase Auth, NextAuth, etc.) when multi-user is needed.
  return { userId:'dev-user', workspaceId:'dev-workspace', email:'dev@localhost', role:'admin' }
}
