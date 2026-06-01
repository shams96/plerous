# RefChain — Agent Build Plan

**Date**: 2026-05-31  
**Frame**: Every agent closes a loop. Every loop compounds the Health Memory Layer.  
**Rule**: Synthesize first. Ship the outcome, not the feature.

---

## What Already Exists (Do Not Rebuild)

| Agent | File | What It Does |
|---|---|---|
| **PAIA Agent** | `agents/paia.agent.js` | Pre-auth intelligence, denial probability, auto-submit vs. human window |
| **Sentinel Agent** | `agents/sentinel.agent.js` | 24/7 stall monitor, 5 alert types, auto-recovery actions |
| **Denial Feedback Loop** | `agents/paia/feedback/denial-feedback.js` | Outcomes → PolicyRule counters → smarter next PAIA |
| **AI Training Loop** | `modules/ai/training-loop.js` | Human overrides → weight adjustment → smarter risk scores |
| **NPPES Agent** | `lib/nppes.js` + onboarding routes | NPI → full provider profile (foundation for Prospect Intelligence) |

These four closed loops ARE the foundation. Everything below builds on top of them.

---

## Build Queue — Ordered by Impact per Hour

---

### WEEK 1, DAY 1–2 — Coordinator Daily Brief

**The single highest-leverage build. Every customer touches it every day.**

**What it does**: At 8am, every coordinator sees exactly what needs action today — not a referral list, a prioritized brief with drafted actions.

**Output example**:
```
Today's Brief — Bay Area Cardiology | Friday Jun 7

🔴 ACT NOW (SLA at risk):
  RC-A3F7K2  James Thompson — specialist no-ACK in 71h (breach in 1h)
  → [Email Dr. Bangash's office] [Re-route to alternate]

🟡 FOLLOW UP:
  RC-B8K2MN  Sarah Chen — auth APPROVED, not scheduled in 4 days
  → [Send scheduling SMS] ← draft ready

  RC-D4P9QR  Maria Gonzalez — auth expires in 6 days
  → [Remind specialist]

✅ THIS WEEK: 7 submitted · 4 acknowledged · 2 scheduled · 1 completed
   Leakage rate: 8%  (industry avg 22%) ↓
```

**Where it lives**: 
- `GET /v1/agents/brief/coordinator` — returns JSON brief for the logged-in org
- Dashboard widget on the main referrals page (above the referral list)
- Optional: daily email delivery

**Data it needs** (all already in DB):
- Referrals with `status` + `updatedAt` → detect SLA proximity
- Auth expirations from `PriorAuthorization.expiresAt`
- Patient `smsOptIn` + `phone` for drafted actions
- Weekly stats aggregated from `statusHistory`

**Files to create**:
- `apps/api/src/agents/brief.agent.js` — queries DB, builds brief, uses Claude to prioritize and draft action text
- `apps/api/src/modules/agents/brief.routes.js` — `GET /v1/agents/brief/coordinator`
- `apps/dashboard/src/components/DailyBrief.tsx` — dashboard widget

**Effort**: ~6 hours  
**Impact**: Every coordinator opens this every morning. Highest daily active usage of any feature.

---

### WEEK 1, DAY 3 — Founder Morning Brief (Internal)

**How the DRI starts every day without checking six places manually.**

