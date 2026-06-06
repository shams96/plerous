# Plerous — Project Status (single source of truth)

> **Read this first** at the start of any new conversation. The repo + git history
> is the real source of truth — not any single chat. This file reconciles "where
> we are" across sessions. Last updated: 2026-06-06.

## What Plerous is
Closed-loop **referral infrastructure** for independent healthcare (formerly
RefChain). A referral **state machine** with four external boundaries fronted by
**gateways**, plus reactive subsystems wired as **event subscribers**. Next.js 15
dashboard + Node/Fastify API, Postgres + Redis (BullMQ), Anthropic Claude agents,
FHIR R4 / Da Vinci PAS.

- **Code:** `C:\Users\New User\dev\plerous`  ·  **GitHub:** `shams96/plerous`
- **Run:** Docker (postgres :5433, redis :6380) → `apps/api` (`npm run dev`, :3001)
  + `apps/dashboard` (`npm run dev`, :3000) + `apps/payer-sim` (`node server.js`, :4010)
- **Live website:** `https://plerous.com` — deployed via Hostinger Deployments (zip upload)
- **Email:** `hello@plerous.com` — to be created in Hostinger hPanel → Emails

## Architecture (the mental model)
```
Identity(NPPES) → [ referral state machine ] → PayerGateway   (UHC/Availity/Optum)
                       │          │                DeliveryGateway (in_app/fax/secure-link)
                       │          │                IntakeGateway   (inbound fax)
                       └── domain event bus ──→ Intelligence (moat) · Growth (prospects) · Sentinel
```
One gateway per boundary (adapters per protocol, simulator-swappable). Reactive
subsystems subscribe to events — never wired into the core. **North star: every
referral makes the next one smarter** (event-sourced `ReferralEvent` → `ProviderStat`).

---

## Current State — ALL ON `main` (PRs #1–#3 merged), 39/39 tests green

---

## BACKEND — `apps/api/src/`

### Server (`src/server.js`)
- **Framework:** Fastify with `@fastify/helmet`, `@fastify/cors`, `@fastify/jwt`, `@fastify/rate-limit`
- **Rate limit:** 300 req/min, keyed by `x-api-key` or IP
- **CORS:** production locked to `app.plerous.com` / `www.plerous.com`; open in dev
- **Workers auto-started:** Sentinel + SLA on boot
- **Event subscribers:** Intelligence + Growth registered at startup via `events/subscribers.js`
- **Swagger:** mounted at `/docs`

### Middleware (`src/middleware/`)
| File | What it does |
|------|-------------|
| `auth.middleware.js` | JWT Bearer token OR `x-api-key` (SHA-256 hash lookup). Attaches `request.user` with id, email, role, providerId, organizationId |
| `error-handler.js` | `AppError` class + Fastify error hook → structured JSON errors |
| `hipaa-logger.js` | HIPAA audit log — every request with before/after state, actor, IP, timestamp, SHA-256 tamper-evident chain |
| `password-validator.js` | Strength rules (length, uppercase, digit, special char) |
| `plan-limits.js` | Enforces per-plan referral limits (Starter 500/mo, Professional 2000/mo) |

### Payer Gateway (`src/payers/`)
Routes by `Payer.apiType` to the correct adapter. Adding a new payer = new adapter + DB row, no gateway changes.

| Adapter | Protocol | Payer |
|---------|----------|-------|
| `fhir-pas.adapter.js` | FHIR R4 Da Vinci PAS (`Claim/$submit`) | Generic FHIR payers |
| `availity.adapter.js` | Availity REST API | Availity-connected payers |
| `x12-edi.adapter.js` | X12 278/275 EDI | EDI payers |
| `optum-graphql.adapter.js` | Proprietary GraphQL REST | UHC/Optum Medicare Advantage |
| `oauth-client.js` | OAuth2 `client_credentials` | Shared token manager for all adapters |

**Optum adapter** (`optum-graphql.adapter.js`) implements:
- `checkEligibility` — GraphQL query to pre-service eligibility endpoint
- `submitAuth` / `submitReferral` — GraphQL mutation to referral/PA endpoint
- `getAuthStatus` / `searchReferrals` / `searchPriorAuths` — status polling
- `submitAppeal` — appeal submission
- Header: `environment: sandbox` triggers mock mode (no subscription needed)

**UHC Payer DB row** (`tradingPartnerServiceId = UHC-MA-87726`):
- `apiType = 'optum_graphql'`
- `fhirBaseUrl = 'https://sandbox-apigw.optum.com'`
- `authEndpoint = 'https://sandbox-apigw.optum.com/apip/auth/v2/token'`
- `clientId` / `clientSecret` — in `apps/api/.env` as `UHC_CLIENT_ID` / `UHC_CLIENT_SECRET`

