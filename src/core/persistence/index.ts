/**
 * ATELIER CMS — Repository selector
 * USE_SUPABASE=true → Supabase (production / Vercel)
 * USE_SUPABASE unset  → Local fs (development)
 */

export type { PageMeta } from './DocumentRepository'

// Dynamic import at module level keeps both implementations tree-shakeable
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impl = process.env.USE_SUPABASE === 'true'
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('./DocumentRepository.supabase')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  : require('./DocumentRepository')

export const documentRepository = impl.documentRepository
