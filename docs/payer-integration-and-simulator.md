# Payer Integration, the Partner Simulator, and the Gaps to Fill

**Audience:** Plerous engineering + the UnitedHealthcare / Availity conversations.
**Status as of:** initial gateway build-out (branch `feature/e2e-payer-pipeline`).
**One-line summary:** The prior-auth pipeline is now *real code end-to-end* — it makes genuine OAuth + FHIR HTTP calls — but those calls currently terminate at a **simulator we control** instead of a live payer, because we don't yet have UHC/Availity sandbox credentials. The simulator lets us verify ~80% of the loop today; the remaining ~20% is the literal partner endpoint plus a few channel features.

---

## 1. The architecture (one seam, swappable endpoint)

```
Plerous API ─> PayerGateway ─> adapter (fhir_pas | availity | x12_edi) ─HTTP─> [ Partner Simulator ]   ← today
                                                                              └─> [ UHC / Availity sandbox ] ← Wednesday+
        ▲                                                                                   │
        └──────────── webhook  POST /v1/auth/webhook/:payer  (HMAC-signed) ◀────────────────┘
```

The key design decision: **the code path is identical whether we hit the simulator or a real payer.** Only `Payer.fhirBaseUrl`, `Payer.authEndpoint`, and credentials change. Switching to the UHC sandbox is a **database/config change, not a code change.**

### Files (all real, on the feature branch)
| Concern | File |
|---|---|
| Single entry seam, picks adapter by `Payer.apiType` | `apps/api/src/payers/payer-gateway.js` |
| OAuth2 client-credentials token fetch + Redis cache | `apps/api/src/payers/oauth-client.js` |
| FHIR Da Vinci PAS adapter (submit / poll / eligibility / appeal) | `apps/api/src/payers/adapters/fhir-pas.adapter.js` |
| Availity adapter (delegates to FHIR PAS; seam for their auth/envelope) | `apps/api/src/payers/adapters/availity.adapter.js` |
| X12 278 EDI adapter (functional, not certified) | `apps/api/src/payers/adapters/x12-edi.adapter.js` |
| Submission + decision application + appeals | `apps/api/src/modules/auth/auth.service.js` |
| Status polling worker (now calls the payer) | `apps/api/src/workers/auth-poller.worker.js` |
| Inbound webhook + HMAC verification | `apps/api/src/modules/auth/auth.routes.js` |

---

## 2. What the simulator IS (and is NOT)

**Location:** `apps/payer-sim/` — a zero-dependency Node service (`server.js`, default port **4010**).

**It is:** a stand-in for a payer / clearinghouse (UHC, Availity) that speaks the same wire protocol we'll use in production, so we can exercise the full Plerous pipeline — submit → decision → status poll → async webhook → eligibility — **without waiting on partner credentials or risking real PHI in a sandbox.** It is the "other side of the loop" made controllable and deterministic.

**It is NOT:** a real payer, a certified FHIR server, or proof that UHC/Availity will behave identically. It implements the **standard** (Da Vinci PAS) and our **assumptions**; real sandboxes will differ in auth quirks, payload edge cases, error shapes, and timing. The simulator de-risks our side of the integration; it does not validate theirs.

### Endpoints it implements
| Endpoint | Purpose |
|---|---|
| `POST /oauth/token` | OAuth2 client-credentials → bearer token |
| `POST /fhir/r4/Claim/$submit` | Da Vinci PAS prior-auth submission → `ClaimResponse` |
| `GET /fhir/r4/ClaimResponse?identifier=…` | Status polling for pended auths |
| `POST /fhir/r4/CoverageEligibilityRequest/$submit` | Eligibility check → `CoverageEligibilityResponse` |
| `POST /edi/278` | X12 278 fallback path |
| `GET /health` | Liveness |

### Deterministic scenarios (keyed by patient insurance member ID)
| Member ID prefix | Behavior |
|---|---|
| `APPROVE*` | Approved synchronously |
| `DENY*` | Denied synchronously (with reason) |
| `PENDWEBHOOK*` | Returns "queued", then approves via async **signed webhook** callback |
| `PENDPOLL*` | Returns "queued", then approves on a later **status poll** |
| `INELIGIBLE*` | Eligibility returns not-covered |
| (anything else) | Approved synchronously |

This lets automated tests force any path precisely.

---

## 3. What is REAL now vs SIMULATED

### ✅ Real (production-grade code, verified against the simulator)
- OAuth2 client-credentials token acquisition + Redis caching (`oauth-client.js`).
- FHIR Da Vinci PAS **Claim bundle** construction (pre-existing `fhir/davinci-pas.js`) and submission over HTTP.
- Parsing `ClaimResponse` → approve / deny / partial / pending.
- **Synchronous decisions** applied immediately to the auth + referral, with patient SMS + denial-feedback learning.
- **Asynchronous decisions** via (a) status polling worker and (b) inbound webhook — both funnel through one `_applyDecision()` so all paths behave identically.
- **Webhook HMAC signature verification** (`X-Plerous-Signature`, constant-time compare).
- Eligibility check via `CoverageEligibilityRequest`.
- Appeal submission seam (`submitAppeal`).
- Adapter routing by `Payer.apiType` (FHIR / Availity / X12).

