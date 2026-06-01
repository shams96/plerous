/**
 * Care Gap Agent — Agent 10
 *
 * Phase 3 wedge into value-based care buyers.
 * Detects incomplete care actions per patient across all referrals.
 * Every open gap is a potential adverse event, hospitalization, or missed revenue.
 *
 * Gap types:
 *   NO_SPECIALIST_SEEN    — referral completed but no follow-up created
 *   LONG_WAIT_TO_SCHEDULE — referral acknowledged but no appointment in 14+ days
 *   AUTH_EXPIRED_UNSEEN   — auth expired before patient was seen
 *   REFERRAL_LOOP         — same specialty referred 3+ times without completion
 *   STALLED_URGENT        — URGENT/STAT referral stalled >24h anywhere in flow
 */

import { prisma } from '../db/client.js'

const GAP_RULES = {
  LONG_WAIT_TO_SCHEDULE:  14,  // days from ACK to no appointment
  AUTH_EXPIRED_UNSEEN:    0,   // any expired auth = gap
  REFERRAL_LOOP_THRESHOLD: 3,  // same specialty ≥3 times without COMPLETED
  STALLED_URGENT_HOURS:   24,  // urgent/stat stalled > 24h
}

export class CareGapAgent {
  async run(orgId = null) {
    const now = new Date()

    const whereOrg = orgId
      ? { OR: [{ sendingOrgId: orgId }, { receivingOrgId: orgId }] }
      : {}

    const referrals = await prisma.referral.findMany({
      where: { ...whereOrg },
      include: {
        patient:       { select: { id: true, firstName: true, lastName: true, dateOfBirth: true } },
        authorization: { select: { status: true, expiresAt: true, authNumber: true } },
        sendingOrg:    { select: { name: true } },
        receivingOrg:  { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const gaps = []

    // Group by patient for cross-referral analysis
    const byPatient = {}
    for (const r of referrals) {
      const pid = r.patientId
      if (!byPatient[pid]) byPatient[pid] = { patient: r.patient, referrals: [] }
      byPatient[pid].referrals.push(r)
    }

    // ── Gap: long wait to schedule after ACK ─────────────────────────────────
    for (const r of referrals) {
      if (['RECEIVED', 'AUTH_APPROVED'].includes(r.status) && !r.appointmentDate) {
        const daysSince = (now - new Date(r.updatedAt)) / 86400000
        if (daysSince >= GAP_RULES.LONG_WAIT_TO_SCHEDULE) {
          gaps.push({
            patientId:   r.patientId,
            patientName: `${r.patient?.firstName} ${r.patient?.lastName}`,
            referralId:  r.id,
            specialty:   r.specialty,
            gapType:     'LONG_WAIT_TO_SCHEDULE',
            severity:    daysSince >= 21 ? 'high' : 'medium',
            daysSince:   Math.round(daysSince),
            description: `${r.specialty} referral acknowledged ${Math.round(daysSince)} days ago — no appointment scheduled`,
            recommendation: 'Contact patient and specialist to schedule appointment immediately',
          })
        }
      }
    }

    // ── Gap: auth expired before patient was seen ─────────────────────────────
    for (const r of referrals) {
      if (r.authorization?.expiresAt && r.status !== 'COMPLETED') {
        const expired = new Date(r.authorization.expiresAt) < now
        if (expired && !['CANCELLED', 'EXPIRED'].includes(r.status)) {
          gaps.push({
            patientId:   r.patientId,
            patientName: `${r.patient?.firstName} ${r.patient?.lastName}`,
            referralId:  r.id,
            specialty:   r.specialty,
            gapType:     'AUTH_EXPIRED_UNSEEN',
            severity:    'high',
            description: `Authorization #${r.authorization.authNumber} expired — patient was never seen`,
            recommendation: 'Submit new prior authorization request immediately',
          })
        }
      }
    }

    // ── Gap: referral loop (same specialty referred 3+ times without completion)
    for (const [, data] of Object.entries(byPatient)) {
      const { patient, referrals: ptRefs } = data
      const bySpecialty = {}
      for (const r of ptRefs) {
        if (!bySpecialty[r.specialty]) bySpecialty[r.specialty] = []
        bySpecialty[r.specialty].push(r)
      }
      for (const [spec, specRefs] of Object.entries(bySpecialty)) {
        const completed = specRefs.filter(r => r.status === 'COMPLETED').length
        if (specRefs.length >= GAP_RULES.REFERRAL_LOOP_THRESHOLD && completed === 0) {
          gaps.push({
            patientId:   patient?.id,
            patientName: `${patient?.firstName} ${patient?.lastName}`,
            referralId:  specRefs[specRefs.length - 1].id,
            specialty:   spec,
            gapType:     'REFERRAL_LOOP',
            severity:    'high',
            count:       specRefs.length,
            description: `Patient referred to ${spec} ${specRefs.length} times — never seen. Possible access barrier.`,
            recommendation: 'Investigate access barriers — consider direct appointment booking or alternative specialist',
          })
        }
      }
    }

    // ── Gap: stalled urgent/stat referrals ────────────────────────────────────
    for (const r of referrals) {
      if (['URGENT', 'STAT', 'EMERGENCY'].includes(r.urgency)) {
        const stalled = ['DRAFT', 'PAIA_REVIEW', 'SUBMITTED'].includes(r.status)
        const hoursOld = (now - new Date(r.updatedAt)) / 3600000
        if (stalled && hoursOld >= GAP_RULES.STALLED_URGENT_HOURS) {
          gaps.push({
            patientId:   r.patientId,
            patientName: `${r.patient?.firstName} ${r.patient?.lastName}`,
            referralId:  r.id,
            specialty:   r.specialty,
            gapType:     'STALLED_URGENT',
            severity:    r.urgency === 'STAT' ? 'critical' : 'high',
            hoursStalled: Math.round(hoursOld),
            currentStatus: r.status,
            description: `${r.urgency} ${r.specialty} referral stalled in ${r.status} for ${Math.round(hoursOld)} hours`,
            recommendation: `Immediate escalation required — ${r.urgency} referral cannot wait`,
          })
        }
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    gaps.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))

    const critical = gaps.filter(g => g.severity === 'critical')
    const high     = gaps.filter(g => g.severity === 'high')
    const medium   = gaps.filter(g => g.severity === 'medium')

    return {
      generatedAt:  now.toISOString(),
      orgId:        orgId ?? 'all',
      totalGaps:    gaps.length,
      patientsAffected: new Set(gaps.map(g => g.patientId)).size,
      summary: {
        critical: critical.length,
        high:     high.length,
        medium:   medium.length,
        byType: {
          LONG_WAIT_TO_SCHEDULE: gaps.filter(g => g.gapType === 'LONG_WAIT_TO_SCHEDULE').length,
          AUTH_EXPIRED_UNSEEN:   gaps.filter(g => g.gapType === 'AUTH_EXPIRED_UNSEEN').length,
          REFERRAL_LOOP:         gaps.filter(g => g.gapType === 'REFERRAL_LOOP').length,
          STALLED_URGENT:        gaps.filter(g => g.gapType === 'STALLED_URGENT').length,
        },
      },
      critical,
      high,
      medium,
      allGaps: gaps,
    }
  }
}
