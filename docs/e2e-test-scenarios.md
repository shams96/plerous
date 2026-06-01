# RefChain — End-to-End Test Scenarios

**Stack**: Fastify API (port 3001) · Next.js Dashboard (port 3000) · PostgreSQL · Redis  
**Date**: 2026-05-31  
**Admin**: `admin@refchain.ai` / `admin2026!`  
**Demo API key**: `rc_live_demo_key_sunrise_2026`

---

## Customer Relationships & Personas

| Persona | Who | What they do in RefChain | Pays? |
|---|---|---|---|
| **Referring Provider** | PCP, hospitalist, urgent care | Creates + submits referrals, tracks status | **Yes** — primary payer |
| **Specialist / Receiving Provider** | Cardiologist, nephrologist, sleep | Acknowledges referral, schedules patient | **Yes** — secondary payer (specialist-side plan) |
| **Care Coordinator** | MA, office manager | Manages workflow, runs the PAIA queue | Covered by org plan |
| **Patient** | The person being referred | Receives SMS updates, tracks via public URL | No |
| **Payer / Insurer** | BCBS TX, UHC | Receives prior auth requests, returns decisions | No (future API partner possible) |
| **EHR Vendor** | Tebra, DrChrono | Embeds RefChain API into their product | **Yes** — API_PARTNER tier (Act 2) |
| **Super Admin** | 1hubsolutions internal | Platform operations, policy rules, audit | Internal |

---

## Scenario 1 — Happy Path: PCP → Specialist, No Prior Auth Required

**Personas**: Referring Provider, Patient  
**Validates**: Create → Submit → Acknowledge → Schedule → Complete  
**Expected patient SMSes**: 3 (submitted, received, scheduled)

### Setup
```powershell
$headers = @{ "Authorization" = "Bearer <JWT>"; "Content-Type" = "application/json" }
# Login first:
$login = Invoke-RestMethod -Uri http://localhost:3001/v1/session/login -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"drjohnson@sunrise.health","password":"demo1234"}'
$token = $login.data.token
$headers = @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" }
```

### Step 1 — Create referral (DRAFT)
```powershell
$body = @{
  patientId       = "<patient-uuid>"
  specialty       = "Cardiology"
  diagnosisCodes  = @("I10", "R00.0")
  procedureCodes  = @("93000")
  reason          = "Evaluate palpitations, rule out arrhythmia"
  urgency         = "ROUTINE"
  receivingOrgId  = "<bay-area-cardiology-uuid>"
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri http://localhost:3001/v1/referrals `
  -Method POST -Headers $headers -Body $body
$referralId = $r.data.id
```

**Assert**: `status = DRAFT`, `riskScore` populated, `approvalProbability` populated.

### Step 2 — Submit (DRAFT → SUBMITTED or PAIA_REVIEW)
```powershell
$sub = Invoke-RestMethod -Uri "http://localhost:3001/v1/referrals/$referralId/submit" `
  -Method POST -Headers $headers -Body '{}'
```

**Assert**:
- If `requiresAuth = false`: `status = SUBMITTED`, `trackingToken` populated (e.g. `RC-A3F7K2`)
- Patient receives SMS: "Your Cardiology referral has been sent. Track: http://localhost:3000/track/RC-A3F7K2"
- PAIA decision logged to `PAIAAnalysis` table

### Step 3 — Specialist acknowledges (SUBMITTED → RECEIVED)
Login as specialist org first, then:
```powershell
$login2 = Invoke-RestMethod -Uri http://localhost:3001/v1/session/login -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"dr.bangash@bangashnephrology.com","password":"refchain2026!"}'
$headers2 = @{ "Authorization" = "Bearer $($login2.data.token)"; "Content-Type" = "application/json" }

Invoke-RestMethod -Uri "http://localhost:3001/v1/referrals/$referralId/acknowledge" `
  -Method POST -Headers $headers2 -Body '{}'
