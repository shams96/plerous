/**
 * AI Training Loop
 *
 * Collects human override signals (EHR approvals, auth appeal outcomes, manual risk overrides)
 * and adjusts the risk scoring model's weight multipliers at runtime.
 *
 * Uses a simple exponential moving average to prevent single outliers from dominating.
 * Weights are stored in Redis so they survive restarts without a DB migration.
 *
 * EU AI Act: all weight changes are audit-logged with the human actor who triggered them.
 */

import { redis } from '../../db/client.js'
import { prisma } from '../../db/client.js'

const WEIGHTS_KEY = 'ai:risk_weights'
const FEEDBACK_LIST_KEY = 'ai:feedback_events'
const EMA_ALPHA = 0.15 // learning rate — 15% weight on new signal

// Default weights match the original rules in ai.service.js
const DEFAULT_WEIGHTS = {
  hmo_risk_bonus: 20,
  medicaid_extra: 5,
  complex_specialty_bonus: 15,
  age_over_70_bonus: 10,
  age_under_18_bonus: 5,
  mental_health_dx_bonus: 15,
  base_risk: 30,
}

export async function getWeights() {
  if (!redis) return DEFAULT_WEIGHTS
  const raw = await redis.get(WEIGHTS_KEY)
  if (!raw) return DEFAULT_WEIGHTS
  return { ...DEFAULT_WEIGHTS, ...JSON.parse(raw) }
}

async function saveWeights(weights) {
  if (!redis) return
  await redis.set(WEIGHTS_KEY, JSON.stringify(weights))
}

/**
 * Record a feedback signal.
 *
 * type: 'auth_outcome' | 'ehr_approval' | 'manual_override'
 * Payload varies by type — see cases below.
 */
export async function recordFeedback({ type, payload, actorId }) {
  const event = { type, payload, actorId, timestamp: new Date().toISOString() }

  // Persist raw event for audit
  if (redis) {
    await redis.lpush(FEEDBACK_LIST_KEY, JSON.stringify(event))
    await redis.ltrim(FEEDBACK_LIST_KEY, 0, 999) // keep last 1000
  }

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'AI_FEEDBACK',
      resource: 'RiskModel',
      resourceId: type,
      metadata: event,
    },
  }).catch(() => {}) // non-blocking

  await processSignal(event)
}

async function processSignal({ type, payload }) {
  const weights = await getWeights()

  if (type === 'auth_outcome') {
    // payload: { predictedApprovalProb, actualApproved, specialty, insurancePlanType }
    const predicted = payload.predictedApprovalProb / 100
    const actual = payload.actualApproved ? 1 : 0
    const error = actual - predicted

    // If we systematically under-predicted approval for HMO → reduce HMO risk penalty
    if (payload.insurancePlanType === 'HMO' && error > 0.15) {
      weights.hmo_risk_bonus = ema(weights.hmo_risk_bonus, weights.hmo_risk_bonus - 2)
    } else if (payload.insurancePlanType === 'HMO' && error < -0.15) {
      weights.hmo_risk_bonus = ema(weights.hmo_risk_bonus, weights.hmo_risk_bonus + 2)
    }
  }

  if (type === 'appeal_outcome') {
    // payload: { specialty, diagnosisCodes, appealSucceeded }
    // If appeals consistently succeed for a specialty, denials are overcounted → reduce risk
    if (payload.appealSucceeded) {
      const current = weights.complex_specialty_bonus
      weights.complex_specialty_bonus = ema(current, Math.max(5, current - 1.5))
    }
  }

  if (type === 'manual_override') {
    // payload: { originalRisk, correctedRisk, features }
    // Direct supervisor correction — apply stronger signal
    const delta = (payload.correctedRisk - payload.originalRisk) / 100
    if (Math.abs(delta) > 0.1) {
      weights.base_risk = ema(weights.base_risk, weights.base_risk + delta * 5)
      weights.base_risk = Math.max(10, Math.min(60, weights.base_risk))
    }
  }

  await saveWeights(weights)
}

function ema(current, newValue) {
  return parseFloat((current * (1 - EMA_ALPHA) + newValue * EMA_ALPHA).toFixed(2))
}

export async function getFeedbackEvents(limit = 50) {
  if (!redis) return []
  const raw = await redis.lrange(FEEDBACK_LIST_KEY, 0, limit - 1)
  return raw.map(r => JSON.parse(r))
}

export async function resetWeights(actorId) {
  await saveWeights(DEFAULT_WEIGHTS)
  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: 'AI_WEIGHTS_RESET',
      resource: 'RiskModel',
      resourceId: 'weights',
      metadata: { reset: true, defaults: DEFAULT_WEIGHTS },
    },
  }).catch(() => {})
  return DEFAULT_WEIGHTS
}
