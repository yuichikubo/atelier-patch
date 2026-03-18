/**
 * ATELIER CMS — AI Generate API Route
 * POST /api/ai/generate
 *
 * Receives a prompt + document snapshot from the client.
 * Calls the Anthropic API using the server-only ANTHROPIC_API_KEY.
 * Returns validated Patch[] — the client applies them via engine.enqueuePatch().
 *
 * The API key never leaves the server.
 * The client never calls Anthropic directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'
import { parsePrompt }               from '@/extensions/ai/PromptParser'
import { buildPatches }              from '@/extensions/ai/PatchBuilder'
import { checkRateLimit }            from '@/lib/rateLimit'
import { logger }                    from '@/lib/logger'
import type { Page }                 from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Request / response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  prompt:           string
  pageId:           string            // used to load document server-side
  selectedBlockId?: string | null
  // 'document' field from client is intentionally ignored — loaded from DB below
}

export interface GenerateResponse {
  ok:       boolean
  patches:  unknown[]   // Patch[] — typed by client at consumption
  warnings: string[]
  error?:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/generate
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const guard = await requireSession(req)
  if (guard instanceof NextResponse) return guard

  // ── Rate limit: 5 requests per minute per user ─────────────────────────────
  const rl = checkRateLimit(`${guard.userId}:ai-generate`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) {
    logger.warn('ai', 'rate-limited', { userId: guard.userId, retryAfter: rl.retryAfter })
    return NextResponse.json(
      { ok: false, patches: [], warnings: [], error: 'Too many requests. Please wait before generating again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: GenerateRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: 'Invalid JSON body' }, { status: 400 })
  }

  const { prompt, pageId, selectedBlockId = null } = body

  if (!prompt?.trim()) {
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: 'prompt is required' }, { status: 400 })
  }
  if (!pageId?.trim()) {
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: 'pageId is required' }, { status: 400 })
  }

  // ── Load document server-side — never trust the client snapshot ──────────────
  // Uses workspace-aware load() to enforce ownership. loadById() has no workspaceId
  // check and must not be used here — it would allow cross-workspace access.
  const page = await documentRepository.load(pageId, guard.workspaceId)
  if (!page) {
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: 'Page not found' }, { status: 404 })
  }

  // ── API key — server only, never sent to client ────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // ── Build prompt context ───────────────────────────────────────────────────
  let parsed
  try {
    parsed = parsePrompt(prompt.trim(), page as Page, { selectedBlockId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: `Prompt parse failed: ${msg}` }, { status: 500 })
  }

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  let rawResponse: string
  logger.info('ai', 'generate-start', { userId: guard.userId, pageId, promptLen: prompt.length })
  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  AbortSignal.timeout(30_000),
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system:     parsed.systemPrompt,
        messages:   [{ role: 'user', content: parsed.userMessage }],
      }),
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text().catch(() => '')
      logger.error('ai', 'generate-api-error', { status: anthropicRes.status })
      return NextResponse.json(
        { ok: false, patches: [], warnings: [], error: `Anthropic API ${anthropicRes.status}: ${errBody.slice(0, 200)}` },
        { status: 502 },
      )
    }

    const data = await anthropicRes.json()
    rawResponse = (data.content?.[0]?.text ?? '') as string
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isTimeout = msg.includes('TimeoutError') || msg.includes('timed out')
    logger.error('ai', isTimeout ? 'generate-timeout' : 'generate-error', { error: msg })
    return NextResponse.json({
      ok: false, patches: [], warnings: [],
      error: isTimeout ? 'AI request timed out. Please try again.' : `AI request failed: ${msg}`,
    }, { status: 502 })
  }

  if (!rawResponse.trim()) {
    return NextResponse.json({ ok: false, patches: [], warnings: [], error: 'AI returned an empty response' }, { status: 502 })
  }

  // ── Validate AI output into typed Patch[] ──────────────────────────────────
  const built = buildPatches(rawResponse)

  if (!built.ok || built.patches.length === 0) {
    return NextResponse.json({
      ok:       false,
      patches:  [],
      warnings: built.errors,
      error:    built.errors[0] ?? 'No valid patches produced',
    }, { status: 422 })
  }

  return NextResponse.json({
    ok:       true,
    patches:  built.patches,
    warnings: built.errors,   // non-fatal validation notes
  } satisfies GenerateResponse)
}
