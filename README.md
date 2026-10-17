# WHS APPSystem

Unified Westland High School app shell for one Render Web Service, one Postgres database, and one Google Login configuration.

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
- Sewing Hub public homepage with assigned Student and Teacher activity access.
- Initial Kamar Uploader module under the ADMIN dashboard, with term-aware PostgreSQL uploads and history.
- Docker and Render Blueprint configuration.

## Local setup

1. Copy `.env.example` to `.env`.
2. Fill in `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
3. Install dependencies:

```bash
npm install
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
