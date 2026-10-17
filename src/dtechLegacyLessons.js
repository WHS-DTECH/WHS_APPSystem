function createLegacyLessonReader(pool) {
  let enabled = false;

  return {
    async initialize() {
      const result = await pool.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'lessons'`);
      const columns = new Set(result.rows.map((row) => row.column_name));
      enabled = columns.has('course_id') && columns.has('title');
      if (enabled) {
        const sections = await pool.query(`SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'sections'`);
        const sectionColumns = new Set(sections.rows.map((row) => row.column_name));
        for (const column of ['id', 'lesson_id', 'title', 'content', 'order']) {
          if (!sectionColumns.has(column)) throw new Error(`DTECH legacy sections is missing required column: ${column}`);
        }
      }
      return enabled;
    },

    async list(id) {
      if (!enabled) return [];
      const result = await pool.query(`SELECT l.*,
        COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s."order" NULLS LAST, s.id)
          FROM sections s WHERE s.lesson_id::text = l.id::text), '[]'::jsonb) AS sections
        FROM lessons l
        ${id === undefined ? '' : 'WHERE l.id::text = $1'}
        ORDER BY l.course_id, l."order" NULLS LAST, l.id`, id === undefined ? [] : [id]);
      return result.rows.map((row) => ({
        ...row,
        id: `legacy-course-${row.id}`,
        legacy_id: String(row.id),
        legacy_course_lesson: true,
        lesson_title: row.title,
        activity_name: row.title,
        lesson_focus: row.description || '',
        lesson_plan: { legacy_content: row.content, legacy_sections: row.sections }
      }));
    }
  };
}

module.exports = { createLegacyLessonReader };
