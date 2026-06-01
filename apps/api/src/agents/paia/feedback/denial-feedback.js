/**
 * Denial Feedback Loop
 *
 * Called whenever a prior authorization reaches a terminal status (DENIED or APPROVED).
 * Increments denialCount / submissionCount on matching PolicyRule records and
 * recomputes denialRateBaseline so PAIA learns from real payer decisions over time.
 *
 * Rate formula:  denialRateBaseline = denialCount / submissionCount
 * This is a true empirical rate — no smoothing needed at volume; at low counts it
 * gives an accurate picture of what we've actually seen.
 *
 * Side-effect: invalidates the PolicyRuleStore cache for the affected payer so the
 * next PAIA analysis picks up the updated rates immediately.
 */
import { prisma } from '../../../db/client.js'
import { invalidatePayerCache, invalidateAllCaches } from '../rules/policy-rule-store.js'

/**
 * Record the outcome of a prior auth decision against all matching PolicyRules.
 *
 * @param {object} opts
 * @param {string[]} opts.procedureCodes  - CPT codes from the authorization
 * @param {string|null} opts.payerId      - Prisma Payer record id
 * @param {'APPROVED'|'DENIED'} opts.outcome
 */
export async function recordAuthOutcome({ procedureCodes, payerId, outcome }) {
  if (!procedureCodes?.length) return
  if (!['APPROVED', 'DENIED'].includes(outcome)) return

  const isDenial = outcome === 'DENIED'

  // Build the where clause: match rules for this payer OR universal rules (payerId IS NULL)
  // that apply to any of the submitted procedure codes.
  const where = {
    cptCode: { in: procedureCodes },
    OR: [
      ...(payerId ? [{ payerId }] : []),
      { payerId: null }, // universal fallback rules
    ],
    isActive: true,
  }

  const rules = await prisma.policyRule.findMany({ where })
  if (!rules.length) return

  // Update each rule in a transaction
  await prisma.$transaction(
    rules.map((rule) => {
      const newSubmissionCount = rule.submissionCount + 1
      const newDenialCount     = rule.denialCount + (isDenial ? 1 : 0)
      const newRate            = newSubmissionCount > 0
        ? newDenialCount / newSubmissionCount
        : rule.denialRateBaseline ?? 0

      return prisma.policyRule.update({
        where: { id: rule.id },
        data: {
          submissionCount:    newSubmissionCount,
          denialCount:        newDenialCount,
          denialRateBaseline: Math.round(newRate * 10000) / 10000, // 4 decimal precision
        },
      })
    }),
  )

  // Invalidate PAIA rule cache so updated rates are picked up immediately
  if (payerId) {
    // Look up the payer key (tradingPartnerServiceId) for targeted invalidation
    const payer = await prisma.payer.findUnique({ where: { id: payerId }, select: { tradingPartnerServiceId: true } })
    if (payer?.tradingPartnerServiceId) {
      invalidatePayerCache(payer.tradingPartnerServiceId)
    } else {
      invalidateAllCaches() // fallback
    }
  } else {
    invalidateAllCaches() // universal rules changed
  }

  console.log(
    `[DenialFeedback] ${outcome} recorded for ${rules.length} rule(s) ` +
    `| CPT: ${procedureCodes.join(', ')} | payerId: ${payerId ?? 'universal'}`,
  )
}
