import bcrypt from 'bcryptjs'
import { prisma } from '../../db/client.js'
import { AppError } from '../../middleware/error-handler.js'
import { validatePasswordStrength } from '../../middleware/password-validator.js'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export default async function sessionRoutes(app) {

  /**
   * POST /v1/session/login
   * Email + password → JWT (or mfaToken if MFA is enabled)
   *
   * Security controls:
   *  - Account lockout after 5 failed attempts (15 min)
   *  - Rate limited at server level (stricter on /login via plugin config)
   *  - MFA step: returns mfaToken instead of full JWT if mfaEnabled
   */
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }, // 10 attempts/15min per IP
    schema: {
      tags: ['Session'],
      summary: 'Login with email and password',
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        provider: {
          include: { organization: true },
        },
      },
    })

    // Generic message — don't reveal whether email exists
    if (!user || !user.isActive) throw new AppError(401, 'Invalid email or password')

    // Account lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - new Date()) / 60000)
      throw new AppError(429, `Account temporarily locked. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`)
    }

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      const newFailCount = user.failedLoginAttempts + 1
      const shouldLock = newFailCount >= MAX_FAILED_ATTEMPTS

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailCount,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : null,
        },
      })

      if (shouldLock) {
        throw new AppError(429, `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`)
      }

      const remaining = MAX_FAILED_ATTEMPTS - newFailCount
      throw new AppError(401, `Invalid email or password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before lockout.`)
    }

    // Successful auth — reset failed attempts and lockout
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    })

    // MFA gate: if enabled, return a short-lived pending token instead of full JWT
    if (user.mfaEnabled) {
      const mfaToken = await reply.jwtSign(
        { userId: user.id, mfaPending: true },
        { expiresIn: '5m' }  // 5 minutes to complete MFA
      )
      return {
        success: true,
        mfaRequired: true,
        mfaToken,
        message: 'Enter your 6-digit authenticator code to complete login.',
      }
    }

    const token = await reply.jwtSign({
      userId: user.id,
      orgId:  user.provider?.organizationId ?? null,
      role:   user.role,
    })

    return {
      success: true,
      token,
      user: {
        id:        user.id,
        email:     user.email,
        role:      user.role,
        firstName: user.firstName,
        lastName:  user.lastName,
        orgId:     user.provider?.organizationId ?? null,
        orgName:   user.provider?.organization?.name ?? null,
        specialty: user.provider?.specialty ?? null,
        mfaEnabled: user.mfaEnabled,
      },
    }
  })

  /**
   * POST /v1/session/change-password
   * Authenticated — requires current password + new password (strength-checked)
   */
  app.post('/change-password', {
    preHandler: [
      async (req) => {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) throw new AppError(401, 'No token')
        const decoded = req.server.jwt.verify(authHeader.slice(7))
        const user = await prisma.user.findUnique({ where: { id: decoded.userId, isActive: true } })
        if (!user) throw new AppError(401, 'Session expired')
        req.user = user
      },
    ],
    schema: { tags: ['Session'], summary: 'Change password' },
  }, async (req) => {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) throw new AppError(400, 'currentPassword and newPassword are required')

    const user = req.user
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) throw new AppError(401, 'Current password is incorrect')

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) throw new AppError(400, strength.reason)

    if (currentPassword === newPassword) throw new AppError(400, 'New password must differ from current password')

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })

    return { success: true, message: 'Password updated' }
  })

  /**
   * GET /v1/session/me
   * Returns current user from JWT — used by dashboard to hydrate session
   */
  app.get('/me', {
    preHandler: [
      async (req) => {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) throw new AppError(401, 'No token')
        const decoded = req.server.jwt.verify(authHeader.slice(7))
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId, isActive: true },
          include: { provider: { include: { organization: true } } },
        })
        if (!user) throw new AppError(401, 'Session expired')
        req.user = user
      },
    ],
    schema: { tags: ['Session'], summary: 'Get current session user' },
  }, async (req) => {
    const user = req.user
    return {
      id:        user.id,
      email:     user.email,
      role:      user.role,
      firstName: user.firstName,
      lastName:  user.lastName,
      orgId:     user.provider?.organizationId ?? null,
      orgName:   user.provider?.organization?.name ?? null,
      specialty: user.provider?.specialty ?? null,
      mfaEnabled: user.mfaEnabled,
    }
  })
}
