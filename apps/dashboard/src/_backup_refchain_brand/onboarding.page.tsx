'use client'

import { useState } from 'react'
import { Search, CheckCircle2, Loader2, ArrowRight, Building2, MapPin, Phone, Stethoscope, AlertCircle } from 'lucide-react'

interface NPPESProfile {
  npi: string
  enumerationType: 'individual' | 'organization'
  firstName: string | null
  lastName: string | null
  credential: string | null
  orgName: string | null
  specialty: string | null
  specialtySlug: string | null
  phone: string | null
  fax: string | null
  practiceAddress: {
    line1: string | null
    city: string | null
    state: string | null
    zip: string | null
  } | null
  ehrHint: string[]
  status: string
}

interface LookupResult {
  found: boolean
  alreadyRegistered: boolean
  profile: NPPESProfile | null
}

type Step = 'enter_npi' | 'confirm_profile' | 'set_credentials' | 'connect_ehr' | 'done'

export default function OnboardingPage() {
  const [step, setStep]             = useState<Step>('enter_npi')
  const [npi, setNpi]               = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [result, setResult]         = useState<LookupResult | null>(null)
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [claiming, setClaiming]     = useState(false)
  const [token, setToken]           = useState<string | null>(null)

  async function handleNPILookup(e: React.FormEvent) {
    e.preventDefault()
    const cleaned = npi.replace(/\D/g, '')
    if (cleaned.length !== 10) {
      setError('NPI must be exactly 10 digits')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/proxy/v1/onboarding/npi/${cleaned}`)

      // Proxy returned non-JSON (API server down or misconfigured)
      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setError('RefChain API server is not reachable. Please make sure it is running.')
        return
      }

      const data = await res.json()

      // Proxy itself is healthy but upstream API is down
      if (res.status === 503) {
        setError(data.error || 'RefChain API server is not running. Start it and try again.')
        return
      }

      if (!data.found) {
        setError('NPI not found in the CMS registry. Double-check the number and try again.')
        return
      }

      setResult(data)
      setStep('confirm_profile')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setError('Cannot connect to the server. Check your network connection.')
      } else {
        setError('Something went wrong looking up this NPI. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault()
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch('/api/proxy/v1/onboarding/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npi: result!.profile!.npi, email, password }),
      })

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        setError('RefChain API server is not reachable. Please make sure it is running.')
        return
      }

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.details?.[0]?.message || 'Failed to create account')
        return
      }
      setToken(data.token)
      setStep('connect_ehr')
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg.includes('Failed to fetch') ? 'Cannot connect to the server.' : 'Something went wrong. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  const profile = result?.profile

  return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <p className="text-blue-400 font-semibold text-lg tracking-wide">RefChain</p>
          <p className="text-white/40 text-sm mt-1">Healthcare Referral Intelligence</p>
        </div>

        {/* Step: Enter NPI */}
        {step === 'enter_npi' && (
          <div className="bg-white rounded-2xl p-8 space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Start with your NPI</h1>
              <p className="text-sm text-slate-500 mt-1">
                We'll pull your profile from the CMS registry. No forms to fill out.
              </p>
            </div>

            <form onSubmit={handleNPILookup} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  NPI Number
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={npi}
                    onChange={e => setNpi(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="1234567890"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    maxLength={10}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Don't know your NPI?{' '}
                  <a
                    href="https://npiregistry.cms.hhs.gov/search"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    Look it up on CMS →
                  </a>
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || npi.length !== 10}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Looking up NPI…</>
                ) : (
                  <><Search size={15} /> Find my profile</>
                )}
              </button>
            </form>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400 text-center">
                Already registered?{' '}
                <a href="/login" className="text-blue-500 hover:underline">Sign in</a>
              </p>
            </div>
          </div>
        )}

        {/* Step: Confirm Profile */}
        {step === 'confirm_profile' && profile && (
          <div className="bg-white rounded-2xl p-8 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Is this you?</h1>
                <p className="text-sm text-slate-500 mt-1">
                  Pulled from the CMS public registry — NPI {profile.npi}
                </p>
              </div>
              {result?.alreadyRegistered && (
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded-full">
                  Already registered
                </span>
              )}
            </div>

            {/* Profile card */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {profile.firstName?.[0] || profile.orgName?.[0] || '?'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">
                    {profile.firstName
                      ? `${profile.firstName} ${profile.lastName}${profile.credential ? ', ' + profile.credential : ''}`
                      : profile.orgName}
                  </p>
                  {profile.specialty && (
                    <p className="text-xs text-blue-600 font-medium">{profile.specialty}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                {profile.practiceAddress && (
                  <div className="flex items-center gap-2">
                    <MapPin size={12} className="text-slate-400 shrink-0" />
                    <span>
                      {[profile.practiceAddress.line1, profile.practiceAddress.city, profile.practiceAddress.state, profile.practiceAddress.zip]
                        .filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="text-slate-400 shrink-0" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile.ehrHint?.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Stethoscope size={12} className="text-slate-400 shrink-0" />
                    <span className="text-slate-500">
                      Likely EHR: <span className="text-slate-700">{profile.ehrHint.slice(0, 2).join(' or ')}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {result?.alreadyRegistered ? (
              <div className="space-y-3">
                <a
                  href="/login"
                  className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-3 transition-colors"
                >
                  Sign in to my account
                </a>
                <button
                  onClick={() => { setStep('enter_npi'); setResult(null); setNpi('') }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700"
                >
                  That's not me — try a different NPI
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => setStep('set_credentials')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-colors"
                >
                  Yes, that's me <ArrowRight size={15} />
                </button>
                <button
                  onClick={() => { setStep('enter_npi'); setResult(null); setNpi('') }}
                  className="w-full text-sm text-slate-500 hover:text-slate-700"
                >
                  Not me — try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step: Set Credentials */}
        {step === 'set_credentials' && profile && (
          <div className="bg-white rounded-2xl p-8 space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Set your login</h1>
              <p className="text-sm text-slate-500 mt-1">
                That's all we need. Your profile is already populated from NPPES.
              </p>
            </div>

            <form onSubmit={handleClaim} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@practice.com"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  minLength={8}
                  required
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={claiming}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {claiming ? (
                  <><Loader2 size={15} className="animate-spin" /> Creating account…</>
                ) : (
                  <>Create account <ArrowRight size={15} /></>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step: Connect EHR */}
        {step === 'connect_ehr' && profile && (
          <div className="bg-white rounded-2xl p-8 space-y-6">
            <div className="text-center">
              <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
              <h1 className="text-xl font-bold text-slate-900">Account created</h1>
              <p className="text-sm text-slate-500 mt-1">
                One last step — connect your EHR to start automating referrals.
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600 mb-2">Likely EHR systems for your specialty</p>
              <div className="space-y-2">
                {(profile.ehrHint || []).slice(0, 3).map(ehr => (
                  <a
                    key={ehr}
                    href={`/ehr?connect=${ehr}&token=${token}`}
                    className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                  >
                    <span className="text-sm font-medium text-slate-700 capitalize">{ehr}</span>
                    <ArrowRight size={14} className="text-slate-400 group-hover:text-blue-500" />
                  </a>
                ))}
                <a
                  href={`/ehr?token=${token}`}
                  className="flex items-center justify-between bg-white border border-dashed border-slate-200 rounded-lg px-3 py-2.5 hover:border-blue-300 transition-colors"
                >
                  <span className="text-sm text-slate-500">My EHR isn't listed</span>
                  <ArrowRight size={14} className="text-slate-400" />
                </a>
              </div>
            </div>

            <a
              href="/referrals"
              className="block text-center text-xs text-slate-400 hover:text-slate-600"
            >
              Skip for now — I'll connect later
            </a>
          </div>
        )}

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          {(['enter_npi', 'confirm_profile', 'set_credentials', 'connect_ehr'] as Step[]).map(s => (
            <div
              key={s}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                s === step ? 'bg-blue-400' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
