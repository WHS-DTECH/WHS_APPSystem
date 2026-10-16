const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const appConfig = require("../../config");
const { pool: appPool } = require("../../db");

const CONTENT_DIR = path.join(__dirname, "content");

const STATUS_VALUES = new Set(["not_started", "incomplete", "complete", "pending"]);
const TERM_VALUES = new Set(["T1", "T3"]);
const COURSE_CONTENT_TARGETS = new Set(["11TEXT"]);
const HEALTH_SAFETY_URL = "/Health-Safety/";
const PRACTICAL_SKILLS_SHARED_URL = "https://dtech-hub2.onrender.com/practical-skills/checklist.html";
const LOCKED_LINK_LABELS = {
  first: "Health & Safety",
  last: "Practical Skills"
};
const SUBJECT_DISPLAY_NAMES = {
  DTECH: "DTECH",
  COMP: "COMP",
  DVC: "DVC",
  FOOD: "Food",
  TEXTILES: "Textiles",
  WOOD: "Woodwork"
};
const SUBJECT_DEFAULT_LINK_LABELS = {
  DTECH: [
    "91902 Database",
    "91906 Programming",
    "91903 Digital Media",
    "91907 Digital Technologies",
    "91908 Computer Science"
  ],
  COMP: [
    "91902 Algorithms",
    "91906 Programming",
    "91903 Data",
    "91907 Problem solving",
    "91908 Computer Science"
  ],
  DVC: ["Course overview", "Design brief", "Drawing", "Rendering", "Presentation", "Portfolio"],
  FOOD: ["Course overview", "Recipes", "Planning", "Nutrition", "Kitchen skills", "Evaluation"],
  TEXTILES: ["Course overview", "Materials", "Construction", "Design ideas", "Portfolio", "Evaluation"],
  WOOD: ["Course overview", "Tools", "Processes", "Project build", "Finishing", "Evaluation"]
};

const COURSE_SEED = [
  { subjectCode: "DTECH", courseCode: "JDTECH", courseName: "Junior Digital Tech" },
  { subjectCode: "DTECH", courseCode: "MDTECH-S1", courseName: "Middle Digital Tech Semester 1" },
  { subjectCode: "DTECH", courseCode: "MDTECH-S2", courseName: "Middle Digital Tech Semester 2" },
  { subjectCode: "DTECH", courseCode: "11DTECH", courseName: "Year 11 Digital Tech" },
  { subjectCode: "DTECH", courseCode: "12DTECH", courseName: "Year 12 Digital Tech" },
  { subjectCode: "DTECH", courseCode: "13DTECH", courseName: "Year 13 Digital Tech" },
  { subjectCode: "COMP", courseCode: "MCOMP-S2", courseName: "Middle Computing Semester 2" },
  { subjectCode: "COMP", courseCode: "11COMP", courseName: "Year 11 Computing" },
  { subjectCode: "COMP", courseCode: "12COMP", courseName: "Year 12 Computing" },
  { subjectCode: "COMP", courseCode: "13COMP", courseName: "Year 13 Computing" },
  { subjectCode: "DVC", courseCode: "JDVC", courseName: "Junior DVC" },
  { subjectCode: "DVC", courseCode: "MDVC-S1", courseName: "Middle DVC Semester 1" },
  { subjectCode: "DVC", courseCode: "MDVC-S2", courseName: "Middle DVC Semester 2" },
  { subjectCode: "DVC", courseCode: "11DVC", courseName: "Year 11 DVC" },
  { subjectCode: "DVC", courseCode: "12DVC", courseName: "Year 12 DVC" },
  { subjectCode: "DVC", courseCode: "13DVC", courseName: "Year 13 DVC" },
  { subjectCode: "FOOD", courseCode: "JFOOD", courseName: "Junior Food" },
  { subjectCode: "FOOD", courseCode: "MFOOD-S1", courseName: "Middle Food Semester 1" },
  { subjectCode: "FOOD", courseCode: "MFOOD-S2", courseName: "Middle Food Semester 2" },
  { subjectCode: "FOOD", courseCode: "11HOSP", courseName: "Year 11 Hospitality" },
  { subjectCode: "FOOD", courseCode: "12HOSP", courseName: "Year 12 Hospitality" },
  { subjectCode: "FOOD", courseCode: "13HOSP", courseName: "Year 13 Hospitality" },
  { subjectCode: "TEXTILES", courseCode: "JTEXT", courseName: "Junior Textiles" },
  { subjectCode: "TEXTILES", courseCode: "MTEXT-S1", courseName: "Middle Textiles Semester 1" },
  { subjectCode: "TEXTILES", courseCode: "MTEXT-S2", courseName: "Middle Textiles Semester 2" },
  { subjectCode: "TEXTILES", courseCode: "11TEXT", courseName: "Year 11 Textiles" },
  { subjectCode: "TEXTILES", courseCode: "12TEXT", courseName: "Year 12 Textiles" },
  { subjectCode: "TEXTILES", courseCode: "13TEXT", courseName: "Year 13 Textiles" },
  { subjectCode: "WOOD", courseCode: "JWOOD", courseName: "Junior Wood" },
  { subjectCode: "WOOD", courseCode: "MWOOD-S1", courseName: "Middle Wood Semester 1" },
  { subjectCode: "WOOD", courseCode: "MWOOD-S2", courseName: "Middle Wood Semester 2" },
  { subjectCode: "WOOD", courseCode: "11FURN", courseName: "Year 11 Furniture" },
  { subjectCode: "WOOD", courseCode: "12FURN", courseName: "Year 12 Furniture" },
  { subjectCode: "WOOD", courseCode: "13FURN", courseName: "Year 13 Furniture" }
];

// Allow course-content uploads for all seeded courses via the selector.
for (const course of COURSE_SEED) {
  COURSE_CONTENT_TARGETS.add(course.courseCode);
}

let initPromise = null;
let legacyPool = null;

// All reads and writes use the unified app database.
function getPool() {
  return appPool;
}

function getLegacyPool() {
  if (!appConfig.legacyLearningSitesDatabaseUrl) {
    return null;
  }

  if (!legacyPool) {
    legacyPool = new Pool({
      connectionString: appConfig.legacyLearningSitesDatabaseUrl,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
      max: 2
    });
  }

  return legacyPool;
}

