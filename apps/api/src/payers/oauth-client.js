/**
 * OAuth2 client-credentials token client for payer / clearinghouse APIs.
 *
 * Fetches and caches bearer tokens in Redis (keyed per payer) so we don't
 * re-authenticate on every request. Works against any standards-compliant
 * token endpoint (UHC sandbox, Availity, our partner simulator).
 *
 * A payer is considered "no-auth" if it has no tokenUrl/clientId configured —
 * in that case getAccessToken() returns null and callers send no Authorization
 * header (useful for open sandboxes / the local simulator).
 */
import axios from 'axios'
import { redis } from '../db/client.js'

const TOKEN_CACHE_PREFIX = 'payer:token:'
const SAFETY_WINDOW_SEC = 60 // refresh a minute before actual expiry

/**
 * Resolve the OAuth token endpoint + credentials for a payer.
 * Prefers per-payer DB columns, falls back to nothing (no-auth).
 */
function resolveCreds(payer) {
  return {
    tokenUrl:     payer?.authEndpoint || null,
    clientId:     payer?.clientId || null,
    clientSecret: payer?.clientSecret || null,
    scope:        payer?.scope || undefined,
  }
}

/**
 * Get a valid bearer token for the given payer, or null if the payer
 * requires no auth. Caches in Redis until shortly before expiry.
 */
export async function getAccessToken(payer) {
  const { tokenUrl, clientId, clientSecret, scope } = resolveCreds(payer)
  if (!tokenUrl || !clientId) return null // no-auth payer / simulator

  const cacheKey = `${TOKEN_CACHE_PREFIX}${payer.id}`
  const cached = await redis.get(cacheKey).catch(() => null)
  if (cached) return cached

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    ...(scope ? { scope } : {}),
  })

  const { data } = await axios.post(tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    timeout: 10000,
  })

  const token = data.access_token
  const expiresIn = Number(data.expires_in) || 3600
  if (token) {
    const ttl = Math.max(30, expiresIn - SAFETY_WINDOW_SEC)
    await redis.setex(cacheKey, ttl, token).catch(() => {})
  }
  return token || null
}

/**
 * Build the Authorization header object for a payer (empty if no-auth).
 */
export async function authHeader(payer) {
  const token = await getAccessToken(payer)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Clear a cached token (e.g. after a 401) so the next call re-authenticates. */
export async function invalidateToken(payerId) {
  await redis.del(`${TOKEN_CACHE_PREFIX}${payerId}`).catch(() => {})
}
