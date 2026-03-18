/**
 * ATELIER CMS — AI Rewrite Route
 * POST /api/ai/rewrite
 *
 * Rewrites the content of a specific block using AI.
 * Returns a single validated UpdatePatch targeting that block.
 *
 * Request body:
 *   { pageId, blockId, instruction }
 *
 * Response:
 *   { ok, patch, warning? }
 *
 * Architecture:
 *   This route returns one Patch — the client applies it via engine.enqueuePatch().
 *   The document is never modified server-side.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'
import { checkRateLimit }            from '@/lib/rateLimit'
import { logger }                    from '@/lib/logger'
import type { Page, Block }          from '@/core/document/types'
import type { UpdatePatch }          from '@/core/patch/types'

// ─────────────────────────────────────────────────────────────────────────────
// Request / response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface RewriteRequest {
  pageId:      string
  blockId:     string
  instruction: string   // e.g. "Make it more persuasive" or "Translate to Japanese"
}

export interface RewriteResponse {
  ok:       boolean
  patch?:   UpdatePatch
  warning?: string
  error?:   string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function findBlock(page: Page, blockId: string): Block | null {
  for (const section of page.sections) {
    const block = section.blocks.find(b => b.id === blockId)
    if (block) return block
  }
  return null
}

function buildRewriteSystemPrompt(): string {
  return `You are an expert copywriter for landing pages and websites.

Your ONLY job is to rewrite the content of a given block based on the user's instruction.

Rules:
1. Respond with ONLY a valid JSON object representing the new content. No prose, no markdown, no explanation.
2. Keep the same keys as the original content — only change the values.
3. Never add or remove keys from the content object.
4. Keep content concise and impactful.
5. Preserve the overall structure (buttonText, buttonUrl, etc.) unless the instruction says otherwise.`
}

function buildRewriteUserMessage(block: Block, instruction: string): string {
  return `Block type: ${block.type}

Current content:
${JSON.stringify(block.content, null, 2)}

Instruction: ${instruction}

Return ONLY the new content JSON object with the same keys.`
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/rewrite
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const guard = await requireSession(req)
  if (guard instanceof NextResponse) return guard

  // ── Rate limit ───────────────────────────────────────────────────────────
  const rl = checkRateLimit(`${guard.userId}:ai-rewrite`, { limit: 10, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait before rewriting again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: RewriteRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { pageId, blockId, instruction } = body

  if (!pageId?.trim())      return NextResponse.json({ ok: false, error: 'pageId is required' }, { status: 400 })
  if (!blockId?.trim())     return NextResponse.json({ ok: false, error: 'blockId is required' }, { status: 400 })
  if (!instruction?.trim()) return NextResponse.json({ ok: false, error: 'instruction is required' }, { status: 400 })

  // ── Load document ─────────────────────────────────────────────────────────
  const page = await documentRepository.load(pageId, guard.workspaceId)
  if (!page) {
    return NextResponse.json({ ok: false, error: 'Page not found' }, { status: 404 })
  }

  const block = findBlock(page as Page, blockId)
  if (!block) {
    return NextResponse.json({ ok: false, error: `Block "${blockId}" not found in page` }, { status: 404 })
  }

  // ── API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // ── Call Anthropic ────────────────────────────────────────────────────────
  logger.info('ai', 'rewrite-start', { userId: guard.userId, pageId, blockId, blockType: block.type })

  let rawResponse: string
  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  AbortSignal.timeout(20_000),
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     buildRewriteSystemPrompt(),
        messages:   [{ role: 'user', content: buildRewriteUserMessage(block, instruction.trim()) }],
      }),
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text().catch(() => '')
      return NextResponse.json(
        { ok: false, error: `Anthropic API ${anthropicRes.status}: ${errBody.slice(0, 200)}` },
        { status: 502 },
      )
    }

    const data = await anthropicRes.json()
    rawResponse = (data.content?.[0]?.text ?? '') as string
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, error: msg.includes('TimeoutError') ? 'AI request timed out.' : `AI request failed: ${msg}` },
      { status: 502 },
    )
  }

  if (!rawResponse.trim()) {
    return NextResponse.json({ ok: false, error: 'AI returned an empty response' }, { status: 502 })
  }

  // ── Parse and validate content JSON ─────────────────────────────────────
  let newContent: Record<string, unknown>
  try {
    // Strip markdown fences if present
    let text = rawResponse.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    // Extract first {...} object
    const start = text.indexOf('{')
    const end   = text.lastIndexOf('}')
    if (start === -1 || end === -1) {
      throw new Error('AI response does not contain a JSON object')
    }
    text = text.slice(start, end + 1)
    newContent = JSON.parse(text)

    if (typeof newContent !== 'object' || Array.isArray(newContent)) {
      throw new Error('AI returned non-object JSON')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('ai', 'rewrite-parse-error', { error: msg })
    return NextResponse.json({ ok: false, error: `Failed to parse AI response: ${msg}` }, { status: 422 })
  }

  // ── Validate key consistency (warn if keys changed) ──────────────────────
  const originalKeys = Object.keys(block.content as Record<string, unknown>)
  const newKeys      = Object.keys(newContent)
  const addedKeys    = newKeys.filter(k => !originalKeys.includes(k))
  const removedKeys  = originalKeys.filter(k => !newKeys.includes(k))
  const warning = addedKeys.length || removedKeys.length
    ? `Content keys changed — added: [${addedKeys.join(', ')}], removed: [${removedKeys.join(', ')}]`
    : undefined

  // ── Build UpdatePatch ────────────────────────────────────────────────────
  const patch: UpdatePatch = {
    op:     'update',
    target: 'block',
    id:     blockId,
    data:   { content: newContent },
    meta:   { source: 'ai' },
  }

  logger.info('ai', 'rewrite-success', { userId: guard.userId, blockId, blockType: block.type })

  return NextResponse.json({ ok: true, patch, warning } satisfies RewriteResponse)
}
