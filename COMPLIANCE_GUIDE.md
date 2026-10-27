# ADAM-AR — SEBI Pre-Order Voice Quality & Regulatory Audit Guide

## 1. Regulatory Authority & Purpose
Pursuant to SEBI circulars governing stock brokers and trading members (*SEBI/HO/MIRSD/DOP1/CIR/P/2018/54* and related operational guidelines):
> **All stock brokers are mandated to maintain verifiable audio recordings of all client instructions received via telephone prior to placing orders in the trading system.**

ADAM-AR provides algorithmic, tamper-evident enforcement of this mandate across 100% of executed equity orders.

---

## 2. The 5-Parameter Regulatory Audit Matrix

| Parameter | Regulatory Intent | Mark | Severity | Passing Condition |
| :--- | :--- | :---: | :---: | :--- |
| **Q1: Registered Calling Phone (CLI)** | Identity Authentication | 1 | **FATAL** | Inbound caller CLI or outbound dialed number must match client KYC master mobile. |
| **Q2: Spoken Client Code (UCC)** | Account Verification | 1 | **FATAL** | Unique Client Code (e.g., `WIA43400`) must be explicitly verbalized prior to trade. |
| **Q3: Order Parameters Stated** | Contract Accuracy | 1 | Non-Fatal | Stock ticker, order side (Buy/Sell), quantity, and price/CMP confirmed. |
| **Q4: Client Verbal Assent** | Customer Consent | 1 | Non-Fatal | Unambiguous affirmative response from customer to dealer's order recap. |
| **Q5: Prohibition of Guaranteed Return** | Market Integrity | 1 | **FATAL** | Zero tolerance: Broker must never promise or imply guaranteed returns or fixed profits. |

---

## 3. Detailed Parameter Standards & Evidence Rules

### Parameter 1: Registered Calling Phone / CLI Match
- **Fatal Violation**: If a call connects from or to an unauthenticated number not listed in the client's KYC record, Q1 fails with a **FATAL VIOLATION**.
- **Exception**: Pre-authorized alternative emergency contact numbers filed in advance with compliance.

### Parameter 2: Spoken Client Code (UCC)
- **Fatal Violation**: The dealer or client must verbalize the UCC code.
- **Phonetic Recognition**: The platform accepts standard spoken variations (e.g., *"W I A forty-three four hundred"*, *"double-U I A four three four zero zero"*).
- **Timing Rule**: Must be stated prior to order placement, not as an afterthought post-execution.

### Parameter 3: Order Parameters (Symbol, Side, Qty, Price)
- All four key components must be established:
  1. **Symbol**: Security ticker recognized on NSE/BSE.
  2. **Side**: Explicit `BUY` / `PURCHASE` or `SELL` / `DISPOSE`.
  3. **Quantity**: Number of shares or lots.
  4. **Price**: Limit price or explicit acceptance of `CMP` / `Market Price`.

### Parameter 4: Explicit Customer Verbal Assent
- The client must clearly say *"Yes"*, *"Confirm"*, *"Place it"*, *"Proceed"*, or vernacular equivalents (*"Haan kar dijiye"*, *"Sari, potrunga"*).
- Ambiguous utterances or silence invalidate Q4.

### Parameter 5: Prohibition of Return / Profit Guarantee
- **Fatal Violation**: Any statement promising returns (e.g., *"This stock is 100% guaranteed to double"*, *"You will definitely make 20% by expiry"*) results in immediate score collapse to `0/5` with a high-priority compliance escalation flag.

---

## 4. Scoring Logic & Compliance Dispositions

- **Score 5 / 5**: **PERFECT COMPLIANCE** — All 5 parameters satisfied.
- **Score 4 / 5**: **COMPLIANT** — One non-fatal parameter failed (e.g., minor Q3 price confirmation gap), no fatal violations.
- **Score 3 / 5**: **MARGINAL / REMARKS** — Both non-fatal parameters failed, no fatal violations.
- **Score 0 / 5**: **FATAL VIOLATION** — Any fatal parameter failed (Q1, Q2, Q5, or missing pre-order recording).

---

## 5. Missing Pre-Order Calls (Zero-Tolerance Enforcement)

When an executed trade appears in the broker's trade book without an authentic preceding telephone recording:
1. The trade is classified as **MISSING PRE-ORDER CALL**.
2. Score is deterministically assigned as **0 / 5** with disposition **FATAL_VIOLATION**.
3. Evidence log records: `Missing pre-order call recording: trade executed without prior authenticated phone call.`
4. The client's registered KYC phone number is auto-resolved from the master directory to guarantee complete traceability for regulatory inquiries.
