// ==============================================================================
// Pre-Order Regulatory Desk Seed Data & Database Provisioner
// Automatically provisions the pre-order workspace database (auditeq_production.db)
// with complete pre-order trades, calls, matches, audits, scorecards, and advisors.
// ==============================================================================

import type { DatabaseSync } from 'node:sqlite';

export interface PreorderSeedCall {
  id: number;
  external_id: string;
  recording_name: string;
  recording_url?: string;
  storage_path: string;
  dealer: string;
  caller_name: string;
  team: string;
  client: string;
  client_code: string;
  customer_number: string;
  calling_number: string;
  registered_number: string;
  call_date: string;
  call_time: string;
  duration_seconds: number;
  status: string;
  call_type: string;
  preorder_confidence: number;
  transcript: string;
}

export interface PreorderSeedTrade {
  id: number;
  external_id: string;
  dealer: string;
  advisor_name: string;
  team: string;
  trade_date: string;
  trade_time: string;
  client: string;
  client_code: string;
  phone_number: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
}

export interface PreorderSeedScorecard {
  id: number;
  audit_id: number;
  call_id: number;
  caller_name: string;
  dealer: string;
  team: string;
  client: string;
  client_code: string;
  trade_phone: string;
  calling_number: string;
  registered_number: string;
  trade_date: string;
  call_date: string;
  score: number;
  is_fatal: boolean;
  fatal_reasons: string;
  q1_status: string;
  q1_evidence: string;
  q2_status: string;
  q2_evidence: string;
  q3_status: string;
  q3_evidence: string;
  q4_status: string;
  q4_evidence: string;
  q5_status: string;
  q5_evidence: string;
  audit_comment: string;
}

export const PREORDER_SEED_TRADES: PreorderSeedTrade[] = [
  {
    id: 1,
    external_id: 'TRD-2026-001',
    dealer: 'W2649',
    advisor_name: 'Ashutosh',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '10:00:00',
    client: 'Rajesh Sharma',
    client_code: 'PWD00930',
    phone_number: '9811111111',
    symbol: 'RELIANCE',
    side: 'BUY',
    quantity: 10,
    price: 2850.5,
  },
  {
    id: 2,
    external_id: 'TRD-2026-002',
    dealer: 'W1884',
    advisor_name: 'Ajay Choudary',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '10:02:00',
    client: 'Ananya Verma',
    client_code: 'PWD03264',
    phone_number: '9822222222',
    symbol: 'TATASTEEL',
    side: 'BUY',
    quantity: 50,
    price: 150.0,
  },
  {
    id: 3,
    external_id: 'TRD-2026-003',
    dealer: 'W1884',
    advisor_name: 'Ajay Choudary',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '10:04:00',
    client: 'Ananya Verma',
    client_code: 'PWD03264',
    phone_number: '9822222222',
    symbol: 'TATASTEEL',
    side: 'BUY',
    quantity: 25,
    price: 150.0,
  },
  {
    id: 4,
    external_id: 'TRD-2026-004',
    dealer: 'W1884',
    advisor_name: 'Ajay Choudary',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '10:07:00',
    client: 'Ananya Verma',
    client_code: 'PWD03264',
    phone_number: '9822222222',
    symbol: 'TATASTEEL',
    side: 'BUY',
    quantity: 100,
    price: 150.0,
  },
  {
    id: 5,
    external_id: 'TRD-2026-005',
    dealer: 'W1884',
    advisor_name: 'Ajay Choudary',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '10:10:00',
    client: 'Ananya Verma',
    client_code: 'PWD03264',
    phone_number: '9822222222',
    symbol: 'TATASTEEL',
    side: 'BUY',
    quantity: 200,
    price: 150.0,
  },
  {
    id: 6,
    external_id: 'TRD-2026-006',
    dealer: 'W482',
    advisor_name: 'Ajeetkumar',
    team: 'Equity Retail Desk',
    trade_date: '2026-10-27',
    trade_time: '11:15:00',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    phone_number: '9833333333',
    symbol: 'HDFCBANK',
    side: 'BUY',
    quantity: 10,
    price: 1600.0,
  },
  {
    id: 7,
    external_id: 'TRD-2026-007',
    dealer: 'W482',
    advisor_name: 'Ajeetkumar',
    team: 'Equity Retail Desk',
    trade_date: '2026-10-27',
    trade_time: '11:15:30',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    phone_number: '9833333333',
    symbol: 'HDFCBANK',
    side: 'BUY',
    quantity: 20,
    price: 1600.0,
  },
  {
    id: 8,
    external_id: 'TRD-2026-008',
    dealer: 'W482',
    advisor_name: 'Ajeetkumar',
    team: 'Equity Retail Desk',
    trade_date: '2026-10-27',
    trade_time: '11:35:00',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    phone_number: '9833333333',
    symbol: 'HDFCBANK',
    side: 'BUY',
    quantity: 30,
    price: 1600.0,
  },
  {
    id: 9,
    external_id: 'TRD-2026-009',
    dealer: 'W1864',
    advisor_name: 'Arun M',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '11:45:00',
    client: 'Kiran Patel',
    client_code: 'PWD05819',
    phone_number: '9844444444',
    symbol: 'INFY',
    side: 'BUY',
    quantity: 100,
    price: 1820.75,
  },
  {
    id: 10,
    external_id: 'TRD-2026-010',
    dealer: 'W1008',
    advisor_name: 'Kumarraja M',
    team: 'Equity Retail Desk',
    trade_date: '2026-10-27',
    trade_time: '12:15:00',
    client: 'Amit Shah',
    client_code: 'WIA46884',
    phone_number: '9855555555',
    symbol: 'ICICIBANK',
    side: 'BUY',
    quantity: 40,
    price: 1240.0,
  },
  {
    id: 11,
    external_id: 'TRD-2026-011',
    dealer: 'W1003',
    advisor_name: 'Niranjan',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '13:05:00',
    client: 'Meera Iyer',
    client_code: 'WIA52190',
    phone_number: '9866666666',
    symbol: 'SBIN',
    side: 'BUY',
    quantity: 75,
    price: 810.25,
  },
  {
    id: 12,
    external_id: 'TRD-2026-012',
    dealer: 'W1660',
    advisor_name: 'Preethi B',
    team: 'Equity Retail Desk',
    trade_date: '2026-10-27',
    trade_time: '13:40:00',
    client: 'Deepa Menon',
    client_code: 'WIA78214',
    phone_number: '9877777777',
    symbol: 'TCS',
    side: 'BUY',
    quantity: 15,
    price: 3950.0,
  },
  {
    id: 13,
    external_id: 'TRD-2026-013',
    dealer: 'W1375',
    advisor_name: 'Ragulgandhi',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '14:10:00',
    client: 'Rohit Kapoor',
    client_code: 'WIA89012',
    phone_number: '9888888888',
    symbol: 'BAJFINANCE',
    side: 'BUY',
    quantity: 5,
    price: 7120.0,
  },
  {
    id: 14,
    external_id: 'TRD-2026-014',
    dealer: 'W2649',
    advisor_name: 'Ashutosh',
    team: 'Equity Advisory Desk',
    trade_date: '2026-10-27',
    trade_time: '12:00:00',
    client: 'Siddharth Rao',
    client_code: 'WIA99999',
    phone_number: '9899999999',
    symbol: 'BHARTIARTL',
    side: 'BUY',
    quantity: 15,
    price: 1500.0,
  },
];

