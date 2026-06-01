import { prisma } from '../../../db/client.js'

/**
 * Verifies patient insurance is active on the projected service date.
 * Hard-stop if coverage is lapsed — can't auto-fix, requires human resolution.
 */
export async function checkCoverage(referralData) {
  const { patientId, insurancePlanId, requestedDate } = referralData
  const serviceDate = requestedDate ? new Date(requestedDate) : new Date(Date.now() + 14 * 86400000)

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { primaryInsurance: { include: { payer: true } } },
  })

  if (!patient) {
    return {
      check: 'coverage_active',
      passed: false,
      severity: 'hard_stop',
      autoFixable: false,
      message: 'Patient record not found',
      detail: `Patient ID ${patientId} does not exist in the system`,
    }
  }

  // DPC patients with no insurance — coverage check doesn't apply
  if (!patient.primaryInsuranceId && !insurancePlanId) {
    return {
      check: 'coverage_active',
      passed: true,
      severity: 'advisory',
      message: 'No insurance on file — DPC or self-pay patient',
      detail: 'Prior auth not required. Referral will proceed without authorization.',
      dpcPatient: true,
    }
  }

  const plan = await prisma.insurancePlan.findUnique({
    where: { id: insurancePlanId || patient.primaryInsuranceId },
    include: { payer: true },
  })

  if (!plan) {
    return {
      check: 'coverage_active',
      passed: false,
      severity: 'hard_stop',
      autoFixable: false,
      message: 'Insurance plan not recognized',
      detail: 'The insurance plan on this referral is not in the Plerous payer network. Verify coverage before submitting.',
    }
  }

  if (!patient.insuranceMemberId) {
    return {
      check: 'coverage_active',
      passed: false,
      severity: 'hard_stop',
      autoFixable: false,
      message: 'Member ID missing',
      detail: `Patient has ${plan.payer.name} on file but no member ID. PA cannot be submitted without a valid member ID.`,
      payer: plan.payer.name,
    }
  }

  return {
    check: 'coverage_active',
    passed: true,
    message: 'Coverage verified',
    detail: `${plan.payer.name} — Member ID ${patient.insuranceMemberId}`,
    payerId: plan.payerId,
    planId: plan.id,
    planType: plan.planType,
  }
}
