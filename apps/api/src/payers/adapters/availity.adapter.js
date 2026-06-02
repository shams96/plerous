/**
 * Availity clearinghouse adapter.
 *
 * Availity is a multi-payer gateway. Its modern Authorizations API accepts the
 * FHIR Da Vinci PAS shape, so this adapter currently delegates to the FHIR-PAS
 * adapter. The seam exists so Availity-specific differences — OAuth at
 * /availity/v1/token, the x-availity-customer-id header, and their submission
 * envelope — can be layered in here once we have their sandbox docs (post-Wed)
 * WITHOUT touching the gateway or the rest of the pipeline.
 *
 * TODO(availity-docs): override headersFor() with x-availity-customer-id and
 * map to Availity's /authorizations submission/poll endpoints if they diverge
 * from plain FHIR $submit.
 */
import * as fhirPas from './fhir-pas.adapter.js'

export const submitAuth = fhirPas.submitAuth
export const getAuthStatus = fhirPas.getAuthStatus
export const checkEligibility = fhirPas.checkEligibility
export const submitAppeal = fhirPas.submitAppeal
