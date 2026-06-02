# Plerous — Claude Code Context

> **Start here every session:** read `docs/STATUS.md` — it is the single source of
> truth for current state (what's built, branches/PRs, backlog, how to resume).
> The repo + git history is authoritative; no single chat is.

## What this is
Plerous (formerly RefChain) — **closed-loop referral infrastructure for independent
healthcare**. Next.js 15 dashboard + Node/Fastify API + Postgres/Redis (BullMQ) +
Anthropic Claude agents, FHIR R4 / Da Vinci PAS. GitHub: `shams96/plerous`.

## Architecture (one mental model)
Referral **state machine** with external boundaries fronted by **gateways**
(`PayerGateway`, `DeliveryGateway`, `IntakeGateway` — adapters per protocol,
simulator-swappable), and reactive subsystems wired as **event-bus subscribers**
(`Intelligence` = the moat, `Growth` = prospects). Never wire reactive logic into
the core flow — emit a domain event and subscribe.
- API: `apps/api/src/{payers,delivery,intake,events,intelligence,growth,agents,modules}`
- Simulator: `apps/payer-sim` (payer + fax). Dashboard: `apps/dashboard`.

## Run
Docker postgres (:5433) + redis (:6380) → `apps/api` `npm run dev` (:3001),
`apps/dashboard` `npm run dev` (:3000), `apps/payer-sim` `node server.js` (:4010).
Tests: `cd apps/api && npm test` (Vitest; global-setup auto-boots sim + a webhook API).

## Working discipline (the user expects this)
- **Modular:** one module → wire in → **test green** → commit. No big uncommitted blobs.
- **Plan before big builds** (EnterPlanMode); make the architect call, don't punt.
- **Honesty guardrail:** no marketing/site claim ships ahead of a passing E2E test.
- Feature branches + PRs (`main` is protected; CI must pass). Reuse before rebuild.
- Brand: amethyst `#5C2D8E` + amber `#E8941A`; warm-cream light theme; dark untouched.

## Key docs (`docs/`)
`STATUS.md` (read first) · `payer-integration-and-simulator.md` ·
`end-to-end-referral-scenarios.md` (the 4 network quadrants) ·
`manual-test-guide.md` · `uhc-sandbox-flip-checklist.md`.
