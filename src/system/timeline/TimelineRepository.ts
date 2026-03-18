/**
 * ATELIER CMS — Timeline Repository
 *
 * Persists PatchRecord entries to disk so timeline history survives
 * page reloads and server restarts.
 *
 * FILE FORMAT
 * ───────────
 * data/timeline_<pageId>.json
 * A JSON array of PatchRecord objects, oldest first (append-only).
 *
 * APPEND-ONLY INVARIANT
 * ─────────────────────
 * Records are never deleted or modified.
 * Each save call appends new records since the last flush.
 * The file grows monotonically — consistent with the timeline design.
 *
 * SERVER-ONLY
 * ───────────
 * This module uses Node.js `fs` — it must only be imported in server-side
 * code (API routes, AppBootstrap server component, or Node scripts).
 * It is NOT imported by any client React component.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • Never calls engine.enqueuePatch() — read-only observer
 * • Never modifies PatchRecord objects after creation
 * • Load/save are the only write operations; both are append-safe
 */

import fs   from 'fs'
import path from 'path'
import type { PatchRecord } from './PatchRecord'

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

const DATA_ROOT = path.join(process.cwd(), 'data')
const TIMELINE_DIR = path.join(DATA_ROOT, 'timelines')

function ensureDir(): void {
  if (!fs.existsSync(DATA_ROOT))     fs.mkdirSync(DATA_ROOT,     { recursive: true })
  if (!fs.existsSync(TIMELINE_DIR))  fs.mkdirSync(TIMELINE_DIR,  { recursive: true })
}

function filePath(pageId: string): string {
  return path.join(TIMELINE_DIR, `timeline_${pageId}.json`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────────────────────────────────────

export const TimelineRepository = {

  /**
   * Load all persisted PatchRecords for a page.
   * Returns an empty array if no file exists or the file is corrupt.
   */
  load(pageId: string): PatchRecord[] {
    ensureDir()
    const fp = filePath(pageId)
    if (!fs.existsSync(fp)) return []
    try {
      const raw = fs.readFileSync(fp, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as PatchRecord[]) : []
    } catch {
      console.warn(`[TimelineRepository] Failed to parse ${fp} — starting fresh`)
      return []
    }
  },

  /**
   * Append new records to the persisted file.
   * Only records not already present (by id) are written.
   * Existing records in the file are never modified.
   *
   * @param pageId   The page whose timeline to write.
   * @param records  All in-memory records (the repository deduplicates).
   */
  save(pageId: string, records: readonly PatchRecord[]): void {
    ensureDir()
    const fp = filePath(pageId)

    // Read existing ids to avoid duplicates
    const existing = TimelineRepository.load(pageId)
    const existingIds = new Set(existing.map(r => r.id))

    const newRecords = records.filter(r => !existingIds.has(r.id))
    if (newRecords.length === 0) return

    const merged = [...existing, ...newRecords]
    fs.writeFileSync(fp, JSON.stringify(merged, null, 2), 'utf-8')
  },

  /**
   * Delete the timeline file for a page (e.g. when the page is deleted).
   */
  delete(pageId: string): void {
    const fp = filePath(pageId)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  },

  /**
   * Check whether a timeline file exists for the given page.
   */
  exists(pageId: string): boolean {
    return fs.existsSync(filePath(pageId))
  },
}