```

**Assert**:
- `status = RECEIVED`
- Patient receives SMS: "Your referral has been RECEIVED by [specialist]. Track: ..."
- Public tracking page `GET /v1/referrals/track/RC-A3F7K2` returns status = RECEIVED, timeline shows 3 stops

### Step 4 — Schedule appointment
```powershell
$sched = @{ appointmentDate = "2026-06-15T10:00:00Z" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/v1/referrals/$referralId/schedule" `
  -Method POST -Headers $headers2 -Body $sched
```

**Assert**: `status = SCHEDULED`, patient SMS with appointment date

### Step 5 — Verify public tracking page
Open browser: `http://localhost:3000/track/RC-A3F7K2`
- No login required
- Shows 4-step progress bar: Sent ✓ → Received ✓ → Approved (skipped for no-auth) → Scheduled ✓
- Appointment date visible
- Contact cards for referring practice and specialist

---

## Scenario 2 — Prior Auth Required: Full Approval Flow

**Personas**: Referring Provider, Care Coordinator, Payer (mocked), Patient  
**Validates**: PAIA analysis → human review → auth submission → approval → patient SMS

### Step 1 — Create referral with procedure requiring prior auth
Use procedure code `27447` (Total Knee Arthroplasty — seeded in policy rules as requiring auth):
```powershell
$body = @{
  patientId      = "<patient-with-PPO-insurance>"
  specialty      = "Orthopedics"
  diagnosisCodes = @("M17.11")
  procedureCodes = @("27447")
  reason         = "Right knee OA, conservative management failed"
  urgency        = "ROUTINE"
} | ConvertTo-Json
```

**Assert**: `requiresAuth = true` on the created referral

### Step 2 — Submit → PAIA runs
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/referrals/$referralId/submit" `
  -Method POST -Headers $headers -Body '{}'
```

**Assert**: PAIA result is one of:
- `auto_submit` (≥85% confidence): status → `AUTH_PENDING`, referral submitted to payer automatically
- `human_window` (<85%): status → `PAIA_REVIEW`, items flagged appear in `GET /v1/paia/human-window`

### Step 3 — Resolve PAIA (if human_window)
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/referrals/$referralId/resolve-and-submit" `
  -Method POST -Headers $headers `
  -Body '{"resolution":"confirmed","note":"Documentation reviewed, patient qualifies"}'
```

### Step 4 — Simulate auth approval (via admin webhook)
```powershell
$auth = Invoke-RestMethod -Uri http://localhost:3001/v1/authorizations -Method GET -Headers $adminHeaders
$authId = $auth.data[0].id

Invoke-RestMethod -Uri "http://localhost:3001/v1/authorizations/$authId/webhook" `
  -Method POST -Headers $adminHeaders `
  -Body '{"status":"APPROVED","authNumber":"AUTH-2026-88771","expiresAt":"2026-08-01T00:00:00Z"}'
```

**Assert**:
- Referral status → `AUTH_APPROVED`
- Patient receives SMS: "✅ Your Orthopedics referral has been APPROVED (Auth #AUTH-2026-88771), valid until August 1 2026. Call the specialist to schedule."
- `smsOptIn = false` patients should NOT receive SMS (verify with James Thompson seed patient)

---

## Scenario 3 — Prior Auth Denial + AI Appeal

**Personas**: Referring Provider, Care Coordinator  
**Validates**: Denial handling, AI-generated appeal letter

### Step 1 — Simulate denial
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/authorizations/$authId/webhook" `
  -Method POST -Headers $adminHeaders `
  -Body '{"status":"DENIED","denialReason":"Medical necessity not established","denialCode":"50"}'
```

**Assert**:
- Patient receives SMS: "⚠️ Your referral was denied. Reason: Medical necessity not established. You have the right to appeal — call your doctor."
- `appealDeadline` populated on PriorAuthorization record

### Step 2 — Generate AI appeal letter
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/ai/generate-appeal" `
  -Method POST -Headers $headers `
  -Body "{`"authorizationId`":`"$authId`"}"
```

**Assert**: Response contains a structured appeal letter with clinical justification referencing the diagnosis and procedure codes.

---

## Scenario 4 — Sentinel 72-Hour SLA Enforcement

**Personas**: Sentinel Agent (background), Specialist  
**Validates**: SPECIALIST_NO_ACK alert fires after 72h, provider email sent, statusHistory appended

### Setup — create a backdated SUBMITTED referral
Use admin API to force-set `updatedAt` to 73 hours ago, or create a referral and manually update in DB:
```sql
UPDATE "Referral" 
SET status = 'SUBMITTED', "updatedAt" = NOW() - INTERVAL '73 hours'
WHERE id = '<test-referral-id>';
```

Also flush Redis dedup keys for clean test:
```bash
# In Redis CLI (docker exec -it refchain-redis redis-cli -p 6380)
KEYS sentinel:alert:* 
DEL sentinel:alert:<referral-id>:SPECIALIST_NO_ACK
```

### Trigger Sentinel run
```powershell
Invoke-RestMethod -Uri http://localhost:3001/v1/admin/sentinel/run `
  -Method POST -Headers $adminHeaders -Body '{}'
```

**Assert**:
- `Notification` record created with `type = SPECIALIST_NO_ACK`, `channel = EMAIL`, `status = dev_logged`
- `statusHistory` on referral has new entry: "Auto-escalation: No specialist acknowledgement in 72h..."
- Sentinel does NOT re-fire for same referral within 6h (Redis dedup key present)

---

## Scenario 5 — Patient Public Tracking (No Login)

**Validates**: Public endpoint, patient-safe data only, no PHI leakage

```powershell
# No Authorization header required
$track = Invoke-RestMethod -Uri "http://localhost:3001/v1/referrals/track/RC-HLSATG"
```

**Assert**:
- Returns `patientFirstName` (first name only, not last name)
- Returns `specialty`, `statusLabel`, `nextAction`, `timeline`
- Does NOT return: `diagnosisCodes`, `procedureCodes`, `clinicalNotes`, `insuranceMemberId`, `dateOfBirth`
- Returns `referringPractice` name + phone (but not provider's personal details)
- Invalid token returns `404 { error: "Tracking number not found." }`

**Browser test**: `http://localhost:3000/track/RC-HLSATG`
- Page loads without login
- FedEx-style 4-step progress bar renders
- Timeline shows chronological activity with icons
- Contact cards have clickable `tel:` links

---

## Scenario 6 — NPI-First Onboarding (New Provider)

**Personas**: New specialist signing up  
**Validates**: NPPES lookup, org + provider + user creation in one step

### Step 1 — Look up NPI
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/onboarding/npi/1750549473"
```

**Assert**: Returns `{ name: "FARHAN J BANGASH", specialty: "Nephrology", phone, address, fax, licenseState }`

### Step 2 — Claim (create account)
```powershell
$claim = @{
  npi       = "1750549473"
  email     = "newdr@test.com"
  password  = "Test1234!"
  firstName = "Farhan"
  lastName  = "Bangash"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3001/v1/onboarding/claim `
  -Method POST -ContentType "application/json" -Body $claim
```

**Assert**: Returns JWT + org + provider + user. NPI collision returns 409.

---

## Scenario 7 — EHR SMART on FHIR OAuth Flow

**Validates**: OAuth discovery, token exchange, EHR connection creation

### Step 1 — Initiate SMART launch
```powershell
$launch = @{
  fhirBaseUrl = "https://launch.smarthealthit.org/v/r4/fhir"
  ehrSystemId = "smart-sandbox"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri http://localhost:3001/v1/ehr/smart-launch `
  -Method POST -Headers $headers -Body $launch
# Returns authorizationUrl for redirect
```

**Assert**: `authorizationUrl` contains `response_type=code`, `client_id`, `state` (CSRF token), `code_challenge` (PKCE)

### Step 2 — Exchange code (after OAuth redirect)
```powershell
$exchange = @{
  code         = "<code-from-redirect>"
  state        = "<state-from-step-1>"
  fhirBaseUrl  = "https://launch.smarthealthit.org/v/r4/fhir"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3001/v1/ehr/exchange-token `
  -Method POST -Headers $headers -Body $exchange
```

**Assert**: EHRConnection in DB with `syncStatus = active` (if confidence ≥ 90) or `pending_review` (<90)

---

## Scenario 8 — Plan Limit Enforcement

**Validates**: STARTER tier blocks at 500 referrals/month, warns at 400

### Setup
Set org to STARTER tier:
```sql
UPDATE "Organization" SET "planTier" = 'STARTER' WHERE npi = '1234567890';
```

### Test warning header (at 80%)
Seed 400 referrals for the org, then create one more:
```powershell
$r = Invoke-RestMethod -Uri http://localhost:3001/v1/referrals -Method POST -Headers $headers -Body $body
# Check response headers:
# X-Plan-Warning: "You have used 401 of 500 referrals this month (80%). Upgrade to avoid interruption."
```

### Test hard block (at 100%)
With 500+ referrals in the month:
```powershell
$r = Invoke-RestMethod -Uri http://localhost:3001/v1/referrals -Method POST -Headers $headers -Body $body
# Expect 429 { "error": "Monthly referral limit reached for STARTER plan" }
```

---

## Scenario 9 — Admin: Test Data Lifecycle

**Validates**: Test org creation and clean teardown without touching seed data

### Create test org via onboarding
Any onboarding `POST /v1/onboarding/claim` creates an org with NPI format `{10digits}-org`

### List test orgs
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/admin/test-data/orgs" -Headers $adminHeaders
```

**Assert**: Only returns orgs with `-org` suffix NPI. Does NOT return Sunrise, Bay Area Cardiology, etc.

### Delete specific test org
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/admin/test-data/orgs/<id>" `
  -Method DELETE -Headers $adminHeaders
```

**Assert**: Cascades — deletes providers, users, referrals, notifications, audit logs for that org only.

### Reset seed (restore original seed data)
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/v1/admin/test-data/reset-seed" `
  -Method POST -Headers $adminHeaders -Body '{}'
```

**Assert**: The 7 seed orgs are intact; all test orgs removed.

---

## Scenario 10 — PAIA Denial Feedback Loop

**Validates**: Denial increments PolicyRule counters, which affects future PAIA scoring

### Check baseline
```powershell
$rules = Invoke-RestMethod -Uri "http://localhost:3001/v1/admin/policy-rules" -Headers $adminHeaders
# Find rule for cptCode = "27447", note denialCount + denialRateBaseline
```

### Trigger a denial via webhook (see Scenario 3)

### Check updated counters
```powershell
$rules = Invoke-RestMethod -Uri "http://localhost:3001/v1/admin/policy-rules" -Headers $adminHeaders
# denialCount should have incremented by 1
# denialRateBaseline should have recalculated
```

### Verify next PAIA picks up updated rate
Submit another referral with `procedureCodes = ["27447"]` — PAIA `denialProbability` should reflect the new empirical rate.

---

## Regression Checklist (run after any schema change)

- [ ] `GET /health` returns 200
- [ ] `GET /fhir/r4/metadata` returns FHIR CapabilityStatement
- [ ] `GET /docs` returns Swagger UI
- [ ] Login + JWT returned for all 7 seed orgs
- [ ] Create referral → `riskScore` populated (AI service running)
- [ ] Submit referral → PAIA decision logged to `PAIAAnalysis` table
- [ ] `trackingToken` generated on submit (`RC-` prefix, 6 chars, no 0/O/1/I)
- [ ] Public tracking returns 200 with valid token, 404 with invalid
- [ ] Sentinel run completes without errors (`alertsFired` in response)
- [ ] Admin endpoints require `SUPER_ADMIN` role (return 403 for PROVIDER role)
- [ ] Test org discriminator: seed NPIs protected, `-org` suffix NPIs deletable
