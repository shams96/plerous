/**
 * NPPES (National Plan & Provider Enumeration System) lookup
 * Public CMS API — no auth required
 * https://npiregistry.cms.hhs.gov/api/
 *
 * Returns everything we need to pre-populate a provider profile:
 * name, specialty (taxonomy), practice address, org affiliations, fax
 */

const NPPES_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1'

// NUCC taxonomy code → human-readable specialty + our internal specialty slug
const TAXONOMY_MAP = {
  // Primary Care
  '207Q00000X': { specialty: 'Family Medicine', slug: 'family_medicine' },
  '207QA0505X': { specialty: 'Family Medicine - Adult', slug: 'family_medicine' },
  '207R00000X': { specialty: 'Internal Medicine', slug: 'internal_medicine' },
  '207RG0100X': { specialty: 'Internal Medicine - Geriatric', slug: 'internal_medicine' },
  '208D00000X': { specialty: 'General Practice', slug: 'general_practice' },

  // Pulmonology & Sleep
  '207RP1001X': { specialty: 'Pulmonary Disease', slug: 'pulmonology' },
  '207RS0010X': { specialty: 'Sleep Medicine (Internal Med)', slug: 'sleep_medicine' },
  '207RR0500X': { specialty: 'Critical Care Medicine', slug: 'critical_care' },

  // Cardiology
  '207RC0000X': { specialty: 'Cardiovascular Disease', slug: 'cardiology' },
  '207RC0001X': { specialty: 'Clinical Cardiac Electrophysiology', slug: 'cardiology_ep' },
  '207RI0011X': { specialty: 'Interventional Cardiology', slug: 'cardiology_interventional' },

  // Gastroenterology
  '207RG0300X': { specialty: 'Gastroenterology', slug: 'gastroenterology' },

  // Nephrology
  '207RN0300X': { specialty: 'Nephrology', slug: 'nephrology' },

  // Orthopedics
  '207X00000X': { specialty: 'Orthopaedic Surgery', slug: 'orthopedics' },
  '207XS0106X': { specialty: 'Orthopaedic Surgery - Spine', slug: 'orthopedics_spine' },

  // Neurology
  '2084N0400X': { specialty: 'Neurology', slug: 'neurology' },
  '2084P0005X': { specialty: 'Neurology - Sleep Medicine', slug: 'sleep_medicine' },

  // Oncology
  '207RX0202X': { specialty: 'Medical Oncology', slug: 'oncology' },
  '2086S0120X': { specialty: 'Surgery - Surgical Oncology', slug: 'oncology_surgical' },
  '2085R0202X': { specialty: 'Radiation Oncology', slug: 'oncology_radiation' },

  // Psychiatry
  '2084P0800X': { specialty: 'Psychiatry', slug: 'psychiatry' },
  '2084P0804X': { specialty: 'Psychiatry - Child & Adolescent', slug: 'psychiatry_child' },

  // Dermatology
  '207N00000X': { specialty: 'Dermatology', slug: 'dermatology' },

  // Ophthalmology
  '207W00000X': { specialty: 'Ophthalmology', slug: 'ophthalmology' },

  // ENT
  '207Y00000X': { specialty: 'Otolaryngology', slug: 'ent' },

  // Urology
  '208800000X': { specialty: 'Urology', slug: 'urology' },

  // OB/GYN
  '207V00000X': { specialty: 'Obstetrics & Gynecology', slug: 'obgyn' },

  // Endocrinology
  '207RE0101X': { specialty: 'Endocrinology, Diabetes & Metabolism', slug: 'endocrinology' },

  // Rheumatology
  '207RR0300X': { specialty: 'Rheumatology', slug: 'rheumatology' },

  // Allergy
  '207K00000X': { specialty: 'Allergy & Immunology', slug: 'allergy_immunology' },
}

/**
 * Look up a provider by NPI number.
 * Returns a normalized provider profile or null if not found.
 */
