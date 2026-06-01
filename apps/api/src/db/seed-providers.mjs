/**
 * Plerous Seed — Real Provider Network
 * Seeds 4 real providers from NPPES data as proper seed orgs (clean 10-digit NPIs).
 *
 * Providers:
 *   Hassan Farooq, MD  — Internal Medicine, Greenville TX   (NPI 1154370179)
 *   Farhan Bangash, DO — Nephrology, Crystal Lake IL        (NPI 1750549473)
 *   Zahid Zafar, MD    — Internal Medicine, McKinney TX     (NPI 1043209075)
 *   Qasim Nayeem, MD   — Internal Medicine, McKinney TX     (NPI 1780649905)
 *
 * Metroplex Pulmonary & Sleep Center + Dr. Kureishy are seeded in the main seed.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding real provider network...')

  const pw = await bcrypt.hash('refchain2026!', 10)

  // ── Hassan Farooq MD — Internal Medicine, Greenville TX ─────────────────
  const farooqOrg = await prisma.organization.upsert({
    where: { npi: '1154370179' },
    update: {},
    create: {
      name: 'Hassan Farooq MD — Internal Medicine',
      npi: '1154370179',
      type: 'PCP_PRACTICE',
      address: { street: '4812 Roberts St', city: 'Greenville', state: 'TX', zip: '75401' },
      phone: '903-455-1234',
      email: 'dr.farooq@farooqmd.com',
      planTier: 'STARTER',
    },
  })

  const dr_farooq = await prisma.provider.upsert({
    where: { npi: '1154370179' },
    update: {},
    create: {
      organizationId: farooqOrg.id,
      firstName: 'Hassan',
      lastName: 'Farooq',
      npi: '1154370179',
      specialty: 'Internal Medicine',
      email: 'dr.farooq@farooqmd.com',
      phone: '903-455-1234',
      licenseState: 'TX',
      licenseNumber: '',
      acceptingNewPatients: true,
      insuranceNetworks: [],
      languages: ['en', 'ur'],
    },
  })

  await prisma.user.upsert({
    where: { email: 'dr.farooq@farooqmd.com' },
    update: {},
    create: {
      email: 'dr.farooq@farooqmd.com',
      password: pw,
      role: 'ORG_ADMIN',
      firstName: 'Hassan',
      lastName: 'Farooq',
      providerId: dr_farooq.id,
    },
  })

  const farooqKey = 'rc_live_farooq_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(farooqKey).digest('hex') },
    update: {},
    create: {
      organizationId: farooqOrg.id,
      name: 'Dr. Farooq API Key',
      keyHash: createHash('sha256').update(farooqKey).digest('hex'),
      keyPrefix: farooqKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read'],
    },
  })
  console.log('  ✅ Hassan Farooq MD (NPI 1154370179)')

  // ── Farhan Bangash DO — Nephrology, Crystal Lake IL ──────────────────────
  const bangashOrg = await prisma.organization.upsert({
    where: { npi: '1750549473' },
    update: {},
    create: {
      name: 'Farhan Bangash DO — Nephrology',
      npi: '1750549473',
      type: 'SPECIALIST_PRACTICE',
      address: { street: '442 N IL Route 31', city: 'Crystal Lake', state: 'IL', zip: '60012' },
      phone: '224-238-3211',
      email: 'dr.bangash@bangashnephrology.com',
      planTier: 'STARTER',
    },
  })

  const dr_bangash = await prisma.provider.upsert({
    where: { npi: '1750549473' },
    update: {},
    create: {
      organizationId: bangashOrg.id,
      firstName: 'Farhan',
      lastName: 'Bangash',
      npi: '1750549473',
      specialty: 'Nephrology',
      email: 'dr.bangash@bangashnephrology.com',
      phone: '224-238-3211',
      licenseState: 'IL',
      licenseNumber: '',
      acceptingNewPatients: true,
      insuranceNetworks: [],
      languages: ['en', 'ur'],
    },
  })

  await prisma.user.upsert({
    where: { email: 'dr.bangash@bangashnephrology.com' },
    update: {},
    create: {
      email: 'dr.bangash@bangashnephrology.com',
      password: pw,
      role: 'ORG_ADMIN',
      firstName: 'Farhan',
      lastName: 'Bangash',
      providerId: dr_bangash.id,
    },
  })

  const bangashKey = 'rc_live_bangash_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(bangashKey).digest('hex') },
    update: {},
    create: {
      organizationId: bangashOrg.id,
      name: 'Dr. Bangash API Key',
      keyHash: createHash('sha256').update(bangashKey).digest('hex'),
      keyPrefix: bangashKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read'],
    },
  })
  console.log('  ✅ Farhan Bangash DO (NPI 1750549473)')

  // ── Zahid Zafar MD — Internal Medicine, McKinney TX ──────────────────────
  const zafarOrg = await prisma.organization.upsert({
    where: { npi: '1043209075' },
    update: {},
    create: {
      name: 'Zahid Zafar MD — Internal Medicine',
      npi: '1043209075',
      type: 'PCP_PRACTICE',
      address: { street: '4201 Medical Center Dr Ste 300', city: 'McKinney', state: 'TX', zip: '75069' },
      phone: '972-975-8480',
      email: 'dr.zafar@zafarmd.com',
      planTier: 'STARTER',
    },
  })

  const dr_zafar = await prisma.provider.upsert({
    where: { npi: '1043209075' },
    update: {},
    create: {
      organizationId: zafarOrg.id,
      firstName: 'Zahid',
      lastName: 'Zafar',
      npi: '1043209075',
      specialty: 'Internal Medicine',
      email: 'dr.zafar@zafarmd.com',
      phone: '972-975-8480',
      licenseState: 'TX',
      licenseNumber: '',
      acceptingNewPatients: true,
      insuranceNetworks: [],
      languages: ['en', 'ur'],
    },
  })

  await prisma.user.upsert({
    where: { email: 'dr.zafar@zafarmd.com' },
    update: {},
    create: {
      email: 'dr.zafar@zafarmd.com',
      password: pw,
      role: 'ORG_ADMIN',
      firstName: 'Zahid',
      lastName: 'Zafar',
      providerId: dr_zafar.id,
    },
  })

  const zafarKey = 'rc_live_zafar_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(zafarKey).digest('hex') },
    update: {},
    create: {
      organizationId: zafarOrg.id,
      name: 'Dr. Zafar API Key',
      keyHash: createHash('sha256').update(zafarKey).digest('hex'),
      keyPrefix: zafarKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read'],
    },
  })
  console.log('  ✅ Zahid Zafar MD (NPI 1043209075)')

  // ── Qasim Nayeem MD — Internal Medicine, McKinney TX ─────────────────────
  const nayeemOrg = await prisma.organization.upsert({
    where: { npi: '1780649905' },
    update: {},
    create: {
      name: 'Qasim Nayeem MD — Internal Medicine',
      npi: '1780649905',
      type: 'PCP_PRACTICE',
      address: { street: '5417 Bentrose Dr', city: 'McKinney', state: 'TX', zip: '75070' },
      phone: '214-548-6388',
      email: 'dr.nayeem@nayeemmd.com',
      planTier: 'STARTER',
    },
  })

  const dr_nayeem = await prisma.provider.upsert({
    where: { npi: '1780649905' },
    update: {},
    create: {
      organizationId: nayeemOrg.id,
      firstName: 'Qasim',
      lastName: 'Nayeem',
      npi: '1780649905',
      specialty: 'Internal Medicine',
      email: 'dr.nayeem@nayeemmd.com',
      phone: '214-548-6388',
      licenseState: 'TX',
      licenseNumber: '',
      acceptingNewPatients: true,
      insuranceNetworks: [],
      languages: ['en', 'ur'],
    },
  })

  await prisma.user.upsert({
    where: { email: 'dr.nayeem@nayeemmd.com' },
    update: {},
    create: {
      email: 'dr.nayeem@nayeemmd.com',
      password: pw,
      role: 'ORG_ADMIN',
      firstName: 'Qasim',
      lastName: 'Nayeem',
      providerId: dr_nayeem.id,
    },
  })

  const nayeemKey = 'rc_live_nayeem_2026'
  await prisma.apiKey.upsert({
    where: { keyHash: createHash('sha256').update(nayeemKey).digest('hex') },
    update: {},
    create: {
      organizationId: nayeemOrg.id,
      name: 'Dr. Nayeem API Key',
      keyHash: createHash('sha256').update(nayeemKey).digest('hex'),
      keyPrefix: nayeemKey.slice(0, 12),
      scopes: ['referrals:read', 'referrals:write', 'patients:read'],
    },
  })
  console.log('  ✅ Qasim Nayeem MD (NPI 1780649905)')

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = await prisma.organization.count()
  const providers = await prisma.provider.count()
  console.log(`\n✅ Done. DB state: ${total} orgs, ${providers} providers`)
}

main()
  .catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())

