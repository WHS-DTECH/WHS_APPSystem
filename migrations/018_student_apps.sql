-- Student-built apps that keep their own web service and database but sign in through this system.
CREATE TABLE IF NOT EXISTS student_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  hub_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  app_url TEXT NOT NULL,
  app_roles TEXT[] NOT NULL DEFAULT '{}',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  secret_hash TEXT NOT NULL,
  login_verified_at TIMESTAMPTZ,
  roles_mapped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Which role inside the app each platform role becomes when a user signs in.
CREATE TABLE IF NOT EXISTS student_app_role_map (
  app_id UUID NOT NULL REFERENCES student_apps(id) ON DELETE CASCADE,
  platform_role TEXT NOT NULL,
  app_role TEXT NOT NULL,
  PRIMARY KEY (app_id, platform_role)
);

-- One-time sign-in codes handed to the app, exchanged server-to-server for the user's details.
CREATE TABLE IF NOT EXISTS student_app_login_codes (
  code TEXT PRIMARY KEY,
  app_id UUID NOT NULL REFERENCES student_apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
