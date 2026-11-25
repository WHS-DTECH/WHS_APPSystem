# WHS Student Tracker: read-only ChatGPT integration

## Architecture and initial scope

The public MCP endpoint belongs to Core, where the school's existing sign-in,
Teacher Planner MCP OAuth provider, role checks and KAMAR permissions already
live. Student Tracker keeps its own database and existing audit calculation
model. Core does not connect directly to that database.

1. ChatGPT obtains a separate `tracker:read` OAuth grant from Core.
2. Core checks the active account, Tracker access and current verified department
   HoLA/Global ADMIN authority on every MCP request.
3. Each tool rechecks the requested year's department scope. Audit reads obtain
   the existing permission-checked preserved timetable roster.
4. Core sends a short-lived HMAC-authenticated request to Tracker's fixed
   internal reader. The roster travels only between these existing first-party
   services over HTTPS; it is never returned to ChatGPT.
5. Tracker reads its saved PDF evidence, review decisions and name corrections,
   calls the same `audit`, `summary` and `pdfOnlyGroups` functions as the page,
   and explicitly projects aggregate fields only.
6. Core validates the complete response against a strict output schema before
   returning it to ChatGPT.

There are no sync, mutation, raw student, arbitrary URL, SQL, file-download or
Trello tools. OAuth codes/grants are the only new database tables, in Core
migration `059_student_tracker_mcp.sql`; no audit/business tables are added.
Existing Student Tracker and Planner interfaces are unchanged.

### Existing page and source inventory

| Existing page | Existing sources | First MCP release |
| --- | --- | --- |
| `/` Student search | Core Tracker service; current/preserved KAMAR student and timetable data; department class links | Excluded: student-identifiable results |
| `/setup` Setup Student Tracker | Core departments, linked classes, current staff, reviewed website leadership and module roles | Excluded: management functions and staff/account details |
| `/profile` Student profile | Authorised Core student/timetable/planning data; Tracker awards and shared per-student report evidence | Excluded: student-identifiable results |
| `/attendance` Student attendance | Core permissions and KAMAR membership; saved Teacher Planner teaching-log marks and school term dates, not the official KAMAR attendance register | Excluded: individual attendance |
| `/awards` Award Calculator | Existing Core roster plus Tracker's stored KAMAR CSV/PDF award evidence and existing ranking calculations | Excluded initially: student-identifiable rankings |
| `/department-awards-audit` Department Awards Audit | Core preserved term rosters; read-only Drive PDF source reader; shared `tracker_pdf_awards` evidence; `tracker_audit_reviews` and `tracker_audit_name_corrections`; existing shared audit model | Aggregate summaries only |

The existing browser entry points are `GET /api/session`,
`POST /api/tracker`, `POST /api/export/:format` (`csv`, `pdf`),
`POST /api/awards/:operation` (`data`, `student`, `history`, `preview`, `import`,
`sync-pdfs`) and `POST /api/audit-reviews/:operation` (`data`, `save`, `remove`,
`save-name`, `remove-name`). None accepts MCP grants or is proxied by the MCP.
Existing standalone sign-in/callback, logout, navigation, module search, health
and static framework routes remain separate.

Browser sign-in already uses Core's module OAuth handoff with PKCE and a
server-side module token. Browser mutations retain their existing Origin and
form-token checks. The new reader is mounted separately before those browser
guards and requires its own signed server-to-server request, not a browser
session or external MCP bearer token.

Junior and Middle reporting are filtered views of the existing Department
Awards Audit, not invented pages. Only `department-awards-audit` is allowlisted.
The general student-search filters are broader than this audit's filters; they
are deliberately not advertised as MCP capabilities.

## Endpoint and OAuth

With Core's existing public origin:

```text
MCP: https://whs-appsystem.onrender.com/integrations/student-tracker/mcp
Issuer: https://whs-appsystem.onrender.com/integrations/student-tracker
Authorisation: <issuer>/oauth/authorize
Token: <issuer>/oauth/token
Revocation: <issuer>/oauth/revoke
Issuer metadata:
https://whs-appsystem.onrender.com/.well-known/oauth-authorization-server/integrations/student-tracker
Protected-resource metadata:
https://whs-appsystem.onrender.com/.well-known/oauth-protected-resource/integrations/student-tracker/mcp
```

Use the actual HTTPS Core `APP_BASE_URL` if it differs. Original record links
open:

```text
https://whs-techstudent-tracker-development.onrender.com/department-awards-audit?year=2026
```

| Setting | Value |
| --- | --- |
| Proposed ChatGPT app name | **WHS Student Tracker** |
| Transport | Stateless Streamable HTTP, JSON responses |
| OAuth client ID | `student-tracker-chatgpt` |
| Client authentication | Public client: `none`; no client secret |
| Grant | Authorisation code, PKCE **S256** required |
| Scope | `tracker:read` only |
| Resource/audience | Exact MCP endpoint URL above |
| Access-token lifetime | Eight hours, non-sliding; reconnect after expiry |
| Refresh tokens / dynamic registration | Not implemented |
| Consent | Existing Core school sign-in followed by explicit read-only consent |

