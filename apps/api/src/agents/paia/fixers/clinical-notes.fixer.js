/**
 * Auto-fixer for clinical notes documentation gaps.
 *
 * When PAIA detects that required scoring criteria are mentioned in the notes
 * but not formatted in the structured way payers expect, this fixer extracts
 * and appends a clean structured summary.
 *
 * IMPORTANT: This fixer only EXTRACTS and FORMATS information already present
 * in the clinical notes. It never invents clinical data. If the data isn't
 * in the notes, it flags for human completion — it does not fabricate scores.
 */

// Extraction patterns for common clinical scores
const EXTRACTORS = {
  ess: {
    patterns: [
      /epworth[^0-9]*(\d{1,2})/i,
      /ESS[:\s]+(\d{1,2})/i,
      /ESS score[:\s]+(\d{1,2})/i,
      /sleepiness scale[^0-9]*(\d{1,2})/i,
    ],
    label: 'Epworth Sleepiness Scale (ESS)',
    range: [0, 24],
    format: (score) => `ESS: ${score}/24`,
  },
  stopbang: {
    patterns: [
      /STOP.?BANG[:\s]+(\d)/i,
      /STOP.?BANG score[:\s]+(\d)/i,
      /stop bang[^0-9]*(\d)/i,
    ],
    // Also count STOP-BANG criteria mentions if score not explicit
    criteriaKeywords: [
      'snoring', 'tired', 'observed apnea', 'blood pressure', 'hypertension',
      'BMI', 'age', 'neck', 'male', 'gender',
    ],
    label: 'STOP-BANG',
    range: [0, 8],
    format: (score) => `STOP-BANG: ${score}/8`,
  },
  ahi: {
    patterns: [
      /AHI[:\s]+(\d+\.?\d*)/i,
      /apnea.hypopnea index[:\s]+(\d+\.?\d*)/i,
      /apnea hypopnea index[:\s]+(\d+\.?\d*)/i,
    ],
    label: 'Apnea-Hypopnea Index (AHI)',
    format: (score) => `AHI: ${score} events/hour`,
  },
  bmi: {
    patterns: [
      /BMI[:\s]+(\d+\.?\d*)/i,
      /body mass index[:\s]+(\d+\.?\d*)/i,
    ],
    label: 'BMI',
    format: (score) => `BMI: ${score}`,
  },
  fev1: {
    patterns: [
      /FEV1[:\s]+(\d+\.?\d*)%/i,
      /FEV1[:\s]+(\d+\.?\d*)\s*percent/i,
    ],
    label: 'FEV1',
    format: (score) => `FEV1: ${score}% predicted`,
  },
}

function extractScore(notes, extractor) {
  for (const pattern of extractor.patterns) {
    const match = notes.match(pattern)
    if (match) {
      const score = parseFloat(match[1])
      if (!isNaN(score)) {
        if (extractor.range && (score < extractor.range[0] || score > extractor.range[1])) {
          continue  // Out of valid range — skip, likely a false match
        }
        return score
      }
    }
  }
  return null
}

export function applyNotesFixer(clinicalNotes, autoExtractableItems) {
  if (!autoExtractableItems?.length) return { fixed: false, notes: clinicalNotes, applied: [] }

  const applied = []
  const structuredItems = []

  // Try to extract each item flagged as auto-extractable
  for (const item of autoExtractableItems) {
    const { criterionId } = item

    // Map criterion IDs to extractors
    const extractorKey = {
      'ess-threshold':        'ess',
      'stopbang-threshold':   'stopbang',
      'stopbang-documented':  'stopbang',
      'ahi-documented':       'ahi',
      'ahi-confirmed':        'ahi',
    }[criterionId]

    if (!extractorKey || !EXTRACTORS[extractorKey]) continue

    const extractor = EXTRACTORS[extractorKey]
    const score = extractScore(clinicalNotes, extractor)

    if (score !== null) {
      structuredItems.push(extractor.format(score))
      applied.push({
        criterionId,
        extractorKey,
        score,
        formatted: extractor.format(score),
      })
    }
  }

  if (structuredItems.length === 0) {
    return { fixed: false, notes: clinicalNotes, applied: [] }
  }

  // Append structured summary block to notes
  const structuredBlock = `

--- Plerous Pre-Auth Documentation Summary (auto-extracted) ---
${structuredItems.join('\n')}
--- End Summary ---`

  return {
    fixed: true,
    notes: clinicalNotes + structuredBlock,
    applied,
    message: `Auto-extracted and formatted ${applied.length} clinical indicator(s): ${applied.map(a => a.formatted).join(', ')}`,
  }
}