// One-time copy of the legacy Learning Sites data into the unified database.
// After it succeeds the unified database is the only source of truth.
async function importLegacyData() {
  const source = getLegacyPool();
  if (!source) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS learning_sites_legacy_import (
      source TEXT PRIMARY KEY,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      details JSONB
    )
  `);

  const done = await query("SELECT 1 FROM learning_sites_legacy_import WHERE source = 'admin-store'");
  if (done.rowCount > 0) {
    return;
  }

  try {
    const [requirements, content, activity] = await Promise.all([
      source.query(`
        SELECT c.course_code, r.*
        FROM admin_term_requirements r
        INNER JOIN admin_courses c ON c.id = r.course_id
      `),
      source.query("SELECT * FROM admin_course_content"),
      source.query("SELECT * FROM admin_course_content_activity ORDER BY id")
    ]);

    const client = await appPool.connect();
    try {
      await client.query("BEGIN");

      for (const row of requirements.rows) {
        await client.query(
          `INSERT INTO admin_term_requirements (
             course_id, school_year, school_term, outline_status, statement_status,
             outline_updated_at, statement_updated_at, updated_by, notes,
             assessments_status, pdf_statement_status, health_safety_status,
             practical_skills_status, topic_buttons_status, assessments_updated_at,
             pdf_statement_updated_at, health_safety_updated_at,
             practical_skills_updated_at, topic_buttons_updated_at)
           SELECT c.id, $2::integer, $3::text, $4::text, $5::text, $6::timestamptz, $7::timestamptz, $8::text, $9::text,
                  $10::text, $11::text, $12::text, $13::text, $14::text, $15::timestamptz,
                  $16::timestamptz, $17::timestamptz, $18::timestamptz, $19::timestamptz
           FROM admin_courses c WHERE c.course_code = $1::text
           ON CONFLICT (course_id, school_year, school_term) DO UPDATE SET
             outline_status = EXCLUDED.outline_status,
             statement_status = EXCLUDED.statement_status,
             outline_updated_at = EXCLUDED.outline_updated_at,
             statement_updated_at = EXCLUDED.statement_updated_at,
             updated_by = EXCLUDED.updated_by,
             notes = EXCLUDED.notes,
             assessments_status = EXCLUDED.assessments_status,
             pdf_statement_status = EXCLUDED.pdf_statement_status,
             health_safety_status = EXCLUDED.health_safety_status,
             practical_skills_status = EXCLUDED.practical_skills_status,
             topic_buttons_status = EXCLUDED.topic_buttons_status,
             assessments_updated_at = EXCLUDED.assessments_updated_at,
             pdf_statement_updated_at = EXCLUDED.pdf_statement_updated_at,
             health_safety_updated_at = EXCLUDED.health_safety_updated_at,
             practical_skills_updated_at = EXCLUDED.practical_skills_updated_at,
             topic_buttons_updated_at = EXCLUDED.topic_buttons_updated_at`,
          [
            row.course_code, row.school_year, row.school_term, row.outline_status, row.statement_status,
            row.outline_updated_at, row.statement_updated_at, row.updated_by, row.notes,
            row.assessments_status || "not_started", row.pdf_statement_status || "not_started",
            row.health_safety_status || "not_started", row.practical_skills_status || "not_started",
            row.topic_buttons_status || "not_started", row.assessments_updated_at,
            row.pdf_statement_updated_at, row.health_safety_updated_at,
            row.practical_skills_updated_at, row.topic_buttons_updated_at
          ]
        );
      }

      for (const row of content.rows) {
        await client.query(
          `INSERT INTO admin_course_content (
             course_code, assessments, assessment_links, statement_filename,
             statement_mime, statement_pdf, updated_at, updated_by)
           SELECT $1::text, $2::jsonb, $3::jsonb, $4::text, $5::text, $6::bytea, $7::timestamptz, $8::text
           WHERE EXISTS (SELECT 1 FROM admin_courses WHERE course_code = $1::text)
           ON CONFLICT (course_code) DO UPDATE SET
             assessments = EXCLUDED.assessments,
             assessment_links = EXCLUDED.assessment_links,
             statement_filename = EXCLUDED.statement_filename,
             statement_mime = EXCLUDED.statement_mime,
             statement_pdf = EXCLUDED.statement_pdf,
             updated_at = EXCLUDED.updated_at,
             updated_by = EXCLUDED.updated_by`,
          [
            row.course_code, JSON.stringify(row.assessments || []), JSON.stringify(row.assessment_links || []),
            row.statement_filename, row.statement_mime, row.statement_pdf, row.updated_at, row.updated_by
          ]
        );
      }

      for (const row of activity.rows) {
        await client.query(
          `INSERT INTO admin_course_content_activity (course_code, activity_type, actor_name, detail, created_at)
           SELECT $1::text, $2::text, $3::text, $4::text, $5::timestamptz
           WHERE EXISTS (SELECT 1 FROM admin_courses WHERE course_code = $1::text)`,
          [row.course_code, row.activity_type, row.actor_name, row.detail, row.created_at]
        );
      }

      await client.query(
        "INSERT INTO learning_sites_legacy_import (source, details) VALUES ('admin-store', $1::jsonb)",
        [JSON.stringify({
          requirements: requirements.rowCount,
          content: content.rowCount,
          activity: activity.rowCount
        })]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Learning Sites legacy import failed; will retry on next start:", error.message);
  }
}

async function query(text, values = []) {
  const db = getPool();

  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }

  return db.query(text, values);
}

function initAdminSchema() {
  if (!initPromise) {
    initPromise = runInitAdminSchema().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

async function runInitAdminSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS admin_subjects (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_courses (
      id SERIAL PRIMARY KEY,
      subject_code TEXT NOT NULL REFERENCES admin_subjects(code) ON DELETE CASCADE,
      course_code TEXT NOT NULL UNIQUE,
      course_name TEXT NOT NULL,
      owner_name TEXT,
      owner_email TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS admin_term_requirements (
      id SERIAL PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES admin_courses(id) ON DELETE CASCADE,
      school_year INTEGER NOT NULL,
      school_term TEXT NOT NULL CHECK (school_term IN ('T1', 'T3')),
      outline_status TEXT NOT NULL DEFAULT 'pending' CHECK (outline_status IN ('pending', 'complete')),
      statement_status TEXT NOT NULL DEFAULT 'pending' CHECK (statement_status IN ('pending', 'complete')),
      outline_updated_at TIMESTAMPTZ,
      statement_updated_at TIMESTAMPTZ,
      updated_by TEXT,
      notes TEXT,
      UNIQUE(course_id, school_year, school_term)
    );

    CREATE TABLE IF NOT EXISTS admin_reminder_logs (
      id SERIAL PRIMARY KEY,
      course_id INTEGER REFERENCES admin_courses(id) ON DELETE SET NULL,
      school_year INTEGER NOT NULL,
      school_term TEXT NOT NULL CHECK (school_term IN ('T1', 'T3')),
      recipient_email TEXT NOT NULL,
      subject_line TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'queued',
      message TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_course_content (
      course_code TEXT PRIMARY KEY REFERENCES admin_courses(course_code) ON DELETE CASCADE,
      assessments JSONB NOT NULL DEFAULT '[]'::jsonb,
      assessment_links JSONB NOT NULL DEFAULT '[]'::jsonb,
      statement_filename TEXT,
      statement_mime TEXT,
      statement_pdf BYTEA,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_course_content_activity (
      id SERIAL PRIMARY KEY,
      course_code TEXT NOT NULL REFERENCES admin_courses(course_code) ON DELETE CASCADE,
      activity_type TEXT NOT NULL CHECK (activity_type IN ('content-save', 'statement-upload')),
      actor_name TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS assessments_status TEXT NOT NULL DEFAULT 'not_started';

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS pdf_statement_status TEXT NOT NULL DEFAULT 'not_started';

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS health_safety_status TEXT NOT NULL DEFAULT 'not_started';

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS practical_skills_status TEXT NOT NULL DEFAULT 'not_started';

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS topic_buttons_status TEXT NOT NULL DEFAULT 'not_started';

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS assessments_updated_at TIMESTAMPTZ;

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS pdf_statement_updated_at TIMESTAMPTZ;

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS health_safety_updated_at TIMESTAMPTZ;

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS practical_skills_updated_at TIMESTAMPTZ;

    ALTER TABLE admin_term_requirements
    ADD COLUMN IF NOT EXISTS topic_buttons_updated_at TIMESTAMPTZ;

    UPDATE admin_term_requirements
    SET assessments_status = CASE
          WHEN outline_status = 'complete' THEN 'complete'
          WHEN assessments_status = 'not_started' THEN 'incomplete'
          ELSE assessments_status
        END,
        pdf_statement_status = CASE
          WHEN statement_status = 'complete' THEN 'complete'
          ELSE pdf_statement_status
        END
    WHERE assessments_status = 'not_started'
       OR pdf_statement_status = 'not_started';
  `);

  await seedSubjectsAndCourses();
  await seedDefaultTermRequirements(new Date().getUTCFullYear());
  await importLegacyData();
  await resetMwoodS2ContentFromPageIfNeeded(new Date().getUTCFullYear());
  await applyEvidenceOverrides(new Date().getUTCFullYear());
}

