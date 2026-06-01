import { prisma } from '../../db/client.js'
import { authenticate, requireRole } from '../../middleware/auth.middleware.js'
import { AppError } from '../../middleware/error-handler.js'
import { invalidateAllCaches } from '../../agents/paia/rules/policy-rule-store.js'

const isAdmin = [authenticate, requireRole('SUPER_ADMIN')]

export default async function adminRoutes(app) {

  // ── Dashboard stats ────────────────────────────────────────────────────────
  app.get('/stats', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async () => {
    const [
      orgCount, providerCount, patientCount,
      referralCount, referralsByStatus,
      paiaCount, paiaByDecision,
      ruleCount,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.provider.count(),
      prisma.patient.count(),
      prisma.referral.count(),
      prisma.referral.groupBy({ by: ['status'], _count: true }),
      prisma.pAIAAnalysis.count(),
      prisma.pAIAAnalysis.groupBy({ by: ['decision'], _count: true }),
      prisma.policyRule.count({ where: { isActive: true } }),
    ])

    const denialRate = await prisma.referral.count({ where: { status: 'AUTH_DENIED' } })
    const totalSubmitted = await prisma.referral.count({
      where: { status: { in: ['AUTH_APPROVED', 'AUTH_DENIED', 'SUBMITTED', 'AUTH_PENDING'] } }
    })

    return {
      counts: { orgCount, providerCount, patientCount, referralCount, ruleCount, paiaCount },
      referralsByStatus: Object.fromEntries(referralsByStatus.map(r => [r.status, r._count])),
      paiaByDecision:    Object.fromEntries(paiaByDecision.map(r => [r.decision, r._count])),
      denialRate: totalSubmitted > 0 ? (denialRate / totalSubmitted) : null,
    }
  })

  // ── Organizations ──────────────────────────────────────────────────────────
  app.get('/orgs', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { search, limit = '50', offset = '0' } = req.query
    const where = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { npi: { contains: search } }] }
      : {}
    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: { _count: { select: { providers: true, referralsSent: true, referralsReceived: true } } },
        take: parseInt(limit), skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organization.count({ where }),
    ])
    return { data: orgs, total }
  })

  app.patch('/orgs/:id', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const before = await prisma.organization.findUnique({ where: { id: req.params.id } })
    if (!before) throw new AppError(404, 'Organization not found')
    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data: req.body,
    })
    await logAdminAction(req, 'EDIT_ORGANIZATION', 'organization', req.params.id, before, updated)
    return { success: true, data: updated }
  })

  // ── Referrals (cross-org view) ─────────────────────────────────────────────
  app.get('/referrals', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { status, orgId, limit = '50', offset = '0' } = req.query
    const where = {
      ...(status ? { status } : {}),
      ...(orgId  ? { sendingOrgId: orgId } : {}),
    }
    const [referrals, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          patient:            { select: { firstName: true, lastName: true } },
          sendingOrg:         { select: { name: true } },
          referringProvider:  { select: { firstName: true, lastName: true } },
          authorization:      { select: { status: true, authNumber: true } },
          paiaAnalyses:       { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        take: parseInt(limit), skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.referral.count({ where }),
    ])
    return { data: referrals, total }
  })

  // Force-unlock a stuck referral (admin override)
  app.post('/referrals/:id/unlock', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { reason } = req.body
    if (!reason) throw new AppError(400, 'reason is required for admin override')

    const referral = await prisma.referral.findUnique({ where: { id: req.params.id } })
    if (!referral) throw new AppError(404, 'Referral not found')

    const before = { status: referral.status }
    const updated = await prisma.referral.update({
      where: { id: req.params.id },
      data: {
        status: 'SUBMITTED',
        statusHistory: {
          push: {
            from: referral.status, to: 'SUBMITTED',
            at: new Date().toISOString(),
            by: req.user.id,
            reason: `ADMIN OVERRIDE: ${reason}`,
          },
        },
      },
    })
    await logAdminAction(req, 'FORCE_SUBMIT_REFERRAL', 'referral', req.params.id, before, { status: 'SUBMITTED', reason })
    return { success: true, data: updated }
  })

  // ── Policy Rules ──────────────────────────────────────────────────────────
  app.get('/policy-rules', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { payerId, cptCode, isActive } = req.query
    const where = {
      ...(payerId  ? { payerId }  : {}),
      ...(cptCode  ? { cptCode }  : {}),
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    }
    const rules = await prisma.policyRule.findMany({
      where,
      include: { payer: { select: { name: true, tradingPartnerServiceId: true } } },
      orderBy: [{ payerId: 'asc' }, { cptCode: 'asc' }],
    })
    return { data: rules, total: rules.length }
  })

  app.get('/policy-rules/:id', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const rule = await prisma.policyRule.findUnique({
      where: { id: req.params.id },
      include: { payer: { select: { name: true } } },
    })
    if (!rule) throw new AppError(404, 'Rule not found')
    return { data: rule }
  })

  app.post('/policy-rules', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const rule = await prisma.policyRule.create({
      data: { ...req.body, createdBy: req.user.id },
    })
    await logAdminAction(req, 'CREATE_POLICY_RULE', 'policy_rule', rule.id, null, rule)
    invalidateAllCaches()   // PAIA picks up new rule within next analysis
    return { success: true, data: rule }
  })

  app.patch('/policy-rules/:id', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const before = await prisma.policyRule.findUnique({ where: { id: req.params.id } })
    if (!before) throw new AppError(404, 'Rule not found')
    const { reason, ...updateData } = req.body
    const updated = await prisma.policyRule.update({
      where: { id: req.params.id },
      data: { ...updateData, updatedBy: req.user.id },
    })
    await logAdminAction(req, 'EDIT_POLICY_RULE', 'policy_rule', req.params.id, before, updated)
    invalidateAllCaches()   // PAIA picks up edit immediately
    return { success: true, data: updated }
  })

  app.delete('/policy-rules/:id', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { reason } = req.body || {}
    if (!reason) throw new AppError(400, 'reason required to deactivate a rule')
    const before = await prisma.policyRule.findUnique({ where: { id: req.params.id } })
    const updated = await prisma.policyRule.update({
      where: { id: req.params.id },
      data: { isActive: false, updatedBy: req.user.id },
    })
    await logAdminAction(req, 'DEACTIVATE_POLICY_RULE', 'policy_rule', req.params.id, before, { isActive: false, reason })
    invalidateAllCaches()   // PAIA stops using deactivated rule
    return { success: true }
  })

  // ── PAIA analyses ──────────────────────────────────────────────────────────
  app.get('/paia', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { decision, limit = '50', offset = '0' } = req.query
    const where = decision ? { decision } : {}
    const [analyses, total] = await Promise.all([
      prisma.pAIAAnalysis.findMany({
        where,
        include: {
          referral: {
            select: {
              referralNumber: true, status: true, specialty: true,
              patient:           { select: { firstName: true, lastName: true } },
              sendingOrg:        { select: { name: true } },
            },
          },
        },
        take: parseInt(limit), skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.pAIAAnalysis.count({ where }),
    ])
    return { data: analyses, total }
  })

  // ── Audit log ──────────────────────────────────────────────────────────────
  app.get('/audit', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { limit = '100', offset = '0', action, userId } = req.query
    const where = {
      ...(action ? { action: { contains: action } } : {}),
      ...(userId ? { userId } : {}),
    }
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
        take: parseInt(limit), skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ])
    return { data: logs, total }
  })

  app.get('/admin-actions', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { limit = '50', offset = '0' } = req.query
    const [actions, total] = await Promise.all([
      prisma.adminAction.findMany({
        take: parseInt(limit), skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.adminAction.count(),
    ])
    return { data: actions, total }
  })

  // ── Users ──────────────────────────────────────────────────────────────────
  app.get('/users', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { search, limit = '50' } = req.query
    const where = search
      ? { OR: [{ email: { contains: search } }, { lastName: { contains: search } }] }
      : {}
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, isActive: true, lastLogin: true, createdAt: true,
        provider: { select: { specialty: true, organization: { select: { name: true } } } },
      },
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    })
    return { data: users, total: users.length }
  })

  app.patch('/users/:id/role', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { role, reason } = req.body
    if (!reason) throw new AppError(400, 'reason required for role change')
    const before = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } })
    const updated = await prisma.user.update({ where: { id: req.params.id }, data: { role } })
    await logAdminAction(req, 'CHANGE_USER_ROLE', 'user', req.params.id, before, { role, reason })
    return { success: true }
  })

  app.patch('/users/:id/deactivate', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { reason } = req.body
    if (!reason) throw new AppError(400, 'reason required')
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } })
    await logAdminAction(req, 'DEACTIVATE_USER', 'user', req.params.id, null, { reason })
    return { success: true }
  })

  // ── Sentinel alerts ────────────────────────────────────────────────────────
  app.get('/sentinel/alerts', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async (req) => {
    const { limit = 50, type } = req.query
    const alerts = await prisma.notification.findMany({
      where: {
        ...(type && { type }),
      },
      include: {
        referral: {
          select: {
            id: true, referralNumber: true, status: true, specialty: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    })
    return { success: true, data: alerts }
  })

  // Trigger an immediate sentinel scan (manual)
  app.post('/sentinel/scan', { preHandler: isAdmin, schema: { tags: ['Admin'] } }, async () => {
    const { runSentinel } = await import('../../agents/sentinel.agent.js')
    const result = await runSentinel()
    return { success: true, data: result }
  })

  // ── Test-data management (dev/staging only) ───────────────────────────────
  const devOnly = [
    authenticate,
    requireRole('SUPER_ADMIN'),
    async (req, reply) => {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(403).send({ success: false, error: 'Not available in production' })
      }
    },
  ]

  // ── Test-data helpers ────────────────────────────────────────────────────────
  // Orgs created via NPI onboarding always receive npi = "{10digits}-org"
  // (see onboarding.routes.js line: npi: `${npi}-org`).
  // Real seed orgs have clean 10-digit NPIs. This is the structural discriminator.
  const TEST_ORG_FILTER = { npi: { endsWith: '-org' } }

  function isSeedOrg(org) {
    // If NPI is exactly 10 digits → seed org, protect it
    return /^\d{10}$/.test(org.npi)
  }

  /**
   * GET /v1/admin/test-data
   * List all test orgs (identified by NPI ending in "-org")
   */
  app.get('/test-data', {
    preHandler: devOnly,
    schema: { tags: ['Admin'], summary: '[Dev] List test organizations (NPI onboarding artifacts)' },
  }, async () => {
    const orgs = await prisma.organization.findMany({
      where: TEST_ORG_FILTER,
      include: { _count: { select: { providers: true, referralsSent: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      success: true,
      count: orgs.length,
      data: orgs.map(o => ({
        id: o.id, name: o.name, npi: o.npi, planTier: o.planTier,
        createdAt: o.createdAt,
        providers: o._count.providers,
        referrals: o._count.referralsSent,
      })),
    }
  })

  /**
   * DELETE /v1/admin/test-data/org/:id
   * Delete a single test org and all its dependents
   */
  app.delete('/test-data/org/:id', {
    preHandler: devOnly,
    schema: {
      tags: ['Admin'],
      summary: '[Dev] Delete test org by ID',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (req, reply) => {
    const { id } = req.params
    const org = await prisma.organization.findUnique({ where: { id } })
    if (!org) return reply.code(404).send({ success: false, error: 'Organization not found' })
    if (isSeedOrg(org)) return reply.code(400).send({ success: false, error: 'Cannot delete seed data (clean 10-digit NPI)' })

    const counts = await cascadeDeleteOrg(id)
    await logAdminAction(req, 'DELETE_TEST_ORG', 'Organization', id, { name: org.name }, null)
    return { success: true, deleted: { org: org.name, ...counts } }
  })

  /**
   * DELETE /v1/admin/test-data/npi/:npi
   * Delete the test org that was claimed via this NPI number
   */
  app.delete('/test-data/npi/:npi', {
    preHandler: devOnly,
    schema: {
      tags: ['Admin'],
      summary: '[Dev] Delete test org claimed via NPI',
      params: { type: 'object', required: ['npi'], properties: { npi: { type: 'string', pattern: '^\\d{10}$' } } },
    },
  }, async (req, reply) => {
    const { npi } = req.params

    // Onboarding stores org NPI as "{npi}-org" for individual providers
    const orgByNpi = await prisma.organization.findFirst({
      where: { npi: `${npi}-org` },
    })
    // Also check if provider has this NPI (covers edge cases)
    const provider = !orgByNpi ? await prisma.provider.findUnique({ where: { npi } }) : null
    const org = orgByNpi ?? (provider ? await prisma.organization.findUnique({ where: { id: provider.organizationId } }) : null)

    if (!org) return reply.code(404).send({ success: false, error: `No test org found for NPI ${npi}` })
    if (isSeedOrg(org)) return reply.code(400).send({ success: false, error: 'Cannot delete seed data (clean 10-digit NPI)' })

    const counts = await cascadeDeleteOrg(org.id)
    await logAdminAction(req, 'DELETE_TEST_NPI', 'Organization', org.id, { npi, name: org.name }, null)
    return { success: true, npi, deleted: { org: org.name, ...counts } }
  })

  /**
   * POST /v1/admin/test-data/reset-seed
   * Wipe all test orgs (NPI ending "-org"), preserve real seed data
   */
  app.post('/test-data/reset-seed', {
    preHandler: devOnly,
    schema: {
      tags: ['Admin'],
      summary: '[Dev] Wipe all test orgs, preserve seed data',
      body: {
        type: 'object',
        required: ['confirm'],
        properties: { confirm: { type: 'string', const: 'RESET_CONFIRMED' } },
      },
    },
  }, async (req) => {
    const testOrgs = await prisma.organization.findMany({
      where: TEST_ORG_FILTER,
      select: { id: true, name: true },
    })

    if (testOrgs.length === 0) {
      return { success: true, message: 'Already clean — no test orgs found', deleted: 0 }
    }

    for (const org of testOrgs) { await cascadeDeleteOrg(org.id) }
    await logAdminAction(req, 'RESET_TEST_DATA', 'System', 'all', { count: testOrgs.length }, null)

    return {
      success: true,
      message: `Wiped ${testOrgs.length} test org(s). Seed data preserved.`,
      deleted: testOrgs.length,
      orgs: testOrgs.map(o => o.name),
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Full cascade delete for an org — handles all FK dependencies in correct order.
 *
 * Dependency chain:
 *   AuditLog, PAIAAnalysis, Notification → Referral
 *   Referral.authorizationId → PriorAuthorization  (must null first, then delete PA)
 *   User → Provider → Organization
 *   EHRConnection, ApiKey → Organization
 */
async function cascadeDeleteOrg(orgId) {
  // 1. Collect referral IDs for this org
  const referrals = await prisma.referral.findMany({
    where: { OR: [{ sendingOrgId: orgId }, { receivingOrgId: orgId }] },
    select: { id: true, authorizationId: true },
  })
  const referralIds = referrals.map(r => r.id)
  const paIds = referrals.map(r => r.authorizationId).filter(Boolean)

  // 2. Delete referral leaf children
  const [auditLogs, paias, notifications] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { referralId: { in: referralIds } } }),
    prisma.pAIAAnalysis.deleteMany({ where: { referralId: { in: referralIds } } }),
    prisma.notification.deleteMany({ where: { referralId: { in: referralIds } } }),
  ])

  // 3. Null out authorizationId FK before deleting PriorAuthorizations
  if (paIds.length > 0) {
    await prisma.referral.updateMany({
      where: { id: { in: referralIds } },
      data: { authorizationId: null },
    })
    await prisma.priorAuthorization.deleteMany({ where: { id: { in: paIds } } })
  }

  // 4. Delete referrals
  const deletedReferrals = await prisma.referral.deleteMany({
    where: { OR: [{ sendingOrgId: orgId }, { receivingOrgId: orgId }] },
  })

  // 5. Delete org-level children then org
  const [users, ehrConnections, apiKeys, providers] = await Promise.all([
    prisma.user.deleteMany({ where: { provider: { organizationId: orgId } } }),
    prisma.eHRConnection.deleteMany({ where: { organizationId: orgId } }),
    prisma.apiKey.deleteMany({ where: { organizationId: orgId } }),
    prisma.provider.deleteMany({ where: { organizationId: orgId } }),
  ])

  await prisma.organization.delete({ where: { id: orgId } })

  return {
    users: users.count,
    providers: providers.count,
    referrals: deletedReferrals.count,
    notifications: notifications.count,
    auditLogs: auditLogs.count,
    paias: paias.count,
  }
}

async function logAdminAction(req, action, targetType, targetId, before, after) {
  await prisma.adminAction.create({
    data: {
      adminId:    req.user.id,
      action,
      targetType,
      targetId,
      before:     before ?? undefined,
      after:      after  ?? undefined,
      reason:     req.body?.reason,
      ipAddress:  req.ip,
    },
  })
}