**Sandbox blocker:** credentials return `{"error":"invalid_client"}` — not yet provisioned
on Optum's backend. Email `marketplacesupport@optum.com`. Re-run `docs/optum-sandbox-test.sh`
when resolved (pass creds as env vars, not hardcoded).

### Agents (`src/agents/`)
| Agent | Purpose |
|-------|---------|
| `paia.agent.js` | 4-check pre-auth intelligence (coverage, documentation, diagnosis match, PA required). Auto-submit ≥85%, human window for flags, hard stop on missing docs |
| `sentinel.agent.js` | 24/7 referral monitor — detects stalls, alerts, auto-recovers |
| `recovery.agent.js` | Rescues referrals stuck in specialist acknowledgment |
| `brief.agent.js` | Morning coordinator summary — stalls, SLA alerts, priorities |
| `founder-brief.agent.js` | Daily revenue, growth, churn signals |
| `revenue-recovery.agent.js` | Surfaces revenue leaking from unscheduled referrals |
| `scheduling.agent.js` | Closes loop from auth approval to booked appointment |
| `prospect.agent.js` | NPI-researches prospects before outreach |
| `relationship.agent.js` | Tracks referring relationship strength over time |
| `care-gap.agent.js` | Identifies patients with unaddressed care gaps |
| `engagement.agent.js` | Engagement tracking |
| `asset.agent.js` | Asset management |

**PAIA checks** (`src/agents/paia/checks/`):
- `coverage.check.js` — eligibility + PA required for CPT+payer combination
- `documentation.check.js` — reads clinical notes, extracts ESS/AHI/STOP-BANG/step therapy
- `procedure-diagnosis.check.js` — verifies ICD-10 codes support the procedure
- `pa-required.check.js` — determines if PA is required

**PAIA policy rules** (`src/agents/paia/rules/`):
- `bcbs-tx.rules.js`, `uhc-tx.rules.js` — payer-specific denial intel
- `default.rules.js` — universal defaults
- `policy-rule-store.js` — live-editable cache (Redis-backed, refreshes instantly)

### EHR Integration (`src/ehr/`)
10 EHR profiles — all with SMART on FHIR OAuth + PKCE:
`epic`, `cerner`, `tebra`, `drchrono`, `eclinicalworks`, `elation`, `modmed`, `nextgen`, `practicefusion`, `athenahealth`

### Delivery Gateway (`src/delivery/`)
- `in-app.adapter.js` — in-app notification channel
- `fax.adapter.js` — fax transmit (**transmit-proof only** — no MDN/confirmed receipt until real fax provider wired: Phaxio/Documo/Twilio Fax)
- Secure-link delivery — tested and confirmed receipt ✅

### Intake Gateway (`src/intake/`)
- `intake-gateway.js` — inbound fax processing

### Event Bus (`src/events/`)
- `bus.js` — BullMQ-backed durable domain events (inline mode for tests)
- `subscribers.js` — registers Intelligence + Growth event subscribers

### Intelligence & Growth (`src/intelligence/`, `src/growth/`)
- `intelligence.subscriber.js` — `ReferralEvent` → `ProviderStat` rollups (the moat)
- `growth.subscriber.js` — off-network prospect generation from referral events

### Workers (`src/workers/`)
| Worker | Schedule | Purpose |
|--------|----------|---------|
| `sentinel.worker.js` | Every 15 min | Stale draft detection, SLA alerts, expiring auth alerts, stuck PA recovery |
| `sla.worker.js` | Continuous | SLA deadline tracking |
| `auth-poller.worker.js` | On demand | Polls payer for async PA status updates |
| `notify.worker.js` | Event-driven | SMS + email notification dispatch |

### FHIR (`src/fhir/`)
- `davinci-pas.js` — Da Vinci PAS bundle builder (functional, not X12-certified)

### Modules (API routes)
| Module | Routes |
|--------|--------|
| `referrals` | CRUD referrals, state machine transitions, human window |
| `auth` | Prior auth submit/status/webhook (HMAC verified) |
| `session` | Login, JWT refresh, logout |
| `mfa` | TOTP enroll, 2FA login, backup codes |
| `patients` | Patient CRUD |
| `providers` | Provider CRUD + NPI lookup |
| `onboarding` | NPI-first onboarding (NPPES auto-fill) |
| `ehr` | EHR connect OAuth callback |
| `intake` | Inbound fax intake |
| `notifications` | SMS + email |
| `ai` | AI routes + training loop |
| `agents/brief` | Coordinator + Founder brief endpoints |
| `admin` | Org management, audit log, PAIA rules, referral admin |

