CREATE TABLE IF NOT EXISTS infrastructure_cost_report (
  id integer PRIMARY KEY CHECK (id = 1),
  snapshot jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION module_builder_paid_defaults() RETURNS trigger AS $$
BEGIN
  NEW.config := NEW.config || jsonb_build_object(
    'region', 'oregon', 'servicePlan', '0.5c-512mb', 'databasePlan', '0.1c-256mb'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS module_builder_paid_defaults_trigger ON module_builder_environments;
CREATE TRIGGER module_builder_paid_defaults_trigger BEFORE INSERT ON module_builder_environments
FOR EACH ROW EXECUTE FUNCTION module_builder_paid_defaults();
