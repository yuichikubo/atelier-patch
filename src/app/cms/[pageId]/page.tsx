'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { engine }               from '@/core/document/engineInstance'
import { EditorLayout }         from '@/editor/layout/EditorLayout'
import { AutoSaveManager }      from '@/system/autosave/AutoSaveManager'
import { createTimelinePersistence } from '@/system/timeline/TimelinePersistenceManager'
import { InkLayer }             from '@/app/InkLayer'
import type { CorePage }        from '@/core/document/types'

export default function EditorPage() {
  const { pageId } = useParams<{ pageId: string }>()
  const router     = useRouter()

  const [ready, setReady] = useState(false)
  const [page,  setPage]  = useState<CorePage | null>(null)
  const autosaveRef = useRef<AutoSaveManager | null>(null)

  // ── Load page from API → push into engine ──────────────────────────────
  useEffect(() => {
    fetch(`/api/pages/${pageId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: any) => {
        setPage(data)
        const doc = typeof data.document === 'string' ? JSON.parse(data.document) : data
        engine.loadDocument({
          id:          data.id,
          title:       data.title,
          slug:        data.slug,
          status:      data.status,
          workspaceId: data.workspaceId,
          themeId:     data.themeId,
          version:     data.version,
          seo:         doc.seo      ?? {},
          sections:    doc.sections ?? [],
          createdAt:   data.createdAt,
          updatedAt:   data.updatedAt,
        } as any)
        setReady(true)
      })
      .catch(() => router.push('/cms/pages'))
  }, [pageId, router])

  // ── Autosave via AutoSaveManager ───────────────────────────────────────
  useEffect(() => {
    if (!ready || !page) return
    const manager = new AutoSaveManager(pageId, page.workspaceId)
    autosaveRef.current = manager
    // Surface save errors as a toast via a custom window event
    // TopBar already listens to patchEventBus document-saved; errors go via DOM
    manager.onStatus(status => {
      if (status === 'error') {
        window.dispatchEvent(new CustomEvent('atelier:autosave-error'))
      }
    })
    manager.start()
    return () => { manager.flush(); manager.stop() }
  }, [ready, page, pageId])

  // ── Timeline persistence ────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return
    const tl = createTimelinePersistence(pageId)
    tl.load()    // hydrate timelineEngine with stored records
    tl.start()   // watch for new records, flush to disk
    return () => tl.stop()
  }, [ready, pageId])

  // ── Loading screen ─────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        height:'100vh', background:'#0E0E10', color:'rgba(255,255,255,0.18)',
        fontFamily:'var(--font-ui)', fontSize:12,
      }}>
        Loading…
      </div>
    )
  }

  const slug = engine.getDocument().slug

  return <><InkLayer /><EditorLayout pageId={pageId} pageSlug={slug} /></>
}
