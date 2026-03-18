import fs   from 'fs'
import path from 'path'

const DATA_DIR   = path.join(process.cwd(), 'data', 'pages')
const INDEX_FILE = path.join(process.cwd(), 'data', '_index.json')

function ensureDirs() {
  [path.join(process.cwd(), 'data'), DATA_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  })
}

async function main() {
  ensureDirs()
  const now    = new Date().toISOString()
  const pageId = 'home-dev-001'
  const page   = {
    id: pageId, title: 'Home', slug: 'home', status: 'draft',
    workspaceId: 'dev-workspace', themeId: 'luxury', version: 0,
    seo: { title: 'Home', description: 'Welcome to ATELIER CMS' },
    sections: [], createdAt: now, updatedAt: now,
  }
  fs.writeFileSync(path.join(DATA_DIR, 'home.json'), JSON.stringify(page, null, 2))
  const index = { [pageId]: { id: pageId, title: 'Home', slug: 'home', status: 'draft', workspaceId: 'dev-workspace', version: 0, createdAt: now, updatedAt: now } }
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2))
  console.log('✓ Seeded: data/pages/home.json')
  console.log('✓ Open editor: http://localhost:3000/cms/' + pageId)
}

main().catch(e => { console.error(e); process.exit(1) })
