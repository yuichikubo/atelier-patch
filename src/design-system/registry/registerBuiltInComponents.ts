import { registerComponent }    from './ComponentRegistry'
import { HeroComponent }        from '../components/Hero'
import { TextComponent }        from '../components/Text'
import { ImageComponent }       from '../components/Image'
import { GalleryComponent }     from '../components/Gallery'
import { CTAComponent }         from '../components/CTA'
import { FAQComponent }         from '../components/FAQ'
import { FeatureListComponent } from '../components/FeatureList'

let done = false
export function registerBuiltInComponents(): void {
  if (done) return; done = true
  registerComponent('hero',         HeroComponent,        { label:'Hero',         category:'layout',  source:'built-in', icon:'✦' })
  registerComponent('text',         TextComponent,        { label:'Text',         category:'content', source:'built-in', icon:'✎' })
  registerComponent('image',        ImageComponent,       { label:'Image',        category:'media',   source:'built-in', icon:'🖼' })
  registerComponent('gallery',      GalleryComponent,     { label:'Gallery',      category:'media',   source:'built-in', icon:'▣' })
  registerComponent('cta',          CTAComponent,         { label:'CTA',          category:'content', source:'built-in', icon:'→' })
  registerComponent('faq',          FAQComponent,         { label:'FAQ',          category:'content', source:'built-in', icon:'?' })
  registerComponent('feature-list', FeatureListComponent, { label:'Feature List', category:'content', source:'built-in', icon:'⊞' })
}