Register **exactly** the callback ChatGPT shows. Supported callback forms are
`https://chatgpt.com/connector/oauth/<connector-id>` and
`https://chatgpt.com/connector_platform_oauth_redirect`, without query, fragment,
credentials or port. Do not guess the connector ID or copy the Planner callback
unless ChatGPT explicitly supplies that same URI.

Planner and Tracker use separate clients, scopes, resources, consent state and
hashed code/token tables. Tracker uses a path-specific issuer so it cannot
replace Planner's existing root issuer metadata. One-use codes expire after five
minutes. Consent is CSRF-protected and bound to the user, client, callback,
challenge, state and resource. Loss of current department authority invalidates
access even before the token's expiry.
School sign-in preserves the complete allowlisted MCP authorisation return URL
within a bounded cookie budget, rather than truncating OAuth state. Other app
return paths retain their existing limit; oversized MCP returns fail explicitly.

## Render configuration

Configure these on **Core / WHS_APPSystem**:

| Environment variable | Purpose |
| --- | --- |
| `APP_BASE_URL` | Existing HTTPS Core origin |
| `STUDENT_TRACKER_MCP_APP_URL` | `https://whs-techstudent-tracker-development.onrender.com` |
| `STUDENT_TRACKER_MCP_REDIRECT_URI` | Exact callback shown for this ChatGPT app |
| `STUDENT_TRACKER_MCP_BRIDGE_KEY` | Dedicated random 32-byte, base64url-encoded key (43 characters) |

On **Student Tracker**, configure the identical
`STUDENT_TRACKER_MCP_BRIDGE_KEY`. Keep its existing `DATABASE_URL`,
`APP_BASE_URL`/`RENDER_EXTERNAL_URL`, `GLOBAL_CONTROL_URL`, `MODULE_CLIENT_ID` and
session settings unchanged. Core keeps its existing KAMAR/Planner database
configuration; no Tracker database credential is added to Core.

Generate the bridge key privately using a cryptographically secure secret
manager or Node's `crypto.randomBytes(32).toString('base64url')`. Do not put its
value in Git, ChatGPT, browser code, logs or this document. It is not an OAuth
client secret. Do not reuse session secrets, Planner tokens or other API keys.
Rotate it on both services together.

The internal endpoint is `POST /integrations/mcp/read-audit` on Tracker. It is
not the ChatGPT MCP URL. Requests require a signed timestamp (within 60 seconds),
fixed method/path and body digest; the signature is checked before accepting
the roster body, followed by verification of the received bytes. Bodies are
bounded to 8 MB. Responses are aggregate-only and `Cache-Control: no-store`.

Deploy both repositories' `main` branches. Core's normal migration startup
creates the isolated OAuth tables. Missing/invalid origins disable this
integration; a missing callback leaves discovery available but OAuth/data
access disabled. A missing/mismatched bridge key fails the data read explicitly;
it never falls back to another database, student API or zero-count response.

## Tools and schemas

The complete machine-readable input/output schemas and descriptions are in
[student-tracker-mcp-tools.json](student-tracker-mcp-tools.json).
Authenticated MCP `tools/list` supplies the inline runtime schemas.

| Tool | Purpose and defaults |
| --- | --- |
| `list_available_pages` | Discover the one authorised audit page, current manageable departments, supported filters and actual saved PDF-audit years. Optional `year` defaults to the current Pacific/Auckland year. Does not read student rosters. |
| `get_page_data` | Existing teacher/class audit summaries. `year` required; defaults to all parts and no follow-up filtering. |
| `search_records` | Same source, filtered for follow-up. Defaults to `part: "reporting"`, `followUpOnly: true`. |
| `get_audit_status` | Same source and statuses for reporting/award evidence. Defaults to all parts and no follow-up filtering. |

The three record tools share this input shape; unknown fields are rejected:

```json
{
  "pageId": "department-awards-audit",
  "year": 2026,
  "departmentId": "<authorised department UUID from discovery>",
  "teacher": "VP",
  "subject": "DTECH",
  "classCode": "JPI-PIDTECH",
  "band": "junior",
  "semester": 2,
  "part": "reporting",
  "followUpOnly": true,
  "offset": 0,
  "limit": 50
}
```

Only `year` is always required. `departmentId` may be omitted only if exactly
one department is currently authorised. `pageId` defaults to the sole
allowlisted page. Optional filters combine using AND:

