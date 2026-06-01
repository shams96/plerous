'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react'
import { authFetch } from '@/lib/session'

const KNOWN_EHR: { label: string; url: string; badge?: string; smartSupported?: boolean }[] = [
  // Enterprise / mid-market
  { label: 'Epic (Sandbox)',                 url: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',                                    badge: 'Enterprise',  smartSupported: true },
  { label: 'Cerner / Oracle Health (Sandbox)', url: 'https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',                  badge: 'Enterprise',  smartSupported: true },

  // Small–mid practice
  { label: 'eClinicalWorks (eCW)',           url: 'https://fhir.eclinicalworks.com/fhir/r4',                                                       badge: 'Small–Mid',   smartSupported: true },
  { label: 'athenahealth (Sandbox)',         url: 'https://api.preview.platform.athenahealth.com/fhir/r4',                                         badge: 'Small–Mid',   smartSupported: true },
  { label: 'Tebra (formerly Kareo)',         url: 'https://api.kareo.com/fhir/r4',                                                                 badge: 'Small–Mid',   smartSupported: false },
  { label: 'Practice Fusion / Veradigm',    url: 'https://sandbox.practicefusion.com/fhir/r4',                                                    badge: 'Small–Mid',   smartSupported: true },
  { label: 'NextGen Healthcare',             url: 'https://fhir.nextgen.com/nge/prod/fhir-api-proxy/fhir/r4',                                      badge: 'Small–Mid',   smartSupported: true },
  { label: 'DrChrono',                       url: 'https://drchrono.com/fhir/r4',                                                                  badge: 'Small–Mid',   smartSupported: true },

  // Specialty-first
  { label: 'Modernizing Medicine (ModMed)', url: 'https://fhir.modmed.com/fhir/r4/sandbox',                                                       badge: 'Specialty',   smartSupported: false },

  // Direct Primary Care
  { label: 'Elation Health',               url: 'https://sandbox.elationhealth.com/fhir/r4',                                                      badge: 'DPC / PCP',   smartSupported: true },
]

type ConnectResult = { status: 'active' | 'pending_review'; displayName?: string; confidenceScore?: number }

export default function EHRConnectForm() {
  const [url,          setUrl]          = useState('')
  const [mode,         setMode]         = useState<'auto' | 'smart'>('auto')
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<ConnectResult | null>(null)
  const [error,        setError]        = useState('')

  const selectedEHR = KNOWN_EHR.find((e) => e.url === url)

  async function handleAutoDiscover(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const data = await authFetch<{ data: ConnectResult }>('/v1/ehr/connect', {
        method: 'POST',
        body: JSON.stringify({ fhirBaseUrl: url }),
      })
      setResult(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSmartLaunch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await authFetch<{ authUrl: string }>('/v1/ehr/smart-launch', {
        method: 'POST',
        body: JSON.stringify({ fhirBaseUrl: url }),
      })
      // Redirect browser to the EHR's authorization server
      window.location.href = data.authUrl
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Could not start SMART launch')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <p className="text-xs text-slate-400 mb-3">Quick-select a known EHR or enter a custom FHIR base URL:</p>

      {/* EHR picker */}
      <div className="flex flex-wrap gap-2 mb-4">
        {KNOWN_EHR.map((ehr) => (
          <button
            key={ehr.url}
            onClick={() => { setUrl(ehr.url); setError(''); setResult(null) }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              url === ehr.url
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-stone-200 text-slate-600 hover:border-blue-300'
            }`}
          >
            {ehr.label}
            {ehr.smartSupported && (
              <ShieldCheck size={9} className="inline ml-1 opacity-70" />
            )}
          </button>
        ))}
      </div>

      {/* URL input */}
      <input
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(''); setResult(null) }}
        placeholder="https://your-ehr.example.com/fhir/r4"
        className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
      />

      {/* Mode selector */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('smart')}
          disabled={!url || (!!selectedEHR && !selectedEHR.smartSupported)}
          className={`flex-1 text-xs py-2 rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
            mode === 'smart'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'border-stone-200 text-slate-600 hover:border-blue-300'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <ShieldCheck size={12} />
          SMART on FHIR OAuth
          <span className="text-xs opacity-70">(recommended)</span>
        </button>
        <button
          onClick={() => setMode('auto')}
          disabled={!url}
          className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${
            mode === 'auto'
              ? 'bg-slate-700 text-white border-slate-700'
              : 'border-stone-200 text-slate-600 hover:border-slate-300'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          Auto-discover only
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-slate-400 mb-3">
        {mode === 'smart'
          ? 'You\'ll be redirected to your EHR to log in and grant access. Tokens are stored securely and used to read patient and coverage data for referrals.'
          : 'Plerous will fingerprint the FHIR endpoint and identify the EHR system without OAuth. Read access requires SMART on FHIR.'}
      </p>

      <form onSubmit={mode === 'smart' ? handleSmartLaunch : handleAutoDiscover}>
        <button
          type="submit"
          disabled={loading || !url}
          className="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          {loading
            ? (mode === 'smart' ? 'Launching SMART auth…' : 'Auto-discovering EHR…')
            : (mode === 'smart' ? 'Connect via SMART on FHIR' : 'Connect & Auto-Discover')}
        </button>
      </form>

      {result && (
        <div className={`mt-4 rounded-lg p-3 flex items-start gap-2 text-sm ${
          result.status === 'active' ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'
        }`}>
          <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              {result.status === 'active' ? 'Connected' : 'Queued for Review'}
            </p>
            {result.displayName && <p className="text-xs opacity-80">{result.displayName}</p>}
            {result.confidenceScore != null && (
              <p className="text-xs opacity-70">
                Confidence: {(result.confidenceScore * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg p-3 flex items-start gap-2 text-sm bg-red-50 text-red-700">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
