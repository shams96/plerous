'use client'

import { useState } from 'react'
import type { PriorAuth } from '@/lib/api'
import { Sparkles, CheckCircle, Loader2 } from 'lucide-react'

export default function AppealPanel({
  referralId,
  auth,
}: {
  referralId: string
  auth: PriorAuth
}) {
  const [appealText, setAppealText] = useState(auth.appealText ?? '')
  const [generating, setGenerating] = useState(false)
  const [submitted, setSubmitted] = useState(auth.appealSubmitted)

  async function generateAppeal() {
    setGenerating(true)
    try {
      const res = await fetch('/api/proxy/v1/ai/generate-appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'rc_live_demo_key_sunrise_2026' },
        body: JSON.stringify({ authorizationId: auth.id }),
      })
      const data = await res.json()
      if (data.appealText) setAppealText(data.appealText)
    } finally {
      setGenerating(false)
    }
  }

  if (submitted) {
    return (
      <section className="bg-green-50 rounded-xl border border-green-200 p-5 flex items-center gap-3">
        <CheckCircle size={18} className="text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">Appeal Submitted</p>
          <p className="text-xs text-green-600">The denial appeal has been filed with the payer.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-xl border border-red-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Sparkles size={14} className="text-blue-500" />
          AI Denial Appeal
        </h2>
        <button
          onClick={generateAppeal}
          disabled={generating}
          className="inline-flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {appealText ? 'Regenerate' : 'Generate Appeal'}
        </button>
      </div>

      {appealText ? (
        <div>
          <textarea
            className="w-full text-sm text-slate-700 border border-stone-200 rounded-lg p-3 min-h-[200px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={appealText}
            onChange={(e) => setAppealText(e.target.value)}
          />
          <button
            onClick={() => setSubmitted(true)}
            className="mt-3 text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Submit Appeal
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400 py-4 text-center">
          Click &quot;Generate Appeal&quot; to draft a Claude-powered denial appeal letter.
        </p>
      )}
    </section>
  )
}