---

## FRONTEND — `apps/dashboard/src/`

### Public Pages
| Route | File | Status |
|-------|------|--------|
| `/` | `app/page.tsx` | Landing page — fully built, live at plerous.com |
| `/login` | `app/login/page.tsx` | Login form |
| `/onboarding` | `app/onboarding/page.tsx` | NPI-first onboarding wizard |
| `/privacy` | `app/privacy/page.tsx` | HIPAA-compliant privacy policy |
| `/terms` | `app/terms/page.tsx` | Terms of Service (BAA reference, HIPAA) |
| `/track/[token]` | `app/track/[token]/page.tsx` | Secure referral tracking link |
| `/ehr/callback` | `app/ehr/callback/page.tsx` | EHR OAuth callback handler |
| `/sitemap.xml` | `app/sitemap.ts` | Auto-generated sitemap |

### Dashboard Pages (behind auth, `/referrals` redirect if logged in)
| Route | File |
|-------|------|
| `/referrals` | `app/(dashboard)/referrals/page.tsx` |
| `/referrals/new` | `app/(dashboard)/referrals/new/page.tsx` |
| `/referrals/[id]` | `app/(dashboard)/referrals/[id]/page.tsx` |
| `/patients` | `app/(dashboard)/patients/page.tsx` |
| `/providers` | `app/(dashboard)/providers/page.tsx` |
| `/authorizations` | `app/(dashboard)/authorizations/page.tsx` |
| `/paia` | `app/(dashboard)/paia/page.tsx` |
| `/ehr` | `app/(dashboard)/ehr/page.tsx` |
| `/analytics` | `app/(dashboard)/analytics/page.tsx` |

### Admin Pages
| Route | File |
|-------|------|
| `/admin` | `app/admin/page.tsx` |
| `/admin/audit` | `app/admin/audit/page.tsx` |
| `/admin/orgs` | `app/admin/orgs/page.tsx` |
| `/admin/paia` | `app/admin/paia/page.tsx` |
| `/admin/referrals` | `app/admin/referrals/page.tsx` |
| `/admin/rules` | `app/admin/rules/page.tsx` |

### Components
| Component | Purpose |
|-----------|---------|
| `AppNav.tsx` | Shared dark nav — all dashboard pages |
| `PAIAPanel.tsx` | PAIA 4-check results display |
| `HumanWindow.tsx` | Human review window for PAIA flags |
| `AuthPanel.tsx` | Prior auth status panel |
| `AppealPanel.tsx` | Denial appeal generation UI |
| `ReviewQueuePanel.tsx` | PAIA review queue |
| `SubmitReferralButton.tsx` | Submit with PAIA pre-check gate |
| `DailyBrief.tsx` | Coordinator morning brief display |
| `EHRConnectForm.tsx` | EHR OAuth connect form |
| `LeakageCalculator.tsx` | Revenue leakage calculator (landing) |
| `LeakageChart.tsx` | Chart for leakage calculator |
| `StatusBadge.tsx` | Referral status badge |
| `Term.tsx` | Glossary tooltip (FHIR R4, CMS-0057, etc.) |
| `ThemeToggle.tsx` | Light/dark mode toggle |
| `ThemeProvider.tsx` | Theme context |
| `LandingClient.tsx` | Client-side landing animations |

### Next.js Config (`next.config.ts`)
- `output: 'standalone'` — bundles server + deps for deployment
- Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- API proxy rewrite: `/api/proxy/*` → `NEXT_PUBLIC_API_URL`
- `poweredByHeader: false`, `compress: true`

### Public Assets (`public/`)
- `og-image.png` (1200×630), `favicon-32.png`, `apple-touch-icon.png` (180×180)
- `favicon.svg`, `robots.txt`, `site.webmanifest`
- `robots.txt` blocks: `/api/`, `/admin/`, `/referrals`, `/patients`, `/providers`, `/authorizations`, `/analytics`, `/ehr`, `/paia`

---

## PAYER SIMULATOR — `apps/payer-sim/`
- `server.js` — single-file Express server on `:4010`
- Mimics Optum/FHIR endpoints with deterministic mock responses
- Swap to real sandbox: update `Payer` DB row URLs (config only, no code change)

---

## DEPLOYMENT

