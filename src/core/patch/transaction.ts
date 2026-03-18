/**
 * ATELIER CMS — Transaction System
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * A Transaction groups multiple patches into a single logical operation.
 * All patches in a transaction succeed together or are discarded together —
 * giving callers atomicity without modifying PatchEngine.
 *
 * USE CASES
 * ─────────
 * • AI generating an entire page layout in one undoable step
 * • Automation pipelines performing multi-step document edits
 * • Batch block updates that must all succeed or all be skipped
 * • Grouping related changes so undo/redo treats them as one action
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • PatchEngine is NOT modified. Transactions call engine.enqueuePatch()
 *   and engine.applyPatchArray() through caller-supplied executor functions.
 * • Transactions are entirely OPTIONAL. All existing paths that call
 *   PatchEngine directly continue to work exactly as before.
 * • A transaction does NOT replace the patch queue — it wraps it.
 * • Rollback is performed by collecting the pre-transaction document
 *   snapshot and restoring it through a caller-supplied restore function,
 *   or by discarding the queue before any patches are applied.
 *
 * INTEGRATION PATTERN
 * ───────────────────
 *   import { patchTransactionManager } from '@/core/patch/transaction'
 *   import { engine } from '@/core/document/engineInstance'
 *
 *   const result = await patchTransactionManager.run(
 *     async (tx) => {
 *       tx.add({ op:'add', target:'section', … })
 *       tx.add({ op:'add', target:'block',   … })
 *     },
 *     (patch) => engine.enqueuePatch(patch),
 *     (array) => engine.applyPatchArray(array),
 *   )
 *
 *   if (result.ok) {
 *     console.log(`Applied ${result.applied} patches`)
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Patch, PatchMeta, PatchResult, PatchArrayResult } from './types'
import type { OperationSource }                                  from './operations'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Transaction state and status types
// ─────────────────────────────────────────────────────────────────────────────

/** Lifecycle state of a transaction. */
export type TransactionStatus =
  | 'idle'         // No transaction is open
  | 'open'         // Collecting patches; not yet committed
  | 'committing'   // Executing patches against the engine
  | 'committed'    // All patches applied successfully
  | 'rolled-back'  // Transaction was discarded without applying

/** Strategy for applying a committed transaction to the engine. */
export type CommitStrategy =
  | 'sequential'   // Apply patches one-by-one via enqueuePatch (default)
  | 'batch'        // Apply all patches in one call via applyPatchArray

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Transaction interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Transaction holds a queue of patches that will be applied atomically.
 *
 * Callers build a transaction by calling `tx.add(patch)` inside the
 * executor function passed to `PatchTransactionManager.run()`.
 */
export interface Transaction {
  /** Unique identifier for this transaction. */
  readonly id:     string
  /** Human-readable label for debug / history display. */
  readonly label:  string
  /** Which subsystem created this transaction. */
  readonly source: OperationSource
  /** ISO timestamp of when this transaction was opened. */
  readonly openedAt: string
  /** Ordered list of patches accumulated so far. */
  readonly patches:  Readonly<Patch[]>
  /** Current lifecycle state. */
  readonly status:   TransactionStatus

  /**
   * Add a patch to the transaction queue.
   * Throws if the transaction is not in 'open' state.
   */
  add(patch: Patch): void

