/**
 * ATELIER CMS — AI Feedback Route
 * POST /api/ai/feedback
 *
 * Receives a user feedback event for an AI-generated patch set.
 * Persists to data/ai/feedback.jsonl (one JSON object per line).
 *
 * JSONL is used instead of JSON array to allow safe concurrent appends
 * — each line is an independent record that can be streamed for analysis.
 *
 * The data will be used to:
 *   • Fine-tune prompt quality over time
 *   • Identify patterns in rejected AI edits
 *   • Surface frequently-thumbed-down prompt categories
 */

import fs                from 'fs'
import path              from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { requireSession }            from '@/lib/apiGuards'

// ─────────────────────────────────────────────────────────────────────────────
// Data model
// ─────────────────────────────────────────────────────────────────────────────

export interface AIFeedbackEvent {
  /** Discriminant for future event types. */
  type:       'ai_feedback'

  /** The prompt the user submitted. */
  prompt:     string

  /** Number of patches that were applied. */
  patchCount: number

  /** Summary of patch operations for pattern analysis (no content data). */
  patchOps:   Array<{ op: string; target: string }>

  /** User rating. */
  rating:     'good' | 'bad'

  /** ISO 8601 timestamp. */
  timestamp:  string

  /** Page the edit was performed on. */
  pageId?:    string

  /** Document version at time of feedback (for correlation with timeline). */
  docVersion?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

const FEEDBACK_DIR  = path.join(process.cwd(), 'data', 'ai')
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, 'feedback.jsonl')

function appendFeedback(event: AIFeedbackEvent): void {
  if (!fs.existsSync(FEEDBACK_DIR)) {
    fs.mkdirSync(FEEDBACK_DIR, { recursive: true })
  }
  fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(event) + '\n', 'utf-8')
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req)
  if (guard instanceof NextResponse) return guard

  let body: Partial<AIFeedbackEvent>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { prompt, patchCount, patchOps, rating, pageId, docVersion } = body

  if (!prompt?.trim()) {
    return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 })
  }
  if (rating !== 'good' && rating !== 'bad') {
    return NextResponse.json({ ok: false, error: 'rating must be "good" or "bad"' }, { status: 400 })
  }

  const event: AIFeedbackEvent = {
    type:       'ai_feedback',
    prompt:     prompt.trim().slice(0, 500),   // cap stored prompt length
    patchCount: patchCount ?? 0,
    patchOps:   Array.isArray(patchOps) ? patchOps.slice(0, 50) : [],
    rating,
    timestamp:  new Date().toISOString(),
    pageId,
    docVersion,
  }

  try {
    appendFeedback(event)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: `Storage failed: ${msg}` }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET handler — return aggregate stats (safe for internal tooling)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSession(req)
  if (guard instanceof NextResponse) return guard

  if (!fs.existsSync(FEEDBACK_FILE)) {
    return NextResponse.json({ total: 0, good: 0, bad: 0, events: [] })
  }

  try {
    const lines = fs.readFileSync(FEEDBACK_FILE, 'utf-8')
      .split('\n')
      .filter(Boolean)

    const events: AIFeedbackEvent[] = lines.map(l => JSON.parse(l))
    const good  = events.filter(e => e.rating === 'good').length
    const bad   = events.filter(e => e.rating === 'bad').length

    return NextResponse.json({ total: events.length, good, bad, events: events.slice(-100) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed to read feedback' }, { status: 500 })
  }
}