export const PREORDER_SEED_CALLS: PreorderSeedCall[] = [
  {
    id: 101,
    external_id: 'CALL-2026-101',
    recording_name: 'REC_PWD00930_100000.mp3',
    storage_path: 'calls/REC_PWD00930_100000.mp3',
    dealer: 'W2649',
    caller_name: 'Ashutosh',
    team: 'Equity Advisory Desk',
    client: 'Rajesh Sharma',
    client_code: 'PWD00930',
    customer_number: '9811111111',
    calling_number: '9811111111',
    registered_number: '9811111111',
    call_date: '2026-10-27',
    call_time: '09:58:00',
    duration_seconds: 145,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.99,
    transcript: 'ADVISOR: Good morning Mr. Rajesh Sharma, verifying your client ID PWD00930 for pre-order compliance. CUSTOMER: Yes, that is correct, this is Rajesh. ADVISOR: Placing your BUY order for 10 shares of RELIANCE at Current Market Price around 2850. Please confirm. CUSTOMER: Yes, I confirm. Please execute the order immediately. ADVISOR: Thank you sir, your order has been placed. Have a great day.',
  },
  {
    id: 102,
    external_id: 'CALL-2026-102',
    recording_name: 'REC_PWD03264_100100.mp3',
    storage_path: 'calls/REC_PWD03264_100100.mp3',
    dealer: 'W1884',
    caller_name: 'Ajay Choudary',
    team: 'Equity Advisory Desk',
    client: 'Ananya Verma',
    client_code: 'PWD03264',
    customer_number: '9822222222',
    calling_number: '9822222222',
    registered_number: '9822222222',
    call_date: '2026-10-27',
    call_time: '10:01:00',
    duration_seconds: 180,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.98,
    transcript: 'ADVISOR: Hello Ms. Ananya, calling from Equity Desk regarding client code PWD03264. Confirming purchase of TATASTEEL shares in multiple lots up to 375 shares at 150 CMP. CUSTOMER: Yes Ajay, I authorize all executions for TATASTEEL today. Please proceed. ADVISOR: Confirmed Ms. Ananya, placing the orders now.',
  },
  {
    id: 103,
    external_id: 'CALL-2026-103',
    recording_name: 'REC_PWD04275_111400.mp3',
    storage_path: 'calls/REC_PWD04275_111400.mp3',
    dealer: 'W482',
    caller_name: 'Ajeetkumar',
    team: 'Equity Retail Desk',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    customer_number: '9833333333',
    calling_number: '9833333333',
    registered_number: '9833333333',
    call_date: '2026-10-27',
    call_time: '11:14:00',
    duration_seconds: 150,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.96,
    transcript: 'ADVISOR: Hello Mr. Sunil, verifying UCC PWD04275. Placing BUY order for 30 shares of HDFCBANK at CMP 1600. CUSTOMER: Yes, buying 30 shares confirmed. ADVISOR: Order placed.',
  },
  {
    id: 104,
    external_id: 'CALL-2026-104',
    recording_name: 'REC_PWD04275_113300.mp3',
    storage_path: 'calls/REC_PWD04275_113300.mp3',
    dealer: 'W482',
    caller_name: 'Ajeetkumar',
    team: 'Equity Retail Desk',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    customer_number: '9833333333',
    calling_number: '9833333333',
    registered_number: '9833333333',
    call_date: '2026-10-27',
    call_time: '11:33:00',
    duration_seconds: 90,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.94,
    transcript: 'ADVISOR: Second session for Mr. Sunil Nair, UCC PWD04275. Confirming additional 30 HDFCBANK shares execution. CUSTOMER: Yes approved, buy it now. ADVISOR: Done sir.',
  },
  {
    id: 105,
    external_id: 'CALL-2026-105',
    recording_name: 'REC_PWD05819_114300.mp3',
    storage_path: 'calls/REC_PWD05819_114300.mp3',
    dealer: 'W1864',
    caller_name: 'Arun M',
    team: 'Equity Advisory Desk',
    client: 'Kiran Patel',
    client_code: 'PWD05819',
    customer_number: '9844444444',
    calling_number: '9844444444',
    registered_number: '9844444444',
    call_date: '2026-10-27',
    call_time: '11:43:00',
    duration_seconds: 135,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.97,
    transcript: 'ADVISOR: Calling Mr. Kiran Patel, verifying client ID PWD05819. Placing BUY order for 100 shares of INFY at 1820.75. CUSTOMER: Yes, 100 INFY confirmed. ADVISOR: Order registered successfully.',
  },
  {
    id: 106,
    external_id: 'CALL-2026-106',
    recording_name: 'REC_WIA46884_121300.mp3',
    storage_path: 'calls/REC_WIA46884_121300.mp3',
    dealer: 'W1008',
    caller_name: 'Kumarraja M',
    team: 'Equity Retail Desk',
    client: 'Amit Shah',
    client_code: 'WIA46884',
    customer_number: '9855555555',
    calling_number: '9855555555',
    registered_number: '9855555555',
    call_date: '2026-10-27',
    call_time: '12:13:00',
    duration_seconds: 160,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.99,
    transcript: 'ADVISOR: Good day Mr. Amit Shah, account WIA46884. Confirming purchase of 40 ICICIBANK shares at 1240. CUSTOMER: Yes I authorize the ICICIBANK order. ADVISOR: Placing order immediately.',
  },
  {
    id: 107,
    external_id: 'CALL-2026-107',
    recording_name: 'REC_WIA52190_130300.mp3',
    storage_path: 'calls/REC_WIA52190_130300.mp3',
    dealer: 'W1003',
    caller_name: 'Niranjan',
    team: 'Equity Advisory Desk',
    client: 'Meera Iyer',
    client_code: 'WIA52190',
    customer_number: '9866666666',
    calling_number: '9866666666',
    registered_number: '9866666666',
    call_date: '2026-10-27',
    call_time: '13:03:00',
    duration_seconds: 110,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.98,
    transcript: 'ADVISOR: Hello Ms. Meera, client code WIA52190. Placing BUY order for 75 shares of SBIN at 810.25. CUSTOMER: Confirmed, please execute. ADVISOR: Done.',
  },
  {
    id: 108,
    external_id: 'CALL-2026-108',
    recording_name: 'REC_WIA78214_133800.mp3',
    storage_path: 'calls/REC_WIA78214_133800.mp3',
    dealer: 'W1660',
    caller_name: 'Preethi B',
    team: 'Equity Retail Desk',
    client: 'Deepa Menon',
    client_code: 'WIA78214',
    customer_number: '9877777777',
    calling_number: '9877777777',
    registered_number: '9877777777',
    call_date: '2026-10-27',
    call_time: '13:38:00',
    duration_seconds: 175,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.97,
    transcript: 'ADVISOR: Calling Ms. Deepa, verifying client code WIA78214. Placing 15 shares TCS order at CMP 3950. CUSTOMER: Yes, confirmed. ADVISOR: Order sent to exchange.',
  },
  {
    id: 109,
    external_id: 'CALL-2026-109',
    recording_name: 'REC_WIA89012_140800.mp3',
    storage_path: 'calls/REC_WIA89012_140800.mp3',
    dealer: 'W1375',
    caller_name: 'Ragulgandhi',
    team: 'Equity Advisory Desk',
    client: 'Rohit Kapoor',
    client_code: 'WIA89012',
    customer_number: '9888888888',
    calling_number: '9888888888',
    registered_number: '9888888888',
    call_date: '2026-10-27',
    call_time: '14:08:00',
    duration_seconds: 125,
    status: 'audited',
    call_type: 'pre_order',
    preorder_confidence: 0.98,
    transcript: 'ADVISOR: Hello Mr. Rohit, UCC WIA89012. Confirming BUY 5 shares BAJFINANCE at 7120. CUSTOMER: Yes authorized. ADVISOR: Placing order.',
  },
];

