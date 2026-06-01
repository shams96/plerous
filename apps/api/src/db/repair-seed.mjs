import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function repair() {
  console.log('🔧 Repairing missing seed orgs...')

  // Get existing insurance plan IDs
  const uhcHmo = await prisma.insurancePlan.findFirst({ where: { groupNumber: 'UHC-HMO-2026' } })
  const kaiserHmo = await prisma.insurancePlan.findFirst({ where: { groupNumber: 'KAISER-HMO-2026' } })
  const ppoPlan = await prisma.insurancePlan.findFirst({ where: { groupNumber: 'PPO-PLUS-2026' } })
  const bcbsTxPpo = await prisma.insurancePlan.findFirst({ where: { groupNumber: 'BCBSTX-HMO-2026' } })
  const uhcTxMa = await prisma.insurancePlan.findFirst({ where: { groupNumber: 'UHC-TX-MA-2026' } })

  // Bay Area Cardiology Associates
  const specialistOrg = await prisma.organization.upsert({
    where: { npi: '0987654321' },
    update: {},
    create: {
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
  console.log('  ✅ Bay Area Cardiology Associates')

  // Dr. Chen
  const dr_chen = await prisma.provider.upsert({
    where: { npi: '3333333333' },
    update: {},
    create: {
      organizationId: specialistOrg.id,
      firstName: 'Wei', lastName: 'Chen',
      npi: '3333333333',
      specialty: 'Cardiology',
      subSpecialty: 'Interventional Cardiology',
      email: 'dr.chen@bacardiology.com',
      phone: '415-555-0210',
      licenseState: 'CA',
      licenseNumber: 'CA-MD-76543',
      acceptingNewPatients: true,
      insuranceNetworks: uhcHmo && kaiserHmo && ppoPlan ? [uhcHmo.id, kaiserHmo.id, ppoPlan.id] : [],
      languages: ['en', 'zh'],
    },
  })
  console.log('  ✅ Dr. Chen')

  // API key for specialist org
  const reviewKey = 'rc_live_demo_key_review_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(reviewKey).digest('hex') },
    update: {},
    create: {
      organizationId: specialistOrg.id,
      name: 'Demo API Key (Review Queue)',
      keyHash: createHash('sha256').update(reviewKey).digest('hex'),
      keyPrefix: reviewKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write'],
    },
  })

  // Metroplex Pulmonary & Sleep Center
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
  console.log('  ✅ Metroplex Pulmonary & Sleep Center')

  // BCBS TX and UHC TX payers (needed for MPSC)
  const bcbsTx = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'BCBS-TX-84980' },
    update: {},
    create: {
      name: 'Blue Cross Blue Shield of Texas',
      tradingPartnerServiceId: 'BCBS-TX-84980',
      fhirBaseUrl: 'https://sandbox.bcbs.com/fhir/r4',
      apiType: 'fhir_r4',
      authEndpoint: 'https://sandbox.bcbs.com/oauth/token',
      requiresFax: false,
    },
  })

  const uhcTx = await prisma.payer.upsert({
    where: { tradingPartnerServiceId: 'UHC-TX-87726' },
    update: {},
    create: {
      name: 'UnitedHealthcare Texas',
      tradingPartnerServiceId: 'UHC-TX-87726',
      fhirBaseUrl: 'https://sandbox.apis.uhc.com/fhir/r4',
      apiType: 'fhir_r4',
      authEndpoint: 'https://sandbox.apis.uhc.com/oauth/token',
      requiresFax: false,
    },
  })

  // Dr. Kureishy
  const mpscHash = await bcrypt.hash('mpsc2026', 10)
  const dr_kureishy = await prisma.provider.upsert({
    where: { npi: '1528061108' },
    update: {},
    create: {
      organizationId: mpscOrg.id,
      firstName: 'Shahrukh', lastName: 'Kureishy',
      npi: '1528061108',
      specialty: 'Pulmonary Disease',
      subSpecialty: 'Sleep Medicine',
      email: 'drkureishy@mpsleepcenter.com',
      phone: '972-838-1892',
      licenseState: 'TX',
      licenseNumber: 'L6995',
      acceptingNewPatients: true,
      insuranceNetworks: bcbsTxPpo && uhcTxMa ? [bcbsTxPpo.id, uhcTxMa.id] : [],
      languages: ['en', 'ur'],
    },
  })
  console.log('  ✅ Dr. Kureishy')

  await prisma.user.upsert({
    where: { email: 'drkureishy@mpsleepcenter.com' },
    update: {},
    create: {
      email: 'drkureishy@mpsleepcenter.com',
      password: mpscHash,
      role: 'PROVIDER',
      firstName: 'Shahrukh', lastName: 'Kureishy',
      providerId: dr_kureishy.id,
    },
  })

  const mpscKey = 'rc_live_mpsc_pilot_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(mpscKey).digest('hex') },
    update: {},
    create: {
      organizationId: mpscOrg.id,
      name: 'MPSC Pilot API Key',
      keyHash: createHash('sha256').update(mpscKey).digest('hex'),
      keyPrefix: mpscKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read', 'auth:read', 'auth:write'],
    },
  })
  console.log('  ✅ MPSC API key')

  console.log('✅ Repair complete')
  const count = await prisma.organization.count()
  console.log(`  Total orgs: ${count}`)
}

repair().catch(e => { console.error('❌ Repair failed:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())

