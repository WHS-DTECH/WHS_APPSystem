# WHS APPSystem

Unified Westland High School app shell for one Render Web Service and one Google Login configuration. Core data uses the shared Postgres database; DTECH keeps its existing separate legacy database.

## Private DTECH typing attendance connection

`POST /integrations/typing-attendance` is a read-only server-to-server endpoint for the DTECH-HUB Typing Kit. Configure a dedicated random `DTECH_TYPING_ATTENDANCE_KEY` (at least 32 characters) and `DTECH_TYPING_ATTENDANCE_OWNER_EMAIL` in Render. The owner must have active Teacher Planner access. The same key belongs only in DTECH-HUB's server-side `TYPING_ATTENDANCE_KEY`; its `TYPING_ATTENDANCE_URL` is `https://whs-appsystem.onrender.com/integrations/typing-attendance`. Do not commit real values or share database credentials.

The request contains only `studentEmail` and the Typing Kit Monday `startDate`; callers cannot choose a different register owner. The connector matches one current KAMAR student ID and the owner's saved automatic DTECH class tabs, then reads scheduled lessons from the private teacher timetable and saved attendance marks. School closures/holidays are excluded. Missing or ambiguous identity, timetable, class mapping or holiday data produces an explicit unavailable response rather than invented absences. Responses contain only that student's dated lesson marks, seven date-keyed weeks and a fetch timestamp, not student names, absence reasons or the private timetable URL. No records are written.

`POST /integrations/typing-attendance/batch` accepts `studentEmails` (up to 20 distinct school emails) and `startDate`, with the same authentication and owner. It shares the class, calendar, timetable and mark reads across the requested students. Identity or class membership failures are reported per student; shared-source failures make the batch unavailable. DTECH-HUB first shows saved typing results and book signatures, then adds attendance when it is ready. Deploy this endpoint before the DTECH-HUB batch client; the client temporarily uses individual reads if the endpoint returns 404.

For unavailable reads, check the `[typing-attendance] Read failed:` or `Batch read failed:` code in the service logs. Codes distinguish owner identity/access, student identity, school calendar, DTECH class mapping and teacher timetable configuration without logging private source URLs or student details.

The shared school calendar validates public holidays against govt.nz, with the official Employment New Zealand published tables as a fallback when the first source is unavailable. Both sources must provide a complete national/Westland date set for the requested year; unconfirmed dates still block attendance exemptions.

DTECH-HUB activates its one-test-per-attended-week requirement only once its server connection is configured, starting at **Typing Kit Week 5**. Fully absent weeks are excused without catch-up. Confirm the connection and student-visible marks before using these exemptions. These are private Teacher Planner records, not the official KAMAR register.

## What is included

- Google OAuth login using shared Render environment variables.
- Postgres-backed users, roles, permissions, modules, and sessions.
- Administrator dashboard.
- User profile page.
- Assign user roles page.
- Role permission management page.
- Module management page for future app areas as they are amalgamated.
- Role-aware dashboards for `Staff`, `Teacher`, `Student`, and `ADMIN` users.
- Direct teacher-to-module assignments managed by administrators.
- Initial Learning Sites integration with public entry point and Google-authenticated Relief Planning and ADMIN routes.
- Technology Hub public homepage with individually assigned Student and Teacher discipline access.
- Original DTECH-HUB pages at `/dtech-hub/`, using the existing DTECH database and private teaching-file archive.
- Sewing Hub public homepage with assigned Student and Teacher activity access.
- Initial Kamar Uploader module under the ADMIN dashboard, with term-aware PostgreSQL uploads and history.

The **APPs Dashboard** (`/student-apps`) lists permitted projects as responsive
cards, with Grid/List controls and separate **Open app** and **Set up** actions.
Open app uses the existing checked `/student-apps/:slug/open` route and appears
when an active app has sign-in connected and roles mapped. Hosted apps use their
automatic school sign-in even when no external app URL is stored. Setup pages,
project visibility and GitHub import permissions are unchanged.
- Docker and Render Blueprint configuration.

## Shared module-sensitive search

The grant-authenticated `POST /module-auth/staff` bridge supplies Teacher Planner's
Teacher in Charge selector from Kamar Uploader's `staff_upload` table. It returns
by default only the ID, code, first name and surname of current, named staff, sorted by surname
then first name. It uses the existing module grant and current access check; no
Kamar admin login, school email addresses, student data or browser access to tokens
is needed. Staff upload failures return 502 rather than an empty list. Deploy
Global Control as well as Teacher Planner when introducing this integration.

Migration `037_kamar_departments.sql` moves the existing `food_room.department`
table, including its rows/IDs and owned sequence, into `public.department` under
Kamar Uploader ownership. A simple updatable `food_room.department` view preserves
Food Room's existing queries without widening its schema search path. Its CSV
assignment updates still work; its bulk-delete action now explicitly rejects
clearing the school-wide directory. The legacy importer targets the moved base
table. Website-only seed rows use negative IDs to avoid collisions with later
imports of original positive IDs.

The new `leadership_roles` JSONB array stores each staff member's department,
HOL/HOLA/TIC role, acting/on-leave flags, source URL and review date. Initial roles
were reviewed from the school staff page on 22 October 2026; this is a dated
snapshot, not an automatic appointment synchronisation. Acting leaders take
priority, substantive leaders remain stored, and ambiguous/unavailable leadership
does not produce an automatic default. Names are matched to current Kamar staff
only when unambiguous; otherwise the website name is retained for review.
Kamar's **Departments** page (`/admin/kamar-uploader/departments.html`) displays the
directory via the staff-authenticated `/api/feed/departments` endpoint. The module
staff bridge includes the same department choices/leaders without exposing emails by default.
Teacher Planner duty setup can additionally request `includeEmails: true`.
This requires global ADMIN or the requesting module's Lead Teacher role, and adds
`email_school` from the current Staff Upload to support code/first-name duty
mapping suggestions. Ordinary staff-selector requests and browser token handling
are unchanged. Deploy this bridge update before using the Planner's
**Build map from Staff List** action.

The Teacher Planner also uses grant-authenticated
`POST /module-auth/attendance-classes` with an integer `year` to build its private
attendance class tabs. This bridge is limited to the `teacher-planner` registered
module and current authorised module users. It returns current Student Timetable
upload class labels and student IDs/names for that upload year, plus the signed-in
teacher's matched `staffCode`, without student
emails, contact details or other directory fields. No attendance is written back
to KAMAR. This is a current roster source, not a historical enrolment service.
The verified sign-in email must match exactly one current Staff List code through
case-insensitive, trimmed `email_school`; caller-supplied emails/codes are not
used. Returned classes are filtered by the exact teacher-prefix tokens, including
shared slash-separated codes. Missing/ambiguous staff matches return 409 before
student lists are read; they never fall back to the full school directory.

Teacher Planner's Year overview can read selected-year Ministry term dates and
explicit between-term school holiday ranges through the grant-authenticated
`POST /module-auth/school-calendar` bridge. This uses the same Ministry source
as Global Control's **School Terms & Holidays** page; it does not expose Core
credentials or make requests directly from the module browser to Core.
National term opening/closing windows remain guidance, not confirmed WHS dates.
The same bridge includes national public holidays and Westland's observed
anniversary from govt.nz, retaining both actual and observed dates. Dates are
read from visible table text rather than potentially inconsistent HTML datetime
attributes. Public-holiday fetch failures are explicitly reported separately
so Ministry school breaks can still be displayed.
Attendance remains usable when government holiday dates cannot be loaded,
with a persistent warning to check dates before recording marks. Known public
holidays and school closures are still excluded. If the entire government
calendar is unavailable, Attendance uses published Planner Setup term dates;
term dates must still be configured before a register can be displayed.
Attendance class tabs with automatic timetable matching offer **Import KAMAR
attendance PDF into this class tab**. Upload the landscape **Student Attendance -
Two Week Overview** PDF (maximum 5 MB / 30 pages), review the preview, then confirm
**Fill blank marks**. Each student is matched by a unique full name to a saved
school student ID; their current school class memberships and the timetable for
each PDF week determine which teaching periods are eligible. Manual students,
ambiguous/unmatched names, future dates, known closures/holidays and dates outside
configured terms are skipped. Combined tabs do not import another class's periods
for students who are not members of that class.

The PDF's eight slot positions are preserved, including blank break positions.
Monday/Tuesday/Thursday/Friday use slots 2, 3, 5, 6, 8 for P1-P5; Wednesday uses
1, 2, 5, 6, 8. Whanau/Assembly and breaks are ignored. `*` becomes P, `L` becomes L,
and every other recorded code (including `?`) becomes A; genuine blanks stay
unrecorded. Existing nonblank marks are never overwritten, conflicts are shown,
and identical marks are skipped. Blank-only saves use revision checks and an
atomic database condition, so concurrent edits cannot be overwritten. If saving
stops part-way, completed-batch and any reported partial-batch counts are shown;
preview the PDF again to safely continue. Imports save up to 200 marks per
request instead of sending a separate request for each mark.
**Setup My Planner → Two-Week Attendance** opens an import
dashboard with term and saved-class selectors, one row per term week, and
**Synced** or **Not synced** indicators.
The selectors filter the history display only: uploading here previews and fills
all matching saved automatic class tabs, deduplicating shared student/period
marks. Manual tabs are explicitly skipped. Per-tab importing on **Attendance**
remains available.

History records the latest confirmed PDF coverage for each class/week: all
scheduled marks for matched students must be present to show **Synced**; missing
or future marks and unresolved students show **Not synced**. Conflicts are counted
separately and kept unchanged. These are PDF-coverage indicators, not a guarantee
that every saved mark agrees with KAMAR. Earlier marks do not imply a known PDF
import; re-preview their PDF and use **Record import status** to establish history
without changing marks. History is recorded only after the confirmed fills
finish; any failure stops with an explicit count and can be safely re-previewed.
History lives under `content.imports` in the existing owner/year attendance-groups
record, keyed by class UUID and Monday date. The private, CSRF-protected
`PUT /api/planner/attendance/:year/imports` records bounded coverage summaries and a
server timestamp; `GET` reads those summaries and weeks containing saved marks.
Class setup edits atomically preserve this metadata without altering import
timestamps or using import history as the class-edit revision. No schema migration
or separate database is needed.

Attendance and its Two-Week Attendance setup tab automatically create and refresh
class tabs from the current year's uploaded KAMAR student timetable, restricted
to the signed-in teacher's matched staff code (including shared-teacher classes).
No personal timetable subscription is needed to create tabs; the subscription is
still required for date-specific attendance/import scheduling. Teacher/room labels
are removed from tab names. Senior classes of the same subject sharing an uploaded
day/period slot are combined: `11DTECH` and `12DTECH` become `11/12DTECH`;
other subjects and junior classes stay separate. Split P1 slots remain distinct.
**Refresh timetable class tabs** retries or applies a newer upload without reopening.
Admin Google Drive imports also refresh the selected teacher's class tabs before
processing PDFs.

Existing school-linked tabs are regrouped and renamed automatically, retaining
stable tab IDs for unchanged memberships and all saved marks (which belong to the teacher,
student, date and period, not the tab). Manual-only tabs stay unchanged.
Students or class links no longer in the current upload remain in retained tabs;
manual students are never discarded. Class saves retain import history; admin
Drive settings and checkpoints are stored separately. Changed class/roster memberships get a new tab UUID, so a merged or
expanded class never inherits a smaller class's **Synced** status; re-sync its PDF
to record coverage without overwriting marks. Failed/missing uploads and revision conflicts display an explicit error
and leave saved tabs unchanged. Admin Drive settings and checkpoints use the
Teacher Planner database migration `014_admin_attendance_sync.sql`; attendance
marks remain in the existing owner-scoped Planner tables.

**Administrator Google Drive attendance imports** are managed from the ADMIN-only
**Attendance Admin** page in Kamar Uploader. Select the Planner year and current
teacher, configure the admin account's Drive folder, authorise read-only Drive
access, save/enable the folder and start an import. The connected admin account
must be able to read the selected folder. The integration lists and downloads
only direct PDF children of that folder, never writes to Drive, and never exposes
Google tokens to the browser. The existing Calendar OAuth project and
authorised redirect URI are reused; Google Drive API and the
`https://www.googleapis.com/auth/drive.readonly` scope may require school
administrator approval. Existing Calendar/Docs/Tasks grants are preserved.

The ADMIN-only **School Calendar** page in Kamar Uploader replaces the public
KAMAR School Events calendar formerly shown in My Planner Setup; each teacher's
private KAMAR timetable setup remains in Teacher Planner. The page derives a
reviewable set of dates from the public feed's first student day and four
`School Holidays` blocks. Publishing writes those dates to the existing shared
Planner settings for the year, so they apply to all staff, and preserves other
school settings such as teacher first day and school events. Publishing is
disabled when the public feed does not provide complete, ordered dates.

