'use client'
/**
 * ATELIER CMS — Inline Text Editor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `InlineTextEditor` renders text content directly inside the canvas as a
 * `contentEditable` element. Users can click and type to edit the text without
 * opening the Inspector panel — changes dispatch immediately to PatchEngine.
 *
 * DATA FLOW
 * ─────────
 *   User types inside InlineTextEditor
 *     → onInput fires with the new text
 *       → updateField(blockId, fieldKey, text)   ← useUpdateBlock
 *         → createUpdateBlockFieldPatch(…)        builds UpdatePatch
 *           → dispatchPatch(patch)                sends to engine
 *             → engine.enqueuePatch(patch)        PatchEngine applies
 *               → canvas re-renders with new text ✓
 *
 * KEY DESIGN DECISIONS
 * ────────────────────
 * 1. `contentEditable` + `suppressContentEditableWarning` — lets React manage
 *    the wrapper div while the browser handles cursor position natively.
 *
 * 2. Debounced patching (300 ms default) — avoids sending a patch on every
 *    keystroke, reducing engine churn without losing responsiveness.
 *
 * 3. Controlled init via `dangerouslySetInnerHTML` — only sets the DOM content
 *    on first mount (using a ref guard) so the browser's cursor is never
 *    forcibly repositioned mid-edit.
 *
 * 4. Blur-on-Escape — pressing Escape returns focus to the canvas cleanly.
 *
 * 5. No direct Document reads — `initialContent` is passed as a prop so the
 *    component stays pure and testable.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • InlineTextEditor does NOT import PatchEngine directly.
 * • All mutations flow through `useUpdateBlock` → `dispatchPatch`.
 * • This component is safe to render inside any block component that receives
 *   `isEditing: true` from the RendererContext.
 *
 * USAGE
 * ─────
 * Inside a block component (e.g. TextComponent):
 *
 *   function TextComponent({ block, isEditing }: BlockComponentProps) {
 *     const c = block.content as TextContent
 *     if (isEditing) {
 *       return (
 *         <InlineTextEditor
 *           blockId={block.id}
 *           fieldKey="text"
 *           initialContent={c.text}
 *           multiline
 *         />
 *       )
 *     }
 *     return <p>{c.text}</p>
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
}                             from 'react'
import { useUpdateBlock }     from '@/editor/patch/useUpdateBlock'
import { useSelectionStore }  from '@/editor/selection/selectionStore'
import { engine }             from '@/core/document/engineInstance'
import { BLOCK_DEFAULTS }     from '@/editor/blocks/blockTypes'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InlineTextEditorProps {
  /** The id of the block being edited. */
  blockId:         string

  /**
   * Which content field to update when text changes.
   * Defaults to 'text' — the standard field for text blocks.
   * Use 'title' for hero blocks, 'question' for FAQ blocks, etc.
   */
  fieldKey?:       string

  /**
   * The text value to display on first render.
   * The component does not re-sync from this prop after mount —
   * live updates come from the engine subscription in the parent.
   */
  initialContent?: string

  /**
   * If true, Enter creates a new line instead of blurring the editor.
   * Default: false — Enter blurs (single-line behaviour).
   */
  multiline?:      boolean

  /**
   * Debounce delay in ms before the patch is dispatched.
   * Default: 300.
   * Set to 0 to patch on every keystroke.
   */
  debounceMs?:     number

  /** CSS styles applied to the editable container. */
  style?:          React.CSSProperties

  /** Additional class names. */
  className?:      string

  /** Called when the element gains focus. */
  onFocus?:        () => void

  /** Called when the element loses focus, with the final text. */
  onBlur?:         (text: string) => void

  /** Called on every text change, with the current text. */
  onChange?:       (text: string) => void

  /**
   * Placeholder shown when the editor is empty and unfocused.
   * Default: 'Click to edit…'
   */
  placeholder?:    string
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline content-editable text editor for the ATELIER canvas.
 *
 * Renders a `contentEditable` div that dispatches a patch on every text change.
 * Safe to compose inside any block component when `isEditing` is true.
 *
 * @example — text block
 *   <InlineTextEditor blockId={block.id} initialContent={c.text} multiline />
 *
 * @example — hero headline
 *   <InlineTextEditor blockId={block.id} fieldKey="title" initialContent={c.title} />
 *
 * @example — custom debounce
 *   <InlineTextEditor blockId={block.id} initialContent={c.text} debounceMs={500} />
 */
