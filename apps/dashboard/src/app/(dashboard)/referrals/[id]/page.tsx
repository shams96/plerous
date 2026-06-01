import { serverApi } from '@/lib/server-api'
import { type Referral } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import AuthPanel from '@/components/AuthPanel'
import AppealPanel from '@/components/AppealPanel'
import PAIAPanel from '@/components/PAIAPanel'
import { format } from 'date-fns'
import { ArrowLeft, Calendar, AlertTriangle, Brain, Building2, User, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SubmitReferralButton from '@/components/SubmitReferralButton'

async function getReferral(id: string): Promise<Referral> {
  try {
    const data = await serverApi.get<{ data: Referral }>(`/v1/referrals/${id}`)
    return data.data
  } catch {
    notFound()
  }
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-stone-50 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 font-medium">{value ?? '—'}</span>
    </div>
  )
}

export default async function ReferralDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const { id } = await params
  const { created } = await searchParams
  const ref = await getReferral(id)

  const patientName = ref.patient
    ? `${ref.patient.firstName} ${ref.patient.lastName}`
    : 'Unknown patient'

  return (
    <div>
      {/* Creation success banner */}
      {created && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 size={14} className="text-green-600" />
          Referral created successfully. PAIA is analyzing prior auth requirements.
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <Link href="/referrals" className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-3">
          <ArrowLeft size={13} /> Referrals
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold">{ref.referralNumber}</h1>
          <StatusBadge status={ref.status} />
          {ref.urgency !== 'ROUTINE' && (
            <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
              {ref.urgency}
            </span>
          )}
          {ref.requiresAuth && (
            <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
              Prior Auth Required
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-1">{ref.specialty} — {ref.reason}</p>
        {ref.sendingOrg && (
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
            <Building2 size={11} /> {ref.sendingOrg.name}
          </p>
        )}
      </div>

      <div className="p-6 grid grid-cols-3 gap-6">
        {/* Left: Clinical + PAIA */}
        <div className="col-span-2 space-y-6">
          {/* PAIA panel — shown when analyses exist */}
          {ref.paiaAnalyses && ref.paiaAnalyses.length > 0 && (
            <PAIAPanel
              referralId={ref.id}
              referralNumber={ref.referralNumber}
              patientName={patientName}
              specialty={ref.specialty}
              analyses={ref.paiaAnalyses}
              status={ref.status}
            />
          )}

          {/* Patient */}
          <section className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <User size={14} /> Patient
            </h2>
            <InfoRow label="Name" value={patientName} />
            <InfoRow
              label="Date of Birth"
              value={ref.patient?.dateOfBirth
                ? format(new Date(ref.patient.dateOfBirth), 'MMMM d, yyyy')
                : undefined}
            />
          </section>

          {/* Clinical */}
          <section className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Clinical Details</h2>
            <InfoRow label="Specialty" value={ref.specialty} />
            <InfoRow label="Sub-specialty" value={ref.subSpecialty} />
            <InfoRow label="Reason" value={ref.reason} />
            <InfoRow
              label="Insurance"
              value={ref.insurancePlan
                ? `${ref.insurancePlan.payer?.name ?? 'Unknown payer'} · ${ref.insurancePlan.planType}`
                : undefined}
            />
            {ref.diagnosisCodes?.length > 0 && (
              <div className="flex justify-between py-2 border-b border-stone-50">
                <span className="text-sm text-slate-500">Diagnosis Codes</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {ref.diagnosisCodes.map((c) => (
                    <span key={c} className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {ref.procedureCodes?.length > 0 && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-slate-500">Procedure Codes</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {ref.procedureCodes.map((c) => (
                    <span key={c} className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Scheduling */}
          <section className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <Calendar size={14} /> Scheduling
            </h2>
            <InfoRow
              label="Requested Date"
              value={ref.requestedDate ? format(new Date(ref.requestedDate), 'MMM d, yyyy') : undefined}
            />
            <InfoRow
              label="Appointment Date"
              value={ref.appointmentDate
                ? format(new Date(ref.appointmentDate), 'MMM d, yyyy h:mm a')
                : undefined}
            />
          </section>

          {/* Prior Auth panel */}
          {ref.authorization && <AuthPanel auth={ref.authorization} />}
          {ref.authorization?.status === 'DENIED' && (
            <AppealPanel referralId={ref.id} auth={ref.authorization} />
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* AI Risk Assessment */}
          <section className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <Brain size={14} /> AI Risk Assessment
            </h2>
            {ref.riskScore != null ? (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Risk Score</span>
                  <span className={ref.riskScore >= 70 ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                    {ref.riskScore.toFixed(0)} / 100
                  </span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      ref.riskScore >= 70 ? 'bg-red-500' : ref.riskScore >= 40 ? 'bg-yellow-400' : 'bg-green-500'
                    }`}
                    style={{ width: `${ref.riskScore}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-4">No risk score yet</p>
            )}
            {ref.approvalProbability != null && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Approval Probability</span>
                  <span className="text-slate-700">{ref.approvalProbability.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${ref.approvalProbability}%` }}
                  />
                </div>
              </div>
            )}
            {ref.leakageRisk && (
              <div className="flex items-center gap-1.5 text-xs mt-3">
                {ref.leakageRisk === 'high' && <AlertTriangle size={12} className="text-red-500" />}
                <span className="text-slate-500">Leakage Risk:</span>
                <span className={`font-medium capitalize ${
                  ref.leakageRisk === 'high' ? 'text-red-600' :
                  ref.leakageRisk === 'medium' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {ref.leakageRisk}
                </span>
              </div>
            )}
          </section>

          {/* Providers */}
          <section className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Providers</h2>
            {ref.referringProvider && (
              <div className="mb-3">
                <p className="text-xs text-slate-400 mb-0.5">Referring</p>
                <p className="text-sm font-medium text-slate-800">
                  Dr. {ref.referringProvider.firstName} {ref.referringProvider.lastName}
                </p>
                <p className="text-xs text-slate-500">{ref.referringProvider.specialty}</p>
              </div>
            )}
            {ref.receivingProvider && (
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Receiving</p>
                <p className="text-sm font-medium text-slate-800">
                  Dr. {ref.receivingProvider.firstName} {ref.receivingProvider.lastName}
                </p>
              </div>
            )}
          </section>

          {/* Metadata */}
          <section className="bg-white rounded-xl border border-stone-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Metadata</h2>
            <InfoRow label="Created" value={format(new Date(ref.createdAt), 'MMM d, yyyy h:mm a')} />
            <InfoRow label="Updated" value={format(new Date(ref.updatedAt), 'MMM d, yyyy h:mm a')} />
          </section>

          {/* Submit action — only shown for DRAFT referrals */}
          {ref.status === 'DRAFT' && (
            <SubmitReferralButton referralId={ref.id} />
          )}
        </div>
      </div>
    </div>
  )
}
