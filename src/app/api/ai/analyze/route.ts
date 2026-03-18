/**
 * ATELIER CMS — AI Analyze Route
 * POST /api/ai/analyze
 *
 * Asks the AI to analyze the full page structure and return human-readable
 * improvement suggestions.
 *
 * Unlike the SuggestionEngine (rule-based), this route uses LLM reasoning
 * to detect nuanced structural, copy, and conversion issues.
 *
 * Response:
 *   { ok, suggestions: AISuggestion[], summary }
 *
 * Architecture:
 *   This route NEVER modifies the document.
 *   Suggestions are plain text — the user decides whether to act on them.
 *   If the user accepts, they use the AI Editing panel to apply changes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'
import { checkRateLimit }            from '@/lib/rateLimit'
import { logger }                    from '@/lib/logger'
import type { Page }                 from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Request / response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  pageId: string
  focus?: 'structure' | 'copy' | 'conversion' | 'seo' | 'all'
}

export interface AISuggestion {
  /** Category of the suggestion */
  category:    'structure' | 'copy' | 'conversion' | 'seo'
  /** Short title */
  title:       string
  /** Detailed explanation */
  description: string
  /** How critical this is */
  priority:    'high' | 'medium' | 'low'
  /** Optional: the block or section this suggestion targets */
  targetHint?: string
}