export async function lookupNPI(npi) {
  const res = await fetch(`${NPPES_BASE}&number=${encodeURIComponent(npi)}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`NPPES API error: ${res.status}`)

  const data = await res.json()

  if (!data.results || data.results.length === 0) return null

  return normalizeResult(data.results[0])
}

/**
 * Search NPPES by name + state (for practice-side discovery).
 * Returns up to 10 results.
 */
export async function searchNPPES({ firstName, lastName, state, taxonomy, orgName } = {}) {
  const params = new URLSearchParams({ version: '2.1', limit: '10' })

  if (firstName) params.set('first_name', firstName)
  if (lastName)  params.set('last_name', lastName)
  if (state)     params.set('state', state)
  if (taxonomy)  params.set('taxonomy_description', taxonomy)
  if (orgName)   params.set('organization_name', orgName)

  const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`NPPES API error: ${res.status}`)

  const data = await res.json()

  return (data.results || []).map(normalizeResult)
}

function normalizeResult(r) {
  const basic = r.basic || {}
  const isIndividual = r.enumeration_type === 'NPI-1'

  // Primary taxonomy (first with primary_taxonomy: true, or first overall)
  const taxonomies = r.taxonomies || []
  const primaryTaxonomy = taxonomies.find(t => t.primary) || taxonomies[0]
  const taxonomyCode = primaryTaxonomy?.code || null
  const taxonomyInfo = TAXONOMY_MAP[taxonomyCode] || null

  // Practice address (type = LOCATION preferred, fallback to MAILING)
  const addresses = r.addresses || []
  const practiceAddr = addresses.find(a => a.address_purpose === 'LOCATION') || addresses[0]

  // Other practice locations
  const practiceLocations = addresses
    .filter(a => a.address_purpose === 'LOCATION')
    .map(normalizeAddress)

  // Phone / fax from practice address
  const phone = practiceAddr?.telephone_number || null
  const fax   = practiceAddr?.fax_number || null

  return {
    npi: r.number,
    enumerationType: isIndividual ? 'individual' : 'organization',

    // Name
    firstName:   isIndividual ? basic.first_name  : null,
    lastName:    isIndividual ? basic.last_name   : null,
    credential:  isIndividual ? basic.credential  : null,   // MD, DO, NP, PA
    orgName:    !isIndividual ? basic.organization_name : null,

    // Specialty
    taxonomyCode,
    specialty:   taxonomyInfo?.specialty || primaryTaxonomy?.desc || null,
    specialtySlug: taxonomyInfo?.slug || null,
    allTaxonomies: taxonomies.map(t => ({
      code: t.code,
      desc: t.desc,
      primary: t.primary || false,
      state: t.state || null,
      license: t.license || null,
    })),

    // Contact
    phone,
    fax,
    email: basic.authorized_official_telephone_number || null, // org only

    // Address
    practiceAddress: practiceAddr ? normalizeAddress(practiceAddr) : null,
    practiceLocations,

    // Status
    enumerationDate: basic.enumeration_date || null,
    lastUpdated:     basic.last_updated || null,
    status:          basic.status || 'A',  // A=active, D=deactivated
    isSoleProprietor: basic.sole_proprietor === 'YES',

    // Identifiers (state license numbers, DEA)
    identifiers: (r.identifiers || []).map(id => ({
      type: id.identifier_type,
      code: id.identifier,
      state: id.state || null,
      issuer: id.issuer || null,
    })),

    // Other provider name variants
    otherNames: (r.other_names || []).map(n => ({
      type: n.type,
      name: [n.first_name, n.last_name].filter(Boolean).join(' ') || n.organization_name,
    })),
  }
}

function normalizeAddress(a) {
  return {
    line1:   a.address_1 || null,
    line2:   a.address_2 || null,
    city:    a.city || null,
    state:   a.state || null,
    zip:     a.postal_code?.slice(0, 5) || null,
    country: a.country_name || 'US',
    phone:   a.telephone_number || null,
    fax:     a.fax_number || null,
  }
}
