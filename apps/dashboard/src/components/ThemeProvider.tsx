'use client'

import { useEffect } from 'react'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem('pl_theme') ?? 'light'
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  return <>{children}</>
}