function normalizeCourseCode(courseCode) {
  return String(courseCode || "").trim().toUpperCase();
}

function getCourseSubjectCode(courseCode) {
  const safeCode = normalizeCourseCode(courseCode);
  const seededCourse = COURSE_SEED.find((entry) => entry.courseCode === safeCode);
  return seededCourse?.subjectCode || null;
}

function getPracticalSkillsLabel(courseCode) {
  const subjectCode = getCourseSubjectCode(courseCode);
  const subjectName = subjectCode ? SUBJECT_DISPLAY_NAMES[subjectCode] || subjectCode : null;

  if (!subjectName) {
    return LOCKED_LINK_LABELS.last;
  }

  return `${subjectName} Practical Skills`;
}

function getPracticalSkillsUrl(courseCode, currentUrl) {
  const subjectCode = getCourseSubjectCode(courseCode);
  const normalizedCurrentUrl = String(currentUrl || "").trim();

  if (subjectCode === "DTECH" || subjectCode === "COMP") {
    return PRACTICAL_SKILLS_SHARED_URL;
  }

  return normalizedCurrentUrl || "#";
}

function normalizeAssessments(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeAssessmentLinks(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((link) => ({
      label: String(link?.label || "").trim(),
      url: String(link?.url || "").trim() || "#"
    }))
    .filter((link) => link.label)
    .slice(0, 10);
}

function applyLockedLinkLabels(courseCode, links) {
  if (!Array.isArray(links) || !links.length) {
    return links;
  }

  const output = links.map((link) => ({ ...link }));
  output[0] = {
    ...output[0],
    label: LOCKED_LINK_LABELS.first,
    url: String(output[0]?.url || "").trim() === "#" || !String(output[0]?.url || "").trim()
      ? HEALTH_SAFETY_URL
      : String(output[0].url).trim()
  };

  output[output.length - 1] = {
    ...output[output.length - 1],
    label: getPracticalSkillsLabel(courseCode),
    url: getPracticalSkillsUrl(courseCode, output[output.length - 1]?.url)
  };

  return output;
}

async function ensureCourseContentRow(courseCode) {
  await query(
    `
      INSERT INTO admin_course_content (course_code)
      VALUES ($1)
      ON CONFLICT (course_code) DO NOTHING
    `,
    [courseCode]
  );
}

function normalizeActorName(value) {
  return String(value || "").trim().slice(0, 80) || "Unknown staff";
}

function fileBufferLooksLikePdf(fileBuffer) {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length < 4) {
    return false;
  }

  return fileBuffer.subarray(0, 4).toString("utf8") === "%PDF";
}

function hasPlaceholderText(value) {
  return /replace\s+with/i.test(String(value || ""));
}

function isValidAssessment(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !hasPlaceholderText(text);
}

function isValidLink(link) {
  const label = String(link?.label || "").trim();
  const url = String(link?.url || "").trim();
  return Boolean(label) && Boolean(url) && url !== "#" && !hasPlaceholderText(label) && !hasPlaceholderText(url);
}

function evaluateAssessmentsStatus(assessments) {
  const safeAssessments = Array.isArray(assessments) ? assessments : [];
  if (!safeAssessments.length) {
    return "not_started";
  }

  const validCount = safeAssessments.filter(isValidAssessment).length;
  if (safeAssessments.length >= 3 && validCount === safeAssessments.length) {
    return "complete";
  }

  return "incomplete";
}

