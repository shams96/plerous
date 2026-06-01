import crypto from 'crypto'
import { prisma } from '../db/client.js'
import { AppError } from './error-handler.js'

export async function authenticate(request) {
  const authHeader = request.headers.authorization
  const apiKey = request.headers['x-api-key']

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const decoded = request.server.jwt.verify(token)

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true },
      include: { provider: { include: { organization: true } } },
    })
    if (!user) throw new AppError(401, 'User not found or inactive')

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      providerId: user.providerId,
      organizationId: user.provider?.organizationId,
    }
    return
  }

  if (apiKey) {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    const key = await prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
      include: { organization: true },
    })

    if (!key) throw new AppError(401, 'Invalid API key')
    if (key.expiresAt && key.expiresAt < new Date()) throw new AppError(401, 'API key expired')

    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })

    request.user = {
      id: `api:${key.id}`,
      email: `api-key:${key.name}`,
      role: 'API_CLIENT',
      organizationId: key.organizationId,
      scopes: key.scopes,
    }
    return
  }

  throw new AppError(401, 'Authentication required — provide Bearer token or x-api-key header')
}

export function requireRole(...roles) {
  return async (request) => {
    if (!roles.includes(request.user?.role)) {
      throw new AppError(403, `Role '${request.user?.role}' is not permitted for this action`)
    }
  }
}
