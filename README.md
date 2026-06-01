# Plerous

**Closed-loop referral infrastructure for independent healthcare.**

Plerous closes the gap between providers — the coordination black hole where referrals disappear, prior authorizations stall, and patients fall through the cracks. It catches every referral, chases every specialist, and confirms every authorization, so revenue and care don't leak out of the system.

Built for independent practices, physician groups, imaging centers, and surgical facilities. FHIR R4 native, HIPAA compliant, and ready for the CMS-0057-F mandate (Jan 2027).

---

## Monorepo layout

```
apps/
  api/         Node + Express API — FHIR R4, Da Vinci PAS, 10 AI agents, Prisma/Postgres
  dashboard/   Next.js 15 app (App Router) — landing, onboarding, referral + auth workflows
docs/          Strategy, agent build plan, e2e scenarios
packages/      Shared workspace packages
```

## Tech stack

- **Frontend** — Next.js 15 (App Router, React 19), Tailwind CSS v4, light/dark theming
- **Backend** — Node.js + Express, Prisma ORM, PostgreSQL, Redis (queues/workers)
- **AI** — Anthropic Claude (PAIA pre-auth intelligence, recovery, revenue, scheduling agents)
- **Standards** — FHIR R4, SMART on FHIR (OAuth + PKCE), Da Vinci PAS
- **Infra** — Docker Compose (Postgres + Redis), Turbo monorepo

## The agents

Ten autonomous agents, each owning a gap in the referral loop:

| Agent | Job |
|-------|-----|
| **PAIA** | Screens every referral for the gaps payers use to deny — before submission |
| **Sentinel** | 24/7 monitor; auto-recovers stalled referrals |
| **Recovery** | Rescues referrals stuck in specialist acknowledgment |
| **Revenue Recovery** | Surfaces revenue leaking from unscheduled referrals |
| **Scheduling** | Closes the loop from auth approval to booked appointment |
| **Prospect / Relationship / Care Gap / Brief / Founder Brief** | Growth, retention, and operational intelligence |

## Local development

### Prerequisites
- Node.js 20+
- Docker (for Postgres + Redis), or local Postgres/Redis

### Setup

```bash
# 1. Install dependencies (workspace root)
npm install

# 2. Start Postgres + Redis
docker compose up -d

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
# fill in ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, etc.

# 4. Set up the database
cd apps/api
npx prisma generate
npx prisma db push
node src/db/seed.js

# 5. Run the servers
npm run dev          # API on :3001
cd ../dashboard
npm run dev          # Dashboard on :3000
```

The dashboard is served at **http://localhost:3000**, the API at **http://localhost:3001**.

## Environment variables

See [`apps/api/.env.example`](apps/api/.env.example) for the full list. Key ones:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API — required for all AI agents |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Auth token signing (min 32 chars) |
| `ENCRYPTION_KEY` | HIPAA field encryption (64 hex chars) |
| `REDIS_URL` | Queue/worker backend |

**Never commit `.env` files.** Only `.env.example` is tracked.

## License

Proprietary — © Plerous. All rights reserved.