The server resolves the selected teacher's current KAMAR class timetable and
writes blank marks and import history to that teacher's existing private Planner
records. Existing marks are never overwritten. Folder settings and resumable PDF
checkpoints are scoped to the signed-in ADMIN, Planner year and selected teacher
in the separate Teacher Planner database. The importer accepts up to 1,000 PDFs
per folder listing and enforces the existing 5 MB PDF limit. Kamar Uploader shows
per-file counts, conflicts, match warnings and errors, but never returns or
renders student names, IDs or attendance marks. Teachers continue to view their
own records in Teacher Planner; the Teacher Planner pages no longer provide Drive
folder setup or a Drive sync button, while teacher-owned manual PDF preview and
import remain available.

The CSRF-protected ADMIN API lives under
`/teacher-planner/api/planner/google-calendar/attendance-admin`. Its role check
is enforced server-side, independently of the ADMIN-only navigation link. A
completed week in Teacher Planner indicates that an import-history record exists;
it does not prove that every student matched. Review the Kamar Uploader file-level
match warnings when attendance is missing.

The signed-in, CSRF-protected preview endpoint
`POST /api/planner/attendance/:year/import-preview` accepts `application/pdf`,
does not save the upload or write marks, and returns private, non-cacheable data.
Uploads are parsed locally on the application server without external services;
neither the source PDF nor its original detailed absence codes are retained.
Source failures return 502 rather than an empty success, and unsupported years
are explicitly marked unavailable. Module deployment is separate from Core.

The shared account header places search at the left, with a blue Sign out pill
immediately before the Google avatar at the right. Sign out uses the existing
school-session logout action and reports failures visibly; it is no longer
duplicated in the Global Control sidebar or avatar dropdown.

Signed-in users can search from the shared Google-avatar navbar. The placeholder
identifies the **current module**; submitting never searches other hubs or
capsules, and there is no all-modules option. Class Training's duplicate local
search form is removed, and its old `/search` route returns to the original home
page instead of running the former unscoped search.

| Current module | Searchable content |
| --- | --- |
| Class Training | Course catalogue titles/descriptions; enrolled students' lessons, sections, assignments and quizzes; teachers' own course content and Course Management |
| DTECH Hub | Original activity metadata, including assessments and projects; lesson/unit-plan metadata for current teachers only |
| Sewing Hub | Activity names, descriptions and categories; never teacher notes |
| Food Room Hub | Recipe names and descriptions |
| Workshop Hub | Stored worksheet and lesson-note titles and strand names, linked to their original files |
| WHS Learning Sites | Public course and assessment titles; Relief Plan/HOD navigation only for the applicable global roles |
| HUB Dashboard | Only the user's assigned learning spaces, or all spaces for global ADMIN |
| Guidance Counsellor App | Student ID/name from the original role-specific dataset: masked live names for ADMIN, dummy data for AppBuilder, live names for Counsellor; no notes or sessions |
| Kamar Uploader | Staff/student names and school email/student IDs, ADMIN only |
| APPs Dashboard | Only registry apps already visible to that user through the original dashboard query |
| Core Administration | Personal navigation; administrator navigation and active account names/emails for ADMIN only |

Results open existing pages/files; no legacy content is copied into a new search
database. Permissions are enforced on the server using current Core/module
authority, and hosted capsule searches run through the normal authenticated
proxy. Results are private/no-store, limited to 50, and require a 2–100 character
query. Provider failures display an error rather than pretending there are no
matches.

Search covers the metadata/content listed above, not file/PDF contents, external
Drive/GitHub/Trello services, or Workshop topics saved only in a browser's local
storage. Unrecognised/new hosted applications do not inherit another module's
search: they need an explicit permission-aware provider before displaying the
shared search bar. No additional environment keys or replacement databases are
required.

## Google-authenticated school Launchpad

The WHS_APPSystem root (`/`) is the Launchpad. `/launchpad` and the former
`/launchpad.html` address use the same authenticated handler. Signed-out visitors
see Google sign-in, not app cards; successful sign-in returns to the Launchpad
unless an app-specific return path was requested. Inactive accounts are denied.
Each new sign-in overwrites the previous return-address cookie; a sign-in without
an app destination returns to Launchpad rather than an abandoned earlier app.
The Launchpad sign-in link explicitly requests that return, and failed sign-in
shows retry guidance instead of silently displaying the same welcome page.
The template is private at [`views/launchpad.html`](views/launchpad.html), not a
public static file. Standalone downloads are retired (HTTP 410).
The Launchpad masthead uses the shared circular school logo, identical to the
original Kamar Uploader asset.
Its prominent **Something not working? Report a fault** button opens `/faults/new`,
replacing the School website link. Signed-out users sign in and return to the form.

The existing `modules` registry owns app destinations and active status.
Non-admin users see only individually assigned active modules: existing
`teacher_module_assignments` or whole-module `user_hub_roles` with `home.view`.
Global Teacher/Staff/Student roles and area-only assignments do not grant
Launchpad access. Active Global ADMINs can open all active modules. The dashboard
and shared module navigation use the same access query. Direct registered local
app paths are gated before module routers; existing app-specific permissions
continue to apply inside each app.
Global ADMIN retains direct Core administration access even if the Core card is
inactive, so administrators can restore registry configuration.

Every assigned app gets a default card. **Administrator Dashboard > Launchpad
Management** binds optional custom names, descriptions, icons, visibility and
order to a registered module. One custom card is allowed per module. Hiding a
card is presentation only: remove the assignment or deactivate the module to
revoke access. Custom links that cannot be mapped during migration are preserved
as drafts for administrator review.

Cards use stable relative `/launchpad/apps/<module-key>` links. These recheck
current access and resolve the latest destination from App Module Management.
Use local paths for integrated apps; retain HTTPS destinations for apps awaiting
migration. Migration 038 registers the existing Teacher Planner, International
and Bus Controller destinations from their development records without changing
their services or business databases. No user notifications are sent.

For deployment, apply migrations and check Launchpad cards, module activation and
existing assignments before directing users to the root URL. Set `APP_BASE_URL`
to the current WHS_APPSystem address. When a permanent domain becomes available,
update that value, Google OAuth callbacks, registered module origins and each
external module's `GLOBAL_CONTROL_URL`/callbacks as needed. Keep relative app
paths and assignments unchanged and redirect the old address while available.
Users then need only one Launchpad bookmark change.

This is the access/address foundation, not a migration of the three external
apps. Their old direct HTTPS addresses still have their own sign-in/permissions;
Global Control cannot revoke access enforced by an unchanged external service.
Before moving each app, verify its deployed source, database restore, identity
mapping, files, background jobs and integration behaviour using isolated test
data. Preserve its individual database and plan cutover/rollback before changing
its registry destination. Notify assigned users only after acceptance testing.

### Fault reporting and Helpdesk

Migrations 051-052 create and extend `helpdesk_faults` in Core `DATABASE_URL`.
Active signed-in users can report a fault or request a feature without a module
assignment, including when an app is missing from Launchpad. The form records
the authenticated reporter, report type, summary, module, optional named page
and details. Feature requests are suggestions for Helpdesk review and do not
promise implementation. The module dropdown uses
the signed-in user's active module assignments/permissions; Launchpad / school
account is always available for account or missing-app problems. The Page dropdown
updates for the selected module and lists curated main pages/sections, not private
records or documents. Modules without a maintained page catalogue (including
external apps) offer their registered Module home. Use **Not sure / whole module**
if the exact page is not listed. Module names and page links are validated against
current access on submission, not trusted from the browser. Only curated routing
queries/section fragments may be stored; users do not paste URLs. Do not include student records
or secrets. No screenshots or attachments are collected.

Reports are saved directly to the database, not dependent on email delivery.
After saving, Global Control's shared Gmail service emails the ticket number,
type, verified reporter, summary, module, selected page, details and an ADMIN
Helpdesk link to `tech@westlandhigh.school.nz`, with the reporter as Reply-To.
Delivery is recorded in the existing Email Service log. The submission confirmation
states whether email was sent; if delivery fails or Gmail is unconfigured, the
saved ticket remains available and users are warned not to submit a duplicate.
After submission, users receive a ticket number and can view only their own
reports and Helpdesk replies under `/faults` (**My fault reports**).
Global ADMINs manage all reports at `/admin/helpdesk` (**Administrator Dashboard >
Helpdesk**, also in shared navigation), filter by **Open**, **In progress** or
**Resolved**, and save a reply visible to the reporter. Updates use revision
checks to prevent one administrator overwriting another's changes. Lists are
paginated at 25 tickets. Forms require session CSRF tokens; submissions are
limited to five per IP per 15 minutes. Inactive users cannot report or manage.
The fault router precedes registered app guards so incorrect app assignments
cannot block reporting. Existing Contact Web Master email remains unchanged.
Shared navigation includes **Launchpad** between Dashboard and Profile.
The gold **Report a fault** pill sits in the shared top account bar beside Google
sign-in or sign-out/profile controls, including public pages and account-load
errors. It replaces the Launchpad-only masthead button. On smaller screens the
invitation text is shortened to keep account controls visible.

## Module Builder / Module Wizard

### GitHub and Render cost reporting

Global ADMINs can open **Core Administration > GitHub & Render Costs**
(`/admin/infrastructure-costs`). Use **Refresh provider costs & exchange rate**
to read every service/PostgreSQL database and workspace visible to the Render key,
and accounts, organisations and repositories visible to the GitHub token. The report
is not limited to Module Builder projects. Pagination includes Render previews
and database replicas, with duplicate IDs counted once. Provider access defines
the scope: resources outside the configured credentials' permissions cannot appear.

Optional `INFRA_COST_GITHUB_TOKEN` and `INFRA_COST_RENDER_API_KEY` provide reporting
access; otherwise the existing Module Builder credentials are reused. Prefer
dedicated read-only access where supported. GitHub account plans, organisation
seats and billing usage require appropriate owner/billing access; repository
access alone does not provide it. Missing credentials and permission failures
are shown explicitly, never as zero costs.

