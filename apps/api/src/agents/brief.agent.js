/**
 * Brief Agent — Coordinator Daily Brief
 *
 * Closes the "where do I start?" loop every coordinator faces each morning.
 * Queries the DB for every signal that needs action today, uses Claude to
 * prioritize and generate plain-English action text, returns a structured brief.
 *
 * Output contract:
 *   { urgent[], followUp[], scheduled[], stats{}, generatedAt }
 *
 * Each item has: referralId, trackingToken, patientName, specialty,
 *   message, actionLabel, actionType, urgencyScore, hoursElapsed
 */

import { prisma } from '../db/client.js'
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'

const anthropic = config.anthropic?.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null

// Thresholds (hours) — match Sentinel for consistency
const SLA_WARN_HOURS      = 60   // warn at 60h (breach at 72h)
const AUTH_EXPIRY_WARN_DAYS = 7
const SCHEDULING_NUDGE_DAYS = 3  // days after ACK/AUTH_APPROVED before nudging
const STALE_DRAFT_HOURS    = 36  // warn at 36h (Sentinel fires at 48h)

export class BriefAgent {
  /**
   * Generate the daily brief for a specific org.
   * @param {string} organizationId
   * @returns {object} structured brief
   */
  async run(organizationId) {
    const now = new Date()

    // ── 1. Fetch all in-flight referrals for this org ─────────────────────────
    const referrals = await prisma.referral.findMany({
      where: {
        sendingOrgId: organizationId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'] },
      },
      include: {
        patient: true,
        receivingProvider: { include: { organization: true } },
        receivingOrg: true,
        authorization: true,
      },
      orderBy: { updatedAt: 'asc' },
    })

    // ── 2. Score each referral for urgency ────────────────────────────────────
    const signals = []

    for (const r of referrals) {
      const hoursElapsed = (now - new Date(r.updatedAt)) / 3600000
      const patientName  = r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : 'Patient'
      const specialist   = r.receivingProvider
        ? `Dr. ${r.receivingProvider.lastName}`
        : r.receivingOrg?.name ?? 'specialist'
      const phone = r.receivingProvider?.phone ?? r.receivingOrg?.phone ?? null

      // SUBMITTED but specialist hasn't acknowledged — SLA risk
      if (r.status === 'SUBMITTED') {
        const hoursToBreech = 72 - hoursElapsed
        if (hoursElapsed >= SLA_WARN_HOURS) {
          signals.push({
            referralId:    r.id,
            trackingToken: r.trackingToken,
            patientName,
            specialty:     r.specialty,
            urgencyScore:  hoursElapsed >= 72 ? 100 : 80,
            category:      hoursElapsed >= 72 ? 'urgent' : 'urgent',
            hoursElapsed:  Math.round(hoursElapsed),
            message: hoursElapsed >= 72
              ? `72h SLA BREACHED — ${specialist} has not acknowledged (${Math.round(hoursElapsed)}h elapsed)`
              : `SLA at risk — ${specialist} has not acknowledged in ${Math.round(hoursElapsed)}h (${Math.round(hoursToBreech)}h until breach)`,
            actionLabel:   `Call ${specialist}${phone ? ': ' + phone : ''}`,
            actionType:    'call_specialist',
            specialistPhone: phone,
          })
        }
      }

      // AUTH_APPROVED or RECEIVED — patient hasn't scheduled
      if (['RECEIVED', 'AUTH_APPROVED'].includes(r.status)) {
        const daysSinceUpdate = hoursElapsed / 24
        if (daysSinceUpdate >= SCHEDULING_NUDGE_DAYS && !r.appointmentDate) {
          const label = r.status === 'AUTH_APPROVED' ? 'auth approved' : 'acknowledged'
          signals.push({
            referralId:    r.id,
            trackingToken: r.trackingToken,
            patientName,
            specialty:     r.specialty,
            urgencyScore:  50 + Math.min(30, daysSinceUpdate * 3),
            category:      'followUp',
            hoursElapsed:  Math.round(hoursElapsed),
            message:       `Referral ${label} ${Math.round(daysSinceUpdate)} days ago — patient has not scheduled`,
            actionLabel:   r.patient?.smsOptIn && r.patient?.phone
              ? 'Send scheduling SMS to patient'
              : 'Call patient to schedule',
            actionType:    'schedule_patient',
            patientPhone:  r.patient?.phone ?? null,
            patientSmsOptIn: r.patient?.smsOptIn ?? false,
          })
        }
      }

      // AUTH_PENDING and stuck
      if (r.status === 'AUTH_PENDING') {
        const daysSinceUpdate = hoursElapsed / 24
        if (daysSinceUpdate >= 3) {
          signals.push({
            referralId:    r.id,
            trackingToken: r.trackingToken,
            patientName,
            specialty:     r.specialty,
            urgencyScore:  40 + Math.min(40, daysSinceUpdate * 5),
            category:      'followUp',
            hoursElapsed:  Math.round(hoursElapsed),
            message:       `Prior auth pending ${Math.round(daysSinceUpdate)} days — consider peer-to-peer review`,
            actionLabel:   'Request peer-to-peer review',
            actionType:    'peer_to_peer',
          })
        }
      }

      // Authorization expiring soon
      if (r.authorization?.expiresAt) {
        const daysUntilExpiry = (new Date(r.authorization.expiresAt) - now) / 86400000
        if (daysUntilExpiry <= AUTH_EXPIRY_WARN_DAYS && daysUntilExpiry > 0 && r.status !== 'SCHEDULED') {
          signals.push({
            referralId:    r.id,
            trackingToken: r.trackingToken,
            patientName,
            specialty:     r.specialty,
            urgencyScore:  70 - daysUntilExpiry * 5,
            category:      daysUntilExpiry <= 2 ? 'urgent' : 'followUp',
            hoursElapsed:  Math.round(hoursElapsed),
            message:       `Auth #${r.authorization.authNumber} expires in ${Math.round(daysUntilExpiry)} days — appointment not confirmed`,
            actionLabel:   'Confirm appointment before auth expires',
            actionType:    'confirm_appointment',
          })
        }
      }

      // Stale draft
      if (r.status === 'DRAFT' && hoursElapsed >= STALE_DRAFT_HOURS) {
        signals.push({
          referralId:    r.id,
          trackingToken: r.trackingToken,
          patientName,
          specialty:     r.specialty,
          urgencyScore:  20,
          category:      'followUp',
          hoursElapsed:  Math.round(hoursElapsed),
          message:       `Draft not submitted in ${Math.round(hoursElapsed / 24)} days`,
          actionLabel:   'Complete and submit or cancel',
          actionType:    'submit_or_cancel',
        })
      }
    }

    // ── 3. Sort by urgency ────────────────────────────────────────────────────
    signals.sort((a, b) => b.urgencyScore - a.urgencyScore)

    const urgent   = signals.filter(s => s.category === 'urgent')
    const followUp = signals.filter(s => s.category === 'followUp')

    // ── 4. Weekly stats for this org ──────────────────────────────────────────
    const weekAgo = new Date(now - 7 * 86400000)
    const [weeklyReferrals, completedThisWeek] = await Promise.all([
      prisma.referral.count({
        where: { sendingOrgId: organizationId, createdAt: { gte: weekAgo } },
      }),
      prisma.referral.count({
        where: { sendingOrgId: organizationId, status: 'COMPLETED', updatedAt: { gte: weekAgo } },
      }),
    ])

    const statusCounts = await prisma.referral.groupBy({
      by: ['status'],
      where: { sendingOrgId: organizationId, createdAt: { gte: weekAgo } },
      _count: { status: true },
    })

    const byStatus = {}
    for (const s of statusCounts) byStatus[s.status] = s._count.status

    // Leakage = referrals that are CANCELLED/EXPIRED/NO_SHOW this week
    const leaked = (byStatus.CANCELLED ?? 0) + (byStatus.EXPIRED ?? 0) + (byStatus.NO_SHOW ?? 0)
    const leakageRate = weeklyReferrals > 0
      ? Math.round((leaked / weeklyReferrals) * 100)
      : 0

    const stats = {
      weeklyReferrals,
      submitted:    byStatus.SUBMITTED   ?? 0,
      received:     byStatus.RECEIVED    ?? 0,
      scheduled:    byStatus.SCHEDULED   ?? 0,
      completed:    completedThisWeek,
      leaked,
      leakageRate,
      industryAvgLeakage: 22,
    }

    // ── 5. Use Claude to generate summary headline + top 3 actions ────────────
    let aiSummary = null
    if (anthropic && (urgent.length + followUp.length) > 0) {
      try {
        const itemsForClaude = [...urgent, ...followUp].slice(0, 8).map(s =>
          `- [${s.category.toUpperCase()}] ${s.patientName} (${s.specialty}): ${s.message}`
        ).join('\n')

        const resp = await anthropic.messages.create({
          model:      'claude-haiku-4-5',
          max_tokens: 300,
          messages: [{
            role:    'user',
            content: `You are a healthcare coordinator assistant. Based on today's referral signals, write:
1. One plain-English headline summarizing the day (max 15 words)
2. The top 3 most critical actions in order of urgency (one sentence each, action-oriented)

Signals:
${itemsForClaude}

Stats: ${urgent.length} urgent, ${followUp.length} need follow-up, leakage rate ${leakageRate}% (industry avg 22%)

Format as JSON: { "headline": "...", "topActions": ["...", "...", "..."] }`,
          }],
        })

        const text = resp.content[0]?.text ?? ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) aiSummary = JSON.parse(match[0])
      } catch (e) {
        // Non-blocking — brief is still useful without AI headline
      }
    }

    return {
      generatedAt:  now.toISOString(),
      organizationId,
      headline:     aiSummary?.headline ?? `${urgent.length} urgent items, ${followUp.length} follow-ups today`,
      topActions:   aiSummary?.topActions ?? urgent.slice(0, 3).map(s => s.message),
      urgent,
      followUp,
      stats,
      totalItems:   signals.length,
    }
  }
}
