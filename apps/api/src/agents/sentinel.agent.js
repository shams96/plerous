/**
 * Sentinel Agent — Referral Visibility & Auto-Recovery
 *
 * 24/7 background monitor for in-flight referrals. Runs every 15 minutes.
 *
 * Alert types (patient + provider notified):
 *  1. STALE_DRAFT         — DRAFT not touched >48h → nudge referring provider
 *  2. STALE_PAIA_REVIEW   — PAIA_REVIEW not resolved >24h → nudge provider
 *  3. AUTH_EXPIRING       — Authorization expires <7 days, not yet SCHEDULED
 *  4. AUTH_STUCK          — AUTH_PENDING not updated >3 days
 *  5. SPECIALIST_NO_ACK   — SUBMITTED >72h with no status progression (72h SLA)
 *
 * Auto-recovery actions (GAP 3):
 *  - SPECIALIST_NO_ACK → re-sends referral email to specialist org
 *  - AUTH_STUCK        → escalation notice to referring provider
 *  - STALE_DRAFT       → reminder email to referring provider
 *
 * Deduplication: Redis TTL prevents re-alerting within 6h per referral+type.
 * Channel fix: uses SMS (patient) + EMAIL (provider) — never invalid 'SENTINEL'.
 */
import { prisma } from '../db/client.js'
import { redis } from '../db/client.js'

const ALERT_COOLDOWN_HOURS  = 6
const STALE_DRAFT_HOURS     = 48
const STALE_PAIA_HOURS      = 24
const AUTH_EXPIRY_WARN_DAYS = 7
const AUTH_STUCK_DAYS       = 3
const SPECIALIST_NO_ACK_HOURS = 72   // GAP 1: 72h SLA

/**
 * Redis-backed deduplication — returns true if we should fire this alert.
 */
async function shouldAlert(referralId, type) {
  const key = `sentinel:alert:${type}:${referralId}`
  try {
    const exists = await redis.get(key)
    if (exists) return false
    await redis.setex(key, ALERT_COOLDOWN_HOURS * 3600, '1')
    return true
  } catch {
    return true  // Redis down — allow alert rather than go silent
  }
}

/**
 * Fire patient SMS + optional provider email.
 * Records to DB using valid channels (SMS / EMAIL / INTERNAL).
 * Never uses the invalid 'SENTINEL' channel that was silently failing.
 */
async function createAlert({
  referralId, type,
  patientMessage, patientPhone, patientSmsOptIn = true,
  providerMessage, providerEmail,
  patientName,
}) {
  const { NotifyService } = await import('../modules/notifications/notify.service.js')
  const notify = new NotifyService()

  const tasks = []

  // Patient SMS
  if (patientPhone && patientSmsOptIn && patientMessage) {
    tasks.push(
      notify.sms(patientPhone, patientMessage, referralId, type)
        .catch(err => console.warn(`[Sentinel] SMS failed: ${err.message}`))
    )
  } else if (patientMessage) {
    // No phone — log internally only
    await prisma.notification.create({
      data: { referralId, type, channel: 'INTERNAL', recipient: 'no-phone', message: patientMessage, status: 'dev_logged' },
    }).catch(() => {})
  }

  // Provider email (auto-recovery action)
  if (providerEmail && providerMessage) {
    tasks.push(
      notify.email(
        providerEmail,
        `[Plerous Alert] ${type.replace(/_/g, ' ')} — Action Required`,
        providerEmailHtml(type, providerMessage, referralId),
        referralId, type,
      ).catch(err => console.warn(`[Sentinel] Email failed: ${err.message}`))
    )
  }

  await Promise.allSettled(tasks)
  console.log(`[Sentinel] ${type} | ${referralId} | ${patientName ?? 'unknown'}`)
}