USD full-month compute estimates and GitHub subscriptions use a published-price
catalogue checked on 2 November 2026 ([Render](https://render.com/pricing),
[GitHub](https://github.com/pricing)). These prices are not automatically updated.
GitHub subscription fees are counted per account, not per repository.
Organisation month-to-date metered usage is requested separately through GitHub's
billing usage summary endpoint, when permitted; it is not added to monthly
subscription estimates. Actual invoices and personal GitHub metered usage are
not imported. Render workspace subscriptions, database storage, persistent disks,
Key Value, cron, bandwidth/build usage, tax, proration and discounts are excluded
or marked Unknown. This is a **partial planning subtotal, not the total bill**.
High-availability and unrecognised database plans are not given invented prices.
Suspended resources retain a full-month compute estimate, not an actual charge.

Indicative NZD conversions use ExchangeRate-API's public USD rate with its source
date and attribution. Rates older than seven days or failed refreshes disable
conversion rather than silently using an old rate. No account data or credentials
are sent to the exchange-rate provider. Read-only refreshes persist only allowlisted
inventory/cost metadata in Core's `infrastructure_cost_report`; no environment
values, database connection strings or provider response bodies are stored.
Last-successful data is retained and labelled stale when a provider refresh fails.
Refresh requires Global ADMIN access and a CSRF-protected POST.

### New development resource policy

Newly provisioned apps must be Docker **Web Services** with a connected, separate
PostgreSQL database. Both resources must be in **Oregon**, using the lowest paid
tiers: `0.5c-512mb` Web Service (USD 7/month per instance) and `0.1c-256mb`
database (USD 6/month compute), plus storage and other provider charges.
Legacy names `starter` and `basic_256mb` are accepted for those equivalent tiers.
Provisioning rejects other regions and free/higher plans before creating resources,
and checks the actual database's region/workspace/paid tier before connecting it.
New project environment rows default to this policy. Existing records and live
services/databases are not moved, resized or reconnected; older draft settings
must be saved with the policy values before new resources can be provisioned.
Existing non-policy infrastructure can still be recorded without altering it.
No GitHub subscription upgrade is performed automatically.

Global ADMIN can open **Modules > Module Builder** (`/module-builder`). The
dashboard registers development projects and records separate development,
staging and production infrastructure without executing their code in Core.
**In Development** appears below Modules, before Hubs. Deployed development links
open in a new tab; undeployed entries open their technical record instead.
Teacher Planner is seeded once with its existing GitHub repository and an explicit
warning to check for a surviving database. Its source and data are not changed.
International App and Bus Controller App are also registered with their existing
Render URLs in the development list. These are navigation/registry entries only:
they do not change the apps' source, databases or sign-in configuration.

The first approved framework is Node/Express. Global Control is the sign-in
authority for every new module, including separately hosted development services.
Teaching-module access is global ADMIN or a hub-wide Lead Teacher, Teacher or
Technician assignment for that project, checked server-to-server on every
application request. Core Administration, KAMAR Uploader and Module Builder
remain Global-ADMIN-only.
Its exported router can later accept Global Control's
server-authenticated identity; it does not trust identity headers. It deliberately
blocks application access until Global Control sign-in is configured. A healthy
deployment does not mean a finished or approved application.

Provisioning is optional. Configure these on the Global Control Render service:

| Variable | Purpose |
|---|---|
| `MODULE_BUILDER_GITHUB_OWNER` | Personal account or organisation for new private repositories; defaults to `WHS-DTECH` |
| `MODULE_BUILDER_GITHUB_TOKEN` | Dedicated token authorised for repository creation and Contents/Workflows write; for a personal owner it must belong to that account; never reuse the archive Writer credential |
| `MODULE_BUILDER_RENDER_OWNER_ID` | Workspace in which development resources are created |
| `MODULE_BUILDER_RENDER_API_KEY` | Dedicated Render API credential; treat as sensitive and restrict account/workspace access |
| `MODULE_BUILDER_RENDER_ENV_GROUP_ID` | Optional explicit ID (`evg-...`) of the module-safe shared group. When omitted, discover exactly one `WIZARD-Global-CONTROL` group in the configured workspace. Must contain only `GLOBAL_CONTROL_URL`, with no secret files; groups are never automatically created/modified |

The literal documentation placeholder `evg-...` is logged and treated as unset
for read-only discovery; other malformed explicit IDs fail rather than being ignored.

The wizard checks the GitHub owner type before creating a repository. Personal
accounts use the authenticated user's repository endpoint, after verifying the
token owner matches; organisations use the organisation endpoint.
GitHub organisation policy (where applicable) and Render's GitHub connection must permit access to
new private repositories. The wizard does not create that connection or Google
OAuth clients. Without credentials, records/navigation work but provider actions
show an explicit setup error. Do not paste credentials into project forms.

### New Development App (guided)

Open **Core Administration > New Development App** (`/module-builder/new`).
Enter a name and purpose; optionally select active named testers using separate
Staff and Students checkbox lists with name/email search. Both lists show every
current Kamar Uploader directory row, using Kamar names, school emails and staff
codes/student IDs. Accounts are matched by trimmed, case-insensitive school email.
People without an account, with an inactive account, missing email or ambiguous
account matches remain visible with a reason and a disabled checkbox. They must
complete school sign-in (or have their account corrected/reactivated) before
selection; this picker does not create accounts. Active accounts outside the
current directory remain under Other accounts. People present in both Kamar lists
appear in both; review deduplicates selected account IDs. Filtering does not clear
selections. A directory failure is reported rather than showing partial lists.
Access defaults
to Global ADMIN only. Selected testers receive this app's existing hub-wide
Teacher role, not a global role or access to other apps. No school-wide/public
access or Launchpad integration is automatically enabled.
Selecting a student as a tester still explicitly approves the app's Teacher tester
role; it does not introduce restricted student-facing app permissions.

Review the generated unique key, private repository, shared WHS Node/Express
starter, Oregon plans and minimum USD 13/month compute estimate (storage,
subscriptions, usage and tax additional/unknown). Provider credentials and the
module-safe shared group are checked read-only before approval; this cannot
guarantee repository creation/workflow permission, private-repository access from
Render or billing eligibility. Approve costs/access and type the app key.
Approval is persisted on the project; review forms expire after 30 minutes.

On its progress page, choose **Start / Resume approved setup**. The browser
requests one durable step at a time: repository, starter commit, separate paid
database, wait for availability, connected paid Web Service, wait for deployment,
then verify the shared group link and database health and grant approved testers.
The recorded service origin registers its Global Control identity automatically.
The resource checklist, provider links and recorded operations refresh after each
step/check, including failures. Waiting displays the observed Render deployment
state, check time and next-check interval; a disabled running button prevents
duplicate submits. A deployment failure stops setup and requires inspection of
the existing Render service logs, not registration of a replacement app.
Keep the page open; closing it pauses further steps, not an already-sent provider
operation. The page pauses after 15 minutes; reload/resume slow deployments.
Provider errors stop the workflow. Uncertain outcomes remain locked until inspected
and reconciled through technical details. No resources are deleted or recreated
automatically, and created resources remain billable even if later steps fail.
Changing reviewed settings stops guided provisioning; use the existing technical
workflow to review each subsequent action separately.

The final automatic check verifies the recorded workspace, Oregon paid resources,
starter commit, live deployment, shared group link and unauthenticated `/health`
response (`status: ok`, `database: connected`). Health requests go only to a
provider-returned default HTTPS `*.onrender.com` origin, without credentials or
redirects. Rechecks do not restore subsequently revoked tester grants. This is
**not** an authentication, application, backup, accessibility or full Advisory
acceptance test, nor approval to release or migrate existing data.
Test administrator/tester sign-in, unassigned-user denial, saving/reloading and
the app's other required behaviours before wider access or integration.

### Confirmed development provisioning (technical workflow)

1. Register a project with a unique key and intended embedded/independent hosting.
2. Record an existing repository **or** review/confirm creation of a private one.
3. For an otherwise unmodified wizard-created repository, review/confirm
   installation of the bundled Node framework, Dockerfile, manifest and CI.
   Existing repositories, including Teacher Planner, are never scaffolded over.
4. Inspect surviving Render resources. Record existing IDs or review/confirm
   creation of a separate development PostgreSQL 17 database.
5. Review/confirm web service creation. Automatic database wiring is restricted to
   databases created by this wizard, in the selected workspace/region, never Core.
   Existing databases can be configured manually in Render.
6. The wizard automatically links the configured module-safe Render Environment Group containing the shared, non-secret
   `GLOBAL_CONTROL_URL` (the HTTPS Global Control origin). Set per-site
   `MODULE_CLIENT_ID` to `project-key:development` (new services get this automatically).
   `APP_BASE_URL` defaults to Render's `RENDER_EXTERNAL_URL`. Register the exact
   app URL in the corresponding Module Builder environment.
   Keep each site's `DATABASE_URL` and `SESSION_SECRET` separate. Never link a
   development module to a group containing Core credentials or provisioning tokens.
   The group workspace and contents are checked before any service is created.
   Service IDs are persisted before linking; a failed/unconfirmed link locks the
   operation for inspection/reconciliation instead of creating a duplicate.
   The same validated `GLOBAL_CONTROL_URL` is also supplied at service creation
   so the first deployment does not race the group link. If the Core origin later
   changes, update this service-level value as well as the group. Existing services
   are not retroactively linked or changed.
7. Verify provider records, then test authentication, ownership, saving, migrations,
   backups and any print/export flows before staging/production approval.

External mutations require CSRF-protected approval, typed project-key
confirmation and cost/access acknowledgement: once for the fixed guided plan,
or per action in the technical workflow. Render may start a first deployment
on service creation; new development services auto-deploy each push to their
recorded GitHub branch (`autoDeployTrigger: commit`), without waiting for CI checks.
This default does not modify existing services or configure staging/production.
For an existing service such as Teacher Planner, enable Auto-Deploy in that
service's Render Settings to use the same behaviour. Free plans may be unavailable
or expire. Check Render pricing: the wizard does not promise costs or create paid
resources without the explicit confirmation.

Operation claims are durable and serialize mutations per project. Resource IDs
are recorded before dashboard updates. An ambiguous provider/network outcome
blocks edits and further provisioning. Inspect GitHub/Render, reconcile the
operation (stale running operations require five minutes), then record discovered
IDs before any retry. Resources are never automatically deleted on failure.
Archiving only removes development navigation; changing stage is metadata, not
production deployment/promotion.

The technical dashboard separates recorded configuration from last-checked
provider observations. It shows resource names/IDs, region, plan, branch, latest
deployment/commit, health path and environment-variable **names/purposes only**.
No database URLs, tokens or secret values are persisted/displayed; provider error
bodies are not logged because they can echo secrets. Environment-name presence
is not value validation; environment groups may require checking in Render.
Checks are explicit, never run during sidebar loading. Registered app origins
support HTTPS Render and other-provider/custom domains, without credentials,
non-default ports, paths, queries or fragments. Identity callbacks must match the
exact registered origin; changing it invalidates grants bound to the old address.
Automatic infrastructure provisioning remains Render-specific. Python templates
are not supported by this wizard.

Global Control identity uses state and PKCE, exact registered callbacks, single-use
60-second codes and eight-hour opaque grants, matching the Core and module session
cookie lifetimes. Grant expiry is fixed from sign-in, not a sliding idle timer;
typing alone does not renew it. Only hashes are stored centrally.
No Google client or session secret is copied to modules. Every application request
checks current account status and the global ADMIN or selected module role;
outages fail closed. Core and module
sessions are independent: use the module sign-out to revoke its grant immediately.
Core sign-out alone does not revoke an already issued module grant; renewed
module sign-in requires Core authentication. Role removal and module archiving
take effect on the next request. This is a module identity bridge, not a general OIDC provider.
Migration 028 updates the database default without extending any existing grant
or reviving expired grants. Sign in to the module again after deployment to
receive the eight-hour duration. Paid Render compute prevents free-service idle
sleep, but does not change these application authentication lifetimes. The module
also requires Core to respond to its identity check within 15 seconds.

Existing untouched wizard repositories can use **Update untouched module
framework**. The branch must still point to the recorded framework
commit; otherwise update through a reviewed code change. This does not migrate or
replace module business data. Existing services with Auto-Deploy off require
manual redeployment; newly created services deploy branch pushes automatically.
Separate standalone Google configuration is
no longer part of the generated framework.

New Node frameworks include a branded HTML homepage instead of a JSON response:
the existing shared header/avatar controls, Global Control search, a centred WHS
logo on white, and a centred footer. Shared header JavaScript and CSS are bundled
from Core during framework generation/update, not independently rebuilt.
Standalone search is forwarded server-to-server using the verified module grant;
results and Profile links go to Core. Sign-out revokes the local grant/session and
then signs out of Core. Embedded pages use Core's existing header injection.
Copyright month/year uses Pacific/Auckland; Last Updated is stamped during
framework installation/update. Future application releases should update
`UPDATED_AT` in their generated `shell.js`. Existing untouched frameworks can use
the guarded framework-update action, followed by deployment (manual if Auto-Deploy is off).

Development app links in the shared navigation and Module Builder open in the
current tab (GitHub/Render management links still open separately). The module
footer's **Contact Web Master** link opens Core's `/contact` form in the same tab.
Signed-in, active school users can send to `tech@westlandhigh.school.nz` through
the existing Global Control Gmail service (`src/email.js`), including its Email
Service log. The sender's verified school email becomes Reply-To; recipients
cannot be changed in the form. CSRF checks and a five-attempt/15-minute limit
protect submissions. Disabled/failed Gmail delivery is reported as not sent.
No Gmail credentials or additional email environment variables belong on modules.

The Module Builder detail page lists the latest basic framework services between
the Development and Staging cards: identity/avatar, current-role checks, Core
search, the Gmail-backed Web Master contact form, and shared branding/footer.
This is a framework reference, not a live readiness check for the recorded module;
older frameworks need updating/deploying and functional verification.

## Module-sensitive role views

Role View controls now describe the current module instead of always linking to
the Core dashboard. Core Administration retains its existing ADMIN/Teacher/Student
dashboard views. Other modules do not display those Core toggles.

Class Training is the first capsule with integrated Teacher View / Student View:

- Current DTECH teachers, Lead Teachers and global ADMIN can switch views.
- Teacher View opens the original Teacher Dashboard; Student View opens the
  original student dashboard using the signed-in person's own enrolments.
- The choice persists only for Class Training in that school session, including
  navigation, searches and subsequent requests. It does not change Global Control
  roles, the stored legacy role, or any other module.
- Student View reduces the effective capsule permissions, hiding teacher tools
  and blocking teacher-only actions. Switching back rechecks current authority;
  a revoked teacher cannot recover access with a saved view or a direct URL.
- Administrators use the contextual sidebar controls. Other authorised teachers
  get the same controls beside the avatar in the shared header.
- Course Management remains in avatar Settings, not the capsule's desktop/mobile
  navigation. Opening it from Student View restores Teacher View after checking
  current teacher access.
- Class Training's duplicate username/account dropdown and mobile Profile,
  Settings and Logout links are removed. Profile, Settings and Sign out use the
  shared Google-avatar menu; old capsule `/profile` and `/settings` URLs redirect
  to the shared profile. Original notifications and course navigation remain.

## DTECH Hub: original site, separate database and private files

The legacy URL adapter prefixes API paths without rewriting template expressions
or encoded query values (including comma-separated Trello connection lookups).
If Trello progress cannot load, the student table retains its Trello link and
shows the returned reason, including a missing student Trello connection.

DTECH Hub's Teacher View / Student View now uses the module-sensitive Global
Control toggle (sidebar for administrators, shared header for other authorised
teachers). Teacher View opens the original Teacher workspace; Student View opens
the original homepage. The session choice drives the original homepage, activity
details, standards and template-library modes, independently of Class Training.
The duplicate DTECH mode switch and initials/role badge are hidden; identity and
account actions remain in the shared Google avatar. Switching rechecks current
DTECH teacher permission and never grants roles or changes legacy data. As in the
original site, this is a content-view choice, not a reduction of server permissions.

The Google avatar's Settings menu includes **Homepage Event Settings** while in
DTECH Hub for current DTECH administrators (including global ADMIN). It opens the
original settings page with its existing 7/14/30-day browser-stored event window;
the original page access restrictions are unchanged. The duplicate Settings link
in the DTECH top bar is hidden; the homepage event-panel shortcut remains.

**Hub Management** in the same avatar Settings menu opens the original DTECH
Admin Menu for current DTECH administrators. The duplicate Admin Menu controls in
the DTECH top bar and local sidebar are hidden; the original management pages,
back links and administrator checks are retained.

Only the **Commenting and Debugging Training** homepage card is presented as a
burgundy **Capsule**, grouped/filterable under Capsules. Other Activity cards
and stored legacy categories are unchanged. Its link resolves the existing
**Programming Documentations** course (also accepting the singular title) and
uses the original course view with normal enrolment checks. Missing/ambiguous
course matches produce an explicit error, never a different course.

Homepage content requests share a single in-flight load, and repeated sign-in
UI updates do not reload the same account's activity, lesson and standard feeds.
The shared school profile is loaded before those requests. Assessment-card
schema preparation runs once per server instance (with retry after failure),
instead of issuing 20 schema queries on every read. Content is still read fresh
on page visits; role checks and the original legacy database remain unchanged.

The deployable copy in `src/legacy/dtech-hub` comes directly from
`LegacySites/TECH-HUB/DTECH-HUB`. Its HTML pages, styles, student activities,
assessment logic, learning pathways and teaching tools are retained, not rebuilt.
The hosting adapter adds `/dtech-hub` to local URLs at delivery time. The smaller
existing Technology Hub is a separate module and is not replaced.

### Render setup

1. On the main WHS APPSystem service, set **`DTECH_DATABASE_URL`** to the
   **Internal Database URL of the existing DTECH database**. Do not change
   `DATABASE_URL`, create a replacement database, or remove the existing service.
   DTECH reads and writes its existing database; it is not imported into Core.
2. Keep the existing private archive configuration connected:
   `GITHUB_ARCHIVE_REPOSITORY=WHS-DTECH/WHS-TECHArchive`,
   `GITHUB_WRITER_APP_ID`, and
   `GITHUB_WRITER_PRIVATE_KEY_FILE=/etc/secrets/github-writer.pem`.
   The Writer App must remain installed only on the private archive.
3. Optionally pin `DTECH_ARCHIVE_COMMIT` to
   `891697093a18cead43ead9bc5539635e56521c75` (the initial verified teaching-file
   archive). Without a pin, initialization restores the default branch at a
   single resolved commit. All 54 original TeacherFiles were archived privately;
   none are committed to this public application repository.
4. Retain any DTECH-specific optional integration settings from its old service:
   `GITHUB_TOKEN` for existing repository analysis, `TRELLO_API_KEY`,
   `EXTERNAL_EXAM_FORM_WEBHOOK_SECRET`,
   `SEARCH_KIT_REPORT_TEMPLATE_ID`, `STAFF_DIRECTORY_API_URL` and
   `STAFF_DIRECTORY_API_KEY`, where used. The archive App does not replace the
   existing student-repository analysis token. Do not copy the old `DATABASE_URL`,
   `PORT`, `AUTH_MODE` or developer-admin bypass settings into the shared service.
   The Relief Plan feed now reads the integrated Learning Sites calendar directly
   through the existing DTECH school-account check. `RELIEF_PLAN_ACCESS_KEY` is no
   longer used by integrated DTECH; no external calendar login/service is required.
5. Add the shared service's origin to the Google OAuth client's **Authorized
   JavaScript origins** for the existing Drive tools. DTECH uses the shared
   `GOOGLE_CLIENT_ID`; Drive permissions still require explicit consent by the
   same school account. Shared sign-in alone does not grant Drive scopes.
6. Deploy, sign in, and open `/dtech-hub/`. Under Core Administration, assign the
   DTECH Lead Teacher, Teacher and Technician roles as appropriate. Global ADMIN
   retains access. Legacy local role assignments are not imported or used as a
   second authority. **Student Admin is treated as ordinary Student and has no
   elevated access.** Original role-editor links now open the shared controls.
   Hub permission grants are editable through the existing Core role-permission page.

Existing documents restore from
`LegacySites/TECH-HUB/DTECH-HUB/TeacherFiles/` in the **private** archive into a
disposable local cache. The private student-folder CSV is not downloadable as a
website asset. New lesson resource/exemplar uploads are persisted as bytes in
`whs_teaching_files` in **DTECH's database before success**, then cached locally.
On redeploy, archived originals restore first and database uploads restore
afterward. DTECH's existing libraries, assessments and other uploads continue to
use their original database persistence. No persistent Render disk is required.
Restore limits are 200 archived files, 10 MiB each, 120 MiB total; new teaching
uploads retain the legacy limit of 25 MiB each.

The archive is a backup of the original documents, **not a backup of live DTECH
data or subsequent uploads**. Keep database backups/PITR enabled on the existing
Render database. Ordinary GitHub student-project imports still exclude private
data and remain separate. A missing database/archive connection gives an explicit
setup error; DTECH never falls back to a production in-memory database.
The original legacy schema initialization and existing seed/backfill operations
still run against DTECH-DB only on first use after each deployment. Take a Render
database backup before first activation. The rest of WHS APPSystem remains
available if DTECH initialization fails.
Some existing DTECH databases use course-based `lessons` (`course_id`, `title`)
and linked `sections`, rather than the supplied site's lesson-plan structure.
These tables are now read-only to the integrated Hub: no further ID conversions
or changes to their required fields/foreign keys are performed. This also supports
databases whose IDs were converted to text by the earlier compatibility update.
New-style lesson plans, uploads and unit-plan lesson cards use `whs_dtech_lessons`
in the same DTECH database when that older structure is detected. Databases already
using the supplied site's structure continue to use their original `lessons` table.

In **Browse > Relief Lessons Library**, **Existing Course Lessons** lists the original
lessons by course ID, with their content and ordered sections. This is a read-only
compatibility addition to the supplied page, not a replacement site. Stored HTML is
displayed as safe readable text; template paths and video references are retained.
Absolute HTTP/HTTPS references can be opened, but old relative template paths are
shown without inventing a new hosting location. Restoring those files may require
the original storage/location separately. Existing records are not copied to Core.

### Class Training: original DTECH activity

**Commenting and Debugging Training** opens at `/dtech-hub/class-training/`.
The shared sidebar lists **Capsule DASHBOARD** under **CAPSULES**, between HUBS
and STUDENT APPS. **HUB Dashboard** is the sidebar label for `/technology-hub/`;
**APPs Dashboard** opens `/student-apps`. These labels do not change routes or roles.
The HUB Dashboard's **Digital Technologies** card opens the original DTECH Hub
directly at `/dtech-hub/`. The old Technology Hub digital discipline URL redirects
there after its existing access check, rather than showing the placeholder page.
Original DTECH activity detail pages recognise the shared school session, so
Assessment Tasks and Projects open without a separate legacy Google token.
This is a DTECH submodule, **not a Student App**. Its deployable source is copied
from `LegacySites/ClassTraining/ClassTrainingSys` into
`hosted-apps/dtech-class-training`, retaining the original templates, assets,
checkers, courses and database models. Hosting changes replace local Google/password
sign-in and role editing with Core controls; they do not recreate the site.
The supplied section-based progress model is used by the course completion action.
Original course ownership still applies to teacher editing.
The capsule header and home hero use **DTECH Course Capsules**. Desktop and
mobile navigation label the original course catalogue **My Capsules**; dashboard
access remains available through the shared Teacher View / Student View controls
and the original routes, rather than a duplicate navbar Dashboard link.
**My Capsules** is a burgundy pill with white text beside the notification bell,
including on mobile.

Before activation:

1. Back up **DTECH-CLASSWORK-DB2** and keep
   `https://classtrainingsys.onrender.com` running during verification.
2. Set **`CLASS_TRAINING_DATABASE_URL`** on the main WHS APPSystem Render service
   to that existing database's **Internal Database URL**. Leave Core
   `DATABASE_URL` and `DTECH_DATABASE_URL` unchanged. This database is used for
   both existing and new training data; no records are copied into Core.
3. Redeploy the Docker service. No additional public service, Google OAuth
   credentials, training passwords or Student Apps registration are required.
   No training schema creation, seed, import or migration runs on startup.
   Missing configuration leaves this activity unavailable without disabling DTECH.
4. Verify with existing teacher and student school accounts. Matching is
   case-insensitive by email and retains the existing user ID and progress.
   Unmatched school accounts get a new student record. Duplicate email matches
   require administrator review rather than merging records.
5. Manage access in **DTECH Hub > Assign User Roles**. Global ADMIN and DTECH
   Lead Teacher/Teacher/Technician receive teacher tools; other active school users receive
   student access. The current Core role is checked on every request, including
   for old training accounts previously stored as teachers. Local role editors
   redirect to Core and cannot change that authority.
   Local User Roles and Permissions links are removed from desktop/mobile menus
   and the training Admin page; use the shared account controls instead.
   The original Admin Dashboard is labelled **Course Management**. While inside
   Class Training, its teacher tools also appear under the shared Google avatar's
   **Settings > Course Management**, using the same current DTECH teacher access.
6. Optionally set **`CLASS_TRAINING_CONTACT_EMAIL`** to the email of an existing
   training teacher for the original Contact Teacher button. The message uses
   the shared school Gmail configuration and email log, not standalone Gmail OAuth.
   Without a contact address, the original button reports that configuration is needed.

The existing DTECH activity URL is translated when served, not rewritten in the
database. The standalone site and database remain available; do not retire the
standalone service until live content, progress and teacher tools have been checked.
The exact live source revision has not been established: `ClassTrainingSys` was
selected from the supplied copies using the service name and matching homepage.
This integration is not a full repair/audit of unrelated legacy features.
For example, the supplied Share Your Feedback route references a removed
`LessonFeedback` model. It has not been reimplemented or given a new database
table; confirm that feature against the live standalone version before retiring it.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
3. Install dependencies:

```bash
npm install
```

For DTECH, also install its isolated original runtime dependencies (the Docker build does this automatically):

```bash
npm ci --omit=dev --prefix src/legacy/dtech-hub
```

4. Run database migrations:

```bash
npm run db:migrate
```

5. Start the app:

```bash
npm run dev
```

## Render setup

Use the existing Render Web Service with Docker.

The Docker image pins Node **22.23.4**, including the October 2026 Node security
and bundled certificate fixes. Builds also refresh the operating-system
certificate store. Local/native Node uses the matching `.node-version`; the
supported package range is `>=22.23.4 <23`.
After runtime security changes, use **Clear build cache & deploy** for every
Global Control Render service. Confirm the printed Node version in build logs
and run `node --version` in the deployed service shell before treating the
update as complete. Native Node services must not retain an older `NODE_VERSION`
override, which takes precedence over `.node-version`. Keep these pins current
with later Node security releases; a repository update alone does not patch
already-running containers.

New Node modules generated from `module-templates/node/` inherit the same
minimum patched Node version, a matching Docker/CI pin, and a refreshed
operating-system certificate store. Keep the template's engine, Docker, and CI
versions aligned when adopting later security releases, and redeploy each
affected service after updating it.

### Hosted Student Apps

All full HTML pages, including legacy and hosted pages, use the shared
`public/images/favicon.ico`. The `/favicon.ico` fallback serves that same file.
The shared top-right account header also appears on public pages, Hubs and hosted
Student Apps. Signed-out visitors see a blue Google sign-in button that returns
them to the page they started from. Signed-in users see only
their Google avatar (or initial), without an apps grid;
the account menu contains their name, email, Profile and Sign out. These controls
use the existing school OAuth session, not a second Google login. Route permissions
still apply to all app links. Only administrators receive the existing left sidebar.

Flask apps in `hosted-apps/<slug>/` with an `app.json` manifest run inside the
school Docker service through Gunicorn. Register the project with the matching
slug (for Guidance, use the name **Guidance Counsellor App**, producing
`guidance-counsellor-app`). Set `GUIDANCE_COUNSELLOR_APP_DATABASE_URL` on the main
service to retain its legacy database.

Hosted apps use the school sign-in wrapper automatically: students do not paste
the external sign-in route or load an app secret. After administrator registration,
check app access in step 3 and open the app. Guidance automatically connects the
platform Administrator to `ADMIN`, the registering Builder to `AppBuilder`, and
the selected client / Lead Teacher to `ADMIN` (full app settings access).
Migration 022 fills these mappings for existing Guidance registrations too.
Teacher and Technician map to Guidance's Counsellor role. Technician always uses
Teacher's mapping; it cannot be configured independently. Student remains optional
and disabled until an administrator or Lead Teacher enables it. Builders can
view the assigned accounts and mappings but cannot change access or grant
themselves app administration. Clients and assigned Lead Teachers can find the
project on the Student Apps dashboard and manage access.
Guidance uses the validated per-request role from Global Control, without reading
or writing its legacy role table. Its old User Roles and restore-admin endpoints
redirect to the global app-role assignment page; the User Roles navbar link is
removed and Open Admin Items opens that global page. Legacy local registration
and Google login endpoints are disabled when hosted.

Privacy remains separate from settings management: `AppBuilder` sees dummy data,
`ADMIN` (including the client / Lead Teacher) sees masked data, and only
`Counsellor` sees plaintext profiles and session details. Builders cannot write
student records or access spreadsheet upload/sync, and masked administrators
cannot delete students. To grant confidential-data access, an administrator or
Lead Teacher must explicitly map an optional school role to `Counsellor` and assign
that role through Global Control. A school administrator or client also holding
that optional role still gets the higher-priority masked `ADMIN` mapping.
The legacy encryption key is unchanged; secure key management is still required
before using real counselling notes.

Guidance's hosted layout sizes its navigation and app shell to the available
space between the school header and footer. Sidebar actions remain visible;
on narrow screens they move into a compact navigation row. Long student lists
and forms scroll within the main content area rather than moving the sidebar
buttons off screen. The dashboard cards adapt to the available space.
The hosted dashboard omits the legacy welcome, role summary and Logout link;
account details and sign-out are provided by the shared Google avatar menu.
On hosted Student App and setup pages, the avatar menu groups app controls under
Settings. Assign User Roles is available with the app's global `admin.manage`
permission. Guidance's Dataset Manager (formerly Infrastructure) is available
with a supported mapped app role, preserving dummy/masked/confidential views.
The existing `/infrastructure` URL remains valid. Neither control is duplicated
in the Guidance toolbar.
Sync Spreadsheets is on the Dataset Manager page, reached through avatar Settings,
rather than the toolbar. It remains ADMIN-only and returns its result to Students.
The hosted Guidance app omits the legacy top toolbar entirely, retaining its
sidebar navigation and the shared Google avatar menu.
The shared SEND-C app sidebar is also loaded on Dataset Manager, app setup and
the Guidance Assign User Roles page. It preserves existing contextual actions
(such as Add Student), supplies New Session on other pages, and uses a compact
navigation row on mobile. Settings links retain the current app context on the
role-assignment page. Authorization remains enforced by the existing routes.

### Private GitHub source archive

Administrators can open **Student Apps > GitHub Import / Archive**
(`/student-apps/github-import`). Students and Lead Teachers cannot import.
Register each project in Student Apps first. Enter its source repository and,
optionally, a branch/tag/commit. A preview resolves that reference to an immutable
commit, lists eligible and excluded files, and expires after one hour. The same
administrator must review the pinned source, acknowledge the exclusions and
separate data handover, and explicitly confirm before any source is written.

The importer uses two GitHub Apps, not a personal access token or school Google
credentials:

* **Reader:** repository Contents **read-only**, Metadata read-only, installable
  on any account. Each student/repository owner must install it on only their
  selected project repositories. Being a collaborator alone does not install it.
* **Writer:** Contents **read and write**, Metadata read-only, installable only
  on the school account and installed on **WHS-TECHArchive only**.
* Leave other optional permissions unset. No OAuth user authorization, client
  secrets, callbacks, device flow or webhooks are required for these manual
  imports. App JWTs generate short-lived installation tokens narrowed to the
  specific repository and Contents permission for each operation.

On the **main WHS APPSystem Render service** (not the legacy app services):

1. Under **Environment > Secret Files**, create `github-reader.pem` containing
   the complete downloaded Reader PEM, including its BEGIN/END lines. Create
   `github-writer.pem` using the separate Writer PEM. Never commit these files,
   paste them into chat, or put them into a student project's folder.
2. Add `GITHUB_READER_APP_ID` and `GITHUB_WRITER_APP_ID` using the **App ID**
   on each GitHub App's settings page (not Client ID or installation ID).
3. Add `GITHUB_READER_PRIVATE_KEY_FILE=/etc/secrets/github-reader.pem` and
   `GITHUB_WRITER_PRIVATE_KEY_FILE=/etc/secrets/github-writer.pem`.
4. Add `GITHUB_ARCHIVE_REPOSITORY=WHS-DTECH/WHS-TECHArchive`.
5. Save and redeploy. The existing migration runner applies
   `024_student_app_imports.sql`. The import page reports missing settings;
   configuration presence alone does not mean GitHub access has been verified.
6. Share the Reader App's public installation page with each student (GitHub App
   settings > Public page > Install). They select their project repository.
   Test one reviewed preview/import before handing over all eight projects.

No private source is stored in this public application repository or served
from its public/static folders. Source bytes are held in memory during an
operation. The database keeps preview metadata, the originating administrator,
source commit, exclusion reasons, status and the resulting private archive URL.
GitHub's API is the fixed network destination; repository input cannot select
arbitrary hosts. The destination is checked for private visibility before use.
Administrator confirmation uses a session CSRF token and an atomic one-time
preview claim. The Writer never writes to student repositories.

Snapshots are stored in the private archive as:

```
LegacySites/StudentApps/<registered-project-slug>/snapshots/<source-commit>-<review-digest>/
```

Each snapshot contains eligible files and `_whs-import.json` recording provenance,
date and omissions. Executable source modes are retained. Existing archive
content is preserved, duplicate snapshots are rejected, and branch updates
never force-push. A concurrent GitHub update requires a fresh preview.
The importer stops on incomplete listings or more than **300 repository files**,
**1 MiB per eligible file**, or **15 MiB total eligible source scanned**; larger
projects require a separate handover rather than a partial success.

Common credentials, private keys, database files/dumps, spreadsheets, runtime
uploads/backups, dependency/build folders, symlinks, submodules and LFS pointers
are excluded and listed. Embedded-token/credential checks are precautionary,
**not a guarantee**: an administrator must inspect the linked pinned source
before confirming. Binary assets can contain personal information too.
Keep author attribution/licence files and obtain permission for archival.

This is a **reviewed source snapshot**, not a full Git mirror or deployment.
Databases, externally stored uploads, Git LFS contents, submodules and deployment
secrets need their own secure backups. It neither changes live app addresses nor
runs imported code. To keep a local copy, open the private archive in GitHub and
use **Code > Download ZIP**, then copy the desired project snapshot to that
computer's `LegacySites\StudentApps` folder. Do not commit private student source
to WHS_APPSystem: its existing `LegacySites/` exclusion remains in place.

Recent history shows success, failure, previews and in-progress operations.
If Render restarts mid-import or a response/database write fails after the
GitHub commit, check the archive's Git history for the displayed import UUID
before retrying; the commit may already exist. Stale in-progress rows are not
reported as successful. No live repository import is performed by automated
tests; use the first real project as a supervised connectivity/handover test.

### Handover student project

Administrators can open **Student Apps > Handover student project**
(`/student-apps/handovers`) to keep a student's GitHub repository unchanged as
**Student Work** until the new school year while the school maintains its own copy.
The repository must already be owned by `MODULE_BUILDER_GITHUB_OWNER` (default
`WHS-DTECH`); ask the student to transfer it first if it is on their own account.
The student must first be recorded under **Administration > Student Builders**
(`/admin/student-builders`, administrators only): full name, **school email**
(kept on this page only; it links the student to their DTECH Hub record), status,
projects, permission and notes. No student ID or personal email is stored. The
**credit name** is made from the school username without the underscore
(`j_pinkerneil@…` becomes `JPinkerneil`). The **shared GitHub link** is looked up
(read-only) from the student's SeniorDTECH/MiddleDTECH task lists in the DTECH Hub
database (`DTECH_DATABASE_URL`, `GITHUB_REPO_URL|` evidence in
`project_interests`); a single link is filled in automatically, several are
offered to choose from, and a typed link always wins. **Projects** are chosen by
ticking apps in a table of every shared GitHub link in the DTECH Hub task lists
(student, app name, link, year level); student names come from the KAMAR student
list (`INTEGRATION_KAMAR_DATABASE_URL`, matched on school email). Ticking an app
fills in an empty name, school email and GitHub link. One extra project can be
typed by hand. If the DTECH Hub cannot be read, the page shows the reason.
The handover form picks the student from that list; only the credit name and
the GitHub link's owner are written to GitHub (Student Work label and
`HANDOVER.md`), never the school email. A builder's details cannot be removed
while one of their handovers is in progress (migrations `044_student_builders.sql`,
`045_student_builder_credit.sql`, `046_student_builder_school_identity.sql`).
Starting a handover pins the current default-branch commit and sets the review
date to 1 February of the following year. Each step is recorded in the handover
history:

1. **Label**: sets the GitHub description to `Student Work: name, year` and can
   make the repository private. Render deploys continue to work.
2. **School copy**: either creates a new private repository containing the pinned
   files (no Git history) and a `HANDOVER.md` crediting the student, or records an
   existing school location such as a folder in WHS_APPSystem. Likely secrets and
   generated folders use the same exclusions and limits as the archive importer.
   Existing repositories are never overwritten.
3. **Backup**: saves a reviewed snapshot of the pinned commit through the private
   archive above (the Reader App must be installed on the repository), or records
   why it is skipped.
4. **Freeze**: archives the Student Work read-only. It is refused while an
   unsuspended Render service deploys from the repository; without a Render API
   key the administrator must confirm this manually.
5. **New school year**: transfer the repository to the student's GitHub account
   (they must accept GitHub's email within one day), confirm it was deleted in
   GitHub, or keep it frozen. Deletion is never performed by the app.

**Move to In Development** (any time during a handover): choose the registered
student app and it leaves the **Student Apps** menu section and the APPs
Dashboard (listed there under "Moved to In Development"), so it shows only under
**In Development** (a Module Builder project). It sets
`student_apps.moved_to_development_at`; nothing is deleted and access, roles and
Launchpad cards are unchanged. **Put back in Student Apps** reverses it.
Existing independently hosted student apps registered in Module Builder (for
example the International App) carry `module_builder_projects.listed_as_student_app`
so they stay under Student Apps; the same step clears that flag to move them.

Set `STUDENT_HANDOVER_GITHUB_TOKEN` to a GitHub token for the owner with
**Administration** and **Contents: Read and write**; if it is not set the
`MODULE_BUILDER_GITHUB_TOKEN` is used. `MODULE_BUILDER_RENDER_API_KEY` enables the
automatic live-deploy check. Tests use mocked providers only.

Run the isolated Python regressions with
`python tests\guidance_global_roles_test.py -v` (Flask and the app requirements
must be installed). They use a temporary dummy database, never the live database.
Existing active hosted registrations can use automatic sign-in without repeating
the external sign-in verification. Other hosted apps can declare known core
mappings using `defaultRoleMap` and supported internal roles using `roles` in
their manifest; unknown external app role names still need a Lead Teacher or
administrator to configure them.

Every hosted student app receives a fixed, centred 1 cm school attribution footer.
The app scrolls in its own reserved area above the footer; fixed app controls stay
inside that area, while the school navigation toggle sits in the footer strip.
The copyright year is the project's first registration year. `Last Updated`
shows the month and year (New Zealand time) when changed app files are first
served. A persisted content hash means refreshes, restarts and unrelated system
deployments do not advance the date. The first hosted visit after migration 023
establishes the content baseline and initial update date. Runtime databases, logs,
Python caches and virtual environments are excluded from the hash.
Apps on external web services cannot receive this host-injected footer.
Separately hosted Flask apps still show the sign-in code and placement instructions.

Docker Desktop on Windows supplies the Linux environment needed by Gunicorn.
Build locally with `docker build -t whs-appsystem:local .`. Local environment
files, legacy folders and database files are excluded from the image.

Recommended environment values:

- `APP_BASE_URL`: the public Render service URL, for example `https://whs-appsystem.onrender.com`
- `GOOGLE_REDIRECT_URI`: `${APP_BASE_URL}/auth/google/callback`
- `DATABASE_URL`: Render Postgres internal connection string
- `INTEGRATION_SEWING_HUB_DATABASE_URL`, `INTEGRATION_WORKSHOP_DATABASE_URL`, `INTEGRATION_FOOD_ROOM_DATABASE_URL`, and `INTEGRATION_LEARNING_SITES_DATABASE_URL`: read-only legacy source connections held in the `LegacyDatabases` environment group.
- `SESSION_SECRET`: long random value. The app also accepts `SECRET_KEY` if that is already set in the Render Environment Group.
- `ADMIN_EMAILS`: `vanessapringle@westlandhigh.school.nz,tech@westlandhigh.school.nz`
- `GOOGLE_HOSTED_DOMAIN`: optional Google Workspace domain restriction

In Google Cloud Console, add the same callback URL as an authorised redirect URI.

## Admin model

The configured `vanessapringle@westlandhigh.school.nz` and `tech@westlandhigh.school.nz` accounts are automatically granted `ADMIN`, `Teacher`, and `Student` roles on login, allowing either administrator to toggle between those views. Other users are assigned roles through the admin pages. The public homepage is available without login.

Future systems should be added as modules first, then migrated into routes/controllers under this single application over time. Legacy database URLs are used for controlled imports; the primary `DATABASE_URL` remains the application source of truth.

## Learning Sites module

The public entry point is `/learning-sites` (the original legacy homepage and course pages). The original legacy HOD Update Dashboard is served unchanged at `/ADMIN/` and the Relief Plan at `/ReleverPlan/`, with the legacy `/api/admin/*`, `/api/course-content/*` and `/api/relief-plan/*` routes ported to Express (`src/legacy/learning-sites/`). The legacy admin key and cookies are replaced by the Google session: `/ADMIN/` and `/api/admin/*` require `ADMIN`; the Relief Plan requires `Teacher` or `ADMIN`.

Data lives in the unified `DATABASE_URL` database. If `INTEGRATION_LEARNING_SITES_DATABASE_URL` is set, the legacy HOD data (course status, course content, statement PDFs, activity) is copied once into the unified database on first use; from then on all new data is written to the unified database, so the legacy database can be retired.

## Technology Hub module

The Technology Hub homepage is public at `/technology-hub`. Its four discipline pages require a Google-authenticated `Student` or `Teacher` user with an ADMIN-assigned area grant. ADMIN users can manage grants at `/admin/technology-hub`.

## Sewing Hub module

The Sewing Hub is the legacy Sewing Room site (`public/sewing-hub`, legacy API in `src/legacy/sewing-hub`) under `/sewing-hub`, using the Google login. Browsing is open as in the legacy site; ADMINs (and Teachers granted "teacher" access at `/sewing-hub/admin`) can upload, edit and delete activities, URL ideas and images. Existing activities and suggestions are copied once from `INTEGRATION_SEWING_HUB_DATABASE_URL` (guarded by `sewing_legacy_import`); all new data is stored in `DATABASE_URL`. Image uploads use the legacy `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_FOLDER` or `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_PUBLIC_BASE_URL` variables, which must be set on this web service.

## Global Control user-role assignment

**Administration > Assign User Roles** (`/admin/users`) uses the DTECH-HUB-style
section links, searchable Staff and Student lists, Add Role form, additional-role
table and How It Works guidance. A module selector switches both the available
roles and assigned-user list. Global Control remains a separate system-wide
option. Sewing Hub, Technology Hub, Workshop, Food Room Hub and DTECH Hub use
their existing `hub_roles` and `user_hub_roles` records and permissions.
The selector includes all module registry entries, registered student apps,
Module Builder projects and existing role-enabled hubs, including inactive or
archived entries with explicit labels. Registry modules matching a project slug
are listed once. Lead Teacher is the administrator role within a hub.
Hub and registered-app choices with independent roles reuse their existing records.
Choices without independent roles show links to the existing teacher module
assignment/role-permission pages or project environment settings instead of
non-functional role forms. Teacher module allocations control dashboard
visibility, not route authorization. The module identity bridge accepts explicit
teaching-project roles as described below; system administration modules are excluded.

Directory searches require at least two characters and match current KAMAR names,
school emails, staff codes or student IDs. Results are limited to 20; refine the
search when more matches exist. Selecting a result fills the user type and email.
Adding a role requires a matching current directory entry with a school email.
It can prepare an account before its first Google sign-in; the existing Google
login attaches to that email and refreshes KAMAR-derived primary access.

Each addition preserves all other assignments. Remove buttons delete only the
selected role in the selected scope; global KAMAR Staff/Student and system-managed
roles are protected and labelled separately. Hub changes affect only hub-wide
assignments, preserving area-specific grants, other hubs and global roles.
Existing hub-role pages see the same assignments. Global ADMIN continues to
override hub permissions: assigning a lower hub role does not restrict it.
Global Lead Teacher has the same effective access as Teacher (including the
Teacher dashboard and existing per-user teacher module assignments), not ADMIN.
The Google session derives Teacher access from a current Lead Teacher assignment
on each request without creating a separate stored Teacher role assignment.
Removing Lead Teacher therefore removes that inherited access unless Teacher
is independently assigned. Hub Lead Teacher roles remain separate.
Migration `031_standard_teaching_module_roles.sql` adds Lead Teacher, Teacher and
Technician to all teaching modules/apps/projects, and seeds these roles for future
registrations. Existing extra roles and user assignments are retained. Lead Teacher
administers only its module, never Core or other modules, and does not override
owner-private records. Technician's permissions mirror Teacher's automatically,
including later edits; edit Teacher under Role Permissions to change both.
Core Administration, KAMAR Uploader and Module Builder are excluded and remain
Global-ADMIN-only. Technology area grants remain independently managed in their
existing pages. The main Assign User Roles page and directory API are
global-ADMIN-only, and role mutations require the session's form token. Existing
user-role records are not migrated or replaced.

### Module welcome emails

On Assign User Roles, choose a teaching module and click **Send Module Invite**
beside an assigned user. Role assignment itself never sends email. The preview
includes the module name in the subject, a module description, current roles,
a working module link, school Google sign-in instructions and feedback to
tech@westlandhigh.school.nz. Teacher Planner uses the approved planner wording.
Both test and confirmed invitations include the school logo and a branded header.
The logo is embedded inline in the email, without requiring a website login or
an external image download; plain-text wording is unchanged. The preview shows
the same branding. Drafts prepared before a wording or branding change must be
prepared and tested again before sending.

1. **Send Test Email to Tech** sends only to tech@westlandhigh.school.nz; the
   intended user and CC address are shown in that test but do not receive it.
2. After Gmail reports a successful test, review it in the Tech mailbox, tick the
   confirmation and choose **Confirm and Send Module Invite**. This sends the
   invitation to that user and CCs the administrator's signed-in Google address.
   No form-supplied recipient/CC is trusted.

Only Global ADMIN can use this workflow. Each preview belongs to the preparing
administrator and expires after 24 hours. Current roles, active account/module,
recipients and content are rechecked before either send. Changed details require
a new preview and test. Migration `032_module_invitations.sql` records durable
delivery states; atomic one-use claims prevent double-click/replayed sends.
Failures or interrupted/uncertain deliveries do not retry automatically: check
the existing Email Service log before preparing another invitation.
All delivery uses the existing Gmail API and email log. Other system emails
are unchanged. External apps must have active registration and a mapped role;
independent projects must have a valid deployed environment URL.

The read-only **All Additional Roles Summary** on the same page is independent
of the module selector. It groups each user's explicitly stored global additional
roles, hub/module roles (including registered student apps and area-specific
grants), and teacher module allocations in separate columns. The allocations are
labelled **Teacher dashboard links**: they control dashboard links, not access.
Global primary
Staff/Student roles are excluded; inherited Teacher access and ADMIN's hub
override are not presented as explicit assignments. System-managed roles and
inactive accounts are labelled. Change roles through the existing scoped forms;
the summary does not modify permissions or assignments.

For **Teacher Planner**, select the module and assign **Lead Teacher**, **Teacher**
or **Technician** using the normal
directory form. This hub-wide assignment enables its registered environments'
sign-in independently of the global Teacher role or teacher dashboard allocations.
Global ADMIN retains access; module assignments receive a Teacher identity with
separate verified `module_roles`, never a fabricated global ADMIN role.
Authorization is checked at handoff, code exchange and every identity request,
so removing the assignment revokes existing access. Private planner entries remain
owner-only. Planner Lead Teachers and global administrators can edit shared school
settings; Teacher and Technician cannot. Deploy both Core and Teacher Planner.
New generated modules accept these verified identities; existing independent
services must deploy the updated identity adapter before accepting non-ADMIN users.

Global ADMINs can prepare app-user emails at **Administration > Maintenance
Notifications**. The stacked **Maintenance Req** and **Maintenance Completed** tabs
have independent app selectors, recipient previews and email logs. All active
users assigned a role in a selected app, plus active Global ADMINs, are included
once each using private BCC. The app role assignment is authoritative; a current
KAMAR staff record is not required for an assigned user to receive the notice.

Every notification email is gated on a successful test email to the administrator who
prepared it. A maintenance request must be tested before it can be scheduled, and
the scheduler only sends warnings linked to a successful test. A completion
notification has its own test-and-send workflow; it names the selected app(s) in
the subject and body, then uses generic wording that directs recipients to access
them from the WHS Launchpad.
Completion links use `/launchpad` and explain school Google sign-in and the
**Report a fault** option if an app is missing or will not open. Updated completion
wording requires a fresh successful test email before staff delivery.
Core uses `APP_BASE_URL`, falling back to Render's `RENDER_EXTERNAL_URL`, for
the public website address. On the current deployment this is
`https://whs-appsystem.onrender.com`; completion links open
`https://whs-appsystem.onrender.com/launchpad`. Completion email generation rejects
localhost/loopback and non-HTTPS destinations rather than sending unusable links.
Changing the public destination requires a fresh successful completion test email.
Previously delivered emails cannot be changed; send a corrected notice to replace
any localhost link.
Both tabs show their test and staff-delivery history, including failures, from Email Service.
Warnings are sent 14 days before the scheduled start (or at the next scheduler run
when scheduled less than 14 days ahead).

## Kamar Uploader module

Sign-in, profile and sign-out use Global Control's shared Google avatar/header
and `/profile` page. The uploader has no local sign-in card or navbar
sign-out controls. A read-only **Signed-in User** summary sits beside the
dashboard heading. **User Role Management** is in the shared avatar's
**Settings** menu for ADMIN users visiting Kamar, not in a local Admin dropdown.
Its navigation reads the current school session on every
page, including direct upload-page visits, rather than trusting a cached local
account. Upload pages, ADMIN access and legacy data APIs are unchanged.

The original Kamar Uploader pages (Home, Staff Upload, Student Upload, Student Timetable, Staff Timetable) are served at `/admin/kamar-uploader/` to ADMIN users, with the legacy API (`/api/staff_upload`, `/api/student_details_upload`, `/api/student_upload`, `/api/upload_timetable`, `/api/timetable/all`, `/api/feed/*`, `/api/projects/links`) ported from the legacy server. Roles come from the app's Google login; the legacy cookie login, permission tables and role pages are replaced by `/admin/users`. Feed APIs need a Teacher, Staff or ADMIN user.

Kamar uses its existing legacy PostgreSQL database exclusively. Set
`INTEGRATION_KAMAR_DATABASE_URL` on WHS_APPSystem to the same database used by the
working legacy service. It must differ from Core `DATABASE_URL`; no fallback to
Core or Learning Sites is used. TLS is enabled by default; `KAMAR_DATABASE_SSL=false`
is for local PostgreSQL only. No Kamar tables or records are created, imported,
deleted or reset by initialization; the existing schema is checked read-only.
The previous imported Core tables remain untouched but are no longer the source
for Kamar uploads or shared directories.

All four term upload options and original staff/student/timetable upload pages
are retained. Each new upload first saves its complete ordered CSV headers/rows
as an immutable year/term dataset, in the same transaction as the current-data
update. The existing legacy tables (`staff_upload`,
`student_details_upload`, `student_upload`, `timetable_upload`, `app_project_links`)
remain compatibility views for live modules, using the original transactions,
identifiers and Current/Not Current behaviour. For the four staff/student/
timetable tables, database triggers preserve every row before and after updates
and preserve deleted rows, including their recorded status. They also capture
manual timetable edits and email synchronisation. Historical snapshots and row
versions reject UPDATE, DELETE and TRUNCATE; current staff/student/timetable
tables cannot be truncated. Historical imports never update these live tables
or change staff/student status, accounts, roles, attendance marks or reports.
Role sync, Global Control user/role directories, Student Apps client selection,
maintenance recipient eligibility and the Teacher Planner staff/class-list
bridges read that same live Kamar database. Global accounts, assignments,
notification logs and the separately curated shared department directory stay
in Core. Staff and Student roles are derived from live current Kamar emails;
directory failure prevents role synchronization rather than removing roles.

Before deployment, verify the Kamar connection is configured on WHS_APPSystem
and back up the legacy database. Do not upload production CSVs as a test: uploads
intentionally update records and mark absent people/teachers Not Current.
First sign in as ADMIN, check `/api/feed/health`, the current-count summary and
existing Term 4 rows against the working legacy service. Then verify directory
search, Google sign-in and Teacher Planner staff/class lists. Use an isolated
database copy for destructive upload testing. The original service can remain
available for rollback; avoid simultaneous uploads from both services.
The history migration below must run before further uploads or manual timetable
edits; until then writes fail explicitly while existing read-only feeds remain
available. No user notification is sent.
Private CSVs, `.env`, `node_modules` and the original project's `.git` are not
copied into WHS_APPSystem.

### Preserving and rebuilding dataset history

Back up the **separate Kamar database**, configure
`INTEGRATION_KAMAR_DATABASE_URL`, then run `npm run db:migrate:kamar`.
Do not run Core migrations against this database. This explicit, repeatable
migration baselines every existing staff/student/timetable row and installs
preservation triggers atomically. It briefly locks these four tables; schedule
it outside uploads. It does not infer a historical term roster from today's rows.
Normal requests never create or migrate database tables. Do not continue using
an older uploader that bypasses snapshots after switching to this version.

Dry-run the private source archives (no database connection required):

```powershell
node src\legacy\kamar-uploader\history-command.js import --root 'LegacySites\KamarUploader\csv\KamarData\2026' --year 2026
node src\legacy\kamar-uploader\history-command.js import --root 'BuilderFiles (Dont push to GIT)\Term 4 Kamar' --year 2026 --term 4
```

Review the file inventory, warnings and exclusions, then repeat each command with
`--apply` to save those snapshots to the configured Kamar database. Alternatively,
`npm run kamar:archive -- --root <folder> --year 2026` runs the same importer
where the shell forwards npm arguments unchanged. The importer validates the
entire selected root before opening its transaction. A failure rolls back that
root's complete import; rerunning is safe and skips already stored snapshots.
It preserves raw CSV text, duplicate period headers, row order, source filename,
export date/time and mid-term exports separately. Files under `Term 1` through
`Term 4` inherit their folder's term; `--term` supplies the term for a root without
those folders. Known five-column headerless staff exports are flagged and keep
their first record. Exports without school email remain separate, not merged.
Specialised class-list CSVs and PDFs are listed as exclusions, not silently parsed
as a different dataset; attendance PDFs still use the separate attendance process.
Neither private source folder should ever be staged or committed.

ADMIN users can open **Kamar Uploader > Dataset History** at
`/admin/kamar-uploader/history.html`, filter year/term and download each saved
dataset as JSON (including original CSV text for archive imports). The
`/api/kamar-datasets` and `/api/kamar-datasets/:id` endpoints are ADMIN-only,
uncached and read-only. There is deliberately no restore-over-current button.
No archive import occurs automatically on deployment. Reporting uses the latest
preserved student timetable for its selected term. Attendance still uses its
current class reader; term-specific Attendance rosters are a separate follow-up.

History tests: `node --test tests\kamar-history.test.js tests\kamar-live-database.test.js tests\kamar-uploader-legacy.test.js`.
Set `KAMAR_HISTORY_TEST_DATABASE_URL` only to an isolated local test database to
also run the PostgreSQL baseline/immutability/rollback checks. They create and
remove a uniquely named test schema, never use a live Kamar connection.

## Teacher Planner integration

### Reporting

The **Reporting** section provides JuniorDTECH and MiddleDTECH programme tabs,
then class tabs and report-part pages, plus an Awards view. A permanent
[DTECH Assessment Criteria Google Doc](https://docs.google.com/document/d/1oA7xHQapbqE3myKKFL6T7oUMGxPbrm2BCE1rJQ51-gw/edit?usp=sharing)
shortcut opens in a new tab.

Both programmes assess **Computational Thinking - Coding** and **Design & Develop
a Digital Outcome**. Junior choices are UAG, 3B, 3P, 3A, 4B, 4P, 4A; Middle choices
are UAG, 4P, 4A, 5B, 5P, 5A, 6B. The criteria guide displays Achieved (50%),
Merit (70%) and Excellence (90%) bands without automatically calculating a grade.
School values use Dev / Dem / Exe. JuniorDTECH shows one value for the selected
term: Term 1 Whānaungatanga, Term 2 Manaakitanga, Term 3 Rangatiratanga and
Term 4 Kaitiakitanga. MiddleDTECH shows both Kaitiakitanga and Rangatiratanga.
Not entered is separate from UAG and remains incomplete. Completion requires at
least one SLO and the selected term's value for JuniorDTECH, or both SLOs and
both values for MiddleDTECH. The earlier-year cycle additionally requires a report comment.
Comments are limited to 2,000 characters. These are private drafts, not KAMAR
publication or automatic grade decisions.

Entries autosave through the existing owner/year-scoped Planner revision checks.
EOY and earlier-year records remain separate, keyed by stable school student ID
and programme, so switching class tabs does not duplicate or discard judgements.
Class completion counts and an incomplete-only filter help find unfinished reports.
Choose a term to load its latest preserved KAMAR student timetable; classes are
filtered to the signed-in teacher, DTECH and programme year levels (7-8 or 9-10).
A teacher's `VP-PIDTECH-05` and `VP-PIDTECH-CW` entries are shown as one
`VP-PIDTECH` class when both are present; their students are combined once by
school ID. Other classes and the underlying KAMAR snapshots are unchanged.
A missing term snapshot is reported explicitly, never replaced with the current
roster. A later upload for the selected term can change visible students but does
not delete report entries. SLOs and comments remain shared across terms within
each report cycle; JuniorDTECH has a separate judgement for each term's value.
Reporting does not wait for attendance marks, PDF imports, or private timetable
downloads.

The read-only **Awards** view combines the signed-in teacher's JuniorDTECH
classes from the latest preserved timetable in each of the four terms,
deduplicating students by school ID. It uses End of Year SLO judgements and
highlights individual SLOs at or above the Kaha Mohio achievement guide:
Year 7 4P and Year 8 4A. When a student appears in multiple terms, the most
recent term's name and year level are used. Missing or UAG entries are not
highlighted. The view is a guide for teacher review, not a nomination,
eligibility decision or award; the Technology-wide 20% selection is separate.
All four term rosters must load, otherwise the view reports the error and offers
a retry rather than displaying a partial list. Opening it does not alter reports.

The **Default school values to Dem** action is a one-time opt-in for the
signed-in teacher and selected planner year, shown on the School Values tab.
After confirmation it loads all
four term snapshots, fills blank school values in existing drafts, and sets Dem
for newly found JuniorDTECH/MiddleDTECH students in both cycles, including
hidden class tabs. Existing Dev, Dem and Exe choices are kept. Once enabled,
students subsequently encountered in a new class get Dem when their roster is
loaded; later manual choices, including blanks, are never overwritten.
The action preserves SLOs and comments. If any term roster fails to load,
nothing is changed; import missing snapshots first.
The change is a normal private Planner edit: wait for the Planner autosave
confirmation before leaving. This action does not publish to KAMAR or change
another teacher's reports. Earlier saved drafts remain compatible; teachers who
enabled the previous two-value default can use the new action to fill the
additional JuniorDTECH values and enable the expanded default.

The **Set JuniorDTECH SLOs to 3P** action is also opt-in for the signed-in
teacher and selected planner year, shown on the Student Learning Objectives tab.
After confirmation it loads all four term
rosters and overwrites both Coding and Design SLOs in both report cycles for
all JuniorDTECH drafts, including former students, as well as new students in
those rosters. School values, comments and MiddleDTECH reports are unchanged.
Future newly encountered JuniorDTECH students get 3P in both SLOs; subsequent
manual changes, including blanks, are preserved. The school-values default is
independent. If any roster fails or validation fails, nothing is changed; wait
for the Planner autosave confirmation after a successful update.

**Deployment:** before using Attendance Admin, run `npm run db:migrate:planner`
in the service environment with the existing `TEACHER_PLANNER_DATABASE_URL` and
its SSL setting. This explicitly runs the standalone Planner migration ledger,
including `014_admin_attendance_sync.sql`, on the separate Planner database; it
refuses the Core/Kamar connection. Embedded requests check the required schema
but do not run migrations. Do not point Core's `db:migrate` command at the
Planner database.

Teacher Planner is embedded at `/teacher-planner/`, using the original module
router and screens from `src/legacy/teacher-planner`. Shared Google sign-in,
navigation, Search, sign-out and role assignment come from Global Control.
The integrated Teacher Planner appears under **Modules** in shared navigation,
not In Development or Student Apps. Development registry/service details are
retained for rollback; locally integrated projects are excluded from the
In Development sidebar.
Migration 039 changes the Launchpad/module destination only; the standalone
development service and its registered handoff callback remain available for
rollback. No user notification is sent.

Set `TEACHER_PLANNER_DATABASE_URL` to the **existing Planner database**, not Core
`DATABASE_URL` or the Kamar connection. Initialization checks its existing tables
read-only and performs no schema/data migration, import, deletion or fallback.
Private records retain the same Core user UUIDs used by standalone Global Control
sign-in. Planner CSRF, revision-conflict checks and per-owner filtering remain
unchanged. `TEACHER_PLANNER_DATABASE_SSL=false` is for local PostgreSQL only.
Missing database/schema or invalid Google integration configuration returns an
explicit unavailable response without affecting Core or the original service.
Signed-in Global ADMIN users also see a safe `diagnostic` identifying the failed
configuration or table check. Render logs contain the same diagnostic, never
connection strings, passwords, token keys or raw database error messages.

Keep the original `GOOGLE_CALENDAR_TOKEN_KEY` and Calendar/Drive credentials:
changing that key would make stored Google connections unreadable. The linked
Google environment groups are reused; `GLOBAL_CONTROL_URL` and `MODULE_CLIENT_ID`
remain useful to the standalone service but embedded sign-in uses the Core
session directly. Kamar staff/class readers and curated Core departments are
shared with the existing standalone bridge.

In Google Cloud, add this authorised redirect URI to the Calendar OAuth client:
`https://whs-appsystem.onrender.com/teacher-planner/api/planner/google-calendar/callback`.
Keep the original development callback authorised. Add
`https://whs-appsystem.onrender.com` to the relevant Google browser clients'
authorised JavaScript origins and the Drive browser key's allowed referrers.
Use the future `APP_BASE_URL` origin instead when hosting/domain changes.

If **Kamar Uploader → Attendance Admin → Authorise read-only Google Drive** shows
`Error 400: redirect_uri_mismatch`, open **Google Auth Platform → Clients** in
Google Cloud Console. Select the **Web application** client whose ID matches
`GOOGLE_CALENDAR_CLIENT_ID` in the service's linked environment group, not the
Drive Picker client (`GOOGLE_DRIVE_CLIENT_ID`) or a different Core login client.
Add the callback above under **Authorised redirect URIs**, save, then retry
authorisation. Adding a JavaScript origin alone does not authorise a callback.
These administrator setup instructions are kept here, not in the attendance
page. Keep existing callbacks and credentials; do not rotate
`GOOGLE_CALENDAR_TOKEN_KEY`. A Git push or Render redeploy cannot change
Google's registered redirect URIs.

Attendance PDF validation failures are shown beside the manual preview controls.
The Kamar Uploader admin report identifies recognised layout failures or a safe
decode-error message and does not mark a rejected file as processed. Export
the original **Student Attendance - Two Week Overview** PDF from KAMAR; do not
print, scan or convert it. A rejected file saves no marks from that PDF.
Half Days attendance statistics PDFs contain summary rates rather than daily
period marks and cannot be imported as Two-Week Attendance; the admin report
identifies this for that file and continues with the remaining documents.
The standard KAMAR `Students: N` page total beneath the final student row is
recognised as a footer, not attendance. Attendance column/slot validation remains
strict; footer recognition requires the expected position and a student count at
least as large as the page's row count (continued classes show a whole-class total).

The Kamar Uploader **Attendance Admin** page displays job progress and the
latest selected-teacher import totals: PDFs processed, blank marks filled,
conflicts kept, match warnings, unchanged PDFs and document errors. Its table
lists each filename, the attendance date range read from the PDF, and an explicit
success, unchanged, failed or blocked outcome. Date ranges are retained in the
processed-file checkpoints for unchanged PDFs; older checkpoints without dates
are labelled accordingly. If published school term dates are missing, the listed
files are reported as blocked, with dates not read and no marks imported. Publish
the dates in KAMAR School Calendar and retry. An empty folder is reported explicitly.
The report contains file-level outcomes only; student names, IDs and attendance marks are
not returned to or rendered in the admin browser. A public-holiday-data warning
is shown when the school calendar cannot be loaded. The admin settings and
per-teacher/year processed-file checkpoints live in
`planner_attendance_admin_sync` in the existing Teacher Planner database;
attendance marks and import history remain scoped to the selected teacher's
existing Planner records. A failed PDF remains retryable, and saved marks are
never overwritten by a later import.

The Teacher Planner **Two-Week Attendance** page retains the term/week
import-history view, but no longer offers all-class PDF upload, Drive folder
settings, Google authorisation or a Drive sync button. The ADMIN-only Kamar
Uploader **Attendance Admin** page supports both Drive sync and a reviewed
single-PDF upload for a selected teacher. Its preview shows totals only; applying
the preview fills blank marks and records import history without exposing
individual marks. The status table displays **Synced** when an automatic class
tab has an import-history record for that week; it is not proof that every
student matched. Administrators should review Kamar Uploader's file-level match
warnings when marks are missing. Teachers can still preview a personal PDF
import into one class tab from daily Attendance, which continues to show and edit
the signed-in teacher's own saved records.

The shared **Duty Roster** setup has moved from Setup My Planner to the
ADMIN-only Kamar Uploader **Duty Roster** page. Administrators configure the
shared source document, term settings and staff-code mappings there; weekly duty
assignments continue to display in each teacher's Planner.

Teacher Planner navigation is grouped into **Planning** (cover and year/term/week
plans), **Setup** (Setup My Planner first, followed by Assessment setup), and
**Section Modules** (daily Attendance, Moderation, Teaching Standards,
Professional learning and upcoming modules). Groups use labelled, colour-accented panels and wrapping
pill buttons; existing section routes and disabled upcoming modules are unchanged.
Two-Week Attendance import history and term/week status live in their own
stacked **Two-Week Attendance** tab inside Setup My Planner. The all-class PDF
upload is in Kamar Uploader **Attendance Admin**; personal one-class PDF imports
remain in daily Attendance. All personal attendance controls remain available
to teachers who cannot edit shared school dates. Switching setup tabs preserves
mounted attendance state and is blocked during attendance loading or unsaved
attendance edits. Old `#section=attendanceImport` links still open the setup
tab; its canonical link is `#section=setup&setupTab=5`. Daily Attendance remains
a separate Section Module. Drive imports run from Kamar Uploader and do not
block Teacher Planner navigation.
Loading/saving or unsaved integration changes still prevent unsafe navigation,
with explicit feedback.
The cover name pill is centred; Setup My Planner is no longer duplicated on the cover.
Year and print controls sit on the right of the Teacher Planner heading. The
circular year badge opens the year selected in the adjacent Planner year field;
its number and accessible label follow that field and restored planner links.
Print current view retains its existing behaviour.
The Term page uses the full available screen width: a smaller cover sits beside
a highlighted **Start of term** panel, with **Goals and reflection** above its
heading and term dates. Goals retain their existing private yearly record and
navigation/unsaved-edit checks. The Google Calendar sits below both panels at
full width, with an event-detail panel and a minimum readable week-grid width
(horizontal scrolling on smaller screens). The existing term selector stays
above the page, styled as a circular badge with a prominent 42px number and a
small **Term** label above the horizontally centred number inside the circle; a
separate decorative arrow does not offset the number. It still opens the native 1-4
dropdown. Print actions are unchanged; a printing redesign remains deferred.
Term covers show the selected **Term 1–4** in the white pill instead of the teacher
name, with the selected planner year large and centred beneath the planner title.
The main planner cover still displays the teacher name.
Without an explicit term in a planner link or a manual selection, Term Plan uses
the current term from WHS school dates (Ministry dates fill unpublished ranges);
holidays use the most recently started term. Explicit selections and saved private
notes remain intact. The notes panel stretches to match the cover on widescreens,
adding writable rows; longer notes still expand rather than being clipped.
Weekly Planner has the same term circle in the left selector position, before
the week date/navigation. Its displayed term follows that week's actual dates,
independently of the editable saved weekly term field. Selecting a term opens
that Term Plan after the existing unsaved-change guard. Holiday weeks show the
neutral **-** choice rather than assigning an incorrect term.
Weekly timetable notes use 16px text on desktop and mobile; autosizing, autosave
and the existing compact print text remain unchanged.
Daily Attendance places the editable class register on the left and a read-only
individual student term view on the right (stacked on smaller screens). Search
the selected saved class tab by name, student year level and whānau/form class,
then select a student and term. Year and whānau come from the teacher's current
KAMAR class lists; manual students remain searchable by name. Each term week is
a row with weekday period marks, using only that student's matching classes and
timetable (or the tab's manual periods). Blank marks show **Not recorded**,
never an assumed absence; closures and unscheduled days are labelled separately.
Marks remain private to the signed-in Planner owner. Daily edits update the
student view immediately; **Refresh student attendance** reloads saved term data.

The Moderation **Marking Confirmation & Feedback** and **WHS Coversheet** contents
tabs label and open each record's respective form, independently of its marking
schedule. Existing record titles and linked Drive documents are not renamed by
these listings.
Confirmation & Feedback provides one downloadable blank template for all standards,
with separate student/standard forms listed below it. Create those forms from each
Internal Moderation student entry, then import a completed document or create one
in Drive. Assessment-level feedback remains accessible through Records; the shared
template does not merge, overwrite or delete existing records.
Marking Schedule uses the same workflow: one blank template for all standards,
followed by separate student schedules. Fill in each standard's own criteria;
existing standard-specific schedule instructions and criteria remain accessible
through Records → Marking Schedules and are still used when preparing student
schedules. No existing marking or linked documents are changed by the template.
WHS Coversheet also provides one reusable blank template with separate student
sheets below it. Open a student's coversheet from that list; create their student
record through Internal Moderation first if needed. Existing assessment-level coversheets remain
available through Records; no declarations, results or Drive files are overwritten.

Before acceptance, back up the original Planner database, then check the new
page and `/teacher-planner/health` while signed in. Compare existing private
planner entries, attendance and duties against the original service. Verify
autosave, reload, staff/class lists, Google Calendar/Docs/Tasks and Drive Picker.
Do not edit the same planner in both services simultaneously; revision checks
still protect against stale saves. The original Planner regression suite runs
with `npm test --prefix src/legacy/teacher-planner`; PostgreSQL tests require an
isolated `PLANNER_TEST_DATABASE_URL`, never a production connection.

## Bus Controller

The handed-over student Bus Controller is served unchanged at `/bus-controller/`
(`src/legacy/bus-controller/public`, router `src/busController.js`). It still
uses its own Firebase project (`whsbuscontroller`) for routes, hazards and its
user records; nothing is copied into Core.

Migration 050 points the In Development sidebar link, the Launchpad card and
the module address at `https://whs-appsystem.onrender.com/bus-controller/`.
The address is stored as a full URL, not `/bus-controller/`. A local path would
put the public parent map behind the module sign-in guard and remove the app
from In Development.

| Who | How they get in | Page |
|---|---|---|
| Parents / public | No sign-in | `parent.html` view-only map |
| Westroad | Firebase email and password on `/bus-controller/` | `westroad.html` hazards |
| Bus Controller Lead Teacher (incl. principal@) | **Sign in with school Google** → `/bus-controller/staff` | `principal.html`, Westland High routes only |
| Bus Controller Tester (e.g. J_leaf) | School Google, own account | **View only** on every staff page: routes, Westroad hazards and users. Every save is blocked; a "View only" bar links the three pages |
| ADMIN | School Google | `admin.html` to manage Westroad accounts |

Assign the Lead Teacher and Tester roles for `bus-controller-app` at
`/admin/users`. There is no separate principal role. For staff,
`/bus-controller/api/firebase-token` checks the Global Control role on every
page load, writes `users/core-<Core user id>` in Firebase with that role and
`schoolId` `westland high school`, and returns a one-hour Firebase custom token.
Removing the role in Global Control sets the Firebase role to `none` at the
next attempt. Old Google/test sign-ins and the shared parent test login were
removed from the sign-in page.

Set `BUS_CONTROLLER_FIREBASE_SERVICE_ACCOUNT` to the service-account JSON key
(Firebase console → Project settings → Service accounts → Generate new private
key). Without it, staff sign-in shows "not set up yet"; public and Westroad
pages still work. Testers' saves are blocked in the page. To block them in
Firebase too, add `auth.token.busControllerRole !== 'tester'` to the `schools`,
`hazards` and `users` write rules in the Firebase console; staff tokens carry
that claim. For the tester to see the user list, the `users` read rule must
also allow `auth.token.busControllerRole === 'tester'`. On `westroad.html`, a
Westroad email/password login is left alone when Global Control has no Tester
role for the visitor.

Westroad (and any other off-site Firebase) accounts are added and removed by an
ADMIN following **Administration → Running Firebase – Off-site Users**
(`/admin/firebase-users`), which links straight to the Firebase console.

## Workshop module

The Workshop is the legacy Workshop site (public/workshop, legacy API in src/legacy/workshop) under /workshop, using the Google login. Admins and users given the Workshop Lead Teacher hub role (assign at /admin/users) can upload worksheets, lesson notes and planners; signed-in users can upload activities. Existing data is copied once from INTEGRATION_WORKSHOP_DATABASE_URL (guarded by workshop_legacy_import); new data goes to DATABASE_URL. Suggestion notification emails are sent through the framework's Google Gmail API (GOOGLE_GMAIL_* variables) to Admins and Workshop Lead Teachers; SITE_URL is used in the email links.

## Food Room module

Food Room Lead Teacher additionally receives the module-local legacy `admin` role,
and Technician also receives the legacy `teacher` role so its controls match
Teacher. Neither mapping grants any global or other-module role. Current module
roles are checked before using the short legacy-role synchronization cache.

The homepage recipe gallery reports failed requests with a Retry button instead
of remaining on "Loading recipes". Weekly booking errors are shown separately
and do not hide successfully loaded recipes. An HTTP 502 HTML response from
Render is a service/gateway failure, not proof of a disconnected legacy database;
check the main service's Render deployment/runtime logs before changing DB URLs.
The recipe `display-table?fields=summary` query selects only gallery metadata.
Stored base64 images are served individually by
`/food-room/api/recipes/display-table/:id/image.jpg`, preserving the selected
primary image and original image data without embedding every image in one
large JSON response. Full recipe/detail responses are unchanged.

The Food Room is the legacy recipeCalculator site (public/food-room, legacy API in src/legacy/food-room) under /food-room, using the Google login. The legacy tables live in the ood_room schema (migration 014) and existing data is copied once from INTEGRATION_FOOD_ROOM_DATABASE_URL (guarded by food_room_legacy_import); new data goes to DATABASE_URL. The app's roles are mirrored into the legacy role tables on each request: ADMIN -> admin, Food Room Lead Teacher hub role -> lead_teacher, Food Room Technician hub role -> technician, Teacher/Staff -> teacher, Student -> student (assign hub roles at /admin/users). Emails (suggestions, weekly digest, place order, shopping reviews) are sent through the Google Gmail API (GOOGLE_GMAIL_* variables) with a [Food Room Hub] subject prefix. Food Room specific variables: PLACE_ORDER_* (pilot recipient, admin copy, Tuesday cron, Google form/sheet URLs), GOOGLE_CREDENTIALS, GOOGLE_TOKEN_JSON, GOOGLE_OAUTH_REDIRECT_URI and GOOGLE_PLANNER_* (planner sync), WEEKLY_DIGEST_CRON, SUGGESTION_NOTIFY_TO and SITE_URL. The Puppeteer recipe extractor pages need the optional puppeteer package.
