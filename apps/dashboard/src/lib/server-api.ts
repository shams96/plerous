/**
 * Server-side API client for Next.js server components.
 * Reads the `pl_token` cookie set at login and forwards it as a Bearer token.
 * This scopes all API queries to the authenticated user's organization — fixing
 * the data isolation gap where server pages previously used the demo API key.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function serverFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { requireAuth?: boolean },
): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get('pl_token')?.value

  if (!token && options?.requireAuth !== false) {
    redirect('/login')
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { 'x-api-key': process.env.API_KEY_FALLBACK || 'rc_live_demo_key_sunrise_2026' }),
      ...init?.headers,
    },
    next: { revalidate: 0 },
  })

  if (res.status === 401) {
    redirect('/login')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }

  return res.json()
}

export const serverApi = {
  get: <T>(path: string) => serverFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    serverFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    serverFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) =>
    serverFetch<T>(path, { method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined }),
}
