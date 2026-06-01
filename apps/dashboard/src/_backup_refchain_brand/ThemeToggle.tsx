'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('rc_theme') ?? 'light'
    setDark(saved === 'dark')
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  function toggle() {
    const next = dark ? 'light' : 'dark'
    setDark(!dark)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('rc_theme', next)
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300"
      style={{
        background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(37,99,235,0.07)',
        borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(37,99,235,0.18)',
      }}
    >
      {/* Track */}
      <span
        className="relative inline-flex items-center"
        style={{ width: 40, height: 22 }}
      >
        <span
          className="absolute inset-0 rounded-full transition-all duration-300"
          style={{ background: dark ? '#334155' : '#dbeafe' }}
        />
        {/* Knob */}
        <span
          className="absolute top-[3px] w-4 h-4 rounded-full shadow transition-all duration-300 flex items-center justify-center"
          style={{
            left: dark ? 22 : 3,
            background: dark ? '#818cf8' : '#2563eb',
            transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {dark
            ? <svg width="9" height="9" viewBox="0 0 24 24" fill="white"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
            : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
          }
        </span>
      </span>

      <span
        className="text-xs font-semibold hidden sm:block transition-colors duration-300"
        style={{ color: dark ? 'rgba(255,255,255,0.45)' : '#3b82f6' }}
      >
        {dark ? 'Dark' : 'Light'}
      </span>
    </button>
  )
}
