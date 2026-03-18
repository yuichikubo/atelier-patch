export interface Theme {
  id:string; label:string; description:string; icon:string; mode:'light'|'dark'
  colors:{ background:string; surface:string; border:string; text:string; textMuted:string; accent:string; accentText:string }
  fonts:{ heading:string; body:string; mono?:string; googleFontsUrl?:string }
  spacing:{ section:string; maxWidth:string; pagePad:string }
  radius:{ sm:string; md:string; lg:string }
}

class ThemeRegistryClass {
  private themes   = new Map<string,Theme>()
  private builtins = new Set<string>()

  register(theme:Theme, isBuiltin=false): void {
    if (this.builtins.has(theme.id)) return
    this.themes.set(theme.id, Object.freeze({...theme}))
    if (isBuiltin) this.builtins.add(theme.id)
  }

  resolve(id:string): Theme {
    return this.themes.get(id) ?? this.themes.get('luxury') ?? [...this.themes.values()][0]
  }

  has(id:string):boolean { return this.themes.has(id) }
  getAll():Theme[]       { return [...this.themes.values()] }

  toCSSVars(t:Theme): Record<string,string> {
    return {
      '--color-bg':t.colors.background, '--color-surface':t.colors.surface,
      '--color-border':t.colors.border, '--color-text':t.colors.text,
      '--color-text2':t.colors.textMuted, '--color-accent':t.colors.accent,
      '--color-accent-text':t.colors.accentText, '--font-heading':t.fonts.heading,
      '--font-body':t.fonts.body, '--font-mono':t.fonts.mono??'monospace',
      '--space-section':t.spacing.section, '--max-width':t.spacing.maxWidth,
      '--page-padding':t.spacing.pagePad, '--radius-sm':t.radius.sm,
      '--radius-md':t.radius.md, '--radius-lg':t.radius.lg,
    }
  }
}

export const themeRegistry = new ThemeRegistryClass()
