/**
 * Next.js catch-all proxy → Plerous API server (localhost:3001)
 *
 * Forwards all /api/proxy/** requests to the API server, preserving:
 *  - HTTP method
 *  - Authorization / x-api-key headers
 *  - Request body
 *  - Query string
 *
 * This keeps CORS clean (same-origin from the browser's perspective)
 * and means the dashboard never exposes the API server URL to the client.
 */

import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const apiPath = path.join('/')

  // Preserve query string
  const search = req.nextUrl.search

  const url = `${API_BASE}/${apiPath}${search}`

  // Forward relevant headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const auth = req.headers.get('authorization')
  if (auth) headers['Authorization'] = auth

  const apiKey = req.headers.get('x-api-key')
  if (apiKey) headers['x-api-key'] = apiKey

  // Body — only for methods that carry one
  let body: string | undefined
  if (!['GET', 'HEAD'].includes(req.method)) {
    try { body = await req.text() } catch { /* empty body */ }
  }

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    })

    const data = await upstream.json().catch(() => ({ error: 'Invalid JSON from API server' }))
    return NextResponse.json(data, { status: upstream.status })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isConnRefused = message.includes('ECONNREFUSED') || message.includes('fetch failed')
    return NextResponse.json(
      {
        error: isConnRefused
          ? 'API server is not reachable. Make sure it is running on port 3001.'
          : `Proxy error: ${message}`,
      },
      { status: 503 },
    )
  }
}

export const GET    = handler
export const POST   = handler
export const PUT    = handler
export const PATCH  = handler
export const DELETE = handler