### 🟡 Simulated / pointed at the sim (real code, fake counterparty)
- The actual **UHC** endpoint — `Payer.fhirBaseUrl` currently points at the sim. **Gap: real UHC sandbox base URL + creds + their exact auth flow.**
- The actual **Availity** endpoint — adapter delegates to FHIR PAS. **Gap: Availity's real OAuth host, `x-availity-customer-id` header, and submission envelope if it diverges from plain FHIR `$submit`.**
- Eligibility benefit detail (copay/deductible/OOP) — sim returns coverage flags only; real 271 has richer detail we don't yet parse.

### ✅ Now closed (built on this branch, verified by the E2E suite)
- **Specialist secure-link "confirmed receipt"** — `POST /v1/referrals/track/:token/acknowledge` (public, no login) flips `SUBMITTED → RECEIVED`, stamps `acknowledgedAt`/`deliveredAt`, notifies the patient. Idempotent. Makes "confirmed receipt" honest for the fax/secure-link channel. (tests: `delivery.e2e.test.js`)
- **Automated SLA / expiry transitions** — `src/workers/sla.worker.js` (hourly) flips lapsed `APPROVED` auths to `EXPIRED` and the referral with them, unless already SCHEDULED/COMPLETED. (tests: `sla.e2e.test.js`)
- **Automated E2E test suite** — Vitest, 14 scenarios green: sync approve/deny, poll, signed webhook, eligibility, denial-feedback, secure-link receipt, SLA expiry, webhook HMAC (reject/accept). Runs in CI against postgres+redis with the simulator auto-booted.

### ❌ Still stub / missing (remaining gaps)
1. **Real partner credentials & endpoints** — UHC sandbox (Wed) and Availity. Highest priority; everything else is ready for them.
2. **Availity-specific adapter** — auth host, customer-id header, and any non-FHIR envelope. Seam exists, body is TODO until we have their docs.
3. **X12 278/275 full compliance** — current generator is structurally valid but NOT certified (no HIPAA companion-guide validation, no 275 attachments, no SNIP levels). Fine for the EDI fallback path against the sim; needs a real X12 library + payer companion guides for production EDI.
4. **270/271 eligibility over X12** — not implemented (FHIR eligibility only).
5. **Direct Secure Messaging (MDN) + EHR FHIR `Task` polling** — the other two "confirmed receipt" channels beyond the secure link.
6. **`validDiagnoses` enforcement** — procedure↔diagnosis check is advisory; the allowed-diagnosis list isn't persisted to `PolicyRule` yet.
7. **Webhook raw-body for arbitrary payers** — we verify HMAC over re-serialized JSON, which is deterministic for our simulator; real payers signing raw bytes need a raw-body capture (noted in `auth.routes.js`).

---

## 4. How to flip from simulator to a real sandbox (Wednesday)

1. Obtain from the partner: **token URL**, **client ID/secret**, **FHIR base URL** (or EDI endpoint), and their **member IDs / test patients**.
2. Update the payer row (no code change):
   ```sql
   UPDATE "Payer"
   SET "fhirBaseUrl" = '<uhc sandbox fhir base>',
       "authEndpoint" = '<uhc token url>',
       "clientId" = '<id>', "clientSecret" = '<secret>',
       "apiType" = 'fhir_r4'
   WHERE "name" = 'UnitedHealthcare Medicare Advantage';
   ```
3. Re-run E2E scenarios 2 (sync approve) and 5 (eligibility) against the real sandbox member IDs. If they pass, the code path is production-real.
4. Capture any divergences (auth quirks, payload shape, error codes) → fill the relevant adapter.

---

## 5. Questions to bring to the UHC / Availity meetings

- Do they expose **FHIR Da Vinci PAS** (`Claim/$submit`), **X12 278**, or a proprietary REST API? (Determines `apiType`.)
- **OAuth**: client-credentials? token URL? scopes? mTLS required?
- **Async model**: webhook callbacks (and how do they sign them?) or poll-only? What status codes/values?
- **Eligibility**: FHIR `CoverageEligibilityRequest` or X12 270/271?
- **Sandbox test data**: which member IDs deterministically approve / deny / pend?
- **Rate limits, SLAs, companion guides** for EDI if applicable.

---

## 6. Honesty guardrail

No claim ("confirmed receipt", "closes the loop") ships to the marketing site ahead of a **green E2E test** that proves it against the simulator, and ideally a smoke test against the real sandbox. The simulator is how we keep the brand honest: if the test can't make the loop close, the website can't say it does.
