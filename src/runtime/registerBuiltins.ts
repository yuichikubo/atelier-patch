/**
 * ATELIER CMS — Register Built-in Components
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE
 * ───────
 * `registerBuiltins` is the single call that makes all built-in ATELIER block
 * components available to the Renderer.
 *
 * It delegates to `registerBuiltInComponents` from the design-system registry,
 * which already handles idempotency (calling it twice is safe) and registers
 * all seven built-in block types:
 *
 *   hero  ·  text  ·  image  ·  gallery  ·  cta  ·  faq  ·  feature-list
 *
 * WHEN TO CALL
 * ────────────
 * Call `registerBuiltins()` once, early in the application lifecycle:
 *
 *   • In `app/layout.tsx` — for server-side pre-registration
 *   • In `AppBootstrap.tsx` (useEffect) — for client-side registration
 *   • In test setup files — before rendering any block component
 *
 * ARCHITECTURE CONTRACT
 * ─────────────────────
 * • This function is idempotent — safe to call multiple times.
 * • It does NOT modify PatchEngine or the Document schema.
 * • Built-in components are registered with `source: 'built-in'` and
 *   cannot be overridden by plugins.
 * • Plugin components are registered separately via `registerComponent()`
 *   in `src/runtime/ComponentRegistry.ts`.
 *
 * USAGE
 * ─────
 *   import { registerBuiltins } from '@/runtime/registerBuiltins'
 *
 *   // Server layout (app/layout.tsx):
 *   registerBuiltins()
 *
 *   // Client bootstrap (AppBootstrap.tsx):
 *   useEffect(() => { registerBuiltins() }, [])
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { registerBuiltInComponents } from '@/design-system/registry/registerBuiltInComponents'

// ─────────────────────────────────────────────────────────────────────────────
// registerBuiltins — idempotent registration of all built-in blocks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all built-in ATELIER block components.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * After this call returns, `getComponent(type)` will resolve for all
 * seven built-in block types.
 *
 * @example
 *   import { registerBuiltins } from '@/runtime/registerBuiltins'
 *   registerBuiltins()
 */
export function registerBuiltins(): void {
  registerBuiltInComponents()
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN BLOCK TYPES — reference list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The block types registered by `registerBuiltins()`.
 * Useful for type guards, validation, and palette filtering.
 *
 * @example
 *   if (BUILTIN_BLOCK_TYPES.includes(blockType)) { … }
 */
export const BUILTIN_BLOCK_TYPES = [
  'hero',
  'text',
  'image',
  'gallery',
  'cta',
  'faq',
  'feature-list',
] as const

export type BuiltinBlockType = (typeof BUILTIN_BLOCK_TYPES)[number]

/**
 * Returns true if the given block type is a registered built-in.
 *
 * @example
 *   isBuiltinBlockType('hero')    // true
 *   isBuiltinBlockType('video')   // false
 */
export function isBuiltinBlockType(type: string): type is BuiltinBlockType {
  return (BUILTIN_BLOCK_TYPES as readonly string[]).includes(type)
}
