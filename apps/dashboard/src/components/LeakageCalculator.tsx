'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, TrendingDown, Target, BarChart3, Info } from 'lucide-react'

const SPECIALTIES: { label: string; avgValue: number }[] = [
  { label: 'Cardiology',           avgValue: 2800 },
  { label: 'Orthopedics',          avgValue: 3200 },
  { label: 'Nephrology',           avgValue: 2500 },
  { label: 'Neurology',            avgValue: 2200 },
  { label: 'Gastroenterology',     avgValue: 2100 },
  { label: 'Pulmonology / Sleep',  avgValue: 1800 },
  { label: 'Internal Medicine',    avgValue: 1600 },
  { label: 'Family Medicine',      avgValue: 1200 },
  { label: 'Other / General',      avgValue: 1800 },
]

// 55–65% industry leakage rate (Innovaccer 2023, MGMA 2022 Referral Benchmarking Report)
// Using midpoint 60% as a conservative working estimate
const LEAKAGE_RATE = 0.60

// Recovery range based on published automation studies:
// Low end (30%): minimal staff adoption, low automation utilization
// High end (55%): strong workflow integration, consistent automated follow-up
// Source: JAMA Network Open 2021 — automated outreach studies show 30–60% improvement
// in referral completion rates vs manual processes
const RECOVERY_LOW  = 0.30
const RECOVERY_HIGH = 0.55

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

