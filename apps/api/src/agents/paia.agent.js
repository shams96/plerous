/**
 * Pre-Auth Intelligence Agent (PAIA)
 *
 * The gatekeeper. Nothing reaches a payer without passing through here.
 *
 * Contract:
 *   observe referral → run all checks in parallel → auto-fix what can be fixed
 *   → score denial probability → decide: submit or open human window
 *
 * PAIA never denies — it prevents. If it can't achieve high confidence,
 * it hands a fully-contextual brief to a human who resolves in seconds,
 * not the 10-day denial cycle.
 */

import { prisma } from '../db/client.js'
import { redis } from '../db/client.js'
import { createHash } from 'crypto'

import { checkCoverage }              from './paia/checks/coverage.check.js'
import { checkPARequired }            from './paia/checks/pa-required.check.js'
import { checkDocumentation }         from './paia/checks/documentation.check.js'
import { checkProcedureDiagnosisMatch } from './paia/checks/procedure-diagnosis.check.js'
import { applyNotesFixer }            from './paia/fixers/clinical-notes.fixer.js'

import { loadPayerRules, loadUniversalRules } from './paia/rules/policy-rule-store.js'

// Confidence threshold — below this, human window opens instead of auto-submitting
const AUTO_SUBMIT_THRESHOLD = 0.85   // 85% confidence required

