import { z } from 'zod'
import { lookupNPI, searchNPPES } from '../../lib/nppes.js'
import { inferEHRFromNPI } from '../../ehr/eir.service.js'
import { prisma } from '../../db/client.js'

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
})

const searchSchema = z.object({
  firstName: z.string().optional(),
  lastName:  z.string().optional(),
  state:     z.string().length(2).optional(),
  orgName:   z.string().optional(),
})

export default async function onboardingRoutes(app) {
  /**
   * GET /v1/onboarding/npi/:npi
   *
   * Core onboarding lookup. Provider enters their NPI, we return everything
   * pre-populated from NPPES public data. Zero questions asked.
   *
   * Also checks if this NPI is already registered in Plerous.
   */
  app.get('/npi/:npi', {
    schema: {
      tags: ['Onboarding'],
      summary: 'Look up provider profile by NPI (public NPPES data)',
    },
  }, async (req, reply) => {
    const { npi } = npiSchema.parse(req.params)

    // 1. Fetch from NPPES
    const profile = await lookupNPI(npi)
    if (!profile) {
      return reply.code(404).send({ found: false, profile: null, alreadyRegistered: false })
    }

    // 2. Check if already registered
    const existingProvider = await prisma.provider.findUnique({ where: { npi } })
    const existingOrg      = await prisma.organization.findUnique({ where: { npi } })

    // 3. EHR inference from specialty + practice size signals
    const ehrHint = inferEHRHintFromProfile(profile)

    return {
      found: true,
      alreadyRegistered: !!(existingProvider || existingOrg),
      registeredOrgId: existingOrg?.id || null,
      profile: {
        ...profile,
        ehrHint,  // "Based on your specialty and practice size, you're likely on one of: [Tebra, DrChrono, athenahealth]"
      },
    }
  })

  /**
   * POST /v1/onboarding/npi/search
   *
   * Search NPPES by name + state when provider doesn't know their NPI.
   */
  app.post('/npi/search', {
    schema: { tags: ['Onboarding'], summary: 'Search for provider by name (NPPES)' },
  }, async (req) => {
    const params = searchSchema.parse(req.body)
    const results = await searchNPPES(params)

    return {
      count: results.length,
      results: results.map(r => ({
        npi: r.npi,
        name: r.firstName ? `${r.firstName} ${r.lastName}${r.credential ? ', ' + r.credential : ''}` : r.orgName,
        specialty: r.specialty,
        city: r.practiceAddress?.city,
        state: r.practiceAddress?.state,
        enumerationType: r.enumerationType,
      })),
    }
  })

  /**
   * POST /v1/onboarding/claim
   *
   * After NPI lookup confirms identity, provider claims their profile
   * and begins EHR connection. Creates org + provider records from
   * NPPES data — they don't fill out a form.
   */
  app.post('/claim', {
    schema: {
      tags: ['Onboarding'],
      summary: 'Claim NPI profile and start EHR connection',
      body: {
        type: 'object',
        required: ['npi', 'email', 'password'],
        properties: {
          npi:      { type: 'string', pattern: '^\\d{10}$' },
          email:    { type: 'string', format: 'email', minLength: 5 },
          password: { type: 'string', minLength: 8 },
          overrides: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const { npi, email, password, overrides } = req.body

    // Fetch current NPPES data
    const profile = await lookupNPI(npi)
    if (!profile) {
      return reply.code(404).send({ error: 'NPI not found in NPPES registry' })
    }

    // Check for conflicts
    const existing = await prisma.provider.findUnique({ where: { npi } })
    if (existing) {
      return reply.code(409).send({ error: 'This NPI is already registered. Use login instead.' })
    }

    // Build org from NPPES data (individual NPI → sole proprietor org)
    const addr = profile.practiceAddress || {}
    const orgData = {
      name:      profile.orgName || `${profile.firstName} ${profile.lastName} MD PC`,
      npi:       profile.enumerationType === 'organization' ? npi : `${npi}-org`, // org NPI if individual
      type:      inferOrgType(profile),
      address:   {
        line1:   addr.line1   || '',
        city:    addr.city    || '',
        state:   addr.state   || '',
        zip:     addr.zip     || '',
        country: addr.country || 'US',
      },
      phone:  overrides?.phone || profile.phone || '',
      email,
      faxNumber: overrides?.fax || profile.fax,
    }

    const bcrypt = await import('bcryptjs')
    const hashedPw = await bcrypt.default.hash(password, 12)

    // Create org → provider → user in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: orgData })

      const provider = await tx.provider.create({
        data: {
          organizationId:       org.id,
          firstName:            profile.firstName || '',
          lastName:             profile.lastName  || '',
          npi,
          specialty:            profile.specialty || profile.specialtySlug || 'general',
          email,
          phone:                overrides?.phone  || profile.phone || '',
          licenseState:         profile.allTaxonomies[0]?.state || addr.state || '',
          licenseNumber:        profile.allTaxonomies[0]?.license || '',
          acceptingNewPatients: true,
          insuranceNetworks:    [],
          languages:            ['en'],
        },
      })

      const user = await tx.user.create({
        data: {
          email,
          password:   hashedPw,
          role:       'ORG_ADMIN',
          providerId: provider.id,
          firstName:  profile.firstName || '',
          lastName:   profile.lastName  || '',
        },
      })

      return { org, provider, user }
    })

    const token = await reply.jwtSign({
      userId: result.user.id,
      orgId:  result.org.id,
      role:   'ORG_ADMIN',
    })

    return {
      success: true,
      token,
      userId:  result.user.id,
      orgId:   result.org.id,
      message: 'Profile claimed. Next: connect your EHR.',
      nextStep: 'ehr_connect',
    }
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function inferOrgType(profile) {
  const slug = profile.specialtySlug || ''
  if (['family_medicine', 'internal_medicine', 'general_practice'].includes(slug)) return 'PCP_PRACTICE'
  if (slug.startsWith('cardiology') || slug.startsWith('oncology') || slug.includes('surgery')) return 'SPECIALIST_PRACTICE'
  if (profile.isSoleProprietor) return 'PCP_PRACTICE'
  return 'SPECIALIST_PRACTICE'
}

/**
 * Hint at likely EHR based on specialty + practice signals.
 * This is pre-connection intelligence — after SMART on FHIR we know exactly.
 */
function inferEHRHintFromProfile(profile) {
  const slug = profile.specialtySlug || ''
  const hints = []

  // Specialty-based EHR affinity (from market share data)
  if (['family_medicine', 'general_practice', 'internal_medicine'].includes(slug)) {
    hints.push('athenahealth', 'eclinicalworks', 'epic', 'tebra')
  } else if (slug === 'dermatology') {
    hints.push('modmed', 'nextech', 'drchrono')
  } else if (slug === 'ophthalmology') {
    hints.push('modmed', 'nextech')
  } else if (['orthopedics', 'orthopedics_spine'].includes(slug)) {
    hints.push('nextgen', 'athenahealth', 'epic')
  } else if (['sleep_medicine', 'pulmonology'].includes(slug)) {
    hints.push('epic', 'cerner', 'athenahealth', 'tebra')
  } else if (['gastroenterology', 'nephrology'].includes(slug)) {
    hints.push('epic', 'athenahealth', 'nextgen')
  } else if (slug === 'psychiatry' || slug === 'psychiatry_child') {
    hints.push('drchrono', 'tebra', 'athenahealth')
  } else if (slug.startsWith('oncology')) {
    hints.push('epic', 'cerner')
  }

  // Solo/small practice indicator — likely cloud-based
  if (profile.isSoleProprietor && !hints.includes('tebra')) {
    hints.unshift('tebra', 'drchrono')
  }

  return hints.length > 0 ? hints.slice(0, 3) : ['epic', 'athenahealth', 'eclinicalworks']
}
