# whs-assessment-manager

This directory is the embedded snapshot of the standalone Assessment Manager.
For the WHS_APPSystem database, access and cutover instructions, see
[Assessment Manager integration](../../../README.md#assessment-manager-integration).
The standalone instructions below describe the original service.

DEVELOPMENT - TEST DATA ONLY. The private assessment-standards and Moderation
workflow is implemented here for development testing. Teacher Planner records
are not copied or changed; keep its Moderation entry until a production cutover
has been verified.

The app has a separate colourful **Home** calendar/task page with the shared account
header (Google avatar, Profile and sign-out), Global Control search, centred WHS
logo and centred footer. Search is Global Control's existing search until the
module has its own search implementation; results open in Global Control.
The copyright uses the current month/year in Pacific/Auckland. Last Updated is
stamped when this framework is installed/updated, not reset on each page view.
When application code is changed later, update `UPDATED_AT` in `shell.js` as part
of the release. Shared header/CSS assets are bundled from Core at generation time.
Sign-out revokes the module grant, destroys its session, then signs out of Core.
The footer's Contact Web Master link opens Global Control's signed-in contact
form in the current tab. Messages go to tech@westlandhigh.school.nz through Core's
existing Gmail service and email log; no Gmail credentials are copied here.

## Home: calendar, tasks and completion history

Home is the default landing page; Setup Assessment, Resource Library and Moderation
remain separate sections. Select a year to see all twelve months. This month and
next month have prominent date lists, including ongoing events. Earlier dates this
month are folded away, not lost. December includes the following January when
available. Use a calendar day or a month's date list to see details.
On wide screens, My task list sits to the left of the upcoming dates; on smaller
screens the sections stack. School dates have a contrasting card colour in the
upcoming-date lists, without source labels. Overdue task dates are marked as having passed.
Beside change history, the NZQA timeline lists the national dates in your calendar
and links to NZQA's official page. The WHS timeline lists the shared school dates.
Below them, deadline reconciliation compares each source deadline with your
calendar event, classification and linked task status. NZQA source dates come from
the same current or cached import; initial WHS references come from the supplied
2026 summary and have not been independently verified. Missing source information
is shown as not recorded. Shared-calendar editors can record the source document
and extracted deadline when adding or updating a school date. The table only
matches tasks explicitly added from a date, not tasks with similar titles.

The public NZQA key assessment dates are combined with the supplied 2026 WHS dates,
without source badges. NZQA dates are refreshed at most every six hours and cached
in the module database. A failed refresh displays an explicit warning and the last
saved calendar, or no national dates if no cache exists. Dates are never copied
into a different year. WHS dates must be entered/reviewed for subsequent years.
The supplied AS 91906 October date is marked awaiting confirmation because it
differs from the public external-moderation deadline. School documents requiring
Google access have not been independently read by this importer.

The official NZQA secondary examination timetable also feeds the calendar, including
exam start times and final portfolio/report submission dates for the signed-in
teacher's verified departments. Department membership uses the current reviewed
leadership and authorised Student Tracker teachers; subject suggestions use the
department's confirmed class links and course subjects. Technology includes Digital
Technologies, Design and Visual Communication, Materials and Processing Technology
and Technology. Unmatched subject names and unavailable department information are
reported rather than guessed; check the linked official timetable for missing dates.
The timetable has its own six-hour cache and stale-data warning. When NZQA publishes
a future year's portfolio deadlines in its assessment timetable PDF but has not yet
published individual exams on the timetable page, the portfolio deadlines are shown
and the missing exam times are explicitly flagged. Calendar tasks and personal changes
work for these dates as for other national events. Existing tasks remain even if a
department association changes.

**Add a calendar date** adds a private date. **Update date** changes that event in
your own calendar rather than adding a competing duplicate. Existing private WHS
changes remain in place and are marked when they override a shared date. The WHS
timeline shows the shared version separately. Assessment Manager Lead Teachers
and global administrators can add or edit shared WHS dates there; their changes
feed everyone's calendar unless a person has a private override. Shared changes
are revision-checked and stored with their author and history. The supplied 2026
dates remain the initial school dates; later years are not copied automatically.
Personal dates, tasks and history belong to the signed-in Core owner UUID.
**Print calendar** shares your version with your team; **Print task list** prints
your work list.

Use **Add to my tasks** on a date, or **Add a task** for other work. A star on an
upcoming-date card means that date was added to your task list, including completed
tasks. Independently added tasks are not linked by their titles. Tick a manual
task once to save its completion; untick it to reopen it. Completed work remains
available, with timestamped **My completion & change history**. Changing a date
does not silently move a manual task's chosen due date.

Internal moderation tasks are generated from your saved parent moderation records
for the selected year. They tick automatically when the internal sheet has a
verification date or any sample's moderation date: no additional name, upload,
approval or evidence is required. Home reconciles these tasks when opened or
refreshed. Clearing the recorded moderation date reopens the task; removing its
record removes the active task, not its history. Completion history records when
Home observed it, retaining the moderation date separately rather than inventing
a historical completion timestamp. Task and audit changes save atomically.

Migrations `004_assessment_home.sql`, `005_school_calendar.sql` and
`008_exam_timetable_cache.sql` create the
personal calendar, task, audit, public calendar-cache and shared school calendar
tables. The normal startup migration runner applies them. Focused
tests run with `node --test assessment-home.test.js moderation-ui.test.js`.
For persistence/audit integration checks, set
`ASSESSMENT_HOME_TEST_DATABASE_URL` to an **empty disposable PostgreSQL database**;
the test applies migrations 002, 004, 005 and 008 there. Never use a live module database.

## Assessment Resource Library

The separate **Resource Library** section is a shared catalogue across all years.
All signed-in Teachers and Global ADMIN can browse and edit it. It uses its own
tables in this module's database, not personal moderation records. Drive file
access still depends on the signed-in Google account and the file's permissions;
linking a purchase does not make it public or change its licence.

1. Choose **Resource Library → Add assessment**, then select Commercial, Own,
   TKI or NZQA as the assessment source. Enter the Assessment Brief Title and
   each NZQA standard number/version covered. Commercial assessments require a
   supplier. Own assessments require confirmation that the signed-in user wrote
   the assessment entirely; their name is recorded as author. For TKI and NZQA,
   enter one or more HTTPS links to the original websites or Google files.
   Each original link has its own date, initially today's New Zealand date
   when that link is added or changed, which can be edited. Record optional
   modification notes and one or more Google Drive or Docs links to the final
   assessment. Use **Add another original link** or **Add another final link**
   to enter links manually, or select several files with the Drive pickers.
   Up to 20 links can be stored in each group; incomplete links remain private
   drafts until completed or removed.
   Changing source clears its source-specific details after confirmation; earlier
   saved revisions remain available. Supplier and purchase details appear just
   below the source selector for Commercial assessments and are hidden, not
   erased, for other sources. Licence and notes remain available for all sources. The brief
   title describes the assessment, not an individual standard, and is not filled
   automatically from standard or moderation titles. Add an Assessment Brief
   Description alongside the class codes. Previously saved supplier editions
   remain in existing entries and history; the field is no longer required or edited.
   **Standards covered** is at the top of **Assessment edition**. Choose a standard
   from the current year's Setup Assessment list, use **Choose multiple standards
   from Setup Assessment** to select several together, or add them manually and
   choose **Fill missing details**. One combined assessment can cover up to 30
   standards; credits, level and NZQA version are recorded separately for each.
   The same edition is available to moderation for each matching standard/version.
   Prefill uses saved standards, the NZQA details endpoint and your
   same-version moderation records, without overwriting existing entries.
   NZQA metadata for a different version is not copied; unavailable sources are
   reported and can be retried with **Refresh metadata sources**.
2. For commercial assessments, record purchase price/currency, GST, purchase date, supplier/product websites,
   invoice reference, licence restrictions and any expiry.
3. Use the distinct Drive pickers for **Original purchase ZIP**, **Resource folder**,
   **Assessment Instructions & Schedule**, **Topic Brief**, and optional invoices.
   Several instruction and topic files can be linked. Files must already be in
   Drive; the app never extracts ZIPs, imports a folder's contents, uploads local
   purchases or overwrites purchased originals. Purchase ZIP and invoice pickers
   are only shown for commercial assessments.
4. Add critique history, including person, school, position, date, outcome, notes
   and optional evidence. New critiques prefill the signed-in name when available
   and Westland High School for a school email address. When the staff directory
   uniquely identifies the signed-in person and a single available leadership role,
   their current position also fills new critiques and blank positions on their
   existing critiques. The assessment's department is preferred when relevant.
   Existing positions and other people's critiques are not changed, and a
   position you deliberately clear stays blank. Check that the
   current position is appropriate for the critique date; all details are editable.
   If the directory is unavailable or the person or role is ambiguous, enter the
   position manually or refresh metadata sources. Other or unavailable schools
   are left blank. An Approved critique requires person, school and date;
   position is optional and remains in the library rather than being copied to moderation.
   Record the eight critique checks as Yes, No or Not applicable; leave unchecked
   questions Not recorded. Approval alone never supplies answers.
   Earlier approved critiques must be superseded if assessment links, the set of
   standards, standard versions, assessment source or original/final source links
   or the edition change. Refresh checks the linked items' availability,
   names, types and modification times, not their contents.
5. Changes autosave after a short pause. Incomplete or invalid entries are saved
   as private drafts under **Your saved drafts**; they are not offered to other
   teachers or moderation. Once valid, changes are automatically shared and a
   revision is retained. **Save now** retries immediately. If another teacher
   changes an entry first, your private draft remains available: copy your edits,
   discard the draft, reopen the shared entry and reapply them. A storage error
   leaves unsaved edits on the page and is shown explicitly.
   **Discard draft** removes your draft without deleting shared revisions.

When applying a library entry to an internal moderation sheet, the assessment's
original source is ticked; existing source ticks are preserved. A modified TKI or
NZQA assessment remains ticked as TKI or NZQA, not Own. The Internal Moderation
source shows only the linked Assessment Instructions & Schedule document names
and links. If no such files are linked, final links are used, or original links
when no final links are recorded. Original links, dates and modification notes
remain in the library. Existing unedited library-generated source text is
simplified when the record is opened; manually edited source text is preserved.
Saved moderation snapshots do not change automatically when a library entry is edited.

Use **Delete** on a library card to remove it from the shared catalogue after
confirmation. **Deleted library entries → Restore** restores the entry and its
revision history. Deletion hides saved drafts for that entry until restoration;
it does not delete moderation snapshots, evaluations or Google Drive files.
The draft and deleted lists show up to the 100 most recent entries.

### Suppliers and update reminders

**Suppliers** is a shared directory for signed-in Teachers and Global ADMIN.
The initial Instant and Kura Solutions contact details come from their public
websites; the source and checked date refer only to those initial details.
Staff can correct them, add suppliers, and save names, HTTPS websites, contact
details and notes. In a library entry, **Choose a saved supplier** fills only the
supplier name and website, asking before replacing existing values. Purchase
details and product links remain unchanged. Editing the name manually removes
the directory link. Existing entries can also match a supplier by name.

On the Suppliers page, **Load / refresh reminders** lets staff record an update
against a matching library brief, with required evidence/source and an optional
reminder date. Open reminders appear at the top of the page and can be marked
reviewed or reopened. These are manually verified notes, not automatic checks
of supplier versions. Purchase history and supplier accounts are not connected;
no credentials are requested or stored.

Subject offers saved standard subjects and confirmed WHS Unit Library teaching
subjects, with an option to type another subject. Department suggestions use the
existing teaching/staff directory. A single **Class Codes** multi-choice box sits
beside the brief description and applies to the whole edition, across years. Select any confirmed
class codes or add another code manually; a standard's Level does not restrict its
teaching year (for example, both 11DTECH and 12DTECH may use a Level 2 standard).
Matching moderation records can fill empty class choices; existing choices are
kept. Purchase, licence and critique details are not guessed. Class choices and
standard metadata are included in saved revision history. Class choices do not
restrict moderation access.
Older entries remain editable without adding these optional fields. Adding
Credits, Level or class choices does not invalidate approval of an unchanged
standard/version; changing the standard/version still requires a new critique.

In an Internal Moderation sheet or marking schedule, choose **Choose from Resource
Library**. Only active matching standard/version editions are offered; expired
licences cannot be applied. Review the source and choose an approved critique,
or choose not to copy critique details, then **Fill missing from library**.
After confirmation, this fills an empty Course Code with all class codes from the
library edition, and fills empty source/category, critiquer fields and recorded
critique check answers on the parent record,
plus Assessment Instructions & Schedule and Topic Brief links in its standard
schedule. Unrecorded checks remain empty; existing answers, critique checks, dates,
grades and student files are not overwritten. ZIPs, resource folders, invoices and prices are not copied.
The existing Course Code is never replaced. Student Tracker class-size guidance
lists the counts for the selected course codes. Under Strategic selection, enter
the four randomly selected students' initials to fill empty evidence entries;
existing names, marking and linked schedules are preserved and conflicts are
shown for review. The Random selection answer changes to Yes once all four
initials match their entries. A complete class total under six still sets Yes
automatically. The tick remains editable and is not cleared when initials change.
No Drive document is changed until **Create / update Google Drive
document** is used on the relevant sheet; updating an existing document replaces
its contents with the saved form, so review it first.

Record details also shows a class-code checklist, with confirmed teaching classes,
saved choices and class codes from the linked library assessment. If a linked
assessment has codes and the Course Code is empty, its codes are filled once;
later changes, including clearing all codes, are kept. For an unlinked record,
choose a matching assessment and **Add library class codes**; this adds only class
codes, not its source or critique. Use **Choose from Resource Library** on the
sheet to apply those details. The editable Course Code field remains available.

The selection is saved as a snapshot of the library edition, revision and chosen
critique. Later library edits do not change existing moderation. **Fill missing
from saved library selection** reuses that snapshot; use a new moderation record
for a different edition/critique. New individual marking schedules inherit the
standard template's teaching links and library snapshot, never its student
submissions or marking. Existing student schedules use **Fill missing from
standard template** explicitly.

The evaluation section automatically shows your own unlinked parent moderation
evaluations when their standard number and version match exactly one non-deleted
library assessment. This is a private suggestion based on the standard, not
proof that the record used that assessment: it does not change the record or
share the evaluation with other staff. Matching evaluations for other teachers
remain private. If multiple library entries cover the same standard and version,
that standard is flagged rather than guessed. Identical named evaluator details
are displayed once, with all matching years and standards identified; different
comments are labelled with their corresponding standards. Standards without an available evaluation
are shown too. Refresh to see later changes; at most 100 evaluations are shown.

Under **Internal moderation records → Link or unlink a moderation record
manually**, select your own parent record and year to open or explicitly link
it, including when a match is ambiguous. Linking requires a matching standard
and version and confirmation that the evaluation will be shared with all
signed-in staff. It does not change sheet fields or apply a critique; a record
already linked to another entry is not reassigned. A link made here can be
removed; a saved library selection snapshot cannot be removed through this
control. An unlinked evaluation may still appear privately to its owner if its
standard matches uniquely. Explicitly linked or selected evaluations remain shared as before.
Without a saved selection snapshot, an explicit link's evaluation stops
appearing when its standard/version no longer matches. Changes or deletion
update the live copy. Student records and other moderation content are not
shared here; avoid student names or identifiers in shared evaluation comments.

Normal startup migration creates `assessment_resource_library` and
`assessment_resource_library_history` in the Assessment Manager database.
The history insert and revision-checked save are atomic. No Core database changes,
additional Google permissions or new environment variables are required.

## Assessment and Moderation

Assessment standards and moderation records are stored in this app's separate
module database. Each user's records and standards list are scoped to their
verified Global Control user ID. Concurrent edits use revisions, record
deletions are audited, and an assessment with student records cannot be deleted.
The audit log stores record keys and action metadata only, not form contents.

This development app starts with no Planner records or student data. The existing
Teacher Planner Moderation feature and records must remain available until the
Manager has been tested, production access is configured, and a separately
reviewed cutover/data migration has been approved. Never point development at
the Teacher Planner or Global Control database.

The Teacher Planner's former Setup Assessment menu item has moved here. Set up
the Manager's My Standards list from the Setup Assessment section; the legacy
Planner standards list remains in Planner storage and is not copied automatically.
In Setup Moderation, choose a main Drive folder and add the topic names for each
assessment year; use the Folder year control and Open year to create or reuse
that year's named Drive folder. Google Drive permission is requested on this
action using the full `drive` scope, so folders created by hand in Drive can be
found and reused; the Google Cloud OAuth consent screen should be **Internal**
(school domain) so this restricted scope does not need Google verification.
A year without a selected main folder reuses your most recent year's
main folder; topics and records remain separate for each year. Preparing
folders creates `year/topic` folders, and each standard folder is created inside
its topic as `Level 2 - 91892` (no separate Level folders). Sync existing
folders reads the topic folders already inside that year's Drive folder, adds
them to the topic list and links any `Level N - standard` folders it finds,
as well as standard folders such as `91906` inside hand-made `Level N` folders,
without creating, moving or renaming anything. Duplicate standard folders must
be resolved in Drive first. Assign each standard to a topic in Setup Assessment; new
moderation records use that topic. A standard without a topic uses the synced
topic folder that already holds it, when exactly one does. Existing folders, records and Drive documents
are not moved or deleted.

Setup Assessment displays selected standards in a coloured table with an aligned
Topic Folder column. The new moderation record dropdown groups My Standards by
Level 1, Level 2 and Level 3; standards without those levels remain available in
Other / level not recorded.

Record details suggest Subject and Course Code from the signed-in teacher's
confirmed classes for that year in the WHS Unit Library Learning Area Profile,
loaded through Global Control's `/module-auth/teaching-subjects`. An empty
Subject is filled only when the teacher has one subject; an empty Course Code is
filled when the subject and standard level identify one course (for example
DTECH Level 3 → 13DTECH). Typed or saved values are kept, and failures leave
the fields editable. Assessor is a list of the chosen Faculty / Department's
members from the same Learning Area Profile, defaulting to the signed-in
teacher; choose Someone else to type another name.

Internal Moderation imports also accept older cover sheets whose Section C and
D answers sit in separate cells (for example `Date:` followed by the date, or
Location / file path inside the storage row); those cells are found by label.
Legacy wording such as `Signed:`, `Location or file path:` and the full verification
evidence prompt is supported, including a sighted person's position in the same cell as their name.
The Internal Moderation document shows the assessor on the faculty and teacher
line, formats the critique date as day-month-year, and uses 1.5 line spacing
for the final critique questions. Blank external-feedback and previous-critique
answers appear as No in the document; existing Yes, No and Not applicable
answers are preserved. Importing that document will import those displayed No
answers. Update an existing Drive document separately to apply the formatting.
Marking Schedule imports also handle Drive-edited
schedules where Topic Brief / File Submission sit in an extra row under Notes;
links are assigned to the heading they sit under. The criteria and requirement rows
are found by their headings, so removed blank rows do not skip requirements.
Newly created marking schedules use blue section headings, yellow student and
submission fields, and a purple overall-grade section. The Class Code field uses
the record's Course Code; Subject remains in the title banner. Existing Drive
documents are not reformatted automatically.

For an Achievement Standard, open its marking schedule and choose **Preview NZQA
Achievement Standard**. Review the official PDF and select the grade criteria and
individual proposed requirements to apply, or use **Select all requirements**.
Each selected bullet becomes a separate requirement row with its grade level;
previously saved grouped rows remain grouped. Notes describe the standard, not necessarily
the requirements of your particular assessment; some notes and PDF layouts cannot
be extracted. The source and PDF version appear once in Supporting notes and
the exported schedule, outside the criteria and requirement boxes. Existing
generated citations and repeated criteria introductions move out of these boxes
when the schedule is opened. Only empty
criteria and selected new requirement rows are added; existing marking and Drive
documents are unchanged. If the schedule or NZQA PDF changes while the preview is
open, preview again. Update the Drive document separately after checking the result.

Each requirement has an Achieved, Merit or Excellence level. NZQA proposals are
classified when their context matches a grade criterion; choose the level for
manual or unrecognised requirements. N means that individual requirement was
not met, including on Merit or Excellence rows; otherwise tick its level. This
does not automatically set an Achievement Standard's overall grade. Existing
marks that do not match the chosen level are retained and shown for review.

When the Internal Moderation Sheet opens, each linked student's saved overall
grade and marker comments fill an empty marker grade and discussion field.
Existing entries are preserved; clear a field and reopen the sheet to refill it.

### Verifiers

The **Moderation -> Verifiers** tab is a staff-shared contact directory for name,
school, position, email, notes/reference and the staff-recorded **NZQA Expert
Moderator** designation (not independently verified with NZQA). Contact edits are
revision-checked. **Email this verifier** prefills an editable Gmail draft; select
your assessment records, each with a level and an existing Internal Moderation
Drive sheet. Links are grouped by level with editable distinct-sample counts.
No student names are included. Review/send in Gmail yourself; preparing email
does not save records, change sharing or mark moderation complete.

**Moderation history** shows explicitly linked Assessment Manager records across
years and manually entered older/external moderation with year, department,
standard/title, optional date and notes/evidence reference. **Link my existing
record** loads one of your parent records for the chosen year and confirms saving
the stable contact ID, name, school and position using the latest revision. Other
content and dates stay unchanged; Drive documents are not refreshed. Historical
names are never automatically matched. Changing the verifier name on the internal
form removes its saved contact association; link the correct contact again here.
Linked history uses the saved verification date or dated named sample; undated
records remain awaiting moderation. Email drafts never count as completed history.
Save or cancel contact/manual-history edits before leaving.

Teachers see their own history and forms. Verified HoLAs can also read full parent
and student forms for their current department; ADMIN can read all. Each history
and full-record request checks current server-side Core/KAMAR leadership, failing
explicitly if unavailable. Other owners' forms remain read-only. Only the creator
can edit manual entries. Original Drive permissions are unchanged.
Migration `009_verifiers.sql` creates the shared contact and manual-history tables
in the existing Assessment Manager database. Focused checks:
`node --test verifiers.test.js moderation-ui.test.js`.

Each named student's Date moderated follows the Section C verification date;
a different date entered for a student is kept when the verification date changes.
Sighted by fields are shown and enabled only once the verifier's name and verification date
are entered. Empty name and position fields then default to the signed-in user
and their recorded website leadership role (for example HOLA Technology),
preferring the record's department; ambiguous roles are left for the user to enter.
Clearing verification hides and locks the fields again without deleting existing
details. The generated document also omits those details until verification is
complete.
The Assessment Evaluation box below Section D records evaluator name, position,
evaluation date and comments. An empty evaluation defaults to the signed-in
person and the same verified leadership role, while existing details are kept.
The evaluation comments box expands to show its contents without scrollbars.
Entering non-blank evaluation comments fills a blank evaluation date with the
current New Zealand date. The date remains editable and is not changed by later
edits; opening old comments alone does not invent a date. Evaluation details are
included in generated internal documents. Opening or editing the sheet sets
**Materials reviewed following feedback** to Yes when comments exist or the
date loaded into KAMAR is before today in New Zealand, even without comments.
This automatic tick is not proof that feedback was reviewed. Clearing those
details does not untick it; it can then be changed manually.

The KAMAR / SMS loaded date is entered in the results decision row. Results
are set to Yes automatically when the date is present and at least one named
student has a reported grade and date, with those details complete for every
named student. If the overall date has not previously been entered or cleared,
the latest student's reporting date fills it. The retention location appears in
the materials-retained row; entering a location or automatically filling a
prepared folder sets retention to Yes. A folder path alone does not confirm
that materials and student work are actually stored there. Clearing either
field leaves its tick unchanged; a manual retention decision is preserved on
reopening until the location changes.

On the Internal Moderation Sheet, an unrecorded consent answer is automatically
set to Yes when NZQA's current Base Scope of Assessment for Schools (BSAS)
confirms the standard's registered field, subfield, domain and level. The check
uses the current NZQA lists, not a subject-name guess, and applies only to the
current assessment year. Existing manual answers are preserved. If the standard
is outside BSAS, expired, ambiguous, or the check is unavailable, verify the
school's consent or any separate extension manually. An automatically recorded
tick is cleared if its standard changes or NZQA confirms it no longer qualifies;
if NZQA is unavailable, the saved tick is retained with a warning.

Beside "Random selection procedure used", the sheet lists the Student Tracker count for
each Course Code and their total (through Global Control's `/module-auth/class-size`).
The total is a sum of class counts, so students taking multiple listed classes are counted
more than once. A total is not shown when a count is unavailable or ambiguous, or the
counts use different timetables. Counts are display-only: they are not saved in the record
or included in the exported sheet. When the complete total is 1 to 5 students, opening the
sheet sets Random selection procedure used to Yes and autosaves it.

Evaluation sharing integration tests run with `node --test resource-library.test.js`.
To include the PostgreSQL check, set `ASSESSMENT_LIBRARY_TEST_DATABASE_URL` to an
**empty disposable PostgreSQL database**; the test creates migrations 002, 003 and 006.

NZQA search and standard details are read from public NZQA pages. Google Drive
document creation/import is optional: configure this module's Google Picker
client ID, API key and numeric app ID in its environment, with the development
origin registered and API-key restrictions enabled. These are app-specific
settings; do not copy Core secrets or OAuth tokens. Without this configuration,
private forms still save, but Drive actions remain unavailable.

Website restrictions on the Picker key must allow the module's origin and
`https://docs.google.com/*` (the Picker iframe). The signed-in Manager page uses
`Referrer-Policy: strict-origin` so Google can validate the website restriction
without receiving private URL paths or query strings. Authentication and API
responses retain the server's `no-referrer` policy.

## Standalone

1. Use Node 22.23.4 or a later 22.x release. The package engine enforces this
   minimum; Docker and CI are pinned to 22.23.4. Update all three pins together
   when adopting a later security release. Run `npm ci` from the committed
   package-lock.json.
2. Configure the names in `.env.example` in your environment; never commit values.
   For local development load them with your shell or Node's `--env-file` option.
3. Use a separate development PostgreSQL database, never the Global Control one.
4. Link a module-safe Render Environment Group containing `GLOBAL_CONTROL_URL`.
   Do not link groups containing Core database credentials, provider tokens,
   Google client secrets or Core's session secret.
5. Set site-specific `MODULE_CLIENT_ID=whs-assessment-manager:development`. Register the
   exact HTTPS app origin in Global Control's Module Builder environment record.
   `APP_BASE_URL` defaults to Render's `RENDER_EXTERNAL_URL`.
6. Run `npm test`, then `npm start` (runs versioned migrations before starting).
   `npm run db:migrate` can also be run separately. `/health` checks the database, not user access.
   The service deliberately returns 503 until Global Control configuration is present.

Global Control is the only sign-in authority. Access requires global ADMIN or
an explicit Lead Teacher, Teacher or Technician assignment for this module.
Teacher and Technician have equivalent access. Verified `module_roles` identify
module-scoped roles; never treat Lead Teacher as a global ADMIN or as permission
to read another user's private records. Business code must implement its own
module settings guards using this verified identity.
A state-bound, single-use 60-second code with PKCE is exchanged
server-to-server for an eight-hour opaque grant; only hashes are stored in Core.
Every application request checks the current role and module registration with
Core. Outages fail closed. Expired grants restart Global Control sign-in.
Module sign-out revokes its grant and signs out of Core. Core sign-out alone does
not revoke an existing module grant. Role removal, account deactivation or module
archiving takes effect at the next application request.
Local sessions use the module database and its own secret. Core cookies, Google
credentials and provider tokens are never shared. Identity headers are not trusted.

## Embedded integration contract

The intended mount is `/whs-assessment-manager/`. Exported `createModuleRouter` must be
mounted behind Global Control authentication; it reads server-supplied `req.user`.
Use `req.baseUrl` and relative links for nested routes. The standalone identity
adapter is not mounted when embedded. The host owns Google identity, avatar,
Settings, sign-out and primary navigation.

Add numbered SQL files under `db/migrations`; successful migration names are
recorded in `module_migrations`. Migrations run transactionally on one connection
with a transaction-level advisory lock. The initial migration is a no-data baseline;
`002_assessment_records.sql` adds owner-scoped records, settings and metadata-only
audit history.

Do not treat a Teacher role as authority over all records. Mutations require the
module session's CSRF token. Staff directory requests go through Global Control
with a module grant and request no staff email addresses. Supply a narrowly
scoped module database dependency when embedding this router.

## Release checklist

- Development/staging/production have separate credentials and data.
- No real emails, calendar writes or confidential records in development.
- User access, tenant/record ownership and denied access are tested.
- Migrations, restore, rollback, mobile, accessibility and any export/print
  requirements are tested in Global Control staging before release.
- Nothing automatically promotes or embeds this repository into production.
