import { PatchEngine }       from '../patch/engine'
import { PatchHistoryStore } from '../patch/history'
import { PatchEventBus }     from '../patch/events'
import type { Page }         from './types'

const defaultDoc: Page = {
  id:'page_default', title:'', slug:'', status:'draft', seo:{},
  sections:[], workspaceId:'', version:0,
  createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
}

export const globalEventBus = new PatchEventBus()
export const engine         = new PatchEngine(defaultDoc, new PatchHistoryStore(), globalEventBus)
