import { NextRequest, NextResponse } from 'next/server'

type P = { params: { pageId: string } }

// ── Supabase (production) ──────────────────────────────────────────────────────
async function supabaseGet(pageId: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const { data } = await createClient(url, key)
    .from('timelines')
    .select('records')
    .eq('page_id', pageId)
    .single()
  return data?.records ?? []
}

async function supabasePost(pageId: string, records: unknown[]) {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  await createClient(url, key)
    .from('timelines')
    .upsert({ page_id: pageId, records, updated_at: new Date().toISOString() }, { onConflict: 'page_id' })
}

// ── Local fs (development) ─────────────────────────────────────────────────────
async function fsGet(pageId: string) {
  const { TimelineRepository } = await import('@/system/timeline/TimelineRepository')
  return TimelineRepository.load(pageId)
}

async function fsPost(pageId: string, records: unknown[]) {
  const { TimelineRepository } = await import('@/system/timeline/TimelineRepository')
  TimelineRepository.save(pageId, records as never)
}

// ── Route handlers ─────────────────────────────────────────────────────────────
const useSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL

export async function GET(_req: NextRequest, { params }: P): Promise<NextResponse> {
  try {
    const records = useSupabase ? await supabaseGet(params.pageId) : await fsGet(params.pageId)
    return NextResponse.json(records)
  } catch (e) {
    console.error('[GET /api/timeline]', e)
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest, { params }: P): Promise<NextResponse> {
  try {
    const records = await req.json()
    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'Expected array' }, { status: 400 })
    }
    if (useSupabase) {
      await supabasePost(params.pageId, records)
    } else {
      await fsPost(params.pageId, records)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/timeline]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
