ALTER TABLE food_room.department SET SCHEMA public;
ALTER TABLE public.department
  ADD COLUMN leadership_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT department_leadership_roles_array CHECK (jsonb_typeof(leadership_roles)='array');

-- Reviewed school website snapshot, 22 October 2026. Multiple roles and acting
-- appointments belong to the staff member, not to a replacement staff record.
DO $$
DECLARE person record; target_id integer;
BEGIN
  FOR person IN SELECT * FROM (VALUES
    ('Sarah','Bateup','[{"department":"P.E. / Health","role":"HOL","acting":false,"onLeave":true}]'),
    ('Kate','Veale','[{"department":"Junior School","role":"HOL","acting":false,"onLeave":false}]'),
    ('Mike','Talbot','[{"department":"P.E. / Health","role":"HOL","acting":true,"onLeave":false},{"department":"Outdoor Education","role":"TIC","acting":false,"onLeave":false}]'),
    ('Siobhan','O''Malley','[{"department":"English","role":"HOL","acting":false,"onLeave":false},{"department":"Social Science","role":"HOL","acting":true,"onLeave":false}]'),
    ('Chris','Collins','[{"department":"Mathematics","role":"HOL","acting":true,"onLeave":false}]'),
    ('Rachel','Wastney','[{"department":"Science","role":"HOL","acting":false,"onLeave":false}]'),
    ('Vanessa','Pringle','[{"department":"Technology","role":"HOL","acting":false,"onLeave":false}]'),
    ('Philippa','Mallinson','[{"department":"The Arts","role":"HOL","acting":false,"onLeave":false}]'),
    ('Christine','Weepu','[{"department":"Te reo me ona Tikanga","role":"HOL","acting":false,"onLeave":false}]')
  ) AS source(first_name,last_name,roles)
  LOOP
    SELECT id INTO target_id FROM public.department d
      WHERE lower(trim(d.first_name))=lower(person.first_name)
        AND regexp_replace(lower(d.last_name),'[^a-z]','','g')=regexp_replace(lower(person.last_name),'[^a-z]','','g')
      ORDER BY id LIMIT 1;
    IF target_id IS NULL THEN
      -- Reserve negative IDs for website-only rows so a later legacy import
      -- retains its original positive IDs without colliding with seed records.
      INSERT INTO public.department(id,first_name,last_name,staff_name,department,departments_comma)
      VALUES((SELECT LEAST(COALESCE(MIN(id),0),0)-1 FROM public.department),
        person.first_name,person.last_name,person.last_name || ', ' || person.first_name,
        person.roles::jsonb->0->>'department',
        (SELECT string_agg(role->>'department',', ') FROM jsonb_array_elements(person.roles::jsonb) role))
      RETURNING id INTO target_id;
    END IF;
    UPDATE public.department SET leadership_roles=(
      SELECT jsonb_agg(role || jsonb_build_object(
        'source','https://www.westlandhigh.school.nz/intranet/staff-at-westland-high/',
        'reviewedOn','2026-10-22'))
      FROM jsonb_array_elements(person.roles::jsonb) role
    ) WHERE id=target_id;
  END LOOP;
END $$;

-- Keep legacy Food Room reads and writes on the same underlying Kamar records.
CREATE VIEW food_room.department AS SELECT * FROM public.department;
