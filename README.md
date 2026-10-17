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

Flask apps in `hosted-apps/<slug>/` with an `app.json` manifest run inside the
school Docker service through Gunicorn. Register the project with the matching
slug (for Guidance, use the name **Guidance Counsellor App**, producing
`guidance-counsellor-app`). Set `GUIDANCE_COUNSELLOR_APP_DATABASE_URL` on the main
service to retain its legacy database.

Hosted apps use the school sign-in wrapper automatically: students do not paste
the external sign-in route or load an app secret. After administrator registration,
map the roles in step 3 and open the app. Existing active hosted registrations
can also map roles without repeating the external sign-in verification.
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
