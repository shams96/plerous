/**
 * Default rules for payers without a dedicated profile.
 * Conservative — flags for human review rather than auto-submitting.
 */
export const defaultRules = {
  payerIds: ['*'],
  name: 'Default (Unknown Payer)',

  procedureRules: {
    // High-cost procedures that almost universally require PA regardless of payer
    _highCostDefaults: {
      paRequired: true,
      clinicalCriteria: [],
      denialRateBaseline: 0.25,
    },
  },

  // Procedure codes that require PA at virtually all commercial payers
  universalPaRequired: [
    '95810', '95811', '95800', '95801',  // Sleep studies
    '94726', '94727', '94728',           // Plethysmography
    '27447', '27130', '27132',           // Joint replacements
    '43239', '43251', '43270',           // Endoscopy with intervention
    '17311', '17312', '17313',           // Mohs surgery
    '67028', '66170',                    // Ophthalmic procedures
    '63047', '63048',                    // Spinal surgery
  ],

  // Procedures that virtually never require PA
  universalPaExempt: [
    '99213', '99214', '99215',           // Office visits
    '94010', '94060',                    // Basic spirometry
    '93000', '93005', '93010',           // EKG
    '80053', '80048',                    // Basic metabolic panels
  ],
}