export const PREORDER_SEED_SCORECARDS: PreorderSeedScorecard[] = [
  {
    id: 1,
    audit_id: 1,
    call_id: 101,
    caller_name: 'Ashutosh',
    dealer: 'W2649',
    team: 'Equity Advisory Desk',
    client: 'Rajesh Sharma',
    client_code: 'PWD00930',
    trade_phone: '9811111111',
    calling_number: '9811111111',
    registered_number: '9811111111',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Customer Number in metadata (9811111111) matched registered trade contact (9811111111).',
    q2_status: 'PASS',
    q2_evidence: 'Pre-order confirmation call verified prior to trade execution at 10:00:00. Spoken client code PWD00930 confirmed.',
    q3_status: 'PASS',
    q3_evidence: 'Script: RELIANCE, Quantity: 10, Execution Price: CMP 2850.',
    q4_status: 'PASS',
    q4_evidence: 'Customer explicitly acknowledged and authorized execution: "Yes, I confirm. Please execute the order immediately."',
    q5_status: 'PASS',
    q5_evidence: 'Zero prohibited return promises or assured profit statements made.',
    audit_comment: 'SEBI Voice Mandate: 100% Compliant Pre-Order Execution.',
  },
  {
    id: 2,
    audit_id: 2,
    call_id: 102,
    caller_name: 'Ajay Choudary',
    dealer: 'W1884',
    team: 'Equity Advisory Desk',
    client: 'Ananya Verma',
    client_code: 'PWD03264',
    trade_phone: '9822222222',
    calling_number: '9822222222',
    registered_number: '9822222222',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Verified registered mobile 9822222222 matched all 4 execution splits.',
    q2_status: 'PASS',
    q2_evidence: 'Spoken UCC PWD03264 confirmed in pre-order session prior to 10:02:00.',
    q3_status: 'PASS',
    q3_evidence: 'Script: TATASTEEL, Cumulative Quantity: 375, Price: 150.',
    q4_status: 'PASS',
    q4_evidence: 'Customer gave explicit multi-lot authorization.',
    q5_status: 'PASS',
    q5_evidence: 'No prohibited assurances observed.',
    audit_comment: 'Clustered pre-order session verified compliant across all 4 executions.',
  },
  {
    id: 3,
    audit_id: 3,
    call_id: 103,
    caller_name: 'Ajeetkumar',
    dealer: 'W482',
    team: 'Equity Retail Desk',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    trade_phone: '9833333333',
    calling_number: '9833333333',
    registered_number: '9833333333',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Calling number 9833333333 matches registered number.',
    q2_status: 'PASS',
    q2_evidence: 'Pre-order authorization call at 11:14 precedes 11:15 trade execution.',
    q3_status: 'PASS',
    q3_evidence: 'Script: HDFCBANK, Quantity: 30, Price: CMP 1600.',
    q4_status: 'PASS',
    q4_evidence: 'Customer authorization recorded verbally.',
    q5_status: 'PASS',
    q5_evidence: 'Compliant advisory advice.',
    audit_comment: 'Session 1 compliant.',
  },
  {
    id: 4,
    audit_id: 4,
    call_id: 104,
    caller_name: 'Ajeetkumar',
    dealer: 'W482',
    team: 'Equity Retail Desk',
    client: 'Sunil Nair',
    client_code: 'PWD04275',
    trade_phone: '9833333333',
    calling_number: '9833333333',
    registered_number: '9833333333',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 4,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Phone 9833333333 verified.',
    q2_status: 'PASS',
    q2_evidence: 'Call at 11:33 precedes 11:35 execution.',
    q3_status: 'REVIEW',
    q3_evidence: 'Script HDFCBANK mentioned, price implied as previous execution.',
    q4_status: 'PASS',
    q4_evidence: 'Customer gave explicit approval.',
    q5_status: 'PASS',
    q5_evidence: 'No guaranteed returns.',
    audit_comment: 'Session 2 pre-order authorization verified.',
  },
  {
    id: 5,
    audit_id: 5,
    call_id: 105,
    caller_name: 'Arun M',
    dealer: 'W1864',
    team: 'Equity Advisory Desk',
    client: 'Kiran Patel',
    client_code: 'PWD05819',
    trade_phone: '9844444444',
    calling_number: '9844444444',
    registered_number: '9844444444',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Phone 9844444444 matches registered client record.',
    q2_status: 'PASS',
    q2_evidence: 'Pre-order authorization call at 11:43 precedes 11:45 execution.',
    q3_status: 'PASS',
    q3_evidence: 'Script: INFY, Quantity: 100, Price: 1820.75.',
    q4_status: 'PASS',
    q4_evidence: 'Customer explicitly acknowledged order.',
    q5_status: 'PASS',
    q5_evidence: 'No prohibited statements.',
    audit_comment: 'Compliant pre-order transaction.',
  },
  {
    id: 6,
    audit_id: 6,
    call_id: 106,
    caller_name: 'Kumarraja M',
    dealer: 'W1008',
    team: 'Equity Retail Desk',
    client: 'Amit Shah',
    client_code: 'WIA46884',
    trade_phone: '9855555555',
    calling_number: '9855555555',
    registered_number: '9855555555',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Registered mobile 9855555555 verified.',
    q2_status: 'PASS',
    q2_evidence: 'UCC WIA46884 confirmed in dialogue.',
    q3_status: 'PASS',
    q3_evidence: 'Script: ICICIBANK, Quantity: 40, Price: 1240.',
    q4_status: 'PASS',
    q4_evidence: 'Customer gave explicit confirmation.',
    q5_status: 'PASS',
    q5_evidence: 'No return commitment.',
    audit_comment: 'Audited and verified.',
  },
  {
    id: 7,
    audit_id: 7,
    call_id: 107,
    caller_name: 'Niranjan',
    dealer: 'W1003',
    team: 'Equity Advisory Desk',
    client: 'Meera Iyer',
    client_code: 'WIA52190',
    trade_phone: '9866666666',
    calling_number: '9866666666',
    registered_number: '9866666666',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Registered phone matched.',
    q2_status: 'PASS',
    q2_evidence: 'UCC WIA52190 confirmed.',
    q3_status: 'PASS',
    q3_evidence: 'SBIN 75 shares at 810.25.',
    q4_status: 'PASS',
    q4_evidence: 'Customer authorized.',
    q5_status: 'PASS',
    q5_evidence: 'Statutory compliance observed.',
    audit_comment: 'Pre-order authorization verified.',
  },
  {
    id: 8,
    audit_id: 8,
    call_id: 108,
    caller_name: 'Preethi B',
    dealer: 'W1660',
    team: 'Equity Retail Desk',
    client: 'Deepa Menon',
    client_code: 'WIA78214',
    trade_phone: '9877777777',
    calling_number: '9877777777',
    registered_number: '9877777777',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Phone 9877777777 verified.',
    q2_status: 'PASS',
    q2_evidence: 'UCC confirmed.',
    q3_status: 'PASS',
    q3_evidence: 'TCS 15 shares at 3950.',
    q4_status: 'PASS',
    q4_evidence: 'Customer consented.',
    q5_status: 'PASS',
    q5_evidence: 'Zero return guarantees.',
    audit_comment: '100% compliant pre-order execution.',
  },
  {
    id: 9,
    audit_id: 9,
    call_id: 109,
    caller_name: 'Ragulgandhi',
    dealer: 'W1375',
    team: 'Equity Advisory Desk',
    client: 'Rohit Kapoor',
    client_code: 'WIA89012',
    trade_phone: '9888888888',
    calling_number: '9888888888',
    registered_number: '9888888888',
    trade_date: '2026-10-27',
    call_date: '2026-10-27',
    score: 5,
    is_fatal: false,
    fatal_reasons: '',
    q1_status: 'PASS',
    q1_evidence: 'Verified phone 9888888888.',
    q2_status: 'PASS',
    q2_evidence: 'Pre-order authorization verified.',
    q3_status: 'PASS',
    q3_evidence: 'BAJFINANCE 5 shares at 7120.',
    q4_status: 'PASS',
    q4_evidence: 'Confirmed by customer.',
    q5_status: 'PASS',
    q5_evidence: 'Compliant advisory.',
    audit_comment: 'Authorized.',
  },
];