function evaluateHealthSafetyStatus(assessmentLinks) {
  const firstLink = Array.isArray(assessmentLinks) && assessmentLinks.length ? assessmentLinks[0] : null;
  if (!firstLink) {
    return "not_started";
  }

  return isValidLink(firstLink) ? "complete" : "not_started";
}

function evaluatePracticalSkillsStatus(assessmentLinks) {
  const lastLink = Array.isArray(assessmentLinks) && assessmentLinks.length
    ? assessmentLinks[assessmentLinks.length - 1]
    : null;

  if (!lastLink) {
    return "not_started";
  }

  return isValidLink(lastLink) ? "complete" : "not_started";
}

function evaluateTopicButtonsStatus(assessments, assessmentLinks) {
  const safeAssessments = Array.isArray(assessments) ? assessments : [];
  const topicButtons = Array.isArray(assessmentLinks)
    ? assessmentLinks.slice(1, -1)
    : [];
  const hasAnyTopicContent = topicButtons.some((link) => String(link?.label || "").trim() || String(link?.url || "").trim());
  const validTopicButtons = topicButtons.filter(isValidLink);

  if (!safeAssessments.length && !hasAnyTopicContent) {
    return "not_started";
  }

  if (!safeAssessments.length) {
    return "incomplete";
  }

  const allAssessmentsValid = safeAssessments.every(isValidAssessment);
  if (allAssessmentsValid && validTopicButtons.length === safeAssessments.length && validTopicButtons.length > 0) {
    return "complete";
  }

  return "incomplete";
}

async function syncCourseRequirementFromContent(courseCode, updatedBy, schoolYear) {
  const safeCode = normalizeCourseCode(courseCode);
  if (!safeCode) {
    return;
  }

  const content = await getCourseContent(safeCode);
  const assessmentsStatus = evaluateAssessmentsStatus(content.assessments);
  const pdfStatementStatus = content.hasStatementPdf ? "complete" : "not_started";
  const healthSafetyStatus = evaluateHealthSafetyStatus(content.assessmentLinks);
  const practicalSkillsStatus = evaluatePracticalSkillsStatus(content.assessmentLinks);
  const topicButtonsStatus = evaluateTopicButtonsStatus(content.assessments, content.assessmentLinks);
  const safeYear = Number.isInteger(schoolYear) ? schoolYear : new Date().getUTCFullYear();
  const actorName = updatedBy ? normalizeActorName(updatedBy) : null;

  await seedDefaultTermRequirements(safeYear);
  await query(
    `
      UPDATE admin_term_requirements r
      SET assessments_status = $2,
          pdf_statement_status = $3,
          health_safety_status = $4,
          practical_skills_status = $5,
          topic_buttons_status = $6,
          assessments_updated_at = CASE
            WHEN $2 = 'complete' AND r.assessments_status <> 'complete' THEN NOW()
            ELSE r.assessments_updated_at
          END,
          pdf_statement_updated_at = CASE
            WHEN $3 = 'complete' AND r.pdf_statement_status <> 'complete' THEN NOW()
            ELSE r.pdf_statement_updated_at
          END,
          health_safety_updated_at = CASE
            WHEN $4 = 'complete' AND r.health_safety_status <> 'complete' THEN NOW()
            ELSE r.health_safety_updated_at
          END,
          practical_skills_updated_at = CASE
            WHEN $5 = 'complete' AND r.practical_skills_status <> 'complete' THEN NOW()
            ELSE r.practical_skills_updated_at
          END,
          topic_buttons_updated_at = CASE
            WHEN $6 = 'complete' AND r.topic_buttons_status <> 'complete' THEN NOW()
            ELSE r.topic_buttons_updated_at
          END,
          outline_status = CASE WHEN $2 = 'complete' THEN 'complete' ELSE 'pending' END,
          statement_status = CASE WHEN $3 = 'complete' THEN 'complete' ELSE 'pending' END,
          outline_updated_at = CASE
            WHEN $2 = 'complete' AND r.outline_status <> 'complete' THEN NOW()
            ELSE r.outline_updated_at
          END,
          statement_updated_at = CASE
            WHEN $3 = 'complete' AND r.statement_status <> 'complete' THEN NOW()
            ELSE r.statement_updated_at
          END,
          updated_by = COALESCE($7, r.updated_by)
      FROM admin_courses c
      WHERE r.course_id = c.id
        AND c.course_code = $1
        AND r.school_year = $8
        AND r.school_term IN ('T1', 'T3')
    `,
    [
      safeCode,
      assessmentsStatus,
      pdfStatementStatus,
      healthSafetyStatus,
      practicalSkillsStatus,
      topicButtonsStatus,
      actorName,
      safeYear
    ]
  );
}

async function syncAllCourseRequirementsFromContent(schoolYear) {
  const targetCodes = Array.from(COURSE_CONTENT_TARGETS);

  for (const courseCode of targetCodes) {
    await syncCourseRequirementFromContent(courseCode, null, schoolYear);
  }
}

async function recordCourseContentActivity({ courseCode, activityType, actorName, detail }) {
  await query(
    `
      INSERT INTO admin_course_content_activity (course_code, activity_type, actor_name, detail)
      VALUES ($1, $2, $3, $4)
    `,
    [courseCode, activityType, normalizeActorName(actorName), detail || null]
  );
}

