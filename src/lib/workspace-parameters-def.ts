// ==============================================================================
// Official Workspace Audit Quality Parameters & Scorecard Definitions
// Authoritative definitions for:
// 1. Customer Support (Support - Call Audit Quality Scorecard)
// 2. Mutual Fund Desks: MF Gold, MF Silver, MF Digital, MF Onboarding, MF Platinum
// 3. Equity Regular & Equity Onboarding (Equity Regular - Call Audit Quality Scorecard)
// ==============================================================================

export interface QualitySubparameter {
  id: string;
  title: string;
  mandatory?: boolean;
}

export interface QualityParameterCategory {
  param_key: string;
  title: string;
  category: string;
  question: string;
  fatal: boolean;
  weight: number; // 1 mark per parameter category
  rule: string;
  subparameters: QualitySubparameter[];
}

// ------------------------------------------------------------------------------
// 1. Customer Support — Call Audit Quality Scorecard (Image 2)
// ------------------------------------------------------------------------------
export const CUSTOMER_SUPPORT_PARAMETERS: QualityParameterCategory[] = [
  {
    param_key: 'P1',
    title: 'Call Handling Skills',
    category: 'Call Handling Skills',
    question: 'Did executive demonstrate effective Call Handling Skills?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'cs_ch_1', title: 'Did the executive greet the investor and introduce themselves appropriately ?', mandatory: true },
      { id: 'cs_ch_2', title: 'Seeking permission ? Was the Query Acknowledged ?', mandatory: true },
      { id: 'cs_ch_3', title: 'Did executive ask or verify - Investor Name | Was the Two-Level Authentication done appropriately ?', mandatory: true },
      { id: 'cs_ch_4', title: 'Did the executive offered for Further assistance ?', mandatory: true },
      { id: 'cs_ch_5', title: 'Was the call closing appropriate ?', mandatory: true },
    ],
  },
  {
    param_key: 'P2',
    title: 'Language & Softskills',
    category: 'Language & Softskills',
    question: 'Did executive follow proper Language & Softskills procedures?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'cs_ls_1', title: 'Did the executive followed proper Hold & Transfer procedure ?', mandatory: true },
      { id: 'cs_ls_2', title: 'Was the call transferred to correct department ?', mandatory: true },
      { id: 'cs_ls_3', title: 'Was the relevant probing done towards the Query raised ?', mandatory: true },
      { id: 'cs_ls_4', title: 'Did the agent explore complete details of the client before giving solution?', mandatory: true },
    ],
  },
  {
    param_key: 'P3',
    title: 'Critical Parameters (FATAL)',
    category: 'Critical Parameters',
    question: 'Were Critical Parameters & compliance guidelines followed strictly?',
    fatal: true,
    weight: 1,
    rule: 'FATAL: If ANY subparameter fails, total call score is immediately 0/5.',
    subparameters: [
      { id: 'cs_crit_1', title: 'Whether the agent Actively listening to the customer and acknowledge?', mandatory: true },
      { id: 'cs_crit_2', title: 'Did the executive provide accurate and complete information to the customer query?', mandatory: true },
      { id: 'cs_crit_3', title: 'Were all the queries addressed ?', mandatory: true },
      { id: 'cs_crit_4', title: 'Did executive honoured all commitments with regards to callbacks ?', mandatory: true },
      { id: 'cs_crit_5', title: 'Was the executive proactive in taking ownership on the call ?', mandatory: true },
      { id: 'cs_crit_6', title: 'Did executive create or address the ticket after the call | CRM Notes captured ?', mandatory: true },
    ],
  },
  {
    param_key: 'P4',
    title: 'Business',
    category: 'Business',
    question: 'Did executive maintain professional business communication tone & empathy?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'cs_bus_1', title: 'Was the executive Energetic & Professional tone throughout the call ?', mandatory: true },
      { id: 'cs_bus_2', title: 'Was the language matched appropriate ?', mandatory: true },
      { id: 'cs_bus_3', title: 'Was there any Dead air / Pauses / Jargons / Fillers in the conversation ?', mandatory: true },
      { id: 'cs_bus_4', title: 'Did the executive empathize customer wherever required ?', mandatory: true },
      { id: 'cs_bus_5', title: 'Did executive avoid interruption/overlap ?', mandatory: true },
    ],
  },
  {
    param_key: 'P5',
    title: 'Domain',
    category: 'Domain',
    question: 'Did executive demonstrate domain clarity, platform guidance, and process updates?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'cs_dom_1', title: 'Was the executive able to understand the Query & Communicate with clarity ?', mandatory: true },
      { id: 'cs_dom_2', title: 'Was the Executive able to help the investor navigate through our platform confidently?', mandatory: true },
      { id: 'cs_dom_3', title: 'Was the executive is updated with the recent changes in the process?', mandatory: true },
    ],
  },
];