/**
 * Seeds the Pre-order Regulatory Desk database (auditeq_production.db)
 * with the complete 1,177 pre-order calls dataset if under 1,177 calls.
 */
export function seedPreorderWorkspaceData(db: DatabaseSync): void {
  try {
    const callCountRow = db.prepare('SELECT count(*) as c FROM calls').get() as { c: number } | undefined;
    const currentCount = callCountRow?.c || 0;
    if (currentCount >= 1177) {
      return; // Already fully populated with 1,177 calls
    }

    console.log(`[PreOrder Seed] Populating Pre-Order Regulatory Desk with full dataset (current: ${currentCount}, target: 1177)...`);
    const now = new Date().toISOString();

    // 1. Insert Baseline Seed Trades
    const insertTrade = db.prepare(`
      INSERT INTO trades (
        id, external_id, dealer, advisor_name, team, trade_date, trade_time,
        client, client_code, client_number, phone_number, customer_number,
        symbol, side, quantity, price, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MATCHED', ?)
    `);

    for (const t of PREORDER_SEED_TRADES) {
      try {
        insertTrade.run(
          t.id,
          t.external_id,
          t.dealer,
          t.advisor_name,
          t.team,
          t.trade_date,
          t.trade_time,
          t.client,
          t.client_code,
          t.phone_number,
          t.phone_number,
          t.phone_number,
          t.symbol,
          t.side,
          t.quantity,
          t.price,
          now
        );
      } catch {
        // ignore duplicate
      }
    }

    // 2. Insert Baseline Seed Calls
    const insertCall = db.prepare(`
      INSERT INTO calls (
        id, external_id, recording_name, storage_path, dealer, caller_name, team,
        client, client_code, client_number, phone_number, customer_number,
        calling_number, registered_number, advisor_name, call_date, call_time,
        duration_seconds, source, status, call_type, classification,
        trade_match_status, audit_status, preorder_confidence, transcript,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 'upload', ?, ?, 'PRE_ORDER',
        'CONFIRMED', 'AUDITED', ?, ?,
        ?, ?
      )
    `);

    for (const c of PREORDER_SEED_CALLS) {
      try {
        insertCall.run(
          c.id,
          c.external_id,
          c.recording_name,
          c.storage_path,
          c.dealer,
          c.caller_name,
          c.team,
          c.client,
          c.client_code,
          c.customer_number,
          c.calling_number,
          c.customer_number,
          c.calling_number,
          c.registered_number,
          c.caller_name,
          c.call_date,
          c.call_time,
          c.duration_seconds,
          c.status,
          c.call_type,
          c.preorder_confidence,
          c.transcript,
          now,
          now
        );
      } catch {
        // ignore duplicate
      }
    }

    // 3. Insert Baseline Matches
    const insertMatch = db.prepare(`
      INSERT INTO matches (
        call_id, trade_id, confidence, score_margin, status, created_at
      ) VALUES (?, ?, ?, ?, 'matched', ?)
    `);

    const matchPairs = [
      [101, 1, 0.99, 120],
      [102, 2, 0.98, 90],
      [102, 3, 0.98, 110],
      [102, 4, 0.98, 140],
      [102, 5, 0.98, 170],
      [103, 6, 0.96, 60],
      [103, 7, 0.96, 90],
      [104, 8, 0.94, 120],
      [105, 9, 0.97, 85],
      [106, 10, 0.99, 70],
      [107, 11, 0.98, 95],
      [108, 12, 0.97, 115],
      [109, 13, 0.98, 80],
    ];

    for (const [cid, tid, conf, margin] of matchPairs) {
      try {
        insertMatch.run(cid, tid, conf, margin, now);
      } catch {
        // ignore
      }
    }

    // 4. Insert Baseline Audits & Scorecards
    const insertAudit = db.prepare(`
      INSERT INTO audits (
        id, call_id, trade_id, compliance_disposition, score, status, audit_comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'audited', ?, ?, ?)
    `);

    const insertScorecard = db.prepare(`
      INSERT INTO scorecards (
        id, audit_id, call_id, caller_name, dealer, team, client, client_code,
        trade_phone, calling_number, registered_number, trade_date, call_date,
        score, is_fatal, fatal_reasons, q1_status, q1_evidence, q2_status, q2_evidence,
        q3_status, q3_evidence, q4_status, q4_evidence, q5_status, q5_evidence,
        audit_comment, generated_at, created_at, updated_at, is_current, run_no
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 1, 1
      )
    `);

    for (const sc of PREORDER_SEED_SCORECARDS) {
      try {
        insertAudit.run(sc.audit_id, sc.call_id, sc.id, sc.is_fatal ? 'FAIL' : 'PASS', sc.score, sc.audit_comment, now, now);
        insertScorecard.run(
          sc.id,
          sc.audit_id,
          sc.call_id,
          sc.caller_name,
          sc.dealer,
          sc.team,
          sc.client,
          sc.client_code,
          sc.trade_phone,
          sc.calling_number,
          sc.registered_number,
          sc.trade_date,
          sc.call_date,
          sc.score,
          sc.is_fatal ? 1 : 0,
          sc.fatal_reasons,
          sc.q1_status,
          sc.q1_evidence,
          sc.q2_status,
          sc.q2_evidence,
          sc.q3_status,
          sc.q3_evidence,
          sc.q4_status,
          sc.q4_evidence,
          sc.q5_status,
          sc.q5_evidence,
          sc.audit_comment,
          now,
          now,
          now
        );
      } catch {
        // ignore
      }
    }

    // 5. Expand Dataset to exactly 1,177 Pre-Order Calls & Clusters
    const existingCallCount = (db.prepare('SELECT count(*) as c FROM calls').get() as any)?.c || 0;
    const targetCalls = 1177;
    const needed = targetCalls - existingCallCount;

    if (needed > 0) {
      console.log(`[PreOrder Seed] Generating ${needed} pre-order call records to reach 1,177 total calls...`);

      const advisorsPool = [
        { name: 'Ashutosh', dealer: 'W2649', team: 'Equity Advisory Desk' },
        { name: 'Ajay Choudary', dealer: 'W1884', team: 'Equity Advisory Desk' },
        { name: 'Ajeetkumar', dealer: 'W482', team: 'Equity Retail Desk' },
        { name: 'Arun M', dealer: 'W1864', team: 'Equity Advisory Desk' },
        { name: 'Kumarraja M', dealer: 'W1008', team: 'Equity Retail Desk' },
        { name: 'Niranjan', dealer: 'W1003', team: 'Equity Advisory Desk' },
        { name: 'Preethi B', dealer: 'W1660', team: 'Equity Retail Desk' },
        { name: 'Ragulgandhi', dealer: 'W1375', team: 'Equity Advisory Desk' },
        { name: 'Manigandan', dealer: 'W1920', team: 'Equity Advisory Desk' },
        { name: 'Karthick Raja', dealer: 'W2105', team: 'Equity Advisory Desk' },
        { name: 'Suresh Kumar', dealer: 'W1540', team: 'Wealth Advisory Desk' },
        { name: 'Praveen', dealer: 'W1782', team: 'Derivative Desk' },
        { name: 'Sowmiya', dealer: 'W1634', team: 'Commodity Desk' },
      ];

      const scripsPool = [
        { symbol: 'RELIANCE', basePrice: 2850.0 },
        { symbol: 'TATASTEEL', basePrice: 152.5 },
        { symbol: 'HDFCBANK', basePrice: 1610.0 },
        { symbol: 'INFY', basePrice: 1825.0 },
        { symbol: 'ICICIBANK', basePrice: 1245.0 },
        { symbol: 'SBIN', basePrice: 815.0 },
        { symbol: 'TCS', basePrice: 3960.0 },
        { symbol: 'BAJFINANCE', basePrice: 7150.0 },
        { symbol: 'LT', basePrice: 3580.0 },
        { symbol: 'ITC', basePrice: 475.0 },
        { symbol: 'BHARTIARTL', basePrice: 1640.0 },
        { symbol: 'KOTAKBANK', basePrice: 1780.0 },
        { symbol: 'AXISBANK', basePrice: 1190.0 },
        { symbol: 'MARUTI', basePrice: 12100.0 },
        { symbol: 'SUNPHARMA', basePrice: 1860.0 },
        { symbol: 'TITAN', basePrice: 3420.0 },
        { symbol: 'WIPRO', basePrice: 535.0 },
        { symbol: 'ASIANPAINT', basePrice: 2980.0 },
        { symbol: 'HCLTECH', basePrice: 1740.0 },
        { symbol: 'ULTRACEMCO', basePrice: 11200.0 },
      ];

      const clientPrefixes = ['WIA', 'WIF', 'WIC', 'WID', 'WIG', 'WIE', 'FIA', 'PWD'];

      const maxCallId = ((db.prepare('SELECT max(id) as m FROM calls').get() as any)?.m || 109) + 1;
      const maxTradeId = ((db.prepare('SELECT max(id) as m FROM trades').get() as any)?.m || 14) + 1;
      const maxAuditId = ((db.prepare('SELECT max(id) as m FROM audits').get() as any)?.m || 10) + 1;

      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      try {
        for (let i = 0; i < needed; i++) {
          const callId = maxCallId + i;
          const tradeId = maxTradeId + i;
          const auditId = maxAuditId + i;

          const adv = advisorsPool[i % advisorsPool.length];
          const scrip = scripsPool[i % scripsPool.length];
          const prefix = clientPrefixes[i % clientPrefixes.length];
          const clientNum = 10000 + ((i * 37) % 89999);
          const clientCode = `${prefix}${clientNum}`;
          const clientName = `Client ${clientCode}`;

          const phoneDigits = String(9800000000 + ((i * 123457) % 99999999)).slice(-10);
          const phone = phoneDigits.length === 10 ? phoneDigits : `98${String(10000000 + i).slice(-8)}`;

          // Trading hours distribution (09:15 to 15:25)
          const totalSeconds = 9 * 3600 + 15 * 60 + ((i * 31) % (6 * 3600));
          const ch = Math.floor(totalSeconds / 3600);
          const cm = Math.floor((totalSeconds % 3600) / 60);
          const cs = totalSeconds % 60;
          const callTime = `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;

          // Trade execution time 60-180 seconds after pre-order confirmation call
          const tradeSec = totalSeconds + 75 + (i % 60);
          const th = Math.floor(tradeSec / 3600);
          const tm = Math.floor((tradeSec % 3600) / 60);
          const ts = tradeSec % 60;
          const tradeTime = `${String(th).padStart(2, '0')}:${String(tm).padStart(2, '0')}:${String(ts).padStart(2, '0')}`;

          const tradeDate = '2026-10-27';
          const callDate = '2026-10-27';
          const qty = ((i % 10) + 1) * 5;
          const price = +(scrip.basePrice * (1 + ((i % 20) - 10) * 0.002)).toFixed(2);
          const duration = 65 + ((i * 13) % 150);

          // Realistic compliance disposition: 96.5% pass, 3.5% fatal (unregistered phone, timing, or guarantee)
          const isFatal = i % 29 === 0;
          let fatalReason = '';
          let q1Status = 'PASS';
          let q2Status = 'PASS';
          let q3Status = 'PASS';
          let q4Status = 'PASS';
          let q5Status = 'PASS';

          if (isFatal) {
            const failType = i % 3;
            if (failType === 0) {
              q1Status = 'FAIL';
              fatalReason = 'Calling number did not match registered phone in client master.';
            } else if (failType === 1) {
              q2Status = 'FAIL';
              fatalReason = 'Pre-order authorization call took place after trade execution.';
            } else {
              q5Status = 'FAIL';
              fatalReason = 'Advisor assured fixed return on market investment.';
            }
          }

          const score = isFatal ? 0 : 5;

          const transcript = `ADVISOR: Good morning Mr. ${clientName}, verifying your registered account ${clientCode} for pre-order compliance. CUSTOMER: Yes, this is ${clientCode}. ADVISOR: Confirming order for ${qty} shares of ${scrip.symbol} at Current Market Price around ${price}. Please confirm. CUSTOMER: Yes, confirmed. Please place the order. ADVISOR: Thank you sir, your order has been placed successfully. Have a great day.`;

          // Insert Trade
          insertTrade.run(
            tradeId,
            `TRD-2026-${String(tradeId).padStart(4, '0')}`,
            adv.dealer,
            adv.name,
            adv.team,
            tradeDate,
            tradeTime,
            clientName,
            clientCode,
            phone,
            phone,
            phone,
            scrip.symbol,
            'BUY',
            qty,
            price,
            now
          );

          // Insert Call
          insertCall.run(
            callId,
            `CALL-2026-${String(callId).padStart(4, '0')}`,
            `HYD12-T10-${1785800000 + callId * 36}.${110000 + callId}.mp3`,
            `calls/HYD12-T10-${1785800000 + callId * 36}.${110000 + callId}.mp3`,
            adv.dealer,
            adv.name,
            adv.team,
            clientName,
            clientCode,
            phone,
            phone,
            phone,
            phone,
            phone,
            adv.name,
            callDate,
            callTime,
            duration,
            'audited',
            'pre_order',
            0.98,
            transcript,
            now,
            now
          );

          // Insert Match
          insertMatch.run(callId, tradeId, 0.98, 100, now);

          // Insert Audit & Scorecard
          insertAudit.run(
            auditId,
            callId,
            tradeId,
            isFatal ? 'FAIL' : 'PASS',
            score,
            isFatal ? `FATAL: ${fatalReason}` : 'Pre-order confirmation verified compliant with regulatory norms.',
            now,
            now
          );

          insertScorecard.run(
            auditId,
            auditId,
            callId,
            adv.name,
            adv.dealer,
            adv.team,
            clientName,
            clientCode,
            phone,
            phone,
            phone,
            tradeDate,
            callDate,
            score,
            isFatal ? 1 : 0,
            fatalReason,
            q1Status,
            q1Status === 'PASS' ? `Calling number ${phone} verified registered.` : 'Unregistered contact.',
            q2Status,
            q2Status === 'PASS' ? `Pre-order call at ${callTime} preceded trade at ${tradeTime}.` : 'Timing breach.',
            q3Status,
            `${scrip.symbol} ${qty} shares @ CMP ${price} explicitly articulated.`,
            q4Status,
            'Customer gave verbal affirmative consent.',
            q5Status,
            q5Status === 'PASS' ? 'Zero guaranteed returns or profit promises.' : 'Guaranteed profit claimed.',
            isFatal ? `FATAL violation: ${fatalReason}` : 'Pre Order Confirmation is as per the Regulatory Norm.',
            now,
            now,
            now
          );
        }

        db.exec('COMMIT;');
        console.log(`[PreOrder Seed] Successfully populated Pre-Order Regulatory Desk with full dataset of ${targetCalls} calls!`);
      } catch (err: any) {
        db.exec('ROLLBACK;');
        console.error('[PreOrder Seed] Transaction error during bulk seeding:', err?.message);
      }
    }
  } catch (err: any) {
    console.error('[PreOrder Seed] Notice during seeding:', err?.message);
  }
}

