/**
 * ATELIER CMS — Page Quality Evaluation Route
 * POST /api/ai/evaluate
 *
 * Evaluates a page's structural quality across 7 dimensions:
 *   Empathy / Problem / Solution / Trust / Action / Clarity / Readability
 *
 * Each dimension receives:
 *   score: 0–100
 *   issue: one specific problem (never abstract)
 *   fix:   one concrete single-line fix
 *
 * Architecture contract:
 *   READ-ONLY. Never calls engine.enqueuePatch(). Never mutates anything.
 *   ABCDE signals from ABCDEAnalyzer are injected as context — they anchor
 *   AI scoring to measurable block-type energy rather than vague impressions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/apiGuards'
import { documentRepository }        from '@/core/persistence'
import { checkRateLimit }            from '@/lib/rateLimit'
import { logger }                    from '@/lib/logger'
import { analyzeDocument }           from '@/analysis/ABCDEAnalyzer'
import type { Page }                 from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface EvaluateRequest {
  pageId: string
}

export interface DimensionResult {
  score: number       // 0–100
  issue: string       // one specific problem
  fix:   string       // one concrete single-line fix
}

export interface EvaluateResponse {
  ok:          boolean
  scores?: {
    empathy:     DimensionResult
    problem:     DimensionResult
    solution:    DimensionResult
    trust:       DimensionResult
    action:      DimensionResult
    clarity:     DimensionResult
    readability: DimensionResult
  }
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a structural quality evaluator for web pages built with sections and blocks.

You evaluate page structure, clarity, and flow — NOT sales effectiveness or persuasion.
These pages may be landing pages, product pages, or informational pages. Do not assume the intent.

You will receive:
  1. The page structure (sections, blocks, content)
  2. ABCDE energy signals (C1=Action, C2=Trust/Relational, C3=Meaning, C4=Info, C5=Emotional)
     These signals reflect the block-type composition of the page.

Evaluate across exactly 7 dimensions:
  1. Empathy    — Is it clear who this page is for?
  2. Problem    — Is the problem or context clearly communicated?
  3. Solution   — Is what is being offered clearly communicated?
  4. Trust      — Does the page feel credible and coherent?
  5. Action     — Is the next step obvious?
  6. Clarity    — Can the whole page be understood in a single scan?
  7. Readability — Is the text easy to read? Is there unnecessary friction?

Rules:
1. Respond with ONLY a valid JSON object. No prose, no markdown fences, no explanation.
2. Each dimension must have: score (0–100), issue (one specific problem), fix (one concrete line).
3. issue and fix must reference actual page content — never be abstract.
4. fix must be a single actionable instruction, maximum 12 words.
5. If a dimension has no problem, set issue to "None" and fix to "No change needed".
6. Use ABCDE signals to inform scoring:
   - Low C2 → Trust may be weak
   - Low C1 → Action may be unclear
   - Low C4 → Solution/Problem detail may be thin
   - High imbalance → Clarity may suffer

Response shape (strict):
{
  "empathy":     { "score": 0-100, "issue": "...", "fix": "..." },
  "problem":     { "score": 0-100, "issue": "...", "fix": "..." },
  "solution":    { "score": 0-100, "issue": "...", "fix": "..." },
  "trust":       { "score": 0-100, "issue": "...", "fix": "..." },
  "action":      { "score": 0-100, "issue": "...", "fix": "..." },
  "clarity":     { "score": 0-100, "issue": "...", "fix": "..." },
  "readability": { "score": 0-100, "issue": "...", "fix": "..." }
}`

// ─────────────────────────────────────────────────────────────────────────────
// Page serialiser (same pattern as analyze route)
// ─────────────────────────────────────────────────────────────────────────────

function buildPageContext(page: Page): string {
  const sorted = [...page.sections].sort((a, b) => a.order - b.order)
  const abcde  = analyzeDocument(page)

  const lines: string[] = [
    `Page title: ${page.title || '(untitled)'}`,
    `Status: ${page.status}`,
    `Sections: ${sorted.length}`,
    `Total blocks: ${sorted.reduce((n, s) => n + s.blocks.length, 0)}`,
    '',
    '## ABCDE energy signals (normalised 0–1):',
    `C1 Action energy:       ${abcde.C1.toFixed(3)}`,
    `C2 Relational/Trust:    ${abcde.C2.toFixed(3)}`,
    `C3 Meaning/Story:       ${abcde.C3.toFixed(3)}`,
    `C4 Informational:       ${abcde.C4.toFixed(3)}`,
    `C5 Emotional/Visual:    ${abcde.C5.toFixed(3)}`,
    `Dominant dimension:     ${abcde.dominant ?? 'none'}`,
    `Balanced (±0.1 from mean): ${abcde.isBalanced}`,
    '',
    '## Page structure:',
  ]

  for (const section of sorted) {
    const blocks = [...section.blocks].sort((a, b) => a.order - b.order)
    lines.push(`\nSection [${section.type}]:`)
    for (const block of blocks) {
      const c = block.content as Record<string, unknown>
      let preview: string
      switch (block.type) {
        case 'hero':
          preview = c.title
            ? `title: "${String(c.title).slice(0, 80)}"` +
              (c.subtitle ? ` | subtitle: "${String(c.subtitle).slice(0, 60)}"` : '') +
              (c.buttonText ? ` | cta: "${c.buttonText}"` : '')
            : '(empty hero)'
          break
        case 'text':
          preview = c.text ? `"${String(c.text).slice(0, 120)}"` : '(empty text)'
          break
        case 'cta':
          preview = `headline: "${c.headline ?? ''}" | btn: "${c.primaryText ?? ''}"`
          break
        case 'faq':
          preview = `Q: "${String(c.question ?? '').slice(0, 80)}"`
          break
        case 'feature-list': {
          const features = (c.features as Array<{title?:string}>) ?? []
          preview = `${features.length} features: ${features.slice(0, 4).map(f => f.title ?? '').join(' / ')}`
          break
        }
        case 'image':
          preview = c.alt ? `alt: "${c.alt}"` : c.url ? '(image, no alt)' : '(empty image)'
          break
        case 'gallery':
          preview = `${((c.images as unknown[]) ?? []).length} images`
          break
        default:
          preview = JSON.stringify(c).slice(0, 80)
      }
      lines.push(`  [${block.type}] ${preview}`)
    }
  }

  if (page.seo) {
    const seo = page.seo as Record<string, unknown>
    lines.push('', '## SEO metadata:')
    lines.push(`  meta title:       ${seo.title       || '(missing)'}`)
    lines.push(`  meta description: ${seo.description || '(missing)'}`)
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parser
// ─────────────────────────────────────────────────────────────────────────────

const DIMENSIONS = ['empathy', 'problem', 'solution', 'trust', 'action', 'clarity', 'readability'] as const
type Dimension = typeof DIMENSIONS[number]

function parseDimension(raw: unknown): DimensionResult {
  if (!raw || typeof raw !== 'object') {
    return { score: 0, issue: 'Evaluation unavailable', fix: 'Retry evaluation' }
  }
  const r = raw as Record<string, unknown>
  const score = typeof r.score === 'number'
    ? Math.max(0, Math.min(100, Math.round(r.score)))
    : 0
  const issue = typeof r.issue === 'string' && r.issue.trim() ? r.issue.trim() : 'No issue identified'
  const fix   = typeof r.fix   === 'string' && r.fix.trim()   ? r.fix.trim()   : 'No change needed'
  return { score, issue, fix }
}

function parseEvaluation(raw: string): EvaluateResponse['scores'] | null {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || !parsed) return null

  const result = {} as Record<Dimension, DimensionResult>
  for (const dim of DIMENSIONS) {
    result[dim] = parseDimension(parsed[dim])
  }
  return result as EvaluateResponse['scores']
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai/evaluate
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const guard = await requireSession(req)
  if (guard instanceof NextResponse) return guard

  // ── Rate limit: 5 per minute (evaluation is expensive) ────────────────────
  const rl = checkRateLimit(`${guard.userId}:ai-evaluate`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please wait before evaluating again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: EvaluateRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { pageId } = body
  if (!pageId?.trim()) {
    return NextResponse.json({ ok: false, error: 'pageId is required' }, { status: 400 })
  }

  // ── Load page ─────────────────────────────────────────────────────────────
  const page = await documentRepository.load(pageId, guard.workspaceId)
  if (!page) {
    return NextResponse.json({ ok: false, error: 'Page not found' }, { status: 404 })
  }

  if ((page as Page).sections.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'Page has no content to evaluate',
    }, { status: 422 })
  }

  // ── API key ────────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  const userMessage = `${buildPageContext(page as Page)}\n\nEvaluate this page and return JSON following the schema in your instructions.`

  // ── Call Anthropic ─────────────────────────────────────────────────────────
  logger.info('ai', 'evaluate-start', { userId: guard.userId, pageId })

  let rawResponse: string
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  AbortSignal.timeout(30_000),
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      logger.error('ai', 'evaluate-api-error', { status: res.status })
      return NextResponse.json(
        { ok: false, error: `AI API ${res.status}: ${err.slice(0, 120)}` },
        { status: 502 },
      )
    }

    const data = await res.json()
    rawResponse = (data.content?.[0]?.text ?? '') as string
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isTimeout = msg.includes('TimeoutError') || msg.includes('timed out')
    logger.error('ai', isTimeout ? 'evaluate-timeout' : 'evaluate-error', { error: msg })
    return NextResponse.json({
      ok: false,
      error: isTimeout ? 'Evaluation timed out. Please try again.' : `Evaluation failed: ${msg}`,
    }, { status: 502 })
  }

  if (!rawResponse.trim()) {
    return NextResponse.json({ ok: false, error: 'AI returned empty response' }, { status: 502 })
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  const scores = parseEvaluation(rawResponse)
  if (!scores) {
    logger.warn('ai', 'evaluate-parse-error', { raw: rawResponse.slice(0, 200) })
    return NextResponse.json(
      { ok: false, error: 'Failed to parse evaluation response' },
      { status: 422 },
    )
  }

  logger.info('ai', 'evaluate-done', { userId: guard.userId, pageId })

  return NextResponse.json({ ok: true, scores } satisfies EvaluateResponse)
}
