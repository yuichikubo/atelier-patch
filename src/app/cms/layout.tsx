import '../preview-skin.css'
import { AppBootstrap } from './AppBootstrap'

export default function CmsLayout({ children }:{ children:React.ReactNode }) {
  return (
    <>
      <AppBootstrap />
      {children}
    </>
  )
}
