'use client'
/**
 * ATELIER CMS — Canvas Keyboard Shortcuts
 *
 * Delete/Backspace → remove selected block
 * Escape           → clear selection
 * Cmd+D            → duplicate selected block
 *
 * All mutations go through engine.enqueuePatch().
 * Shortcuts are suppressed when the user is typing in an input/textarea.
 */

import { useEffect } from 'react'
import { engine }              from '@/core/document/engineInstance'
import { useSelectionStore }   from '@/editor/selection/selectionStore'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const selectedBlockId   = useSelectionStore(s => s.selectedBlockId)
  const clearSelection    = useSelectionStore(s => s.clearSelection)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      // Do not process keyboard mutations during AI streaming
      if (engine.isStreaming) return

      // Escape — clear selection
      if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        return
      }

      // Cmd+Z — undo structural operations from the canvas.
      // Suppressed inside contentEditable (isTypingTarget guard above) so
      // browser text-undo still works naturally inside inline editors.
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        engine.undo()
        return
      }

      // Cmd+Shift+Z — redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        engine.redo()
        return
      }

      // Delete / Backspace — remove selected block
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId) {
        e.preventDefault()
        engine.enqueuePatch({
          op:     'remove',
          target: 'block',
          id:     selectedBlockId,
          meta:   { source: 'editor' },
        })
        clearSelection()
        return
      }

      // Cmd+D / Ctrl+D — duplicate selected block
      if ((e.metaKey || e.ctrlKey) && e.key === 'd' && selectedBlockId) {
        e.preventDefault()
        const doc = engine.getDocument()
        const block = doc.sections.flatMap(s => s.blocks).find(b => b.id === selectedBlockId)
        const parentSection = doc.sections.find(s => s.blocks.some(b => b.id === selectedBlockId))
        if (!block || !parentSection) return
        engine.enqueuePatch({
          op:       'add',
          target:   'block',
          data:     {
            type:            block.type,
            parentSectionId: parentSection.id,
            content:         { ...(block.content as object) },
            settings:        { ...(block.settings as object) },
          },
          position: { placement: 'after', ref: selectedBlockId },
          meta:     { source: 'editor' },
        })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedBlockId, clearSelection])
}
