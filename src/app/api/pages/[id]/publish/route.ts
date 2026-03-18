import { NextRequest, NextResponse } from 'next/server'
import { requirePageOwnership }      from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'
import { revalidatePath }            from 'next/cache'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const g = await requirePageOwnership(req, params.id)
  if (g instanceof NextResponse) return g
  const page = await documentRepository.publish(params.id, g.workspaceId)
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Immediately invalidate the published page cache
  if (page.slug) revalidatePath(`/site/${page.slug}`)
  return NextResponse.json({ ok: true, publishedAt: page.publishedAt })
}