### Live Website (`plerous.com`)
- **Host:** Hostinger (zip deployment via Deployments panel)
- **Deployed:** 2026-06-06 16:16 UTC — Status: Completed/Current
- **Zip:** `plerous-deploy.zip` — Next.js source, built by Hostinger (Framework: Next.js, Node 22.x)
- **Email:** `hello@plerous.com` — **pending creation** in hPanel → Emails → Create Account

### API Backend (not yet deployed)
- Runs locally at `:3001` — needs VPS deployment for full dashboard functionality
- Requires: Postgres, Redis, all env vars from `apps/api/.env`

---

## HONESTY GUARDRAIL (never market ahead of a green test)
- **Fax delivery:** transmit-proof only — confirmed receipt requires real fax provider (Phaxio/Documo/Twilio Fax) — NOT YET WIRED
- **Secure-link receipt:** confirmed ✅ (tested)
- **FHIR/payer receipt:** confirmed ✅ (tested)
- **X12 278/275:** functional, not certified
- **Optum sandbox:** `invalid_client` — credentials not yet active (see below)
- **Da Vinci PAS:** table stakes, not the moat — moat = cross-silo referral outcome graph

---

## OPTUM SANDBOX BLOCKER (active)

**Status:** `{"error":"invalid_client"}` on all auth attempts — credentials not provisioned yet.

**Credentials:**
- Client ID: `57029bbc-efff-4b6d-888d-9cf78d12f97d`
- Client Secret: in `apps/api/.env` as `UHC_CLIENT_SECRET`
- Token URL: `https://sandbox-apigw.optum.com/apip/auth/v2/token`
- Eligibility: `https://sandbox-apigw.optum.com/oihub/eligibility/v1/pre-service/member`
- Prior Auth/Referral: `https://sandbox-apigw.optum.com/oihub/patient/auth/referral/v1`

**Action required:** Email `marketplacesupport@optum.com`:
- State: Client ID, both API names, error received
- Request: confirm credentials provisioned and active for sandbox

**Validate with:**
```bash
UHC_CLIENT_ID=57029bbc-efff-4b6d-888d-9cf78d12f97d \
UHC_CLIENT_SECRET=<from .env> \
bash docs/optum-sandbox-test.sh
```
Scenarios to pass: Scenario 5 (eligibility) + Scenario 2 (referral/approve).

**Protocol confirmed:** Optum is proprietary GraphQL REST — NOT FHIR Da Vinci PAS.
Adapter built: `apps/api/src/payers/adapters/optum-graphql.adapter.js`

---

## VERIFIED (✅ = built + automated test) — 39 tests, 10 files
Payer loop (approve/deny/poll/signed-webhook/eligibility/denial-feedback/expiry),
webhook HMAC, secure-link receipt, DeliveryGateway channel selection, off-network →
Prospect growth loop, inbound-fax intake, Intelligence ProviderStat rollups,
MFA full HTTP flow + backup codes, password-strength rules.
**Full suite: 26/26 across 8 files; CI `e2e` job green.**

---

## NOT BUILT YET (deliberate backlog)
1. Module 5 — `referral.at_risk` event + **predictive Sentinel**
2. Module 6 — **positive loop-back** to the referrer (received/scheduled/completed)
3. Benchmarking **read-API/dashboard** over `ProviderStat` (the moat surface)
4. Real **fax provider** (Phaxio/Documo/Twilio Fax) + **Direct MDN** + **EHR FHIR Task** receipt
5. **X12 278/275 certification** (generator is functional, not certified)
6. Real **migrations** (currently `db push`; migrations gitignored — debt for first deploy)
7. Onboarding/PAIA-branch E2E tests
8. **API backend deployment** — VPS needed for full dashboard
9. `hello@plerous.com` email account creation in Hostinger hPanel
10. Optum staging (requires paid subscription in Optum AI Marketplace)

---

## KEY DECISIONS LOG
- Gateway-per-boundary + adapters + simulator (swap endpoint via config, not code)
- Reactive subsystems (Intelligence, Growth) as event subscribers
- BullMQ-backed durable domain events (inline mode for deterministic tests)
- The moat = event-sourced cross-silo **referral outcome graph**; FHIR is table stakes
- Reuse `PolicyRule` for payer denial intel; `ProviderStat` adds specialist performance
- Optum apiType = `optum_graphql` (not `fhir_r4`) — confirmed from their Technical Reference Guide

---

## HOW TO RESUME IN A NEW CONVERSATION
1. Read this file
2. `git log --oneline -15` and check open PRs (`shams96/plerous`)
3. `git status` / current branch
4. Pick up from "Not built yet" or the active blocker above
