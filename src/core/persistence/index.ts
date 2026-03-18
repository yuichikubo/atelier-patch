/**
 * ATELIER CMS — Repository selector
 * USE_SUPABASE=true → Supabase (production / Vercel)
 * USE_SUPABASE unset  → Local fs (development)
 */

export type { PageMeta } from './DocumentRepository'

// Use NEXT_PUBLIC_SUPABASE_URL as the condition so webpack can evaluate it
// at build time and tree-shake the unused implementation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('./DocumentRepository.supabase')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('./DocumentRepository')

export const documentRepository = impl.documentRepository
