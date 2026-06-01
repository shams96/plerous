'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS: Record<string, string> = {
  COMPLETED: '#16a34a',
  SCHEDULED: '#2563eb',
  AUTH_APPROVED: '#0891b2',
  AUTH_PENDING: '#d97706',
  AUTH_DENIED: '#dc2626',
  CANCELLED: '#94a3b8',
  EXPIRED: '#f97316',
  SUBMITTED: '#7c3aed',
  DRAFT: '#cbd5e1',
  NO_SHOW: '#f43f5e',
}

export default function LeakageChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))

  if (!entries.length) {
    return <div className="h-48 flex items-center justify-center text-slate-300 text-sm">No data</div>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={entries} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
          {entries.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name] ?? '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => [v, 'Referrals']} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
