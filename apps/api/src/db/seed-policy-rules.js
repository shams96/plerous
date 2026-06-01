/**
 * Seeds PolicyRule table from the hardcoded PAIA rules.
 * Run once after schema migration.
 * These become the source of truth — the JS rule files will be deprecated.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding PolicyRule table...')

  const bcbsTx = await prisma.payer.findFirst({ where: { tradingPartnerServiceId: 'BCBS-TX-00533' } })
  const uhcTx  = await prisma.payer.findFirst({ where: { tradingPartnerServiceId: 'UHC-TX-MA-87726' } })

  const rules = [
    // ── BCBS TX ──────────────────────────────────────────────────────────────
    {
      payerId: bcbsTx?.id ?? null,
      cptCode: '95810',
      paRequired: true,
      criteria: {
        required: [
          { id: 'ess_score',    label: 'Epworth Sleepiness Scale ≥ 10', autoExtractable: true,  pattern: 'ESS' },
          { id: 'stop_bang',   label: 'STOP-BANG score ≥ 3',            autoExtractable: true,  pattern: 'STOP-BANG' },
          { id: 'osa_symptoms', label: 'OSA symptoms documented',        autoExtractable: true,  pattern: 'snoring|apnea|witnessed|hypersomnia' },
        ],
        preferred: [
          { id: 'bmi',         label: 'BMI documented',                 autoExtractable: true,  pattern: 'BMI' },
          { id: 'neck_circumference', label: 'Neck circumference',      autoExtractable: false },
        ],
      },
      denialRateBaseline: 0.34,
      sourceName: 'BCBS TX MP-2.04.22',
      sourceUrl:  'https://www.bcbstx.com/provider/clinical/mp_2_04_22.html',
      isActive: true,
    },
    {
      payerId: bcbsTx?.id ?? null,
      cptCode: '95811',
      paRequired: true,
      criteria: {
        required: [
          { id: 'prior_osa_dx',    label: 'Prior OSA diagnosis required',    autoExtractable: false },
          { id: 'ahi_score',       label: 'AHI ≥ 5 documented',              autoExtractable: true,  pattern: 'AHI' },
          { id: 'cpap_naive',      label: 'CPAP-naive or intolerant status',  autoExtractable: true,  pattern: 'CPAP-naive|never tried CPAP|intolerant to CPAP' },
        ],
        preferred: [],
      },
      denialRateBaseline: 0.18,
      sourceName: 'BCBS TX MP-2.04.22',
      isActive: true,
    },
    {
      payerId: bcbsTx?.id ?? null,
      cptCode: '94726',
      paRequired: true,
      criteria: {
        required: [
          { id: 'lung_disease_indication', label: 'Lung disease indication documented', autoExtractable: false },
        ],
        preferred: [],
      },
      denialRateBaseline: 0.22,
      sourceName: 'BCBS TX MP-2.04.105',
      isActive: true,
    },
    {
      payerId: bcbsTx?.id ?? null,
      cptCode: '94010',
      paRequired: false,
      criteria: { required: [], preferred: [] },
      denialRateBaseline: 0.04,
      sourceName: 'BCBS TX',
      isActive: true,
    },

    // ── UHC TX Medicare Advantage ─────────────────────────────────────────────
    {
      payerId: uhcTx?.id ?? null,
      cptCode: '95810',
      paRequired: true,
      criteria: {
        required: [
          { id: 'ess_score',    label: 'Epworth Sleepiness Scale ≥ 10', autoExtractable: true, pattern: 'ESS' },
          { id: 'stop_bang',   label: 'STOP-BANG score ≥ 3',            autoExtractable: true, pattern: 'STOP-BANG' },
          { id: 'osa_symptoms', label: 'OSA clinical indicators',        autoExtractable: true, pattern: 'snoring|apnea|witnessed' },
        ],
        preferred: [
          { id: 'bmi', label: 'BMI ≥ 30', autoExtractable: true, pattern: 'BMI' },
        ],
      },
      denialRateBaseline: 0.29,
      sourceName: 'UHC MA Coverage Determination T2023.2',
      isActive: true,
    },
    {
      payerId: uhcTx?.id ?? null,
      cptCode: '95811',
      paRequired: true,
      criteria: {
        required: [
          { id: 'ahi_score',         label: 'AHI ≥ 5',                    autoExtractable: true,  pattern: 'AHI' },
          { id: 'treatment_indication', label: 'Treatment indication noted', autoExtractable: false },
        ],
        preferred: [],
      },
      denialRateBaseline: 0.21,
      sourceName: 'UHC MA Coverage Determination T2023.2',
      isActive: true,
    },
    {
      payerId: uhcTx?.id ?? null,
      cptCode: '94726',
      paRequired: false,  // UHC MA differs from BCBS TX
      criteria: { required: [], preferred: [] },
      denialRateBaseline: 0.06,
      sourceName: 'UHC MA',
      isActive: true,
    },

    // ── Universal defaults (no specific payer) ────────────────────────────────
    { payerId: null, cptCode: '27447', paRequired: true,
      criteria: { required: [{ id: 'conservative_tx', label: '3+ months conservative treatment documented', autoExtractable: false }] , preferred: [] },
      denialRateBaseline: 0.38, sourceName: 'CMS Default', isActive: true },
    { payerId: null, cptCode: '27130', paRequired: true,
      criteria: { required: [{ id: 'conservative_tx', label: '3+ months conservative treatment', autoExtractable: false }], preferred: [] },
      denialRateBaseline: 0.35, sourceName: 'CMS Default', isActive: true },
    { payerId: null, cptCode: '45378', paRequired: true,
      criteria: { required: [{ id: 'age_or_indication', label: 'Age 45+ or symptomatic indication', autoExtractable: false }], preferred: [] },
      denialRateBaseline: 0.12, sourceName: 'CMS Default', isActive: true },
    { payerId: null, cptCode: '93306', paRequired: true,
      criteria: { required: [{ id: 'cardiac_indication', label: 'Cardiac indication documented', autoExtractable: false }], preferred: [] },
      denialRateBaseline: 0.15, sourceName: 'CMS Default', isActive: true },
    { payerId: null, cptCode: '93000', paRequired: false,
      criteria: { required: [], preferred: [] }, sourceName: 'CMS Default', isActive: true },
    { payerId: null, cptCode: '99213', paRequired: false,
      criteria: { required: [], preferred: [] }, sourceName: 'CMS Default', isActive: true },
  ]

  let created = 0, updated = 0
  for (const rule of rules) {
    const existing = await prisma.policyRule.findFirst({
      where: { payerId: rule.payerId ?? null, cptCode: rule.cptCode },
    })
    if (existing) {
      await prisma.policyRule.update({ where: { id: existing.id }, data: { ...rule, updatedBy: 'system:seed' } })
      updated++
    } else {
      await prisma.policyRule.create({ data: { ...rule, createdBy: 'system:seed' } })
      created++
    }
  }

  console.log(`Done. ${created} created, ${updated} updated.`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
