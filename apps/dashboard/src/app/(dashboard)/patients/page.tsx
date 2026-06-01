import { serverApi } from '@/lib/server-api'
import { type Patient } from '@/lib/api'
import { format } from 'date-fns'
import { UserRound, Search } from 'lucide-react'

async function getPatients(): Promise<Patient[]> {
  try {
    const data = await serverApi.get<{ data: Patient[] }>('/v1/patients/search')
    return data.data ?? []
  } catch {
    return []
  }
}

export default async function PatientsPage() {
  const patients = await getPatients()

  return (
    <div>
      <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Patients</h1>
          <p className="text-sm text-slate-500">{patients.length} records</p>
        </div>
        <div className="flex items-center gap-2 bg-stone-100 rounded-lg px-3 py-2 text-sm text-slate-400">
          <Search size={14} />
          <span>Search patients…</span>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                {['Name', 'MRN', 'Date of Birth', 'Gender', 'Phone'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {patients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <UserRound size={32} className="text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No patients yet</p>
                  </td>
                </tr>
              ) : (
                patients.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.mrn ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {format(new Date(p.dateOfBirth), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{p.gender}</td>
                    <td className="px-4 py-3 text-slate-600">{p.phone}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
