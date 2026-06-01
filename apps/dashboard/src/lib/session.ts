/**
 * Client-side session helpers.
 * JWT stored in localStorage (dashboard is not SSR-sensitive for auth).
 * Server components use the API key for public data; protected actions use Bearer token.
 */

const TOKEN_KEY = 'pl_token'
const USER_KEY  = 'pl_user'

export interface SessionUser {
  id: string
  email: string
  role: string
  firstName: string
  lastName: string
  orgId: string | null
  orgName: string | null
  specialty: string | null
}

export function saveSession(token: string, user: SessionUser) {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  // Also set a cookie so server components can read the token without the API key
  document.cookie = `pl_token=${token}; path=/; SameSite=Lax; max-age=${60 * 60 * 24 * 7}`
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function clearSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  document.cookie = 'pl_token=; path=/; max-age=0'
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

/** Fetch wrapper that injects Bearer token */
export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    if (res.status === 401) {
      clearSession()
      window.location.href = '/login'
    }
    throw new Error(err.error || `API error ${res.status}`)
  }

  return res.json()
}
