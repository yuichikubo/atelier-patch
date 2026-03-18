/**
 * ATELIER CMS — Supabase DocumentRepository
 * Drop-in replacement for the fs-based repository.
 * Uses a single `pages` table in Supabase.
 *
 * Table schema (run in Supabase SQL editor):
 *   see /prisma/supabase-setup.sql
 */

import { createClient } from '@supabase/supabase-js'
import type { Page }    from '../document/types'

export interface PageMeta {
  id: string; title: string; slug: string; status: string
  workspaceId: string; version: number; createdAt: string; updatedAt: string
}

// ── Supabase client (server-only) ─────────────────────────────────────────────
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY   // server-side only
  if (!url || !key) throw new Error('SUPABASE env vars not set')
  return createClient(url, key)
}

function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

// ── Repository ────────────────────────────────────────────────────────────────
export const documentRepository = {

  async load(pageId: string, workspaceId: string): Promise<Page | null> {
    const { data } = await getClient()
      .from('pages')
      .select('data')
      .eq('id', pageId)
      .eq('workspace_id', workspaceId)
      .single()
    return data ? (data.data as Page) : null
  },

  async loadBySlug(slug: string): Promise<Page | null> {
    const { data } = await getClient()
      .from('pages')
      .select('data')
      .eq('slug', slug)
      .single()
    return data ? (data.data as Page) : null
  },

  async loadById(pageId: string): Promise<Page | null> {
    const { data } = await getClient()
      .from('pages')
      .select('data')
      .eq('id', pageId)
      .single()
    return data ? (data.data as Page) : null
  },

  async save(
    page: Page,
    workspaceId: string,
    _options?: { createVersion?: boolean; versionLabel?: string; versionSource?: string },
  ): Promise<void> {
    const now = new Date().toISOString()
    await getClient()
      .from('pages')
      .upsert({
        id:           String(page.id),
        slug:         page.slug,
        title:        page.title,
        status:       page.status,
        workspace_id: workspaceId,
        version:      page.version,
        updated_at:   now,
        data:         { ...page, updatedAt: now },
      }, { onConflict: 'id' })
  },

  async create(data: {
    title: string; slug: string; workspaceId: string; themeId?: string
  }): Promise<Page> {
    const now  = new Date().toISOString()
    const page: Page = {
      id: generateId(), title: data.title, slug: data.slug, status: 'draft',
      workspaceId: data.workspaceId, themeId: data.themeId ?? 'luxury',
      version: 0, seo: {}, sections: [], createdAt: now, updatedAt: now,
    }
    await documentRepository.save(page, data.workspaceId)
    return page
  },

  async list(workspaceId: string): Promise<PageMeta[]> {
    const { data } = await getClient()
      .from('pages')
      .select('id, title, slug, status, workspace_id, version, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
    return (data ?? []).map(r => ({
      id: r.id, title: r.title, slug: r.slug, status: r.status,
      workspaceId: r.workspace_id, version: r.version,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }))
  },

  async delete(pageId: string, workspaceId: string): Promise<void> {
    await getClient()
      .from('pages')
      .delete()
      .eq('id', pageId)
      .eq('workspace_id', workspaceId)
  },

  async publish(pageId: string, workspaceId: string): Promise<Page | null> {
    const page = await documentRepository.loadById(pageId)
    if (!page) return null
    const updated: Page = {
      ...page,
      status: 'published',
      publishedAt: new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    }
    await documentRepository.save(updated, workspaceId)
    return updated
  },

  async existsInWorkspace(pageId: string, workspaceId: string): Promise<boolean> {
    const { count } = await getClient()
      .from('pages')
      .select('id', { count: 'exact', head: true })
      .eq('id', pageId)
      .eq('workspace_id', workspaceId)
    return (count ?? 0) > 0
  },

  async slugExists(slug: string, workspaceId: string): Promise<boolean> {
    const { count } = await getClient()
      .from('pages')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug)
      .eq('workspace_id', workspaceId)
    return (count ?? 0) > 0
  },
}
