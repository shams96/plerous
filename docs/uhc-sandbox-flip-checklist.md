# UHC Sandbox Flip Checklist (Wednesday)

Switching the payer path from the **simulator** to the **real UHC sandbox** is a
config/data change — **no code change**. This is the proof that the pipeline is
production-real. Work top to bottom.

---

## 0. Before the meeting — what to get from UHC
Ask explicitly (see also `docs/payer-integration-and-simulator.md` §5):

- [ ] **Protocol:** FHIR Da Vinci PAS (`Claim/$submit`)? X12 278? proprietary REST?
      → determines `Payer.apiType` (`fhir_r4` | `edi_x12` | `availity`).
- [ ] **OAuth:** token URL, `client_id`, `client_secret`, scopes, mTLS?
- [ ] **FHIR base URL** (or EDI endpoint).
- [ ] **Async model:** webhook callbacks (and how signed?) or poll-only? status values.
- [ ] **Eligibility:** FHIR `CoverageEligibilityRequest` or X12 270/271?
- [ ] **Sandbox test data:** member IDs that deterministically approve / deny / pend.
- [ ] Rate limits / companion guide (if EDI).

---

## 1. The flip (config + data only)

The seed already has a UHC payer row (`tradingPartnerServiceId = UHC-MA-87726`,
`apiType = fhir_r4`, sandbox URLs). Fill in real credentials + confirm URLs.

```sql
UPDATE "Payer" SET
  "fhirBaseUrl"  = '<uhc sandbox FHIR base, e.g. https://sandbox.apis.uhc.com/fhir/r4>',
  "authEndpoint" = '<uhc token URL,        e.g. https://sandbox.apis.uhc.com/oauth/token>',
  "clientId"     = '<client id>',
  "clientSecret" = '<client secret>',
  "apiType"      = 'fhir_r4'
WHERE "tradingPartnerServiceId" = 'UHC-MA-87726';
```

- [ ] If they require **scopes**, set `Payer.scope`.
- [ ] If async, set `PAYER_WEBHOOK_SECRET` (env) to whatever they sign with, and
      give them our webhook URL: `https://<api-host>/v1/auth/webhook/uhc`.
      (Our `normalizeStatus` already maps UHC status codes.)
- [ ] No code edits. The gateway/adapter routes by `apiType` automatically.

---

## 2. Validate against the real sandbox

Use a patient whose `insuranceMemberId` is a **UHC sandbox member ID** and whose
`primaryInsurance` payer is the UHC row above.

- [ ] **Scenario 2 — submit/approve:** create a referral requiring PA → submit →
      confirm `PriorAuthorization.status` and `Referral.status` reach
      `APPROVED`/`AUTH_APPROVED` (sync) **or** flip via poll/webhook (async).
- [ ] **Scenario 5 — eligibility:** `POST /v1/auth/validate { memberId, payerId }`
      → returns real coverage.
- [ ] **Deny path** (if they have a deny member ID): → `AUTH_DENIED` + reason.
- [ ] Watch the API console for the real OAuth token fetch + `Claim/$submit` call.

Quick check that the token + endpoint work at all:
```bash
# OAuth round-trip (substitute real values)
curl -s -X POST '<authEndpoint>' \
  -d 'grant_type=client_credentials' -d 'client_id=<id>' -d 'client_secret=<secret>'
```

---

## 3. Go / No-Go

- ✅ **GO** if scenario 2 + 5 pass against the sandbox → the code path is
  production-real; only data/creds differed from the simulator.
- ⚠️ **PARTIAL** if auth works but payload/response shape differs → capture the
  diff (below); the fix is localized to `src/payers/adapters/fhir-pas.adapter.js`
  (parsing) or `src/fhir/davinci-pas.js` (bundle), nothing structural.
- ❌ **NO-GO / different protocol** if they're X12-only or proprietary → route via
  `apiType = edi_x12` (x12 adapter exists, needs their companion guide) or build a
  thin adapter behind the same gateway. Core unchanged.

---

## 4. Capture divergences (fill in live)

| Aspect | Our assumption (sim) | UHC actual | Adapter change needed |
|--------|----------------------|------------|----------------------|
| OAuth grant/scopes | client_credentials | | |
| Submit endpoint | `Claim/$submit` | | |
| Response shape | `ClaimResponse.outcome` | | |
| Async model | webhook/poll | | |
| Status values | APPROVED/DENIED/queued | | |
| Eligibility | CoverageEligibilityResponse | | |

---

## 5. Rollback (instant)
Point the payer row back at the simulator — the E2E suite goes green again,
proving nothing else regressed:
```sql
UPDATE "Payer" SET "fhirBaseUrl"='http://localhost:4010/fhir/r4',
  "authEndpoint"='http://localhost:4010/oauth/token', "clientId"=NULL, "clientSecret"=NULL
WHERE "tradingPartnerServiceId" = 'UHC-MA-87726';
```

---

## 6. Talking points for the room
- "We're FHIR Da Vinci PAS native; flipping to your sandbox is a config change,
  not an integration project — here's our gateway hitting a simulator that speaks
  your protocol, and here's the same code against your sandbox."
- "Our moat is the cross-payer, cross-EHR **referral outcome graph** for
  independent practices — FHIR/PAS is how we connect, not why we win."
- Keep claims to what the green E2E suite demonstrates.
