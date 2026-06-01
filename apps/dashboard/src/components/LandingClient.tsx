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

    // ── 3D card tilt (spatial UI) ─────────────────────────────────────────
    // Sets CSS custom properties --tilt-x and --tilt-y on each .tilt-card
    // based on cursor position relative to the card. Max ±6 degrees.
    const MAX_DEG = 6
    function onTileMove(e: MouseEvent) {
      const card = (e.currentTarget as HTMLElement)
      const { left, top, width, height } = card.getBoundingClientRect()
      const x = (e.clientX - left) / width  - 0.5   // -0.5 … 0.5
      const y = (e.clientY - top)  / height - 0.5
      card.style.setProperty('--tilt-y',  `${( x * MAX_DEG).toFixed(2)}deg`)
      card.style.setProperty('--tilt-x',  `${(-y * MAX_DEG).toFixed(2)}deg`)
    }
    function onTileLeave(e: MouseEvent) {
      const card = e.currentTarget as HTMLElement
      card.style.setProperty('--tilt-x', '0deg')
      card.style.setProperty('--tilt-y', '0deg')
    }
    const tiltCards = document.querySelectorAll<HTMLElement>('.tilt-card')
    tiltCards.forEach(card => {
      card.addEventListener('mousemove', onTileMove)
      card.addEventListener('mouseleave', onTileLeave)
    })

    return () => {
      revealObserver.disconnect()
      counterObserver.disconnect()
      tiltCards.forEach(card => {
        card.removeEventListener('mousemove', onTileMove)
        card.removeEventListener('mouseleave', onTileLeave)
      })
    }
  }, [])

  return null
}
