import { serverApi } from '@/lib/server-api'
import LeakageChart from '@/components/LeakageChart'
import { TrendingDown, DollarSign, AlertCircle, CheckCircle2 } from 'lucide-react'

interface LeakageReport {
  orgReferralCount: number
  completedReferrals: number
  leakageRate: number
  industryAvgLeakage: number
  estimatedAnnualRevenueLost: number
  topLeakageSpecialties: Array<{ specialty: string; leakageCount: number }>
  referralsByStatus: Record<string, number>
}

async function getReport(): Promise<LeakageReport | null> {
  try {
    return await serverApi.get<LeakageReport>('/v1/ai/leakage-report')
  } catch {
    return null
  }
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  danger,
}: {
  label: string
  value: string
  sub?: string
  icon: typeof DollarSign
  danger?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon size={16} className={danger ? 'text-red-400' : 'text-slate-400'} />
      </div>
      <p className={`text-2xl font-bold ${danger ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

export default async function AnalyticsPage() {
  const report = await getReport()

  return (
    <div>
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-slate-500">Referral leakage and revenue intelligence</p>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total Referrals"
            value={report?.orgReferralCount?.toString() ?? '—'}
            sub="This organization"
            icon={CheckCircle2}
          />
          <StatCard
            label="Leakage Rate"
            value={report ? `${report.leakageRate.toFixed(1)}%` : '—'}
            sub={`Industry avg: ${report?.industryAvgLeakage ?? 60}%`}
            icon={TrendingDown}
            danger={report ? report.leakageRate > 50 : false}
          />
          <StatCard
            label="Est. Annual Revenue Lost"
            value={
              report
                ? `$${(report.estimatedAnnualRevenueLost / 1000).toFixed(0)}K`
                : '—'
            }
            sub="From referral leakage"
            icon={DollarSign}
            danger={!!report?.estimatedAnnualRevenueLost}
          />
          <StatCard
            label="Completed Referrals"
            value={report?.completedReferrals?.toString() ?? '—'}
            sub="Successfully closed"
            icon={CheckCircle2}
          />
        </div>

        {/* Chart + breakdown */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Referrals by Status</h2>
            {report?.referralsByStatus ? (
              <LeakageChart data={report.referralsByStatus} />
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-300 text-sm">
                No data available
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <AlertCircle size={14} className="text-red-400" />
              Top Leakage Specialties
            </h2>
            {report?.topLeakageSpecialties?.length ? (
              <div className="space-y-3">
                {report.topLeakageSpecialties.map((s) => (
                  <div key={s.specialty} className="flex items-center gap-3">
                    <span className="text-sm text-slate-700 w-40 shrink-0">{s.specialty}</span>
                    <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full"
                        style={{
                          width: `${Math.min(
                            (s.leakageCount /
                              Math.max(...report.topLeakageSpecialties.map((x) => x.leakageCount))) *
                              100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-6 text-right">{s.leakageCount}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-300 py-6 text-center">No leakage data</p>
            )}
          </div>
        </div>

        {/* Industry comparison */}
        {report && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-blue-800 mb-2">Industry Benchmark</h2>
            <p className="text-sm text-blue-700">
              The healthcare industry average referral leakage rate is{' '}
              <strong>55–65%</strong>, costing the average physician{' '}
              <strong>$971K/year</strong> in lost downstream revenue.
              {report.leakageRate < report.industryAvgLeakage
                ? ` Your practice is performing ${(report.industryAvgLeakage - report.leakageRate).toFixed(1)}% better than average.`
                : ` Your practice has an opportunity to recover approximately $${(
                    report.estimatedAnnualRevenueLost / 1000
                  ).toFixed(0)}K annually.`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
