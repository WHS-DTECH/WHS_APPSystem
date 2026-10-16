CREATE TABLE IF NOT EXISTS sewing_hub_suggestions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  activity_name VARCHAR(255) NOT NULL,
  suggested_by VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sewing_legacy_import (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activities_imported INTEGER NOT NULL DEFAULT 0,
  suggestions_imported INTEGER NOT NULL DEFAULT 0
);