- `teacher`: exact uppercase staff code, not a student-name search.
- `subject`: existing audit families `DTECH`, `MPROG`, `WOOD`, `DVC`, `TEXTILES`,
  `FOOD`. Do not substitute Senior course codes or assume `HOSP` is an audit
  subject family.
- `classCode`: select an existing responsibility containing that exact class/
  markbook code. Consolidated groups retain their original combined roster and
  counts; this does not invent a separate sub-class calculation.
- `band`: `junior` (Years 7/8) or `middle` (Years 9/10).
- `semester`: `1` or `2`, the existing audit reporting-period filter.
- `part`: `all`, `reporting`, `slo`, `values` or `awards`.
- `followUpOnly`: retain states other than `complete`, `resolved`, `excluded`
  in the selected part. For awards this **includes recipient PDF evidence**,
  because review completion is not recorded. It does not assert an unfinished
  review or assign blame.
- `offset`: default 0, maximum 100000; `limit`: default 50, maximum 100.

Individual `yearLevel`, arbitrary reporting-period labels, term filtering,
free-text student queries, folder URLs and database/API paths are not supported.
Returned `terms` retain the existing Junior term/Middle semester provenance.
PDF-only rows have no verified semester and disappear when a semester is
selected, as on the original page.

### Output contract and interpretation

Every tool returns source page title/URL, applied filters, academic year,
retrieval time, known source timestamps, availability/completeness, warnings,
authorised page discovery and student-exclusion confirmation.

Record responses include:

- A stable opaque **responsibility** ID, not a student ID.
- A verified roster teacher's name/staff code, or `null` for an unverified PDF
  teacher; subject family, class codes, school band, semester and terms.
- `slo` and `values`: the source model's exact `status`, `state`, `entries`,
  `total`, `blanks`, `missing`, `checked`, `required`, plus aggregate
  `resolvedEntries`/`resolvedFields`. No source filenames, report fields,
  student rows, review notes, individual grades or staff email addresses.
- `awards`: exact status/state and aggregate `mohio`/`akoranga` counts when
  verified. Unknown/conflicting award evidence and PDF-only rows return `null`
  counts, not invented zero nominations.
- An original page `url` for every responsibility. The existing page supports
  a year link; other MCP filters may need selecting manually on that page.
- `pagination`: offset, limit, total **matching known responsibilities**, and
  `hasMore`. Repeat with the next offset until false.

Counts keep their existing model meanings. On roster-verified reporting rows,
`entries` counts students with checked required entries; `total` is the
reporting roster after existing review exclusions; `blanks` counts proven
blank **fields**, not distinct outstanding students; `missing` counts missing
student coverage. `checked`/`required` retain each source check's units.
On PDF-only rows these are PDF roster/field counts, not verified enrolment or
report completion. Do not calculate an unsupported school-wide total or label
`total - entries` as a verified outstanding-report count.

Status distinctions are inherited, not stored anew:

| Meaning | Existing evidence/status |
| --- | --- |
| Complete / incomplete reporting evidence | `Complete`, `Resolved`, `Incomplete` |
| Partial or conflicting evidence | `Part checked`, `Roster coverage gap`, `Insufficient SLO fields`, `Conflicting PDFs`, `PDF only` |
| Not applicable | `No reports required`, `Excluded 7S/8S` |
| Not yet checked | `Not checked` |
| No matching records | Available source, `records: []`, pagination total 0; not proof that all department reporting is complete |
| Data unavailable / not shared | `availability: "unavailable"`, `records: null`, `pagination: null`, explicit warning; never an outstanding count of zero |
| Award recipient evidence | `PDF checked`; **not** completed award review or official publication |

`sourceUpdatedAt.reports` is the last shared report sync;
`sourceUpdatedAt.awards` is the saved PDF snapshot update;
`sourceUpdatedAt.reviews` is the latest review/name-correction update where one
exists. Unavailable timestamps are `null`; the current roster is read fresh
but its source-update timestamp is not supplied by the existing service.

`sourceComplete` conservatively checks the whole department's known source
coverage, including missing terms/classes, identity-year conflicts, PDF-only
rows and unknown/partial checks. `complete` additionally requires the entire
matching result set in this response (offset 0 with no next page). These flags
describe data coverage, **not completion of the teachers' work**. A fully checked
source can prove incomplete reporting. `freshnessVerified` is always `false`:
this release does not read Drive again or trigger a UI sync.

## ChatGPT connection and acceptance check

1. Use a school-approved ChatGPT workspace whose administrator permits custom
   remote MCP apps and this data processing. Enable the available developer/
   custom-app workflow for that workspace.
2. Configure the app origin and bridge key on the two existing Render services
   and deploy. No separate MCP Render service or database is needed.
3. In [ChatGPT Plugins](https://chatgpt.com/plugins), choose **Add** (the plus
   button), then **Add custom MCP server**. Name it **WHS Student Tracker**,
   enter the **Core MCP URL**, and keep **OAuth** selected.
