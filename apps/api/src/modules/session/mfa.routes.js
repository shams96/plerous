/**
 * MFA Routes — TOTP-based two-factor authentication
 *
 * Flow:
 *  1. POST /v1/session/mfa/setup   → returns TOTP secret + QR code URI
 *  2. POST /v1/session/mfa/verify  → confirms code is correct, enables MFA + issues backup codes
 *  3. POST /v1/session/mfa/disable → disables MFA (requires current password)
 *
 * Login flow (in session.routes.js):
 *  - If mfaEnabled, login returns { mfaRequired: true, mfaToken } instead of full JWT
 *  - Client POSTs TOTP code to POST /v1/session/mfa/confirm with mfaToken → receives full JWT
 */
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../../db/client.js'
import { AppError } from '../../middleware/error-handler.js'
import { authenticate } from '../../middleware/auth.middleware.js'

const APP_NAME = 'Plerous'

export default async function mfaRoutes(app) {

  // ── Setup: generate secret + QR code ──────────────────────────────────────
  app.post('/setup', { preHandler: [authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) throw new AppError(404, 'User not found')
    if (user.mfaEnabled) throw new AppError(400, 'MFA is already enabled')

    const secret = authenticator.generateSecret()
    const otpauth = authenticator.keyuri(user.email, APP_NAME, secret)
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth)

    // Store secret temporarily (not yet enabled — requires verify step)
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: secret },
    })

    return {
      success: true,
      secret,          // for manual entry
      qrCode: qrCodeDataUrl,
      instructions: 'Scan the QR code with your authenticator app, then call /mfa/verify with a 6-digit code to activate MFA.',
    }
  })

  // ── Verify: confirm TOTP code, activate MFA, return backup codes ──────────
  app.post('/verify', { preHandler: [authenticate] }, async (req) => {
    const { code } = req.body
    if (!code) throw new AppError(400, 'code is required')

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) throw new AppError(404, 'User not found')
    if (!user.mfaSecret) throw new AppError(400, 'Run /mfa/setup first')
    if (user.mfaEnabled) throw new AppError(400, 'MFA is already enabled')

    const valid = authenticator.verify({ token: String(code), secret: user.mfaSecret })
    if (!valid) throw new AppError(401, 'Invalid TOTP code')

    // Generate 8 one-time backup codes
    const rawBackupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-')
    )
    const hashedBackups = await Promise.all(rawBackupCodes.map(c => bcrypt.hash(c, 10)))

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: true, mfaBackupCodes: hashedBackups },
    })

    return {
      success: true,
      message: 'MFA enabled. Save your backup codes — they will not be shown again.',
      backupCodes: rawBackupCodes,  // shown once only
    }
  })

  // ── Confirm: exchange TOTP code for full JWT (used during login) ───────────
  app.post('/confirm', async (req, reply) => {
    const { mfaToken, code } = req.body
    if (!mfaToken || !code) throw new AppError(400, 'mfaToken and code are required')

    // mfaToken is a short-lived JWT with { userId, mfaPending: true }
    let decoded
    try {
      decoded = req.server.jwt.verify(mfaToken)
    } catch {
      throw new AppError(401, 'MFA token invalid or expired')
    }
    if (!decoded.mfaPending) throw new AppError(401, 'Invalid MFA token')

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true },
      include: { provider: { include: { organization: true } } },
    })
    if (!user || !user.mfaEnabled || !user.mfaSecret) throw new AppError(401, 'MFA not configured')

    // Try TOTP code first
    const totpValid = authenticator.verify({ token: String(code), secret: user.mfaSecret })

    // Try backup codes if TOTP fails
    let usedBackupIndex = -1
    if (!totpValid) {
      for (let i = 0; i < user.mfaBackupCodes.length; i++) {
        const match = await bcrypt.compare(String(code).replace(/-/g, '').toUpperCase().replace(/(.{5})/, '$1-'), user.mfaBackupCodes[i])
        if (match) { usedBackupIndex = i; break }
      }
      if (usedBackupIndex === -1) throw new AppError(401, 'Invalid authentication code')

      // Burn the used backup code
      const updatedBackups = [...user.mfaBackupCodes]
      updatedBackups.splice(usedBackupIndex, 1)
      await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: updatedBackups } })
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } })

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
      },
    }
  })

  // ── Disable MFA ────────────────────────────────────────────────────────────
  app.post('/disable', { preHandler: [authenticate] }, async (req) => {
    const { password } = req.body
    if (!password) throw new AppError(400, 'Current password required to disable MFA')

    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) throw new AppError(404, 'User not found')
    if (!user.mfaEnabled) throw new AppError(400, 'MFA is not enabled')

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new AppError(401, 'Incorrect password')

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    })

    return { success: true, message: 'MFA disabled' }
  })
}
