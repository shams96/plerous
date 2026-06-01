'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FileText, ShieldCheck, ShieldAlert, Users, UserRound,
  Activity, Plug, ChevronDown, LogOut, Shield,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { getUser, clearSession, type SessionUser } from '@/lib/session'

const links = [
  { href: '/referrals',      label: 'Referrals',    icon: FileText    },
  { href: '/authorizations', label: 'Prior Auth',   icon: ShieldCheck },
  { href: '/paia',           label: 'Review Queue', icon: ShieldAlert },
  { href: '/patients',       label: 'Patients',     icon: UserRound   },
  { href: '/providers',      label: 'Providers',    icon: Users       },
  { href: '/analytics',      label: 'Analytics',    icon: Activity    },
  { href: '/ehr',            label: 'EHR',          icon: Plug        },
]

export default function AppNav() {
  const path   = usePathname()
  const router = useRouter()
  const [user,      setUser]      = useState<SessionUser | null>(null)
  const [menuOpen,  setMenuOpen]  = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUser(getUser())
  }, [])

  // Close menu on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleLogout() {
    clearSession()
    router.push('/login')
  }

  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U'
    : 'U'

  const displayName = user
    ? `Dr. ${user.lastName}`
    : 'Loading…'

  return (
    <nav className="bg-[#09090f] text-white h-14 flex items-center px-6 gap-8 shrink-0">
      <Link href="/referrals" className="font-semibold text-sm tracking-wide text-blue-400">
        RefChain
      </Link>

      <div className="flex items-center gap-1 flex-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          )
        })}
      </div>

      {/* User menu */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white"
        >
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
            {initials}
          </div>
          {displayName}
          <ChevronDown size={12} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
            {user && (
              <div className="px-4 py-3 border-b border-slate-800">
                <p className="text-xs font-semibold text-white">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-slate-400 truncate">{user.email}</p>
                {user.orgName && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">{user.orgName}</p>
                )}
              </div>
            )}
            {user?.role === 'SUPER_ADMIN' && (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <Shield size={13} /> Admin Console
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
