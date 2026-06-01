'use client'

import { useState } from 'react'
import { Send, Loader2, AlertTriangle } from 'lucide-react'
import { authFetch } from '@/lib/session'
import { useRouter } from 'next/navigation'

interface SubmitReferralButtonProps {
  referralId: string
  disabled?: boolean
}

export default function SubmitReferralButton({ referralId, disabled }: SubmitReferralButtonProps) {
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      const result = await authFetch<{
        success: boolean
        data: { blocked?: boolean; message?: string }
      }>(`/v1/referrals/${referralId}/submit`, { method: 'POST' })

      if (result.data?.blocked) {
        // PAIA held it — refresh to show the human window
        router.refresh()
      } else {
        // Submitted successfully — refresh to show new status
        router.refresh()
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleSubmit}
        disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
          : <><Send size={14} /> Submit for Prior Auth</>
        }
      </button>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertTriangle size={11} /> {error}
        </p>
      )}
    </div>
  )
}