function providerEmailHtml(type, message, referralId) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#5C2D8E">Plerous Sentinel Alert</h2>
      <p style="font-size:14px;color:#374151">${message}</p>
      <p style="font-size:12px;color:#6b7280">
        Referral ID: <code>${referralId}</code><br>
        Alert type: <strong>${type}</strong><br>
        This is an automated alert from Plerous Sentinel. Log in to take action.
      </p>
    </div>
  `
}

export async function runSentinel() {
  const now    = new Date()
  const alerts = []

  // ── 1. Stale DRAFT (>48h) ────────────────────────────────────────────────────
  // Business: provider forgot to submit. Nudge provider + inform patient.
  const staleDraftCutoff = new Date(now - STALE_DRAFT_HOURS * 3600 * 1000)
  const staleDrafts = await prisma.referral.findMany({
    where: { status: 'DRAFT', updatedAt: { lt: staleDraftCutoff } },
    include: {
      patient:           { select: { firstName: true, lastName: true, phone: true, smsOptIn: true } },
      referringProvider: { select: { firstName: true, lastName: true, email: true } },
    },
    take: 50,
  })

  for (const ref of staleDrafts) {
    if (!await shouldAlert(ref.id, 'STALE_DRAFT')) continue
    const hrs = Math.round((now - ref.updatedAt) / 3600000)
    const provName = ref.referringProvider
      ? `Dr. ${ref.referringProvider.firstName} ${ref.referringProvider.lastName}`
      : 'Your provider'

    alerts.push(createAlert({
      referralId:    ref.id,
      type:          'STALE_DRAFT',
      patientName:   ref.patient ? `${ref.patient.firstName} ${ref.patient.lastName}` : ref.referralNumber,
      patientPhone:  ref.patient?.phone ?? null,
      patientSmsOptIn: ref.patient?.smsOptIn ?? true,
      patientMessage: `Hi ${ref.patient?.firstName ?? 'there'}, your referral to a specialist was started but hasn't been submitted yet (${hrs}h). ${provName} needs to complete it. Call their office if you haven't heard back.`,
      // Auto-recovery: remind the provider directly
      providerEmail:   ref.referringProvider?.email ?? null,
      providerMessage: `Referral ${ref.referralNumber} for ${ref.patient?.firstName} ${ref.patient?.lastName} has been sitting as a DRAFT for ${hrs} hours. Please submit or cancel it to keep the patient's care on track.`,
    }))
  }

  // ── 2. Stale PAIA_REVIEW (>24h) ──────────────────────────────────────────────
  // Business: physician hasn't responded to PAIA's human-window request.
  const stalePaiaCutoff = new Date(now - STALE_PAIA_HOURS * 3600 * 1000)
  const stalePaia = await prisma.referral.findMany({
    where: { status: 'PAIA_REVIEW', updatedAt: { lt: stalePaiaCutoff } },
    include: {
      patient:           { select: { firstName: true, lastName: true, phone: true, smsOptIn: true } },
      referringProvider: { select: { firstName: true, lastName: true, email: true } },
    },
    take: 50,
  })

  for (const ref of stalePaia) {
    if (!await shouldAlert(ref.id, 'STALE_PAIA_REVIEW')) continue
    const hrs = Math.round((now - ref.updatedAt) / 3600000)
    alerts.push(createAlert({
      referralId:    ref.id,
      type:          'STALE_PAIA_REVIEW',
      patientName:   ref.patient ? `${ref.patient.firstName} ${ref.patient.lastName}` : ref.referralNumber,
      patientPhone:  ref.patient?.phone ?? null,
      patientSmsOptIn: ref.patient?.smsOptIn ?? true,
      patientMessage: `Hi ${ref.patient?.firstName ?? 'there'}, your specialist referral needs your doctor's attention before it can move forward. It's been ${hrs}h — please follow up with their office.`,
      providerEmail:   ref.referringProvider?.email ?? null,
      providerMessage: `Referral ${ref.referralNumber} for ${ref.patient?.firstName} ${ref.patient?.lastName} requires your review in Plerous (PAIA flagged issues ${hrs}h ago). The patient is waiting. Please log in and resolve the PAIA review.`,
    }))
  }

  // ── 3. Auth expiring soon (<7 days) ──────────────────────────────────────────
  // Business: approved auth will expire if appointment isn't scheduled → wasted auth, resubmit needed.
  const expiryWarnCutoff = new Date(now.getTime() + AUTH_EXPIRY_WARN_DAYS * 86400000)
  const expiringAuths = await prisma.referral.findMany({
    where: {
      status:        { in: ['AUTH_APPROVED', 'SUBMITTED'] },
      authorization: { expiresAt: { gt: now, lt: expiryWarnCutoff } },
    },
    include: {
      patient:           { select: { firstName: true, lastName: true, phone: true, smsOptIn: true } },
      referringProvider: { select: { email: true } },
      authorization:     { select: { expiresAt: true, authNumber: true } },
    },
    take: 50,
  })

  for (const ref of expiringAuths) {
    if (!await shouldAlert(ref.id, 'AUTH_EXPIRING')) continue
    const days = Math.ceil((ref.authorization.expiresAt - now) / 86400000)
    const authNum = ref.authorization.authNumber ?? 'pending'
    alerts.push(createAlert({
      referralId:    ref.id,
      type:          'AUTH_EXPIRING',
      patientName:   ref.patient ? `${ref.patient.firstName} ${ref.patient.lastName}` : ref.referralNumber,
      patientPhone:  ref.patient?.phone ?? null,
      patientSmsOptIn: ref.patient?.smsOptIn ?? true,
      patientMessage: `⚠️ ${ref.patient?.firstName ?? 'Patient'}, your ${ref.specialty} authorization (#${authNum}) expires in ${days} day${days !== 1 ? 's' : ''}. Please call the specialist to schedule your appointment right away.`,
      providerEmail:   ref.referringProvider?.email ?? null,
      providerMessage: `Auth #${authNum} for referral ${ref.referralNumber} (${ref.specialty}) expires in ${days} days. The appointment has not been scheduled. Please contact the patient and specialist immediately.`,
    }))
  }

  // ── 4. Auth stuck in pending (>3 days) ───────────────────────────────────────
  // Business: payer is sitting on the request. Provider should escalate — call payer, request peer-to-peer.
  const authStuckCutoff = new Date(now - AUTH_STUCK_DAYS * 86400000)
  const stuckAuths = await prisma.referral.findMany({
    where: {
      status:        'AUTH_PENDING',
      updatedAt:     { lt: authStuckCutoff },
      authorization: { status: { in: ['SUBMITTED', 'PENDING', 'IN_REVIEW'] } },
    },
    include: {
      patient:           { select: { firstName: true, lastName: true, phone: true, smsOptIn: true } },
      referringProvider: { select: { email: true } },
      authorization:     { select: { authNumber: true, submittedAt: true } },
    },
    take: 50,
  })

  for (const ref of stuckAuths) {
    if (!await shouldAlert(ref.id, 'AUTH_STUCK')) continue
    const days = Math.round((now - (ref.authorization?.submittedAt ?? ref.updatedAt)) / 86400000)
    alerts.push(createAlert({
      referralId:    ref.id,
      type:          'AUTH_STUCK',
      patientName:   ref.patient ? `${ref.patient.firstName} ${ref.patient.lastName}` : ref.referralNumber,
      patientPhone:  ref.patient?.phone ?? null,
      patientSmsOptIn: ref.patient?.smsOptIn ?? true,
      patientMessage: `Hi ${ref.patient?.firstName ?? 'there'}, your ${ref.specialty} referral authorization has been pending ${days} days. Your doctor's office is following up with the insurance company. We'll notify you of any updates.`,
      // Auto-recovery: tell provider to escalate to peer-to-peer review
      providerEmail:   ref.referringProvider?.email ?? null,
      providerMessage: `Referral ${ref.referralNumber} prior auth has been pending ${days} days with no payer decision. Consider requesting a peer-to-peer review or calling the payer directly. Plerous auth ID: ${ref.authorizationId ?? 'N/A'}.`,
    }))
  }

  // ── 5. Specialist no-acknowledgement — 72h SLA (GAP 1) ───────────────────────
  // Business: #1 patient complaint — "I thought I was in the queue but wasn't."
  // Referral submitted >72h ago with no status progression = specialist hasn't acknowledged.
  const noAckCutoff = new Date(now - SPECIALIST_NO_ACK_HOURS * 3600 * 1000)
  const noAckReferrals = await prisma.referral.findMany({
    where: {
      status:    'SUBMITTED',
      updatedAt: { lt: noAckCutoff },
    },
    include: {
      patient:          { select: { firstName: true, lastName: true, phone: true, smsOptIn: true } },
      referringProvider: { select: { firstName: true, lastName: true, email: true } },
      receivingOrg:      { select: { name: true, email: true, phone: true, faxNumber: true } },
      receivingProvider: { select: { firstName: true, lastName: true, email: true } },
    },
    take: 50,
  })

  for (const ref of noAckReferrals) {
    if (!await shouldAlert(ref.id, 'SPECIALIST_NO_ACK')) continue
    const hrs = Math.round((now - ref.updatedAt) / 3600000)

    // Auto-recovery: re-notify specialist org by email (the core recovery action)
    const specialistEmail = ref.receivingProvider?.email ?? ref.receivingOrg?.email ?? null
    const specialistName  = ref.receivingProvider
      ? `Dr. ${ref.receivingProvider.firstName} ${ref.receivingProvider.lastName}`
      : ref.receivingOrg?.name ?? 'Specialist'

    alerts.push(createAlert({
      referralId:    ref.id,
      type:          'SPECIALIST_NO_ACK',
      patientName:   ref.patient ? `${ref.patient.firstName} ${ref.patient.lastName}` : ref.referralNumber,
      patientPhone:  ref.patient?.phone ?? null,
      patientSmsOptIn: ref.patient?.smsOptIn ?? true,
      patientMessage: `Hi ${ref.patient?.firstName ?? 'there'}, your referral to ${ref.specialty} was sent ${hrs} hours ago. We haven't received confirmation yet. Your doctor's office has been notified and will follow up.`,
      // Auto-recovery: re-send to specialist (key differentiator vs. competitors)
      providerEmail:   specialistEmail,
      providerMessage: `REFERRAL FOLLOW-UP — This referral for ${ref.patient?.firstName} ${ref.patient?.lastName} (${ref.specialty}) was submitted ${hrs} hours ago and has not been acknowledged. Referral #: ${ref.referralNumber}. Referring provider: Dr. ${ref.referringProvider?.firstName ?? ''} ${ref.referringProvider?.lastName ?? ''}. Please confirm receipt or contact the referring practice. This is an automated follow-up from Plerous.`,
    }))

    // Append escalation note to referral status history (audit trail)
    await prisma.referral.update({
      where: { id: ref.id },
      data: {
        statusHistory: {
          push: {
            status:    'SUBMITTED',
            timestamp: now.toISOString(),
            userId:    'sentinel',
            note:      `Auto-recovery: re-notified specialist (${specialistName}) after ${hrs}h no acknowledgement`,
          },
        },
      },
    }).catch(() => {})
  }

  // Fire all alerts concurrently
  await Promise.allSettled(alerts)

  const summary = {
    staleDrafts:     staleDrafts.length,
    stalePaia:       stalePaia.length,
    expiringAuths:   expiringAuths.length,
    stuckAuths:      stuckAuths.length,
    specialistNoAck: noAckReferrals.length,
    alertsFired:     alerts.length,
    runAt:           now.toISOString(),
  }

  console.log(`[Sentinel] Scan complete — ${alerts.length} alert(s) fired`, summary)
  return summary
}
