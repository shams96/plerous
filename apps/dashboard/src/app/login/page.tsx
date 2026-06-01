'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { saveSession, isLoggedIn } from '@/lib/session'

export default function LoginPage() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (isLoggedIn()) router.replace('/referrals')
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const res  = await fetch(`${base}/v1/session/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      saveSession(data.token, data.user)
      router.push('/referrals')
    } catch {
      setError('Could not reach the server. Is the API running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <p className="text-[#9B59D3] font-semibold text-lg tracking-wide">Plerous</p>
          <p className="text-white/40 text-sm mt-1">Healthcare Closed-Loop Intelligence</p>
        </div>

        <div className="bg-white rounded-2xl p-8 space-y-5">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Sign in</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              New here?{' '}
              <a href="/onboarding" className="text-blue-500 hover:underline">
                Start with your NPI →
              </a>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@practice.com"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Signing in…</>
                : 'Sign in'
              }
            </button>
          </form>

          {/* Demo shortcut — remove before prod */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400 text-center mb-2">Demo accounts</p>
            <div className="space-y-1.5">
              {[
                { label: 'Dr. Johnson (PCP)', email: 'drjohnson@sunrise.health', pw: 'demo1234' },
                { label: 'Dr. Kureishy (MPSC)', email: 'drkureishy@mpsleepcenter.com', pw: 'mpsc2026' },
              ].map(acct => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => { setEmail(acct.email); setPassword(acct.pw) }}
                  className="w-full text-xs text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
                >
                  {acct.label}
                  <span className="text-slate-400 ml-1">({acct.email})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
