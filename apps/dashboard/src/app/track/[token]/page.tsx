'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, Clock, AlertCircle, Calendar, Phone, Loader2, MapPin, ChevronRight } from 'lucide-react'

interface TrackingStop {
  status: string
  label: string
  timestamp: string
  note: string | null
  icon: string
}

interface TrackingData {
  trackingToken: string
  referralNumber: string
  specialty: string
  urgency: string
  status: string
  statusLabel: string
  patientFirstName: string
  referringPractice: string
  referringPhone: string | null
  specialist: string
  specialistPhone: string | null
  appointmentDate: string | null
  authNumber: string | null
  authExpires: string | null
  timeline: TrackingStop[]
  lastUpdated: string
  nextAction: string
}

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:      'text-green-600 bg-green-50 border-green-200',
  AUTH_APPROVED: 'text-green-600 bg-green-50 border-green-200',
  SCHEDULED:     'text-blue-600 bg-blue-50 border-blue-200',
  COMPLETED:     'text-green-700 bg-green-50 border-green-200',
  AUTH_DENIED:   'text-red-600 bg-red-50 border-red-200',
  CANCELLED:     'text-red-600 bg-red-50 border-red-200',
  EXPIRED:       'text-orange-600 bg-orange-50 border-orange-200',
  AUTH_PENDING:  'text-yellow-700 bg-yellow-50 border-yellow-200',
  SUBMITTED:     'text-blue-600 bg-blue-50 border-blue-200',
  PAIA_REVIEW:   'text-purple-600 bg-purple-50 border-purple-200',
  DRAFT:         'text-slate-500 bg-slate-50 border-slate-200',
}

const ACTIVE_STATUSES = ['SUBMITTED', 'RECEIVED', 'AUTH_PENDING', 'AUTH_APPROVED', 'PAIA_REVIEW']
const DONE_STATUSES   = ['SCHEDULED', 'COMPLETED']
const ALERT_STATUSES  = ['AUTH_DENIED', 'CANCELLED', 'EXPIRED', 'NO_SHOW']

