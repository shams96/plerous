You're right. Here it is as one clean block:

---

```markdown
# PLEROUS — CLAUDE.md

## READ THIS FIRST — EVERY SESSION
1. Run `git status` and `git log --oneline -5` before touching anything
2. Read `docs/STATUS.md` — single source of truth
3. Identify current branch and what's in progress
4. Only then proceed

This is an EXISTING, mostly-built codebase. Never treat as greenfield. Never scaffold over what exists. Read first, plan second, build third.

## WHAT PLEROUS IS
Closed-loop referral infrastructure for independent healthcare. Formerly RefChain. Catches every referral, chases every specialist, confirms every authorization. Target: independent practices, physician groups, imaging centers, surgical facilities. Compliance: FHIR R4, HIPAA, CMS-0057-F mandate (Jan 2027). GitHub: shams96/plerous. Local: C:\Users\New User\dev\plerous

## TECH STACK
Frontend: Next.js 15 (App Router), React 19, Tailwind CSS v4
Backend: Node.js + Fastify, Prisma ORM, PostgreSQL (:5433), Redis/BullMQ (:6380)
AI: Anthropic Claude API (10 agents)
Standards: FHIR R4, SMART on FHIR (OAuth + PKCE), Da Vinci PAS
Infra: Docker Compose, Turbo monorepo
Testing: Vitest (global-setup auto-boots payer-sim + webhook API)
Clearinghouse: Availity (OAuth 2.0 — sandbox active, production pending)
Brand: Amethyst #5C2D8E + Amber #E8941A

## MONOREPO
apps/api — Node.js + Fastify, src/{payers,delivery,intake,events,intelligence,growth,agents,modules}
apps/dashboard — Next.js 15, landing, onboarding, referral + auth
apps/payer-sim — payer + fax simulator (:4010)
docs/STATUS.md — READ FIRST every session
docs/payer-integration-and-simulator.md
docs/end-to-end-referral-scenarios.md — 4 network quadrants
docs/manual-test-guide.md
docs/uhc-sandbox-flip-checklist.md
packages/ — shared workspace packages

## DEV RUN SEQUENCE
docker compose up -d                 # Postgres :5433, Redis :6380
cd apps/api && npm run dev           # API :3001
cd apps/dashboard && npm run dev     # Dashboard :3000
cd apps/payer-sim && node server.js  # Payer sim :4010
cd apps/api && npm test              # Vitest

## ARCHITECTURE
Referral state machine fronted by gateways: PayerGateway (payer adapter, sim-swappable, Availity-backed in production), DeliveryGateway, IntakeGateway. Reactive subsystems as event-bus subscribers: Intelligence (AI moat, Claude API), Growth (prospect/relationship). RULE: Never wire reactive logic into core flow. Emit domain event → subscribe. API modules: src/{payers,delivery,intake,events,intelligence,growth,agents,modules}

## REFERRAL STATE MACHINE
DRAFT → SUBMITTED → ELIGIBILITY_CHECK → ELIGIBLE → AUTH_REQUIRED → AUTH_SUBMITTED → AUTHORIZED → SCHEDULED → COMPLETED
Failure states: INELIGIBLE → Recovery Agent | AUTH_DENIED → Recovery Agent → APPEAL_SUBMITTED → AUTHORIZED/REJECTED | STALLED → Sentinel Agent → resumes or ESCALATED | CANCELLED
Rules: every transition emits domain event (immutable event log), no direct DB state mutation — all changes via state machine service only, ReferralEvent table is append-only, no updates, no deletes.

## AVAILITY INTEGRATION
Status: active vendor relationship, meeting completed, sandbox credentials active.
Architecture: Plerous State Machine → PayerGateway → AvailityClient (behind AVAILITY_ENABLED feature flag) → Availity API: Eligibility/Benefits (270/271), Prior Authorization (278 + Da Vinci PAS), Claim Status (276/277).
Transaction sequence: REFERRAL_CREATED → [Availity] Eligibility (270/271) → ELIGIBLE → [PAIA] Screen for auth gaps → [Availity] Prior auth (278/Da Vinci PAS) → AUTHORIZED → [Scheduling Agent] Book → [Availity] Claim status (276/277) → COMPLETED or DENIED → Recovery Agent.
Non-negotiable on every Availity call: (1) idempotency key, (2) exponential backoff + jitter max 3 retries + dead letter queue, (3) Redis token caching TTL = expires_in minus 60s, (4) HIPAA audit log with timestamp/type/NPI/payer ID/hash only — NO PHI values, (5) AVAILITY_ENABLED feature flag — false falls back to payer-sim no deploy needed, (6) rollback path documented before every merge.
OAuth: Client Credentials grant, token endpoint https://api.availity.com/availity/v1/token, Redis key availity:token:{clientId}. Never store token in DB. Never log token value.

## THE 10 AGENTS
PAIA — pre-auth intelligence, screens for denial gaps before submission
Sentinel — 24/7 monitor, auto-recovers stalled referrals
Recovery — rescues referrals stuck in specialist acknowledgment
Revenue Recovery — surfaces revenue leaking from unscheduled referrals
Scheduling — closes loop from auth approval to booked appointment
Prospect — growth intelligence
Relationship — retention intelligence
Care Gap — care gap identification
Brief — operational brief generation
Founder Brief — executive summary for Shams

## PHASE 0 — DISCOVERY PROTOCOL
Run before any code change. Report back. Do not modify anything.
git pull && git status && git log --oneline -20 && git branch -a
Read apps/api/prisma/schema.prisma — list every model, enum, relation, show referral status enum
npx prisma migrate status — list applied migrations, identify drift
For each module (referrals, auth, fhir/r4, ai, notify) classify as implemented / stubbed / missing
Check .github/workflows/ for CI config, run cd apps/api && npm test, report pass/fail
Report back: git state, schema, migration state, module map, CI status, blockers. Nothing else.

## INTEGRATION PHASE SEQUENCE
Each phase = own branch + PR. Pause for Shams review before proceeding.
Phase 0 — Discovery, git/schema/migrations/module map/CI — report only, zero code changes — CURRENT STATUS: NOT YET RUN, START HERE
Phase 1 — State machine, reconcile schema, propose additive migration — show plan before migrating
Phase 2 — Tenant scoping, confirm PHI models, add tenantId where missing additive — review before migrating
Phase 3 — Data export, FHIR R4 bulk NDJSON + CSV/JSON fallback — PR review
Phase 4 — Onboarding, tenant provisioning, API keys, BAA record — PR review
Phase 5 — Offboarding, export + deletion/de-id + audit proof — PR review
Phase 6 — Availity client, OAuth/token cache/retry/idempotency/audit/flag, sandbox only — PR review
Phase 7 — Wire eligibility → prior auth → claim status into state machine — PR review
Phase 8 — E2E sandbox test, one referral, all state transitions visible — demo to Shams

## WORKING DISCIPLINE
NOT greenfield — read before writing. STATUS.md every session. Modular — one module → wire → test green → commit. Plan first — propose before building. Additive schema only — never edit applied migrations, expand/contract for renames. Feature branches — PR + CI green before merge, main protected. Reuse before rebuild. No secrets committed — .env.example only, synthetic seed data only. HIPAA proactive — flag before being asked. Rollback path documented before every merge.

## MULTI-TENANCY AND PHI
Every PHI model carries tenantId — confirm in Phase 0, add where missing additive only. All queries filter by tenant — zero cross-tenant access. BAA record required before any PHI processed for a tenant. No PHI values in any log — hashes and metadata only. Provider owns their data — full FHIR R4 bulk export available on request.

## ENVIRONMENT VARIABLES — NEVER COMMIT — .env.example ONLY
ANTHROPIC_API_KEY — Claude API, all 10 agents
DATABASE_URL — PostgreSQL connection string
JWT_SECRET — auth token signing min 32 chars
ENCRYPTION_KEY — HIPAA field encryption 64 hex chars
REDIS_URL — queue/worker backend
AVAILITY_CLIENT_ID — Availity OAuth client ID sandbox
AVAILITY_CLIENT_SECRET — Availity OAuth secret sandbox
AVAILITY_ENABLED — feature flag true/false
AVAILITY_BASE_URL — https://api.availity.com/availity/v1

## OPERATOR CONTEXT
Owner: Shams Islam, CEO 1HubSolutions LLC. Style: direct, fast, outputs not questions, typos are features. Constraint: free/open-source only. HIPAA: non-negotiable, flag proactively. Deadline: CMS-0057-F January 2027.
