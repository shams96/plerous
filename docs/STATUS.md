# Plerous — Project Status (single source of truth)

> **Read this first** at the start of any new conversation. The repo + git history
> is the real source of truth — not any single chat. This file reconciles "where
> we are" across sessions. Last updated: 2026-06-02.

## What Plerous is
Closed-loop **referral infrastructure** for independent healthcare (formerly
RefChain). A referral **state machine** with four external boundaries fronted by
**gateways**, plus reactive subsystems wired as **event subscribers**. Next.js 15
dashboard + Node/Fastify API, Postgres + Redis (BullMQ), Anthropic Claude agents,
FHIR R4 / Da Vinci PAS.

- **Code:** `C:\Users\New User\dev\plerous`  ·  **GitHub:** `shams96/plerous`
- **Run:** Docker (postgres :5433, redis :6380) → `apps/api` (`npm run dev`, :3001)
  + `apps/dashboard` (`npm run dev`, :3000) + `apps/payer-sim` (`node server.js`, :4010)

## Architecture (the mental model)
```
Identity(NPPES) → [ referral state machine ] → PayerGateway   (UHC/Availity)
                       │          │                DeliveryGateway (in_app/fax/secure-link)
                       │          │                IntakeGateway   (inbound fax)
                       └── domain event bus ──→ Intelligence (moat) · Growth (prospects) · Sentinel
```
One gateway per boundary (adapters per protocol, simulator-swappable). Reactive
subsystems subscribe to events — never wired into the core. **North star: every
referral makes the next one smarter** (event-sourced `ReferralEvent` → `ProviderStat`).

## Where we are (branches / PRs)
| Branch | Contents | State |
|--------|----------|-------|
| `main` | **Payer pipeline** (PR #1 merged): PayerGateway + FHIR PAS/Availity/X12 adapters, OAuth, webhooks (HMAC), eligibility, appeals, SLA worker, secure-link receipt; partner simulator; 14 E2E tests | ✅ merged, green |
| `feature/off-network-delivery` | **PR #2 (open, green):** Modules 1–4 — event bus + Intelligence seed, DeliveryGateway+fax, Growth subscriber, IntakeGateway (inbound fax). 26 E2E tests total | 🟡 ready to merge |

## Verified (✅🧪 = built + automated test)
Payer loop (approve/deny/poll/signed-webhook/eligibility/denial-feedback/expiry),
webhook HMAC, secure-link receipt, DeliveryGateway channel selection, off-network→
Prospect growth loop, inbound-fax intake, Intelligence ProviderStat rollups.
**Full suite: 26/26 across 8 files; CI `e2e` job green.**

## Brand / frontend (done earlier sessions)
RefChain→Plerous rebrand complete; landing redesign (warm-cream light theme,
amethyst `#5C2D8E` + amber `#E8941A`, spatial UI); `<Term>` glossary tooltips;
folder renamed `dev/refchain`→`dev/plerous`; repo pushed; branch protection + CI.

## Not built yet (deliberate backlog, post-Wednesday)
1. Module 5 — `referral.at_risk` event + **predictive Sentinel**.
2. Module 6 — **positive loop-back** to the referrer (received/scheduled/completed).
3. Benchmarking **read-API/dashboard** over `ProviderStat` (the investor-tangible moat surface).
4. Real **fax provider** (Phaxio/Documo/Twilio Fax) + **Direct MDN** + **EHR FHIR Task** receipt channels.
5. **X12 278/275 certification** (current generator is functional, not certified).
6. Real **migrations** (we use `db push`; migrations gitignored — debt for first deploy/teammate).
7. Onboarding/PAIA-branch E2E tests.

## Honesty guardrail (keep)
No marketing/site claim ships ahead of a green E2E test. "Confirmed receipt" is
true for FHIR/payer + secure-link channels (tested); fax = transmit-proof only.

## Key decisions log
- Gateway-per-boundary + adapters + simulator (swap endpoint via config, not code).
- Reactive subsystems (Intelligence, Growth) as event subscribers.
- BullMQ-backed durable domain events (inline mode for deterministic tests).
- The moat = event-sourced cross-silo **referral outcome graph**; FHIR is table stakes.
- Reuse `PolicyRule` for payer denial intel; `ProviderStat` adds specialist performance.

## Wednesday (UHC API meeting)
Flip from simulator → real UHC sandbox is **config-only**. Checklist:
`docs/uhc-sandbox-flip-checklist.md`. Validate scenarios 2 (approve) + 5 (eligibility).

## Key docs (all in `docs/`)
- `payer-integration-and-simulator.md` — what's real vs simulated + gap list
- `end-to-end-referral-scenarios.md` — full permutation matrix (the 4 quadrants)
- `manual-test-guide.md` — member-ID scenarios + curl recipes
- `uhc-sandbox-flip-checklist.md` — Wednesday readiness

## How to resume in a new conversation
1. Read this file. 2. `git log --oneline -15` and check open PRs (`shams96/plerous`).
3. `git status` / current branch. 4. Pick up from "Not built yet" or the active PR.
