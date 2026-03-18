import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@supabase/supabase-js'

type P = { params: { pageId: string } }

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE env vars not set')
  return createClient(url, key)
}

export async function GET(_req: NextRequest, { params }: P): Promise<NextResponse> {
  try {
    const { data } = await getClient()
      .from('timelines')
      .select('records')
      .eq('page_id', params.pageId)
      .single()
    return NextResponse.json(data?.records ?? [])
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest, { params }: P): Promise<NextResponse> {
  try {
    const records = await req.json()
    if (!Array.isArray(records)) {
      return NextResponse.json({ error: 'Expected array' }, { status: 400 })
    }
    await getClient()
      .from('timelines')
      .upsert({ page_id: params.pageId, records, updated_at: new Date().toISOString() }, { onConflict: 'page_id' })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[POST /api/timeline]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
