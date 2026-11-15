CREATE TABLE assessment_suppliers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  website text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  source_checked date,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by uuid
);
CREATE UNIQUE INDEX assessment_suppliers_name_unique ON assessment_suppliers (lower(btrim(name)));

INSERT INTO assessment_suppliers (id,name,website,email,phone,source_url,source_checked) VALUES
  ('48f6472f-0982-4c87-94af-e62ef1e68eb2','Instant','https://www.instant.org.nz/','orders@instant.org.nz','0800 864 863','https://www.instant.org.nz/contact/','2026-11-15'),
  ('337991fb-8e1e-4d24-80d5-1c9ee0fb579e','Kura Solutions','https://kurasolutions.co.nz/','support@kurasolutions.co.nz','021 552 247','https://kurasolutions.co.nz/frequently-asked-questions/','2026-11-15');

CREATE TABLE assessment_supplier_reminders (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES assessment_suppliers(id),
  resource_id uuid NOT NULL REFERENCES assessment_resource_library(id),
  details text NOT NULL,
  source text NOT NULL,
  due_date date,
  completed boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX assessment_supplier_reminders_supplier ON assessment_supplier_reminders(supplier_id,completed,updated_at DESC);
