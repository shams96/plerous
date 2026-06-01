'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, TrendingDown, DollarSign, BarChart3 } from 'lucide-react'

const SPECIALTIES: { label: string; avgValue: number }[] = [
  { label: 'Cardiology',        avgValue: 2800 },
  { label: 'Orthopedics',       avgValue: 3200 },
  { label: 'Nephrology',        avgValue: 2500 },
  { label: 'Neurology',         avgValue: 2200 },
  { label: 'Gastroenterology',  avgValue: 2100 },
  { label: 'Pulmonology / Sleep', avgValue: 1800 },
  { label: 'Internal Medicine', avgValue: 1600 },
  { label: 'Family Medicine',   avgValue: 1200 },
  { label: 'Other / General',   avgValue: 1800 },
]

const LEAKAGE_RATE  = 0.60   // 55–65% industry average, using 60%
const RECOVERY_RATE = 0.72   // RefChain recovers ~72% of leaking referrals

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${n}`
}

export default function LeakageCalculator() {
  const [monthlyReferrals, setMonthlyReferrals] = useState(80)
  const [providers,        setProviders]        = useState(3)
  const [specialtyIdx,     setSpecialtyIdx]     = useState(5) // Pulmonology default

  const results = useMemo(() => {
    const specialty      = SPECIALTIES[specialtyIdx]
    const annualReferrals = monthlyReferrals * 12
    const leaked          = Math.round(annualReferrals * LEAKAGE_RATE)
    const leakageRevenue  = leaked * specialty.avgValue
    const recoverable     = Math.round(leaked * RECOVERY_RATE)
    const recoverableRev  = recoverable * specialty.avgValue
    const annualCost      = providers <= 5
      ? 99 * 12
      : providers <= 25
        ? providers * 49 * 12
        : providers * 30 * 12
    const roi = recoverableRev / annualCost
    return { annualReferrals, leaked, leakageRevenue, recoverableRev, annualCost, roi }
  }, [monthlyReferrals, providers, specialtyIdx])

  const s = (style: Record<string, string | number>) => style as React.CSSProperties

  return (
    <section id="calculator" className="py-24 px-6 rc-divider">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12 reveal">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-success)' })}>
            Leakage calculator
          </p>
          <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4 rc-text">
            How much is your practice <br className="hidden md:block" />
            <span className="rc-muted">leaving on the table?</span>
          </h2>
          <p className="text-sm rc-muted max-w-xl mx-auto">
            60% of referrals never complete. Enter your practice numbers — see your real revenue at risk.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 reveal">

          {/* ── Inputs ── */}
          <div className="glass-card rounded-2xl p-8 flex flex-col gap-8">

            {/* Monthly referrals slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold uppercase tracking-wider rc-muted">
                  Monthly referrals sent
                </label>
                <span className="text-2xl font-black tabular-nums rc-text">{monthlyReferrals}</span>
              </div>
              <input type="range" min={10} max={400} step={5} value={monthlyReferrals}
                onChange={e => setMonthlyReferrals(Number(e.target.value))}
                className="w-full cursor-pointer" style={s({ accentColor: 'var(--rc-accent)' })} />
              <div className="flex justify-between text-xs rc-faint mt-1"><span>10</span><span>400</span></div>
            </div>

            {/* Providers slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold uppercase tracking-wider rc-muted">
                  Number of providers
                </label>
                <span className="text-2xl font-black tabular-nums rc-text">{providers}</span>
              </div>
              <input type="range" min={1} max={40} step={1} value={providers}
                onChange={e => setProviders(Number(e.target.value))}
                className="w-full cursor-pointer" style={s({ accentColor: 'var(--rc-accent)' })} />
              <div className="flex justify-between text-xs rc-faint mt-1"><span>1</span><span>40</span></div>
            </div>

            {/* Specialty select */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-3 rc-muted">
                Primary specialty
              </label>
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

            <p className="text-[11px] rc-faint leading-relaxed">
              Based on 60% industry leakage rate (Innovaccer / MGMA) and specialty-adjusted referral values.
              Recovery assumes 72% of leaking referrals closed with automated follow-up.
            </p>
          </div>

          {/* ── Results ── */}
          <div className="flex flex-col gap-4">

            {/* Leakage */}
            <div className="rounded-2xl p-8 flex flex-col gap-2"
              style={s({ background: 'var(--rc-danger-soft)', border: '1px solid color-mix(in srgb, var(--rc-danger) 22%, transparent)' })}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={15} style={s({ color: 'var(--rc-danger)' })} />
                <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-danger)' })}>Revenue leaking now</span>
              </div>
              <p className="text-5xl font-black tracking-tight rc-text">{fmt(results.leakageRevenue)}</p>
              <p className="text-sm rc-muted">{results.leaked.toLocaleString()} referrals lost per year · {SPECIALTIES[specialtyIdx].label}</p>
            </div>

            {/* Recoverable */}
            <div className="rounded-2xl p-6 flex flex-col gap-2"
              style={s({ background: 'var(--rc-success-soft)', border: '1px solid color-mix(in srgb, var(--rc-success) 22%, transparent)' })}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign size={15} style={s({ color: 'var(--rc-success)' })} />
                <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-success)' })}>Recoverable with RefChain</span>
              </div>
              <p className="text-4xl font-black tracking-tight rc-text">{fmt(results.recoverableRev)}</p>
              <p className="text-sm rc-muted">per year · {results.annualReferrals.toLocaleString()} total referrals sent</p>
            </div>

            {/* ROI */}
            <div className="rounded-2xl p-6 flex items-center justify-between gap-6"
              style={s({ background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 size={14} style={s({ color: 'var(--rc-accent)' })} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-accent)' })}>RefChain cost</span>
                </div>
                <p className="text-2xl font-black rc-text">{fmt(results.annualCost)}<span className="text-sm font-normal rc-muted">/yr</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider mb-1 rc-faint">ROI</p>
                <p className="text-3xl font-black" style={s({ color: 'var(--rc-accent)' })}>{results.roi.toFixed(0)}×</p>
              </div>
            </div>

            <Link
              href="/onboarding"
              className="flex items-center justify-center gap-2 text-white font-bold py-4 rounded-xl transition-all text-sm"
              style={s({ background: 'var(--rc-accent)', boxShadow: '0 0 30px color-mix(in srgb, var(--rc-accent) 30%, transparent)' })}
            >
              Start recovering revenue · Enter NPI <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
