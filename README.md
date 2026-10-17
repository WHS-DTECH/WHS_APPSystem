# WHS APPSystem

Unified Westland High School app shell for one Render Web Service and one Google Login configuration. Core data uses the shared Postgres database; DTECH keeps its existing separate legacy database.

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
- Docker and Render Blueprint configuration.

## DTECH Hub: original site, separate database and private files

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
The shared sidebar lists **Class Training** under **CAPSULES**, between HUBS
and STUDENT APPS. **HUB Dashboard** is the sidebar label for `/technology-hub/`;
**APPs Dashboard** opens `/student-apps`. These labels do not change routes or roles.
Original DTECH activity detail pages recognise the shared school session, so
Assessment Tasks and Projects open without a separate legacy Google token.
This is a DTECH submodule, **not a Student App**. Its deployable source is copied
from `LegacySites/ClassTraining/ClassTrainingSys` into
`hosted-apps/dtech-class-training`, retaining the original templates, assets,
checkers, courses and database models. Hosting changes replace local Google/password
sign-in and role editing with Core controls; they do not recreate the site.
The supplied section-based progress model is used by the course completion action.
Original course ownership still applies to teacher editing.

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
   Lead Teacher/Teacher receive teacher tools; other active school users receive
   student access. The current Core role is checked on every request, including
   for old training accounts previously stored as teachers. Local role editors
   redirect to Core and cannot change that authority.
   Local User Roles and Permissions links are removed from desktop/mobile menus
   and the training Admin page; use the shared account controls instead.
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
Teacher, Technician and Student mappings are hidden under optional access and
are disabled until an administrator or Lead Teacher enables them. Builders can
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

## Kamar Uploader module

The original Kamar Uploader pages (Home, Staff Upload, Student Upload, Student Timetable, Staff Timetable) are served at `/admin/kamar-uploader/` to ADMIN users, with the legacy API (`/api/staff_upload`, `/api/student_details_upload`, `/api/student_upload`, `/api/upload_timetable`, `/api/timetable/all`, `/api/feed/*`, `/api/projects/links`) ported from the legacy server. Roles come from the app's Google login; the legacy cookie login, permission tables and role pages are replaced by `/admin/users`. Feed APIs need a Teacher, Staff or ADMIN user.

Data lives in the unified `DATABASE_URL` database using the legacy tables (`staff_upload`, `student_details_upload`, `student_upload`, `timetable_upload`, `app_project_links`). If `INTEGRATION_KAMAR_DATABASE_URL` is set (or, failing that, `INTEGRATION_LEARNING_SITES_DATABASE_URL`, since both legacy sites share `whs_tech_main`), the legacy Term 1-3 data is copied once into the unified database on first use; all new uploads are written to the unified database only. Staff and Student roles are derived from the current `staff_upload` and `student_details_upload` emails. The copied legacy source and sample data under `LegacySites/` are excluded from Git.

## Workshop module

The Workshop is the legacy Workshop site (public/workshop, legacy API in src/legacy/workshop) under /workshop, using the Google login. Admins and users given the Workshop Lead Teacher hub role (assign at /admin/users) can upload worksheets, lesson notes and planners; signed-in users can upload activities. Existing data is copied once from INTEGRATION_WORKSHOP_DATABASE_URL (guarded by workshop_legacy_import); new data goes to DATABASE_URL. Suggestion notification emails are sent through the framework's Google Gmail API (GOOGLE_GMAIL_* variables) to Admins and Workshop Lead Teachers; SITE_URL is used in the email links.

## Food Room module

The Food Room is the legacy recipeCalculator site (public/food-room, legacy API in src/legacy/food-room) under /food-room, using the Google login. The legacy tables live in the ood_room schema (migration 014) and existing data is copied once from INTEGRATION_FOOD_ROOM_DATABASE_URL (guarded by food_room_legacy_import); new data goes to DATABASE_URL. The app's roles are mirrored into the legacy role tables on each request: ADMIN -> admin, Food Room Lead Teacher hub role -> lead_teacher, Food Room Technician hub role -> technician, Teacher/Staff -> teacher, Student -> student (assign hub roles at /admin/users). Emails (suggestions, weekly digest, place order, shopping reviews) are sent through the Google Gmail API (GOOGLE_GMAIL_* variables) with a [Food Room Hub] subject prefix. Food Room specific variables: PLACE_ORDER_* (pilot recipient, admin copy, Tuesday cron, Google form/sheet URLs), GOOGLE_CREDENTIALS, GOOGLE_TOKEN_JSON, GOOGLE_OAUTH_REDIRECT_URI and GOOGLE_PLANNER_* (planner sync), WEEKLY_DIGEST_CRON, SUGGESTION_NOTIFY_TO and SITE_URL. The Puppeteer recipe extractor pages need the optional puppeteer package.
