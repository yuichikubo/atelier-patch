/**
 * ATELIER CMS — AI Patch Generator
 *
 * Translates user prompts into document patches using a language model.
 *
 * INVARIANT: AI never mutates the document directly.
 * Every AI-generated change flows through engine.enqueuePatch().
 *
 * Flow:
 *   prompt
 *     → PromptParser.parsePrompt()    build system + user message
 *       → LLM call                    returns raw JSON string
 *         → PatchBuilder.buildPatches()  validate → typed Patch[]
 *           → patchTransactionManager.run()
 *             → engine.enqueuePatch()  PatchEngine applies each patch
 *               → patchEventBus notifies subscribers
 */

import { engine }                    from '@/core/document/engineInstance'
import { patchTransactionManager }   from '@/core/patch/transaction'
import { patchEventBus }             from '@/core/patch/eventBus'
import type { Page }                 from '@/core/document/types'
import { parsePrompt }               from './PromptParser'
import { buildPatches }              from './PatchBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// Provider interface (swap models without changing the generator)
// ─────────────────────────────────────────────────────────────────────────────

export interface AIProvider {
  /**
   * Send a chat completion request and return the raw response text.
   * The implementation decides which model/endpoint to use.
   */
  complete(system: string, user: string): Promise<string>
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in providers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anthropic Claude provider.
 * Reads NEXT_PUBLIC_ANTHROPIC_API_KEY (client) or ANTHROPIC_API_KEY (server).
 */
export class AnthropicProvider implements AIProvider {
  private apiKey: string
  private model:  string

  constructor(apiKey?: string, model = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey
      ?? (typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY ?? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '' : '')
    this.model = model
  }

  async complete(system: string, user: string): Promise<string> {
    if (!this.apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      this.model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    return (data.content?.[0]?.text ?? '') as string
  }
}

/**
 * OpenAI provider.
 */
export class OpenAIProvider implements AIProvider {
  private apiKey: string
  private model:  string

  constructor(apiKey?: string, model = 'gpt-4o') {
    this.apiKey = apiKey
      ?? (typeof process !== 'undefined' ? process.env.OPENAI_API_KEY ?? '' : '')
    this.model = model
  }

  async complete(system: string, user: string): Promise<string> {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY not set')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:       this.model,
        max_tokens:  2048,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user },
        ],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    return (data.choices?.[0]?.message?.content ?? '') as string
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation result
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateResult {
  ok:            boolean
  /** Number of patches accepted and applied. */
  applied:       number
  /** Human-readable description of what was done. */
  summary:       string
  /** Any warnings or validation errors (non-fatal). */
  warnings:      string[]
  /** Fatal error message if ok is false. */
  error?:        string
  /** The new document version after applying patches. */
  version?:      number
}

// ─────────────────────────────────────────────────────────────────────────────
// AIPatchGenerator
// ─────────────────────────────────────────────────────────────────────────────

export class AIPatchGenerator {
  private provider: AIProvider

  constructor(provider: AIProvider) {
    this.provider = provider
  }

  /**
   * Generate and apply patches from a user prompt.
   *
   * 1. Parse the prompt into a structured AI request.
   * 2. Call the AI provider.
   * 3. Parse and validate the response into typed Patch[].
   * 4. Apply via patchTransactionManager (atomic — all succeed or none apply).
   * 5. Notify patchEventBus.
   *
   * @param prompt  Natural-language instruction from the user.
   * @returns       GenerateResult describing what was done.
   */
  async generate(prompt: string): Promise<GenerateResult> {
    // ── Signal thinking to bus (Stickman and other listeners react) ──────────
    patchEventBus.emit({ type: 'patch-applied', payload: { patchId: 'ai-thinking', op: 'thinking', target: 'document', version: engine.getVersion() }, context: { source: 'ai' } })

    const page = engine.getDocument() as Page

    // ── Step 1: build prompt context ─────────────────────────────────────────
    let parsed
    try {
      parsed = parsePrompt(prompt, page)
    } catch (e) {
      return this.fail('Failed to build prompt context', e)
    }

    // ── Step 2: call the AI ──────────────────────────────────────────────────
    let rawResponse: string
    try {
      rawResponse = await this.provider.complete(parsed.systemPrompt, parsed.userMessage)
    } catch (e) {
      return this.fail('AI provider call failed', e)
    }

    if (!rawResponse.trim()) {
      return this.fail('AI returned an empty response')
    }

    // ── Step 3: parse and validate patches ───────────────────────────────────
    const built = buildPatches(rawResponse)
    if (!built.ok || built.patches.length === 0) {
      return {
        ok:       false,
        applied:  0,
        summary:  'AI response could not be converted to valid patches',
        warnings: built.errors,
        error:    built.errors[0] ?? 'No valid patches',
      }
    }

    // ── Step 4: apply via transaction ────────────────────────────────────────
    const txResult = await patchTransactionManager.run(
      (tx) => {
        for (const patch of built.patches) {
          tx.add(patch)
        }
      },
      (patch) => engine.enqueuePatch(patch),
      (patchArray) => engine.applyPatchArray(patchArray),
      { label: `AI: ${prompt.slice(0, 60)}`, source: 'ai', strategy: 'batch' },
    )

    if (!txResult.ok) {
      return {
        ok:       false,
        applied:  txResult.applied,
        summary:  'Patches were generated but failed to apply',
        warnings: built.errors,
        error:    txResult.error ?? 'Transaction failed',
      }
    }

    // ── Step 5: notify bus ───────────────────────────────────────────────────
    patchEventBus.emit({
      type:    'document-changed',
      payload: { version: engine.getVersion(), changeCount: txResult.applied },
      context: { source: 'ai' },
    })

    return {
      ok:       true,
      applied:  txResult.applied,
      summary:  `Applied ${txResult.applied} patch${txResult.applied !== 1 ? 'es' : ''} — ${prompt.slice(0, 80)}`,
      warnings: built.errors,
      version:  engine.getVersion(),
    }
  }

  /** Helper: build a failed result with optional error capture. */
  private fail(summary: string, e?: unknown): GenerateResult {
    const error = e instanceof Error ? e.message : e ? String(e) : undefined
    return { ok: false, applied: 0, summary, warnings: [], error }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory
// ─────────────────────────────────────────────────────────────────────────────

let _instance: AIPatchGenerator | null = null

/**
 * Get or create the shared AIPatchGenerator instance.
 * Uses AnthropicProvider by default.
 * Pass a custom provider to switch models or use a different LLM.
 *
 * @example
 *   const ai = getAIPatchGenerator()
 *   const result = await ai.generate('Add a hero section with a blue background')
 *
 * @example — custom provider
 *   const ai = getAIPatchGenerator(new OpenAIProvider())
 *   await ai.generate('Add three feature blocks')
 */
export function getAIPatchGenerator(provider?: AIProvider): AIPatchGenerator {
  if (provider) {
    _instance = new AIPatchGenerator(provider)
  }
  if (!_instance) {
    _instance = new AIPatchGenerator(new AnthropicProvider())
  }
  return _instance
}
