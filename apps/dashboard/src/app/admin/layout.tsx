import Link from 'next/link'
import { BarChart3, Building2, FileText, Shield, ScrollText, Settings, ShieldAlert } from 'lucide-react'

const nav = [
  { href: '/admin',           label: 'Overview',      icon: BarChart3   },
  { href: '/admin/orgs',      label: 'Organizations', icon: Building2   },
  { href: '/admin/referrals', label: 'Referrals',     icon: FileText    },
  { href: '/admin/paia',      label: 'PAIA Queue',    icon: ShieldAlert },
  { href: '/admin/rules',     label: 'Policy Rules',  icon: Shield      },
  { href: '/admin/audit',     label: 'Audit Log',     icon: ScrollText  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-800">
          <p className="text-[#9B59D3] font-bold text-sm">Plerous</p>
          <p className="text-slate-500 text-xs mt-0.5">Admin Console</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Icon size={14} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <Link href="/referrals" className="text-xs text-slate-500 hover:text-slate-300">
            ← Back to app
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-slate-950">
        {children}
      </main>
    </div>
  )
}
