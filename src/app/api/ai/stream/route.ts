/**
 * ATELIER CMS — AI Streaming Route
 * POST /api/ai/stream
 *
 * Streams validated Patch objects as Server-Sent Events.
 * Each event contains one validated Patch object.
 * The client applies them progressively via engine.applyStreamPatch().
 *
 * Protocol:
 *   data: {"op":"add","target":"section",...}\n\n   ← one patch per event
 *   data: [DONE]\n\n                                  ← stream complete
 *   data: {"error":"..."}\n\n                          ← fatal error, abort
 *
 * The client must call engine.commitStream() on [DONE]
 * or engine.abortStream() on error — keeping history atomic.
 */

import { NextRequest }      from 'next/server'
import { requireSession }   from '@/lib/apiGuards'
import { documentRepository } from '@/core/persistence'
import { parsePrompt }      from '@/extensions/ai/PromptParser'
import { normaliseSinglePatch } from '@/extensions/ai/PatchBuilder'
import { validatePatch }    from '@/core/patch/validation'
import { checkRateLimit }   from '@/lib/rateLimit'
import { logger }           from '@/lib/logger'
import type { Page }        from '@/core/document/types'

// ─────────────────────────────────────────────────────────────────────────────
// Request shape
// ─────────────────────────────────────────────────────────────────────────────

interface StreamRequest {
  prompt:           string
  pageId:           string
  selectedBlockId?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE helpers
// ─────────────────────────────────────────────────────────────────────────────

function sseEvent(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`)
}

function ssePatch(patch: unknown): Uint8Array {
  return sseEvent(JSON.stringify(patch))
}

function sseDone(): Uint8Array {
  return sseEvent('[DONE]')
}

function sseError(message: string): Uint8Array {
  return sseEvent(JSON.stringify({ error: message }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming JSON patch extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a partial JSON array fragment into complete patch objects.
 * Returns { patches: valid[], remaining: unparsed_tail }.
 *
 * As Anthropic streams tokens, we accumulate them and extract
 * complete JSON objects as soon as their closing brace is detected.
 */
function extractCompletePatchObjects(buffer: string): { patches: unknown[]; remaining: string } {
  const patches: unknown[] = []
  let pos     = 0
  const text  = buffer.trimStart()

  // Skip leading [ or ,
  let i = 0
  while (i < text.length && (text[i] === '[' || text[i] === ',' || text[i] === ' ' || text[i] === '\n')) i++

  pos = i
  while (pos < text.length) {
    if (text[pos] !== '{') { pos++; continue }

    // Find matching closing brace
    let depth  = 0
    let inStr  = false
    let escape = false
    let end    = -1

    for (let j = pos; j < text.length; j++) {
      const ch = text[j]
      if (escape)          { escape = false; continue }
      if (ch === '\\')     { escape = true;  continue }
      if (ch === '"')      { inStr = !inStr; continue }
      if (inStr)           continue
      if (ch === '{')      depth++
      else if (ch === '}') { depth--; if (depth === 0) { end = j; break } }
    }

    if (end === -1) break   // Incomplete object — wait for more tokens

    const objStr = text.slice(pos, end + 1)
    try {
      const obj = JSON.parse(objStr)
      patches.push(obj)
    } catch { /* malformed — skip */ }

    pos = end + 1
  }

  return { patches, remaining: text.slice(pos) }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSession(req)
  if (guard instanceof Response) return guard

  // ── Rate limit: 5 requests per minute per user ──────────────────────────────
  const rl = checkRateLimit(`${guard.userId}:ai-stream`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) {
    logger.warn('ai', 'stream-rate-limited', { userId: guard.userId, retryAfter: rl.retryAfter })
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please wait before generating again.' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) } },
    )
  }

  let body: StreamRequest
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const { prompt, pageId, selectedBlockId = null } = body
  if (!prompt?.trim())   return new Response('prompt required', { status: 400 })
  if (!pageId?.trim())   return new Response('pageId required', { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response('ANTHROPIC_API_KEY not configured', { status: 500 })

  const page = await documentRepository.load(pageId, guard.workspaceId)
  if (!page) return new Response('Page not found', { status: 404 })

  let parsed
  try {
    parsed = parsePrompt(prompt.trim(), page as Page, { selectedBlockId })
  } catch (e) {
    return new Response(`Prompt parse failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }

  // ── Call Anthropic with stream: true ─────────────────────────────────────
  logger.info('ai', 'stream-start', { userId: guard.userId, pageId })
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model:      process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      stream:     true,
      system:     parsed.systemPrompt,
      messages:   [{ role: 'user', content: parsed.userMessage }],
    }),
  })

  if (!anthropicRes.ok || !anthropicRes.body) {
    const err = await anthropicRes.text().catch(() => '')
    return new Response(JSON.stringify({ error: `Anthropic ${anthropicRes.status}: ${err.slice(0, 200)}` }), { status: 502 })
  }

  // ── Transform Anthropic SSE → patch SSE ──────────────────────────────────
  const MAX_PATCHES   = 20
  const reader        = anthropicRes.body.getReader()
  const decoder       = new TextDecoder()
  let   textBuffer    = ''       // accumulates AI text tokens
  let   patchCount    = 0
  let   rejected      = 0

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Parse Anthropic SSE events
          const chunk  = decoder.decode(value, { stream: true })
          const events = chunk.split('\n')

          for (const line of events) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue

            let evt: Record<string, unknown>
            try { evt = JSON.parse(raw) } catch { continue }

            // Extract text deltas from Anthropic streaming format
            if (evt.type === 'content_block_delta') {
              const delta = (evt as any).delta
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                textBuffer += delta.text

                // Try to extract complete patch objects from the accumulating buffer
                const { patches: rawPatches, remaining } = extractCompletePatchObjects(textBuffer)
                textBuffer = remaining

                for (const rawPatch of rawPatches) {
                  if (patchCount >= MAX_PATCHES) continue

                  // Normalise and validate
                  const normalised = normaliseSinglePatch(rawPatch)
                  if (!normalised) {
                    rejected++
                    continue
                  }

                  const validation = validatePatch(normalised)
                  if (!validation.valid) {
                    // Validation failure: signal client to abort
                    controller.enqueue(sseError(`Patch[${patchCount}]: ${validation.errors[0]?.message}`))
                    controller.enqueue(sseDone())
                    controller.close()
                    return
                  }

                  controller.enqueue(ssePatch(normalised))
                  patchCount++
                }
              }
            }

            // Stream error from Anthropic
            if (evt.type === 'error') {
              controller.enqueue(sseError((evt as any).error?.message ?? 'AI stream error'))
              controller.enqueue(sseDone())
              controller.close()
              return
            }
          }
        }

        // Final flush: try to extract any remaining complete patches
        if (textBuffer.trim()) {
          const { patches: finalPatches } = extractCompletePatchObjects(textBuffer)
          for (const rawPatch of finalPatches) {
            if (patchCount >= MAX_PATCHES) break
            const normalised = normaliseSinglePatch(rawPatch)
            if (!normalised) continue
            const validation = validatePatch(normalised)
            if (!validation.valid) continue
            controller.enqueue(ssePatch(normalised))
            patchCount++
          }
        }

        controller.enqueue(sseDone())
        controller.close()
      } catch (e) {
        controller.enqueue(sseError(e instanceof Error ? e.message : String(e)))
        controller.enqueue(sseDone())
        controller.close()
      }
    },

    cancel() {
      reader.cancel()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
