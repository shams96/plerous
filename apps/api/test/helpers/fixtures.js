/**
 * E2E test fixtures — create a minimal but complete referral graph
 * (org, provider, patient, sim payer, plan, referral) directly via Prisma.
 *
 * Patient member IDs drive the simulator's deterministic scenarios:
 *   APPROVE001 / DENY001 / PENDWEBHOOK001 / PENDPOLL001 / INELIGIBLE001
 */
import { randomUUID } from 'node:crypto'
import { prisma } from '../../src/db/client.js'

const SIM_BASE = process.env.PAYER_SIM_BASE || 'http://localhost:4011'

function rndNpi() {
  // 10-digit pseudo-NPI, unique enough for tests
  return String(Math.floor(1000000000 + Math.random() * 8999999999))
}

/** Upsert the simulator payer pointing at the test simulator. */
export async function getSimPayer() {
  return prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'SIM-TEST' },
    update: { fhirBaseUrl: `${SIM_BASE}/fhir/r4`, authEndpoint: `${SIM_BASE}/oauth/token`, apiType: 'fhir_r4' },
    create: {
      name: 'Plerous Test Simulator',
      tradingPartnerServiceId: 'SIM-TEST',
      fhirBaseUrl: `${SIM_BASE}/fhir/r4`,
      authEndpoint: `${SIM_BASE}/oauth/token`,
      apiType: 'fhir_r4',
      requiresFax: false,
    },
  })
}

export async function createOrg() {
  return prisma.organization.create({
    data: {
      name: `Test Practice ${randomUUID().slice(0, 6)}`,
      npi: rndNpi(),
      type: 'PCP_PRACTICE',
      address: { line1: '1 Test St', city: 'Austin', state: 'TX', zip: '78701' },
      phone: '+15125550100',
      email: `org-${randomUUID().slice(0, 6)}@example.com`,
    },
  })
}

export async function createProvider(orgId) {
  return prisma.provider.create({
    data: {
      organizationId: orgId,
      firstName: 'Test',
      lastName: `Provider${randomUUID().slice(0, 4)}`,
      npi: rndNpi(),
      specialty: 'Family Medicine',
      email: `prov-${randomUUID().slice(0, 6)}@example.com`,
      phone: '+15125550101',
      licenseState: 'TX',
      licenseNumber: `TX${randomUUID().slice(0, 6)}`,
    },
  })
}

export async function createPlan(payerId, { requiresPriorAuth = true } = {}) {
  return prisma.insurancePlan.create({
    data: {
      payerId,
      planName: 'Sim HMO Plus',
      planType: 'HMO',
      requiresReferral: true,
      requiresPriorAuth,
    },
  })
}

export async function createPatient(planId, memberId) {
  return prisma.patient.create({
    data: {
      firstName: 'Pat',
      lastName: `Test${randomUUID().slice(0, 4)}`,
      dateOfBirth: new Date('1970-01-01'),
      gender: 'female',
      phone: '+15125550199',
      address: { line1: '2 Patient Ave', city: 'Austin', state: 'TX', zip: '78701' },
      smsOptIn: true,
      primaryInsuranceId: planId,
      insuranceMemberId: memberId,
    },
  })
}

/**
 * Build a complete SUBMITTED referral wired to the sim payer, ready for
 * PriorAuthService.submit(). Returns { referral, payer, plan, patient, org, provider }.
 */
export async function makeReferral(memberId, { procedureCodes = ['95810'], diagnosisCodes = ['G47.33'] } = {}) {
  const payer = await getSimPayer()
  const plan = await createPlan(payer.id)
  const org = await createOrg()
  const provider = await createProvider(org.id)
  const patient = await createPatient(plan.id, memberId)

  const referral = await prisma.referral.create({
    data: {
      sendingOrgId: org.id,
      referringProviderId: provider.id,
      patientId: patient.id,
      insurancePlanId: plan.id,
      specialty: 'Sleep Medicine',
      reason: 'Suspected obstructive sleep apnea',
      diagnosisCodes,
      procedureCodes,
      clinicalNotes: 'ESS: 14/24. STOP-BANG: 5/8. BMI 34. Loud snoring, witnessed apneas.',
      urgency: 'ROUTINE',
      status: 'SUBMITTED',
      requiresAuth: true,
      statusHistory: [{ status: 'SUBMITTED', timestamp: new Date().toISOString(), note: 'test fixture' }],
    },
  })

  return { referral, payer, plan, patient, org, provider }
}

/** Poll the DB until the predicate passes or timeout (ms). For async scenarios. */
export async function waitFor(fn, { timeout = 6000, interval = 150 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = await fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, interval))
  }
  return null
}