// ------------------------------------------------------------------------------
// 2. Silver / Gold / Platinum — Call Audit Quality Scorecard (Image 3)
// For: MF Gold, MF Silver, MF Digital, MF Onboarding, MF Platinum
// ------------------------------------------------------------------------------
export const MUTUAL_FUND_PARAMETERS: QualityParameterCategory[] = [
  {
    param_key: 'P1',
    title: 'Call Handling Skills',
    category: 'Call Handling Skills',
    question: 'Did the coach demonstrate effective Call Handling Skills?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'mf_ch_1', title: 'Did the coach greet and introduce appropriately?', mandatory: true },
      { id: 'mf_ch_2', title: 'Adequately prepare with the client details ?', mandatory: true },
      { id: 'mf_ch_3', title: 'Did the Coach use proper Hold & Mute Procedure when required?', mandatory: true },
      { id: 'mf_ch_4', title: "Did the Coach summarize the call, confirming the customer's understanding?", mandatory: true },
      { id: 'mf_ch_5', title: 'Did the Coach close the call with proper greeting?', mandatory: true },
    ],
  },
  {
    param_key: 'P2',
    title: 'Language & Softskills',
    category: 'Language & Softskills',
    question: 'Did the coach demonstrate professional Language & Softskills?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'mf_ls_1', title: 'Did the Coach avoid interruptions /cross-talks / jargons / dead air / fillers / foghorns over the call?', mandatory: true },
      { id: 'mf_ls_2', title: 'Did the Coach maintain appropriate Rate of Speech ?', mandatory: true },
      { id: 'mf_ls_3', title: 'Did the Coach use an energetic, polite and professional tone throughout the call?', mandatory: true },
      { id: 'mf_ls_4', title: 'Did the Coach empathize with the customer appropriately? Did the coach show ownership of the query?', mandatory: true },
      { id: 'mf_ls_5', title: 'Was the coach able to communicate with clarity without any grammatical errors?', mandatory: true },
    ],
  },
  {
    param_key: 'P3',
    title: 'Critical Parameters (FATAL)',
    category: 'Critical Parameters',
    question: 'Were Critical Compliance & Advisory Parameters followed strictly?',
    fatal: true,
    weight: 1,
    rule: 'FATAL: If ANY subparameter fails, total call score is immediately 0/5.',
    subparameters: [
      { id: 'mf_crit_1', title: 'Did the coach avoid giving any assurance on market or fund performance?', mandatory: true },
      { id: 'mf_crit_2', title: 'Did the coach capture proper notes and tag the customer effectively in ZOHO?', mandatory: true },
      { id: 'mf_crit_3', title: 'Did the Coach honour all commitments wrt call-back, recommendations, emails, etc.?', mandatory: true },
      { id: 'mf_crit_4', title: "Did the coach not missell/downsell the product ?", mandatory: true },
      { id: 'mf_crit_5', title: 'Was the recommendation/Product information shared with the customer accurate and complete?', mandatory: true },
      { id: 'mf_crit_6', title: 'Did the Coach actively listen and acknowledge the customer appropriately?', mandatory: true },
    ],
  },
  {
    param_key: 'P4',
    title: 'Business',
    category: 'Business',
    question: 'Did the coach explore opportunities, build rapport, and pitch effectively?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'mf_bus_1', title: 'Did the Coach make efforts to build rapport?', mandatory: true },
      { id: 'mf_bus_2', title: 'Did the coach ask pertinent questions to understand the potential of the customer? Explore existing investment patterns / investment experience of the customer ?', mandatory: true },
      { id: 'mf_bus_3', title: 'Did the Coach explore for further business opportunities? Was the Coach able to effectively brief and pitch our Products?', mandatory: true },
      { id: 'mf_bus_4', title: 'Did the coach use effective persuasive skills, negotiation skills to close the sale? Did the coach create urgency with valid examples & reasons?', mandatory: true },
      { id: 'mf_bus_5', title: 'Was the coach able to handle all the objections effectively?', mandatory: true },
    ],
  },
  {
    param_key: 'P5',
    title: 'Domain',
    category: 'Domain',
    question: 'Did the coach demonstrate competitor knowledge, platform guidance, and portfolio pitching?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'mf_dom_1', title: 'Is the coach knowledgeable about the products offered by the competitors/is he able to highlight the features of our product vs competitors?', mandatory: true },
      { id: 'mf_dom_2', title: 'Was the coach able to help the investor navigate through our platform confidently?', mandatory: true },
      { id: 'mf_dom_3', title: 'Was the Coach able to effectively brief and pitch Financial Planning / Portfolio Review / ABC / 7-5-3-1/ Insurance / MSCI / NPS /Others?', mandatory: true },
    ],
  },
];

