CREATE TABLE IF NOT EXISTS kamar_history_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kamar_datasets (
  id uuid PRIMARY KEY,
  dataset_type text NOT NULL CHECK (dataset_type IN ('staff','student_details','student_timetable','teacher_timetable','subjects')),
  school_year integer NOT NULL CHECK (school_year BETWEEN 2000 AND 2100),
  term integer NOT NULL CHECK (term BETWEEN 1 AND 4),
  source_date date NOT NULL,
  source_time time NOT NULL,
  source_name text NOT NULL,
  content_hash text NOT NULL UNIQUE CHECK (length(content_hash)=64),
  payload jsonb NOT NULL,
  raw_csv text,
  row_count integer NOT NULL CHECK (row_count > 0),
  origin text NOT NULL CHECK (origin IN ('upload','archive')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kamar_datasets_term ON kamar_datasets (school_year,term,dataset_type,source_date DESC,source_time DESC);

CREATE TABLE kamar_record_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  record_key text NOT NULL,
  record jsonb NOT NULL,
  event text NOT NULL,
  dataset_id uuid REFERENCES kamar_datasets(id),
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kamar_record_versions_identity ON kamar_record_versions (source_table,record_key,id DESC);

CREATE FUNCTION kamar_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'KAMAR history is append-only' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER kamar_datasets_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON kamar_datasets
  FOR EACH STATEMENT EXECUTE FUNCTION kamar_history_immutable();
CREATE TRIGGER kamar_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON kamar_record_versions
  FOR EACH STATEMENT EXECUTE FUNCTION kamar_history_immutable();

CREATE FUNCTION kamar_capture_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  value jsonb;
  batch uuid := nullif(current_setting('whs.kamar_dataset_id',true),'')::uuid;
BEGIN
  IF TG_OP='TRUNCATE' THEN
    RAISE EXCEPTION 'KAMAR tables must not be truncated; preserve their records' USING ERRCODE='55000';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    value := to_jsonb(OLD);
    INSERT INTO kamar_record_versions(source_table,record_key,record,event,dataset_id)
      VALUES (TG_TABLE_NAME,coalesce(value->>'id',value->>'teacher'),value,lower(TG_OP)||'-before',batch);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    value := to_jsonb(NEW);
    INSERT INTO kamar_record_versions(source_table,record_key,record,event,dataset_id)
      VALUES (TG_TABLE_NAME,coalesce(value->>'id',value->>'teacher'),value,lower(TG_OP)||'-after',batch);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

LOCK TABLE staff_upload,student_details_upload,student_upload,timetable_upload IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['staff_upload','student_details_upload','student_upload','timetable_upload'] LOOP
    EXECUTE format('INSERT INTO kamar_record_versions(source_table,record_key,record,event)
      SELECT %L,coalesce(to_jsonb(t)->>''id'',to_jsonb(t)->>''teacher''),to_jsonb(t),''baseline'' FROM %I t',name,name);
    EXECUTE format('CREATE TRIGGER kamar_capture AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION kamar_capture_record()',name);
    EXECUTE format('CREATE TRIGGER kamar_no_truncate BEFORE TRUNCATE ON %I
      FOR EACH STATEMENT EXECUTE FUNCTION kamar_capture_record()',name);
  END LOOP;
END;
$$;
