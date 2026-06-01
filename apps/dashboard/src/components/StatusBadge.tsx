import type { ReferralStatus } from '@/lib/api'

const map: Record<ReferralStatus, { label: string; cls: string }> = {
  DRAFT:          { label: 'Draft',         cls: 'bg-slate-100 text-slate-600' },
  PAIA_REVIEW:    { label: 'PAIA Review',   cls: 'bg-orange-100 text-orange-700' },
  SUBMITTED:      { label: 'Submitted',     cls: 'bg-blue-100 text-blue-700' },
  AUTH_PENDING:   { label: 'Auth Pending',  cls: 'bg-yellow-100 text-yellow-700' },
  AUTH_APPROVED:  { label: 'Auth Approved', cls: 'bg-green-100 text-green-700' },
  AUTH_DENIED:    { label: 'Auth Denied',   cls: 'bg-red-100 text-red-700' },
  SCHEDULED:      { label: 'Scheduled',     cls: 'bg-teal-100 text-teal-700' },
  COMPLETED:      { label: 'Completed',     cls: 'bg-green-100 text-green-800' },
  CANCELLED:      { label: 'Cancelled',     cls: 'bg-slate-100 text-slate-500' },
  EXPIRED:        { label: 'Expired',       cls: 'bg-orange-100 text-orange-700' },
  NO_SHOW:        { label: 'No Show',       cls: 'bg-red-100 text-red-600' },
}

export default function StatusBadge({ status }: { status: ReferralStatus }) {
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
