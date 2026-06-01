import { defaultRules as _staticDefaultRules } from '../rules/default.rules.js'

/**
 * Determines whether prior authorization is actually required
 * for this payer + plan + procedure combination.
 * If PA is not required, PAIA exits early — no submission needed.
 *
 * @param {string[]} procedureCodes
 * @param {object}   payerRules         — payer-specific rules (from DB or null)
 * @param {string}   planType           — insurance plan type
 * @param {object}   [effectiveDefaults] — universal PA required/exempt lists from DB
 *                                        Falls back to static default.rules.js if not provided.
 */
export function checkPARequired(procedureCodes = [], payerRules, planType, effectiveDefaults) {
  const defaults = effectiveDefaults || _staticDefaultRules
  const issues = []
  const paRequiredCodes = []
  const paExemptCodes = []

  for (const code of procedureCodes) {
    // Check payer-specific rules first
    const rule = payerRules?.procedureRules?.[code]

    if (rule) {
      if (rule.paRequired) {
        paRequiredCodes.push(code)
      } else {
        paExemptCodes.push(code)
      }
      continue
    }

    // Fall back to universal defaults (DB-loaded or static)
    if (defaults.universalPaRequired.includes(code)) {
      paRequiredCodes.push(code)
    } else if (defaults.universalPaExempt.includes(code)) {
      paExemptCodes.push(code)
    } else {
      // Unknown procedure — conservative: assume PA required, flag for review
      paRequiredCodes.push(code)
      issues.push({
        check: 'pa_required',
        passed: true,   // not blocking, but flagged
        severity: 'advisory',
        autoFixable: false,
        message: `Unknown PA requirement for procedure ${code}`,
        detail: `Procedure ${code} is not in the known PA requirement database for this payer. Assuming PA required — verify with payer.`,
        code,
      })
    }
  }

  const paRequired = paRequiredCodes.length > 0

  return {
    check: 'pa_required',
    passed: true,   // this check always passes — it informs the workflow
    paRequired,
    paRequiredCodes,
    paExemptCodes,
    issues,
    message: paRequired
      ? `Prior auth required for: ${paRequiredCodes.join(', ')}`
      : 'No prior authorization required for these procedure codes',
  }
}
