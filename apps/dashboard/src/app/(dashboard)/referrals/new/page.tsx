'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, ChevronRight, Loader2, AlertCircle, CheckCircle2,
  User, Stethoscope, FileText, Calendar, Shield
} from 'lucide-react'
import { authFetch } from '@/lib/session'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Patient {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  mrn?: string
  primaryInsurance?: { planName: string; payer: { name: string } }
}

interface Provider {
  id: string
  firstName: string
  lastName: string
  specialty: string
  npi: string
  organization?: { name: string }
}

// ── Common CPT codes by specialty (fast lookup for common referrals) ──────────
const COMMON_CPTS: Record<string, Array<{ code: string; desc: string }>> = {
  'Sleep Medicine': [
    { code: '95810', desc: 'Polysomnography (PSG) — unattended' },
    { code: '95811', desc: 'CPAP titration study' },
    { code: '95782', desc: 'Polysomnography — pediatric' },
    { code: '99213', desc: 'Office visit, established patient' },
  ],
  'Pulmonary Disease': [
    { code: '94010', desc: 'Spirometry' },
    { code: '94726', desc: 'Plethysmography — lung volumes' },
    { code: '94760', desc: 'Oximetry' },
    { code: '95811', desc: 'CPAP titration study' },
  ],
  'Cardiology': [
    { code: '93000', desc: 'ECG with interpretation' },
    { code: '93306', desc: 'Echocardiography, complete' },
    { code: '93458', desc: 'Cardiac catheterization' },
    { code: '93454', desc: 'Coronary angiography' },
  ],
  'Gastroenterology': [
    { code: '45378', desc: 'Colonoscopy, diagnostic' },
    { code: '43239', desc: 'Upper GI endoscopy with biopsy' },
    { code: '43235', desc: 'Upper endoscopy' },
  ],
  'Orthopedics': [
    { code: '27447', desc: 'Total knee arthroplasty' },
    { code: '27130', desc: 'Total hip arthroplasty' },
    { code: '29827', desc: 'Arthroscopic shoulder rotator cuff repair' },
    { code: '29881', desc: 'Arthroscopic knee meniscectomy' },
  ],
}

const COMMON_DIAGNOSES = [
  { code: 'G47.33', desc: 'Obstructive sleep apnea' },
  { code: 'G47.30', desc: 'Sleep apnea, unspecified' },
  { code: 'J44.1',  desc: 'COPD with acute exacerbation' },
  { code: 'J45.20', desc: 'Mild intermittent asthma' },
  { code: 'I10',    desc: 'Essential hypertension' },
  { code: 'E11.9',  desc: 'Type 2 diabetes without complications' },
  { code: 'M17.11', desc: 'Primary osteoarthritis, right knee' },
  { code: 'M16.11', desc: 'Primary osteoarthritis, right hip' },
  { code: 'Z87.891', desc: 'Personal history of nicotine dependence' },
]

type Step = 'patient' | 'specialist' | 'clinical' | 'review'

interface NewPatientForm {
  firstName: string
  lastName:  string
  dateOfBirth: string
  gender:    string
  phone:     string
}