4. Expand **Advanced OAuth settings**. Use **User-Defined OAuth Client**, client
   ID `student-tracker-chatgpt`, a blank client secret, token endpoint auth
   method **none**, and the discovered default scope **tracker:read**. The
   **Callback URL** appears in this section. If manual endpoints are requested,
   use those above.
5. Keep this ChatGPT setup dialog open. Copy its exact callback into Core's
   `STUDENT_TRACKER_MCP_REDIRECT_URI`, save and redeploy Core. Starting another
   setup draft can produce a different callback; update Core if that happens.
   Once deployed, review the risk warning and choose **Create as a plugin**,
   then **Continue to WHS Student Tracker** when prompted. Creating the plugin
   alone does not complete school authorisation.
6. Sign in using the existing school login, review the school consent page and
   click **Approve read-only connection** yourself. Ordinary teachers without
   verified department management authority must be denied this first release.
   Successful linking returns to ChatGPT; the plugin's app details should show
   **Read 4**, with the four documented tools and no write tools.
7. Choose **Try in chat**, or type `@` and select **WHS Student Tracker**.
   Ask: "List available Student Tracker pages and departments for 2026."
8. Select the returned Technology department UUID. Ask for the 2026 Department
   Awards Audit, then Junior and Middle reporting separately. For follow-up,
   use `search_records` with `part: "reporting"` and the appropriate `band`.
9. Page through all results. Compare a known teacher/class's SLO, Values and
   award statuses/counts with the existing audit page using the same year,
   department, teacher, subject and semester. Compare against the last
   **shared** sync, not unsaved browser-only results. Refresh only through the
   existing page if newer PDF evidence needs sharing.
10. Check missing evidence is flagged, original links open, and no student names,
    identifiers, grades or review notes are returned. Requests for `profile`,
    `attendance`, student IDs, arbitrary URLs or write tools must fail.
11. For changes since a previous check, compare stable IDs, statuses and source
    timestamps. A disappeared/filtered row is not evidence of completion.
    Manage Trello separately using the existing ChatGPT connection.

## Validation and limitations

Local automated validation covers the real Express/OAuth/MCP transport:
school-session versus bearer separation, consent/CSRF, S256 PKCE, exact
callback/resource/scope checks, one-use hashed codes, eight-hour hashed grants,
expiry/revocation/current-access loss, separate issuer discovery, tool schemas,
strict allowlists, successful structured 2026 Junior/Middle calls and sanitised
source failures. Core data tests verify current department scope, signed
requests, existing roster actions, filters, provenance and private-output
rejection. Tracker tests compare projected counts/statuses directly with the
existing audit model, including reviews, PDF-only evidence, missing sources,
pagination and signed-body authentication. Existing Tracker tests and Planner
MCP regression tests are included.

Results: **72 Core MCP/permission tests and 81 Student Tracker tests passed**.
The global navigation suite is reported separately below. An additional
two-service smoke check passed through the actual Core reader, signed HTTP
bridge, Tracker audit model and strict output schema for all three record tools
in both school bands, plus an unavailable snapshot. All fixtures were synthetic.

Commands:

```powershell
# Core
node --test tests\teacher-planner-mcp.test.js tests\student-tracker-mcp.test.js tests\student-tracker.test.js
node --test tests\global-nav.test.js
# Student Tracker
npm test
```

The full global-navigation suite has one unrelated, pre-existing failure:
the account-role-link test expects 15 modules but the current catalogue has 18.
It fails identically with the unmodified `HEAD` navigation implementation.
The other 24 navigation tests, including the new bounded MCP login-return
regression, pass. This integration does not change module counts or that test.

Live acceptance on **25 November 2026** completed the actual school-user OAuth
consent and returned successfully to ChatGPT. ChatGPT discovered all four tools
under **Read**, with no write tools. A read-only chat test successfully called
`list_available_pages`, `get_page_data`, `get_audit_status` separately for Junior
and Middle reporting, and `search_records` for the authorised Technology
department in 2026. Core's sanitised runtime logs confirmed all five reads.
Responses contained original audit links, timestamps and explicit incomplete
source-coverage/freshness warnings. The record calls deliberately sampled two
responsibilities each; this was not a full manual audit of every record or an
independent live Drive refresh. Student-level queries, syncs, writes and Trello
operations were not used.

Other accounts/workspaces must still complete their own authorised linking.
The eight-hour grant is not permanent access, and a successful connection does
not certify that reporting or awards work is complete. No live school data needs
to be copied into test fixtures.

Initial limitations: one real page; Junior/Middle teacher/class aggregates;
latest shared PDF evidence only; no official publication/completed-award-review
flag; no student details, live Drive refresh, audit history, scheduled polling,
Trello calls or writes.