export default function TrackPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData]       = useState<TrackingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    fetch(`/api/proxy/v1/referrals/track/${token}`)
      .then(r => r.json())
      .then(r => {
        if (r.success) setData(r.data)
        else setError(r.error ?? 'Tracking number not found.')
      })
      .catch(() => setError('Could not connect. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center">
      <Loader2 className="text-blue-400 animate-spin" size={32} />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
        <p className="text-white font-semibold text-lg mb-2">Tracking Number Not Found</p>
        <p className="text-white/50 text-sm">{error}</p>
        <p className="text-white/30 text-xs mt-4">Tracking: {token}</p>
      </div>
    </div>
  )

  const isAlert = ALERT_STATUSES.includes(data.status)
  const isDone  = DONE_STATUSES.includes(data.status)
  const isActive = ACTIVE_STATUSES.includes(data.status)

  return (
    <div className="min-h-screen bg-[#09090f] py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-[#9B59D3] font-semibold text-sm tracking-widest uppercase mb-1">Plerous</p>
          <p className="text-white/40 text-xs">Referral Tracking</p>
        </div>

        {/* Main status card */}
        <div className="bg-white rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400 font-mono mb-0.5">{data.trackingToken}</p>
              <h1 className="text-lg font-bold text-slate-900">{data.specialty} Referral</h1>
              {data.patientFirstName && (
                <p className="text-sm text-slate-500">for {data.patientFirstName}</p>
              )}
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLOR[data.status] ?? 'text-slate-600 bg-slate-50 border-slate-200'}`}>
              {data.statusLabel}
            </span>
          </div>

          {/* Progress bar — FedEx-style 4-step visual */}
          <TrackingBar status={data.status} />

          {/* Next action for patient */}
          <div className={`mt-4 rounded-xl p-4 ${
            isAlert  ? 'bg-red-50 border border-red-100' :
            isDone   ? 'bg-green-50 border border-green-100' :
            'bg-blue-50 border border-blue-100'
          }`}>
            <p className={`text-sm font-medium ${
              isAlert ? 'text-red-700' : isDone ? 'text-green-700' : 'text-blue-700'
            }`}>
              {isAlert ? '⚠️' : isDone ? '✅' : 'ℹ️'} {data.nextAction}
            </p>
          </div>
        </div>

        {/* Appointment card */}
        {data.appointmentDate && (
          <div className="bg-white rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Calendar size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Appointment</p>
              <p className="text-slate-900 font-semibold text-sm">
                {new Date(data.appointmentDate).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </p>
              <p className="text-slate-500 text-xs">
                {new Date(data.appointmentDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )}

        {/* Auth number */}
        {data.authNumber && (
          <div className="bg-white rounded-2xl p-5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Authorization Number</p>
            <p className="text-slate-900 font-mono font-semibold">{data.authNumber}</p>
            {data.authExpires && (
              <p className="text-xs text-slate-400 mt-0.5">
                Valid until {new Date(data.authExpires).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        )}

        {/* Timeline */}
        {data.timeline.length > 0 && (
          <div className="bg-white rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Activity Timeline</p>
            <ol className="relative border-l-2 border-slate-100 space-y-4 pl-5">
              {[...data.timeline].reverse().map((stop, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[25px] w-4 h-4 rounded-full bg-white border-2 border-blue-400 flex items-center justify-center text-[10px]">
                    {i === 0 ? '●' : '○'}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{stop.label}</p>
                    {stop.note && <p className="text-xs text-slate-500 mt-0.5">{stop.note}</p>}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(stop.timestamp).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Contact cards */}
        <div className="grid grid-cols-2 gap-3">
          {data.referringPractice && (
            <ContactCard
              label="Referring Practice"
              name={data.referringPractice}
              phone={data.referringPhone}
            />
          )}
          {data.specialist && (
            <ContactCard
              label="Specialist"
              name={data.specialist}
              phone={data.specialistPhone}
            />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-white/20 text-xs pb-4">
          Last updated {new Date(data.lastUpdated).toLocaleString()}<br />
          Powered by Plerous · HIPAA Compliant
        </p>
      </div>
    </div>
  )
}

/** FedEx-style 4-step progress bar */
function TrackingBar({ status }: { status: string }) {
  const steps = [
    { key: 'SUBMITTED',    label: 'Sent' },
    { key: 'RECEIVED',     label: 'Received' },
    { key: 'AUTH_APPROVED',label: 'Approved' },
    { key: 'SCHEDULED',    label: 'Scheduled' },
  ]

  const ORDER = ['DRAFT','PAIA_REVIEW','SUBMITTED','RECEIVED','AUTH_PENDING','AUTH_APPROVED','AUTH_DENIED','SCHEDULED','COMPLETED']
  const currentIdx = ORDER.indexOf(status)
  const stepIdx = (key: string) => ORDER.indexOf(key)
  const isDenied = status === 'AUTH_DENIED'

  return (
    <div className="flex items-center gap-0 mt-2">
      {steps.map((step, i) => {
        const done    = stepIdx(step.key) < currentIdx && !isDenied
        const active  = step.key === status || (step.key === 'AUTH_APPROVED' && status === 'AUTH_PENDING')
        const denied  = isDenied && step.key === 'AUTH_APPROVED'
        return (
          <div key={step.key} className="flex-1 flex flex-col items-center">
            <div className="w-full flex items-center">
              {i > 0 && <div className={`h-0.5 flex-1 ${done ? 'bg-blue-500' : 'bg-slate-200'}`} />}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                denied  ? 'bg-red-500 text-white' :
                done    ? 'bg-blue-500 text-white' :
                active  ? 'bg-blue-500 text-white ring-4 ring-blue-100' :
                'bg-slate-200 text-slate-400'
              }`}>
                {denied ? '✕' : done ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${done ? 'bg-blue-500' : 'bg-slate-200'}`} />}
            </div>
            <p className={`text-[10px] mt-1 font-medium ${active || done ? 'text-blue-600' : 'text-slate-400'}`}>
              {denied && i === 2 ? 'Denied' : step.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ContactCard({ label, name, phone }: { label: string; name: string; phone?: string | null }) {
  return (
    <div className="bg-white rounded-xl p-4">
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800 leading-tight">{name}</p>
      {phone && (
        <a href={`tel:${phone}`} className="flex items-center gap-1 mt-1.5 text-blue-500 text-xs hover:underline">
          <Phone size={10} /> {phone}
        </a>
      )}
    </div>
  )
}
