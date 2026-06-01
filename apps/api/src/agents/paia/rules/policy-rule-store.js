/**
 * PolicyRuleStore — DB-backed payer rules adapter
 *
 * Reads from the PolicyRule table and exposes the same interface as the
 * hardcoded bcbs-tx.rules.js / uhc-tx.rules.js files. PAIA checks consume
 * this transparently — no changes needed in check logic.
 *
 * Interface contract (same as static rule files):
 *   payerRules = {
 *     name: string,
 *     procedureRules: {
 *       [cptCode]: {
 *         paRequired: boolean,
 *         denialRateBaseline: number | null,
 *         clinicalCriteria: Criterion[],
 *         validDiagnoses: string[],
 *       }
 *     }
 *   }
 *
 * Criterion shape (same as hardcoded):
 *   { id, description, documentationKeywords[], scorePattern?, scoreThreshold?,
 *     autoExtractable, severity }
 *
 * TTL cache: rules are cached per-payer for 60 seconds. Admin edits in the
 * console take effect within one cache cycle — fast enough for human workflow,
 * avoids a DB hit on every PAIA analysis.
 */

import { prisma } from '../../../db/client.js'

const CACHE_TTL_MS = 60_000

// Map: payerId -> { rules, cachedAt }
const _cache = new Map()

// Global lists cached separately (no payer filter)
let _universalCache = null
let _universalCachedAt = 0

/**
 * Load payer rules from DB for a given payer ID or trading partner service ID.
 * Falls back to null if no rules found (caller uses defaultRules).
 *
 * @param {string} payerKey  — payer.id or payer.tradingPartnerServiceId (lowercased)
 * @param {string} payerName — human name for display
 */
export async function loadPayerRules(payerKey, payerName) {
  if (!payerKey) return null

  const cached = _cache.get(payerKey)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.rules
  }

  // Find the payer by tradingPartnerServiceId or id
  const payer = await prisma.payer.findFirst({
    where: {
      OR: [
        { id: payerKey },
        { tradingPartnerServiceId: { equals: payerKey, mode: 'insensitive' } },
      ],
    },
  })

  if (!payer) {
    _cache.set(payerKey, { rules: null, cachedAt: Date.now() })
    return null
  }

  const dbRules = await prisma.policyRule.findMany({
    where: { payerId: payer.id, isActive: true },
  })

  if (dbRules.length === 0) {
    _cache.set(payerKey, { rules: null, cachedAt: Date.now() })
    return null
  }

  const rules = _buildRulesObject(payer.name || payerName, dbRules)
  _cache.set(payerKey, { rules, cachedAt: Date.now() })
  return rules
}

/**
 * Load universal (no-payer) rules from DB — used as fallback when no payer match.
 * These have payerId = null in the PolicyRule table.
 */
