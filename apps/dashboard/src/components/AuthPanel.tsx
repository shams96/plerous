import type { PriorAuth } from '@/lib/api'
import { format } from 'date-fns'
import { ShieldCheck, ShieldX, Clock } from 'lucide-react'

const statusConfig: Record<string, { icon: typeof ShieldCheck; cls: string; label: string }> = {
  APPROVED: { icon: ShieldCheck, cls: 'text-green-600', label: 'Approved' },
  PARTIALLY_APPROVED: { icon: ShieldCheck, cls: 'text-yellow-600', label: 'Partially Approved' },
  DENIED: { icon: ShieldX, cls: 'text-red-600', label: 'Denied' },
  PENDING: { icon: Clock, cls: 'text-blue-600', label: 'Pending' },
  IN_REVIEW: { icon: Clock, cls: 'text-yellow-600', label: 'In Review' },
  SUBMITTED: { icon: Clock, cls: 'text-blue-600', label: 'Submitted' },
}

export default function AuthPanel({ auth }: { auth: PriorAuth }) {
  const cfg = statusConfig[auth.status] ?? { icon: Clock, cls: 'text-slate-600', label: auth.status }
  const Icon = cfg.icon

  return (
    <section className="bg-white rounded-xl border border-stone-200 p-5">
      <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
        <Icon size={14} className={cfg.cls} /> Prior Authorization
      </h2>

      <div className="space-y-0">
        <div className="flex justify-between py-2 border-b border-stone-50">
          <span className="text-sm text-slate-500">Status</span>
          <span className={`text-sm font-semibold ${cfg.cls}`}>{cfg.label}</span>
        </div>
        {auth.authNumber && (
          <div className="flex justify-between py-2 border-b border-stone-50">
            <span className="text-sm text-slate-500">Auth Number</span>
            <span className="text-sm font-mono text-slate-800">{auth.authNumber}</span>
          </div>
        )}
        {auth.submittedAt && (
          <div className="flex justify-between py-2 border-b border-stone-50">
            <span className="text-sm text-slate-500">Submitted</span>
            <span className="text-sm text-slate-700">{format(new Date(auth.submittedAt), 'MMM d, yyyy')}</span>
          </div>
        )}
        {auth.determinedAt && (
          <div className="flex justify-between py-2 border-b border-stone-50">
            <span className="text-sm text-slate-500">Determined</span>
            <span className="text-sm text-slate-700">{format(new Date(auth.determinedAt), 'MMM d, yyyy')}</span>
          </div>
        )}
        {auth.expiresAt && (
          <div className="flex justify-between py-2 border-b border-stone-50">
            <span className="text-sm text-slate-500">Expires</span>
            <span className="text-sm text-slate-700">{format(new Date(auth.expiresAt), 'MMM d, yyyy')}</span>
          </div>
        )}
        {auth.denialReason && (
          <div className="py-2">
            <p className="text-sm text-slate-500 mb-1">Denial Reason</p>
            <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{auth.denialReason}</p>
          </div>
        )}
      </div>
    </section>
  )
}