export interface AnalyzeResponse {
  ok:          boolean
  suggestions: AISuggestion[]
  summary:     string
  error?:      string
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────────────────────────────────

function buildAnalyzeSystemPrompt(): string {
  return `You are an expert landing page analyst specializing in conversion optimization and UX.

Your job is to analyze a page structure and return actionable improvement suggestions as JSON.

Rules:
1. Respond with ONLY a valid JSON object. No prose, no markdown, no explanation.
2. Return up to 7 suggestions maximum.
3. Be specific — reference actual content from the page.
4. Prioritize conversion impact.
5. The response must match this exact shape:
{
  "summary": "<2-sentence overall assessment>",
  "suggestions": [
    {
      "category": "structure" | "copy" | "conversion" | "seo",
      "title": "<short title>",
      "description": "<specific, actionable description>",
      "priority": "high" | "medium" | "low",
      "targetHint": "<optional: section or block reference>"
    }
  ]
}`
}

function buildPageSummary(page: Page): string {
  const sorted = [...page.sections].sort((a, b) => a.order - b.order)
  const lines: string[] = [
    `Page title: ${page.title || '(untitled)'}`,
    `Status: ${page.status}`,
    `Total sections: ${sorted.length}`,
    `Total blocks: ${sorted.reduce((n, s) => n + s.blocks.length, 0)}`,
    '',
    '## Page structure:',
  ]

  for (const section of sorted) {
    const sortedBlocks = [...section.blocks].sort((a, b) => a.order - b.order)
    lines.push(`\nSection [${section.type}] (id: ${section.id}):`)
    for (const block of sortedBlocks) {
      const content = block.content as Record<string, unknown>
      // Include the most important content field for each block type
      const preview = (() => {
        switch (block.type) {
          case 'hero':         return content.title        ? `title: "${String(content.title).slice(0, 60)}"` : '(empty title)'
          case 'text':         return content.text         ? `"${String(content.text).slice(0, 60)}"` : '(empty text)'
          case 'cta':          return content.headline     ? `headline: "${String(content.headline).slice(0, 60)}"` : `btn: "${content.primaryText}"`
          case 'faq':          return content.question     ? `Q: "${String(content.question).slice(0, 60)}"` : '(empty question)'
          case 'feature-list': {
            const features = (content.features as any[]) ?? []
            return `${features.length} features: ${features.slice(0, 3).map((f: any) => f.title).join(', ')}`
          }
          case 'image':        return content.url          ? `img: ${String(content.url).slice(0, 60)}` : '(no image)'
          case 'gallery':      return `${((content.images as any[]) ?? []).length} images`
          default:             return JSON.stringify(content).slice(0, 80)
        }
      })()
      lines.push(`  Block [${block.type}] (id: ${block.id}): ${preview}`)
    }
  }

  if (page.seo) {
    const seo = page.seo as Record<string, unknown>
    lines.push('')
    lines.push('## SEO:')
    lines.push(`  meta title: ${seo.title || '(missing)'}`)
    lines.push(`  meta description: ${seo.description || '(missing)'}`)
  }

  return lines.join('\n')
}

function buildAnalyzeUserMessage(page: Page, focus: string): string {
  return `${buildPageSummary(page)}

Focus area: ${focus === 'all' ? 'overall analysis (structure, copy, conversion, seo)' : focus}

Analyze this page and return JSON suggestions following the schema in your instructions.`
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/analyze
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const guard = await requireSession(req)
  if (guard instanceof NextResponse) return guard

  // ── Rate limit ───────────────────────────────────────────────────────────
  const rl = checkRateLimit(`${guard.userId}:ai-analyze`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, suggestions: [], summary: '', error: 'Too many requests. Please wait.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: AnalyzeRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, suggestions: [], summary: '', error: 'Invalid JSON body' }, { status: 400 })
  }

  const { pageId, focus = 'all' } = body

  if (!pageId?.trim()) {
    return NextResponse.json({ ok: false, suggestions: [], summary: '', error: 'pageId is required' }, { status: 400 })
  }

  // ── Load document ─────────────────────────────────────────────────────────
  const page = await documentRepository.load(pageId, guard.workspaceId)
  if (!page) {
    return NextResponse.json({ ok: false, suggestions: [], summary: '', error: 'Page not found' }, { status: 404 })
  }

  if ((page as Page).sections.length === 0) {
    return NextResponse.json({
      ok:          true,
      suggestions: [{
        category:    'structure',
        title:       'Page is empty',
        description: 'Add a Hero section to establish the primary message of this page.',
        priority:    'high',
      }],
      summary: 'This page has no content yet. Start by adding a Hero section.',
    } satisfies AnalyzeResponse)
  }

  // ── API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, suggestions: [], summary: '', error: 'ANTHROPIC_API_KEY not configured' },
      { status: 500 },
    )
  }

  // ── Call Anthropic ────────────────────────────────────────────────────────
  logger.info('ai', 'analyze-start', { userId: guard.userId, pageId, focus })

  let rawResponse: string
  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  AbortSignal.timeout(25_000),
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system:     buildAnalyzeSystemPrompt(),
        messages:   [{ role: 'user', content: buildAnalyzeUserMessage(page as Page, focus) }],
      }),
    })

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text().catch(() => '')
      return NextResponse.json(
        { ok: false, suggestions: [], summary: '', error: `Anthropic API ${anthropicRes.status}: ${errBody.slice(0, 200)}` },
        { status: 502 },
      )
    }

    const data = await anthropicRes.json()
    rawResponse = (data.content?.[0]?.text ?? '') as string
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { ok: false, suggestions: [], summary: '', error: msg.includes('TimeoutError') ? 'AI request timed out.' : `AI request failed: ${msg}` },
      { status: 502 },
    )
  }

  if (!rawResponse.trim()) {
    return NextResponse.json(
      { ok: false, suggestions: [], summary: '', error: 'AI returned an empty response' },
      { status: 502 },
    )
  }

  // ── Parse response ────────────────────────────────────────────────────────
  let result: { summary: string; suggestions: AISuggestion[] }
  try {
    let text = rawResponse.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const start = text.indexOf('{')
    const end   = text.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('No JSON object found')
    text = text.slice(start, end + 1)

    const parsed = JSON.parse(text)
    if (!parsed.suggestions || !Array.isArray(parsed.suggestions)) {
      throw new Error('Missing "suggestions" array in response')
    }

    // Sanitize suggestions
    const suggestions: AISuggestion[] = parsed.suggestions
      .slice(0, 7)
      .filter((s: any) => s.title && s.description)
      .map((s: any) => ({
        category:    ['structure', 'copy', 'conversion', 'seo'].includes(s.category) ? s.category : 'structure',
        title:       String(s.title).slice(0, 80),
        description: String(s.description).slice(0, 300),
        priority:    ['high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
        targetHint:  s.targetHint ? String(s.targetHint).slice(0, 100) : undefined,
      }))

    result = {
      summary:     String(parsed.summary || '').slice(0, 300),
      suggestions,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('ai', 'analyze-parse-error', { error: msg })
    return NextResponse.json(
      { ok: false, suggestions: [], summary: '', error: `Failed to parse AI analysis: ${msg}` },
      { status: 422 },
    )
  }

  logger.info('ai', 'analyze-success', {
    userId: guard.userId,
    pageId,
    suggestionCount: result.suggestions.length,
  })

  return NextResponse.json({
    ok:          true,
    suggestions: result.suggestions,
    summary:     result.summary,
  } satisfies AnalyzeResponse)
}