export async function loadUniversalRules() {
  if (_universalCache && Date.now() - _universalCachedAt < CACHE_TTL_MS) {
    return _universalCache
  }

  const dbRules = await prisma.policyRule.findMany({
    where: { payerId: null, isActive: true },
  })

  // Build PA required / exempt lists for the universal default check
  const universalPaRequired = dbRules
    .filter(r => r.paRequired)
    .map(r => r.cptCode)

  const universalPaExempt = dbRules
    .filter(r => !r.paRequired)
    .map(r => r.cptCode)

  const procedureRules = {}
  for (const r of dbRules) {
    procedureRules[r.cptCode] = _buildProcedureRule(r)
  }

  _universalCache = {
    name: 'Universal (all payers)',
    universalPaRequired,
    universalPaExempt,
    procedureRules,
  }
  _universalCachedAt = Date.now()

  return _universalCache
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _buildRulesObject(payerName, dbRules) {
  const procedureRules = {}
  for (const r of dbRules) {
    procedureRules[r.cptCode] = _buildProcedureRule(r)
  }
  return {
    name: payerName,
    procedureRules,
  }
}

/**
 * Converts a PolicyRule DB record into the format PAIA checks expect.
 *
 * DB criteria shape (criteria JSON column):
 *   {
 *     required: [{ id, label, autoExtractable, pattern? }],
 *     preferred: [{ id, label, autoExtractable, pattern? }],
 *   }
 *
 * Output shape (what documentation.check.js expects):
 *   clinicalCriteria: [{
 *     id, description, documentationKeywords[], scorePattern?,
 *     autoExtractable, severity: 'required'|'advisory'
 *   }]
 */
function _buildProcedureRule(dbRule) {
  const criteria = dbRule.criteria || { required: [], preferred: [] }
  const clinicalCriteria = []

  for (const c of (criteria.required || [])) {
    clinicalCriteria.push({
      id:       c.id || `req-${c.label?.substring(0, 8).replace(/\s+/g, '-')}`,
      description: c.label,
      // Extract keywords from label text for documentation scanning
      documentationKeywords: _extractKeywords(c.label, c.pattern),
      scorePattern: c.pattern ? _buildPattern(c.pattern) : undefined,
      autoExtractable: c.autoExtractable ?? false,
      severity: 'required',
    })
  }

  for (const c of (criteria.preferred || [])) {
    clinicalCriteria.push({
      id:       c.id || `pref-${c.label?.substring(0, 8).replace(/\s+/g, '-')}`,
      description: c.label,
      documentationKeywords: _extractKeywords(c.label, c.pattern),
      scorePattern: c.pattern ? _buildPattern(c.pattern) : undefined,
      autoExtractable: c.autoExtractable ?? false,
      severity: 'advisory',
    })
  }

  // Step therapy / prior treatment requirements
  const stepTherapyCriteria = []
  if (dbRule.stepTherapy) {
    const st = dbRule.stepTherapy
    if (st.required) {
      stepTherapyCriteria.push({
        id: 'step-therapy',
        description: st.description || 'Prior treatment documented',
        documentationKeywords: st.keywords || [],
        severity: 'required',
        autoExtractable: false,
      })
    }
  }

  return {
    paRequired: dbRule.paRequired,
    denialRateBaseline: dbRule.denialRateBaseline ?? null,
    clinicalCriteria: [...clinicalCriteria, ...stepTherapyCriteria],
    // validDiagnoses not currently stored in DB — left empty;
    // procedure-diagnosis check uses broad matching without this list
    validDiagnoses: [],
    typicalApprovalDays: null,
  }
}

/**
 * Generate documentation search keywords from a criterion label.
 * Strips common stop words, extracts medical abbreviations, and
 * splits on punctuation. Augmented with pattern string if provided.
 */
function _extractKeywords(label = '', pattern = '') {
  const stopWords = new Set([
    'a', 'an', 'the', 'or', 'and', 'is', 'are', 'for', 'of', 'to', 'in',
    'with', 'that', 'this', 'has', 'have', 'been', 'be', 'at', 'by',
    'documented', 'documentation', 'prior', 'required',
  ])

  const words = (label + ' ' + pattern)
    .replace(/[()[\]{}.,;:!?]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !stopWords.has(w.toLowerCase()))

  // Deduplicate, preserve original casing of first occurrence
  const seen = new Set()
  return words.filter(w => {
    const key = w.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Build a RegExp from a pattern string stored in the DB.
 * Stored as plain strings like "ESS:\\s+(\\d+)" or just "ESS".
 * Returns undefined if the string can't be compiled.
 */
function _buildPattern(patternStr) {
  if (!patternStr) return undefined
  try {
    // If it looks like a complete regex pattern, compile it
    return new RegExp(patternStr, 'i')
  } catch {
    // If it's just a plain string, build a simple score-capture pattern
    const escaped = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`${escaped}[:\\s]+(\\d+\\.?\\d*)`, 'i')
  }
}

/** Invalidate the cache for a given payer (call after admin edit). */
export function invalidatePayerCache(payerKey) {
  if (payerKey) _cache.delete(payerKey.toLowerCase())
}

/** Invalidate all cached rules (e.g., after bulk rule import). */
export function invalidateAllCaches() {
  _cache.clear()
  _universalCache = null
  _universalCachedAt = 0
}
