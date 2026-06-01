/**
 * Checks clinical notes for payer-required documentation criteria.
 * Returns which criteria are met, which are missing, and which can be auto-extracted.
 *
 * This is where most of PAIA's value lives — catching documentation gaps
 * before they become denials.
 */
export function checkDocumentation(clinicalNotes = '', procedureCodes = [], payerRules) {
  const results = []
  const autoExtractable = []

  if (!clinicalNotes || clinicalNotes.trim().length < 20) {
    return {
      check: 'documentation_complete',
      passed: false,
      severity: 'hard_stop',
      autoFixable: false,
      message: 'Clinical notes are absent or too brief',
      detail: 'Prior auth submissions without substantive clinical notes are denied at >90% rate. Minimum: document indication, relevant history, and reason specialist referral is needed.',
      criteriaResults: [],
    }
  }

  const notesLower = clinicalNotes.toLowerCase()

  for (const code of procedureCodes) {
    const rule = payerRules?.procedureRules?.[code]
    if (!rule?.clinicalCriteria?.length) continue

    for (const criterion of rule.clinicalCriteria) {
      // Check for keyword presence
      const keywordMatches = criterion.documentationKeywords?.filter(kw =>
        notesLower.includes(kw.toLowerCase())
      ) || []

      const minimumMatches = criterion.minimumMatches || 1
      const keywordsFound = keywordMatches.length >= minimumMatches

      // Try score extraction if pattern provided
      let extractedScore = null
      if (criterion.scorePattern && criterion.autoExtractable) {
        const match = clinicalNotes.match(criterion.scorePattern)
        if (match) {
          extractedScore = parseFloat(match[1])
        }
      }

      const scorePresent = extractedScore !== null
      const scoreMeetsThreshold = extractedScore !== null
        ? extractedScore >= (criterion.scoreThreshold || 0)
        : null

      const criterionMet = keywordsFound || scorePresent

      const result = {
        criterionId: criterion.id,
        code,
        description: criterion.description,
        severity: criterion.severity,
        met: criterionMet,
        keywordsFound: keywordMatches,
        extractedScore,
        scoreMeetsThreshold,
        autoExtractable: criterion.autoExtractable && !scorePresent && keywordsFound,
      }

      results.push(result)

      // Flag for auto-extraction if keywords are present but score not yet formatted
      if (criterion.autoExtractable && keywordsFound && extractedScore === null) {
        autoExtractable.push(result)
      }
    }
  }

  const required = results.filter(r => r.severity === 'required')
  const requiredMet = required.filter(r => r.met)
  const requiredMissing = required.filter(r => !r.met)

  const passed = requiredMissing.length === 0
  const canAutoFix = requiredMissing.some(r => r.autoExtractable)

  return {
    check: 'documentation_complete',
    passed,
    severity: requiredMissing.length > 0 ? 'hard_stop' : 'ok',
    autoFixable: canAutoFix,
    criteriaResults: results,
    requiredMet: requiredMet.length,
    requiredTotal: required.length,
    autoExtractable,
    message: passed
      ? `Documentation complete (${requiredMet.length}/${required.length} required criteria met)`
      : `Missing ${requiredMissing.length} required criteria: ${requiredMissing.map(r => r.description).join('; ')}`,
    detail: requiredMissing.length > 0
      ? `Add to clinical notes: ${requiredMissing.map(r => r.description).join('. ')}`
      : null,
  }
}