// ------------------------------------------------------------------------------
// 3. Equity Regular — Call Audit Quality Scorecard (Image 4)
// For: Equity Regular, Equity Onboarding
// ------------------------------------------------------------------------------
export const EQUITY_REGULAR_PARAMETERS: QualityParameterCategory[] = [
  {
    param_key: 'P1',
    title: 'Call Handling Skills',
    category: 'Call Handling Skills',
    question: 'Did the coach demonstrate effective Call Handling Skills?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'eq_ch_1', title: 'Did the coach greet and introduce appropriately?', mandatory: true },
      { id: 'eq_ch_2', title: 'Adequately prepare with the client details ?', mandatory: true },
      { id: 'eq_ch_3', title: 'Did the Coach use proper Hold & Mute Procedure when required?', mandatory: true },
      { id: 'eq_ch_4', title: "Did the Coach summarize the call, confirming customer's understanding?", mandatory: true },
      { id: 'eq_ch_5', title: 'Did the Coach close the call with proper greeting?', mandatory: true },
    ],
  },
  {
    param_key: 'P2',
    title: 'Language & Softskills',
    category: 'Language & Softskills',
    question: 'Did the coach demonstrate professional Language & Softskills?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'eq_ls_1', title: 'Did the Coach avoid interruptions /cross-talks / jargons / dead air / fillers / foghorns over the call ?', mandatory: true },
      { id: 'eq_ls_2', title: 'Did the Coach maintain appropriate Rate of Speech ?', mandatory: true },
      { id: 'eq_ls_3', title: 'Did the Coach use energetic, polite and professional tone throughout the call?', mandatory: true },
      { id: 'eq_ls_4', title: 'Did the Coach empathize with the customer appropriately?', mandatory: true },
      { id: 'eq_ls_5', title: 'Was the coach able to communicate with clarity without any grammatical errors?', mandatory: true },
    ],
  },
  {
    param_key: 'P3',
    title: 'Critical Parameters (FATAL)',
    category: 'Critical Parameters',
    question: 'Were Critical Parameters & compliance guidelines followed strictly?',
    fatal: true,
    weight: 1,
    rule: 'FATAL: If ANY subparameter fails, total call score is immediately 0/5.',
    subparameters: [
      { id: 'eq_crit_1', title: 'Did the coach avoid giving any assurance on market or fund performance?', mandatory: true },
      { id: 'eq_crit_2', title: 'Did the coach capture proper notes and tag the customer effectively in ZOHO?', mandatory: true },
      { id: 'eq_crit_3', title: 'Did the Coach honour all commitments wrt call-back, recommendations, emails, etc.?', mandatory: true },
      { id: 'eq_crit_4', title: "Did the coach doesn't missell/downsell the product ?", mandatory: true },
      { id: 'eq_crit_5', title: 'Did the Coach actively listen and acknowledge the customer appropriately?', mandatory: true },
    ],
  },
  {
    param_key: 'P4',
    title: 'Business',
    category: 'Business',
    question: 'Did the coach build rapport, explore potential, and pitch products effectively?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'eq_bus_1', title: 'Did the Coach make efforts to build rapport?', mandatory: true },
      { id: 'eq_bus_2', title: 'Did the coach ask pertinent questions to understand the potential of the customer? Explore about existing investment patterns / investment experience of the customer ?', mandatory: true },
      { id: 'eq_bus_3', title: 'Did the Coach explore for further business opportunities? Was the Coach able to effectively brief and pitch our Products?', mandatory: true },
      { id: 'eq_bus_4', title: 'Did the coach use effective persuasive skills, negotiation skills to close the sale? Did the coach create urgency with valid examples & reasons?', mandatory: true },
      { id: 'eq_bus_5', title: 'Was the coach able to handle all the objections effectively?', mandatory: true },
    ],
  },
  {
    param_key: 'P5',
    title: 'Domain',
    category: 'Domain',
    question: 'Did the coach address queries, pitch equity solutions, and share accurate product info?',
    fatal: false,
    weight: 1,
    rule: 'All subparameters must pass for 1 mark. If any subparameter fails, 1 mark is deducted.',
    subparameters: [
      { id: 'eq_dom_1', title: 'Is the coach knowledgeable about the products offered by the competitors/is he able to highlight the features of our product vis competitors?', mandatory: true },
      { id: 'eq_dom_2', title: 'Was the Coach able to address all the queries and offer solutions?', mandatory: true },
      { id: 'eq_dom_3', title: 'Was the coach able to help the investor navigate through our platform confidently?', mandatory: true },
      { id: 'eq_dom_4', title: 'Was the Coach able to effectively brief and pitch MSCI /MTF / Equity SIP /Others ?', mandatory: true },
      { id: 'eq_dom_5', title: 'Was the recommendation/Product information shared with the customer accurate and complete?', mandatory: true },
    ],
  },
];

