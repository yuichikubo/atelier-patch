/**
 * ATELIER CMS — Runtime Component Registry
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * This module is the public-facing Component Registry for the ATELIER runtime.
 * It provides the API that plugins, extensions, and third-party code use to
 * register new block components and query registered ones.
 *
 * RELATIONSHIP TO THE INTERNAL REGISTRY
 * ──────────────────────────────────────
 * The design-system registry at `@/design-system/registry/ComponentRegistry`
 * is the underlying store. This module is a stable public facade over it,
 * exposing a cleaner API and adding runtime-specific capabilities:
 *
 *   • Plugin-safe registration with source tracking
 *   • Duplicate-type detection with configurable override policy
 *   • `listComponents()` for dynamic palette / plugin manager UIs
 *   • `hasComponent(type)` guard for conditional rendering
 *
 * The BlockRenderer continues to read from the same underlying registry
 * singleton — registering a component here makes it immediately available
 * in the canvas with no additional wiring required.
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This module does NOT modify PatchEngine or the Document schema.
 * • Components registered here are immediately available to BlockRenderer.
 * • Built-in components (hero, text, image, …) are registered by calling
 *   `registerBuiltins()` from `src/runtime/registerBuiltins.ts`.
 * • Plugins call `registerComponent(type, Component, options)` at their
 *   init time — before the editor renders.
 *
 * USAGE — Plugins
 * ───────────────
 *   import { registerComponent } from '@/runtime/ComponentRegistry'
 *
 *   registerComponent('video', VideoBlock, {
 *     label:    'Video',
 *     icon:     '▶',
 *     category: 'media',
 *   })
 *
 * USAGE — Renderer / palette
 * ──────────────────────────
 *   import { getComponent, hasComponent } from '@/runtime/ComponentRegistry'
 *
 *   const Comp = getComponent('video') ?? FallbackComponent
 *   const all  = listComponents()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  componentRegistry,
  registerComponent as dsRegisterComponent,
  type ComponentRegistryEntry,
} from '@/design-system/registry/ComponentRegistry'
import type { BlockComponent } from '@/core/renderer/types'

// ─────────────────────────────────────────────────────────────────────────────
// Re-export shared types so callers import from one place
// ─────────────────────────────────────────────────────────────────────────────

export type { BlockComponent, ComponentRegistryEntry }

// ─────────────────────────────────────────────────────────────────────────────
// Registration options
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterComponentOptions {
  /** Human-readable label shown in the palette and inspector. */
  label?:    string
  /** Single glyph or emoji for the library UI. */
  icon?:     string
  /** Category group — used to organise the palette sidebar. */
  category?: string
  /**
   * Whether this component is provided by a plugin.
   * Built-in components cannot be overridden by plugins.
   * Defaults to 'plugin'.
   */
  source?:   'built-in' | 'plugin'
  /** Identifier of the registering plugin, for audit and debugging. */
  pluginId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a block component for a given block type.
 *
 * Once registered, the Renderer will render this component for every block
 * whose `type` field matches. Built-in types ('hero', 'text', 'image', …)
 * cannot be overridden by plugins.
 *
 * @param type       Block type string — must match the type in the Document.
 * @param component  React component that receives `BlockComponentProps`.
 * @param options    Optional metadata: label, icon, category, pluginId.
 *
 * @throws {Error} If a plugin attempts to override a built-in component.
 *
 * @example
 *   registerComponent('video', VideoBlock, {
 *     label:    'Video',
 *     icon:     '▶',
 *     category: 'media',
 *     pluginId: 'my-video-plugin',
 *   })
 */
export function registerComponent(
  type:      string,
  component: BlockComponent,
  options?:  RegisterComponentOptions,
): void {
  dsRegisterComponent(type, component, {
    label:    options?.label    ?? type,
    icon:     options?.icon,
    category: options?.category,
    source:   options?.source   ?? 'plugin',
    pluginId: options?.pluginId,
  })
}

/**
 * Returns the registered component for the given block type, or `null` if
 * the type has not been registered.
 *
 * @example
 *   const Comp = getComponent('video') ?? FallbackBlock
 *   return <Comp block={block} isEditing={isEditing} />
 */
export function getComponent(type: string): BlockComponent | null {
  return componentRegistry.get(type)
}

/**
 * Returns true if a component has been registered for the given block type.
 *
 * @example
 *   if (!hasComponent('video')) {
 *     console.warn('video plugin is not loaded')
 *   }
 */
export function hasComponent(type: string): boolean {
  return componentRegistry.has(type)
}

/**
 * Returns all registered component entries.
 * Useful for building dynamic palette UIs or plugin manager listings.
 *
 * @example
 *   const all = listComponents()
 *   const pluginBlocks = all.filter(e => e.source === 'plugin')
 */
export function listComponents(): ComponentRegistryEntry[] {
  return componentRegistry.getAll()
}

/**
 * Returns all registered component entries belonging to the given category.
 *
 * @example
 *   const mediaBlocks = listComponentsByCategory('media')
 */
export function listComponentsByCategory(category: string): ComponentRegistryEntry[] {
  return componentRegistry.getAll().filter(e => e.category === category)
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct registry access — escape hatch for advanced use cases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The underlying ComponentRegistry singleton.
 * Use the functions above for standard access; expose this only for advanced
 * scenarios where direct registry access is required (e.g. unit tests,
 * plugin introspection tools).
 */
export { componentRegistry as registry }