**What it does**: Runs at 7am, delivers a Slack-style message (or hits an endpoint) with:
- Trial customers: days remaining, referrals submitted, engagement signal
- Paying customers: any at-risk signals (no logins, no referrals)
- New signups overnight (NPI lookups that haven't converted)
- Blockers: Availity credential status, UHC sandbox day count
- Top 3 actions for today

**Files to create**:
- `apps/api/src/agents/founder-brief.agent.js`
- `apps/api/src/workers/founder-brief.worker.js` — BullMQ cron, 7am daily
- Route: `GET /v1/admin/brief` (SUPER_ADMIN only)

**Effort**: ~3 hours  
**Impact**: Replaces manual dashboard checking. Ensures nothing slips between customers.

---

### WEEK 1, DAY 4–5 — Prospect Intelligence Agent

**Turn the existing NPPES agent into a full outreach brief generator.**

**What it does**: Given any NPI → returns a complete practice intelligence brief for outreach:
- Provider name, specialty, practice size (estimated from org type)
- Geography → which seed providers are nearby in the referral network
- Insurance mix estimate → how urgent is CMS-0057-F for them?
- Estimated monthly referral volume (from specialty + provider count)
- Estimated monthly leakage cost (referral volume × leakage rate × avg revenue)
- Personalized outreach paragraph: "Dr. Farooq — your nephrology practice in McKinney sends an estimated 60 referrals/month. At 20% pre-scheduling leakage, that's ~$24,000/month in unrecovered revenue..."

**Files to create**:
- `apps/api/src/agents/prospect.agent.js` — extends NPPES lookup with intelligence layer
- Route: `GET /v1/agents/prospect/:npi` (SUPER_ADMIN)

**Effort**: ~4 hours  
**Impact**: Replaces Clay. Enables one-person outbound GTM at scale. Every prospect researched in <3 seconds.

---

### WEEK 2, DAY 1–2 — Customer Engagement Monitor

**Never let a customer go dark without a signal.**

**What it does**: Runs daily (or on-demand). Scores every active customer on engagement:
- Trial customers: referrals submitted / days elapsed (0 referrals in 5 days = at-risk)
- Trial expiring in <3 days with low engagement = urgent
- Paying customers: no login in 7 days = churn signal
- Outputs prioritized list with drafted re-engagement message for each

**Files to create**:
- `apps/api/src/agents/engagement.agent.js`
- `apps/api/src/workers/engagement.worker.js` — daily cron
- Route: `GET /v1/admin/engagement` (SUPER_ADMIN)

**Effort**: ~4 hours  
**Impact**: Prevents silent churn. At 10+ customers this becomes essential.

---

### WEEK 2, DAY 3–5 — Referral Recovery Agent (Sentinel Upgrade)

**Upgrade Sentinel from "alert and wait" to "act and report."**

**Current Sentinel**: Detects stall → sends alert → waits for human.  
**Recovery Agent**: Detects stall → takes action → tells human what it did.

| Stall | Current | Recovery Agent |
|---|---|---|
| Specialist no-ACK >72h | Emails provider | Re-sends full referral packet + offers alternate specialist routing |
| Patient has ACK but hasn't scheduled | Nothing | Sends patient SMS: "Your specialist is ready — call [phone] to schedule" |
| Auth stuck >3 days | Emails provider | Drafts peer-to-peer review request for the specific payer |
| Draft stale >48h | Emails provider | Shows coordinator exactly what's incomplete, offers one-click complete |

**Files to modify**:
- `apps/api/src/agents/sentinel.agent.js` — upgrade each alert handler to take action before notifying

**Effort**: ~5 hours  
**Impact**: Closes the loop that Sentinel currently only opens. Fewer human interventions needed.

---

### MONTH 2 — Scheduling Completion Agent

**The loop between ACK and booked appointment is currently open. Close it.**

**What it does**: Monitors every referral in RECEIVED or AUTH_APPROVED status. If no appointment scheduled within N days of status change:
- Day 3: Patient SMS with specialist contact info and a scheduling nudge
- Day 5: Coordinator brief item surfaces it as urgent
- Day 7: Specialist org email — "Patient [first name] has not yet scheduled. Please initiate contact."

**Threshold config** (per specialty):
- Routine: 5 days before first nudge
- Urgent: 2 days
- STAT: immediate (same day)

**Files to create**:
- `apps/api/src/agents/scheduling.agent.js`
- `apps/api/src/workers/scheduling.worker.js`

**Effort**: ~6 hours  
**Impact**: Closes the most common post-ACK leak. Directly recoverable revenue.

---

### MONTH 2 — Deal Asset Generator

**Custom ROI calculator or one-pager for any prospect in <30 seconds.**

**What it does**: Given a prospect NPI + specialty + estimated volume:
- Calculates their estimated monthly leakage (volume × leakage rate × avg revenue per patient)
- Generates a branded HTML one-pager: their specific numbers, RefChain's specific solution, MPSC case study comparison
- Output: sharable link or downloadable PDF

**Files to create**:
- `apps/api/src/agents/asset.agent.js`
- Route: `POST /v1/agents/asset` — body: `{ npi, assetType: 'roi_calculator' | 'one_pager' | 'case_study' }`

**Effort**: ~5 hours  
**Impact**: Replaces custom collateral requests. Every outbound email can include a personalized ROI number.

---

### MONTH 3 — Revenue Recovery Agent

**Built for hospital buyers. Detects leaked revenue and quantifies it.**

**What it does**: Runs against all orgs in the system. Identifies:
- Referrals sent to this specialist org that never reached RECEIVED (leaked)
- Estimated revenue of each leaked referral (specialty × average procedure value)
- Monthly and trailing 12-month leakage totals
- Recovery rate: % of previously leaked referrals now being captured

**Output**: Executive report, generated on-demand or monthly  
**Buyer**: Hospital CFO / Revenue Cycle Director  
**Pitch**: "Here is your exact leakage number. Here is what we recovered. Here is what remains."

**Files to create**:
- `apps/api/src/agents/revenue-recovery.agent.js`
- Route: `GET /v1/agents/revenue-recovery/:orgId`

**Effort**: ~6 hours  
**Impact**: This is the budget unlock for hospital enterprise sales. Quantified leakage = quantified ROI = signed contract.

---

### MONTH 3 — Referring Relationship Intelligence

**Churn prevention for specialist customers.**

**What it does**: For each specialist org, monitors referral volume per sending practice over time. Detects:
- PCPs whose referral rate dropped >50% month-over-month
- Last referral status for that PCP (was there a bad experience? a CANCELLED or DENIED?)
- Suggested re-engagement action: call, email, or referral network report

**Output**: Monthly relationship health report for specialist practice manager  
**Pitch**: "Dr. Johnson's office sent 0 referrals this month after averaging 8/month. Their last referral was cancelled. Here is a draft outreach."

**Files to create**:
- `apps/api/src/agents/relationship.agent.js`
- Route: `GET /v1/agents/relationships` (scoped to org)

**Effort**: ~5 hours

---

### MONTH 4 — Care Gap Agent

**The Phase 3 wedge into value-based care buyers.**

**What it does**: Monitors per-patient care history across ALL referrals. Detects:
- Ordered actions that have no completion event within expected timeframe
- Example: Referral for MRI created → no appointment scheduled after 30 days → flag
- Example: Referral COMPLETED → follow-up referral recommended but never created → flag

**Buyers**: ACOs, Oak Street Health, ChenMed, MSSP participants  
**Pitch**: Not "track referrals." "Close every care gap before it becomes a hospitalization."

**Files to create**:
- `apps/api/src/agents/care-gap.agent.js`
- New DB model: `CareGap` — tracks open gaps per patient, type, age, resolution

**Effort**: ~10 hours (requires schema change)

---

## Summary: Build Order + Timeline

| Week | Agent | Type | Effort | Business Impact |
|---|---|---|---|---|
| W1 Day 1–2 | Coordinator Daily Brief | Product | 6h | Highest daily engagement of any feature |
| W1 Day 3 | Founder Morning Brief | Internal | 3h | DRI situational awareness, no manual checking |
| W1 Day 4–5 | Prospect Intelligence | Internal GTM | 4h | Replaces Clay, enables one-person outbound |
| W2 Day 1–2 | Customer Engagement Monitor | Internal | 4h | Prevents silent churn |
| W2 Day 3–5 | Referral Recovery Agent | Product | 5h | Closes loops Sentinel currently only opens |
| Month 2 | Scheduling Completion | Product | 6h | Closes post-ACK leak |
| Month 2 | Deal Asset Generator | Internal GTM | 5h | Custom ROI calculator for every prospect |
| Month 3 | Revenue Recovery | Product | 6h | Hospital enterprise budget unlock |
| Month 3 | Referring Relationship Intel | Product | 5h | Specialist churn prevention |
| Month 4 | Care Gap Agent | Product | 10h | Value-based care buyer unlock |

**Total for core product agents (W1–W2)**: ~22 hours of build  
**Total for full platform (through Month 4)**: ~54 hours of build

---

## Architecture Rule for All Agents

Every agent follows the same pattern:

```javascript
// apps/api/src/agents/[name].agent.js

export class [Name]Agent {
  async run(context) {
    // 1. Query — get the data needed from prisma
    // 2. Analyze — use Claude API to score/prioritize/generate
    // 3. Act — write to DB, send notifications, update statusHistory
    // 4. Report — return structured result with actions taken
  }
}
```

Every agent:
- Queries the existing DB (no external tools)
- Uses the Claude API for intelligence (generateWithWorker or generateDirect)
- Logs actions to the Notification or AuditLog table
- Returns a structured result the calling route can serialize
- Has a BullMQ worker if it runs on a schedule
- Has a manual trigger route under `/v1/agents/` for testing

This is agents-over-tools in practice: one data model, one intelligence layer, no integration tax.
