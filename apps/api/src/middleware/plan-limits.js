/**
 * Plan Limits Middleware
 *
 * Enforces subscription tier constraints at the API boundary.
 * Applied as a preHandler on routes that create resources.
 *
 * Tiers:
 *   STARTER      — $99/mo flat, ≤5 providers, 500 referrals/mo
 *   PROFESSIONAL — $49/provider/mo, ≤25 providers, 2 000 referrals/mo
 *   ENTERPRISE   — custom, unlimited
 *   API_PARTNER  — EHR white-label, unlimited + white-label features
 */

import { prisma } from '../db/client.js'
import { AppError } from './error-handler.js'

export const PLAN_LIMITS = {
  STARTER: {
    maxProviders:       5,
    monthlyReferrals:   500,
    features:           ['portal'],
    label:              'Starter ($99/mo)',
    upgradeMessage:     'Upgrade to Professional to add more providers or increase your referral volume.',
  },
  PROFESSIONAL: {
    maxProviders:       25,
    monthlyReferrals:   2000,
    features:           ['portal', 'api', 'bulk_export'],
    label:              'Professional ($49/provider/mo)',
    upgradeMessage:     'Contact us to upgrade to Enterprise for unlimited capacity.',
  },
  ENTERPRISE: {
    maxProviders:       Infinity,
    monthlyReferrals:   Infinity,
    features:           ['portal', 'api', 'bulk_export', 'custom_rules'],
    label:              'Enterprise',
    upgradeMessage:     null,
  },
  API_PARTNER: {
    maxProviders:       Infinity,
    monthlyReferrals:   Infinity,
    features:           ['portal', 'api', 'bulk_export', 'custom_rules', 'white_label'],
    label:              'API Partner',
    upgradeMessage:     null,
  },
}

/**
 * Fetches the org's current plan limits and usage in one query.
 */
export async function getOrgUsage(organizationId) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [org, providerCount, monthlyReferrals] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true, name: true },
    }),
    prisma.provider.count({ where: { organizationId } }),
    prisma.referral.count({
      where: {
        sendingOrgId: organizationId,
        createdAt: { gte: startOfMonth },
      },
    }),
  ])

  if (!org) throw new AppError(404, 'Organization not found')

  const limits = PLAN_LIMITS[org.planTier] ?? PLAN_LIMITS.STARTER

  return {
    planTier: org.planTier,
    limits,
    usage: { providers: providerCount, monthlyReferrals },
    remaining: {
      providers:        limits.maxProviders       === Infinity ? null : Math.max(0, limits.maxProviders - providerCount),
      monthlyReferrals: limits.monthlyReferrals   === Infinity ? null : Math.max(0, limits.monthlyReferrals - monthlyReferrals),
    },
  }
}

/**
 * preHandler — blocks provider creation if the org is at or over their provider limit.
 */
export async function enforceProviderLimit(request) {
  const organizationId = request.user?.organizationId
  if (!organizationId) return // let authenticate() handle missing auth

  const usage = await getOrgUsage(organizationId)
  const { limits, usage: current } = usage

  if (limits.maxProviders !== Infinity && current.providers >= limits.maxProviders) {
    throw new AppError(402, [
      `Your ${usage.planTier} plan allows up to ${limits.maxProviders} provider${limits.maxProviders === 1 ? '' : 's'}.`,
      `You currently have ${current.providers}.`,
      limits.upgradeMessage ?? 'Contact support to increase your limit.',
    ].join(' '))
  }
}

/**
 * preHandler — blocks referral creation at 100% of monthly limit.
 * Warns (adds response header) at 80%.
 */
export async function enforceReferralLimit(request, reply) {
  const organizationId = request.user?.organizationId
  if (!organizationId) return

  const usage = await getOrgUsage(organizationId)
  const { limits, usage: current } = usage

  if (limits.monthlyReferrals === Infinity) return

  const pct = current.monthlyReferrals / limits.monthlyReferrals

  if (pct >= 1) {
    throw new AppError(402, [
      `Your ${usage.planTier} plan allows ${limits.monthlyReferrals} referrals/month.`,
      `You've used all ${current.monthlyReferrals} this month.`,
      limits.upgradeMessage ?? 'Contact support to increase your limit.',
    ].join(' '))
  }

  if (pct >= 0.8) {
    reply.header('X-Referral-Usage-Warning', `${current.monthlyReferrals}/${limits.monthlyReferrals} referrals used this month`)
  }
}

/**
 * Checks whether the org's plan includes a given feature.
 * Use with requireFeature('white_label') as a preHandler factory.
 */
export function requireFeature(feature) {
  return async function (request) {
    const organizationId = request.user?.organizationId
    if (!organizationId) return

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { planTier: true },
    })
    const limits = PLAN_LIMITS[org?.planTier] ?? PLAN_LIMITS.STARTER
    if (!limits.features.includes(feature)) {
      throw new AppError(402, `This feature requires a higher plan tier. ${limits.upgradeMessage ?? ''}`)
    }
  }
}
