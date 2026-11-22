ALTER TABLE teacher_planner_mcp_grants
  ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '8 hours';