/**
 * Returns the official parameters array for a given workspace ID
 */
export function getOfficialParametersForWorkspace(workspaceId: string): QualityParameterCategory[] {
  if (workspaceId === 'customer_support') {
    return CUSTOMER_SUPPORT_PARAMETERS;
  }
  if (workspaceId === 'equity_regular' || workspaceId === 'equity_onboarding') {
    return EQUITY_REGULAR_PARAMETERS;
  }
  if (
    workspaceId === 'mf_gold' ||
    workspaceId === 'mf_silver' ||
    workspaceId === 'mf_digital' ||
    workspaceId === 'mf_onboarding' ||
    workspaceId === 'mf_platinum'
  ) {
    return MUTUAL_FUND_PARAMETERS;
  }
  return [];
}

/**
 * Returns the official Scorecard Header title matching the exact specification images
 */
export function getScorecardHeaderTitle(workspaceId: string): string {
  if (workspaceId === 'customer_support') {
    return 'Support - Call Audit Quality Scorecard';
  }
  if (
    workspaceId === 'mf_gold' ||
    workspaceId === 'mf_silver' ||
    workspaceId === 'mf_digital' ||
    workspaceId === 'mf_onboarding' ||
    workspaceId === 'mf_platinum'
  ) {
    return 'Silver / Gold / Platinum - Call Audit Quality Scorecard';
  }
  if (workspaceId === 'equity_regular' || workspaceId === 'equity_onboarding') {
    return 'Equity Regular - Call Audit Quality Scorecard';
  }
  return 'Offline Pre Order Confirmation Call Audit Score Card';
}
