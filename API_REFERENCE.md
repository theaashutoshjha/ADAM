# ADAM-AR / AuditEQ — Complete REST API Reference

## 1. Authentication & Global Conventions

All secured endpoints require an HTTP `Authorization` header containing a valid JWT Bearer token:
```http
Authorization: Bearer <jwt_token>
```
For media streaming endpoints (e.g., `<audio src="...">`), authentication is also accepted via the URL query parameter `?token=<jwt_token>`.

### Common Response Formats
- **Success**: `{ "ok": true, ... }`
- **Error**: `{ "ok": false, "error": "Descriptive error message" }`
- **Standard Date Format**: ISO 8601 `YYYY-MM-DD`
- **Standard Time Format**: `HH:MM:SS` (24-hour UTC or IST as normalized)

---

## 2. Calls & Audio Endpoints

### `GET /api/calls`
Retrieves a paginated list of calls with consolidated scorecard and trade linkage.
- **Query Parameters**:
  - `per_page` (number | `'all'`, default: `100`): Maximum records to return.
  - `type` (`'all'` | `'pre_order'` | `'regular'` | `'scrap'`): Classification filter.
  - `search` (string): Search query against caller ID, advisor, UCC, or customer phone.
  - `advisor` (string): Filter by advisor or dealer ID.
- **Response**: Array of `CallRecord` objects enriched with `scorecard_score`, `is_fatal`, `q1_status` to `q5_status`, `trade_symbol`, `customer_number`, and `client_code`.

### `GET /api/calls/:id`
Retrieves full details for a single call recording, including speech transcript, timestamps, word-level segments, matched trades, orders, and audits.
- **Path Parameters**:
  - `id` (integer): Database ID of the call.
- **Response**:
  ```json
  {
    "id": 190,
    "caller_id": "rec_HYD12-T10-1790830491.mp3",
    "customer_number": "9449817480",
    "calling_number": "9449817480",
    "client_code": "WIG68332",
    "advisor_name": "Siva S",
    "duration_seconds": 45,
    "transcript": "...",
    "segments": [ ... ],
    "scorecard": {
      "score": 4,
      "is_fatal": 0,
      "q1_status": "PASS",
      "q2_status": "PASS",
      "q3_status": "FAIL",
      "q4_status": "PASS",
      "q5_status": "PASS"
    }
  }
  ```

### `GET /api/calls/:id/audio`
Streams the binary audio file (`audio/mpeg` or `audio/wav`) for browser HTML5 playback with HTTP range request support.

### `POST /api/calls/bulk-audit`
Triggers immediate multi-threaded compliance audits for a batch of call IDs.
- **Request Body**:
  ```json
  {
    "call_ids": [190, 191, 192]
  }
  ```
- **Response**:
  ```json
  {
    "ok": true,
    "total": 3,
    "audited": 3,
    "blocked": 0,
    "failed": 0
  }
  ```

### `PATCH /api/calls/:id/reclassify`
Manually changes the classification of a call (`pre_order`, `regular`, or `scrap`).
- **Request Body**:
  ```json
  {
    "call_type": "pre_order"
  }
  ```

### `GET /api/calls/export-csv`
Exports calls filtered by category, advisor, and date range as an RFC 4180-compliant CSV spreadsheet.

### `GET /api/calls/download-zip`
Bundles filtered call recordings into a ZIP archive along with a manifest CSV file.

---

## 3. Pre-Orders & Executed Trades Endpoints

### `GET /api/preorder/results`
Retrieves pre-orders analysis, linking executed trade clusters to matching telephony recordings or flagging missing pre-order calls.

### `POST /api/preorder/find-and-audit`
Executes Stage 5 to Stage 9 of the pipeline: clusters executed trades, performs phonetic UCC and timestamp matching against audio recordings, evaluates 5 compliance parameters, and generates scorecards.

### `GET /api/trades`
Retrieves all trade execution records ingested into the platform.

### `POST /api/imports/trades`
Uploads and parses an institutional trade execution report (`.xlsx` or `.csv`).

---

## 4. Master Client & Advisor Registry Endpoints

### `GET /api/client-directory`
Retrieves the master KYC client directory mapping Client Codes (UCC) to verified mobile numbers.

### `POST /api/client-directory`
Uploads or updates the authoritative client directory. Automatically performs data healing across existing scorecards and trade entries.
- **Request Body**:
  ```json
  [
    {
      "client_code": "WIA43400",
      "phone_number": "9840143400",
      "client_name": "Preethi B Client - WIA43400"
    }
  ]
  ```

### `GET /api/advisors`
Retrieves official advisor and dealer records along with assigned branch emails and escalation CC matrices.

---

## 5. Telephony Integration & Tata Smartflo PBX

### `POST /api/webhooks/tata`
Receives live call completion webhooks and CDR payloads from Tata Smartflo PBX servers.

### `GET /api/calls/download-status`
Returns live progress telemetry of the background audio downloader (total recordings, downloaded, pending, errors).

### `POST /api/calls/download-recordings`
Triggers an automated background fetch of remote call recordings from PBX audio URLs.

---

## 6. Scorecard Distribution & Email Dispatch

### `POST /api/scorecards/send-email`
Dispatches an official SEBI compliance audit notification email to the primary dealer and compliance CC team.
- **Request Body**:
  ```json
  {
    "scorecard_id": 120,
    "to_email": "dealer@brokerage.com",
    "cc_emails": ["compliance@brokerage.com"],
    "subject": "Pre-Order Audit Scorecard: FATAL VIOLATION Notice"
  }
  ```

### `POST /api/scorecards/bulk-send-emails`
Dispatches batch compliance notices for all audited scorecards in the current run.

---

## 7. Diagnostics & System Telemetry

### `GET /api/health`
Returns system status, database connection state, memory usage, and background worker queue depth.

### `GET /api/stats`
Returns consolidated compliance KPIs:
- Total Calls Ingested
- Pre-Order Calls Identified
- Executed Trades Reconciled
- Compliant Pre-Orders (Score 4-5)
- Fatal Violations (Score 0)
- Missing Pre-Order Calls Count
