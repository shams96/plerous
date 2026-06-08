/**
 * NPI lookup — calls public NPPES API directly.
 * No backend required. Overrides the catch-all proxy for this route.
 */

import { NextRequest, NextResponse } from 'next/server'

const NPPES_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1'

const TAXONOMY_MAP: Record<string, { specialty: string; slug: string }> = {
  '207Q00000X': { specialty: 'Family Medicine', slug: 'family_medicine' },
  '207R00000X': { specialty: 'Internal Medicine', slug: 'internal_medicine' },
  '208D00000X': { specialty: 'General Practice', slug: 'general_practice' },
  '207RP1001X': { specialty: 'Pulmonary Disease', slug: 'pulmonology' },
  '207RS0010X': { specialty: 'Sleep Medicine', slug: 'sleep_medicine' },
  '207RC0000X': { specialty: 'Cardiovascular Disease', slug: 'cardiology' },
  '207RG0300X': { specialty: 'Gastroenterology', slug: 'gastroenterology' },
  '207RN0300X': { specialty: 'Nephrology', slug: 'nephrology' },
  '207X00000X': { specialty: 'Orthopaedic Surgery', slug: 'orthopedics' },
  '2084N0400X': { specialty: 'Neurology', slug: 'neurology' },
  '207RX0202X': { specialty: 'Medical Oncology', slug: 'oncology' },
  '2084P0800X': { specialty: 'Psychiatry', slug: 'psychiatry' },
  '207N00000X': { specialty: 'Dermatology', slug: 'dermatology' },
  '207W00000X': { specialty: 'Ophthalmology', slug: 'ophthalmology' },
  '207Y00000X': { specialty: 'Otolaryngology', slug: 'ent' },
  '208800000X': { specialty: 'Urology', slug: 'urology' },
  '207V00000X': { specialty: 'Obstetrics & Gynecology', slug: 'obgyn' },
  '207RE0101X': { specialty: 'Endocrinology', slug: 'endocrinology' },
  '207K00000X': { specialty: 'Allergy & Immunology', slug: 'allergy_immunology' },
}

function normalizeResult(r: Record<string, unknown>) {
  const basic = (r.basic as Record<string, string>) || {}
  const isIndividual = r.enumeration_type === 'NPI-1'
  const taxonomies = (r.taxonomies as Record<string, unknown>[]) || []
  const primaryTaxonomy = (taxonomies.find((t: Record<string, unknown>) => t.primary) || taxonomies[0]) as Record<string, string> | undefined
  const taxonomyCode = primaryTaxonomy?.code || null
  const taxonomyInfo = taxonomyCode ? TAXONOMY_MAP[taxonomyCode] : null
  const addresses = (r.addresses as Record<string, string>[]) || []
  const practiceAddr = addresses.find(a => a.address_purpose === 'LOCATION') || addresses[0]

  return {
    npi: r.number,
    enumerationType: isIndividual ? 'individual' : 'organization',
    firstName: isIndividual ? basic.first_name : null,
    lastName: isIndividual ? basic.last_name : null,
    credential: isIndividual ? basic.credential : null,
    orgName: !isIndividual ? basic.organization_name : null,
    taxonomyCode,
    specialty: taxonomyInfo?.specialty || primaryTaxonomy?.desc || null,
    specialtySlug: taxonomyInfo?.slug || null,
    allTaxonomies: taxonomies.map((t: Record<string, unknown>) => ({
      code: t.code, desc: t.desc, primary: t.primary || false,
      state: t.state || null, license: t.license || null,
    })),
    phone: practiceAddr?.telephone_number || null,
    fax: practiceAddr?.fax_number || null,
    practiceAddress: practiceAddr ? {
      line1: practiceAddr.address_1 || null,
      line2: practiceAddr.address_2 || null,
      city: practiceAddr.city || null,
      state: practiceAddr.state || null,
      zip: practiceAddr.postal_code?.slice(0, 5) || null,
      country: 'US',
    } : null,
    enumerationDate: basic.enumeration_date || null,
    lastUpdated: basic.last_updated || null,
    status: basic.status || 'A',
    isSoleProprietor: basic.sole_proprietor === 'YES',
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ npi: string }> },
) {
  const { npi } = await params

  if (!/^\d{10}$/.test(npi)) {
    return NextResponse.json({ error: 'NPI must be exactly 10 digits' }, { status: 422 })
  }

  try {
    const res = await fetch(`${NPPES_BASE}&number=${npi}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) throw new Error(`NPPES error: ${res.status}`)

    const data = await res.json()

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ found: false, profile: null, alreadyRegistered: false })
    }

    const profile = normalizeResult(data.results[0])
    return NextResponse.json({ found: true, alreadyRegistered: false, profile })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
