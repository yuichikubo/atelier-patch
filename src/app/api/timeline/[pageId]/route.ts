import { NextRequest, NextResponse } from 'next/server'
import { TimelineRepository }        from '@/system/timeline/TimelineRepository'

type P = { params: { pageId: string } }

export async function GET(_req: NextRequest, { params }: P): Promise<NextResponse> {
  const records = TimelineRepository.load(params.pageId)
  return NextResponse.json(records)
}

export async function POST(req: NextRequest, { params }: P): Promise<NextResponse> {
  const records = await req.json()
  if (!Array.isArray(records)) {
    return NextResponse.json({ error: 'Expected array' }, { status: 400 })
  }
  TimelineRepository.save(params.pageId, records)
  return NextResponse.json({ ok: true })
}
