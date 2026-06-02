# End-to-End Referral Scenarios — Full Permutation Matrix

The definition of "end to end" for Plerous: **from onboarding a provider, through a
referral, across the network-membership boundary, to a closed loop (or an honest
dead end) — and a growth signal captured along the way.**

This document enumerates **every permutation**, what *should* happen, whether
insurance/prior-auth is involved, the delivery channel, the loop-back to the
referrer, the growth-loop opportunity, and the **current build status** of each.

Legend for status: ✅ built · 🟡 partial · ❌ gap (not built) · 🧪 has automated test

---

## Part 0 — Core model facts (so the permutations make sense)

1. **Role is per-referral, not a fixed identity.** A provider has both
   `referralsSent` (referring/primary) and `referralsReceived` (receiving/
   specialist) relations. The *same* doctor is "primary" on one referral and
   "specialist" on another. There is no global "is a specialist" flag — only a
   `specialty` and the role they play on a given referral.
2. **Membership is per-party.** Each side of a referral is independently either
   **on-network** (has a Plerous Org/Provider record) or **off-network** (exists
   only in NPPES / the outside world). This is the axis that creates the 2×2.
3. **A referral does not require insurance.** Insurance/prior-auth is a *separate
   sub-flow* that only engages when the patient's plan `requiresPriorAuth` AND the
   procedure requires PA. A plain clinical referral can complete with no payer
   involvement at all.
4. **Plerous can only act on a party it can reach.** If the referrer is on-network
   we control the send; if the specialist is on-network we control receipt/auth;
   if neither is on-network the transaction is invisible to us.

---

## Part 1 — Onboarding (the entry event)

### S1.1 — Onboard a provider by NPI ✅
**Trigger:** `POST /v1/onboarding/claim { npi, email, password }`
**Effects inside the app:**
- NPPES lookup → pre-fills name, specialty, address, phone, fax, taxonomy/license.
- Creates **Organization** (sole-proprietor org for an individual NPI), **Provider**,
  and **User** (role `ORG_ADMIN`) in one transaction; returns a JWT.
- Infers likely **EHR** from specialty/practice signals (hint pre-connection;
  exact after SMART on FHIR).
- The new Org/Provider becomes a valid **on-network party** for future referrals
  (both as sender and receiver).
**Insurance:** none at onboarding.
**Status:** ✅ (NPI lookup, claim, EHR hint). 🟡 EHR *connection* (SMART OAuth) is a
separate step. ❌ no automated test yet for onboarding.

### S1.2 — NPI already registered ✅
Lookup returns `alreadyRegistered: true` + `registeredOrgId`; claim returns 409 →
route to login. Prevents duplicate orgs.

### S1.3 — Provider doesn't know their NPI ✅
`POST /v1/onboarding/npi/search` by name+state → NPPES results to pick from.

### S1.4 — Role determination 🟡
On claim we infer `OrgType` (PCP vs specialist) from taxonomy, but **role on a
referral is decided at referral-creation time**, not fixed here. A PCP-typed org
can still receive referrals. *(Working as designed; documented to avoid confusion.)*

---

## Part 2 — Creating & sending the referral (referrer side)

### S2.1 — Plain clinical referral, no PA required ✅🧪(partial)
Patient has sleep-disorder complaint → PCP creates referral to a specialist.
- If patient's plan does **not** require prior auth (or no payer on file):
  referral goes `DRAFT → SUBMITTED`. **No insurance step.** A simple, complete
  referral packet is enough.
- Tracking token generated; patient notified.
**Answer to "is insurance involved?":** Not necessarily. Insurance only enters if
the plan + procedure require PA (Part 4). A referral letter/packet alone is valid.

### S2.2 — Referral that requires prior auth ✅🧪
Plan `requiresPriorAuth` + procedure needs PA → on submit, **PAIA** runs its 4
checks first:
- PAIA `pa_not_required` → proceed as S2.1.
- PAIA `human_window` (missing docs / mismatch) → referral held in `PAIA_REVIEW`;
  coordinator resolves, then submit.
