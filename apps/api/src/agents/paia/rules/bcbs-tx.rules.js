/**
 * BCBS Texas — Payer-specific pre-auth criteria
 * Source: BCBS TX Medical Policy MP-08.01.10, MP-08.01.12, MP-08.01.35
 * Sleep medicine PA grid effective 2026-01-01
 */
export const bcbsTxRules = {
  payerIds: ['bcbs-tx', 'BCBS-TX-84980'],
  name: 'BCBS Texas',

  procedureRules: {

    // Polysomnography — attended, facility
    '95810': {
      paRequired: true,
      clinicalCriteria: [
        {
          id: 'ess-threshold',
          description: 'Epworth Sleepiness Scale (ESS) score ≥ 10',
          documentationKeywords: ['epworth', 'ESS', 'sleepiness scale', 'daytime sleepiness'],
          scorePattern: /ESS[:\s]+(\d+)/i,
          scoreThreshold: 10,
          autoExtractable: true,
          severity: 'required',
        },
        {
          id: 'stopbang-threshold',
          description: 'STOP-BANG questionnaire score ≥ 3',
          documentationKeywords: ['stop-bang', 'stop bang', 'STOPBANG', 'snoring', 'witnessed apnea'],
          scorePattern: /STOP.?BANG[:\s]+(\d+)/i,
          scoreThreshold: 3,
          autoExtractable: true,
          severity: 'required',
        },
        {
          id: 'osa-symptoms',
          description: 'Documented OSA symptoms: snoring + witnessed apneas or excessive daytime sleepiness',
          documentationKeywords: [
            'snoring', 'apnea', 'witnessed', 'excessive daytime sleepiness',
            'EDS', 'hypersomnia', 'fatigue', 'gasping', 'choking during sleep',
          ],
          severity: 'required',
          autoExtractable: false,
        },
        {
          id: 'conservative-therapy',
          description: 'Documentation that positional therapy or weight loss has been considered or failed',
          documentationKeywords: ['positional', 'weight loss', 'BMI', 'conservative', 'lifestyle'],
          severity: 'advisory',   // strengthens approval — not hard-stop
          autoExtractable: false,
        },
      ],
      validDiagnoses: [
        'G47.30', 'G47.31', 'G47.32', 'G47.33', 'G47.39',  // sleep apnea variants
        'G47.00', 'G47.09', 'G47.10', 'G47.19',              // insomnia, hypersomnia
        'R06.83', 'R06.3',                                    // snoring, Cheyne-Stokes
      ],
      typicalApprovalDays: 3,
      denialRateBaseline: 0.34,
    },

    // PSG with CPAP titration
    '95811': {
      paRequired: true,
      clinicalCriteria: [
        {
          id: 'prior-osa-diagnosis',
          description: 'Confirmed OSA diagnosis — prior sleep study or clinical diagnosis documented',
          documentationKeywords: ['OSA', 'obstructive sleep apnea', 'AHI', 'apnea-hypopnea index', 'confirmed'],
          severity: 'required',
          autoExtractable: false,
        },
        {
          id: 'ahi-documented',
          description: 'AHI score documented (BCBS TX requires AHI ≥ 5 for titration coverage)',
          documentationKeywords: ['AHI', 'apnea-hypopnea index', 'apnea hypopnea'],
          scorePattern: /AHI[:\s]+(\d+\.?\d*)/i,
          scoreThreshold: 5,
          autoExtractable: true,
          severity: 'required',
        },
        {
          id: 'cpap-naive',
          description: 'Patient is CPAP-naive OR has documented CPAP failure requiring re-titration',
          documentationKeywords: ['CPAP naive', 'CPAP failure', 'titration', 'CPAP intolerant', 'pressure adjustment'],
          severity: 'required',
          autoExtractable: false,
        },
      ],
      validDiagnoses: [
        'G47.33', 'G47.31', 'G47.30',  // OSA variants
      ],
      typicalApprovalDays: 3,
      denialRateBaseline: 0.18,
    },

    // Body plethysmography
    '94726': {
      paRequired: true,
      clinicalCriteria: [
        {
          id: 'lung-disease-indication',
          description: 'Documented obstructive or restrictive lung disease indication',
          documentationKeywords: [
            'COPD', 'emphysema', 'restrictive', 'pulmonary fibrosis', 'asthma',
            'bronchiectasis', 'lung volumes', 'hyperinflation', 'air trapping',
          ],
          severity: 'required',
          autoExtractable: false,
        },
        {
          id: 'spirometry-prior',
          description: 'Prior spirometry results referenced or ordered concurrently',
          documentationKeywords: ['spirometry', 'FEV1', 'FVC', 'FEV1/FVC', 'pulmonary function'],
          severity: 'advisory',
          autoExtractable: false,
        },
      ],
      validDiagnoses: [
        'J44.0', 'J44.1', 'J44.9',   // COPD
        'J45.20', 'J45.21', 'J45.30', 'J45.31', 'J45.40', 'J45.41',  // asthma
        'J84.10', 'J84.112', 'J84.17',  // pulmonary fibrosis
        'J98.09',                         // other lung disease
      ],
      typicalApprovalDays: 5,
      denialRateBaseline: 0.22,
    },

    // Spirometry — usually no PA but advisory check
    '94010': {
      paRequired: false,
      clinicalCriteria: [],
      validDiagnoses: ['J44.0', 'J44.1', 'J44.9', 'J45.20', 'J45.30', 'J45.40', 'R09.3'],
      denialRateBaseline: 0.04,
    },
  },
}
