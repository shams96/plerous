import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, ShieldCheck, Brain, Zap, FileText,
  Clock, DollarSign, Lock, Activity, Database,
  GitBranch, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import LeakageCalculator from '@/components/LeakageCalculator'
import ThemeToggle from '@/components/ThemeToggle'
import LandingClient from '@/components/LandingClient'

// ─── Helpers ────────────────────────────────────────────────────────────────

const s = (style: Record<string, string | number>) => style as React.CSSProperties

const AGENTS = [
  { icon: '📋', name: 'Coordinator Brief',  desc: 'Morning summary — stalls, SLA alerts, priorities',   color: 'var(--rc-accent)' },
  { icon: '🛡️', name: 'Sentinel',           desc: '24/7 monitor — auto-recovers every stalled referral', color: 'var(--rc-success)' },
  { icon: '🧠', name: 'PAIA',               desc: '4-check pre-auth intelligence before every submit',   color: 'var(--rc-purple)' },
  { icon: '🔄', name: 'Recovery',           desc: 'Rescues referrals stuck in specialist acknowledgment',color: 'var(--rc-warning)' },
  { icon: '💰', name: 'Revenue Recovery',   desc: 'Surfaces revenue leaking from unscheduled referrals', color: 'var(--rc-success)' },
  { icon: '📅', name: 'Scheduling',         desc: 'Closes the loop from auth approval to appointment',   color: 'var(--rc-cyan)' },
  { icon: '🔍', name: 'Prospect Intel',     desc: 'NPI-researches prospects before outreach',            color: 'var(--rc-accent-2)' },
  { icon: '🤝', name: 'Relationships',      desc: 'Tracks referring relationship strength over time',    color: 'var(--rc-accent)' },
  { icon: '❤️', name: 'Care Gap',           desc: 'Identifies patients with unaddressed care gaps',      color: 'var(--rc-danger)' },
  { icon: '📊', name: 'Founder Brief',      desc: 'Revenue, growth, and churn signals — daily',         color: 'var(--rc-purple)' },
]