export default function LeakageCalculator() {
  const [monthlyReferrals, setMonthlyReferrals] = useState(80)
  const [providers,        setProviders]        = useState(3)
  const [specialtyIdx,     setSpecialtyIdx]     = useState(5)
  const [showMethod,       setShowMethod]       = useState(false)

  const results = useMemo(() => {
    const specialty       = SPECIALTIES[specialtyIdx]
    const annualReferrals = monthlyReferrals * 12
    const estLeaked       = Math.round(annualReferrals * LEAKAGE_RATE)
    const estLeakageRev   = estLeaked * specialty.avgValue
    const recoverLow      = Math.round(estLeaked * RECOVERY_LOW)
    const recoverHigh     = Math.round(estLeaked * RECOVERY_HIGH)
    const recoverRevLow   = recoverLow  * specialty.avgValue
    const recoverRevHigh  = recoverHigh * specialty.avgValue
    const annualCost      = providers <= 5
      ? 99 * 12
      : providers <= 25
        ? providers * 49 * 12
        : providers * 30 * 12
    return {
      annualReferrals,
      estLeaked,
      estLeakageRev,
      recoverRevLow,
      recoverRevHigh,
      annualCost,
    }
  }, [monthlyReferrals, providers, specialtyIdx])

  const s = (style: Record<string, string | number>) => style as React.CSSProperties

  return (
    <section id="calculator" className="py-24 px-6 rc-divider">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12 reveal">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-success)' })}>
            What's it costing you?
          </p>
          <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4 rc-text">
            The average practice loses{' '}
            <span style={s({ color: 'var(--rc-accent)' })}>$971,000</span>
            {' '}per physician, per year<br className="hidden md:block" />
            <span className="rc-muted">to referral leakage.</span>
          </h2>
          <p className="text-sm rc-muted max-w-xl mx-auto">
            Enter your numbers. See yours. Based on MGMA 2022 benchmarks — your actual exposure depends on specialty, payer mix, and current workflow.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 reveal">

          {/* ── Inputs ── */}
          <div className="glass-card rounded-2xl p-8 flex flex-col gap-8">

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold uppercase tracking-wider rc-muted">Monthly referrals sent</label>
                <span className="text-2xl font-black tabular-nums rc-text">{monthlyReferrals}</span>
              </div>
              <input type="range" min={10} max={400} step={5} value={monthlyReferrals}
                onChange={e => setMonthlyReferrals(Number(e.target.value))}
                className="w-full cursor-pointer" style={s({ accentColor: 'var(--rc-accent)' })} />
              <div className="flex justify-between text-xs rc-faint mt-1"><span>10</span><span>400</span></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold uppercase tracking-wider rc-muted">Number of providers</label>
                <span className="text-2xl font-black tabular-nums rc-text">{providers}</span>
              </div>
              <input type="range" min={1} max={40} step={1} value={providers}
                onChange={e => setProviders(Number(e.target.value))}
                className="w-full cursor-pointer" style={s({ accentColor: 'var(--rc-accent)' })} />
              <div className="flex justify-between text-xs rc-faint mt-1"><span>1</span><span>40</span></div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-3 rc-muted">Primary specialty</label>
              <select
                value={specialtyIdx}
                onChange={e => setSpecialtyIdx(Number(e.target.value))}
                className="w-full rounded-xl px-4 py-3 text-sm appearance-none cursor-pointer focus:outline-none"
                style={s({ background: 'var(--rc-surface-2)', border: '1px solid var(--rc-border-2)', color: 'var(--rc-text)' })}
              >
                {SPECIALTIES.map((sp, i) => (
                  <option key={sp.label} value={i}>{sp.label} · avg {fmt(sp.avgValue)} / referral</option>
                ))}
              </select>
            </div>

            {/* Methodology toggle */}
            <button
              onClick={() => setShowMethod(v => !v)}
              className="flex items-center gap-2 text-xs rc-muted hover:rc-text transition-colors text-left"
              style={s({ color: 'var(--rc-text-muted)' })}
            >
              <Info size={13} style={s({ color: 'var(--rc-accent)', flexShrink: 0 })} />
              {showMethod ? 'Hide' : 'View'} how this estimate is calculated
            </button>

            {showMethod && (
              <div className="rounded-xl p-4 text-xs rc-muted leading-relaxed space-y-2"
                style={s({ background: 'var(--rc-surface-3)', border: '1px solid var(--rc-border)' })}>
                <p><span className="font-bold rc-text">Leakage rate (60%):</span> Based on the 55–65% range reported by Innovaccer (2023) and MGMA's 2022 Referral Benchmarking Report. We use the midpoint as a conservative working assumption.</p>
                <p><span className="font-bold rc-text">Referral values:</span> Specialty-adjusted averages derived from CMS Medicare fee schedule data and MGMA Cost and Revenue Survey benchmarks. Your actual payer mix will differ.</p>
                <p><span className="font-bold rc-text">Recovery range (30–55%):</span> Reflects the range seen in published automated outreach studies (JAMA Network Open 2021). Lower end assumes minimal automation adoption; upper end assumes strong workflow integration and consistent staff use.</p>
                <p className="font-semibold rc-text">These figures are illustrative estimates only — not a guarantee of outcome. Actual results depend on specialty, payer mix, staff adoption, and workflow implementation.</p>
              </div>
            )}
          </div>

          {/* ── Results ── */}
          <div className="flex flex-col gap-4">

            {/* Estimated leakage */}
            <div className="rounded-2xl p-6 flex flex-col gap-2"
              style={s({ background: 'var(--rc-danger-soft)', border: '1px solid color-mix(in srgb, var(--rc-danger) 22%, transparent)' })}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={15} style={s({ color: 'var(--rc-danger)' })} />
                <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-danger)' })}>
                  Estimated revenue at risk
                </span>
              </div>
              <p className="text-4xl font-black tracking-tight rc-text">{fmt(results.estLeakageRev)}</p>
              <p className="text-sm rc-muted">
                ~{results.estLeaked.toLocaleString()} referrals estimated incomplete/yr
                · {SPECIALTIES[specialtyIdx].label}
              </p>
              <p className="text-[11px] rc-faint mt-1">
                Based on 60% industry leakage rate. Your practice rate may be higher or lower.
              </p>
            </div>

            {/* Recovery range — not a promise */}
            <div className="rounded-2xl p-6 flex flex-col gap-2"
              style={s({ background: 'var(--rc-success-soft)', border: '1px solid color-mix(in srgb, var(--rc-success) 22%, transparent)' })}>
              <div className="flex items-center gap-2 mb-1">
                <Target size={15} style={s({ color: 'var(--rc-success)' })} />
                <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-success)' })}>
                  Potential recovery opportunity
                </span>
              </div>
              <p className="text-4xl font-black tracking-tight rc-text">
                {fmt(results.recoverRevLow)}
                <span className="text-2xl rc-muted font-semibold"> – {fmt(results.recoverRevHigh)}</span>
              </p>
              <p className="text-sm rc-muted">estimated range / year</p>
              <p className="text-[11px] rc-faint mt-1">
                Depends on staff adoption, payer mix, and workflow integration.
                Range reflects 30–55% completion improvement from published automation studies.
              </p>
            </div>

            {/* Plerous cost */}
            <div className="rounded-2xl p-5 flex items-center justify-between gap-6"
              style={s({ background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 size={14} style={s({ color: 'var(--rc-accent)' })} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-accent)' })}>Plerous annual cost</span>
                </div>
                <p className="text-2xl font-black rc-text">{fmt(results.annualCost)}<span className="text-sm font-normal rc-muted">/yr</span></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1 rc-faint">Cost vs. risk</p>
                <p className="text-2xl font-black" style={s({ color: 'var(--rc-accent)' })}>
                  {Math.round(results.recoverRevLow / results.annualCost)}–{Math.round(results.recoverRevHigh / results.annualCost)}×
                </p>
                <p className="text-[10px] rc-faint">estimated return range</p>
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] rc-faint leading-relaxed px-1">
              ⚠️ This is a rough planning estimate, not a revenue guarantee. Outcomes vary significantly by practice size, specialty, payer contracts, staff workflow adoption, and local market conditions. Consult with your practice manager before making financial decisions based on these figures.
            </p>

            <Link
              href="/onboarding"
              className="flex items-center justify-center gap-2 text-white font-bold py-4 rounded-xl transition-all text-sm"
              style={s({ background: 'var(--rc-accent)', boxShadow: '0 0 30px color-mix(in srgb, var(--rc-accent) 30%, transparent)' })}
            >
              Close the loop · Enter your NPI <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
