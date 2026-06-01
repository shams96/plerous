/**
 * Revenue Recovery Agent — Agent 8
 *
 * Built for hospital buyers. Detects and quantifies leaked revenue —
 * referrals that were sent but never reached scheduling.
 * Generates an executive leakage report that hospital CFOs sign contracts over.
 */

import { prisma } from '../db/client.js'

const REVENUE_PER_PATIENT = {
  'Orthopedics': 8000, 'Cardiology': 3500, 'Oncology': 5000,
  'Neurology': 2000, 'Gastroenterology': 1800, 'Urology': 2200,
  'Nephrology': 1500, 'Pulmonary Disease': 1200, 'Internal Medicine': 800,
  'Family Medicine': 600, 'General Practice': 600, default: 1200,
}

export class RevenueRecoveryAgent {
  async run(orgId = null) {
    const now         = new Date()
    const twelveMonths = new Date(now - 365 * 86400000)
    const thisMonth   = new Date(now.getFullYear(), now.getMonth(), 1)

    const where = {
      createdAt: { gte: twelveMonths },
      ...(orgId ? { OR: [{ sendingOrgId: orgId }, { receivingOrgId: orgId }] } : {}),
    }

    // All referrals in window
    const referrals = await prisma.referral.findMany({
      where,
      select: {
        id: true, status: true, specialty: true, createdAt: true,
        estimatedRevenue: true, actualRevenue: true,
        sendingOrgId: true, receivingOrgId: true,
      },
    })

    // Categorise
    const leaked   = referrals.filter(r => ['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(r.status))
    const active   = referrals.filter(r => !['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(r.status))
    const completed = referrals.filter(r => r.status === 'COMPLETED')

    // Revenue calculations
    const calcRevenue = (list) => list.reduce((sum, r) => {
      const rev = r.estimatedRevenue ?? (REVENUE_PER_PATIENT[r.specialty] ?? REVENUE_PER_PATIENT.default)
      return sum + rev
    }, 0)

    const leakedRevenue    = calcRevenue(leaked)
    const completedRevenue = calcRevenue(completed)
    const atRiskRevenue    = calcRevenue(active)
    const totalRevenue     = leakedRevenue + completedRevenue

    // Leakage by specialty
    const bySpecialty = {}
    for (const r of leaked) {
      const s = r.specialty ?? 'Unknown'
      if (!bySpecialty[s]) bySpecialty[s] = { count: 0, revenue: 0 }
      bySpecialty[s].count++
      bySpecialty[s].revenue += r.estimatedRevenue ?? (REVENUE_PER_PATIENT[s] ?? REVENUE_PER_PATIENT.default)
    }

    // Leakage by month (trailing 12)
    const byMonth = {}
    for (const r of leaked) {
      const key = `${new Date(r.createdAt).getFullYear()}-${String(new Date(r.createdAt).getMonth() + 1).padStart(2, '0')}`
      if (!byMonth[key]) byMonth[key] = { count: 0, revenue: 0 }
      byMonth[key].count++
      byMonth[key].revenue += r.estimatedRevenue ?? (REVENUE_PER_PATIENT[r.specialty] ?? REVENUE_PER_PATIENT.default)
    }

    // Recovery rate (referrals that went from at-risk → completed)
    const leakageRate   = referrals.length > 0 ? leaked.length / referrals.length : 0
    const completionRate = referrals.length > 0 ? completed.length / referrals.length : 0

    // This month vs last month leakage
    const thisMonthLeaked = leaked.filter(r => new Date(r.createdAt) >= thisMonth)
    const lastMonth       = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthLeaked = leaked.filter(r => {
      const d = new Date(r.createdAt)
      return d >= lastMonth && d < thisMonth
    })

    return {
      generatedAt:     now.toISOString(),
      orgId:           orgId ?? 'all',
      period:          'trailing_12_months',

      summary: {
        totalReferrals:     referrals.length,
        completedReferrals: completed.length,
        leakedReferrals:    leaked.length,
        activeReferrals:    active.length,
        leakageRate:        `${Math.round(leakageRate * 100)}%`,
        completionRate:     `${Math.round(completionRate * 100)}%`,
        industryAvgLeakage: '22%',
      },

      revenue: {
        completedRevenue:    Math.round(completedRevenue),
        leakedRevenue:       Math.round(leakedRevenue),
        atRiskRevenue:       Math.round(atRiskRevenue),
        totalAddressable:    Math.round(totalRevenue),
        recoveryOpportunity: Math.round(leakedRevenue * 0.25), // conservative 25% recovery
      },

      trends: {
        thisMonthLeaked:  { count: thisMonthLeaked.length, revenue: Math.round(calcRevenue(thisMonthLeaked)) },
        lastMonthLeaked:  { count: lastMonthLeaked.length, revenue: Math.round(calcRevenue(lastMonthLeaked)) },
        trend:            thisMonthLeaked.length <= lastMonthLeaked.length ? 'improving' : 'worsening',
      },

      bySpecialty: Object.entries(bySpecialty)
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([specialty, data]) => ({ specialty, ...data })),

      byMonth: Object.entries(byMonth)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, data]) => ({ month, ...data })),

      executiveSummary: {
        headline: `${Math.round(leakageRate * 100)}% of referrals leaked — $${Math.round(leakedRevenue).toLocaleString()} in lost revenue over 12 months`,
        cta:      `Plerous recovers an estimated 15–25% of leaked referrals. At current leakage, that represents $${Math.round(leakedRevenue * 0.20).toLocaleString()}/year in recoverable revenue — ${Math.round((leakedRevenue * 0.20) / (99 * 12))}x ROI on a $99/month subscription.`,
      },
    }
  }
}
