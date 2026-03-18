'use client'
import { useEffect, useRef } from 'react'
import { registerBuiltInThemes }     from '@/design-system/themes'
import { registerBuiltInComponents } from '@/design-system/registry/registerBuiltInComponents'
import { timelineEngine }            from '@/system/timeline/TimelineEngine'

let booted = false

export function AppBootstrap() {
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current || booted) return
    ran.current = true
    booted      = true
    registerBuiltInThemes()
    registerBuiltInComponents()
    timelineEngine.start()   // begin recording every patch transaction
  }, [])
  return null
}