async function getCourseContentActivity(courseCode, limit = 12) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 50)) : 12;
  const result = await query(
    `
      SELECT id, activity_type, actor_name, detail, created_at
      FROM admin_course_content_activity
      WHERE course_code = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [courseCode, safeLimit]
  );

  return result.rows;
}

function defaultCourseContent(courseCode) {
  const course = COURSE_SEED.find((entry) => entry.courseCode === courseCode);
  const subjectCode = course?.subjectCode || "TEXTILES";
  const defaultLabels = SUBJECT_DEFAULT_LINK_LABELS[subjectCode] || SUBJECT_DEFAULT_LINK_LABELS.TEXTILES;

  return {
    assessments: [
      "Replace with assessment 1.",
      "Replace with assessment 2.",
      "Replace with assessment 3."
    ],
    assessmentLinks: [
      { label: LOCKED_LINK_LABELS.first, url: HEALTH_SAFETY_URL },
      ...defaultLabels.map((label) => ({ label, url: "#" })),
      { label: getPracticalSkillsLabel(courseCode), url: "#" }
    ]
  };
}

async function getCourseContent(courseCode) {
  const safeCode = normalizeCourseCode(courseCode);
  if (!safeCode) {
    throw new Error("courseCode is required");
  }

  if (!COURSE_CONTENT_TARGETS.has(safeCode)) {
    throw new Error("Course uploader is not configured for this course yet");
  }

  await ensureCourseContentRow(safeCode);

  const result = await query(
    `
      SELECT
        course_code,
        assessments,
        assessment_links,
        statement_filename,
        statement_mime,
        statement_pdf IS NOT NULL AS has_statement_pdf,
        updated_at,
        updated_by
      FROM admin_course_content
      WHERE course_code = $1
      LIMIT 1
    `,
    [safeCode]
  );

  const row = result.rows[0];
  const defaults = defaultCourseContent(safeCode);
  const normalizedLinks = applyLockedLinkLabels(
    safeCode,
    row.assessment_links?.length ? row.assessment_links : defaults.assessmentLinks
  );
  const activity = await getCourseContentActivity(safeCode);

  return {
    courseCode: safeCode,
    assessments: row.assessments?.length ? row.assessments : defaults.assessments,
    assessmentLinks: normalizedLinks,
    hasStatementPdf: Boolean(row.has_statement_pdf),
    statementFilename: row.statement_filename || null,
    statementMime: row.statement_mime || null,
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || null,
    activity
  };
}

async function upsertCourseContent(payload) {
  const safeCode = normalizeCourseCode(payload.courseCode);
  if (!safeCode) {
    throw new Error("courseCode is required");
  }

  if (!COURSE_CONTENT_TARGETS.has(safeCode)) {
    throw new Error("Course uploader is not configured for this course yet");
  }

  const assessments = normalizeAssessments(payload.assessments);
  const assessmentLinks = applyLockedLinkLabels(
    safeCode,
    normalizeAssessmentLinks(payload.assessmentLinks)
  );
  const actorName = normalizeActorName(payload.updatedBy);

  await ensureCourseContentRow(safeCode);
  await query(
    `
      UPDATE admin_course_content
      SET assessments = $2::jsonb,
          assessment_links = $3::jsonb,
          updated_at = NOW(),
          updated_by = COALESCE($4, updated_by)
      WHERE course_code = $1
    `,
    [safeCode, JSON.stringify(assessments), JSON.stringify(assessmentLinks), actorName]
  );

  await recordCourseContentActivity({
    courseCode: safeCode,
    activityType: "content-save",
    actorName,
    detail: `${assessments.length} assessments, ${assessmentLinks.length} buttons`
  });
  await syncCourseRequirementFromContent(safeCode, actorName);

  return {
    ok: true,
    courseCode: safeCode,
    assessments,
    assessmentLinks,
    updatedBy: actorName
  };
}

async function saveCourseStatementPdf(payload) {
  const safeCode = normalizeCourseCode(payload.courseCode);
  if (!safeCode) {
    throw new Error("courseCode is required");
  }

  if (!COURSE_CONTENT_TARGETS.has(safeCode)) {
    throw new Error("Course uploader is not configured for this course yet");
  }

  if (!payload.fileBuffer || !Buffer.isBuffer(payload.fileBuffer) || payload.fileBuffer.length === 0) {
    throw new Error("A PDF file is required");
  }

  if (payload.fileBuffer.length > 10 * 1024 * 1024) {
    throw new Error("PDF is too large. Maximum size is 10MB.");
  }

  const fileName = String(payload.fileName || `${safeCode}-statement.pdf`).trim();
  const mimeType = String(payload.mimeType || "").toLowerCase();
  const fileNameLooksPdf = fileName.toLowerCase().endsWith(".pdf");
  const fileBytesLookPdf = fileBufferLooksLikePdf(payload.fileBuffer);
  const mimeIsAccepted = ["application/pdf", "application/x-pdf", "application/octet-stream", ""].includes(mimeType);

  if (!mimeIsAccepted || (!fileNameLooksPdf && !fileBytesLookPdf)) {
    throw new Error("Only PDF uploads are supported");
  }

  const actorName = normalizeActorName(payload.updatedBy);

  await ensureCourseContentRow(safeCode);
  await query(
    `
      UPDATE admin_course_content
      SET statement_filename = $2,
          statement_mime = $3,
          statement_pdf = $4,
          updated_at = NOW(),
          updated_by = COALESCE($5, updated_by)
      WHERE course_code = $1
    `,
    [safeCode, fileName, "application/pdf", payload.fileBuffer, actorName]
  );

  await recordCourseContentActivity({
    courseCode: safeCode,
    activityType: "statement-upload",
    actorName,
    detail: payload.activityDetail || fileName
  });
  await syncCourseRequirementFromContent(safeCode, actorName);

  return {
    ok: true,
    courseCode: safeCode,
    statementFilename: fileName,
    updatedBy: actorName
  };
}

async function getCourseStatementPdf(courseCode) {
  const safeCode = normalizeCourseCode(courseCode);
  if (!safeCode) {
    throw new Error("courseCode is required");
  }

  const result = await query(
    `
      SELECT statement_filename, statement_mime, statement_pdf
      FROM admin_course_content
      WHERE course_code = $1
      LIMIT 1
    `,
    [safeCode]
  );

  if (!result.rows.length || !result.rows[0].statement_pdf) {
    return null;
  }

  return {
    fileName: result.rows[0].statement_filename || `${safeCode}-statement.pdf`,
    mimeType: result.rows[0].statement_mime || "application/pdf",
    fileBuffer: result.rows[0].statement_pdf
  };
}

function hasMwoodS2Evidence() {
  const mwoodPath = path.join(CONTENT_DIR, "WOOD", "MWOOD-S2", "index.md");

  if (!fs.existsSync(mwoodPath)) {
    return false;
  }

  const content = fs.readFileSync(mwoodPath, "utf8");
  const hasAssessments = content.includes("assessments:");
  const hasStatement = content.includes("statement:");
  return hasAssessments && hasStatement;
}

function parseFrontMatterValue(raw) {
  const value = String(raw || "").trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function getMwoodS2PageEvidence() {
  const mwoodPath = path.join(CONTENT_DIR, "WOOD", "MWOOD-S2", "index.md");
  if (!fs.existsSync(mwoodPath)) {
    return null;
  }

  const content = fs.readFileSync(mwoodPath, "utf8");
  const assessmentsSectionMatch = content.match(/\nassessments:\n([\s\S]*?)\nassessmentLinks:\n/);
  const linksSectionMatch = content.match(/\nassessmentLinks:\n([\s\S]*?)\nassessmentGroup:\n/);

  const assessments = [];
  if (assessmentsSectionMatch) {
    const assessmentMatches = assessmentsSectionMatch[1].matchAll(/-\s*code:\s*(.+)/g);
    for (const match of assessmentMatches) {
      const value = parseFrontMatterValue(match[1]);
      if (value) {
        assessments.push(value);
      }
    }
  }

  const assessmentLinks = [];
  if (linksSectionMatch) {
    const linkMatches = linksSectionMatch[1].matchAll(/-\s*label:\s*(.+)\n\s*url:\s*(.+)/g);
    for (const match of linkMatches) {
      const label = parseFrontMatterValue(match[1]);
      const url = parseFrontMatterValue(match[2]) || "#";
      if (label) {
        assessmentLinks.push({ label, url });
      }
    }
  }

  let statementFileName = null;
  let statementPdf = null;
  const embedUrlMatch = content.match(/\n\s*embedUrl:\s*(.+)/);
  if (embedUrlMatch) {
    const embedUrl = parseFrontMatterValue(embedUrlMatch[1]);
    if (embedUrl && embedUrl.startsWith("/") && embedUrl.toLowerCase().endsWith(".pdf")) {
      const localPdfPath = path.join(CONTENT_DIR, decodeURIComponent(embedUrl.replace(/^\/+/, "")));
      if (fs.existsSync(localPdfPath)) {
        statementPdf = fs.readFileSync(localPdfPath);
        statementFileName = path.basename(localPdfPath);
      }
    }
  }

  return {
    assessments,
    assessmentLinks,
    statementFileName,
    statementPdf
  };
}

async function resetMwoodS2ContentFromPageIfNeeded(schoolYear) {
  const courseCode = "MWOOD-S2";
  await ensureCourseContentRow(courseCode);

  const result = await query(
    `
      SELECT assessments, assessment_links, statement_pdf IS NOT NULL AS has_statement_pdf
      FROM admin_course_content
      WHERE course_code = $1
      LIMIT 1
    `,
    [courseCode]
  );

  if (!result.rows.length) {
    return;
  }

  const row = result.rows[0];
  const currentAssessments = Array.isArray(row.assessments) ? row.assessments : [];
  const currentLinks = Array.isArray(row.assessment_links) ? row.assessment_links : [];
  const assessmentsLookDefault = currentAssessments.length === 0 || currentAssessments.every((item) => hasPlaceholderText(item));
  const linksLookDefault = currentLinks.length === 0 || currentLinks.every((link) => !isValidLink(link));
  const needsReset = assessmentsLookDefault || linksLookDefault || !row.has_statement_pdf;

  if (!needsReset) {
    return;
  }

  const evidence = getMwoodS2PageEvidence();
  if (!evidence || !evidence.assessments.length || !evidence.assessmentLinks.length) {
    return;
  }

  const assessments = normalizeAssessments(evidence.assessments);
  const assessmentLinks = applyLockedLinkLabels(courseCode, normalizeAssessmentLinks(evidence.assessmentLinks));
  const actorName = "page-evidence: MWOOD-S2";

  await query(
    `
      UPDATE admin_course_content
      SET assessments = $2::jsonb,
          assessment_links = $3::jsonb,
          statement_filename = COALESCE($4, statement_filename),
          statement_mime = CASE WHEN $5::bytea IS NOT NULL THEN 'application/pdf' ELSE statement_mime END,
          statement_pdf = COALESCE($5, statement_pdf),
          updated_at = NOW(),
          updated_by = $6
      WHERE course_code = $1
    `,
    [
      courseCode,
      JSON.stringify(assessments),
      JSON.stringify(assessmentLinks),
      evidence.statementFileName,
      evidence.statementPdf,
      actorName
    ]
  );

  await syncCourseRequirementFromContent(courseCode, actorName, schoolYear);
}

async function applyEvidenceOverrides(year) {
  // MWOOD-S2 is currently maintained as fully updated and can be used as evidence.
  if (!hasMwoodS2Evidence()) {
    return;
  }

  await query(
    `
      UPDATE admin_term_requirements r
      SET outline_status = 'complete',
          statement_status = 'complete',
          assessments_status = 'complete',
          pdf_statement_status = 'complete',
          health_safety_status = 'complete',
          practical_skills_status = 'complete',
          topic_buttons_status = 'complete',
          outline_updated_at = COALESCE(r.outline_updated_at, NOW()),
          statement_updated_at = COALESCE(r.statement_updated_at, NOW()),
          assessments_updated_at = COALESCE(r.assessments_updated_at, NOW()),
          pdf_statement_updated_at = COALESCE(r.pdf_statement_updated_at, NOW()),
          health_safety_updated_at = COALESCE(r.health_safety_updated_at, NOW()),
          practical_skills_updated_at = COALESCE(r.practical_skills_updated_at, NOW()),
          topic_buttons_updated_at = COALESCE(r.topic_buttons_updated_at, NOW()),
          updated_by = COALESCE(r.updated_by, 'evidence: MWOOD-S2 page'),
          notes = COALESCE(r.notes, 'Auto-marked complete from MWOOD-S2 course page evidence')
      FROM admin_courses c
      WHERE r.course_id = c.id
        AND c.course_code = 'MWOOD-S2'
        AND r.school_year = $1
        AND r.school_term IN ('T1', 'T3')
    `,
    [year]
  );
}

async function seedSubjectsAndCourses() {
  const subjectNames = {
    DTECH: "Digital Technologies",
    COMP: "Computing",
    DVC: "Design and Visual Communication",
    FOOD: "Food and Hospitality",
    TEXTILES: "Textiles",
    WOOD: "Woodwork and Furniture"
  };

  for (const [code, name] of Object.entries(subjectNames)) {
    await query(
      `
        INSERT INTO admin_subjects (code, name)
        VALUES ($1, $2)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      `,
      [code, name]
    );
  }

  for (const course of COURSE_SEED) {
    await query(
      `
        INSERT INTO admin_courses (subject_code, course_code, course_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (course_code) DO UPDATE
        SET subject_code = EXCLUDED.subject_code,
            course_name = EXCLUDED.course_name
      `,
      [course.subjectCode, course.courseCode, course.courseName]
    );
  }
}

async function seedDefaultTermRequirements(year) {
  await query(
    `
      INSERT INTO admin_term_requirements (course_id, school_year, school_term)
      SELECT c.id, $1, term_value
      FROM admin_courses c
      CROSS JOIN (VALUES ('T1'), ('T3')) AS t(term_value)
      WHERE c.is_active = true
      ON CONFLICT (course_id, school_year, school_term) DO NOTHING
    `,
    [year]
  );
}

function normalizeTerm(term) {
  const normalized = String(term || "").toUpperCase();
  return TERM_VALUES.has(normalized) ? normalized : null;
}

function normalizeStatus(status) {
  const raw = String(status || "").trim().toLowerCase();

  if (raw === "--" || raw === "not-started" || raw === "not started") {
    return "not_started";
  }

  if (raw === "x" || raw === "pending") {
    return "incomplete";
  }

  if (raw === "tick" || raw === "ticked" || raw === "✓" || raw === "✔") {
    return "complete";
  }

  const normalized = raw;
  return STATUS_VALUES.has(normalized) ? normalized : null;
}

async function getDashboard({ year, term }) {
  const safeYear = Number.isInteger(year) ? year : new Date().getUTCFullYear();
  const safeTerm = normalizeTerm(term) || "T1";

  await seedDefaultTermRequirements(safeYear);
  await syncAllCourseRequirementsFromContent(safeYear);

  const summaryResult = await query(
    `
      SELECT
        COUNT(*)::INT AS total_courses,
        COUNT(*) FILTER (
          WHERE r.assessments_status = 'complete'
            AND r.pdf_statement_status = 'complete'
            AND r.health_safety_status = 'complete'
            AND r.practical_skills_status = 'complete'
            AND r.topic_buttons_status = 'complete'
        )::INT AS courses_complete,
        COUNT(*) FILTER (
          WHERE r.assessments_status <> 'complete'
             OR r.pdf_statement_status <> 'complete'
             OR r.health_safety_status <> 'complete'
             OR r.practical_skills_status <> 'complete'
             OR r.topic_buttons_status <> 'complete'
        )::INT AS courses_incomplete,
        COUNT(*) FILTER (WHERE r.assessments_status = 'complete')::INT AS assessments_complete,
        COUNT(*) FILTER (WHERE r.pdf_statement_status = 'complete')::INT AS pdf_statement_complete,
        COUNT(*) FILTER (
          WHERE r.assessments_status = 'complete'
            AND r.pdf_statement_status = 'complete'
            AND r.health_safety_status = 'complete'
            AND r.practical_skills_status = 'complete'
            AND r.topic_buttons_status = 'complete'
        )::INT AS fully_complete,
        COUNT(*) FILTER (WHERE r.assessments_status <> 'complete')::INT AS missing_assessments,
        COUNT(*) FILTER (WHERE r.pdf_statement_status <> 'complete')::INT AS missing_pdf_statement
      FROM admin_term_requirements r
      JOIN admin_courses c ON c.id = r.course_id
      WHERE r.school_year = $1
        AND r.school_term = $2
        AND c.is_active = true
    `,
    [safeYear, safeTerm]
  );

  const subjectResult = await query(
    `
      SELECT
        s.code,
        s.name,
        COUNT(*)::INT AS total_courses,
        COUNT(*) FILTER (
          WHERE r.assessments_status = 'complete'
            AND r.pdf_statement_status = 'complete'
            AND r.health_safety_status = 'complete'
            AND r.practical_skills_status = 'complete'
            AND r.topic_buttons_status = 'complete'
        )::INT AS fully_complete,
        COUNT(*) FILTER (
          WHERE r.assessments_status <> 'complete'
             OR r.pdf_statement_status <> 'complete'
             OR r.health_safety_status <> 'complete'
             OR r.practical_skills_status <> 'complete'
             OR r.topic_buttons_status <> 'complete'
        )::INT AS still_required
      FROM admin_term_requirements r
      JOIN admin_courses c ON c.id = r.course_id
      JOIN admin_subjects s ON s.code = c.subject_code
      WHERE r.school_year = $1
        AND r.school_term = $2
        AND c.is_active = true
      GROUP BY s.code, s.name
      ORDER BY s.code
    `,
    [safeYear, safeTerm]
  );

  return {
    year: safeYear,
    term: safeTerm,
    summary: summaryResult.rows[0],
    subjects: subjectResult.rows
  };
}

async function getCourseStatus({ year, term, subject, status }) {
  const safeYear = Number.isInteger(year) ? year : new Date().getUTCFullYear();
  const safeTerm = normalizeTerm(term) || "T1";
  const safeSubject = subject ? String(subject).toUpperCase() : null;
  const safeStatus = status ? String(status).toLowerCase() : null;

  await seedDefaultTermRequirements(safeYear);
  await syncAllCourseRequirementsFromContent(safeYear);

  const courseResult = await query(
    `
      SELECT
        c.course_code,
        c.course_name,
        c.subject_code,
        s.name AS subject_name,
        r.assessments_status,
        r.pdf_statement_status,
        r.health_safety_status,
        r.practical_skills_status,
        r.topic_buttons_status,
        r.assessments_updated_at,
        r.pdf_statement_updated_at,
        r.health_safety_updated_at,
        r.practical_skills_updated_at,
        r.topic_buttons_updated_at,
        r.updated_by,
        r.notes,
        CASE
          WHEN r.assessments_status = 'complete'
            AND r.pdf_statement_status = 'complete'
            AND r.health_safety_status = 'complete'
            AND r.practical_skills_status = 'complete'
            AND r.topic_buttons_status = 'complete' THEN 'green'
          WHEN r.assessments_status = 'complete'
            OR r.pdf_statement_status = 'complete'
            OR r.health_safety_status = 'complete'
            OR r.practical_skills_status = 'complete'
            OR r.topic_buttons_status = 'complete' THEN 'amber'
          ELSE 'red'
        END AS dashboard_status
      FROM admin_term_requirements r
      JOIN admin_courses c ON c.id = r.course_id
      JOIN admin_subjects s ON s.code = c.subject_code
      WHERE r.school_year = $1
        AND r.school_term = $2
        AND c.is_active = true
        AND ($3::TEXT IS NULL OR c.subject_code = $3)
      ORDER BY c.subject_code, c.course_code
    `,
    [safeYear, safeTerm, safeSubject]
  );

  let rows = courseResult.rows;
  if (["red", "amber", "green"].includes(safeStatus)) {
    rows = rows.filter((row) => row.dashboard_status === safeStatus);
  }

  return {
    year: safeYear,
    term: safeTerm,
    subject: safeSubject,
    status: safeStatus,
    courses: rows
  };
}

async function updateCourseRequirement(payload) {
  const safeCourseCode = String(payload.courseCode || "").toUpperCase();
  const safeYear = Number.parseInt(payload.year, 10);
  const safeTerm = normalizeTerm(payload.term);
  const assessmentsStatus = normalizeStatus(payload.assessmentsStatus);
  const pdfStatementStatus = normalizeStatus(payload.pdfStatementStatus);
  const healthSafetyStatus = normalizeStatus(payload.healthSafetyStatus);
  const practicalSkillsStatus = normalizeStatus(payload.practicalSkillsStatus);
  const topicButtonsStatus = normalizeStatus(payload.topicButtonsStatus);

  if (!safeCourseCode || !Number.isInteger(safeYear) || !safeTerm) {
    throw new Error("courseCode, year, and term are required");
  }

  if (!assessmentsStatus && !pdfStatementStatus && !healthSafetyStatus && !practicalSkillsStatus && !topicButtonsStatus && payload.notes === undefined) {
    throw new Error("No updates provided");
  }

  const currentResult = await query(
    `
      SELECT
        r.id,
        r.assessments_status,
        r.pdf_statement_status,
        r.health_safety_status,
        r.practical_skills_status,
        r.topic_buttons_status
      FROM admin_term_requirements r
      JOIN admin_courses c ON c.id = r.course_id
      WHERE c.course_code = $1
        AND r.school_year = $2
        AND r.school_term = $3
      LIMIT 1
    `,
    [safeCourseCode, safeYear, safeTerm]
  );

  if (!currentResult.rows.length) {
    throw new Error("Course requirement row not found");
  }

  const current = currentResult.rows[0];
  const nextAssessments = assessmentsStatus || current.assessments_status;
  const nextPdfStatement = pdfStatementStatus || current.pdf_statement_status;
  const nextHealthSafety = healthSafetyStatus || current.health_safety_status;
  const nextPracticalSkills = practicalSkillsStatus || current.practical_skills_status;
  const nextTopicButtons = topicButtonsStatus || current.topic_buttons_status;

  await query(
    `
      UPDATE admin_term_requirements
      SET assessments_status = $2,
          pdf_statement_status = $3,
          health_safety_status = $4,
          practical_skills_status = $5,
          topic_buttons_status = $6,
          assessments_updated_at = CASE
            WHEN $2 = 'complete' AND assessments_status <> 'complete' THEN NOW()
            ELSE assessments_updated_at
          END,
          pdf_statement_updated_at = CASE
            WHEN $3 = 'complete' AND pdf_statement_status <> 'complete' THEN NOW()
            ELSE pdf_statement_updated_at
          END,
          health_safety_updated_at = CASE
            WHEN $4 = 'complete' AND health_safety_status <> 'complete' THEN NOW()
            ELSE health_safety_updated_at
          END,
          practical_skills_updated_at = CASE
            WHEN $5 = 'complete' AND practical_skills_status <> 'complete' THEN NOW()
            ELSE practical_skills_updated_at
          END,
          topic_buttons_updated_at = CASE
            WHEN $6 = 'complete' AND topic_buttons_status <> 'complete' THEN NOW()
            ELSE topic_buttons_updated_at
          END,
          outline_status = CASE WHEN $2 = 'complete' THEN 'complete' ELSE 'pending' END,
          statement_status = CASE WHEN $3 = 'complete' THEN 'complete' ELSE 'pending' END,
          outline_updated_at = CASE
            WHEN $2 = 'complete' AND outline_status <> 'complete' THEN NOW()
            ELSE outline_updated_at
          END,
          statement_updated_at = CASE
            WHEN $3 = 'complete' AND statement_status <> 'complete' THEN NOW()
            ELSE statement_updated_at
          END,
          updated_by = COALESCE($7, updated_by),
          notes = COALESCE($8, notes)
      WHERE id = $1
    `,
    [
      current.id,
      nextAssessments,
      nextPdfStatement,
      nextHealthSafety,
      nextPracticalSkills,
      nextTopicButtons,
      payload.updatedBy || null,
      payload.notes || null
    ]
  );

  return {
    ok: true,
    courseCode: safeCourseCode,
    year: safeYear,
    term: safeTerm,
    assessmentsStatus: nextAssessments,
    pdfStatementStatus: nextPdfStatement,
    healthSafetyStatus: nextHealthSafety,
    practicalSkillsStatus: nextPracticalSkills,
    topicButtonsStatus: nextTopicButtons
  };
}

async function getCourseContentTargets() {
  const targetCodes = Array.from(COURSE_CONTENT_TARGETS);

  if (!targetCodes.length) {
    return [];
  }

  const result = await query(
    `
      SELECT c.course_code, c.course_name, c.subject_code
      FROM admin_courses c
      WHERE c.course_code = ANY($1::text[])
      ORDER BY c.subject_code, c.course_code
    `,
    [targetCodes]
  );

  if (result.rows.length) {
    return result.rows.map((row) => ({
      courseCode: row.course_code,
      courseName: row.course_name,
      subjectCode: row.subject_code
    }));
  }

  // Fallback to seeded course metadata if target rows are not present yet.
  return COURSE_SEED
    .filter((course) => COURSE_CONTENT_TARGETS.has(course.courseCode))
    .map((course) => ({
      courseCode: course.courseCode,
      courseName: course.courseName,
      subjectCode: course.subjectCode
    }));
}

module.exports = {
  getPool,
  initAdminSchema,
  getDashboard,
  getCourseStatus,
  updateCourseRequirement,
  getCourseContentTargets,
  getCourseContent,
  upsertCourseContent,
  saveCourseStatementPdf,
  getCourseStatementPdf
};