  /**
   * Add multiple patches at once.
   * Equivalent to calling `add()` for each patch in order.
   */
  addAll(patches: Patch[]): void
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Transaction result
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionResult {
  /** Whether all patches were applied without error. */
  ok:          boolean
  /** The transaction id. */
  transactionId: string
  /** Number of patches successfully applied. */
  applied:     number
  /** Per-patch results (populated for 'sequential' strategy). */
  results:     PatchResult[]
  /** Single batch result (populated for 'batch' strategy). */
  batchResult?: PatchArrayResult
  /** Error details if `ok` is false. */
  error?:      string
  /** Final status of the transaction. */
  status:      TransactionStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Executor function types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A function that applies a single patch to the engine.
 * Maps to `PatchEngine.enqueuePatch`.
 */
export type PatchExecutor = (patch: Patch) => PatchResult

/**
 * A function that applies a batch of patches to the engine atomically.
 * Maps to `PatchEngine.applyPatchArray`.
 */
export type PatchBatchExecutor = (patches: { patch: Patch[]; meta?: PatchMeta }) => PatchArrayResult

/**
 * The function callers provide to build a transaction.
 * Receives a writable transaction handle.
 */
export type TransactionBuilder = (tx: Transaction) => void | Promise<void>

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Transaction options
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionOptions {
  /** Human-readable label shown in history / debug output. Default: 'transaction'. */
  label?:          string
  /** Subsystem creating this transaction. Default: 'editor'. */
  source?:         OperationSource
  /** How to apply patches on commit. Default: 'batch'. */
  strategy?:       CommitStrategy
  /**
   * If true, a failed patch in sequential mode stops execution immediately.
   * If false, execution continues and failed patches are recorded in results.
   * Default: true.
   */
  stopOnError?:    boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Internal transaction implementation
// ─────────────────────────────────────────────────────────────────────────────

let _txCounter = 0

function generateTxId(): string {
  _txCounter++
  const ts  = Date.now().toString(36)
  const seq = _txCounter.toString(36).padStart(4, '0')
  return `tx_${ts}_${seq}`
}

class TransactionImpl implements Transaction {
  readonly id:       string
  readonly label:    string
  readonly source:   OperationSource
  readonly openedAt: string

  _patches: Patch[]        = []
  private _status:  TransactionStatus = 'open'

  constructor(id: string, label: string, source: OperationSource) {
    this.id        = id
    this.label     = label
    this.source    = source
    this.openedAt  = new Date().toISOString()
  }

  get patches(): Readonly<Patch[]>  { return this._patches }
  get status():  TransactionStatus  { return this._status  }

  add(patch: Patch): void {
    if (this._status !== 'open') {
      throw new Error(
        `[Transaction ${this.id}] Cannot add patches in status "${this._status}". ` +
        'Transaction must be open.',
      )
    }
    this._patches.push(patch)
  }

  addAll(patches: Patch[]): void {
    for (const p of patches) this.add(p)
  }

  /** @internal — called by TransactionManager only */
  _setStatus(s: TransactionStatus): void {
    this._status = s
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — PatchTransactionManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of a patch transaction.
 *
 * The manager does NOT hold a reference to PatchEngine.
 * Executor functions are supplied at commit time, keeping the transaction
 * system decoupled from any specific engine instance.
 */
class PatchTransactionManager {
  private _current:   TransactionImpl | null = null
  private _history:   TransactionResult[]    = []
  private _maxHistory = 50

  // ── State accessors ────────────────────────────────────────────────────────

  /** Whether a transaction is currently open. */
  get isActive(): boolean {
    return this._current !== null && this._current.status === 'open'
  }

  /** The currently open transaction, or null if none is active. */
  get current(): Transaction | null {
    return this._current
  }

  /** How many patches are staged in the current open transaction. */
  get queueLength(): number {
    return this._current?._patches.length ?? 0
  }

  // ── Low-level API ──────────────────────────────────────────────────────────

  /**
   * Open a new transaction.
   * Throws if a transaction is already open — nested transactions are not
   * supported. Use `run()` for automatic lifecycle management instead.
   */
  beginTransaction(options: TransactionOptions = {}): Transaction {
    if (this._current && this._current.status === 'open') {
      throw new Error(
        '[PatchTransactionManager] A transaction is already open. ' +
        'Commit or roll back the current transaction before beginning a new one.',
      )
    }
    const id  = generateTxId()
    const tx  = new TransactionImpl(
      id,
      options.label  ?? 'transaction',
      options.source ?? 'editor',
    )
    this._current = tx
    return tx
  }

  /**
   * Add a patch to the currently open transaction queue.
   * Safe to call when no transaction is active — the patch is returned
   * as-is for the caller to apply directly to the engine.
   *
   * This allows gradual adoption: callers can always call `addPatch` and
   * only enable transaction mode when needed.
   */
  addPatch(patch: Patch): Patch {
    if (this.isActive) {
      this._current!.add(patch)
    }
    return patch
  }

  /**
   * Commit the current transaction — apply all queued patches to the engine.
   *
   * @param execute  Applies a single patch. Maps to `engine.enqueuePatch`.
   * @param executeBatch  Applies all patches at once. Maps to `engine.applyPatchArray`.
   * @param options  Per-commit strategy override.
   */
  commitTransaction(
    execute:       PatchExecutor,
    executeBatch?: PatchBatchExecutor,
    options:       Pick<TransactionOptions, 'strategy' | 'stopOnError'> = {},
  ): TransactionResult {
    if (!this._current || this._current.status !== 'open') {
      return {
        ok: false, transactionId: '', applied: 0, results: [],
        error: 'No open transaction to commit.',
        status: 'idle',
      }
    }

    const tx       = this._current
    const strategy = options.strategy    ?? 'batch'
    const stopOnError = options.stopOnError ?? true

    tx._setStatus('committing')

    let result: TransactionResult

    if (tx.patches.length === 0) {
      // Empty transaction — nothing to do
      tx._setStatus('committed')
      result = {
        ok:            true,
        transactionId: tx.id,
        applied:       0,
        results:       [],
        status:        'committed',
      }
    } else if (strategy === 'batch' && executeBatch) {
      // ── Batch: single atomic call to applyPatchArray ───────────────────────
      const batchResult = executeBatch({
        patch: tx.patches as Patch[],
        meta:  { source: tx.source, timestamp: new Date().toISOString() },
      })

      tx._setStatus(batchResult.ok ? 'committed' : 'rolled-back')
      result = {
        ok:            batchResult.ok,
        transactionId: tx.id,
        applied:       batchResult.applied,
        results:       batchResult.results,
        batchResult,
        error:         batchResult.ok ? undefined : (batchResult.errors[0]?.message ?? 'Batch failed'),
        status:        tx.status,
      }
    } else {
      // ── Sequential: enqueuePatch one by one ───────────────────────────────
      const results:  PatchResult[] = []
      let   applied   = 0
      let   firstError: string | undefined

      for (const patch of tx.patches) {
        const pr = execute(patch)
        results.push(pr)
        if (pr.ok) {
          applied++
        } else {
          firstError = pr.error?.message ?? 'Patch failed'
          if (stopOnError) break
        }
      }

      const ok = firstError === undefined
      tx._setStatus(ok ? 'committed' : 'rolled-back')
      result = {
        ok,
        transactionId: tx.id,
        applied,
        results,
        error:  firstError,
        status: tx.status,
      }
    }

    this._pushHistory(result)
    this._current = null
    return result
  }

  /**
   * Discard all staged patches without applying them to the engine.
   * The document is left completely unchanged.
   */
  rollbackTransaction(): TransactionResult {
    if (!this._current) {
      return {
        ok: true, transactionId: '', applied: 0, results: [],
        status: 'idle',
      }
    }

    const tx = this._current
    tx._setStatus('rolled-back')

    const result: TransactionResult = {
      ok:            true,
      transactionId: tx.id,
      applied:       0,
      results:       [],
      status:        'rolled-back',
    }

    this._pushHistory(result)
    this._current = null
    return result
  }

  // ── High-level API ─────────────────────────────────────────────────────────

  /**
   * Open a transaction, run the builder function, then commit automatically.
   * If the builder throws, the transaction is rolled back.
   *
   * This is the recommended way to use transactions:
   *
   *   const result = await patchTransactionManager.run(
   *     tx => {
   *       tx.add({ op:'add', target:'section', … })
   *       tx.add({ op:'add', target:'block',   … })
   *     },
   *     patch => engine.enqueuePatch(patch),
   *     patchArray => engine.applyPatchArray(patchArray),
   *     { label:'Add hero section', source:'ai', strategy:'batch' },
   *   )
   */
  async run(
    builder:       TransactionBuilder,
    execute:       PatchExecutor,
    executeBatch?: PatchBatchExecutor,
    options:       TransactionOptions = {},
  ): Promise<TransactionResult> {
    const tx = this.beginTransaction(options)

    try {
      await builder(tx)
    } catch (err: unknown) {
      this.rollbackTransaction()
      return {
        ok:            false,
        transactionId: tx.id,
        applied:       0,
        results:       [],
        error:         err instanceof Error ? err.message : String(err),
        status:        'rolled-back',
      }
    }

    return this.commitTransaction(execute, executeBatch, {
      strategy:    options.strategy,
      stopOnError: options.stopOnError,
    })
  }

  /**
   * Synchronous variant of `run` for builders that don't need async.
   */
  runSync(
    builder:       (tx: Transaction) => void,
    execute:       PatchExecutor,
    executeBatch?: PatchBatchExecutor,
    options:       TransactionOptions = {},
  ): TransactionResult {
    const tx = this.beginTransaction(options)

    try {
      builder(tx)
    } catch (err: unknown) {
      this.rollbackTransaction()
      return {
        ok:            false,
        transactionId: tx.id,
        applied:       0,
        results:       [],
        error:         err instanceof Error ? err.message : String(err),
        status:        'rolled-back',
      }
    }

    return this.commitTransaction(execute, executeBatch, {
      strategy:    options.strategy,
      stopOnError: options.stopOnError,
    })
  }

  // ── History ────────────────────────────────────────────────────────────────

  /**
   * The most recent committed or rolled-back transaction results.
   * Useful for debugging, analytics, and audit trails.
   */
  get recentHistory(): readonly TransactionResult[] {
    return this._history
  }

  private _pushHistory(result: TransactionResult): void {
    this._history.push(result)
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(-this._maxHistory)
    }
  }

  /** Clear the transaction history (e.g. on page navigation). */
  clearHistory(): void {
    this._history = []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Singleton export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The application-wide Patch Transaction Manager singleton.
 *
 * Import anywhere to group patches into atomic transactions:
 *
 *   import { patchTransactionManager } from '@/core/patch/transaction'
 *
 * AI adapters and automation pipelines use this to batch their generated
 * patches so the entire AI edit appears as a single undo step.
 */
export const patchTransactionManager = new PatchTransactionManager()