- PAIA `submit` → proceed to the payer loop (Part 4).
**Status:** ✅ PAIA engine + payer loop. 🧪 payer loop covered by E2E; PAIA decision
branches not yet automated.

### S2.3 — STAT/EMERGENCY referral ✅
Created with urgency STAT/EMERGENCY → auto-submitted immediately (skips draft dwell).

---

## Part 3 — THE NETWORK MATRIX (the core of "all permutations")

Two parties, each on/off network → **4 quadrants**. Each quadrant then branches on
delivery channel, acknowledgment, scheduling, loop-back, and growth.

```
                         SPECIALIST (receiving)
                    ON-network          OFF-network
                ┌────────────────────┬────────────────────┐
  REFERRER  ON  │  A: full loop      │  B: outbound reach  │
  (sending)     │     (digital)      │     (fax/secure)    │
                ├────────────────────┼────────────────────┤
            OFF │  C: inbound only   │  D: invisible       │
                │     (we receive)   │     (legacy)        │
                └────────────────────┴────────────────────┘
```

---

### QUADRANT A — Referrer ON, Specialist ON (the ideal, fully digital)

Both parties in Plerous. The whole loop is observable and automatable.

| ID | Sub-scenario | What happens | Insurance | Loop-back to referrer | Status |
|----|--------------|--------------|-----------|----------------------|--------|
| A1 | No PA, specialist acknowledges | Referral delivered in-app/FHIR; specialist marks RECEIVED; appointment scheduled; loop closed | none | Referrer sees status timeline; ❌ explicit "received/scheduled" notification to referrer | ✅ acknowledge + schedule; 🟡 referrer notify |
| A2 | PA required, approved | PAIA→payer→APPROVED→patient notified→scheduled→closed | yes | same as A1 | ✅🧪 (payer loop) |
| A3 | PA required, denied → appeal | DENIED→patient notified→appeal generated+submitted→re-decision | yes | same | 🟡 appeal submit built, not E2E-tested |
| A4 | Specialist never acknowledges (72h) | Sentinel `SPECIALIST_NO_ACK` chases; re-notifies specialist; alerts referrer | n/a | ✅ referrer + patient alerted | ✅ |
| A5 | Auth approved but never scheduled; auth expires | SLA worker flips EXPIRED; surfaces to act | yes | 🟡 alert on expiry | ✅ expiry; 🟡 notify |
| A6 | Appointment completed | Status → COMPLETED; revenue confirmed | n/a | 🟡 outcome back to referrer | 🟡 |

**Growth-loop:** N/A (both already customers — expansion/retention only).

---

### QUADRANT B — Referrer ON, Specialist OFF (the most important real-world case)

We control the send; the specialist is not in Plerous. This is the user's
scenarios 4–5. **This is where the "meet them where they are" channel + the growth
engine both live.**

