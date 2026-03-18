import { NextRequest, NextResponse } from 'next/server'
import { requirePageOwnership }      from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'

type P = { params: { id: string } }

export async function GET(req: NextRequest, { params }: P): Promise<NextResponse> {
  const g = await requirePageOwnership(req, params.id)
  if (g instanceof NextResponse) return g
  const page = await documentRepository.load(params.id, g.workspaceId)
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(page)
}

// Shared logic used by both PUT (full replace) and PATCH (partial update)
async function upsertPage(req: NextRequest, params: { id: string }): Promise<NextResponse> {
  const g = await requirePageOwnership(req, params.id)
  if (g instanceof NextResponse) return g

  const body    = await req.json()
  const current = await documentRepository.load(params.id, g.workspaceId)
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // body.document may be a serialised string (autosave) or a plain object (full save)
  const docBody =
    body.document !== undefined
      ? typeof body.document === 'string'
        ? JSON.parse(body.document)
        : body.document
      : {}

  const updated = {
    ...current,
    // Merge section/seo data from the document body
    ...docBody,
    // Top-level scalar fields are overridable but never cleared
    id:        current.id,
    slug:      body.slug     ?? current.slug,
    title:     body.title    ?? current.title,
    themeId:   body.themeId  ?? current.themeId,
    version:   body.version  ?? current.version,
    updatedAt: new Date().toISOString(),
  }

  await documentRepository.save(updated, g.workspaceId)
  return NextResponse.json(updated)
}

export async function PUT(req: NextRequest, { params }: P): Promise<NextResponse> {
  return upsertPage(req, params)
}

export async function PATCH(req: NextRequest, { params }: P): Promise<NextResponse> {
  return upsertPage(req, params)
}

export async function DELETE(req: NextRequest, { params }: P): Promise<NextResponse> {
  const g = await requirePageOwnership(req, params.id)
  if (g instanceof NextResponse) return g
  await documentRepository.delete(params.id, g.workspaceId)
  return NextResponse.json({ deleted: true })
}
