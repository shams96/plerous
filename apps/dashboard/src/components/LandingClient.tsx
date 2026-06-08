'use client'

import { useEffect } from 'react'

export default function LandingClient() {
  useEffect(() => {
    // ── Scroll reveal ──────────────────────────────────────────────────────
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            revealObserver.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el))

    // ── Animated stat counters ─────────────────────────────────────────────
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return
          const el = e.target as HTMLElement
          const target = parseFloat(el.dataset.target ?? '0')
          const prefix = el.dataset.prefix ?? ''
          const suffix = el.dataset.suffix ?? ''
          const isFloat = el.dataset.float === 'true'
          const duration = 1400
          const start = performance.now()

          function tick(now: number) {
            const progress = Math.min((now - start) / duration, 1)
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            const current = target * eased
            el.textContent = prefix + (isFloat ? current.toFixed(1) : Math.round(current).toLocaleString()) + suffix
            if (progress < 1) requestAnimationFrame(tick)
          }

          requestAnimationFrame(tick)
          counterObserver.unobserve(el)
        })
      },
      { threshold: 0.5 }
    )
    document.querySelectorAll('.counter').forEach(el => counterObserver.observe(el))

    return () => {
      revealObserver.disconnect()
      counterObserver.disconnect()
    }
  }, [])

  return null
}