| ID | Sub-scenario | What happens | Delivery channel | Loop-back | Growth-loop | Status |
|----|--------------|--------------|------------------|-----------|-------------|--------|
| B1 | Send via **secure link** | Referral packet delivered; specialist office opens a tokenized secure page and clicks **Confirm receipt** → RECEIVED + `acknowledgedAt`; patient notified | secure link (HTTPS, no login) | ✅ status flips, referrer sees it | specialist NPI is a reach-out candidate | ✅🧪 secure-link ack; ❌ auto-enqueue prospect |
| B2 | Send via **fax**, received, appointment confirmed | Fax transmitted; office calls patient / confirms; Sentinel chases until someone marks RECEIVED (via secure link or coordinator) | fax (transmit-only proof) | 🟡 referrer sees RECEIVED once confirmed | strong reach-out candidate ("you already received a Plerous referral") | ❌ fax send not built; 🟡 confirmation via secure-link fallback |
| B3 | Send via **fax**, **lost / no response** (the leak) | No ack in 72h → Sentinel escalates: re-fax/secure-link, queue a call task, alert referrer + patient. Referral stays open, not silently lost | fax → escalation | ✅ referrer + patient alerted; loop NOT silently dropped | the unreachable specialist is a prime conversion target | 🟡 Sentinel chase built; ❌ fax send + auto re-fax |
| B4 | Specialist **acknowledges via secure link → becomes interested** | After experiencing a clean Plerous packet, office clicks "What is Plerous?" CTA → enters onboarding | secure link | n/a | **conversion**: prospect → onboard (Part 1) | ❌ CTA-to-onboard on the secure page + tracking |
| B5 | PA required but specialist off-network | PA is the **referrer's payer interaction**, independent of specialist membership — PAIA→payer still runs (payer is on-network via gateway). Specialist receipt handled by B1/B2 | yes (payer side) | ✅ referrer sees auth status | same as B1 | ✅🧪 payer loop; channel per B1/B2 |

**Answer to "is there a loop back to the referring doctor?":** Yes — every receipt,
acknowledgment, stall, and (for PA) decision updates the referral the referrer
owns, and Sentinel actively alerts the referrer on stalls. The *positive* loop-back
notification (specialist received / scheduled) to the referrer is the 🟡 gap.

**Answer to "ask non-system specialists to try Plerous":** That's the **growth loop**
— the off-network specialist's NPI from B1–B3 should be auto-enqueued into the
`ProspectAgent`, which researches them, estimates their leakage/ROI, and drafts
outreach. Engine exists ✅; **auto-enqueue on off-network referral is ❌**.

---

### QUADRANT C — Referrer OFF, Specialist ON (inbound capture)

The user's scenario 6. The specialist is our customer; the referral arrives from an
outside PCP (landline fax, system fax, secure message, or a payer/EHR feed).

| ID | Sub-scenario | What happens | Inbound channel | Loop-back to outside referrer | Growth-loop | Status |
|----|--------------|--------------|-----------------|------------------------------|-------------|--------|
| C1 | Inbound **fax** arrives | Fax ingested → parsed into a referral record on the specialist's queue (`source: "fax"`); specialist works it | inbound fax → OCR/parse | acknowledgment back to the outside PCP (fax/secure link) so *they* aren't in the dark | outside PCP is a reach-out candidate | ❌ inbound fax ingest/parse not built (schema supports `source: "fax"`) |
| C2 | Inbound **secure/Direct/EHR** referral | Structured inbound → referral record; specialist acknowledges; status available to sender if they have a tracking link | Direct / FHIR / portal | 🟡 send-back receipt to outside PCP | outside PCP candidate | ❌ inbound Direct/FHIR ingest not built |
| C3 | Inbound referral, specialist captures the appointment | Specialist schedules; **this is the specialist's revenue event** (inbound capture = booked procedure) | any | optional receipt to PCP | convert the PCP | 🟡 scheduling built; ingest ❌ |

**Why this quadrant matters commercially:** for a specialist/imaging/surgery center
customer, **every inbound referral captured = revenue**. Owning inbound is the
value prop for that buyer segment. Today the *internal* handling exists; the
*ingestion* of outside referrals (especially fax) is the gap.

---

### QUADRANT D — Referrer OFF, Specialist OFF (legacy, invisible)

The user's scenario 7. Neither party is in Plerous. They transact the legacy way
(fax/phone). **Plerous cannot act and should not pretend to.**

| ID | Sub-scenario | What happens | Status |
|----|--------------|--------------|--------|
| D1 | Both off-network | Invisible to Plerous — no record, no loop | ✅ (correctly out of scope) |
| D2 | Indirect signal | If a payer/clearinghouse feed (Availity) later surfaces such a transaction, *both* NPIs become cold prospects | ❌ future: payer-feed-driven prospecting |

---

## Part 4 — Insurance / prior-auth sub-flow (orthogonal to the matrix)

