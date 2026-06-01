/**
 * Validates that procedure codes are clinically supported by the diagnosis codes.
 * Payers auto-deny when procedure and diagnosis are clinically inconsistent.
 * Example: billing 95810 (PSG) with J44.1 (COPD) alone — no sleep apnea diagnosis.
 */
export function checkProcedureDiagnosisMatch(procedureCodes = [], diagnosisCodes = [], payerRules) {
  const issues = []

  for (const code of procedureCodes) {
    const rule = payerRules?.procedureRules?.[code]
    if (!rule?.validDiagnoses?.length) continue

    const hasValidDiagnosis = diagnosisCodes.some(dx =>
      rule.validDiagnoses.some(valid =>
        dx === valid || dx.startsWith(valid.replace('*', ''))
      )
    )

    if (!hasValidDiagnosis) {
      issues.push({
        procedureCode: code,
        diagnosisCodes,
        validDiagnoses: rule.validDiagnoses,
        message: `Procedure ${code} is not supported by the submitted diagnosis codes`,
        detail: `Submitted diagnoses (${diagnosisCodes.join(', ')}) do not include a valid indication for ${code}. Payer requires one of: ${rule.validDiagnoses.slice(0, 5).join(', ')}${rule.validDiagnoses.length > 5 ? '...' : ''}`,
        suggestion: `Add the appropriate diagnosis code. For sleep studies, G47.33 (OSA) or G47.30 (sleep apnea unspecified) are required.`,
      })
    }
  }

  return {
    check: 'procedure_diagnosis_match',
    passed: issues.length === 0,
    severity: issues.length > 0 ? 'hard_stop' : 'ok',
    autoFixable: false,  // Diagnosis codes are clinical decisions — never auto-add
    issues,
    message: issues.length === 0
      ? 'Procedure codes are supported by submitted diagnoses'
      : `${issues.length} procedure-diagnosis mismatch(es) detected`,
  }
}
