import { authenticate, requireRole } from '../../middleware/auth.middleware.js'
import { prisma } from '../../db/client.js'
import { enforceProviderLimit, getOrgUsage } from '../../middleware/plan-limits.js'

export default async function providerRoutes(app) {
  // ── Create provider (org admin only, plan-limited) ─────────────────────────
  app.post('/', {
    preHandler: [authenticate, requireRole('SUPER_ADMIN', 'ORG_ADMIN'), enforceProviderLimit],
    schema: {
      tags: ['Providers'],
      summary: 'Add a provider to your organization (plan-limited)',
      body: {
        type: 'object',
        required: ['firstName', 'lastName', 'npi', 'specialty', 'email', 'phone', 'licenseState', 'licenseNumber'],
        properties: {
          firstName:           { type: 'string' },
          lastName:            { type: 'string' },
          npi:                 { type: 'string' },
          specialty:           { type: 'string' },
          subSpecialty:        { type: 'string' },
          email:               { type: 'string', format: 'email' },
          phone:               { type: 'string' },
          licenseState:        { type: 'string' },
          licenseNumber:       { type: 'string' },
          deaNumber:           { type: 'string' },
          acceptingNewPatients:{ type: 'boolean' },
          insuranceNetworks:   { type: 'array', items: { type: 'string' } },
          languages:           { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (req, reply) => {
    const provider = await prisma.provider.create({
      data: {
        organizationId:      req.user.organizationId,
        firstName:           req.body.firstName,
        lastName:            req.body.lastName,
        npi:                 req.body.npi,
        specialty:           req.body.specialty,
        subSpecialty:        req.body.subSpecialty,
        email:               req.body.email,
        phone:               req.body.phone,
        licenseState:        req.body.licenseState,
        licenseNumber:       req.body.licenseNumber,
        deaNumber:           req.body.deaNumber,
        acceptingNewPatients: req.body.acceptingNewPatients ?? true,
        insuranceNetworks:   req.body.insuranceNetworks ?? [],
        languages:           req.body.languages ?? [],
      },
      include: { organization: true },
    })
    reply.code(201).send({ success: true, data: provider })
  })

  // ── Plan usage (for dashboard billing widget) ──────────────────────────────
  app.get('/billing/usage', {
    preHandler: [authenticate],
    schema: {
      tags: ['Providers'],
      summary: 'Get current plan tier, limits, and usage for your organization',
    },
  }, async (req, reply) => {
    const usage = await getOrgUsage(req.user.organizationId)
    reply.send({ success: true, data: usage })
  })

  app.get('/', {
    preHandler: [authenticate],
    schema: {
      tags: ['Providers'],
      summary: 'Search provider directory',
      querystring: {
        type: 'object',
        properties: {
          specialty:       { type: 'string' },
          insurancePlanId: { type: 'string' },
          acceptingNew:    { type: 'boolean' },
          search:          { type: 'string' },
          page:            { type: 'integer', default: 1 },
          limit:           { type: 'integer', default: 20 },
        },
      },
    },
  }, async (req, reply) => {
    const { specialty, insurancePlanId, acceptingNew, search, page = 1, limit = 20 } = req.query
    const skip = (page - 1) * limit

    const where = {
      ...(specialty && { specialty: { contains: specialty, mode: 'insensitive' } }),
      ...(acceptingNew !== undefined && { acceptingNewPatients: acceptingNew }),
      ...(insurancePlanId && { insuranceNetworks: { has: insurancePlanId } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { npi: { contains: search } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.provider.findMany({ where, skip, take: parseInt(limit), include: { organization: true } }),
      prisma.provider.count({ where }),
    ])

    reply.send({ success: true, data, pagination: { page: parseInt(page), limit: parseInt(limit), total } })
  })

  app.get('/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Providers'], summary: 'Get provider by ID' },
  }, async (req, reply) => {
    const provider = await prisma.provider.findUnique({
      where: { id: req.params.id },
      include: { organization: true },
    })
    if (!provider) return reply.code(404).send({ success: false, error: 'Provider not found' })
    reply.send({ success: true, data: provider })
  })
}
