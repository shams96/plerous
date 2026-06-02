# Manual E2E Test Guide — Payer Pipeline

How to reproduce the automated E2E scenarios by hand. The behaviour is driven
by the patient's **insurance member ID** — that's the control knob.

## Scenario → data table

| # | Scenario | Member ID | Expected outcome |
|---|----------|-----------|------------------|
| 1 | Sync approve | `APPROVE001` | auth `APPROVED`, referral `AUTH_APPROVED`, patient SMS row |
| 2 | Sync deny | `DENY001` | auth `DENIED` + reason, referral `AUTH_DENIED`, patient SMS row |
| 3 | Pend → poll | `PENDPOLL001` | submit returns pending; after ~1s a status poll resolves `APPROVED` |
| 4 | Pend → webhook | `PENDWEBHOOK001` | submit pending; sim posts a signed webhook → `AUTH_APPROVED` |
| 5 | Eligibility (active) | `APPROVE001` | `eligible: true, coverageActive: true` |
| 6 | Eligibility (ineligible) | `INELIGIBLE001` | `eligible: false` |
| 7 | Secure-link receipt | any | `SUBMITTED → RECEIVED`, `acknowledgedAt` stamped |
| 8 | SLA expiry | any (auth past `expiresAt`) | auth `EXPIRED`, referral `EXPIRED` |
| 9 | Webhook security | — | bad/missing signature → 401, valid → 200 |

> Any member ID not matching a prefix above defaults to **approve**.

---

## Prerequisites

```bash
# 1. Infra
cd dev/plerous
docker start refchain_postgres refchain_redis   # or: docker compose up -d postgres redis

# 2. Simulator (terminal A) — note the webhook target + secret
cd apps/payer-sim
PORT=4010 WEBHOOK_SECRET=plerous-sim-secret \
  PLEROUS_WEBHOOK_URL=http://localhost:3001/v1/auth/webhook/sim \
  node server.js

# 3. API (terminal B) — must share the same webhook secret
cd apps/api
PAYER_WEBHOOK_SECRET=plerous-sim-secret npm run dev

# 4. Seed (terminal C) — creates the "Plerous Simulator" payer + base data
cd apps/api
npm run db:seed
```

---

## Method 1 — Simulator directly (no Plerous, proves the counterparty)

```bash
# Approve
curl -s -X POST http://localhost:4010/fhir/r4/Claim/\$submit \
  -H 'Content-Type: application/fhir+json' \
  -d '{"resourceType":"Bundle","entry":[{"resource":{"resourceType":"Patient","identifier":[{"value":"APPROVE001"}]}}]}'
# → ClaimResponse outcome=complete, preAuthRef SIM-xxxx

# Deny
curl -s -X POST http://localhost:4010/fhir/r4/Claim/\$submit \
  -H 'Content-Type: application/fhir+json' \
  -d '{"resourceType":"Bundle","entry":[{"resource":{"resourceType":"Patient","identifier":[{"value":"DENY001"}]}}]}'
# → outcome=error
```

---

## Method 2 — Eligibility through Plerous over HTTP (real gateway end-to-end)

```bash
# Login (seeded provider)
TOKEN=$(curl -s -X POST http://localhost:3001/v1/session/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"drjohnson@sunrise.health","password":"demo1234"}' | jq -r '.data.token')

# Find the simulator payer id
PAYER=$(curl -s http://localhost:3001/v1/providers/payers -H "Authorization: Bearer $TOKEN" \
  | jq -r '.data[] | select(.tradingPartnerServiceId=="SIM-0001") | .id')
# (if that endpoint differs, get the id from Prisma Studio: npm run db:studio → Payer)

# Eligibility — active member
curl -s -X POST http://localhost:3001/v1/auth/validate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"memberId\":\"APPROVE001\",\"payerId\":\"$PAYER\",\"serviceDate\":\"2026-06-15\"}"
# → { eligible: true, coverageActive: true }

# Eligibility — ineligible member
curl -s -X POST http://localhost:3001/v1/auth/validate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"memberId\":\"INELIGIBLE001\",\"payerId\":\"$PAYER\",\"serviceDate\":\"2026-06-15\"}"
# → { eligible: false }
```

---

## Method 3 — Public endpoints (no auth)

### Secure-link receipt confirmation (scenario 7)
```bash
# You need a referral with a trackingToken in SUBMITTED state. Grab one from
# Prisma Studio (Referral.trackingToken), then:
curl -s -X POST http://localhost:3001/v1/referrals/track/<TOKEN>/acknowledge
# → { acknowledged: true, status: "RECEIVED" }
curl -s http://localhost:3001/v1/referrals/track/<TOKEN>   # timeline now shows RECEIVED
```

### Webhook security (scenario 9)
```bash
BODY='{"event":"authorization.decision","authorizationNumber":"SIM-TEST","status":"APPROVED"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'plerous-sim-secret' | awk '{print $2}')"

# Forged signature → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/v1/auth/webhook/sim \
  -H 'Content-Type: application/json' -H 'X-Plerous-Signature: sha256=deadbeef' -d "$BODY"
# → 401

# Valid signature → 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3001/v1/auth/webhook/sim \
  -H 'Content-Type: application/json' -H "X-Plerous-Signature: $SIG" -d "$BODY"
# → 200
```

---

## Method 4 — Full referral → auth loop (most faithful)

The submit→PAIA→payer loop is auth-gated and runs PAIA first, so the simplest
faithful reproduction is the automated suite (it does exactly methods 1–3 wired
together):

```bash
cd apps/api && npm test
```

To exercise it through the **dashboard UI** instead:
1. Log in at http://localhost:3000 (`drjohnson@sunrise.health` / `demo1234`).
2. Create a patient whose **insurance member ID** is `APPROVE001` (or `DENY001`,
   `PENDWEBHOOK001`, …) on a plan whose payer is **Plerous Simulator**.
3. Create a referral for that patient with a procedure that requires PA
   (e.g. CPT `95810`) and complete clinical notes (ESS, STOP-BANG, AHI) so PAIA
   clears, then Submit.
4. Watch the referral status: `SUBMITTED → AUTH_PENDING →` (sim decision) →
   `AUTH_APPROVED` / `AUTH_DENIED`. The patient SMS is logged in the API console
   (Twilio not configured in dev).

---

## Watching what happens
- **API console** — submission, decision, denial-feedback, webhook receipt logs.
- **Simulator console** — `[sim] webhook → SIM-xxxx APPROVED` for pend scenarios.
- **Prisma Studio** (`npm run db:studio`) — inspect `Referral.status`,
  `PriorAuthorization.status/authNumber`, `Notification` rows.
