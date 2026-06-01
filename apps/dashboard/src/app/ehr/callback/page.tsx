'use client'

/**
 * SMART on FHIR OAuth callback.
 * The EHR redirects here after the user authenticates.
 * We exchange the code for tokens via the API, then redirect to /ehr.
 */
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { authFetch } from '@/lib/session'

export default function EHROAuthCallbackPage() {
  const router      = useRouter()
  const params      = useSearchParams()
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const code  = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (error) {
      setStatus('error')
      setMessage(params.get('error_description') || `Authorization denied: ${error}`)
      return
    }

    if (!code || !state) {
      setStatus('error')
      setMessage('Missing authorization code or state. Please try connecting again.')
      return
    }

    authFetch<{ success: boolean; displayName?: string; message?: string }>(
      '/v1/ehr/exchange-token',
      {
        method: 'POST',
        body: JSON.stringify({ code, state }),
      },
    )
      .then((data) => {
        setStatus('success')
        setMessage(data.message || `Connected to ${data.displayName || 'your EHR'}`)
        setTimeout(() => router.push('/ehr?connected=1'), 1500)
      })
      .catch((err: Error) => {
        setStatus('error')
        setMessage(err.message || 'Token exchange failed. Please try connecting again.')
      })
  }, [params, router])

  return (
    <div className="min-h-screen bg-[#09090f] flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <p className="text-[#9B59D3] font-semibold text-sm tracking-wide">Plerous × EHR</p>

        {status === 'exchanging' && (
          <>
            <Loader2 size={32} className="text-blue-500 animate-spin mx-auto" />
            <div>
              <p className="font-semibold text-slate-800">Completing connection…</p>
              <p className="text-sm text-slate-400 mt-1">Exchanging credentials with your EHR</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 size={32} className="text-green-500 mx-auto" />
            <div>
              <p className="font-semibold text-slate-800">EHR connected</p>
              <p className="text-sm text-slate-500 mt-1">{message}</p>
              <p className="text-xs text-slate-300 mt-2">Redirecting…</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle size={32} className="text-red-500 mx-auto" />
            <div>
              <p className="font-semibold text-slate-800">Connection failed</p>
              <p className="text-sm text-red-600 mt-1">{message}</p>
            </div>
            <button
              onClick={() => router.push('/ehr')}
              className="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg transition-colors"
            >
              Back to EHR settings
            </button>
          </>
        )}
      </div>
    </div>
  )
}
