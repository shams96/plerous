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
import Term from '@/components/Term'

// ─── Plerous spiral logo mark ────────────────────────────────────────────────

function PlerousLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      {/* Outer arc — open spiral, starts 12 o'clock, clockwise ~300° */}
      <path d="M50 8 A42 42 0 1 1 14 68" stroke="#5C2D8E" strokeWidth="5.5" strokeLinecap="round" opacity="0.90"/>
      {/* Second arc — slightly smaller, offset start */}
      <path d="M50 17 A33 33 0 1 1 20 68" stroke="#5C2D8E" strokeWidth="4.5" strokeLinecap="round" opacity="0.72"/>
      {/* Third inner arc */}
      <path d="M50 27 A23 23 0 1 1 28 65" stroke="#7B3DB8" strokeWidth="3.5" strokeLinecap="round" opacity="0.60"/>
      {/* Innermost tight arc */}
      <path d="M50 36 A14 14 0 1 1 36 62" stroke="#9B59D3" strokeWidth="2.5" strokeLinecap="round" opacity="0.45"/>
      {/* Amber center — the "Pleroma" circle */}
      <circle cx="50" cy="50" r="11" fill="#E8941A"/>
      <circle cx="50" cy="50" r="6"  fill="#F5B53A"/>
    </svg>
  )
}

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
  if (cookieStore.get('pl_token')?.value) redirect('/referrals')

  const daysUntilMandate = Math.ceil(
    (new Date('2027-01-01').getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )

  return (
    <div className="landing grain-overlay min-h-screen overflow-x-hidden">
      <LandingClient />

      {/* ══ Fixed Nav ═════════════════════════════════════════════════════════ */}
      <div
        className="landing-nav rc-glass fixed top-0 inset-x-0 z-50 border-b"
        style={s({ backdropFilter: 'blur(24px)' })}
      >
        <nav className="flex items-center justify-between px-6 md:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <PlerousLogo size={22} />
            <span className="text-base font-bold tracking-tight rc-text">Plerous</span>
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
              className="rc-btn-cta inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl"
              style={s({ boxShadow: '0 0 24px color-mix(in srgb, var(--rc-accent) 35%, transparent)' })}
            >
              Start free <ArrowRight size={13} />
            </Link>
          </div>
        </nav>
      </div>

      {/* ══ Hero ══════════════════════════════════════════════════════════════ */}
      <section className="hero-clip relative min-h-screen flex flex-col items-center justify-center pt-20 px-6 overflow-hidden">

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
          {/* Eyebrow — human-scale stat, not a compliance badge */}
          <div className="animate-fade-up flex items-center justify-center gap-2.5 mb-10 flex-wrap">
            <span
              className="flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5"
              style={s({ color: 'var(--rc-accent)', background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}
            >
              <span className="animate-blink-dot w-1.5 h-1.5 rounded-full shrink-0" style={s({ background: 'var(--rc-accent)' })} />
              1 in 3 referrals never reach the specialist
            </span>
            <span
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5"
              style={s({ color: 'var(--rc-warning)', background: 'var(--rc-warning-soft)', border: '1px solid color-mix(in srgb, var(--rc-warning) 25%, transparent)' })}
            >
              <span className="animate-blink-dot w-1.5 h-1.5 rounded-full shrink-0" style={s({ background: 'var(--rc-warning)' })} />
              CMS-0057-F: {daysUntilMandate} days until mandate
            </span>
          </div>

          {/* Headline — the brand command, villain-first */}
          <h1 className="animate-fade-up delay-100 font-black leading-none tracking-tight mb-6 hero-glow">
            <span className="text-shimmer block" style={s({ fontSize: 'clamp(72px,11vw,128px)', fontWeight: 900, letterSpacing: '-0.03em' })}>
              Close the loop.
            </span>
            <span className="block mt-4 rc-text" style={s({ fontSize: 'clamp(18px,2.6vw,32px)', fontWeight: 700, lineHeight: 1.3, maxWidth: '820px', margin: '16px auto 0' })}>
              Independent practices, physician groups, imaging centers, and surgical facilities
              lose millions every year to referrals that disappear, authorizations that stall,
              and hand-offs no one follows up on.
            </span>
            <span className="block mt-4 rc-muted" style={s({ fontSize: 'clamp(15px,1.8vw,22px)', fontWeight: 500, lineHeight: 1.3 })}>
              Plerous is the closed-loop referral infrastructure that ends it.
            </span>
          </h1>

          {/* CTAs */}
          <div className="animate-fade-up delay-200 flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 mb-8">
            <Link
              href="/onboarding"
              className="rc-btn-cta inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base"
              style={s({ boxShadow: '0 0 40px color-mix(in srgb, var(--rc-accent) 35%, transparent)' })}
            >
              Close the loop for your practice <ArrowRight size={17} />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 font-semibold px-8 py-4 rounded-xl transition-all text-base rc-text"
              style={s({ border: '1px solid var(--rc-border-2)', background: 'var(--rc-accent-soft)' })}
            >
              Sign in
            </Link>
          </div>

          {/* Trust strip — compliance belongs here, supporting the decision, not leading the story */}
          <div className="animate-fade-up delay-300 flex flex-wrap items-center justify-center gap-5 text-xs font-medium rc-faint">
            {[
              { key: 'hipaa',   node: <>HIPAA compliant</> },
              { key: 'fhir',    node: <><Term name="fhir-r4">FHIR R4</Term> native</> },
              { key: 'cms',     node: <><Term name="cms-0057">CMS-0057-F</Term> ready (Jan 2027)</> },
              { key: 'davinci', node: <><Term name="davinci-pas">Da Vinci PAS</Term></> },
              { key: 'free',    node: <>Free to start</> },
            ].map(({ key, node }) => (
              <span key={key} className="flex items-center gap-1.5">
                <CheckCircle2 size={11} style={s({ color: 'var(--rc-accent)' })} /> {node}
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
        <div className="marquee-wrap flex whitespace-nowrap">
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
            { value: 33,     prefix: '',  suffix: '%', label: 'of referrals never\nreach the specialist',  accent: 'var(--rc-accent)',   icon: DollarSign },
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

      {/* ══ Who Plerous Serves ════════════════════════════════════════════════ */}
      <section className="py-20 px-6 rc-divider">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>Built for every part of the referral chain</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: '🩺',
                segment: 'Independent Practices',
                sub: '1–5 providers',
                headline: 'Stop losing revenue to the referral black hole.',
                body: 'You built this practice. You shouldn\'t be losing $971K/yr because referrals disappear between providers. Plerous catches every one.',
                cta: 'Built for independent PCPs',
                accent: 'var(--rc-accent)',
              },
              {
                icon: '🏢',
                segment: 'Physician Groups',
                sub: '6–25 providers',
                headline: 'Scale your network. Not your admin burden.',
                body: 'Your coordinators should be caring for patients, not chasing specialists. Plerous automates the entire referral loop across your whole group.',
                cta: 'Built for groups',
                accent: 'var(--rc-success)',
              },
              {
                icon: '🏥',
                segment: 'Hospitals, Imaging & Surgery Centers',
                sub: 'Any size facility',
                headline: 'Own every inbound referral from first contact to booked procedure.',
                body: 'Every incomplete referral packet is a procedure that doesn\'t happen. Plerous ensures inbound referrals arrive complete, authorized, and scheduled.',
                cta: 'Built for facilities',
                accent: 'var(--rc-purple)',
              },
            ].map(({ icon, segment, sub, headline, body, cta, accent }, i) => (
              <div
                key={segment}
                className="glass-card tilt-card spring-hover rounded-2xl p-7 flex flex-col gap-4 reveal"
                style={s({ transitionDelay: `${i * 0.1}s`, borderTop: `3px solid ${accent}` })}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="text-sm font-black rc-text">{segment}</p>
                    <p className="text-xs rc-faint">{sub}</p>
                  </div>
                </div>
                <p className="text-base font-bold leading-snug rc-text">{headline}</p>
                <p className="text-sm rc-muted leading-relaxed flex-1">{body}</p>
                <Link
                  href="/onboarding"
                  className="text-xs font-bold flex items-center gap-1.5 mt-2"
                  style={s({ color: accent })}
                >
                  {cta} <ArrowRight size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ The Loop Problem ══════════════════════════════════════════════════ */}
      <section className="py-24 px-6 rc-divider" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>The referral black hole</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4 rc-text">
              Healthcare is open-loop.<br />
              <span className="rc-muted">We close it.</span>
            </h2>
            {/* Cinematic micro-story — from the coordinator's perspective */}
            <div
              className="max-w-2xl mx-auto mt-8 text-left rounded-2xl p-8 reveal"
              style={s({ background: 'var(--rc-surface)', border: '1px solid var(--rc-border)', borderLeft: '3px solid var(--rc-accent)' })}
            >
              <p className="text-sm leading-8 rc-muted font-medium space-y-1">
                Your coordinator sends the referral.<br />
                She calls to confirm. No answer.<br />
                She calls again Tuesday. Voicemail.<br />
                By Thursday, nobody knows if the specialist received it.<br />
                The patient calls your front desk Friday, asking what happened.<br />
                <span className="block mt-4 rc-text-2">Two hours of staff time later, you find out:</span>
                the authorization was never submitted.<br />
                The appointment was never booked.<br />
                The revenue is gone.
              </p>
              <p className="mt-6 text-sm font-bold" style={s({ color: 'var(--rc-accent)' })}>
                This is happening right now — in 1 in 3 of your referrals.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-5">
            {/* Before */}
            <div className="loop-card reveal delay-1 flex-1" style={s({ borderColor: 'color-mix(in srgb, var(--rc-danger) 25%, transparent)', background: 'var(--rc-danger-soft)' })}>
              <p className="text-xs font-bold uppercase tracking-wider mb-6" style={s({ color: 'var(--rc-danger)' })}>Without Plerous</p>
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
              <div className="mt-6 text-xl font-black" style={s({ color: 'var(--rc-danger)' })}>Industry avg: ~$971K at risk / physician / yr <span className="text-sm font-normal opacity-60">(MGMA 2022)</span></div>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center px-2">
              <ArrowRight size={32} style={s({ color: 'var(--rc-accent)', opacity: 0.5 })} />
            </div>

            {/* After */}
            <div className="loop-card reveal delay-2 flex-1" style={s({ borderColor: 'color-mix(in srgb, var(--rc-success) 30%, transparent)', background: 'var(--rc-success-soft)' })}>
              <p className="text-xs font-bold uppercase tracking-wider mb-6" style={s({ color: 'var(--rc-success)' })}>With Plerous</p>
              <div className="flex flex-col gap-2">
                {[
                  { icon: '✅', text: <>You submit the referral — already checked by <Term name="paia">PAIA</Term></> },
                  { icon: '📤', text: <>Plerous sends it the way the specialist already works — fax, secure link, or <Term name="direct-message">Direct message</Term></> },
                  { icon: '🛡️', text: <><Term name="sentinel">Sentinel</Term> watches it 24/7 and chases until the specialist confirms</> },
                  { icon: '✅', text: <>Plerous gets the <Term name="prior-auth">prior authorization</Term> approved and the patient booked</> },
                  { icon: '💰', text: <>Loop closed. Revenue confirmed.</> },
                ].map(({ icon, text }, i) => (
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
              <div className="mt-6 text-xl font-black" style={s({ color: 'var(--rc-success)' })}>30–55% estimated improvement in completion rates <span className="text-sm font-normal opacity-60">(varies by adoption)</span></div>
            </div>
          </div>

          {/* Single-sided reassurance — answers "what if the specialist isn't on Plerous?" */}
          <p className="text-center text-sm rc-muted max-w-2xl mx-auto mt-10 reveal">
            Works with every specialist you refer to — <span className="rc-text font-semibold">whether or not they use Plerous.</span>{' '}
            We meet them on the rails they already use, so the loop closes from day one.
          </p>
        </div>
      </section>

      {/* ══ Leakage Calculator ════════════════════════════════════════════════ */}
      <LeakageCalculator />

      {/* ══ PAIA Pipeline ═════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-24 px-6 rc-divider" style={s({ background: 'var(--rc-surface-2)' })}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-xl reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>Intelligence at every hand-off</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight mb-4 rc-text">
              The check that catches every gap<br />
              <span className="rc-muted">before it becomes a denial.</span>
            </h2>
            <p className="text-sm rc-muted leading-relaxed">
              Before your coordinator hits submit, Plerous has already checked eligibility, scanned the clinical notes, matched the diagnosis codes, and flagged every documentation gap that payers use to deny claims. Four checks. Under 90 seconds. Every time. We call this engine <Term name="paia">PAIA</Term>.
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
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={s({ color: 'var(--rc-accent)' })}>10 agents. Every gap covered.</p>
            <h2 className="text-3xl md:text-4xl font-black leading-tight rc-text mb-3">
              Your invisible team.<br />
              <span className="rc-muted">Working every gap, around the clock.</span>
            </h2>
            <p className="text-sm rc-muted max-w-xl">No per-seat SaaS tax. No integration overhead. Each agent closes a specific gap in your referral loop — with full context, autonomous action, and a complete audit trail.</p>
          </div>

          <div className="scroll-row reveal">
            {AGENTS.map((agent) => (
              <div key={agent.name} className="agent-card tilt-card spring-hover">
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
            <p className="text-xs font-bold uppercase tracking-widest mb-3 rc-faint">Everything to own the loop</p>
            <h2 className="text-3xl md:text-4xl font-black rc-text">Everything independent medicine needs to close every gap.</h2>
            <p className="rc-muted text-sm mt-3 max-w-xl mx-auto">Not a referral form. Not a portal. The full closed-loop infrastructure — from NPI onboarding to payer submission to denial appeal generation.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Large — NPI onboarding */}
            <div className="glass-card grad-border tilt-card rounded-2xl p-8 md:col-span-2 flex flex-col justify-between min-h-[220px] reveal">
              <div>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={s({ background: 'var(--rc-accent-soft)', border: '1px solid var(--rc-border-2)' })}>
                    <Database size={16} style={s({ color: 'var(--rc-accent)' })} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider" style={s({ color: 'var(--rc-accent)' })}>NPI-first onboarding</span>
                </div>
                <h3 className="text-xl font-bold mb-2 rc-text">Zero-question setup.</h3>
                <p className="text-sm rc-muted leading-relaxed max-w-md">Enter your NPI. Plerous pulls your name, specialty, address, phone, fax, and license from CMS NPPES automatically. Creates your org, provider record, and account in one transaction.</p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold" style={s({ color: 'var(--rc-accent)' })}>
                <Zap size={12} /> Under 60 seconds from NPI to first referral
              </div>
            </div>

            {/* Small — EHR */}
            <div className="glass-card grad-border tilt-card rounded-2xl p-8 flex flex-col justify-between min-h-[220px] reveal delay-1">
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
            <div className="glass-card grad-border tilt-card rounded-2xl p-8 flex flex-col justify-between min-h-[220px] reveal">
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
                <p className="text-sm rc-muted leading-relaxed max-w-md">When a payer denies, Plerous generates a clinical appeal letter using the referral's diagnosis codes, clinical notes, and denial reason. PAIA's denial model updates in real time from every outcome.</p>
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

            {/* HIPAA — spans 2 to fill the row after the pricing card moved to the Pricing section */}
            <div className="glass-card grad-border tilt-card rounded-2xl p-8 md:col-span-2 flex flex-col justify-between min-h-[200px] reveal delay-1">
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

          </div>
        </div>
      </section>

      {/* ══ Pricing ═══════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-24 px-6 rc-divider">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p className="text-xs font-bold uppercase tracking-widest mb-3 rc-faint">Pricing as clean as the loop we close.</p>
            <h2 className="text-3xl md:text-4xl font-black rc-text">Transparent. No surprises.</h2>
            <p className="rc-muted text-sm mt-3">Flat-rate for practices. Usage-based for EHR partners. No per-referral fees. Ever.</p>
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
                className={`rounded-2xl p-8 flex flex-col grad-border tilt-card spring-hover reveal ${highlight ? 'pricing-featured' : ''} ${i === 0 ? '' : i === 2 ? 'delay-2' : ''}`}
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
            className="rc-btn-cta inline-flex items-center gap-2 px-10 py-4 rounded-xl text-base"
            style={s({ boxShadow: '0 0 40px color-mix(in srgb, var(--rc-accent) 35%, transparent)' })}
          >
            Close the loop for your practice <ArrowRight size={17} />
          </Link>
          <p className="text-xs mt-5 rc-faint">Free to start · HIPAA compliant · No IT required</p>

          {/* Brand promise — emotional close */}
          <div className="mt-16 pt-10" style={s({ borderTop: '1px solid var(--rc-border)' })}>
            <p
              className="font-black tracking-tight rc-text"
              style={s({ fontSize: 'clamp(22px,3.5vw,42px)', lineHeight: 1.1 })}
            >
              Every referral. Every authorization.<br />Every patient.{' '}
              <span style={s({ color: 'var(--rc-accent)' })}>Closed.</span>
            </p>
            <p className="text-sm mt-3 rc-faint">Plerous closes the loop.</p>
          </div>
        </div>
      </section>

      {/* ══ Footer ════════════════════════════════════════════════════════════ */}
      <footer className="rc-divider py-10 px-6" style={s({ background: 'var(--rc-surface)' })}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <span className="font-bold rc-text text-sm">Plerous</span>
            <span className="text-xs rc-faint">Healthcare Closed-Loop Solutions · FHIR R4 Native</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs rc-faint">
            <Link href="/login"      className="hover:rc-muted transition-colors" style={s({ color: 'var(--rc-text-faint)' })}>Sign in</Link>
            <Link href="/onboarding" className="hover:rc-muted transition-colors" style={s({ color: 'var(--rc-text-faint)' })}>Get started</Link>
            <span>HIPAA compliant</span>
            <span>CMS-0057-F ready</span>
            <span>FHIR R4 · Da Vinci PAS</span>
          </div>
          <div className="flex items-center gap-2 text-xs rc-faint">
            <span>hello@plerous.com</span>
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