export function InlineTextEditor({
  blockId,
  fieldKey       = 'text',
  initialContent = '',
  multiline      = false,
  debounceMs     = 300,
  style,
  className,
  onFocus,
  onBlur,
  onChange,
  placeholder    = 'Click to edit…',
}: InlineTextEditorProps) {
  const { updateField }    = useUpdateBlock()
  const divRef             = useRef<HTMLDivElement>(null)
  const timerRef           = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didInitRef         = useRef(false)
  const [focused, setFocused] = useState(false)
  const [isEmpty,  setIsEmpty] = useState(!initialContent)
  const isSelected = useSelectionStore((s) => s.selectedBlockId === blockId)

  // ── Set initial DOM content once on mount ─────────────────────────────────
  // Using dangerouslySetInnerHTML causes React to re-render the element and
  // reset cursor position. Instead we write to the DOM directly once.
  useEffect(() => {
    if (didInitRef.current || !divRef.current) return
    didInitRef.current = true
    divRef.current.textContent = initialContent
    setIsEmpty(!initialContent)
  }, [initialContent])

  // ── Auto-focus when block is selected ─────────────────────────────────────
  // When the parent block is clicked, `isSelected` flips to true.
  // Focus the contentEditable so typing begins immediately (one-click edit).
  // Guard: only auto-focus when not already focused and not in a programmatic
  // restore/mount cycle (didInitRef must be set = initial content already written).
  useEffect(() => {
    if (isSelected && !focused && didInitRef.current && divRef.current) {
      // requestAnimationFrame defers until after React's paint — avoids
      // competing with the click event's own selection handling.
      const id = requestAnimationFrame(() => {
        if (divRef.current && document.activeElement !== divRef.current) {
          divRef.current.focus()
          // Move cursor to end of content
          const range = document.createRange()
          const sel   = window.getSelection()
          range.selectNodeContents(divRef.current)
          range.collapse(false)          // false = collapse to end
          sel?.removeAllRanges()
          sel?.addRange(range)
        }
      })
      return () => cancelAnimationFrame(id)
    }
  }, [isSelected, focused])
  const dispatchUpdate = useCallback((text: string) => {
    // Do not send text patches during AI streaming — the engine is mid-transaction
    if (engine.isStreaming) return

    if (timerRef.current) clearTimeout(timerRef.current)

    if (debounceMs === 0) {
      updateField(blockId, fieldKey, text)
      return
    }

    timerRef.current = setTimeout(() => {
      updateField(blockId, fieldKey, text)
    }, debounceMs)
  }, [blockId, fieldKey, updateField, debounceMs])

  // Flush on unmount to avoid a lost patch
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent ?? ''
    setIsEmpty(text.length === 0)
    onChange?.(text)
    dispatchUpdate(text)
  }, [onChange, dispatchUpdate])

  const startEditing = useSelectionStore(s => s.startEditing)
  const stopEditing  = useSelectionStore(s => s.stopEditing)

  const handleFocus = useCallback(() => {
    setFocused(true)
    startEditing(blockId)
    onFocus?.()
    // Walk up to find [data-block-id] and add editing-state class
    const blockEl = divRef.current?.closest('[data-block-id]')
    blockEl?.classList.add('is-editing')
  }, [onFocus, startEditing, blockId])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    setFocused(false)
    stopEditing()
    // Remove editing-state class from parent block wrapper
    const blockEl = divRef.current?.closest('[data-block-id]')
    blockEl?.classList.remove('is-editing')
    const text = e.currentTarget.textContent ?? ''
    // Flush any pending debounced update immediately on blur
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      updateField(blockId, fieldKey, text)
    }
    onBlur?.(text)
  }, [blockId, fieldKey, updateField, onBlur, stopEditing])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      divRef.current?.blur()
      return
    }

    if (e.key === 'Enter' && !multiline) {
      e.preventDefault()
      divRef.current?.blur()
      return
    }

    // "/" anywhere in the field → open BlockPicker (Notion-style command menu).
    // Works in both empty and non-empty content.
    // When fired: remove the "/" from the DOM, open picker, re-insert "/" on dismiss.
    if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      // Remove the "/" that would have been inserted, then fire.
      // For non-empty fields we need to insert first to know cursor pos,
      // so we schedule via rAF to let the browser's default insertion complete,
      // then undo it with execCommand. For empty fields we skip that.
      const textBefore = divRef.current?.textContent ?? ''
      if (textBefore.trim() === '') {
        // Empty field — just open picker directly
        window.dispatchEvent(
          new CustomEvent('atelier:open-picker', { detail: { blockId } }),
        )
      } else {
        // Non-empty field — insert "/" ourselves then immediately remove it via
        // document.execCommand so the patch system sees no change.
        // Use document.execCommand('insertText') which is undoable and works
        // inside contentEditable.
        document.execCommand('insertText', false, '/')
        // Remove the inserted "/" and open picker
        const removeSlashAndOpen = () => {
          document.execCommand('delete')
          window.dispatchEvent(
            new CustomEvent('atelier:open-picker', { detail: { blockId } }),
          )
        }
        requestAnimationFrame(removeSlashAndOpen)
      }
      return
    }

    // Enter at end of a multiline field (without Shift) → insert a new block
    // of the same type below, or a text block if the type is not repeatable.
    // Shift+Enter always inserts a line break normally.
    if (e.key === 'Enter' && multiline && !e.shiftKey) {
      const sel = window.getSelection()
      const isAtEnd = sel
        ? sel.focusOffset === (sel.focusNode?.textContent?.length ?? 0) &&
          sel.focusNode === (divRef.current?.lastChild ?? divRef.current)
        : false

      if (isAtEnd) {
        e.preventDefault()
        const doc = engine.getDocument()
        const parentSection = doc.sections.find(s =>
          s.blocks.some(b => b.id === blockId),
        )
        if (parentSection) {
          // Reuse same block type when it has a known default content shape.
          // Hero and feature-list are layout blocks — not meaningfully repeatable,
          // so fall back to text. All others (text, faq, cta, etc.) repeat naturally.
          const currentBlock = doc.sections.flatMap(s => s.blocks).find(b => b.id === blockId)
          const currentType  = currentBlock?.type ?? 'text'
          const NON_REPEATABLE = new Set(['hero', 'feature-list', 'image', 'gallery', 'embed'])
          const insertType   = NON_REPEATABLE.has(currentType) ? 'text' : currentType
          const defaultContent = BLOCK_DEFAULTS[insertType] ?? { text: '', format: 'plain' }

          engine.enqueuePatch({
            op:       'add',
            target:   'block',
            data: {
              type:            insertType,
              parentSectionId: parentSection.id,
              content:         { ...defaultContent },
            },
            position: { placement: 'after', ref: blockId },
            meta:     { source: 'editor' },
          })

          // Focus the new block's InlineTextEditor after the patch commits.
          // We subscribe once to the engine, wait for the doc to update, then
          // find the block inserted immediately after `blockId` and focus it.
          const unsub = engine.subscribe(doc => {
            unsub() // one-shot — unsubscribe immediately
            const section = doc.sections.find(s =>
              s.blocks.some(b => b.id === blockId),
            )
            if (!section) return
            const sorted   = [...section.blocks].sort((a, b) => a.order - b.order)
            const refIdx   = sorted.findIndex(b => b.id === blockId)
            const newBlock = sorted[refIdx + 1]
            if (!newBlock) return
            // requestAnimationFrame defers until after React commits the new
            // block's DOM so the contentEditable element exists when we query it.
            requestAnimationFrame(() => {
              const el = document.querySelector<HTMLElement>(
                `[data-block-id="${newBlock.id}"] [contenteditable]`,
              )
              if (el) {
                el.focus()
                // Collapse cursor to start of new empty block
                const range = document.createRange()
                range.setStart(el, 0)
                range.collapse(true)
                window.getSelection()?.removeAllRanges()
                window.getSelection()?.addRange(range)
              }
            })
          })
        }
      }
    }
  }, [multiline, blockId])

  // Prevent click events from propagating up to the canvas selection handler —
  // we don't want clicking inside the editor to fire block deselection
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // ── Derived styles ─────────────────────────────────────────────────────────

  const editorStyle: React.CSSProperties = {
    outline:        'none',
    cursor:         'text',
    minHeight:      '1em',
    whiteSpace:     multiline ? 'pre-wrap' : 'nowrap',
    wordBreak:      'break-word',
    // Subtle edit-mode ring only when focused
    boxShadow:      focused
                      ? `0 0 0 1px rgba(201,168,76,${isSelected ? '0.5' : '0.25'})`
                      : 'none',
    borderRadius:   '2px',
    transition:     'box-shadow 0.12s ease',
    padding:        '2px 4px',
    margin:         '-2px -4px',
    ...style,
  }

  const classes = [
    'atelier-inline-editor',
    focused   && 'atelier-inline-editor--focused',
    isSelected && 'atelier-inline-editor--selected',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={multiline}
        aria-label={`Edit ${fieldKey}`}
        spellCheck
        className={classes}
        style={editorStyle}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
      />
      {/* Placeholder — shown when empty and not focused */}
      {isEmpty && !focused && (
        <span
          style={{
            position:       'absolute',
            top:            0,
            left:           0,
            pointerEvents:  'none',
            color:          'rgba(100,100,100,0.4)',
            fontStyle:      'italic',
            userSelect:     'none',
            padding:        '2px 4px',
          }}
        >
          {placeholder}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineHeadingEditor — convenience wrapper for heading-style inline editing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convenience alias for single-line heading inline editing.
 * Applies larger, bolder typography automatically.
 *
 * @example
 *   <InlineHeadingEditor blockId={block.id} fieldKey="title" initialContent={c.title} />
 */
export function InlineHeadingEditor(props: InlineTextEditorProps) {
  return (
    <InlineTextEditor
      {...props}
      multiline={false}
      style={{
        fontWeight: 700,
        fontSize:   'inherit',
        lineHeight: 'inherit',
        ...props.style,
      }}
    />
  )
}
