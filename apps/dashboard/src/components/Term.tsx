'use client'

import { useState, useRef, useId, useEffect } from 'react'

/**
 * Central glossary of in-product jargon. Add a term here once and reference it
 * anywhere with <Term name="paia">PAIA</Term> — the explanation stays consistent
 * across the whole site.
 */
export const GLOSSARY: Record<string, string> = {
  paia:
    'Pre-Auth Intelligence Agent — Plerous’s engine that screens every referral for the documentation gaps and coverage mismatches payers use to deny claims, before you submit.',
  sentinel:
    'Plerous’s always-on monitor. It checks every active referral around the clock and automatically chases any that stall — so nothing falls through the cracks.',
  'prior-auth':
    'Prior authorization — the approval a health plan must give before it will pay for a referral, procedure, or test. Getting it wrong is the #1 cause of denied claims.',
  'fhir-r4':
    'FHIR R4 — the modern industry standard for exchanging healthcare data between systems. “Native” means Plerous speaks it directly, with no middleware.',
  'davinci-pas':
    'Da Vinci PAS — the national standard that lets prior authorizations be submitted and approved electronically between providers and payers.',
  'cms-0057':
    'CMS-0057-F — the federal rule requiring health plans to support electronic (FHIR-based) prior authorization. The compliance deadline is January 2027.',
  npi:
    'National Provider Identifier — the unique 10-digit ID every U.S. clinician has. Plerous uses it to set up your whole account automatically in under a minute.',
  leakage:
    'Referral leakage — when a referral never reaches the specialist or never gets completed. The patient misses care and the practice loses the revenue.',
  'direct-message':
    'Direct secure messaging — the encrypted, HIPAA-compliant email rail most provider offices already have, used to send referrals securely.',
}

export default function Term({
  name,
  children,
}: {
  name: keyof typeof GLOSSARY | string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const tipId = useId()
  const definition = GLOSSARY[name]

  // Close on outside tap (mobile) or Escape
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // If the term isn't in the glossary, render plain text (fail-safe)
  if (!definition) return <>{children}</>

  return (
    <span
      ref={ref}
      className="term-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="term-trigger"
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <span role="tooltip" id={tipId} className="term-tip">
          {definition}
        </span>
      )}
    </span>
  )
}