export default function NewReferralPage() {
  const router = useRouter()

  // Form state
  const [step,            setStep]            = useState<Step>('patient')
  const [patientSearch,   setPatientSearch]   = useState('')
  const [patients,        setPatients]        = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  // Inline patient creation
  const [showNewPatientForm, setShowNewPatientForm] = useState(false)
  const [newPatient,       setNewPatient]      = useState<NewPatientForm>({ firstName: '', lastName: '', dateOfBirth: '', gender: 'male', phone: '' })
  const [creatingPatient,  setCreatingPatient] = useState(false)
  const [newPatientError,  setNewPatientError] = useState('')
  const [providerSearch,  setProviderSearch]  = useState('')
  const [providers,       setProviders]       = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [specialty,       setSpecialty]       = useState('')
  const [urgency,         setUrgency]         = useState('ROUTINE')
  const [reason,          setReason]          = useState('')
  const [diagCodes,       setDiagCodes]       = useState<string[]>([])
  const [procCodes,       setProcCodes]       = useState<string[]>([])
  const [clinicalNotes,   setClinicalNotes]   = useState('')
  const [requestedDate,   setRequestedDate]   = useState('')
  const [submitting,      setSubmitting]       = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const [searching,       setSearching]       = useState(false)

  // Search patients
  useEffect(() => {
    if (patientSearch.length < 2) { setPatients([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await authFetch<{ data: Patient[] }>(`/v1/patients?search=${encodeURIComponent(patientSearch)}&limit=6`)
        setPatients(data.data || [])
      } catch { setPatients([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [patientSearch])

  // Search specialists
  useEffect(() => {
    if (providerSearch.length < 2) { setProviders([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const q = specialty
          ? `/v1/providers?search=${encodeURIComponent(providerSearch)}&specialty=${encodeURIComponent(specialty)}&limit=6`
          : `/v1/providers?search=${encodeURIComponent(providerSearch)}&limit=6`
        const data = await authFetch<{ data: Provider[] }>(q)
        setProviders(data.data || [])
      } catch { setProviders([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [providerSearch, specialty])

  async function handleCreatePatient() {
    if (!newPatient.firstName || !newPatient.lastName || !newPatient.dateOfBirth || !newPatient.phone) return
    setCreatingPatient(true)
    setNewPatientError('')
    try {
      const data = await authFetch<{ data: Patient }>('/v1/patients', {
        method: 'POST',
        body: JSON.stringify({
          ...newPatient,
          dateOfBirth: new Date(newPatient.dateOfBirth).toISOString().split('T')[0],
        }),
      })
      setSelectedPatient(data.data)
      setShowNewPatientForm(false)
      setNewPatient({ firstName: '', lastName: '', dateOfBirth: '', gender: 'male', phone: '' })
      setPatientSearch('')
    } catch (e: unknown) {
      setNewPatientError(e instanceof Error ? e.message : 'Failed to create patient')
    } finally {
      setCreatingPatient(false)
    }
  }

  function toggleCode(arr: string[], set: (v: string[]) => void, code: string) {
    set(arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code])
  }

  async function handleSubmit() {
    if (!selectedPatient || !reason) return
    setSubmitting(true)
    setError(null)

    try {
      const data = await authFetch<{ data: { id: string; referralNumber: string } }>('/v1/referrals', {
        method: 'POST',
        body: JSON.stringify({
          patientId:           selectedPatient.id,
          receivingProviderId: selectedProvider?.id,
          specialty:           specialty || selectedProvider?.specialty || 'General',
          urgency,
          reason,
          diagnosisCodes:      diagCodes,
          procedureCodes:      procCodes,
          clinicalNotes:       clinicalNotes || undefined,
          requestedDate:       requestedDate || undefined,
          source:              'portal',
        }),
      })

      router.push(`/referrals/${data.data.id}?created=1`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create referral')
      setSubmitting(false)
    }
  }

  const suggestedCpts = specialty ? (COMMON_CPTS[specialty] || []) : []
  const canAdvancePatient  = !!selectedPatient
  const canAdvanceSpecialist = true // specialist is optional
  const canAdvanceClinical = !!reason && diagCodes.length > 0

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-slate-900">New Referral</h1>
        <p className="text-sm text-slate-500">
          PAIA will review before submission and catch likely denials automatically.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {(['patient', 'specialist', 'clinical', 'review'] as Step[]).map((s, i) => {
          const labels = { patient: 'Patient', specialist: 'Specialist', clinical: 'Clinical', review: 'Review' }
          const done = ['patient', 'specialist', 'clinical', 'review'].indexOf(step) > i
          const active = step === s
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                done   ? 'bg-green-500 text-white' :
                active ? 'bg-blue-600 text-white' :
                         'bg-slate-200 text-slate-500'
              }`}>
                {done ? <CheckCircle2 size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-slate-900' : 'text-slate-400'}`}>
                {labels[s]}
              </span>
              {i < 3 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Patient ──────────────────────────────────────────────────── */}
      {step === 'patient' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <User size={16} className="text-blue-500" /> Select patient
          </div>

          {selectedPatient ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedPatient.mrn && `MRN ${selectedPatient.mrn} · `}
                  DOB {new Date(selectedPatient.dateOfBirth).toLocaleDateString()}
                  {selectedPatient.primaryInsurance && ` · ${selectedPatient.primaryInsurance.payer.name}`}
                </p>
              </div>
              <button onClick={() => setSelectedPatient(null)} className="text-xs text-blue-600 hover:underline">
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  placeholder="Search by name or MRN…"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
              </div>
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPatient(p); setPatientSearch('') }}
                  className="w-full text-left px-3 py-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-slate-500">
                    {p.mrn && `MRN ${p.mrn} · `}
                    DOB {new Date(p.dateOfBirth).toLocaleDateString()}
                    {p.primaryInsurance && ` · ${p.primaryInsurance.payer.name}`}
                  </p>
                </button>
              ))}
              {patientSearch.length >= 2 && patients.length === 0 && !searching && !showNewPatientForm && (
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-400">No patients found for &quot;{patientSearch}&quot;</p>
                  <button
                    onClick={() => {
                      // Pre-fill first/last name from search if it looks like a name
                      const parts = patientSearch.trim().split(/\s+/)
                      setNewPatient(p => ({
                        ...p,
                        firstName: parts[0] ?? '',
                        lastName:  parts.slice(1).join(' ') ?? '',
                      }))
                      setShowNewPatientForm(true)
                    }}
                    className="text-xs text-blue-600 font-semibold hover:underline shrink-0 ml-3"
                  >
                    + New patient
                  </button>
                </div>
              )}

              {/* Inline new patient form */}
              {showNewPatientForm && (
                <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-800">New patient</p>
                    <button onClick={() => { setShowNewPatientForm(false); setNewPatientError('') }} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">First name *</label>
                      <input
                        value={newPatient.firstName}
                        onChange={e => setNewPatient(p => ({ ...p, firstName: e.target.value }))}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="Maria"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Last name *</label>
                      <input
                        value={newPatient.lastName}
                        onChange={e => setNewPatient(p => ({ ...p, lastName: e.target.value }))}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        placeholder="Rodriguez"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Date of birth *</label>
                      <input
                        type="date"
                        value={newPatient.dateOfBirth}
                        onChange={e => setNewPatient(p => ({ ...p, dateOfBirth: e.target.value }))}
                        max={new Date().toISOString().split('T')[0]}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1">Gender</label>
                      <select
                        value={newPatient.gender}
                        onChange={e => setNewPatient(p => ({ ...p, gender: e.target.value }))}
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        <option value="unknown">Prefer not to say</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Phone *</label>
                    <input
                      type="tel"
                      value={newPatient.phone}
                      onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))}
                      className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="(512) 555-0100"
                      required
                    />
                  </div>

                  {newPatientError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600">
                      <AlertCircle size={12} />
                      {newPatientError}
                    </div>
                  )}

                  <button
                    onClick={handleCreatePatient}
                    disabled={creatingPatient || !newPatient.firstName || !newPatient.lastName || !newPatient.dateOfBirth || !newPatient.phone}
                    className="w-full text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {creatingPatient && <Loader2 size={12} className="animate-spin" />}
                    {creatingPatient ? 'Creating…' : 'Create patient & continue'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStep('specialist')}
              disabled={!canAdvancePatient}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Specialist ───────────────────────────────────────────────── */}
      {step === 'specialist' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Stethoscope size={16} className="text-blue-500" /> Specialist & specialty
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Specialty</label>
            <select
              value={specialty}
              onChange={e => setSpecialty(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select specialty…</option>
              {['Sleep Medicine', 'Pulmonary Disease', 'Cardiology', 'Gastroenterology',
                'Orthopedics', 'Nephrology', 'Neurology', 'Oncology', 'Dermatology',
                'Endocrinology', 'Rheumatology', 'Psychiatry', 'Urology', 'Allergy & Immunology',
              ].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {selectedProvider ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Dr. {selectedProvider.firstName} {selectedProvider.lastName}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedProvider.specialty} · {selectedProvider.organization?.name} · NPI {selectedProvider.npi}
                </p>
              </div>
              <button onClick={() => setSelectedProvider(null)} className="text-xs text-blue-600 hover:underline">
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 block">Receiving provider <span className="text-slate-400">(optional)</span></label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={e => setProviderSearch(e.target.value)}
                  placeholder="Search by name or NPI…"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
              </div>
              {providers.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProvider(p); if (!specialty) setSpecialty(p.specialty) }}
                  className="w-full text-left px-3 py-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800">Dr. {p.firstName} {p.lastName}</p>
                  <p className="text-xs text-slate-500">
                    {p.specialty} · {p.organization?.name} · NPI {p.npi}
                  </p>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep('patient')} className="text-sm text-slate-500 hover:text-slate-700">
              Back
            </button>
            <button
              onClick={() => setStep('clinical')}
              disabled={!specialty}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Clinical ─────────────────────────────────────────────────── */}
      {step === 'clinical' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <FileText size={16} className="text-blue-500" /> Clinical details
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Reason for referral <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Suspected OSA, BMI 38, loud snoring, ESS 14"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Urgency */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Urgency</label>
            <div className="flex gap-2">
              {(['ROUTINE', 'URGENT', 'STAT', 'EMERGENCY'] as const).map(u => (
                <button
                  key={u}
                  onClick={() => setUrgency(u)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    urgency === u
                      ? u === 'EMERGENCY' ? 'bg-red-600 text-white border-red-600'
                      : u === 'STAT'      ? 'bg-orange-500 text-white border-orange-500'
                      : u === 'URGENT'    ? 'bg-yellow-500 text-white border-yellow-500'
                      :                     'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Diagnosis codes */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Diagnosis codes (ICD-10) <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_DIAGNOSES.map(d => (
                <button
                  key={d.code}
                  onClick={() => toggleCode(diagCodes, setDiagCodes, d.code)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    diagCodes.includes(d.code)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {d.code} <span className="opacity-70">{d.desc}</span>
                </button>
              ))}
            </div>
            {diagCodes.length > 0 && (
              <p className="text-xs text-green-600 mt-1.5 font-medium">
                {diagCodes.join(', ')} selected
              </p>
            )}
          </div>

          {/* Procedure codes */}
          {suggestedCpts.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                Procedure codes (CPT) <span className="text-slate-400">optional</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {suggestedCpts.map(p => (
                  <button
                    key={p.code}
                    onClick={() => toggleCode(procCodes, setProcCodes, p.code)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      procCodes.includes(p.code)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {p.code} <span className="opacity-70">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clinical notes */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Clinical notes <span className="text-slate-400">optional — PAIA reads these to auto-fix documentation gaps</span>
            </label>
            <textarea
              value={clinicalNotes}
              onChange={e => setClinicalNotes(e.target.value)}
              placeholder="Paste referral letter, office visit note, or relevant clinical history. PAIA will extract ESS scores, STOP-BANG results, AHI values, etc. automatically."
              rows={4}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Requested date */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Requested appointment date <span className="text-slate-400">optional</span>
            </label>
            <input
              type="date"
              value={requestedDate}
              onChange={e => setRequestedDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep('specialist')} className="text-sm text-slate-500 hover:text-slate-700">
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              disabled={!canAdvanceClinical}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Review <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Submit ──────────────────────────────────────────── */}
      {step === 'review' && selectedPatient && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Shield size={16} className="text-blue-500" /> Review & submit
          </div>

          <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Patient</span>
              <span className="font-medium">{selectedPatient.firstName} {selectedPatient.lastName}</span>
            </div>
            {selectedProvider && (
              <div className="flex justify-between">
                <span className="text-slate-500">Specialist</span>
                <span className="font-medium">Dr. {selectedProvider.firstName} {selectedProvider.lastName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Specialty</span>
              <span className="font-medium">{specialty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Urgency</span>
              <span className={`font-semibold ${
                urgency === 'EMERGENCY' ? 'text-red-600' :
                urgency === 'STAT'      ? 'text-orange-500' :
                urgency === 'URGENT'    ? 'text-yellow-600' : 'text-slate-700'
              }`}>{urgency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Diagnoses</span>
              <span className="font-medium">{diagCodes.join(', ')}</span>
            </div>
            {procCodes.length > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">Procedures</span>
                <span className="font-medium">{procCodes.join(', ')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Reason</span>
              <span className="font-medium text-right max-w-xs">{reason}</span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700 font-medium">PAIA will analyze before submission</p>
            <p className="text-xs text-blue-600 mt-0.5">
              If documentation is complete and denial risk is low, it submits automatically.
              If issues are found, you'll see them in the Review Queue.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep('clinical')} className="text-sm text-slate-500 hover:text-slate-700">
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg px-6 py-2.5 transition-colors disabled:opacity-50"
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Submitting…</>
                : <><Shield size={14} /> Submit referral</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