export default async function LandingPage() {
  const cookieStore = await cookies()
  if (cookieStore.get('rc_token')?.value) redirect('/referrals')

  const daysUntilMandate = Math.ceil(
    (new Date('2027-01-01').getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )

  return (
    <div className="landing min-h-screen overflow-x-hidden">
      <LandingClient />

      {/* ══ Fixed Nav ═════════════════════════════════════════════════════════ */}
      <div
        className="landing-nav rc-glass fixed top-0 inset-x-0 z-50 border-b"
        style={s({ backdropFilter: 'blur(24px)' })}
      >
        <nav className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight rc-text">RefChain</span>
            <span
              className="text-[10px] font-bold rounded px-1.5 py-0.5 hidden sm:block"
              style={s({ color: 'var(--rc-accent)', background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}
            >
              FHIR R4
            </span>
          </div>

          <div className="hidden md:flex items-center gap-7">
            {['#calculator', '#how-it-works', '#agents', '#pricing'].map((href, i) => (
              <a
                key={href}
                href={href}
                className="rc-nav-link text-sm font-medium transition-colors"
                style={s({ color: 'var(--rc-text-muted)' })}
              >
                {['Calculator', 'How it works', 'Agents', 'Pricing'][i]}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-sm font-medium px-3 py-1.5 transition-colors"
              style={s({ color: 'var(--rc-text-muted)' })}
            >
              Sign in
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all"
              style={s({ background: 'var(--rc-accent)', boxShadow: '0 0 24px color-mix(in srgb, var(--rc-accent) 35%, transparent)' })}
            >
              Start free <ArrowRight size={13} />
            </Link>
          </div>
        </nav>
      </div>

      {/* ══ Hero ══════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-6 overflow-hidden">

        {/* Animated mesh gradient blobs */}
        <div
          className="animate-mesh-a pointer-events-none absolute rounded-full"
          style={s({ width: 900, height: 700, top: '-12%', left: '25%', transform: 'translateX(-50%)', background: 'radial-gradient(ellipse, var(--rc-mesh-a) 0%, transparent 70%)', filter: 'blur(40px)' })}
        />
        <div
          className="animate-mesh-b pointer-events-none absolute rounded-full"
          style={s({ width: 600, height: 600, top: '10%', right: '-8%', background: 'radial-gradient(ellipse, var(--rc-mesh-b) 0%, transparent 70%)', filter: 'blur(40px)' })}
        />
        <div
          className="animate-mesh-c pointer-events-none absolute rounded-full"
          style={s({ width: 500, height: 500, bottom: '5%', left: '5%', background: 'radial-gradient(ellipse, var(--rc-mesh-c) 0%, transparent 70%)', filter: 'blur(40px)' })}
        />

        {/* Dot grid */}
        <div className="dot-grid pointer-events-none absolute inset-0" />

        {/* Hero content */}
        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Eyebrow */}
          <div className="animate-fade-up flex items-center justify-center gap-2.5 mb-10 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5"
              style={s({ color: 'var(--rc-warning)', background: 'var(--rc-warning-soft)', border: '1px solid color-mix(in srgb, var(--rc-warning) 25%, transparent)' })}
            >
              <span className="animate-blink-dot w-1.5 h-1.5 rounded-full shrink-0" style={s({ background: 'var(--rc-warning)' })} />
              CMS-0057-F: {daysUntilMandate} days until mandate
            </span>
            <span
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5"
              style={s({ color: 'var(--rc-accent)', background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}
            >
              <ShieldCheck size={11} /> HIPAA · FHIR R4 · Da Vinci PAS
            </span>
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up delay-100 font-black leading-none tracking-tight mb-6">
            <span className="text-shimmer block" style={s({ fontSize: 'clamp(60px,9.5vw,108px)' })}>
              $971,000
            </span>
            <span className="block mt-2 rc-text" style={s({ fontSize: 'clamp(20px,3.2vw,38px)', fontWeight: 800, lineHeight: 1.2 })}>
              lost per physician, per year, in referral leakage.
            </span>
            <span className="block mt-3 rc-muted" style={s({ fontSize: 'clamp(17px,2.2vw,26px)', fontWeight: 500, lineHeight: 1.3 })}>
              RefChain ends that.
            </span>
          </h1>

          {/* Sub-copy */}
          <p
            className="animate-fade-up delay-200 rc-muted max-w-2xl mx-auto mb-10 leading-relaxed"
            style={s({ fontSize: 'clamp(14px,1.5vw,17px)' })}
          >
            The FHIR R4 infrastructure layer that catches prior auth denials before they happen —
            built for independent practices (1–40 providers). Enter your NPI. Done in 5 minutes.
          </p>

          {/* CTAs */}
          <div className="animate-fade-up delay-300 flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 text-white font-bold px-8 py-4 rounded-xl transition-all text-base"
              style={s({ background: 'var(--rc-accent)', boxShadow: '0 0 40px color-mix(in srgb, var(--rc-accent) 35%, transparent)' })}
            >
              Start with your NPI <ArrowRight size={17} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-xl transition-all text-base rc-text"
              style={s({ border: '1px solid var(--rc-border-2)', background: 'var(--rc-accent-soft)' })}
            >
              Sign in to dashboard
            </Link>
          </div>

          {/* Trust strip */}
          <div className="animate-fade-up delay-400 flex flex-wrap items-center justify-center gap-5 text-xs font-medium rc-faint">
            {['HIPAA compliant', 'FHIR R4 native', 'CMS-0057-F ready', 'Da Vinci PAS', 'No credit card'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <CheckCircle2 size={11} style={s({ color: 'var(--rc-accent)' })} /> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Floating activity cards — desktop only */}
        <div className="hidden xl:block pointer-events-none absolute inset-0 z-10">
          <div className="animate-float-a absolute" style={s({ top: '22%', right: '4%' })}>
            <ActivityCard accent="var(--rc-success)" icon="✓" label="PAIA decision" text="auto_submit · 94% confidence" sub="Pulmonology · BCBS TX" />
          </div>
          <div className="animate-float-b absolute" style={s({ top: '50%', right: '6%' })}>
            <ActivityCard accent="var(--rc-accent)" icon="🛡️" label="Sentinel recovered" text="Referral #RC-2847 re-sent" sub="72h SLA · specialist notified" />
          </div>
          <div className="animate-float-c absolute" style={s({ bottom: '18%', right: '3%' })}>
            <ActivityCard accent="var(--rc-warning)" icon="$" label="Auth approved" text="BCBS TX · $2,400" sub="Sleep study · auth #TX-994821" />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="animate-fade-in delay-700 absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 rc-faint">
          <span className="text-xs">scroll</span>
          <div className="w-px h-8" style={s({ background: 'linear-gradient(to bottom, var(--rc-text-faint), transparent)' })} />
        </div>
      </section>

      {/* ══ Mandate urgency strip ═════════════════════════════════════════════ */}
      <div style={s({ background: 'var(--rc-warning-soft)', borderTop: '1px solid color-mix(in srgb, var(--rc-warning) 20%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--rc-warning) 20%, transparent)' })} className="py-4 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle size={15} style={s({ color: 'var(--rc-warning)' })} className="shrink-0" />
            <p className="text-sm font-medium" style={s({ color: 'var(--rc-text-2)' })}>
              <span className="font-bold" style={s({ color: 'var(--rc-warning)' })}>UHC Medicare Advantage</span>
              {' '}now requires referrals for all independent PCPs.{' '}
              <span className="font-bold" style={s({ color: 'var(--rc-warning)' })}>CMS-0057-F</span>
              {' '}mandates FHIR Prior Auth APIs by January 2027.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="shrink-0 text-xs font-bold rounded-lg px-4 py-2 transition-colors whitespace-nowrap"
            style={s({ color: 'var(--rc-warning)', border: '1px solid color-mix(in srgb, var(--rc-warning) 30%, transparent)', background: 'var(--rc-warning-soft)' })}
          >
            Get compliant in 5 min →
          </Link>
        </div>
      </div>

      {/* ══ Proof marquee ═════════════════════════════════════════════════════ */}
      <div className="rc-divider py-4 overflow-hidden" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="flex whitespace-nowrap">
          <div className="animate-marquee flex items-center gap-0 shrink-0">
            {[
              'Texas · Independent PCPs', 'Florida · Pulmonology Groups', 'California · Sleep Medicine',
              'New York · Multi-Specialty', 'Illinois · Family Medicine', 'Georgia · Orthopedics',
              'Ohio · Cardiology Practices', 'Colorado · Gastroenterology', 'Arizona · FQHCs',
              'Texas · Independent PCPs', 'Florida · Pulmonology Groups', 'California · Sleep Medicine',
              'New York · Multi-Specialty', 'Illinois · Family Medicine', 'Georgia · Orthopedics',
            ].map((item, i) => (
              <span key={i} className="flex items-center gap-4 px-8 text-xs font-semibold uppercase tracking-widest rc-faint">
                <span className="w-1 h-1 rounded-full shrink-0" style={s({ background: 'var(--rc-text-faint)' })} />
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ Stats ═════════════════════════════════════════════════════════════ */}
      <section className="py-20 px-6 rc-divider">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden" style={s({ background: 'var(--rc-border)' })}>
          {[
            { value: 971,    prefix: '$', suffix: 'K', label: 'annual referral\nleakage per physician', accent: 'var(--rc-accent)',   icon: DollarSign },
            { value: 80,     prefix: '',  suffix: '%', label: 'of PA denials\npreventable with docs',    accent: 'var(--rc-success)', icon: ShieldCheck },
            { value: 90,     prefix: '',  suffix: 's', label: 'to submit a complete\nPAIA-reviewed referral', accent: 'var(--rc-purple)', icon: Zap },
            { value: daysUntilMandate, prefix: '', suffix: 'd', label: 'until CMS-0057-F\nFHIR mandate deadline', accent: 'var(--rc-warning)', icon: Clock },
          ].map(({ value, prefix, suffix, label, accent, icon: Icon }) => (
            <div
              key={label}
              className="reveal px-8 py-10 flex flex-col gap-4"
              style={s({ background: 'var(--rc-surface)' })}
            >
              <Icon size={18} style={s({ color: accent, opacity: 0.7 })} />
              <p className="text-5xl md:text-6xl font-black tracking-tight stat-num counter"
                data-target={value}
                data-prefix={prefix}
                data-suffix={suffix}
                style={s({ color: accent })}
              >
                {prefix}{value.toLocaleString()}{suffix}
              </p>
              <p className="text-xs rc-muted leading-snug font-medium whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ The Loop Problem ══════════════════════════════════════════════════ */}
      <section className="py-24 px-6 rc-divider" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>The core problem</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4 rc-text">
              Healthcare is open-loop.<br />
              <span className="rc-muted">We close it.</span>
            </h2>
            <p className="text-sm rc-muted max-w-xl mx-auto">60% of referrals disappear into a black hole. No confirmation. No follow-up. No outcome. Just lost revenue — and a patient who never got care.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-5">
            {/* Before */}
            <div className="loop-card reveal delay-1 flex-1" style={s({ borderColor: 'color-mix(in srgb, var(--rc-danger) 25%, transparent)', background: 'var(--rc-danger-soft)' })}>
              <p className="text-xs font-bold uppercase tracking-wider mb-6" style={s({ color: 'var(--rc-danger)' })}>Without RefChain</p>
              <div className="flex flex-col gap-2">
                {[
                  ['🗒️', 'Referral written', 'danger'],
                  ['📠', 'Fax sent... maybe', 'danger'],
                  ['❓', 'Specialist received?', 'danger'],
                  ['⏳', 'Follow-up call #1, #2, #3…', 'danger'],
                  ['💸', 'Patient abandons. Revenue lost.', 'danger'],
                ].map(([icon, text, type], i) => (
                  <div
                    key={i}
                    className="loop-step"
                    style={s({ background: 'color-mix(in srgb, var(--rc-danger) 8%, transparent)', color: i === 4 ? 'var(--rc-danger)' : 'var(--rc-text-muted)' })}
                  >
                    <span>{icon}</span>
                    <span style={s({ opacity: i < 2 ? 1 : 0.7 })}>{text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-2xl font-black" style={s({ color: 'var(--rc-danger)' })}>$971K lost / physician / yr</div>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center px-2">
              <ArrowRight size={32} style={s({ color: 'var(--rc-accent)', opacity: 0.5 })} />
            </div>

            {/* After */}
            <div className="loop-card reveal delay-2 flex-1" style={s({ borderColor: 'color-mix(in srgb, var(--rc-success) 30%, transparent)', background: 'var(--rc-success-soft)' })}>
              <p className="text-xs font-bold uppercase tracking-wider mb-6" style={s({ color: 'var(--rc-success)' })}>With RefChain</p>
              <div className="flex flex-col gap-2">
                {[
                  ['✅', 'Referral submitted (PAIA pre-checked)', 'success'],
                  ['📱', 'Specialist receives + acknowledges', 'success'],
                  ['🛡️', 'Sentinel monitors every 15 minutes', 'success'],
                  ['✅', 'Auth approved, patient scheduled', 'success'],
                  ['💰', 'Loop closed. Revenue confirmed.', 'success'],
                ].map(([icon, text], i) => (
                  <div
                    key={i}
                    className="loop-step"
                    style={s({ background: 'color-mix(in srgb, var(--rc-success) 8%, transparent)', color: i === 4 ? 'var(--rc-success)' : 'var(--rc-text-muted)' })}
                  >
                    <span>{icon}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 text-2xl font-black" style={s({ color: 'var(--rc-success)' })}>72% of leaking referrals recovered</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Leakage Calculator ════════════════════════════════════════════════ */}
      <LeakageCalculator />

      {/* ══ PAIA Pipeline ═════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 px-6 rc-divider" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-xl reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>The AI behind the results</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4 rc-text">
              PAIA analyzes every referral<br />
              <span className="rc-muted">before you submit it.</span>
            </h2>
            <p className="text-sm rc-muted leading-relaxed">
              Pre-Auth Intelligence Agent runs 4 checks in parallel on every referral. It catches what humans miss under pressure — every time.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            {[
              { step: '01', accent: 'var(--rc-accent)',   title: 'Coverage check',     desc: 'Validates eligibility and whether prior auth is required for this CPT + payer combination.', icon: ShieldCheck },
              { step: '02', accent: 'var(--rc-purple)',   title: 'Documentation scan', desc: 'Reads clinical notes. Auto-extracts ESS scores, AHI values, STOP-BANG, and step therapy.', icon: FileText },
              { step: '03', accent: 'var(--rc-cyan)',     title: 'Diagnosis match',    desc: 'Verifies ICD-10 codes support the procedure. Catches mismatches payers use as instant denials.', icon: GitBranch },
              { step: '04', accent: 'var(--rc-success)',  title: 'Decision',           desc: 'Auto-submit at ≥85% confidence. Human window for flags. Hard stop on incomplete documentation.', icon: Brain },
            ].map(({ step, accent, title, desc, icon: Icon }, i) => (
              <div
                key={step}
                className="glass-card grad-border rounded-2xl p-6 flex flex-col gap-4 reveal"
                style={s({ transitionDelay: `${i * 0.09}s` })}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2 py-1 rounded" style={s({ color: accent, background: `color-mix(in srgb, ${accent} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)` })}>{step}</span>
                  <Icon size={16} style={s({ color: accent })} />
                </div>
                <div>
                  <p className="text-sm font-bold mb-2 rc-text">{title}</p>
                  <p className="text-xs rc-muted leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-5 rounded-2xl px-8 py-5 flex flex-col sm:flex-row items-center gap-6 rc-card reveal"
          >
            <Activity size={20} style={s({ color: 'var(--rc-accent)' })} className="shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold rc-text">Every analysis persisted with a SHA-256 audit chain.</p>
              <p className="text-xs rc-muted mt-0.5">Full HIPAA-compliant audit log. Every AI decision traceable. Every human override recorded.</p>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              {[['auto_submit', 'var(--rc-success)'], ['human_window', 'var(--rc-warning)'], ['hard_stop', 'var(--rc-danger)']].map(([label, color]) => (
                <span key={label} className="text-xs font-mono font-bold" style={s({ color })}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ Agent Showcase ════════════════════════════════════════════════════ */}
      <section id="agents" className="py-24 px-6 rc-divider">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>10 AI agents</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight rc-text mb-3">
              Agents, not tools.<br />
              <span className="rc-muted">Every one earns its keep.</span>
            </h2>
            <p className="text-sm rc-muted max-w-xl">No per-seat SaaS tax. No integration overhead. Each agent does the job a tool would have done — with full context, autonomous action, and audit trail.</p>
          </div>

          <div className="scroll-row reveal">
            {AGENTS.map((agent) => (
              <div key={agent.name} className="agent-card">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-4"
                  style={s({ background: `color-mix(in srgb, ${agent.color} 10%, transparent)` })}
                >
                  {agent.icon}
                </div>
                <p className="text-sm font-bold mb-1.5" style={s({ color: 'var(--rc-text)' })}>{agent.name}</p>
                <p className="text-xs rc-muted leading-relaxed">{agent.desc}</p>
                <div className="flex items-center gap-1.5 mt-4">
                  <span className="animate-blink-dot w-1.5 h-1.5 rounded-full" style={s({ background: agent.color })} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={s({ color: agent.color })}>Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Features Bento ════════════════════════════════════════════════════ */}
      <section id="features" className="py-24 px-6 rc-divider" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3 rc-faint">Full platform</p>
            <h2 className="text-3xl md:text-4xl font-black rc-text">Everything independent medicine needs.</h2>
            <p className="rc-muted text-sm mt-3 max-w-xl mx-auto">Not a referral form. Not a portal. The full infrastructure layer — from NPI onboarding to payer submission to appeal generation.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Large — NPI onboarding */}
            <div className="glass-card grad-border rounded-2xl p-8 md:col-span-2 flex flex-col justify-between min-h-[220px] reveal">
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={s({ background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}>
                    <Database size={16} style={s({ color: 'var(--rc-accent)' })} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-accent)' })}>NPI-first onboarding</span>
                </div>
                <h3 className="text-xl font-bold mb-2 rc-text">Zero-question setup.</h3>
                <p className="text-sm rc-muted leading-relaxed max-w-md">Enter your NPI. RefChain pulls your name, specialty, address, phone, fax, and license from CMS NPPES automatically. Creates your org, provider record, and account in one transaction.</p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold" style={s({ color: 'var(--rc-accent)' })}>
                <Zap size={12} /> Under 60 seconds from NPI to first referral
              </div>
            </div>

            {/* Small — EHR */}
            <div className="glass-card grad-border rounded-2xl p-8 flex flex-col justify-between min-h-[220px] reveal delay-1">
              <div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-5" style={s({ background: 'var(--rc-purple-soft)', border: '1px solid color-mix(in srgb, var(--rc-purple) 22%, transparent)' })}>
                  <GitBranch size={16} style={s({ color: 'var(--rc-purple)' })} />
                </div>
                <h3 className="text-lg font-bold mb-2 rc-text">10 EHR profiles. Auto-detected.</h3>
                <p className="text-sm rc-muted leading-relaxed">Epic, Cerner, Tebra, DrChrono, eCW, Elation, ModMed, NextGen, PracticeFusion, athenahealth. SMART on FHIR OAuth with PKCE.</p>
              </div>
              <div className="mt-4 text-xs font-semibold flex items-center gap-1.5" style={s({ color: 'var(--rc-purple)' })}>
                <CheckCircle2 size={11} /> FHIR R4 · Da Vinci PAS
              </div>
            </div>

            {/* Small — Sentinel */}
            <div className="glass-card grad-border rounded-2xl p-8 flex flex-col justify-between min-h-[220px] reveal">
              <div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-5" style={s({ background: 'var(--rc-success-soft)', border: '1px solid color-mix(in srgb, var(--rc-success) 22%, transparent)' })}>
                  <Activity size={16} style={s({ color: 'var(--rc-success)' })} />
                </div>
                <h3 className="text-lg font-bold mb-2 rc-text">Sentinel: 24/7 monitor.</h3>
                <p className="text-sm rc-muted leading-relaxed">Runs every 15 minutes. Alerts on stale drafts, unresolved PAIA flags, expiring auths, and stuck prior auth submissions. Auto-recovers.</p>
              </div>
              <div className="mt-4 text-xs font-semibold flex items-center gap-1.5" style={s({ color: 'var(--rc-success)' })}>
                <span className="animate-blink-dot w-1.5 h-1.5 rounded-full" style={s({ background: 'var(--rc-success)' })} />
                Always on · SMS + email alerts
              </div>
            </div>

            {/* Large — Appeal generation */}
            <div className="glass-card grad-border rounded-2xl p-8 md:col-span-2 flex flex-col justify-between min-h-[220px] reveal delay-1">
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={s({ background: 'var(--rc-cyan-soft)', border: '1px solid color-mix(in srgb, var(--rc-cyan) 22%, transparent)' })}>
                    <Brain size={16} style={s({ color: 'var(--rc-cyan)' })} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-cyan)' })}>Claude-powered</span>
                </div>
                <h3 className="text-xl font-bold mb-2 rc-text">Denial? Generate an appeal in seconds.</h3>
                <p className="text-sm rc-muted leading-relaxed max-w-md">When a payer denies, RefChain generates a clinical appeal letter using the referral's diagnosis codes, clinical notes, and denial reason. PAIA's denial model updates in real time from every outcome.</p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-semibold rc-faint">
                {['Risk scoring', 'Provider matching', 'Approval prediction', 'Leakage analytics'].map(f => (
                  <span key={f} className="flex items-center gap-1.5">
                    <CheckCircle2 size={11} style={s({ color: 'var(--rc-accent)' })} /> {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Small — Policy rules */}
            <div className="glass-card grad-border rounded-2xl p-8 flex flex-col justify-between min-h-[200px] reveal">
              <div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-5" style={s({ background: 'var(--rc-warning-soft)', border: '1px solid color-mix(in srgb, var(--rc-warning) 22%, transparent)' })}>
                  <Lock size={16} style={s({ color: 'var(--rc-warning)' })} />
                </div>
                <h3 className="text-lg font-bold mb-2 rc-text">Payer rules. Live-editable.</h3>
                <p className="text-sm rc-muted leading-relaxed">Policy rules backed by real denial data. Edit at runtime. Cache refreshes instantly. PAIA learns from every outcome.</p>
              </div>
              <div className="mt-4 text-xs font-semibold flex items-center gap-1.5" style={s({ color: 'var(--rc-warning)' })}>
                <CheckCircle2 size={11} /> BCBS TX · UHC TX MA + universal defaults
              </div>
            </div>

            {/* Small — HIPAA */}
            <div className="glass-card grad-border rounded-2xl p-8 flex flex-col justify-between min-h-[200px] reveal delay-1">
              <div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-5" style={s({ background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}>
                  <ShieldCheck size={16} style={s({ color: 'var(--rc-accent)' })} />
                </div>
                <h3 className="text-lg font-bold mb-2 rc-text">HIPAA audit log. Every action.</h3>
                <p className="text-sm rc-muted leading-relaxed">Every AI decision, human override, and admin action logged with before/after state, actor, IP, and timestamp.</p>
              </div>
              <div className="mt-4 text-xs font-semibold flex items-center gap-1.5" style={s({ color: 'var(--rc-accent)' })}>
                <CheckCircle2 size={11} /> SHA-256 tamper-evident chain
              </div>
            </div>

            {/* Pricing preview card */}
            <div
              className="glass-card grad-border rounded-2xl p-8 flex flex-col justify-between min-h-[200px] reveal delay-2"
              style={s({ border: '1px solid color-mix(in srgb, var(--rc-accent) 25%, transparent)', background: 'var(--rc-accent-soft)' })}
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-4" style={s({ color: 'var(--rc-accent)' })}>Starter</p>
                <p className="text-4xl font-black mb-1 rc-text">$99<span className="text-lg font-medium rc-muted">/mo</span></p>
                <p className="text-xs rc-muted mb-4">Up to 5 providers · Flat rate · No per-referral fees</p>
                <ul className="space-y-1.5 text-xs rc-muted">
                  {['PAIA pre-auth agent', 'NPI onboarding', 'Referral wizard + PAIA', 'Sentinel monitoring'].map(f => (
                    <li key={f} className="flex items-center gap-1.5">
                      <CheckCircle2 size={10} style={s({ color: 'var(--rc-accent)' })} className="shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                href="/onboarding"
                className="mt-6 w-full text-center text-xs font-bold text-white py-2.5 rounded-lg transition-colors"
                style={s({ background: 'var(--rc-accent)' })}
              >
                Start free →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Pricing ═══════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-24 px-6 rc-divider">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3 rc-faint">Pricing</p>
            <h2 className="text-3xl md:text-4xl font-black rc-text">Transparent. No surprises.</h2>
            <p className="rc-muted text-sm mt-3">Flat-rate for practices. Usage-based for EHR partners. No per-referral fees ever.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                name: 'Starter', price: '$99', per: '/mo flat',
                desc: 'Built for independent PCPs with 1–5 providers. Everything to survive the UHC mandate.',
                features: ['Up to 5 providers', '500 referrals/month', 'PAIA pre-auth agent', 'NPI onboarding', 'Referral wizard', 'Sentinel monitoring', 'SMS notifications'],
                cta: 'Start with your NPI', highlight: false,
              },
              {
                name: 'Professional', price: '$49', per: '/provider/mo',
                desc: '6–25 providers. Multi-location groups, multi-specialty practices, growing independent networks.',
                features: ['Up to 25 providers', '2,000 referrals/month', 'Everything in Starter', 'EHR connect (SMART OAuth)', 'AI leakage analytics', 'Custom policy rules', 'Priority support'],
                cta: 'Get started', highlight: true,
              },
              {
                name: 'Enterprise / API', price: 'Custom', per: '',
                desc: 'Unlimited providers. EHR white-label. For Tebra, DrChrono, eCW, and regional health systems.',
                features: ['Unlimited providers + referrals', 'White-label API access', 'FHIR R4 full integration', 'Da Vinci PAS compliance', 'SLA + dedicated support', 'Custom payer rules', 'Revenue share model'],
                cta: 'Contact us', highlight: false,
              },
            ].map(({ name, price, per, desc, features, cta, highlight }, i) => (
              <div
                key={name}
                className={`rounded-2xl p-8 flex flex-col grad-border reveal ${i === 0 ? '' : i === 2 ? 'delay-2' : ''}`}
                style={s({
                  background: highlight ? `color-mix(in srgb, var(--rc-accent) 6%, var(--rc-surface))` : 'var(--rc-surface)',
                  border: `1px solid ${highlight ? 'color-mix(in srgb, var(--rc-accent) 30%, transparent)' : 'var(--rc-border)'}`,
                  boxShadow: highlight ? 'var(--rc-shadow-md)' : 'var(--rc-shadow-sm)',
                  transitionDelay: `${i * 0.09}s`,
                })}
              >
                {highlight && (
                  <div className="text-xs font-bold rounded-full px-3 py-1 w-fit mb-4" style={s({ color: 'var(--rc-accent)', background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}>
                    Most popular
                  </div>
                )}
                <p className="text-sm font-bold mb-1 rc-muted">{name}</p>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-black rc-text">{price}</span>
                  {per && <span className="text-sm rc-muted mb-1">{per}</span>}
                </div>
                <p className="text-xs rc-muted leading-relaxed mb-6">{desc}</p>
                <ul className="space-y-2 mb-8 flex-1">
                  {features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs rc-muted">
                      <CheckCircle2 size={11} style={s({ color: highlight ? 'var(--rc-accent)' : 'var(--rc-text-faint)' })} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={name === 'Enterprise / API' ? '#contact' : '/onboarding'}
                  className="text-sm font-bold py-3 rounded-xl text-center transition-colors"
                  style={s(highlight
                    ? { background: 'var(--rc-accent)', color: '#fff' }
                    : { border: '1px solid var(--rc-border-2)', color: 'var(--rc-text-muted)', background: 'var(--rc-accent-soft)' }
                  )}
                >
                  {cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Mandate CTA ═══════════════════════════════════════════════════════ */}
      <section className="relative py-32 px-6 overflow-hidden rc-divider" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[700px] h-[400px] rounded-full animate-mesh-a" style={s({ background: 'radial-gradient(ellipse, var(--rc-mesh-a) 0%, transparent 70%)', filter: 'blur(60px)' })} />
        </div>
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative z-10 max-w-3xl mx-auto text-center reveal">
          <p className="text-xs font-bold uppercase tracking-widest mb-4" style={s({ color: 'var(--rc-warning)' })}>The clock is running</p>
          <h2 className="text-4xl md:text-5xl font-black leading-tight mb-6 rc-text">
            {daysUntilMandate} days until the mandate.
            <br />
            <span className="rc-muted">Your practice needs this now.</span>
          </h2>
          <p className="rc-muted text-sm max-w-xl mx-auto mb-10 leading-relaxed">
            UHC is already requiring referrals for Medicare Advantage PCPs. CMS-0057-F follows in January 2027. Independent practices not on FHIR-native infrastructure will face denial rates they can't survive.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 text-white font-bold px-10 py-4 rounded-xl transition-all text-base"
            style={s({ background: 'var(--rc-accent)', boxShadow: '0 0 40px color-mix(in srgb, var(--rc-accent) 35%, transparent)' })}
          >
            Enter your NPI <ArrowRight size={17} />
          </Link>
          <p className="text-xs mt-5 rc-faint">Free to start · HIPAA compliant · No IT required</p>
        </div>
      </section>

      {/* ══ Footer ════════════════════════════════════════════════════════════ */}
      <footer className="rc-divider py-10 px-6" style={s({ background: 'var(--rc-surface)' })}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-bold rc-text text-sm">RefChain</span>
            <span className="text-xs rc-faint">Healthcare Referral Infrastructure · FHIR R4 Native</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs rc-faint">
            <Link href="/login"      className="hover:rc-muted transition-colors" style={s({ color: 'var(--rc-text-faint)' })}>Sign in</Link>
            <Link href="/onboarding" className="hover:rc-muted transition-colors" style={s({ color: 'var(--rc-text-faint)' })}>Get started</Link>
            <span>HIPAA compliant</span>
            <span>CMS-0057-F ready</span>
            <span>FHIR R4 · Da Vinci PAS</span>
          </div>
          <div className="flex items-center gap-2 text-xs rc-faint">
            <span>api@refchain.ai</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ─── Activity Card (floating hero decoration) ────────────────────────────────

function ActivityCard({ accent, icon, label, text, sub }: {
  accent: string; icon: string; label: string; text: string; sub: string
}) {
  return (
    <div
      className="activity-card"
      style={{ borderTop: `2px solid ${accent}` } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent } as React.CSSProperties}>{label}</span>
      </div>
      <p className="text-xs font-semibold" style={{ color: 'var(--rc-text)' } as React.CSSProperties}>{text}</p>
      <p className="text-[10px] mt-0.5" style={{ color: 'var(--rc-text-muted)' } as React.CSSProperties}>{sub}</p>
    </div>
  )
}
