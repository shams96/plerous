/**
 * UnitedHealthcare Texas — Medicare Advantage
 * Source: UHC Medicare Advantage Clinical Coverage Guidelines 2026
 * Sleep medicine and pulmonary PA grid
 */
export const uhcTxRules = {
  payerIds: ['uhc-tx', 'UHC-TX-COMM-2026', 'uhc'],
  name: 'UnitedHealthcare TX Medicare Advantage',

  procedureRules: {

    '95810': {
      paRequired: true,
      clinicalCriteria: [
        {
          id: 'osa-clinical-suspicion',
          description: 'Clinical suspicion of OSA with at least 2 documented symptoms',
          documentationKeywords: [
            'snoring', 'apnea', 'witnessed apnea', 'excessive daytime sleepiness',
            'EDS', 'morning headache', 'nocturia', 'gasping', 'choking',
            'non-restorative sleep', 'insomnia', 'cognitive impairment',
          ],
          minimumMatches: 2,
          severity: 'required',
          autoExtractable: false,
        },
        {
          id: 'bmi-or-comorbidity',
          description: 'BMI > 30 OR documented comorbidity that increases OSA risk (HTN, T2DM, afib, heart failure)',
          documentationKeywords: [
            'BMI', 'obese', 'obesity', 'hypertension', 'HTN', 'diabetes',
            'T2DM', 'atrial fibrillation', 'afib', 'heart failure', 'HFpEF',
          ],
          severity: 'advisory',   // UHC MA — strengthens but not hard-stop
          autoExtractable: false,
        },
        {
          id: 'stopbang-documented',
          description: 'STOP-BANG score documented (UHC MA recommends ≥ 3 for referral)',
          documentationKeywords: ['stop-bang', 'stop bang', 'STOPBANG'],
          scorePattern: /STOP.?BANG[:\s]+(\d+)/i,
          scoreThreshold: 3,
          autoExtractable: true,
          severity: 'advisory',
        },
      ],
      validDiagnoses: [
        'G47.30', 'G47.31', 'G47.32', 'G47.33', 'G47.39',
        'R06.83', 'G47.00',
      ],
      typicalApprovalDays: 2,    // UHC MA typically faster than commercial
      denialRateBaseline: 0.19,
    },

    '95811': {
      paRequired: true,
      clinicalCriteria: [
        {
          id: 'ahi-confirmed',
          description: 'AHI ≥ 15 on prior diagnostic study (moderate-severe OSA) OR AHI ≥ 5 with documented symptoms/comorbidities',
          documentationKeywords: ['AHI', 'apnea-hypopnea', 'moderate', 'severe', 'prior study'],
          scorePattern: /AHI[:\s]+(\d+\.?\d*)/i,
          scoreThreshold: 5,
          autoExtractable: true,
          severity: 'required',
        },
        {
          id: 'treatment-indication',
          description: 'CPAP treatment medically necessary — documented symptoms or cardiovascular comorbidity',
          documentationKeywords: [
            'CPAP', 'treatment', 'cardiovascular', 'hypertension', 'HTN',
            'diabetes', 'arrhythmia', 'symptomatic', 'impaired function',
          ],
          severity: 'required',
          autoExtractable: false,
        },
      ],
      validDiagnoses: ['G47.33', 'G47.31', 'G47.30'],
      typicalApprovalDays: 2,
      denialRateBaseline: 0.12,
    },

    '94726': {
      paRequired: false,   // UHC MA does not require PA for plethysmography as of 2026
      clinicalCriteria: [
        {
          id: 'lung-function-indication',
          description: 'Clinical indication for lung volume measurement',
          documentationKeywords: ['COPD', 'restrictive', 'lung volumes', 'pulmonary'],
          severity: 'advisory',
          autoExtractable: false,
        },
      ],
      validDiagnoses: ['J44.0', 'J44.1', 'J44.9', 'J45.20', 'J84.10'],
      denialRateBaseline: 0.06,
    },

    '94010': {
      paRequired: false,
      clinicalCriteria: [],
      validDiagnoses: ['J44.0', 'J44.1', 'J44.9', 'J45.20', 'R09.3'],
      denialRateBaseline: 0.03,
    },
  },
}
