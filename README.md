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

Recommended environment values:

- `APP_BASE_URL`: the public Render service URL, for example `https://whs-appsystem.onrender.com`
- `GOOGLE_REDIRECT_URI`: `${APP_BASE_URL}/auth/google/callback`
- `DATABASE_URL`: Render Postgres internal connection string
- `SESSION_SECRET`: long random value. The app also accepts `SECRET_KEY` if that is already set in the Render Environment Group.
- `ADMIN_EMAILS`: `vanessapringle@westlandhigh.school.nz,tech@westlandhigh.school.nz`
- `GOOGLE_HOSTED_DOMAIN`: optional Google Workspace domain restriction

In Google Cloud Console, add the same callback URL as an authorised redirect URI.

## Admin model

The configured `vanessapringle@westlandhigh.school.nz` and `tech@westlandhigh.school.nz` accounts are automatically granted `ADMIN`, `Teacher`, and `Student` roles on login, allowing either administrator to toggle between those views. Other users are assigned roles through the admin pages. The public homepage is available without login.

Future systems should be added as modules first, then migrated into routes/controllers under this single application over time.

## Learning Sites module

The public entry point is `/learning-sites`. Relief Planning is protected by the unified Google session and is available to `Teacher` and `ADMIN` users. Learning Site administration is protected by `ADMIN`. The legacy API-key and cookie mechanisms are not reused.

## Kamar Uploader module

The first integrated module is available to ADMIN users at `/admin/kamar-uploader`. It accepts parsed CSV rows and writes them directly to the `kamar` PostgreSQL schema. It does not save uploaded files to the application filesystem. The copied legacy source and sample data under `OldSystem - dont push to GIT/` are explicitly excluded from Git.
