import bcrypt from 'bcryptjs'
import { prisma } from '../../db/client.js'
import { AppError } from '../../middleware/error-handler.js'

export default async function sessionRoutes(app) {
  /**
   * POST /v1/session/login
   * Email + password → JWT
   */
  app.post('/login', {
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

    if (!user || !user.isActive) throw new AppError(401, 'Invalid email or password')

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new AppError(401, 'Invalid email or password')

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
        specialty: user.provider?.specialty ?? null,
      },
    }
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
    }
  })
}
