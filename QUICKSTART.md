# RefChain — Quick Start

## Prerequisites
- Node.js 20+
- Docker Desktop

## Start in 5 commands

```bash
# 1. Clone and install
cd apps/api
npm install

# 2. Copy env
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET

# 3. Start Postgres + Redis
docker-compose up -d

# 4. Create DB schema + seed
npx prisma generate
npx prisma db push
node src/db/seed.js

# 5. Start API
npm run dev
```

## Verify it's working

- **Health**: http://localhost:3001/health
- **Swagger Docs**: http://localhost:3001/docs
- **FHIR Metadata**: http://localhost:3001/fhir/r4/metadata

## Test with demo API key

```bash
# List referrals
curl -H "x-api-key: rc_live_demo_key_sunrise_2026" \
  http://localhost:3001/v1/referrals

# Connect an EHR (auto-discovery)
curl -X POST http://localhost:3001/v1/ehr/connect \
  -H "x-api-key: rc_live_demo_key_sunrise_2026" \
  -H "Content-Type: application/json" \
  -d '{"fhirBaseUrl": "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4"}'

# AI risk score
curl -X POST http://localhost:3001/v1/ai/risk-score \
  -H "x-api-key: rc_live_demo_key_sunrise_2026" \
  -H "Content-Type: application/json" \
  -d '{"specialty":"Cardiology","diagnosisCodes":["I25.10"],"insurancePlanType":"HMO","patientAge":72,"urgency":"URGENT"}'
```

## Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/referrals | Create referral + AI risk score |
| GET | /v1/referrals | List org referrals |
| POST | /v1/referrals/:id/submit | Submit + trigger prior auth |
| POST | /v1/referrals/:id/schedule | Confirm appt + patient SMS |
| GET | /v1/referrals/:id/status | Real-time status + auth |
| POST | /v1/auth/validate | Real-time eligibility check |
| GET | /v1/auth/requirements/:planId | HMO auth rules |
| POST | /v1/ai/risk-score | Leakage probability |
| POST | /v1/ai/generate-appeal | Claude denial appeal |
| GET | /v1/ai/leakage-report | Revenue analytics |
| POST | /v1/ehr/connect | Connect EHR (auto-discovers type) |
| GET | /v1/ehr/profile | Your EHR context profile |
| GET | /v1/ehr/review-queue | Pending human review items |
| POST | /v1/patients | Create patient |
| GET | /v1/patients/search?q= | Search patients |
| GET | /fhir/r4/metadata | FHIR CapabilityStatement |
