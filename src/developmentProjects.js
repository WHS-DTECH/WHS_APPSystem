const { query } = require('./db');

// Wizard projects still in development that are not yet registered as a Core module (ADMIN visibility only).
async function developmentProjects(user, dbQuery = query) {
  if (!user?.roles?.includes('ADMIN')) return [];
  const { rows } = await dbQuery(`SELECT p.id, p.slug, p.name, p.description, e.config->>'appUrl' AS app_url
    FROM module_builder_projects p JOIN module_builder_environments e ON e.project_id=p.id AND e.kind='development'
    WHERE p.stage IN ('draft','development','staging') AND NOT p.listed_as_student_app
      AND NOT EXISTS (SELECT 1 FROM modules m WHERE m.module_key=p.slug AND m.path LIKE '/%')
    ORDER BY p.name`);
  return rows;
}

module.exports = { developmentProjects };
