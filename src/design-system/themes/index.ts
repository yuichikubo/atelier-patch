import { themeRegistry } from './ThemeRegistry'
import type { Theme }    from './ThemeRegistry'

const luxuryTheme: Theme = {
  id:'luxury', label:'Luxury', icon:'✦', mode:'light', description:'Dark obsidian with gold accents',
  colors:{ background:'#0F0F14', surface:'#17171F', border:'rgba(255,255,255,0.07)', text:'#E8E4DC', textMuted:'#7A7870', accent:'#C9A84C', accentText:'#0F0F14' },
  fonts:{ heading:'"Georgia",serif', body:'system-ui,-apple-system,sans-serif' },
  spacing:{ section:'96px', maxWidth:'1080px', pagePad:'clamp(20px,5vw,80px)' },
  radius:{ sm:'6px', md:'12px', lg:'20px' },
}
const minimalTheme: Theme = {
  id:'minimal', label:'Minimal', icon:'◻', mode:'light', description:'Clean white',
  colors:{ background:'#FFFFFF', surface:'#F7F7F5', border:'rgba(0,0,0,0.08)', text:'#111111', textMuted:'#6B6B6B', accent:'#111111', accentText:'#FFFFFF' },
  fonts:{ heading:'"Georgia",serif', body:'system-ui,-apple-system,sans-serif' },
  spacing:{ section:'88px', maxWidth:'1040px', pagePad:'clamp(20px,5vw,72px)' },
  radius:{ sm:'4px', md:'8px', lg:'14px' },
}
const softTheme: Theme = {
  id:'soft', label:'Soft', icon:'🌸', mode:'light', description:'Blush pink',
  colors:{ background:'#FDF8F5', surface:'#F5ECE8', border:'rgba(180,120,100,0.12)', text:'#2A1A14', textMuted:'#8A6A60', accent:'#C4726A', accentText:'#FFFFFF' },
  fonts:{ heading:'"Georgia",serif', body:'system-ui,-apple-system,sans-serif' },
  spacing:{ section:'104px', maxWidth:'1020px', pagePad:'clamp(20px,5vw,72px)' },
  radius:{ sm:'10px', md:'18px', lg:'28px' },
}
const darkTheme: Theme = {
  id:'dark', label:'Dark', icon:'◈', mode:'dark', description:'Monochrome',
  colors:{ background:'#0A0A0A', surface:'#141414', border:'rgba(255,255,255,0.1)', text:'#E8E8E8', textMuted:'#606060', accent:'#FFFFFF', accentText:'#0A0A0A' },
  fonts:{ heading:'system-ui,-apple-system,sans-serif', body:'system-ui,-apple-system,sans-serif' },
  spacing:{ section:'80px', maxWidth:'960px', pagePad:'clamp(20px,5vw,64px)' },
  radius:{ sm:'0px', md:'4px', lg:'8px' },
}

let done = false
export function registerBuiltInThemes(): void {
  if (done) return; done = true
  themeRegistry.register(luxuryTheme, true)
  themeRegistry.register(minimalTheme, true)
  themeRegistry.register(softTheme, true)
  themeRegistry.register(darkTheme, true)
}

export { themeRegistry }
