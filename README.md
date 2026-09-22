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
- `SESSION_SECRET`: long random value
- `ADMIN_EMAILS`: school-owned admin accounts, for example `tech@westlandhigh.school.nz`
- `GOOGLE_HOSTED_DOMAIN`: optional Google Workspace domain restriction

In Google Cloud Console, add the same callback URL as an authorised redirect URI.

## Admin model

The first matching email in `ADMIN_EMAILS` is automatically granted the `Administrator` role on login. Additional users can then be managed through the admin pages.

Future systems should be added as modules first, then migrated into routes/controllers under this single application over time.
