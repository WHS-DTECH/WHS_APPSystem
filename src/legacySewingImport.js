const { Pool } = require('pg');
const { pool } = require('./db');
const config = require('./config');

const legacyHubKeys = new Set(['SEWING', 'TECH-SEWING', 'TECH_SEWING', 'SEWING-HUB']);
const activityColumns = [
  'name',
  'year_level',
  'type',
  'activity_category',
  'duration_hours',
  'difficulty',
  'description',
  'outcome_image_url',
  'idea_url',
  'resources',
  'equipment',
  'instructions',
  'class_management_notes',
  'class_preparation',
  'assessment_focus',
  'color',
  'is_this_week'
];

function normaliseActivity(activity) {
  return {
    name: String(activity.name || '').trim(),
    year_level: String(activity.year_level || '').trim(),
    type: String(activity.type || '').trim(),
    activity_category: ['Practice', 'Assessment', 'Skill', 'URL Idea'].includes(activity.activity_category)
      ? activity.activity_category
      : 'Practice',
    duration_hours: Number(activity.duration_hours),
    difficulty: activity.difficulty,
    description: activity.description || null,
    outcome_image_url: activity.outcome_image_url || null,
    idea_url: activity.idea_url || null,
    resources: activity.resources || null,
    equipment: activity.equipment || null,
    instructions: activity.instructions || null,
    class_management_notes: activity.class_management_notes || null,
    class_preparation: activity.class_preparation || null,
    assessment_focus: activity.assessment_focus || null,
    color: activity.color || 'color-rose',
    is_this_week: Boolean(activity.is_this_week),
    hub_site: 'SEWING-HUB'
  };
}

function isImportableActivity(activity) {
  return activity.name
    && activity.year_level
    && activity.type
    && Number.isFinite(activity.duration_hours)
    && activity.duration_hours > 0
    && ['Beginner', 'Intermediate', 'Advanced'].includes(activity.difficulty);
}

async function hasColumn(sourcePool, columnName) {
  const result = await sourcePool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'activities'
         AND column_name = $1
     ) AS present`,
    [columnName]
  );
  return result.rows[0].present;
}

async function importLegacySewingActivities() {
  if (!config.legacySewingDatabaseUrl) {
    console.warn('Legacy Sewing Hub import skipped: INTEGRATION_SEWING_HUB_DATABASE_URL is not configured.');
    return;
  }

  const sourcePool = new Pool({
    connectionString: config.legacySewingDatabaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 1
  });

  try {
    const hasHubSite = await hasColumn(sourcePool, 'hub_site');
    const hasHub = await hasColumn(sourcePool, 'hub');
    const sourceColumns = [...activityColumns, ...(hasHubSite ? ['hub_site'] : []), ...(hasHub ? ['hub'] : [])];
    const hubColumns = [
      hasHubSite ? `UPPER(BTRIM(COALESCE(hub_site, ''))) = ANY($1)` : null,
      hasHub ? `UPPER(BTRIM(COALESCE(hub, ''))) = ANY($1)` : null
    ].filter(Boolean);

    if (!hubColumns.length) {
      throw new Error('Legacy activities table has no hub identifier column');
    }

    const hubCondition = `(${hubColumns.join(' OR ')})`;
    const sourceResult = await sourcePool.query(
      `SELECT ${sourceColumns.join(', ')}
       FROM activities
       WHERE ${hubCondition}
       ORDER BY id`,
      [Array.from(legacyHubKeys)]
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const sourceActivity of sourceResult.rows) {
        const activity = normaliseActivity(sourceActivity);
        if (!isImportableActivity(activity)) {
          continue;
        }

        await client.query(
          `INSERT INTO activities (
             name, year_level, type, activity_category, duration_hours, difficulty,
             description, outcome_image_url, idea_url, resources, equipment, instructions,
             class_management_notes, class_preparation, assessment_focus, hub_site, color, is_this_week
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
           ON CONFLICT (name) DO UPDATE SET
             year_level = EXCLUDED.year_level,
             type = EXCLUDED.type,
             activity_category = EXCLUDED.activity_category,
             duration_hours = EXCLUDED.duration_hours,
             difficulty = EXCLUDED.difficulty,
             description = EXCLUDED.description,
             outcome_image_url = EXCLUDED.outcome_image_url,
             idea_url = EXCLUDED.idea_url,
             resources = EXCLUDED.resources,
             equipment = EXCLUDED.equipment,
             instructions = EXCLUDED.instructions,
             class_management_notes = EXCLUDED.class_management_notes,
             class_preparation = EXCLUDED.class_preparation,
             assessment_focus = EXCLUDED.assessment_focus,
             hub_site = EXCLUDED.hub_site,
             color = EXCLUDED.color,
             is_this_week = EXCLUDED.is_this_week`,
          [
            activity.name,
            activity.year_level,
            activity.type,
            activity.activity_category,
            activity.duration_hours,
            activity.difficulty,
            activity.description,
            activity.outcome_image_url,
            activity.idea_url,
            activity.resources,
            activity.equipment,
            activity.instructions,
            activity.class_management_notes,
            activity.class_preparation,
            activity.assessment_focus,
            activity.hub_site,
            activity.color,
            activity.is_this_week
          ]
        );
      }
      await client.query('COMMIT');
      console.log(`Imported ${sourceResult.rows.length} legacy Sewing Hub activity records.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await sourcePool.end();
  }
}

module.exports = { importLegacySewingActivities };
