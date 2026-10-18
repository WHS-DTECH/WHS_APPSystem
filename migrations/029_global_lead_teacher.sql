INSERT INTO roles (name, description)
VALUES ('Lead Teacher', 'Same Global Control access as Teacher. Hub administration must be assigned separately within each hub.')
ON CONFLICT (name) DO NOTHING;
