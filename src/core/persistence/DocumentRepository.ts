/**
 * ATELIER CMS — Document Repository
 * Phase 6 upgrades:
 *   • Atomic writes (write temp → rename) — prevents partial files
 *   • In-memory index cache — avoids disk read on every operation
 *   • Version retention — keeps last 50 versions per page
 *   • Save logging
 */

import fs   from 'fs'
import path from 'path'
import { logger } from '@/lib/logger'
import type { Page } from '../document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

const DATA_ROOT   = path.join(process.cwd(), 'data')
const PAGES_DIR   = path.join(DATA_ROOT, 'pages')
const INDEX_FILE  = path.join(DATA_ROOT, '_index.json')
const VERSION_DIR = path.join(DATA_ROOT, 'versions')
const MAX_VERSIONS = 50

function ensureDirs(): void {
  [DATA_ROOT, PAGES_DIR, VERSION_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  })
}
function pageFilePath(slug: string): string { return path.join(PAGES_DIR, `${slug}.json`) }

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PageMeta {
  id: string; title: string; slug: string; status: string
  workspaceId: string; version: number; createdAt: string; updatedAt: string
}
type PageIndex = Record<string, PageMeta>

// ─────────────────────────────────────────────────────────────────────────────
// Index cache — avoids readFileSync on every operation
// ─────────────────────────────────────────────────────────────────────────────

let _indexCache: PageIndex | null = null

function readIndex(): PageIndex {
  if (_indexCache) return _indexCache
  try {
    if (!fs.existsSync(INDEX_FILE)) { _indexCache = {}; return {} }
    _indexCache = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
    return _indexCache!
  } catch {
    _indexCache = {}
    return {}
  }
}

function writeIndex(idx: PageIndex): void {
  ensureDirs()
  _indexCache = idx   // update cache synchronously with write
  atomicWriteFile(INDEX_FILE, JSON.stringify(idx, null, 2))
}

function invalidateIndexCache(): void {
  _indexCache = null
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic write — write to .tmp then rename
// ─────────────────────────────────────────────────────────────────────────────

function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch (e) {
    // Clean up tmp on failure
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch {}
    throw e
  }
}

function indexEntry(page: Page, workspaceId: string): PageMeta {
  return {
    id: String(page.id), title: page.title, slug: page.slug, status: page.status,
    workspaceId, version: page.version, createdAt: page.createdAt, updatedAt: page.updatedAt,
  }
}
function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Version retention — keep last MAX_VERSIONS per page
// ─────────────────────────────────────────────────────────────────────────────

function pruneVersions(pageId: string): void {
  const vd = path.join(VERSION_DIR, String(pageId))
  if (!fs.existsSync(vd)) return
  const files = fs.readdirSync(vd)
    .filter(f => f.endsWith('.json'))
    .sort()   // oldest first (files are named with timestamp prefix)
  if (files.length <= MAX_VERSIONS) return
  const toDelete = files.slice(0, files.length - MAX_VERSIONS)
  for (const f of toDelete) {
    try { fs.unlinkSync(path.join(vd, f)) } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export const documentRepository = {
  async load(pageId: string, workspaceId: string): Promise<Page | null> {
    const idx = readIndex(); const e = idx[pageId]
    if (!e || e.workspaceId !== workspaceId) return null
    return documentRepository.loadBySlug(e.slug)
  },

  async loadBySlug(slug: string): Promise<Page | null> {
    ensureDirs(); const fp = pageFilePath(slug)
    if (!fs.existsSync(fp)) return null
    try { return JSON.parse(fs.readFileSync(fp, 'utf-8')) } catch { return null }
  },

  async loadById(pageId: string): Promise<Page | null> {
    const idx = readIndex(); const e = idx[pageId]; if (!e) return null
    return documentRepository.loadBySlug(e.slug)
  },

  async save(
    page: Page,
    workspaceId: string,
    options?: { createVersion?: boolean; versionLabel?: string; versionSource?: string },
  ): Promise<void> {
    ensureDirs()
    const idx = readIndex()
    const existing = idx[String(page.id)]
    if (existing && existing.workspaceId !== workspaceId) {
      throw new Error(`Page "${page.id}" not in workspace "${workspaceId}"`)
    }
    // Remove old slug file if slug changed
    if (existing && existing.slug !== page.slug) {
      const old = pageFilePath(existing.slug)
      if (fs.existsSync(old)) fs.unlinkSync(old)
    }

    // Atomic page write
    atomicWriteFile(pageFilePath(page.slug), JSON.stringify(page, null, 2))
    idx[String(page.id)] = indexEntry(page, workspaceId)
    writeIndex(idx)

    logger.info('persistence', 'document-saved', { pageId: String(page.id), version: page.version })

    // Version snapshot
    if (options?.createVersion) {
      const vd = path.join(VERSION_DIR, String(page.id))
      if (!fs.existsSync(vd)) fs.mkdirSync(vd, { recursive: true })
      const versionFile = path.join(vd, `${Date.now()}_${options.versionSource ?? 'manual'}.json`)
      atomicWriteFile(versionFile, JSON.stringify({
        ...page, _label: options.versionLabel, _source: options.versionSource ?? 'manual',
      }, null, 2))
      pruneVersions(String(page.id))
    }
  },

  async create(data: { title: string; slug: string; workspaceId: string; themeId?: string }): Promise<Page> {
    const now = new Date().toISOString()
    const page: Page = {
      id: generateId(), title: data.title, slug: data.slug, status: 'draft',
      workspaceId: data.workspaceId, themeId: data.themeId ?? 'luxury',
      version: 0, seo: {}, sections: [], createdAt: now, updatedAt: now,
    }
    await documentRepository.save(page, data.workspaceId)
    return page
  },

  async list(workspaceId: string): Promise<PageMeta[]> {
    const idx = readIndex()
    return Object.values(idx)
      .filter(e => e.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  },

  async delete(pageId: string, workspaceId: string): Promise<void> {
    const idx = readIndex(); const e = idx[pageId]; if (!e) return
    if (e.workspaceId !== workspaceId) throw new Error('Ownership denied')
    const fp = pageFilePath(e.slug); if (fs.existsSync(fp)) fs.unlinkSync(fp)
    delete idx[pageId]
    writeIndex(idx)
    invalidateIndexCache()
  },

  async publish(pageId: string, workspaceId: string): Promise<Page | null> {
    const page = await documentRepository.loadById(pageId); if (!page) return null
    const updated: Page = { ...page, status: 'published', publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    await documentRepository.save(updated, workspaceId, {
      createVersion: true,
      versionLabel: `Published ${updated.publishedAt}`,
      versionSource: 'publish',
    })
    return updated
  },

  async existsInWorkspace(pageId: string, workspaceId: string): Promise<boolean> {
    const idx = readIndex(); const e = idx[pageId]
    return !!(e && e.workspaceId === workspaceId)
  },

  async slugExists(slug: string, workspaceId: string): Promise<boolean> {
    const idx = readIndex()
    return Object.values(idx).some(e => e.slug === slug && e.workspaceId === workspaceId)
  },
}
