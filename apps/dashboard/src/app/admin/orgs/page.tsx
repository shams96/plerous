'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/session'
import { Building2, Users, FileText, Edit2, Save, X, Check, AlertCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface Org {
  id: string
  name: string
  type: string
  npi?: string
  address?: Record<string, string>
  phone?: string
  fax?: string
  isActive: boolean
  createdAt: string
  _count?: { providers: number; referralsSent: number; referralsReceived: number }
}

export default function AdminOrgsPage() {
  const [orgs,    setOrgs]    = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Org | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { loadOrgs() }, [])

  async function loadOrgs() {
    setLoading(true)
    try {
      const data = await authFetch<{ data: Org[] }>('/v1/admin/orgs')
      setOrgs(data.data)
    } finally {
      setLoading(false)
    }
  }

  async function saveOrg() {
    if (!editing) return
    setSaving(true)
    try {
      await authFetch(`/v1/admin/orgs/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editing.name,
          phone: editing.phone,
          fax: editing.fax,
        }),
      })
      setToast({ msg: `${editing.name} updated`, ok: true })
      setEditing(null)
      loadOrgs()
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : 'Save failed', ok: false })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Organizations</h1>
        <p className="text-sm text-slate-500 mt-0.5">{orgs.length} organizations across the network</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map(org => (
            <div key={org.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Building2 size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{org.name}</p>
                    <p className="text-xs text-slate-500">{org.type} · NPI: {org.npi ?? '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    org.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {org.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => setEditing({ ...org })}
                    className="text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-slate-800 rounded-lg p-3 flex items-center gap-2">
                  <Users size={13} className="text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Providers</p>
                    <p className="text-sm font-bold text-white">{org._count?.providers ?? 0}</p>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 flex items-center gap-2">
                  <FileText size={13} className="text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Sent</p>
                    <p className="text-sm font-bold text-white">{org._count?.referralsSent ?? 0}</p>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-3 flex items-center gap-2">
                  <FileText size={13} className="text-slate-500" />
                  <div>
                    <p className="text-xs text-slate-500">Received</p>
                    <p className="text-sm font-bold text-white">{org._count?.referralsReceived ?? 0}</p>
                  </div>
                </div>
              </div>

              {(org.phone || org.fax) && (
                <div className="mt-3 flex gap-4 text-xs text-slate-500">
                  {org.phone && <span>📞 {org.phone}</span>}
                  {org.fax && <span>📠 {org.fax}</span>}
                </div>
              )}

              <p className="text-xs text-slate-600 mt-3">
                Added {format(new Date(org.createdAt), 'MMM d, yyyy')}
              </p>
            </div>
          ))}

          {orgs.length === 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-600 text-sm">
              No organizations found
            </div>
          )}
        </div>
      )}

      {/* Edit drawer */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-end">
          <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 overflow-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Edit: {editing.name}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : ed)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Phone</label>
                <input
                  type="text"
                  value={editing.phone ?? ''}
                  onChange={e => setEditing(ed => ed ? { ...ed, phone: e.target.value } : ed)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Fax</label>
                <input
                  type="text"
                  value={editing.fax ?? ''}
                  onChange={e => setEditing(ed => ed ? { ...ed, fax: e.target.value } : ed)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={saveOrg}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg py-2.5 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : <><Save size={14} /> Save</>}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.ok ? 'bg-green-900 text-green-300 border border-green-700' : 'bg-red-900 text-red-300 border border-red-700'
        }`}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