export class PAIAAgent {
  /**
   * Primary entry point.
   * Analyzes a referral before PA submission and returns a decision.
   *
   * @param {string} referralId
   * @returns {PAIAResult}
   */
  async analyze(referralId) {
    const startedAt = Date.now()

    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      include: {
        patient: { include: { primaryInsurance: { include: { payer: true } } } },
        insurancePlan: { include: { payer: true } },
        referringProvider: true,
        sendingOrg: true,
      },
    })

    if (!referral) throw new Error(`Referral ${referralId} not found`)

    // Resolve payer rules — DB-first, falls back to null (universal rules used by checks)
    const payerId = referral.insurancePlan?.payer?.id || referral.patient?.primaryInsurance?.payer?.id
    const payerKey = (referral.insurancePlan?.payer?.tradingPartnerServiceId || payerId || '').toLowerCase()
    const payerName = referral.insurancePlan?.payer?.name || 'Unknown Payer'

    // Load payer-specific + universal rules from DB in parallel
    const [payerRules, universalRules] = await Promise.all([
      loadPayerRules(payerKey, payerName),
      loadUniversalRules(),
    ])

    // Merge universal rules into payerRules fallback for PA-required check
    const effectiveDefaultRules = {
      universalPaRequired: universalRules?.universalPaRequired || [],
      universalPaExempt:   universalRules?.universalPaExempt   || [],
    }

    const referralData = {
      patientId:       referral.patientId,
      insurancePlanId: referral.insurancePlanId,
      procedureCodes:  referral.procedureCodes || [],
      diagnosisCodes:  referral.diagnosisCodes || [],
      clinicalNotes:   referral.clinicalNotes || '',
      requestedDate:   referral.requestedDate,
      urgency:         referral.urgency,
    }

    // ── Run all checks in parallel ──────────────────────────────────────────
    const [coverageResult, paRequiredResult, diagnosisResult] = await Promise.all([
      checkCoverage(referralData),
      Promise.resolve(checkPARequired(
        referralData.procedureCodes,
        payerRules,
        referral.insurancePlan?.planType,
        effectiveDefaultRules,
      )),
      Promise.resolve(checkProcedureDiagnosisMatch(
        referralData.procedureCodes,
        referralData.diagnosisCodes,
        payerRules,
      )),
    ])

    // PA not required at all — exit early, nothing to submit
    if (!paRequiredResult.paRequired && !paRequiredResult.issues?.length) {
      return this._buildResult({
        referralId, decision: 'pa_not_required',
        confidence: 1.0, denialProbability: 0,
        checks: [coverageResult, paRequiredResult, diagnosisResult],
        autoFixed: [], humanWindowItems: [],
        payerRules, startedAt,
      })
    }

    // DPC/self-pay patient — no PA needed
    if (coverageResult.dpcPatient) {
      return this._buildResult({
        referralId, decision: 'pa_not_required',
        confidence: 1.0, denialProbability: 0,
        checks: [coverageResult, paRequiredResult, diagnosisResult],
        autoFixed: [], humanWindowItems: [],
        payerRules, startedAt,
      })
    }

    // Documentation check (needs PA confirmed first)
    const docResult = checkDocumentation(
      referralData.clinicalNotes,
      paRequiredResult.paRequiredCodes,
      payerRules
    )

    const allChecks = [coverageResult, paRequiredResult, diagnosisResult, docResult]

    // ── Auto-fix pass ───────────────────────────────────────────────────────
    let fixedNotes = referralData.clinicalNotes
    const autoFixed = []

    if (docResult.autoExtractable?.length > 0) {
      const fixResult = applyNotesFixer(referralData.clinicalNotes, docResult.autoExtractable)
      if (fixResult.fixed) {
        fixedNotes = fixResult.notes
        autoFixed.push(...fixResult.applied.map(a => ({
          type: 'clinical_notes_extraction',
          criterionId: a.criterionId,
          description: `Auto-extracted ${a.formatted} from clinical notes`,
          formatted: a.formatted,
        })))

        // Re-run documentation check with fixed notes
        const recheck = checkDocumentation(fixedNotes, paRequiredResult.paRequiredCodes, payerRules)
        allChecks[allChecks.indexOf(docResult)] = recheck
      }
    }

    // ── Collect hard-stops and human window items ───────────────────────────
    const hardStops = allChecks.filter(c => !c.passed && c.severity === 'hard_stop' && !c.autoFixable)
    const humanWindowItems = hardStops.map(c => ({
      checkId:     c.check,
      severity:    c.severity,
      message:     c.message,
      detail:      c.detail,
      autoFixable: false,
      suggestion:  c.suggestion || null,
    }))

    // ── Denial probability scoring ──────────────────────────────────────────
    const denialProbability = this._scoreDenialProbability(
      allChecks, paRequiredResult.paRequiredCodes, payerRules
    )

    const confidence = 1 - denialProbability
    const canAutoSubmit = humanWindowItems.length === 0 && confidence >= AUTO_SUBMIT_THRESHOLD

    const decision = canAutoSubmit ? 'submit' : 'human_window'

    // ── Persist PAIA analysis to DB ─────────────────────────────────────────
    const analysis = await this._persistAnalysis({
      referralId, decision, confidence, denialProbability,
      checks: allChecks, autoFixed, humanWindowItems,
      fixedNotes: fixedNotes !== referralData.clinicalNotes ? fixedNotes : null,
      payerName: payerRules?.name || payerName,
      startedAt,
    })

    // If notes were auto-fixed, update the referral
    if (fixedNotes !== referralData.clinicalNotes) {
      await prisma.referral.update({
        where: { id: referralId },
        data: { clinicalNotes: fixedNotes },
      })
    }

    return this._buildResult({
      referralId, decision, confidence, denialProbability,
      checks: allChecks, autoFixed, humanWindowItems,
      payerRules, startedAt, analysisId: analysis.id,
      fixedNotes: fixedNotes !== referralData.clinicalNotes ? fixedNotes : null,
    })
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  _scoreDenialProbability(checks, procedureCodes, payerRules) {
    // Start from the payer's baseline denial rate for these codes
    let baseRate = 0
    let codeCount = 0
    for (const code of procedureCodes) {
      const rule = payerRules?.procedureRules?.[code]
      if (rule?.denialRateBaseline != null) {
        baseRate += rule.denialRateBaseline
        codeCount++
      }
    }
    if (codeCount > 0) baseRate /= codeCount
    else baseRate = 0.25  // unknown payer default

    let probability = baseRate

    // Each failed required criterion adds denial risk
    const docCheck = checks.find(c => c.check === 'documentation_complete')
    if (docCheck) {
      const missing = docCheck.requiredTotal - docCheck.requiredMet
      probability += missing * 0.15  // each missing required criterion +15%
    }

    // Hard stops are near-certain denials
    const hardStops = checks.filter(c => !c.passed && c.severity === 'hard_stop')
    probability += hardStops.length * 0.30

    // Coverage failure = certain denial
    if (!checks.find(c => c.check === 'coverage_active')?.passed) {
      probability = 0.98
    }

    // Diagnosis mismatch = near-certain denial
    const diagCheck = checks.find(c => c.check === 'procedure_diagnosis_match')
    if (!diagCheck?.passed) {
      probability = Math.max(probability, 0.92)
    }

    return Math.min(probability, 0.99)
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async _persistAnalysis(data) {
    const { referralId, decision, confidence, denialProbability,
            checks, autoFixed, humanWindowItems, fixedNotes, payerName, startedAt } = data

    // Build verifiable audit record — chained hash
    const prevHash = await redis.get(`paia:last_hash:${referralId}`) || '0000'
    const payload = JSON.stringify({ referralId, decision, confidence, denialProbability, ts: Date.now() })
    const hash = createHash('sha256').update(prevHash + payload).digest('hex')
    await redis.set(`paia:last_hash:${referralId}`, hash)

    // Persist to PAIAAnalysis table (primary persistent store)
    const analysis = await prisma.pAIAAnalysis.create({
      data: {
        referralId,
        decision,
        confidence,
        denialProbability,
        humanWindowItems,
        autoFixed,
        checksRun: checks.map(c => ({ check: c.check, passed: c.passed, severity: c.severity })),
        auditHash: hash,
        analyzedInMs: startedAt ? Date.now() - startedAt : null,
      },
    })

    // Also write to AuditLog for HIPAA chain
    await prisma.auditLog.create({
      data: {
        action: 'PAIA_ANALYSIS',
        resource: 'Referral',
        resourceId: referralId,
        metadata: {
          analysisId: analysis.id,
          decision, confidence, denialProbability, payerName,
          checksRun: checks.length, autoFixed: autoFixed.length,
          humanWindowItems: humanWindowItems.length, notesFixed: !!fixedNotes,
          hash, prevHash,
        },
      },
    })

    // Push to Redis human window queue (ephemeral cache — DB is source of truth)
    if (humanWindowItems.length > 0) {
      await redis.lpush('paia:human_window', JSON.stringify({
        referralId, analysisId: analysis.id, decision, denialProbability,
        humanWindowItems, autoFixed, queuedAt: new Date().toISOString(),
      }))
    }

    return analysis
  }

  // ── Result builder ────────────────────────────────────────────────────────

  _buildResult({ referralId, decision, confidence, denialProbability,
                 checks, autoFixed, humanWindowItems, payerRules,
                 startedAt, analysisId, fixedNotes }) {
    return {
      referralId,
      decision,                // 'submit' | 'pa_not_required' | 'human_window'
      confidence: Math.round(confidence * 100),
      denialProbability: Math.round(denialProbability * 100),
      canAutoSubmit: decision === 'submit',
      analysisId,

      // What PAIA fixed automatically
      autoFixed,
      notesUpdated: !!fixedNotes,

      // What needs human resolution (populated only when decision === 'human_window')
      humanWindowItems,
      humanWindowRequired: humanWindowItems.length > 0,

      // Full check results for transparency
      checks: checks.map(c => ({
        check: c.check,
        passed: c.passed,
        severity: c.severity,
        message: c.message,
      })),

      // Payer context
      payerName: payerRules?.name || 'Unknown Payer',

      // Performance
      analyzedInMs: Date.now() - startedAt,
    }
  }

  /**
   * Called when a referral comes back denied despite PAIA clearing it.
   * Feeds the denial back as a training signal — PAIA learns from misses.
   */
  async recordDenialMiss(referralId, denialReason, denialCodes) {
    await prisma.auditLog.create({
      data: {
        action: 'PAIA_DENIAL_MISS',
        resource: 'Referral',
        resourceId: referralId,
        metadata: { denialReason, denialCodes, learnedAt: new Date().toISOString() },
      },
    })

    // Cache denial pattern for payer learning (future: feed to ML model)
    await redis.lpush('paia:denial_misses', JSON.stringify({
      referralId, denialReason, denialCodes,
      recordedAt: new Date().toISOString(),
    }))
  }
}

export const paia = new PAIAAgent()
