import { serverApi } from '@/lib/server-api'
import { type Provider } from '@/lib/api'
import { Users, CheckCircle2, XCircle } from 'lucide-react'

async function getProviders(): Promise<Provider[]> {
  try {
    const data = await serverApi.get<{ data: Provider[] }>('/v1/providers')
    return data.data ?? []
  } catch {
    return []
  }
}

export default async function ProvidersPage() {
  const providers = await getProviders()

  return (
    <div>
      <div className="bg-white border-b border-stone-200 px-6 py-4">
        <h1 className="text-lg font-semibold">Providers</h1>
        <p className="text-sm text-slate-500">{providers.length} in network</p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          {providers.length === 0 ? (
            <div className="col-span-3 text-center py-12">
              <Users size={32} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No providers found</p>
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-stone-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-slate-800">
                      Dr. {p.firstName} {p.lastName}
                    </p>
                    <p className="text-sm text-slate-500">{p.specialty}</p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${p.acceptingNewPatients ? 'text-green-600' : 'text-slate-400'}`}>
                    {p.acceptingNewPatients ? (
                      <CheckCircle2 size={12} />
                    ) : (
                      <XCircle size={12} />
                    )}
                    {p.acceptingNewPatients ? 'Accepting' : 'Not Accepting'}
                  </div>
                </div>
                {p.organization && (
                  <p className="text-xs text-slate-400">{p.organization.name}</p>
                )}
                <p className="text-xs text-slate-300 font-mono mt-1">NPI: {p.npi}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
