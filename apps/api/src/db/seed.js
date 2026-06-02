/**
 * Plerous Seed Data
 * Creates a realistic HMO referral scenario:
 *   - 2 organizations (PCP practice + specialist group)
 *   - 5 providers (3 PCPs + 2 specialists)
 *   - 2 payers (UHC Medicare Advantage + Kaiser HMO)
 *   - 3 insurance plans
 *   - 6 patients
 *   - 8 referrals in various states
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding Plerous database...')

  // ── Payers ─────────────────────────────────────────────────────────────────
  const uhc = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'UHC-MA-87726' },
    update: {},
    create: {
      name: 'UnitedHealthcare Medicare Advantage',
      tradingPartnerServiceId: 'UHC-MA-87726',
      fhirBaseUrl: 'https://sandbox.apis.uhc.com/fhir/r4',
      apiType: 'fhir_r4',
      authEndpoint: 'https://sandbox.apis.uhc.com/oauth/token',
      requiresFax: false,
    },
  })

  const kaiser = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'KAISER-NCA-94105' },
    update: {},
    create: {
      name: 'Kaiser Permanente HMO (Northern CA)',
      tradingPartnerServiceId: 'KAISER-NCA-94105',
      fhirBaseUrl: 'https://fhir.kaiserpermanente.org/r4',
      apiType: 'fhir_r4',
      requiresFax: false,
    },
  })

  // Phase 2: BCBS + Aetna
  const bcbs = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'BCBS-CA-00601' },
    update: {},
    create: {
      name: 'Blue Cross Blue Shield of California',
      tradingPartnerServiceId: 'BCBS-CA-00601',
      fhirBaseUrl: 'https://api.bcbs.com/fhir/r4',
      apiType: 'fhir_r4',
      requiresFax: false,
    },
  })

  const aetna = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'AETNA-60054' },
    update: {},
    create: {
      name: 'Aetna Better Health',
      tradingPartnerServiceId: 'AETNA-60054',
      fhirBaseUrl: 'https://api.aetna.com/fhir/r4',
      apiType: 'fhir_r4',
      authEndpoint: 'https://api.aetna.com/oauth/token',
      requiresFax: false,
    },
  })

  // Partner simulator payer — points at the local payer-sim for end-to-end
  // testing without live partner access. Flip fhirBaseUrl/authEndpoint to the
  // UHC/Availity sandbox once credentials arrive (same code path).
  const sim = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'SIM-0001' },
    update: {
      fhirBaseUrl: process.env.PAYER_SIM_URL || 'http://localhost:4010/fhir/r4',
      authEndpoint: (process.env.PAYER_SIM_BASE || 'http://localhost:4010') + '/oauth/token',
    },
    create: {
      name: 'Plerous Simulator',
      tradingPartnerServiceId: 'SIM-0001',
      fhirBaseUrl: process.env.PAYER_SIM_URL || 'http://localhost:4010/fhir/r4',
      apiType: 'fhir_r4',
      authEndpoint: (process.env.PAYER_SIM_BASE || 'http://localhost:4010') + '/oauth/token',
      requiresFax: false,
    },
  })

  console.log('✅ Payers created (UHC, Kaiser, BCBS, Aetna, Simulator)')

  // ── Insurance Plans ────────────────────────────────────────────────────────
  const uhcHmo = await prisma.insurancePlan.create({
    data: {
      payerId: uhc.id,
      planName: 'UHC Medicare Advantage HMO Plus',
      planType: 'MEDICARE_ADVANTAGE',
      groupNumber: 'UHC-MA-2026',
      requiresReferral: true,
      requiresPriorAuth: true,
      networkTier: 'Tier 1',
      authRulesJson: {
        specialistReferralRequired: true,
        referralValidDays: 90,
        priorAuthSpecialties: ['Cardiology', 'Neurology', 'Oncology', 'Orthopedics', 'Urology'],
        standardProcessingDays: 7,
        urgentProcessingHours: 72,
        appealWindowDays: 30,
      },
    },
  })

  const kaiserHmo = await prisma.insurancePlan.create({
    data: {
      payerId: kaiser.id,
      planName: 'Kaiser Permanente HMO Gold',
      planType: 'HMO',
      groupNumber: 'KP-HMO-2026-GOLD',
      requiresReferral: true,
      requiresPriorAuth: true,
      networkTier: 'Tier 1',
    },
  })

  const ppoPlan = await prisma.insurancePlan.create({
    data: {
      payerId: uhc.id,
      planName: 'UHC Choice Plus PPO',
      planType: 'PPO',
      groupNumber: 'UHC-PPO-2026',
      requiresReferral: false,
      requiresPriorAuth: false,
    },
  })

  await prisma.insurancePlan.create({
    data: {
      payerId: bcbs.id,
      planName: 'BCBS PPO Blue Shield Preferred',
      planType: 'PPO',
      groupNumber: 'BCBS-PPO-2026',
      requiresReferral: false,
      requiresPriorAuth: true,
      networkTier: 'Preferred',
      authRulesJson: {
        priorAuthSpecialties: ['Neurosurgery', 'Transplant', 'Oncology'],
        standardProcessingDays: 5,
        appealWindowDays: 60,
      },
    },
  })

  await prisma.insurancePlan.create({
    data: {
      payerId: aetna.id,
      planName: 'Aetna Managed Medicaid',
      planType: 'MEDICAID',
      groupNumber: 'AETNA-MCAID-2026',
      requiresReferral: true,
      requiresPriorAuth: true,
      networkTier: 'Standard',
      authRulesJson: {
        priorAuthSpecialties: ['Cardiology', 'Orthopedics', 'Behavioral Health', 'Pain Management'],
        standardProcessingDays: 14,
        urgentProcessingHours: 72,
        appealWindowDays: 45,
      },
    },
  })

  console.log('✅ Insurance plans created (UHC, Kaiser, BCBS, Aetna)')

  // ── Organizations ──────────────────────────────────────────────────────────
  const pcpOrg = await prisma.organization.create({
    data: {
      name: 'Sunrise Family Medicine',
      npi: '1234567890',
      type: 'PCP_PRACTICE',
      address: { street: '1500 Main St', city: 'San Jose', state: 'CA', zip: '95101' },
      phone: '408-555-0100',
      email: 'admin@sunrisefamilymed.com',
      faxNumber: '408-555-0101',
      ehrSystem: 'tebra',
      planTier: 'PROFESSIONAL',
    },
  })

  const specialistOrg = await prisma.organization.create({
    data: {
      name: 'Bay Area Cardiology Associates',
      npi: '0987654321',
      type: 'SPECIALIST_PRACTICE',
      address: { street: '200 Hospital Dr', city: 'San Francisco', state: 'CA', zip: '94143' },
      phone: '415-555-0200',
      email: 'referrals@bacardiology.com',
      faxNumber: '415-555-0201',
      ehrSystem: 'epic',
      planTier: 'ENTERPRISE',
    },
  })

  console.log('✅ Organizations created')

  // ── Providers ──────────────────────────────────────────────────────────────
  const dr_patel = await prisma.provider.create({
    data: {
      organizationId: pcpOrg.id,
      firstName: 'Priya',
      lastName: 'Patel',
      npi: '1111111111',
      specialty: 'Internal Medicine',
      email: 'dr.patel@sunrisefamilymed.com',
      phone: '408-555-0110',
      licenseState: 'CA',
      licenseNumber: 'CA-MD-98765',
      acceptingNewPatients: true,
      insuranceNetworks: [uhcHmo.id, kaiserHmo.id, ppoPlan.id],
      languages: ['en', 'hi', 'gu'],
    },
  })

  const dr_johnson = await prisma.provider.create({
    data: {
      organizationId: pcpOrg.id,
      firstName: 'Marcus',
      lastName: 'Johnson',
      npi: '2222222222',
      specialty: 'Family Medicine',
      email: 'dr.johnson@sunrisefamilymed.com',
      phone: '408-555-0111',
      licenseState: 'CA',
      licenseNumber: 'CA-MD-87654',
      acceptingNewPatients: true,
      insuranceNetworks: [uhcHmo.id, ppoPlan.id],
      languages: ['en', 'es'],
    },
  })

  const dr_chen = await prisma.provider.create({
    data: {
      organizationId: specialistOrg.id,
      firstName: 'Wei',
      lastName: 'Chen',
      npi: '3333333333',
      specialty: 'Cardiology',
      subSpecialty: 'Interventional Cardiology',
      email: 'dr.chen@bacardiology.com',
      phone: '415-555-0210',
      licenseState: 'CA',
      licenseNumber: 'CA-MD-76543',
      acceptingNewPatients: true,
      insuranceNetworks: [uhcHmo.id, kaiserHmo.id, ppoPlan.id],
      languages: ['en', 'zh'],
    },
  })

  console.log('✅ Providers created')

  // ── Users ──────────────────────────────────────────────────────────────────
  const demoHash  = await bcrypt.hash('demo1234', 10)
  const mpscHash  = await bcrypt.hash('mpsc2026', 10)
  const superHash = await bcrypt.hash('admin2026!', 10)

  // Super admin — Plerous internal, not tied to any provider
  await prisma.user.create({
    data: {
      email: 'admin@refchain.ai',
      password: superHash,
      role: 'SUPER_ADMIN',
      firstName: 'Plerous',
      lastName: 'Admin',
    },
  })

  const adminUser = await prisma.user.create({
    data: {
      email: 'drjohnson@sunrise.health',
      password: demoHash,
      role: 'ORG_ADMIN',
      firstName: 'Sarah',
      lastName: 'Johnson',
      providerId: dr_patel.id,
    },
  })

  console.log('✅ Users created')

  // ── API Key ────────────────────────────────────────────────────────────────
  const rawKey = 'rc_live_demo_key_sunrise_2026'
  await prisma.apiKey.create({
    data: {
      organizationId: pcpOrg.id,
      name: 'Demo API Key',
      keyHash: createHash('sha256').update(rawKey).digest('hex'),
      keyPrefix: rawKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read'],
    },
  })

  console.log('✅ API key created (demo key: rc_live_demo_key_sunrise_2026)')

  // ── Patients ───────────────────────────────────────────────────────────────
  const patients = await Promise.all([
    prisma.patient.create({
      data: {
        firstName: 'Robert', lastName: 'Martinez',
        dateOfBirth: new Date('1952-03-14'),
        gender: 'M', phone: '408-555-1001',
        email: 'r.martinez@email.com',
        mrn: 'SF-001234',
        address: { street: '45 Oak St', city: 'San Jose', state: 'CA', zip: '95103' },
        primaryInsuranceId: uhcHmo.id,
        insuranceMemberId: 'UHC-MA-100001',
        smsOptIn: true,
      },
    }),
    prisma.patient.create({
      data: {
        firstName: 'Dorothy', lastName: 'Williams',
        dateOfBirth: new Date('1948-07-22'),
        gender: 'F', phone: '408-555-1002',
        email: 'dot.williams@email.com',
        mrn: 'SF-001235',
        address: { street: '89 Maple Ave', city: 'Santa Clara', state: 'CA', zip: '95050' },
        primaryInsuranceId: kaiserHmo.id,
        insuranceMemberId: 'KP-HMO-200002',
        smsOptIn: true,
      },
    }),
    prisma.patient.create({
      data: {
        firstName: 'James', lastName: 'Thompson',
        dateOfBirth: new Date('1965-11-08'),
        gender: 'M', phone: '408-555-1003',
        mrn: 'SF-001236',
        address: { street: '210 Pine Rd', city: 'Sunnyvale', state: 'CA', zip: '94086' },
        primaryInsuranceId: uhcHmo.id,
        insuranceMemberId: 'UHC-MA-100003',
        smsOptIn: false,
      },
    }),
    prisma.patient.create({
      data: {
        firstName: 'Maria', lastName: 'Garcia',
        dateOfBirth: new Date('1970-02-19'),
        gender: 'F', phone: '408-555-1004',
        email: 'mgarcia@email.com',
        mrn: 'SF-001237',
        address: { street: '15 Elm St', city: 'San Jose', state: 'CA', zip: '95110' },
        primaryInsuranceId: ppoPlan.id,
        insuranceMemberId: 'UHC-PPO-100004',
        smsOptIn: true,
      },
    }),
  ])

  console.log('✅ Patients created')

  // ── Referrals ──────────────────────────────────────────────────────────────
  // 1. Approved + scheduled (success path)
  const auth1 = await prisma.priorAuthorization.create({
    data: {
      payerId: uhc.id,
      authNumber: 'UHC-AUTH-2026-001',
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      determinedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000),
      requestedCodes: ['93306'],
      approvedCodes: ['93306'],
      urgency: 'routine',
    },
  })

  await prisma.referral.create({
    data: {
      sendingOrgId: pcpOrg.id,
      receivingOrgId: specialistOrg.id,
      referringProviderId: dr_patel.id,
      receivingProviderId: dr_chen.id,
      patientId: patients[0].id,
      insurancePlanId: uhcHmo.id,
      specialty: 'Cardiology',
      subSpecialty: 'Interventional Cardiology',
      diagnosisCodes: ['I25.10', 'I10'],
      procedureCodes: ['93306'],
      clinicalNotes: 'Patient presenting with exertional chest pain and elevated troponin. Rule out CAD.',
      urgency: 'URGENT',
      reason: 'Chest pain evaluation, abnormal stress test',
      status: 'SCHEDULED',
      requiresAuth: true,
      authorizationId: auth1.id,
      appointmentDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      appointmentConfirmed: true,
      riskScore: 45,
      approvalProbability: 85,
      leakageRisk: 'medium',
      estimatedRevenue: 1250,
      source: 'portal',
      statusHistory: [
        { status: 'DRAFT', timestamp: new Date(Date.now() - 6 * 86400000).toISOString(), note: 'Created' },
        { status: 'SUBMITTED', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), note: 'Submitted' },
        { status: 'AUTH_PENDING', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), note: 'Auth initiated' },
        { status: 'AUTH_APPROVED', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), note: 'UHC approved auth UHC-AUTH-2026-001' },
        { status: 'SCHEDULED', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'Appointment scheduled' },
      ],
    },
  })

  // 2. Auth denied (appeal opportunity)
  const auth2 = await prisma.priorAuthorization.create({
    data: {
      payerId: uhc.id,
      status: 'DENIED',
      submittedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      determinedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      requestedCodes: ['27447'],
      approvedCodes: [],
      denialReason: 'Medical necessity not established — conservative treatment not yet attempted',
      denialCode: 'AUTH-DENY-002',
      appealDeadline: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
      urgency: 'routine',
    },
  })

  await prisma.referral.create({
    data: {
      sendingOrgId: pcpOrg.id,
      receivingOrgId: specialistOrg.id,
      referringProviderId: dr_johnson.id,
      patientId: patients[1].id,
      insurancePlanId: uhcHmo.id,
      specialty: 'Orthopedics',
      diagnosisCodes: ['M17.11'],
      procedureCodes: ['27447'],
      clinicalNotes: 'Severe right knee OA, bone-on-bone, failed 6 months PT and NSAIDs.',
      urgency: 'ROUTINE',
      reason: 'Total knee replacement evaluation',
      status: 'AUTH_DENIED',
      requiresAuth: true,
      authorizationId: auth2.id,
      riskScore: 62,
      approvalProbability: 55,
      leakageRisk: 'high',
      estimatedRevenue: 3500,
      source: 'portal',
      statusHistory: [
        { status: 'SUBMITTED', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), note: 'Submitted' },
        { status: 'AUTH_PENDING', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), note: 'Auth initiated' },
        { status: 'AUTH_DENIED', timestamp: new Date(Date.now() - 86400000).toISOString(), note: 'Denied: medical necessity not established' },
      ],
    },
  })

  // 3. Pending auth (waiting)
  const auth3 = await prisma.priorAuthorization.create({
    data: {
      payerId: kaiser.id,
      status: 'SUBMITTED',
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      requestedCodes: ['93000', '93010'],
      urgency: 'urgent',
    },
  })

  await prisma.referral.create({
    data: {
      sendingOrgId: pcpOrg.id,
      referringProviderId: dr_patel.id,
      patientId: patients[2].id,
      insurancePlanId: kaiserHmo.id,
      specialty: 'Cardiology',
      diagnosisCodes: ['R00.0', 'R07.9'],
      procedureCodes: ['93000'],
      clinicalNotes: 'Palpitations and atypical chest discomfort. EKG inconclusive. Needs cardiology eval.',
      urgency: 'URGENT',
      reason: 'Palpitations and chest discomfort, cardiac eval needed',
      status: 'AUTH_PENDING',
      requiresAuth: true,
      authorizationId: auth3.id,
      riskScore: 38,
      approvalProbability: 88,
      leakageRisk: 'low',
      estimatedRevenue: 450,
      source: 'portal',
      statusHistory: [
        { status: 'SUBMITTED', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'Submitted' },
        { status: 'AUTH_PENDING', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), note: 'Kaiser auth pending' },
      ],
    },
  })

  // 4. Draft referral
  await prisma.referral.create({
    data: {
      sendingOrgId: pcpOrg.id,
      referringProviderId: dr_patel.id,
      patientId: patients[3].id,
      insurancePlanId: ppoPlan.id,
      specialty: 'Neurology',
      diagnosisCodes: ['G43.909'],
      procedureCodes: ['99244'],
      clinicalNotes: 'Chronic migraine, 15+ headache days/month. Current preventives not effective.',
      urgency: 'ROUTINE',
      reason: 'Chronic migraine management',
      status: 'DRAFT',
      requiresAuth: false,
      riskScore: 25,
      approvalProbability: 92,
      leakageRisk: 'low',
      estimatedRevenue: 350,
      source: 'portal',
      statusHistory: [
        { status: 'DRAFT', timestamp: new Date().toISOString(), note: 'Created' },
      ],
    },
  })

  console.log('✅ Referrals created')

  // ── MPSC Pilot Client — Metroplex Pulmonary & Sleep Center ─────────────────
  // Dr. Shahrukh Kureishy, M.D., F.C.C.P., F.A.A.S.M.
  // 1701 Eldorado Pkwy Suite 250, McKinney, TX 75069 | (972) 838-1892
  // EHR: eClinicalWorks

  const bcbsTx = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'BCBS-TX-84980' },
    update: {},
    create: {
      name: 'Blue Cross Blue Shield of Texas',
      tradingPartnerServiceId: 'BCBS-TX-84980',
      fhirBaseUrl: 'https://fhir.bcbstx.com/r4',
      apiType: 'fhir_r4',
      requiresFax: false,
    },
  })

  const uhcTx = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'UHC-TX-COMM-2026' },
    update: {},
    create: {
      name: 'UnitedHealthcare Community Plan TX',
      tradingPartnerServiceId: 'UHC-TX-COMM-2026',
      fhirBaseUrl: 'https://sandbox.apis.uhc.com/fhir/r4',
      apiType: 'fhir_r4',
      authEndpoint: 'https://sandbox.apis.uhc.com/oauth/token',
      requiresFax: false,
    },
  })

  const bcbsTxPpo = await prisma.insurancePlan.create({
    data: {
      payerId: bcbsTx.id,
      planName: 'BCBS TX Blue Advantage HMO',
      planType: 'HMO',
      groupNumber: 'BCBSTX-HMO-2026',
      requiresReferral: true,
      requiresPriorAuth: true,
      networkTier: 'Tier 1',
      authRulesJson: {
        specialistReferralRequired: true,
        referralValidDays: 90,
        priorAuthSpecialties: ['Pulmonary Disease', 'Sleep Medicine', 'Cardiology', 'Neurology'],
        priorAuthProcedures: ['95810', '95811', '94726'],   // sleep studies + plethysmography
        standardProcessingDays: 5,
        urgentProcessingHours: 24,
        appealWindowDays: 60,
      },
    },
  })

  const uhcTxMa = await prisma.insurancePlan.create({
    data: {
      payerId: uhcTx.id,
      planName: 'UHC Medicare Advantage TX',
      planType: 'MEDICARE_ADVANTAGE',
      groupNumber: 'UHC-TX-MA-2026',
      requiresReferral: false,    // Medicare Advantage in TX — no PCP gating for pulmonology
      requiresPriorAuth: true,
      networkTier: 'Tier 1',
      authRulesJson: {
        priorAuthProcedures: ['95810', '95811', '94726', '94060'],
        standardProcessingDays: 7,
        urgentProcessingHours: 72,
        appealWindowDays: 30,
      },
    },
  })

  const mpscOrg = await prisma.organization.upsert({
    where: { npi: '1659478231' },
    update: {},
    create: {
      name: 'Metroplex Pulmonary & Sleep Center',
      npi: '1659478231',
      type: 'SPECIALIST_PRACTICE',
      address: { street: '1701 Eldorado Pkwy Suite 250', city: 'McKinney', state: 'TX', zip: '75069' },
      phone: '972-838-1892',
      email: 'info@mpsleepcenter.com',
      faxNumber: '214-548-4205',
      ehrSystem: 'eclinicalworks',
      planTier: 'PROFESSIONAL',
    },
  })

  const dr_kureishy = await prisma.provider.upsert({
    where: { npi: '1528061108' },
    update: {},
    create: {
      organizationId: mpscOrg.id,
      firstName: 'Shahrukh',
      lastName: 'Kureishy',
      npi: '1528061108',  // Verified from NPPES 2026-05-20
      specialty: 'Pulmonary Disease',
      subSpecialty: 'Sleep Medicine',
      email: 'drkureishy@mpsleepcenter.com',
      phone: '972-838-1892',
      licenseState: 'TX',
      licenseNumber: 'L6995',  // Verified from NPPES
      acceptingNewPatients: true,
      insuranceNetworks: [bcbsTxPpo.id, uhcTxMa.id],
      languages: ['en', 'ur'],
    },
  })

  // User account for Dr. Kureishy
  await prisma.user.create({
    data: {
      email: 'drkureishy@mpsleepcenter.com',
      password: mpscHash,
      role: 'PROVIDER',
      firstName: 'Shahrukh',
      lastName: 'Kureishy',
      providerId: dr_kureishy.id,
    },
  })

  // API key for MPSC pilot
  const mpscKey = 'rc_live_mpsc_pilot_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(mpscKey).digest('hex') },
    update: {},
    create: {
      organizationId: mpscOrg.id,
      name: 'MPSC Pilot API Key',
      keyHash: createHash('sha256').update(mpscKey).digest('hex'),
      keyPrefix: mpscKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read', 'auth:read'],
    },
  })

  // Demo sleep patients (McKinney TX)
  const mpscPatients = await Promise.all([
    prisma.patient.create({
      data: {
        firstName: 'Gary', lastName: 'Henderson',
        dateOfBirth: new Date('1958-04-12'),
        gender: 'M', phone: '972-555-2001',
        email: 'ghenderson@email.com',
        mrn: 'MPSC-TX-0001',
        address: { street: '432 Stonebridge Dr', city: 'McKinney', state: 'TX', zip: '75070' },
        primaryInsuranceId: uhcTxMa.id,
        insuranceMemberId: 'UHC-TX-MA-210001',
        smsOptIn: true,
      },
    }),
    prisma.patient.create({
      data: {
        firstName: 'Linda', lastName: 'Okafor',
        dateOfBirth: new Date('1965-09-30'),
        gender: 'F', phone: '972-555-2002',
        email: 'lindaokafor@email.com',
        mrn: 'MPSC-TX-0002',
        address: { street: '88 Waterview Pkwy', city: 'Richardson', state: 'TX', zip: '75080' },
        primaryInsuranceId: bcbsTxPpo.id,
        insuranceMemberId: 'BCBS-TX-300002',
        smsOptIn: true,
      },
    }),
  ])

  // Demo referrals — Sleep study workflow (the core use case for MPSC)
  // Referral 1: Sleep study ordered, needs PA from BCBS TX
  const sleepAuth1 = await prisma.priorAuthorization.create({
    data: {
      payerId: bcbsTx.id,
      status: 'SUBMITTED',
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      requestedCodes: ['95810'],   // Polysomnography
      urgency: 'routine',
    },
  })

  await prisma.referral.create({
    data: {
      sendingOrgId: mpscOrg.id,
      referringProviderId: dr_kureishy.id,
      patientId: mpscPatients[1].id,   // Linda Okafor
      insurancePlanId: bcbsTxPpo.id,
      specialty: 'Sleep Medicine',
      diagnosisCodes: ['G47.33'],       // Obstructive sleep apnea
      procedureCodes: ['95810'],        // Polysomnography
      clinicalNotes: 'Pt reports loud snoring, witnessed apneas, excessive daytime sleepiness (ESS 16/24). High STOP-BANG score (5/8). Referred for in-lab PSG to confirm OSA diagnosis and determine severity.',
      urgency: 'ROUTINE',
      reason: 'Suspected obstructive sleep apnea — polysomnography',
      status: 'AUTH_PENDING',
      requiresAuth: true,
      authorizationId: sleepAuth1.id,
      riskScore: 72,
      approvalProbability: 78,
      leakageRisk: 'high',
      estimatedRevenue: 1800,
      source: 'portal',
      statusHistory: [
        { status: 'SUBMITTED', timestamp: new Date(Date.now() - 86400000).toISOString(), note: 'BCBS TX prior auth submitted for PSG' },
        { status: 'AUTH_PENDING', timestamp: new Date(Date.now() - 86400000).toISOString(), note: 'Awaiting BCBS TX determination' },
      ],
    },
  })

  // Referral 2: CPAP titration approved + scheduled
  const sleepAuth2 = await prisma.priorAuthorization.create({
    data: {
      payerId: uhcTx.id,
      authNumber: 'UHC-TX-PSG-2026-001',
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      determinedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000),
      requestedCodes: ['95811'],    // PSG with CPAP titration
      approvedCodes: ['95811'],
      urgency: 'routine',
    },
  })

  await prisma.referral.create({
    data: {
      sendingOrgId: mpscOrg.id,
      referringProviderId: dr_kureishy.id,
      patientId: mpscPatients[0].id,   // Gary Henderson
      insurancePlanId: uhcTxMa.id,
      specialty: 'Sleep Medicine',
      diagnosisCodes: ['G47.33', 'E11.65'],   // OSA + T2DM (comorbidity)
      procedureCodes: ['95811'],
      clinicalNotes: 'Established OSA diagnosis (AHI 42 on prior HST). CPAP naive. Scheduling in-lab CPAP titration study. Comorbid T2DM and HTN — metabolic benefit of OSA treatment expected.',
      urgency: 'ROUTINE',
      reason: 'CPAP titration study — confirmed severe OSA (AHI 42)',
      status: 'SCHEDULED',
      requiresAuth: true,
      authorizationId: sleepAuth2.id,
      appointmentDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      appointmentConfirmed: true,
      riskScore: 30,
      approvalProbability: 94,
      leakageRisk: 'low',
      estimatedRevenue: 2200,
      source: 'portal',
      statusHistory: [
        { status: 'SUBMITTED', timestamp: new Date(Date.now() - 10 * 86400000).toISOString(), note: 'Submitted' },
        { status: 'AUTH_PENDING', timestamp: new Date(Date.now() - 10 * 86400000).toISOString(), note: 'UHC TX MA review' },
        { status: 'AUTH_APPROVED', timestamp: new Date(Date.now() - 7 * 86400000).toISOString(), note: 'Approved: UHC-TX-PSG-2026-001' },
        { status: 'SCHEDULED', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), note: 'Sleep lab night scheduled' },
      ],
    },
  })

  console.log('✅ MPSC pilot data created (Dr. Kureishy + 2 patients + 2 sleep referrals)')
  console.log('   🔑 MPSC API key: rc_live_mpsc_pilot_2026')

  // ── Summary ────────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.organization.count(),
    prisma.provider.count(),
    prisma.patient.count(),
    prisma.referral.count(),
    prisma.insurancePlan.count(),
    prisma.payer.count(),
  ])

  console.log(`
╔══════════════════════════════════════════╗
║  ✅ Plerous Seed Complete               ║
║                                          ║
║  Organizations: ${String(counts[0]).padEnd(24)}║
║  Providers:     ${String(counts[1]).padEnd(24)}║
║  Patients:      ${String(counts[2]).padEnd(24)}║
║  Referrals:     ${String(counts[3]).padEnd(24)}║
║  Ins. Plans:    ${String(counts[4]).padEnd(24)}║
║  Payers:        ${String(counts[5]).padEnd(24)}║
║                                          ║
║  🔑 Demo API key:                        ║
║  rc_live_demo_key_sunrise_2026           ║
║  x-api-key: rc_live_demo_key_sunrise_2026║
╚══════════════════════════════════════════╝
  `)
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