PA engages **only** when plan + procedure require it; it is the **referrer↔payer**
interaction and does **not** depend on the specialist's membership.

| ID | Scenario | Outcome | Status |
|----|----------|---------|--------|
| P1 | No PA required | Skip straight to delivery | ✅🧪 |
| P2 | PA required, PAIA clears, payer approves (sync) | AUTH_APPROVED, patient notified | ✅🧪 |
| P3 | PA required, payer pends → poll resolves | AUTH_APPROVED via status poll | ✅🧪 |
| P4 | PA required, payer pends → async webhook | AUTH_APPROVED via signed webhook | ✅🧪 |
| P5 | PA denied → appeal | AUTH_DENIED → appeal → re-decision | 🟡 (built, not E2E) |
| P6 | Eligibility check (active / ineligible) | coverage flags returned | ✅🧪 |
| P7 | Auth approved then expires unused | EXPIRED (SLA worker) | ✅🧪 |
| P8 | PAIA human_window (missing docs) | held for review, resolve-and-submit | ✅ engine; ❌ E2E |

---

## Part 5 — The growth loop (turning the network effect on)

The defensible flywheel: **every off-network party we touch becomes a qualified
prospect, pre-researched and ready for outreach.**

| ID | Trigger | Desired behavior | Status |
|----|---------|------------------|--------|
| G1 | Referral sent to off-network specialist (B1–B3) | Auto-enqueue specialist NPI → ProspectAgent researches + drafts outreach | engine ✅; **auto-enqueue ❌** |
| G2 | Inbound referral from off-network PCP (C1–C2) | Auto-enqueue PCP NPI as prospect | engine ✅; ingest+enqueue ❌ |
| G3 | Off-network party opens secure link / receives Plerous packet | "Powered by Plerous — try it" CTA → onboarding; track conversion | ❌ |
| G4 | Manual prospecting by NPI | Research + ROI + outreach draft | ✅ (`ProspectAgent.run(npi)`) |

---

## Part 6 — What must be built for TRUE end-to-end (gap backlog)

Ordered by leverage:

1. **Off-network delivery channels** — outbound **fax send** (B2/B3) and inbound
   **fax ingest/parse** (C1). The single biggest real-world gap; most referrals to
   small specialists are still fax. (FHIR/secure-link paths already work.)
2. **Auto-enqueue growth loop** (G1/G2) — wire off-network parties into
   `ProspectAgent` automatically; add the secure-page "try Plerous" CTA (G3).
3. **Positive loop-back to referrer** (A1/A6/B-series) — notify the referring
   provider on receipt/schedule/completion, not just on stalls.
4. **Inbound referral ingestion** (C2) — Direct Secure Messaging + EHR FHIR Task
   intake so specialist customers capture outside referrals.
5. **Appeal + PAIA-branch E2E tests** (P5, P8) and **onboarding E2E** (S1.1).
6. **Direct MDN + EHR Task receipt signals** — the other two "confirmed receipt"
   channels beyond secure link.

---

## Part 7 — Test coverage map (what's verifiable today)

| Layer | Method | Where |
|-------|--------|-------|
| Payer loop (P1–P7) | automated 🧪 | `apps/api/test/payer-loop.e2e.test.js` |
| Secure-link receipt (B1) | automated 🧪 | `apps/api/test/delivery.e2e.test.js` |
| SLA expiry (A5/P7) | automated 🧪 | `apps/api/test/sla.e2e.test.js` |
| Webhook security | automated 🧪 | `apps/api/test/webhook-security.e2e.test.js` |
| Manual recipes (member-ID scenarios) | manual | `docs/manual-test-guide.md` |
| Onboarding, fax, inbound, growth-loop | ❌ none yet | — (gap backlog above) |

**Honesty guardrail:** a scenario is only "closed" when it has a ✅ + 🧪. Marketing
claims map to this table — nothing ships ahead of a green test.
