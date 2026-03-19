import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'
import { buildTemplateSections, type TemplateId } from '@/cms/templates/pageTemplates'

export async function GET(req:NextRequest): Promise<NextResponse> {
  const g = await requireSession(req)
  if (g instanceof NextResponse) return g
  const pages = await documentRepository.list(g.workspaceId)
  return NextResponse.json(pages)
}

export async function POST(req:NextRequest): Promise<NextResponse> {
  try {
    const g = await requireSession(req)
    if (g instanceof NextResponse) return g
    const { title, slug, templateId } = await req.json()
    if (!title?.trim()||!slug?.trim()) return NextResponse.json({ error:'title and slug required' },{ status:400 })
    const dup = await documentRepository.slugExists(slug.trim(), g.workspaceId)
    if (dup) return NextResponse.json({ error:`Slug "${slug}" already in use` },{ status:409 })
    const page = await documentRepository.create({ title:title.trim(), slug:slug.trim(), workspaceId:g.workspaceId })
    // Apply template sections if requested
    if (templateId && templateId !== 'blank') {
      const sections = buildTemplateSections(templateId as TemplateId)
      if (sections.length > 0) {
        const filled = { ...page, sections, version: 1 }
        await documentRepository.save(filled, g.workspaceId)
        return NextResponse.json(filled, { status:201 })
      }
    }
    return NextResponse.json(page, { status:201 })
  } catch(e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/pages]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
