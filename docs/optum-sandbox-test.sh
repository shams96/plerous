#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Optum Sandbox Validation Script
# Run this once credentials activate to confirm Scenario 2 + 5.
#
# Usage:
#   bash docs/optum-sandbox-test.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Set these from your .env or pass as env vars:
#   UHC_CLIENT_ID=... UHC_CLIENT_SECRET=... bash docs/optum-sandbox-test.sh
CLIENT_ID="${UHC_CLIENT_ID:?Set UHC_CLIENT_ID env var}"
CLIENT_SECRET="${UHC_CLIENT_SECRET:?Set UHC_CLIENT_SECRET env var}"
TOKEN_URL="https://sandbox-apigw.optum.com/apip/auth/v2/token"
ELIG_URL="https://sandbox-apigw.optum.com/oihub/eligibility/v1/pre-service/member"
REFERRAL_URL="https://sandbox-apigw.optum.com/oihub/patient/auth/referral/v1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1 — OAuth token"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOKEN_RESP=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}")

echo "$TOKEN_RESP" | python3 -m json.tool 2>/dev/null || echo "$TOKEN_RESP"

TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo ""
  echo "❌  No access_token — credentials not yet active. Try again in ~30 min."
  exit 1
fi
echo ""
echo "✅  Token acquired (${#TOKEN} chars)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2 — Scenario 5: Pre-service eligibility check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ELIG_RESP=$(curl -s -X POST "$ELIG_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "environment: sandbox" \
  -H "x-optum-consumer-correlation-id: test-elig-001" \
  -d '{
    "query": "query CheckEligibility($input: EligibilityInput!) { checkEligibility(input: $input) { eligibility { eligibilityInfo { trnId member { memberId firstName lastName } } providerNetwork { status tier } } } }",
    "variables": {
      "input": {
        "memberId": "0001234567",
        "firstName": "ABC",
        "lastName": "EFGH",
        "groupNumber": "123456789",
        "dateOfBirth": "1985-01-15",
        "serviceStartDate": "2026-06-03",
        "serviceEndDate": "2026-06-03",
        "payerId": "87726",
        "trnId": "test-001",
        "providerNPI": "1234567890",
        "providerFirstName": "QWERT",
        "providerLastName": "XYZ"
      }
    }
  }')

echo "$ELIG_RESP" | python3 -m json.tool 2>/dev/null || echo "$ELIG_RESP"

MEMBER_ID=$(echo "$ELIG_RESP" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('checkEligibility',{}).get('eligibility',[{}])[0].get('eligibilityInfo',{}).get('member',{}).get('memberId',''))" 2>/dev/null || echo "")

if [ -n "$MEMBER_ID" ]; then
  echo "✅  Eligibility returned memberId: $MEMBER_ID"
else
  echo "⚠️   No memberId in response — check mock data shape"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3 — Scenario 2: Submit referral (prior auth)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
REFERRAL_RESP=$(curl -s -X POST "$REFERRAL_URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "environment: sandbox" \
  -H "x-optum-consumer-correlation-id: test-referral-001" \
  -d '{
    "query": "mutation SubmitReferral($referralSubmitInput: ReferralSubmitInput!) { submitReferral(referralSubmitInput: $referralSubmitInput) { referralId referralStatus payer { id name messages } decisions { decisionType certificationAction reviewDecisionReason } rejectionReasons { rejectionCode reasonDescription } } }",
    "variables": {
      "referralSubmitInput": {
        "payerId": "87726",
        "requestingProvider": {
          "npi": "1234567890",
          "taxId": "98765432",
          "firstName": "Carlos",
          "lastOrOrgName": "Dr. Carlos Clinic",
          "specialityCode": "CARD",
          "contactName": "Carlos Benito",
          "phoneNumber": "555-222-3333"
        },
        "servicingProvider": {
          "npi": "9876543210",
          "taxId": "11223344",
          "firstName": "Jane",
          "lastOrOrgName": "Cardiology Associates",
          "specialityCode": "CARD"
        },
        "patient": {
          "id": "0001234567",
          "firstName": "Alice",
          "lastName": "Johnson",
          "dateOfBirth": "1985-03-15",
          "groupNumber": "123456789"
        },
        "service": {
          "diagnosisCodes": ["I10"],
          "referralQuantity": { "quantity": 1, "qualifier": "VS" },
          "startDate": "2026-06-03",
          "endDate": "2026-06-03",
          "comment": "Sandbox validation test"
        }
      }
    },
    "operationName": "SubmitReferral"
  }')

echo "$REFERRAL_RESP" | python3 -m json.tool 2>/dev/null || echo "$REFERRAL_RESP"

REFERRAL_STATUS=$(echo "$REFERRAL_RESP" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('data',{}).get('submitReferral',{}).get('referralStatus',''))" 2>/dev/null || echo "")
REFERRAL_ID=$(echo "$REFERRAL_RESP" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('data',{}).get('submitReferral',{}).get('referralId',''))" 2>/dev/null || echo "")

echo ""
if [ -n "$REFERRAL_STATUS" ]; then
  echo "✅  Referral submitted — ID: $REFERRAL_ID  Status: $REFERRAL_STATUS"
else
  echo "⚠️   No referralStatus in response — check mock data shape"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DONE — Update docs/uhc-sandbox-flip-checklist.md with results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
