module.exports = function createDtechApp(integration) {
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const mammoth = require("mammoth");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const { createLegacyLessonReader } = require("../../dtechLegacyLessons");
const { PASSWORD_PROBLEMS_ID, APPS_WORDSEARCH_ID, withShortLoginKit, withLoginAppsActivity, withLearningSitesActivity, withPasswordProblemsActivity, withLoginIdentityActivity, getStudentAssessment, gradePasswordProblems, gradeLoginIdentity, gradeAppsWordsearch } = require("./practical-skills-assessment");
const { LEARNING_SITES_ID, getHuntProfile, gradeLearningSites, getCourseProgrammeFolder, needsCourseCheckIn } = require("./learning-sites-assessment");
const { SEARCH_RESEARCH_REPORT_FILE_NAME, resolveResearchReportTemplateId, getResearchReportProgrammeFolder, buildResearchReportReplacements, applyResearchReportReplacements, gradeResearchReport } = require("./research-report");
const { gradeLoginSites } = require("./practical-skills-assessment");
const { validateLoginSites, publicLoginSites, visibleLoginSites } = require("./login-sites-config");

const SEARCH_PENGUIN_MISSIONS_ID = "search-penguin-missions-v1";
const SEARCH_KEYWORD_CHALLENGE_ID = "search-keyword-challenge-v1";
const SEARCH_RESULTS_DETECTIVE_ID = "search-results-detective-v1";
const SEARCH_AND_FIND_ID = "search-and-find-v1";

function gradeSearchPenguinMissions(answers) {
  const normalized = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const acceptedAnswers = {
    "search-penguin-name": ["korora", "little blue penguin", "little penguin", "fairy penguin", "blue penguin"],
    "search-korora-food-search": ["korora food"],
    "search-tallest-mountain": ["aoraki mount cook"],
    "search-penguin-location": ["hokitika beach"],
    "search-penguin-safety": ["uncontrolled dogs"]
  };
  const results = Object.entries(acceptedAnswers).map(([id, accepted]) => {
    const response = normalized(answers[id]);
    const correct = Boolean(response) && accepted.includes(response);
    return { id, correct, explanation: correct ? "Answer saved." : "Search again, then update your answer." };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    assessmentId: SEARCH_PENGUIN_MISSIONS_ID,
    passed: score === results.length,
    score,
    total: results.length,
    answers,
    results
  };
}

function gradeSearchKeywordChallenge(answers, activityIndex) {
  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const acceptedAnswers = {
    "keyword-pounamu-treasure": ["where to find pounamu west coast nz"],
    "keyword-too-many-results": ["hokitika gorge swing bridge"],
    "keyword-glowworm-mystery": ["new zealand glowworm diet"],
    "keyword-fix-the-search": ["hokitika tomorrow"],
    "keyword-hokitika-founded": ["1864"]
  };
  const results = Object.entries(acceptedAnswers).map(([id, accepted]) => {
    const responseId = `${activityIndex}-${id}`;
    const response = normalize(answers[responseId] ?? answers[id]);
    const correct = Boolean(response) && accepted.includes(response);
    return { id: responseId, correct, explanation: correct ? "Answer saved." : "Search again, then update your answer." };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    assessmentId: SEARCH_KEYWORD_CHALLENGE_ID,
    passed: score === results.length,
    score,
    total: results.length,
    answers,
    results
  };
}

function gradeSearchAndFind(answers, activityIndex) {
  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const acceptedAnswers = {
    "search-find-giant-tree": ["kahikatea"],
    "search-find-gold-rush-town": ["ross"],
    "search-find-mountain-bird": ["roroa"],
    "search-find-pancake-rocks": ["limestone"],
    "search-find-glacier-mystery": ["ka roimata o hine hukatere", "roimata o hine hukatere"]
  };
  const results = Object.entries(acceptedAnswers).map(([id, accepted]) => {
    const responseId = `${activityIndex}-${id}`;
    const response = normalize(answers[responseId] ?? answers[id]);
    const correct = Boolean(response) && accepted.includes(response);
    return { id: responseId, correct, explanation: correct ? "Answer saved." : "Search again, then update your answer." };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    assessmentId: SEARCH_AND_FIND_ID,
    passed: score === results.length,
    score,
    total: results.length,
    answers,
    results
  };
}

function gradeSearchResultsDetective(answers, activityIndex) {
  const normalize = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const acceptedAnswers = {
    "search-result-clock-tower": ["hokitika clock tower history and dimensions"],
    "search-result-pool-hours": ["hokitika swimming pool opening hours and contact details"],
    "search-result-wrong-place": ["waimea gorge walking track nelson"],
    "search-result-glowworm-time": ["after dark"],
    "search-result-doc-track": ["hokitika river"]
  };
  const results = Object.entries(acceptedAnswers).map(([id, accepted]) => {
    const responseId = `${activityIndex}-${id}`;
    const response = normalize(answers[responseId] ?? answers[id]);
    const correct = Boolean(response) && accepted.includes(response);
    return { id: responseId, correct, explanation: correct ? "Answer saved." : "Search again, then update your answer." };
  });
  const score = results.filter((result) => result.correct).length;
  return {
    assessmentId: SEARCH_RESULTS_DETECTIVE_ID,
    passed: score === results.length,
    score,
    total: results.length,
    answers,
    results
  };
}

const { visibleActivityIndexes, allActivitiesComplete, buildKitCertificate, createKitCertificatePdf } = require("./practical-skills-certificate");

let OAuth2Client = null;
try {
  ({ OAuth2Client } = require("google-auth-library"));
} catch (_error) {
  OAuth2Client = null;
  console.warn("[startup] Optional dependency 'google-auth-library' is not available. Verified Google ID token auth is disabled until installed.");
}

let PDFParse = null;
try {
  ({ PDFParse } = require("pdf-parse"));
} catch (_error) {
  PDFParse = null;
  console.warn("[startup] Optional dependency 'pdf-parse' is not available. PDF extraction features will use fallback behavior.");
}

const app = express();
app.set("case sensitive routing", true);
const PORT = process.env.PORT || 3000;
const SERVER_STARTED_AT = new Date().toISOString();
const hasDatabase = Boolean(integration.databaseUrl);
const TRELLO_API_KEY = String(process.env.TRELLO_API_KEY || "").trim();
const AUTH_MODE = "strict";
const GOOGLE_ID_TOKEN_AUDIENCES = Array.from(
  new Set(
    [
      process.env.HUB_GOOGLE_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      ...(String(process.env.GOOGLE_ID_TOKEN_AUDIENCES || "")
        .split(",")
        .map((value) => String(value || "").trim())
        .filter(Boolean))
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )
);
const staffDirectoryApiUrl = String(process.env.STAFF_DIRECTORY_API_URL || "").trim();
const staffDirectoryApiKey = String(process.env.STAFF_DIRECTORY_API_KEY || "").trim();
const memoryActivities = new Map();
const memoryUnitPlans = new Map();
const memoryUserRoles = new Map();
const memoryStaffDirectory = new Map();
const memoryLessons = new Map();
const memorySuggestions = [];
let memorySuggestionId = 1;
const memoryPracticalEvents = [];
let memoryPracticalEventId = 1;
const memoryTrelloConnections = new Map();
const memoryAssessmentStandardCards = new Map();
const memoryStudentHaparaFolders = new Map();
const memoryStudentDriveSetup = new Map();
const memoryStudentLoginDriveSetup = new Map();
const memoryStudentKitDocuments = new Map();
const researchReportLocks = new Map();
const memoryTemplateLibraryEntries = new Map();
const memoryStudentToolsTechniques = new Map();
const memoryToolsTechniquesKeywords = new Map();
const memoryDecompositionCoverage = new Map();
const memoryTriallingComponents = new Map();
const memoryDigiMedEfficientTools = new Map();
const memoryExternalAssessmentAllocations = new Map();
const memoryExternalExamIntentions = new Map();
const memoryStudentTrackerComments = new Map();
const memoryEmailLogs = [];
const memoryPracticalSkillsProgress = new Map();
const memoryPracticalSkillsKitContent = new Map();
const PRACTICAL_SKILLS_LIBRARY_FILE = path.join(__dirname, "practical-skills", "library.json");

// Server-authoritative catalog so scoring/badges can't be spoofed from the client.
// Keep ids/points/timeframeHours in sync with practical-skills/checklist.js kitDefinitions until the kit catalog is server-driven.
const PRACTICAL_SKILLS_KIT_DEFINITIONS = [
  { id: "kit-login", points: 100, timeframeHours: 24 },
  { id: "kit-google-search", points: 100, timeframeHours: 24 },
  { id: "kit-minecraft", points: 100, timeframeHours: 24 }
];

const PRACTICAL_SKILLS_TIER_THRESHOLDS = { Bronze: 1, Silver: 150, Gold: 250 };

const PRACTICAL_SKILLS_BADGE_DEFINITIONS = [
  { id: "first-kit", title: "First Steps", description: "Complete your first kit.", icon: "\ud83e\udd49", rule: { type: "completed_count", threshold: 1 } },
  { id: "two-kits", title: "Building Momentum", description: "Complete 2 kits.", icon: "\ud83e\udd48", rule: { type: "completed_count", threshold: 2 } },
  { id: "all-kits", title: "Full House", description: "Complete every kit in the library.", icon: "\ud83c\udfc6", rule: { type: "all_complete" } },
  { id: "on-time-1", title: "On Track", description: "Finish a kit within its target window.", icon: "\u23f1\ufe0f", rule: { type: "on_time_count", threshold: 1 } },
  { id: "on-time-all", title: "Speed Runner", description: "Finish every completed kit within its target window.", icon: "\ud83d\ude80", rule: { type: "all_on_time" } },
  { id: "tier-silver", title: "Silver Tier", description: "Reach Silver tier total points.", icon: "\ud83e\udd48", rule: { type: "tier", value: "Silver" } },
  { id: "tier-gold", title: "Gold Tier", description: "Reach Gold tier total points.", icon: "\ud83e\udd47", rule: { type: "tier", value: "Gold" } }
];

// Kits created in the Kit Content Builder. They open, save progress and issue certificates like built-in kits,
// but are not added to PRACTICAL_SKILLS_KIT_DEFINITIONS, so existing points and "every kit" badges are unchanged.
const customPracticalSkillsKits = new Map();
let customPracticalSkillsKitsLoad = null;

function getPracticalSkillsKitDefinition(kitId) {
  const safeKitId = String(kitId || "").trim();
  return PRACTICAL_SKILLS_KIT_DEFINITIONS.find((kit) => kit.id === safeKitId)
    || customPracticalSkillsKits.get(safeKitId)
    || null;
}

function registerCustomPracticalSkillsKit(kitId) {
  const safeKitId = String(kitId || "").trim();
  if (!/^kit-[a-z0-9-]{1,60}$/.test(safeKitId) || PRACTICAL_SKILLS_KIT_DEFINITIONS.some((kit) => kit.id === safeKitId)) return null;
  const definition = { id: safeKitId, points: 100, timeframeHours: 24, custom: true };
  customPracticalSkillsKits.set(safeKitId, definition);
  return definition;
}

function ensureCustomPracticalSkillsKitsLoaded() {
  if (!hasDatabase) return Promise.resolve();
  if (!customPracticalSkillsKitsLoad) {
    customPracticalSkillsKitsLoad = (async () => {
      await ensurePracticalSkillsKitContentSchema();
      const result = await pool.query(`SELECT kit_id FROM practical_skills_kit_content WHERE content ->> 'customKit' = 'true'`);
      for (const row of result.rows || []) registerCustomPracticalSkillsKit(row.kit_id);
    })().catch((error) => {
      customPracticalSkillsKitsLoad = null;
      throw error;
    });
  }
  return customPracticalSkillsKitsLoad;
}

function slugifyPracticalSkillsKitName(name) {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/g, "") || "new";
}

function createCustomPracticalSkillsKitId(name) {
  const base = `kit-${slugifyPracticalSkillsKitName(name).replace(/^kit-/, "")}`;
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (!getPracticalSkillsKitDefinition(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function getPracticalSkillsTier(totalPoints) {
  if (totalPoints >= PRACTICAL_SKILLS_TIER_THRESHOLDS.Gold) return "Gold";
  if (totalPoints >= PRACTICAL_SKILLS_TIER_THRESHOLDS.Silver) return "Silver";
  if (totalPoints >= PRACTICAL_SKILLS_TIER_THRESHOLDS.Bronze) return "Bronze";
  return "Starter";
}

// Pure function: takes saved progress rows, returns per-kit scoring plus the badges earned from it.
function computePracticalSkillsSnapshot(progressRows) {
  const rowsByKitId = new Map(
    (Array.isArray(progressRows) ? progressRows : []).map((row) => [String(row?.kit_id || "").trim(), row])
  );

  let totalPoints = 0;
  let completedCount = 0;
  let onTimeCompletedCount = 0;

  const kits = PRACTICAL_SKILLS_KIT_DEFINITIONS.map((kit) => {
    const row = rowsByKitId.get(kit.id);
    const isComplete = Boolean(row?.completed);
    const startedAtMs = row?.started_at ? new Date(row.started_at).getTime() : Date.now();
    const completedAtMs = row?.completed_at ? new Date(row.completed_at).getTime() : 0;
    const elapsedHours = (isComplete && completedAtMs ? completedAtMs - startedAtMs : Date.now() - startedAtMs) / 36e5;
    const onTime = isComplete && elapsedHours <= kit.timeframeHours;
    const score = isComplete ? kit.points + (onTime ? 25 : 0) : 0;

    totalPoints += score;
    if (isComplete) {
      completedCount += 1;
      if (onTime) onTimeCompletedCount += 1;
    }

    return {
      id: kit.id,
      isComplete,
      onTime,
      score,
      startedAt: row?.started_at || null,
      completedAt: row?.completed_at || null
    };
  });

  const totalKits = PRACTICAL_SKILLS_KIT_DEFINITIONS.length;
  const tier = getPracticalSkillsTier(totalPoints);
  const allComplete = totalKits > 0 && completedCount === totalKits;
  const allOnTime = completedCount > 0 && onTimeCompletedCount === completedCount;

  const badges = PRACTICAL_SKILLS_BADGE_DEFINITIONS
    .filter((badge) => {
      const rule = badge.rule || {};
      if (rule.type === "completed_count") return completedCount >= Number(rule.threshold || 0);
      if (rule.type === "all_complete") return allComplete;
      if (rule.type === "on_time_count") return onTimeCompletedCount >= Number(rule.threshold || 0);
      if (rule.type === "all_on_time") return allOnTime;
      if (rule.type === "tier") return totalPoints >= (PRACTICAL_SKILLS_TIER_THRESHOLDS[rule.value] || Infinity);
      return false;
    })
    .map((badge) => ({ id: badge.id, title: badge.title, description: badge.description, icon: badge.icon }));

  return { kits, totalPoints, completedCount, totalKits, tier, badges };
}

async function ensurePracticalSkillsProgressRow(studentEmail, kitId) {
  const email = normalizeEmail(studentEmail);
  const safeKitId = String(kitId || "").trim();
  if (!email || !safeKitId) return null;

  if (!hasDatabase) {
    const key = `${email}:${safeKitId}`;
    if (!memoryPracticalSkillsProgress.has(key)) {
      const nowIso = new Date().toISOString();
      memoryPracticalSkillsProgress.set(key, {
        student_email: email,
        kit_id: safeKitId,
        started_at: nowIso,
        completed: false,
        completed_at: null,
        updated_at: nowIso
      });
    }
    return memoryPracticalSkillsProgress.get(key);
  }

  await ensurePracticalSkillsProgressSchema();
  const inserted = await pool.query(
    `INSERT INTO practical_skills_progress (student_email, kit_id) VALUES ($1, $2)
     ON CONFLICT (student_email, kit_id) DO NOTHING RETURNING *`,
    [email, safeKitId]
  );
  if (inserted.rows?.[0]) return inserted.rows[0];

  const existing = await pool.query(
    `SELECT * FROM practical_skills_progress WHERE student_email = $1 AND kit_id = $2 LIMIT 1`,
    [email, safeKitId]
  );
  return existing.rows?.[0] || null;
}

async function getAllPracticalSkillsProgressRows(studentEmail) {
  const email = normalizeEmail(studentEmail);
  if (!email) return [];

  if (!hasDatabase) {
    return PRACTICAL_SKILLS_KIT_DEFINITIONS
      .map((kit) => memoryPracticalSkillsProgress.get(`${email}:${kit.id}`))
      .filter(Boolean);
  }

  await ensurePracticalSkillsProgressSchema();
  const result = await pool.query(`SELECT * FROM practical_skills_progress WHERE student_email = $1`, [email]);
  return result.rows || [];
}

async function setPracticalSkillsKitCompletion(studentEmail, kitId, completed) {
  const email = normalizeEmail(studentEmail);
  const safeKitId = String(kitId || "").trim();
  if (!email || !safeKitId) return null;

  await ensurePracticalSkillsProgressRow(email, safeKitId);
  const nowIso = new Date().toISOString();

  if (!hasDatabase) {
    const key = `${email}:${safeKitId}`;
    const existing = memoryPracticalSkillsProgress.get(key) || {};
    const next = {
      ...existing,
      student_email: email,
      kit_id: safeKitId,
      completed: Boolean(completed),
      completed_at: completed ? existing.completed_at || nowIso : null,
      completed_activities: completed ? existing.completed_activities || {} : {},
      certificate_emailed_at: completed ? existing.certificate_emailed_at || null : null,
      started_at: completed ? existing.started_at : nowIso,
      updated_at: nowIso
    };
    memoryPracticalSkillsProgress.set(key, next);
    return next;
  }

  await ensurePracticalSkillsProgressSchema();
  const result = completed
    ? await pool.query(
        `UPDATE practical_skills_progress SET completed = TRUE, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE student_email = $1 AND kit_id = $2 RETURNING *`,
        [email, safeKitId]
      )
    : await pool.query(
        `UPDATE practical_skills_progress SET completed = FALSE, completed_at = NULL, completed_activities = '{}'::jsonb, certificate_emailed_at = NULL, started_at = NOW(), updated_at = NOW()
         WHERE student_email = $1 AND kit_id = $2 RETURNING *`,
        [email, safeKitId]
      );
  return result.rows?.[0] || null;
}

const DEFAULT_TEMPLATE_LIBRARY_ENTRIES = [
  {
    id: "digital-outcome-description",
    title: "Digital Outcome Description",
    standardCodes: ["91897", "91907"],
    criteriaText: "Describe what the digital outcome is, who it is for, and what it must do.",
    summary: "Uses a two-column prompt-and-response slide structure for clear assessment evidence.",
    imageUrl: "https://drive.google.com/thumbnail?id=1brOY70u9aJdsoiEtxVepr82vRhiv9VzpMm8TUv3lcTo&sz=w1000",
    templateUrl: "https://docs.google.com/presentation/d/1brOY70u9aJdsoiEtxVepr82vRhiv9VzpMm8TUv3lcTo/edit?usp=sharing",
    status: "live",
    sortOrder: 1,
    sourceFolderId: ""
  },
  {
    id: "tools-and-techniques",
    title: "Tools & Techniques",
    standardCodes: ["91897", "91907"],
    criteriaText: "List the tools you use and describe the techniques you implement with each one.",
    summary: "Two-column slide for listing tools and the techniques applied during development.",
    imageUrl: "https://drive.google.com/thumbnail?id=1F3F10KG2JCFQ-x41q6TEK15YjoxblmjRCGUZ6d254wg&sz=w1000",
    templateUrl: "https://docs.google.com/presentation/d/1F3F10KG2JCFQ-x41q6TEK15YjoxblmjRCGUZ6d254wg/edit?usp=sharing",
    status: "live",
    sortOrder: 3,
    sourceFolderId: ""
  },
  {
    id: "speaker-notes-criteria-mapping",
    title: "Speaker Notes Criteria Mapping",
    standardCodes: ["91897"],
    criteriaText: "Map each presented slide to assessment criteria in Speaker Notes.",
    summary: "Template slot reserved. Add the final template URL when this slide is complete.",
    imageUrl: "https://placehold.co/540x760/d8e6d9/1f3a56?text=Coming+Soon+Template",
    templateUrl: "",
    status: "coming-soon",
    sortOrder: 2,
    sourceFolderId: ""
  }
];

const pool = new Pool({
  connectionString: integration.databaseUrl,
  ssl: integration.databaseSsl === false ? false : { rejectUnauthorized: false }
});
const legacyLessons = createLegacyLessonReader(pool);
let lessonTable = "lessons";

const googleAuthClient = OAuth2Client ? new OAuth2Client() : null;

const STAFF_TABLE_CANDIDATES = ["staff_upload", "upload_staff"];
const STUDENT_TABLE_CANDIDATES = ["student_details_upload", "student_upload", "student_timetable", "upload_student"];
const TEACHER_TIMETABLE_TABLE_CANDIDATES = ["kamar_timetable", "upload_timetable", "timetable", "teacher_timetable"];
const SCHOOL_EMAIL_DOMAIN = "westlandhigh.school.nz";
// ID of the "Client Projects" Assessment Task. Students assigned to any Project are
// automatically allocated to this task too. Override via CLIENT_PROJECTS_TASK_ID env var.
const CLIENT_PROJECTS_TASK_ID = process.env.CLIENT_PROJECTS_TASK_ID || "49";
const DTECH_HUB_NAME = "DTECH-HUB";
const SEWING_ROOM_HUB_NAME = "SEWING-ROOM-HUB";
const NZQA_BASE_URL = "https://www.nzqa.govt.nz";
const LOCAL_STANDARDS_DIR = path.join(__dirname, "TeacherFiles", "Standards");
const NZQA_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const NZQA_LINKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NZQA_DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const nzqaStandardsCache = new Map();
const nzqaStandardLinksCache = new Map();
const nzqaStandardDetailsCache = new Map();
const NZQA_STANDARDS_FALLBACK = [
  // Digital Technologies (aligned with NZQA level pages)
  { standard_number: "92004", standard_name: "Create a computer program", version: "2024", level: 1, credits: 5, stream: "digital", assessment_type: "Internal" },
  { standard_number: "92005", standard_name: "Develop a digital technologies outcome", version: "2024", level: 1, credits: 5, stream: "digital", assessment_type: "Internal" },
  { standard_number: "92006", standard_name: "Demonstrate understanding of usability in human-computer interfaces", version: "2024", level: 1, credits: 5, stream: "digital", assessment_type: "External" },
  { standard_number: "92007", standard_name: "Design a digital technologies outcome", version: "2025", level: 1, credits: 5, stream: "digital", assessment_type: "External" },
  { standard_number: "91890", standard_name: "Conduct an inquiry to propose a digital technologies outcome", version: "2019", level: 2, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91891", standard_name: "Apply conventions to develop a design for a digital technologies outcome", version: "2019", level: 2, credits: 3, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91892", standard_name: "Use advanced techniques to develop a database", version: "2019", level: 2, credits: 4, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91893", standard_name: "Use advanced techniques to develop a digital media outcome", version: "2019", level: 2, credits: 4, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91894", standard_name: "Use advanced techniques to develop an electronics outcome", version: "2019", level: 2, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91895", standard_name: "Use advanced techniques to develop a network", version: "2019", level: 2, credits: 4, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91896", standard_name: "Use advanced programming techniques to develop a computer program", version: "2024", level: 2, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91897", standard_name: "Use advanced processes to develop a digital technologies outcome", version: "2019", level: 2, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91898", standard_name: "Demonstrate understanding of a computer science concept", version: "2019", level: 2, credits: 3, stream: "digital", assessment_type: "External" },
  { standard_number: "91899", standard_name: "Present a summary of developing a digital outcome", version: "2019", level: 2, credits: 3, stream: "digital", assessment_type: "External" },
  { standard_number: "91900", standard_name: "Conduct a critical inquiry to propose a digital technologies outcome", version: "2019", level: 3, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91901", standard_name: "Apply user experience methodologies to develop a design for a digital technologies outcome", version: "2019", level: 3, credits: 3, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91902", standard_name: "Use complex techniques to develop a database", version: "2024", level: 3, credits: 4, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91903", standard_name: "Use complex techniques to develop a digital media outcome", version: "2019", level: 3, credits: 4, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91904", standard_name: "Use complex techniques to develop an electronics outcome", version: "2019", level: 3, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91905", standard_name: "Use complex techniques to develop a network", version: "2019", level: 3, credits: 4, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91906", standard_name: "Use complex programming techniques to develop a computer program", version: "2024", level: 3, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91907", standard_name: "Use complex processes to develop a digital technologies outcome", version: "2024", level: 3, credits: 6, stream: "digital", assessment_type: "Internal" },
  { standard_number: "91908", standard_name: "Analyse an area of computer science", version: "2019", level: 3, credits: 3, stream: "digital", assessment_type: "External" },
  { standard_number: "91909", standard_name: "Present a reflective analysis of developing a digital outcome", version: "2019", level: 3, credits: 3, stream: "digital", assessment_type: "External" },

  // Generic Computing
  { standard_number: "91896", standard_name: "Use advanced programming techniques to develop a computer program", version: "3", level: 1, credits: 4, stream: "computing" },
  { standard_number: "91897", standard_name: "Demonstrate understanding of how data is represented, accessed, and stored", version: "3", level: 1, credits: 4, stream: "computing" },
  { standard_number: "91898", standard_name: "Demonstrate understanding of a computer science concept", version: "3", level: 1, credits: 3, stream: "computing" },
  { standard_number: "91899", standard_name: "Present a summary of developing a computer program", version: "3", level: 1, credits: 3, stream: "computing" },
  { standard_number: "91906", standard_name: "Use advanced programming techniques to develop a complex computer program", version: "2", level: 2, credits: 4, stream: "computing" },
  { standard_number: "91907", standard_name: "Demonstrate understanding of advanced concepts from computer science", version: "2", level: 2, credits: 3, stream: "computing" },
  { standard_number: "91912", standard_name: "Use complex programming techniques to develop a complex computer program", version: "1", level: 3, credits: 6, stream: "computing" },
  { standard_number: "91913", standard_name: "Demonstrate understanding of complex concepts of computer science", version: "1", level: 3, credits: 3, stream: "computing" }
];
const DEFAULT_ASSESSMENT_STANDARD_CARDS = [
  {
    standardNumber: "91897",
    standardName: "Use advanced processes to develop a digital technologies outcome",
    level: "Level 2",
    version: 2019,
    credits: 6,
    achievedText: "Use advanced processes to develop a digital technologies outcome.",
    meritText: "Use advanced processes to develop a refined digital technologies outcome.",
    excellenceText: "Use advanced processes to develop a quality digital technologies outcome.",
    achievedChecklist: [
      "Use appropriate project management tools and techniques to plan the development of a digital technologies outcome.",
      "Decompose the outcome into smaller components.",
      "List the key features or requirements the outcome must include.",
      "Trial the components of the digital technologies outcome.",
      "Test that the digital technologies outcome functions as intended.",
      "Explain relevant implications."
    ],
    meritChecklist: [
      "Effectively use project management and version control tools and techniques to manage development of a digital technologies outcome.",
      "Trial multiple components and/or techniques and select those that are most suitable.",
      "Use information from testing and trialling to improve the functionality of the digital technologies outcome.",
      "Address relevant implications."
    ],
    excellenceChecklist: [
      "Discuss how planning, testing, and trialling information assisted the development of a high-quality outcome."
    ]
  },
  {
    standardNumber: "91907",
    standardName: "Use complex processes to develop a digital technologies outcome",
    level: "Level 3",
    version: 2024,
    credits: 6,
    achievedText: "Use complex processes to develop a digital technologies outcome.",
    meritText: "Use complex processes to develop a refined digital technologies outcome.",
    excellenceText: "Use complex processes to develop a quality digital technologies outcome.",
    achievedChecklist: [
      "Use recognised and appropriate project management techniques to plan the development of a digital technologies outcome.",
      "Decompose the digital technologies outcome into smaller components.",
      "Trial components of the outcome.",
      "Test that the digital technologies outcome functions as intended.",
      "Address relevant implications."
    ],
    meritChecklist: [
      "Effectively use project management techniques to manage development, feedback and/or collaborative processes.",
      "Effectively trial multiple components and/or techniques.",
      "Effectively use information from testing and trialling to improve the functionality of the digital technologies outcome."
    ],
    excellenceChecklist: [
      "Synthesise information gained from the planning, testing and trialling of components.",
      "Discuss how this information led to the development of a high-quality digital technologies outcome."
    ]
  },
  {
    standardNumber: "91893",
    standardName: "Use advanced techniques to develop a digital media outcome",
    level: "Level 2",
    version: 2019,
    credits: 4,
    achievedText: "Use advanced techniques to develop a digital media outcome.",
    meritText: "Use advanced techniques to develop a refined digital media outcome.",
    excellenceText: "Use advanced techniques to develop a quality digital media outcome.",
    achievedChecklist: [
      "Use appropriate tools and techniques for the purpose and end users.",
      "Apply appropriate data integrity and testing procedures.",
      "Use relevant conventions for the media type.",
      "Explain relevant implications."
    ],
    meritChecklist: [
      "Use information from testing procedures to improve the quality of the outcome.",
      "Apply relevant conventions to improve the quality of the outcome.",
      "Address relevant implications."
    ],
    excellenceChecklist: [
      "Iteratively improve the outcome throughout the design, development and testing process.",
      "Use efficient tools and techniques in the outcome's production."
    ]
  },
  {
    standardNumber: "91903",
    standardName: "Use complex techniques to develop a digital media outcome",
    level: "Level 3",
    version: 2019,
    credits: 4,
    achievedText: "Use complex techniques to develop a digital media outcome.",
    meritText: "Use complex techniques to develop a refined digital media outcome.",
    excellenceText: "Use complex techniques to develop a quality digital media outcome.",
    achievedChecklist: [
      "Apply appropriate tools and techniques to meet the purpose and end-user requirements.",
      "Apply appropriate data integrity and testing procedures.",
      "Apply user experience principles relevant to the purpose of the outcome.",
      "Address relevant implications."
    ],
    meritChecklist: [
      "Use information from testing procedures to improve the quality of the digital media outcome.",
      "Apply user experience principles to improve the quality of the digital media outcome."
    ],
    excellenceChecklist: [
      "Iteratively improve the outcome throughout the design, development and testing process.",
      "Use efficient tools and techniques in the outcome's production."
    ]
  },
  {
    standardNumber: "92006",
    standardName: "Demonstrate understanding of usability in human-computer interfaces",
    level: "Level 1",
    version: 2024,
    credits: 5,
    achievedText: "Demonstrate understanding of usability in human-computer interfaces.",
    meritText: "Demonstrate in-depth understanding of usability in human-computer interfaces.",
    excellenceText: "Demonstrate comprehensive understanding of usability in human-computer interfaces.",
    achievedChecklist: [
      "Describe usability principles relevant to human-computer interfaces (e.g. accessibility, navigation, visual clarity).",
      "Identify how usability principles are applied or violated in given interfaces.",
      "Explain how usability impacts user experience."
    ],
    meritChecklist: [
      "Explain in detail how usability principles improve human-computer interface design.",
      "Suggest specific improvements to interface designs based on usability principles."
    ],
    excellenceChecklist: [
      "Evaluate interface designs against usability principles and user needs.",
      "Justify design improvements with clear reasoning referencing usability heuristics."
    ]
  },
  {
    standardNumber: "92007",
    standardName: "Design a digital technologies outcome",
    level: "Level 1",
    version: 2025,
    credits: 5,
    achievedText: "Design a digital technologies outcome.",
    meritText: "Develop an in-depth design for a digital technologies outcome.",
    excellenceText: "Develop a refined design for a digital technologies outcome.",
    achievedChecklist: [
      "Describe the purpose and end-user requirements of the proposed digital outcome.",
      "Generate design ideas and select a suitable design.",
      "Describe key features and components of the design.",
      "Explain relevant implications for the design."
    ],
    meritChecklist: [
      "Explain in detail how user feedback, trialling, and testing informed design refinements.",
      "Explain how relevant implications influenced design choices."
    ],
    excellenceChecklist: [
      "Justify design choices through synthesis of user needs, trialling, and testing.",
      "Evaluate how the final design addresses relevant implications and user requirements."
    ]
  },
  {
    standardNumber: "91898",
    standardName: "Demonstrate understanding of a computer science concept",
    level: "Level 2",
    version: 2019,
    credits: 3,
    achievedText: "Demonstrate understanding of a computer science concept.",
    meritText: "Demonstrate in-depth understanding of a computer science concept.",
    excellenceText: "Demonstrate comprehensive understanding of a computer science concept.",
    achievedChecklist: [
      "Describe key aspects of a computer science concept.",
      "Explain how the computer science concept is implemented in software, algorithms, or hardware.",
      "Provide examples showing how the concept is applied."
    ],
    meritChecklist: [
      "Explain in detail how a computer science concept operates and why it is used.",
      "Provide detailed examples showing clear understanding of technical mechanisms and trade-offs."
    ],
    excellenceChecklist: [
      "Evaluate key algorithms, mechanisms, or trade-offs associated with the computer science concept.",
      "Discuss implications, limitations, or future developments related to the concept."
    ]
  },
  {
    standardNumber: "91899",
    standardName: "Present a summary of developing a digital outcome",
    level: "Level 2",
    version: 2019,
    credits: 3,
    achievedText: "Present a summary of developing a digital outcome.",
    meritText: "Present an in-depth summary of developing a digital outcome.",
    excellenceText: "Present a comprehensive summary of developing a digital outcome.",
    achievedChecklist: [
      "Describe the digital outcome developed and its intended purpose and end users.",
      "Describe key decisions made during design, development, and testing.",
      "Explain how testing and trialling influenced the outcome.",
      "Explain how relevant implications were addressed during development."
    ],
    meritChecklist: [
      "Explain in detail how key decisions, testing, and feedback improved the digital outcome.",
      "Explain how relevant implications influenced design and development choices."
    ],
    excellenceChecklist: [
      "Discuss how synthesis of planning, testing, trialling, and feedback led to a high-quality outcome.",
      "Evaluate the overall success of the outcome against user requirements and relevant implications."
    ]
  },
  {
    standardNumber: "91908",
    standardName: "Analyse an area of computer science",
    level: "Level 3",
    version: 2019,
    credits: 3,
    achievedText: "Analyse an area of computer science.",
    meritText: "Analyse, in depth, an area of computer science.",
    excellenceText: "Critically analyse an area of computer science.",
    achievedChecklist: [
      "Explain key aspects of the computer science area.",
      "Explain relevant algorithms or mechanisms behind the area.",
      "Explain how the area is used, implemented, or occurs, giving examples.",
      "Explain key problems or issues related to the area and how these may be addressed."
    ],
    meritChecklist: [
      "Provide a detailed explanation of how technical capabilities and limitations relate to humans, giving examples.",
      "Compare and contrast different perspectives on the area."
    ],
    excellenceChecklist: [
      "Draw insightful conclusions about the computer science area.",
      "Evaluate innovative connections, less obvious implications, or future developments."
    ]
  },
  {
    standardNumber: "91909",
    standardName: "Present a reflective analysis of developing a digital outcome",
    level: "Level 3",
    version: 2019,
    credits: 3,
    achievedText: "Present a reflective analysis of developing a digital outcome.",
    meritText: "Present an in-depth reflective analysis of developing a digital outcome.",
    excellenceText: "Present a critical reflective analysis of developing a digital outcome.",
    achievedChecklist: [
      "Describe the digital outcome, its purpose, and end-user requirements.",
      "Explain key design and development decisions made throughout the project.",
      "Explain how testing, trialling, and feedback informed development.",
      "Explain how relevant implications were addressed."
    ],
    meritChecklist: [
      "Analyze in detail how key decisions, testing, trialling, and feedback influenced outcome quality.",
      "Analyze how relevant implications shaped the final digital outcome."
    ],
    excellenceChecklist: [
      "Critically evaluate how synthesis of planning, testing, trialling, and feedback contributed to a high-quality outcome.",
      "Reflect insightfully on trade-offs, limitations, and future developments for the outcome."
    ]
  },
  {
    standardNumber: "92004",
    standardName: "Create a computer program",
    level: "Level 1",
    version: 2024,
    credits: 5,
    achievedText: "Create a computer program.",
    meritText: "Create an informed computer program.",
    excellenceText: "Create a refined computer program.",
    achievedChecklist: [
      "Write a program that uses variables, input, output, sequence, selection, and iteration.",
      "Use correct syntax so the program runs without errors.",
      "Set the program out clearly using meaningful names and comments.",
      "Test the program to show that it works for expected cases."
    ],
    meritChecklist: [
      "Follow the conventions of the programming language so the program is readable and well structured.",
      "Test and debug the program using a range of relevant test cases, including boundary cases."
    ],
    excellenceChecklist: [
      "Make the program flexible and robust so it handles invalid or unexpected input without failing.",
      "Explain how testing and debugging decisions improved the quality of the program."
    ]
  },
  {
    standardNumber: "91896",
    standardName: "Use advanced programming techniques to develop a computer program",
    level: "Level 2",
    version: 2024,
    credits: 6,
    achievedText: "Use advanced programming techniques to develop a computer program.",
    meritText: "Use advanced programming techniques to develop an informed computer program.",
    excellenceText: "Use advanced programming techniques to develop a refined computer program.",
    achievedChecklist: [
      "Write a program that uses advanced techniques such as collections, sub-programs with parameters and return values, and file or stream input and output.",
      "Set the program out clearly using meaningful names, comments, and correct syntax.",
      "Test the program to show that it works for expected cases.",
      "Explain relevant implications for the program."
    ],
    meritChecklist: [
      "Follow the conventions of the programming language so the program is readable and logically structured.",
      "Test and debug the program in an organised way, using a range of relevant test cases including boundary cases.",
      "Address relevant implications in the program."
    ],
    excellenceChecklist: [
      "Make the program flexible and robust so it handles invalid and unexpected input without failing.",
      "Justify the structure and techniques chosen, explaining how testing and debugging produced a quality program."
    ]
  },
  {
    standardNumber: "91906",
    standardName: "Use complex programming techniques to develop a computer program",
    level: "Level 3",
    version: 2024,
    credits: 6,
    achievedText: "Use complex programming techniques to develop a computer program.",
    meritText: "Use complex programming techniques to develop an informed computer program.",
    excellenceText: "Use complex programming techniques to develop a refined computer program.",
    achievedChecklist: [
      "Write a program that uses complex techniques such as classes and objects, inheritance, recursion, complex data structures, or a graphical user interface.",
      "Set the program out clearly using meaningful names, comments, and correct syntax.",
      "Test the program to show that it works for expected cases.",
      "Explain relevant implications for the program."
    ],
    meritChecklist: [
      "Follow the conventions of the programming language so the program is readable, modular, and logically structured.",
      "Test and debug the program comprehensively, using relevant test cases including boundary cases.",
      "Address relevant implications in the program."
    ],
    excellenceChecklist: [
      "Make the program flexible, robust, and efficient so it handles invalid and unexpected input without failing.",
      "Evaluate the techniques, structure, and testing decisions that produced a quality program."
    ]
  }
];
const DEFAULT_CLASS_DATA_AGING_DAYS = 3;
const DEFAULT_CLASS_DATA_STALE_DAYS = 7;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildNzqaLinks(standardNumber) {
  const number = String(standardNumber || "").trim();
  if (!number) {
    return { details_url: "", pdf_url: "", docx_url: "" };
  }

  const details_url = `${NZQA_BASE_URL}/ncea/assessment/search.do?query=${encodeURIComponent(number)}&view=all`;
  return {
    details_url,
    pdf_url: "",
    docx_url: ""
  };
}

function toStaticUrlPath(relativePath) {
  return `/${String(relativePath || "").replace(/\\/g, "/")}`;
}

function findLocalStandardDocuments(standardNumber) {
  const number = String(standardNumber || "").trim();
  if (!number) {
    return { pdf_url: "", docx_url: "" };
  }

  try {
    if (!fs.existsSync(LOCAL_STANDARDS_DIR)) {
      return { pdf_url: "", docx_url: "" };
    }

    const entries = fs.readdirSync(LOCAL_STANDARDS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => String(entry.name || "").trim())
      .filter(Boolean);

    const matching = entries.filter((name) =>
      String(name || "").toLowerCase().includes(number.toLowerCase())
    );

    const pick = (regex) => matching.find((name) => regex.test(name)) || "";
    const pdfName = pick(/\.pdf$/i);
    const docName = pick(/\.(?:doc|docx)$/i);

    return {
      pdf_url: pdfName ? toStaticUrlPath(path.join("TeacherFiles", "Standards", pdfName)) : "",
      docx_url: docName ? toStaticUrlPath(path.join("TeacherFiles", "Standards", docName)) : ""
    };
  } catch (_error) {
    return { pdf_url: "", docx_url: "" };
  }
}

function readLocalStandardDocumentBuffer(urlPath) {
  const url = String(urlPath || "").trim();
  if (!url || !url.startsWith("/TeacherFiles/Standards/")) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(url);
    const absolutePath = path.join(__dirname, decoded.replace(/^\//, ""));
    if (!absolutePath.startsWith(LOCAL_STANDARDS_DIR)) {
      return null;
    }
    if (!fs.existsSync(absolutePath)) {
      return null;
    }
    return fs.readFileSync(absolutePath);
  } catch (_error) {
    return null;
  }
}

function stripNzqaHtmlToText(html) {
  const source = String(html || "");
  const withoutScripts = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function normalizeCriteriaSectionText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[\s\-:;,.]+|[\s\-:;,.]+$/g, "")
    .trim();
}

function extractAssessmentCriteriaFromText(text) {
  const source = String(text || "").replace(/\r/g, "");
  if (!source) {
    return {
      achieved_text: "",
      merit_text: "",
      excellence_text: ""
    };
  }

  // First pass: NZQA achievement criteria table layout.
  const tableBlockMatch = source.match(/Achievement\s+Criteria([\s\S]{0,2200}?)(?:Explanatory\s+Notes|\n\s*Page\s+\d+\s+of\s+\d+|$)/i);
  if (tableBlockMatch) {
    const tableBlock = String(tableBlockMatch[1] || "");
    const bulletSegments = tableBlock
      .split(/(?:^|\n)\s*[\u2022\u25CF\u2023\u00B7]\s*/)
      .map((segment) => normalizeCriteriaSectionText(segment))
      .filter(Boolean);

    if (bulletSegments.length >= 3) {
      return {
        achieved_text: bulletSegments[0],
        merit_text: bulletSegments[1],
        excellence_text: bulletSegments[2]
      };
    }
  }

  const headingPatterns = [
    { key: "achieved", regex: /(^|\n)\s*(Achieved|Achievement)\s*(Criteria|Requirements|Evidence)?\s*[:\-]?/ig },
    { key: "merit", regex: /(^|\n)\s*Merit\s*(Criteria|Requirements|Evidence)?\s*[:\-]?/ig },
    { key: "excellence", regex: /(^|\n)\s*Excellence\s*(Criteria|Requirements|Evidence)?\s*[:\-]?/ig }
  ];

  const hits = [];
  headingPatterns.forEach((pattern) => {
    let match = pattern.regex.exec(source);
    while (match) {
      hits.push({
        key: pattern.key,
        index: match.index,
        length: String(match[0] || "").length
      });
      match = pattern.regex.exec(source);
    }
  });

  if (!hits.length) {
    return {
      achieved_text: "",
      merit_text: "",
      excellence_text: ""
    };
  }

  hits.sort((a, b) => a.index - b.index);

  const sections = {
    achieved: "",
    merit: "",
    excellence: ""
  };

  for (let index = 0; index < hits.length; index += 1) {
    const current = hits[index];
    const next = hits[index + 1];
    const start = current.index + current.length;
    const end = next ? next.index : source.length;
    const segment = normalizeCriteriaSectionText(source.slice(start, end));
    if (segment && !sections[current.key]) {
      sections[current.key] = segment;
    }
  }

  return {
    achieved_text: sections.achieved,
    merit_text: sections.merit,
    excellence_text: sections.excellence
  };
}

function extractHrefListFromHtml(html) {
  const source = String(html || "");
  const hrefs = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match = regex.exec(source);
  while (match) {
    const value = String(match?.[1] || "").trim().replace(/&amp;/gi, "&");
    if (value) {
      hrefs.push(value);
    }
    match = regex.exec(source);
  }
  return hrefs;
}

function toNzqaAbsoluteUrl(href) {
  const value = String(href || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value, `${NZQA_BASE_URL}/`).toString();
  } catch (_error) {
    return "";
  }
}

function isDocumentAttachmentUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  return /\.(?:pdf|doc|docx)(?:\b|[^a-z0-9])/i.test(value);
}

function looksLikeBinaryGarble(text) {
  const sample = String(text || "").slice(0, 300);
  if (!sample) return false;
  if (/^PK[\x00-\x7F]{0,40}/.test(sample)) return true;
  const replacementCount = (sample.match(/�/g) || []).length;
  return replacementCount > 8;
}

function isPdfAttachmentUrl(url) {
  return /\.pdf(?:\b|[^a-z0-9])/i.test(String(url || ""));
}

function isDocAttachmentUrl(url) {
  return /\.(?:doc|docx)(?:\b|[^a-z0-9])/i.test(String(url || ""));
}

function scoreAttachmentUrlForStandard(url, standardNumber) {
  const href = String(url || "").toLowerCase();
  const number = String(standardNumber || "").trim().toLowerCase();
  if (!href) return 0;

  let score = 0;
  if (number && href.includes(number)) score += 10;
  if (number && href.includes(`as${number}`)) score += 6;
  if (isPdfAttachmentUrl(href) || isDocAttachmentUrl(href)) score += 2;
  if (/download|attachment|resource/i.test(href)) score += 1;
  return score;
}

function pickNzqaAttachmentsFromHrefs(hrefs, standardNumber = "") {
  const values = Array.isArray(hrefs) ? hrefs : [];
  const ranked = values
    .map((href) => toNzqaAbsoluteUrl(href))
    .filter(Boolean)
    .map((absolute) => ({
      url: absolute,
      score: scoreAttachmentUrlForStandard(absolute, standardNumber)
    }))
    .sort((a, b) => b.score - a.score);

  const pdfMatch = ranked.find((row) => isPdfAttachmentUrl(row.url));
  const docMatch = ranked.find((row) => isDocAttachmentUrl(row.url));

  return {
    pdfUrl: pdfMatch?.url || "",
    docxUrl: docMatch?.url || ""
  };
}

function pickNzqaDetailPageUrl(hrefs, standardNumber) {
  const number = String(standardNumber || "").trim();
  if (!number) return "";

  const candidates = (Array.isArray(hrefs) ? hrefs : [])
    .map((href) => toNzqaAbsoluteUrl(href))
    .filter(Boolean)
    .filter((href) => href.includes("nzqa.govt.nz") && href.includes("/ncea/assessment/"))
    .filter((href) => !isDocumentAttachmentUrl(href));

  const byNumber = candidates.find((href) => href.includes(number) && /search\.do\?|view\//i.test(href));
  if (byNumber) return byNumber;

  return candidates.find((href) => /search\.do\?|view\//i.test(href)) || "";
}

async function fetchNzqaAttachmentLinks(standardNumber) {
  const number = String(standardNumber || "").trim();
  if (!number) {
    return { details_url: "", pdf_url: "", docx_url: "" };
  }

  const localDocuments = findLocalStandardDocuments(number);
  if (localDocuments.pdf_url || localDocuments.docx_url) {
    return {
      details_url: buildNzqaLinks(number).details_url,
      pdf_url: localDocuments.pdf_url,
      docx_url: localDocuments.docx_url
    };
  }

  const cacheKey = number;
  const cached = nzqaStandardLinksCache.get(cacheKey);
  const now = Date.now();
  if (cached && Number(cached.timestamp) + NZQA_LINKS_CACHE_TTL_MS > now && cached.value) {
    return cached.value;
  }

  const fallback = buildNzqaLinks(number);
  try {
    const searchResponse = await fetch(fallback.details_url, {
      headers: {
        "user-agent": "Mozilla/5.0 (DTECH-HUB/1.0)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const searchHtml = await searchResponse.text();
    const searchHrefs = extractHrefListFromHtml(searchHtml);
    const searchAttachments = pickNzqaAttachmentsFromHrefs(searchHrefs, number);
    const detailUrl = pickNzqaDetailPageUrl(searchHrefs, number) || fallback.details_url;

    let pdfUrl = searchAttachments.pdfUrl;
    let docxUrl = searchAttachments.docxUrl;

    if ((!pdfUrl || !docxUrl) && detailUrl) {
      try {
        const detailResponse = await fetch(detailUrl, {
          headers: {
            "user-agent": "Mozilla/5.0 (DTECH-HUB/1.0)",
            "accept": "text/html,application/xhtml+xml"
          }
        });
        const detailHtml = await detailResponse.text();
        const detailAttachments = pickNzqaAttachmentsFromHrefs(extractHrefListFromHtml(detailHtml), number);
        if (!pdfUrl && detailAttachments.pdfUrl) {
          pdfUrl = detailAttachments.pdfUrl;
        }
        if (!docxUrl && detailAttachments.docxUrl) {
          docxUrl = detailAttachments.docxUrl;
        }
      } catch (_error) {
        // Keep fallback URLs if detail page fetch fails.
      }
    }

    const value = {
      details_url: detailUrl || fallback.details_url,
      pdf_url: pdfUrl || "",
      docx_url: docxUrl || ""
    };
    nzqaStandardLinksCache.set(cacheKey, { timestamp: now, value });
    return value;
  } catch (_error) {
    nzqaStandardLinksCache.set(cacheKey, { timestamp: now, value: fallback });
    return fallback;
  }
}

async function fetchNzqaStandardDetails(standardNumber) {
  const number = String(standardNumber || "").trim();
  if (!number) {
    throw new Error("standard number is required");
  }

  const cacheKey = number;
  const now = Date.now();
  const cached = nzqaStandardDetailsCache.get(cacheKey);
  if (cached && Number(cached.timestamp) + NZQA_DETAILS_CACHE_TTL_MS > now && cached.value) {
    return cached.value;
  }

  const links = await fetchNzqaAttachmentLinks(number);
  const result = {
    standard_number: number,
    details_url: String(links.details_url || ""),
    pdf_url: String(links.pdf_url || ""),
    docx_url: String(links.docx_url || ""),
    source_type: "none",
    extracted_text: "",
    fetched_at: new Date().toISOString()
  };

  // Prefer DOCX first because it tends to contain cleaner section text for parsing.
  if (!result.extracted_text && result.docx_url && /\.docx(?:$|[?#])/i.test(result.docx_url)) {
    try {
      const localBuffer = readLocalStandardDocumentBuffer(result.docx_url);
      const bytes = localBuffer || await (async () => {
        const response = await fetch(result.docx_url, {
          headers: {
            "user-agent": "Mozilla/5.0 (DTECH-HUB/1.0)",
            "accept": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          }
        });
        return Buffer.from(await response.arrayBuffer());
      })();
      const extraction = await mammoth.extractRawText({ buffer: bytes });
      result.source_type = "docx";
      result.extracted_text = String(extraction?.value || "").replace(/\r/g, "").trim();
    } catch (_error) {
      // Continue to PDF fallback.
    }
  }

  if (!result.extracted_text && result.pdf_url) {
    try {
      const localBuffer = readLocalStandardDocumentBuffer(result.pdf_url);
      const bytes = localBuffer || await (async () => {
        const response = await fetch(result.pdf_url, {
          headers: {
            "user-agent": "Mozilla/5.0 (DTECH-HUB/1.0)",
            "accept": "application/pdf"
          }
        });
        return Buffer.from(await response.arrayBuffer());
      })();
      if (PDFParse) {
        const parser = new PDFParse({ data: bytes, verbosity: 0 });
        const extraction = await parser.getText();
        result.source_type = "pdf";
        result.extracted_text = String(extraction?.text || "").replace(/\r/g, "").trim();
      }
    } catch (_error) {
      // No further source fallback.
    }
  }

  if (!result.extracted_text || looksLikeBinaryGarble(result.extracted_text)) {
    result.source_type = "none";
    result.extracted_text = "No usable DOCX/PDF content could be extracted for this standard. The source has been limited to standard documents only (no general website fallback).";
  }

  result.criteria = extractAssessmentCriteriaFromText(result.extracted_text);

  nzqaStandardDetailsCache.set(cacheKey, {
    timestamp: now,
    value: result
  });

  return result;
}

async function fetchNzqaStandards(stream, level, options = {}) {
  const normalizedStream = String(stream || "").trim().toLowerCase();
  const normalizedLevel = Number.parseInt(level, 10);
  const includeDocs = options?.includeDocs === true;

  if (!["digital", "computing"].includes(normalizedStream)) {
    return [];
  }

  if (![1, 2, 3].includes(normalizedLevel)) {
    return [];
  }

  const cacheKey = `${normalizedStream}:${normalizedLevel}:${includeDocs ? "docs" : "base"}`;
  const now = Date.now();
  const cached = nzqaStandardsCache.get(cacheKey);
  if (cached && Number(cached.timestamp) + NZQA_CACHE_TTL_MS > now && Array.isArray(cached.rows)) {
    return cached.rows;
  }

  let rows = NZQA_STANDARDS_FALLBACK
    .filter((row) => String(row.stream || "").toLowerCase() === normalizedStream)
    .filter((row) => Number.parseInt(row.level, 10) === normalizedLevel)
    .map((row) => {
      const standard_number = String(row.standard_number || "").trim();
      const links = buildNzqaLinks(standard_number);
      return {
        standard_number,
        standard_name: String(row.standard_name || "").trim(),
        version: String(row.version || "").trim() || "1",
        level: Number.parseInt(row.level, 10) || normalizedLevel,
        credits: Number.isFinite(Number(row.credits)) ? Number(row.credits) : null,
        stream: normalizedStream,
        details_url: links.details_url,
        pdf_url: links.pdf_url,
        docx_url: links.docx_url
      };
    })
    .sort((left, right) => String(left.standard_number || "").localeCompare(String(right.standard_number || ""), undefined, { numeric: true }));

  if (includeDocs && rows.length) {
    rows = await Promise.all(rows.map(async (row) => {
      const links = await fetchNzqaAttachmentLinks(row.standard_number);
      return {
        ...row,
        details_url: links.details_url || row.details_url,
        pdf_url: links.pdf_url || row.pdf_url,
        docx_url: links.docx_url || row.docx_url
      };
    }));
  }

  nzqaStandardsCache.set(cacheKey, {
    timestamp: now,
    rows
  });

  return rows;
}

const CLASS_DATA_AGING_DAYS = parsePositiveInteger(process.env.CLASS_DATA_AGING_DAYS, DEFAULT_CLASS_DATA_AGING_DAYS);
const CLASS_DATA_STALE_DAYS = Math.max(
  CLASS_DATA_AGING_DAYS + 1,
  parsePositiveInteger(process.env.CLASS_DATA_STALE_DAYS, DEFAULT_CLASS_DATA_STALE_DAYS)
);
const STUDENT_TIMETABLE_PERIOD_COLUMNS = [
  "mon_p1_1", "mon_p1_2", "mon_p2", "mon_i", "mon_p3", "mon_p4", "mon_l", "mon_p5",
  "tue_p1_1", "tue_p1_2", "tue_p2", "tue_i", "tue_p3", "tue_p4", "tue_l", "tue_p5",
  "wed_p1_1", "wed_p1_2", "wed_p2", "wed_i", "wed_p3", "wed_p4", "wed_l", "wed_p5",
  "thu_p1_1", "thu_p1_2", "thu_p2", "thu_i", "thu_p3", "thu_p4", "thu_l", "thu_p5",
  "fri_p1_1", "fri_p1_2", "fri_p2", "fri_i", "fri_p3", "fri_p4", "fri_l", "fri_p5"
];
const DTECH_TIMETABLE_KEYWORDS = [
  "dtech",
  "d-tec",
  "digital tech",
  "digital technologies",
  "digitech",
  "computer",
  "computing",
  "programming",
  "python",
  "robotics",
  "electronics",
  "web design",
  "office suite",
  "network",
  "networking",
  "infrastructure",
  "cyber",
  "tinkercad"
];

// Program-specific keyword mappings
const PROGRAM_KEYWORDS = {
  "DTECH": ["dtech", "d-tec", "digital tech", "digital technologies", "digitech"],
  "DTONLINE": ["dtonline", "dt online", "d-t online", "online tech"],
  "COMP": ["comp", "computing", "computer", "programming", "python"],
  "TEXT": ["text", "textile", "textiles", "sewing"],
  "MPROG": ["mprog", "media prog", "media programming"],
  "MDTECH": ["mdtech", "m-dtech", "media dtech"]
};

function getStudentPrograms(row) {
  if (!row || typeof row !== "object") {
    return [];
  }

  const sourceValues = [
    row.program,
    row.program_code,
    row.program_name,
    row.subject,
    row.subjects,
    row.course,
    row.course_name,
    row.class_name,
    row.form_class,
    row.year_level,
    row.status,
    row.id_number,
    row.student_name,
    ...STUDENT_TIMETABLE_PERIOD_COLUMNS.map((columnName) => row[columnName]),
    ...Object.values(row || {})
  ];

  const normalizedText = sourceValues
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean)
    .join(" | ");

  const detectedPrograms = [];

  Object.entries(PROGRAM_KEYWORDS).forEach(([programCode, keywords]) => {
    if (keywords.some((keyword) => normalizedText.includes(keyword))) {
      detectedPrograms.push(programCode);
    }
  });

  if (DTECH_TIMETABLE_KEYWORDS.some((keyword) => normalizedText.includes(keyword)) && !detectedPrograms.includes("DTECH")) {
    detectedPrograms.push("DTECH");
  }

  return detectedPrograms;
}

const TIMETABLE_LABELS = new Map(STUDENT_TIMETABLE_PERIOD_COLUMNS.map((columnName) => {
  const label = columnName
    .replace(/_/g, " ")
    .replace(/\bp\b/gi, "P")
    .replace(/\bi\b/gi, "I")
    .replace(/\bl\b/gi, "L")
    .replace(/\bmon\b/i, "Mon")
    .replace(/\btue\b/i, "Tue")
    .replace(/\bwed\b/i, "Wed")
    .replace(/\bthu\b/i, "Thu")
    .replace(/\bfri\b/i, "Fri")
    .replace(/\s+/g, " ")
    .trim();
  return [columnName, label];
}));

async function resolveExistingTableName(candidates) {
  const candidateList = Array.isArray(candidates) ? candidates.map((value) => String(value || "").trim()).filter(Boolean) : [];
  if (!candidateList.length) {
    return null;
  }

  if (!hasDatabase) {
    return candidateList[0] || null;
  }

  for (const tableName of candidateList) {
    try {
      const result = await pool.query("SELECT to_regclass($1) AS table_ref", [`public.${tableName}`]);
      if (String(result.rows?.[0]?.table_ref || "").trim()) {
        return tableName;
      }
    } catch (_error) {
    }
  }

  return null;
}

async function resolveExistingTableNames(candidates) {
  const candidateList = Array.isArray(candidates) ? candidates.map((value) => String(value || "").trim()).filter(Boolean) : [];
  if (!candidateList.length) {
    return [];
  }

  if (!hasDatabase) {
    return candidateList;
  }

  const existing = [];
  for (const tableName of candidateList) {
    try {
      const result = await pool.query("SELECT to_regclass($1) AS table_ref", [`public.${tableName}`]);
      if (String(result.rows?.[0]?.table_ref || "").trim()) {
        existing.push(tableName);
      }
    } catch (_error) {
    }
  }

  return existing;
}

const STUDENT_TIMETABLE_CLASS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
let lastStudentTimetableClassSyncAt = 0;

// Persists Timetable Class from the KAMAR details upload onto matching student_upload rows (by Student ID).
async function syncStudentTimetableClasses(tableNames, { force = false } = {}) {
  if (!hasDatabase || !tableNames.includes("student_details_upload") || !tableNames.includes("student_upload")) {
    return { updated: 0, skipped: true };
  }
  if (!force && Date.now() - lastStudentTimetableClassSyncAt < STUDENT_TIMETABLE_CLASS_SYNC_INTERVAL_MS) {
    return { updated: 0, skipped: true };
  }
  lastStudentTimetableClassSyncAt = Date.now();

  await pool.query("ALTER TABLE student_upload ADD COLUMN IF NOT EXISTS timetable_class TEXT");
  const result = await pool.query(`
    UPDATE student_upload AS target
    SET timetable_class = source.timetable_class
    FROM student_details_upload AS source
    WHERE LOWER(TRIM(target.id_number)) = LOWER(TRIM(source.id_number))
      AND COALESCE(TRIM(source.id_number), '') <> ''
      AND COALESCE(TRIM(source.timetable_class), '') <> ''
      AND target.timetable_class IS DISTINCT FROM source.timetable_class
  `);
  return { updated: result.rowCount || 0, skipped: false };
}

async function getStudentDirectoryRows() {
  if (!hasDatabase) {
    return [];
  }

  const tableNames = await resolveExistingTableNames(STUDENT_TABLE_CANDIDATES);
  if (!tableNames.length) {
    return [];
  }

  try {
    await syncStudentTimetableClasses(tableNames);
  } catch (error) {
    console.warn("Student Timetable Class sync failed:", error.message);
  }

  const mergedRows = [];
  for (const tableName of tableNames) {
    try {
      const result = await pool.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
      if (Array.isArray(result.rows) && result.rows.length) {
        mergedRows.push(...result.rows);
      }
    } catch (_error) {
    }
  }

  return mergedRows;
}

async function getStaffDirectoryRows() {
  if (!hasDatabase) return Array.from(memoryStaffDirectory.values());
  const tableNames = await resolveExistingTableNames(STAFF_TABLE_CANDIDATES);
  const rows = [];
  for (const tableName of tableNames) {
    const result = await pool.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    rows.push(...(result.rows || []));
  }
  return rows;
}

function collectDirectoryEmails(row, keys) {
  const lower = buildLowerKeyMap(row);
  return [...new Set(keys.map((key) => normalizeEmail(lower.get(key))).filter(Boolean))];
}

function buildLowerKeyMap(row) {
  const map = new Map();
  Object.keys(row || {}).forEach((key) => {
    map.set(String(key || "").toLowerCase(), row[key]);
  });
  return map;
}

function pickRowValue(lowerMap, keys) {
  for (const key of Array.isArray(keys) ? keys : []) {
    const value = lowerMap.get(String(key || "").toLowerCase());
    if (typeof value === "undefined" || value === null) {
      continue;
    }
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function mergeUniqueStrings(values) {
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const text = String(value || "").trim();
    if (text) {
      seen.add(text);
    }
  });
  return Array.from(seen);
}

function collectStudentLinkedEmails(row) {
  const lower = buildLowerKeyMap(row);
  const linked = new Set();

  [
    "email_school",
    "email school",
    "student_email",
    "student email",
    "studentemail",
    "email",
    "email_address",
    "email address",
    "school_email",
    "school email",
    "google_email",
    "google email",
    "student_google_email",
    "student google email",
    "student_mail",
    "student mail",
    "mail",
    "upn"
  ].forEach((key) => {
    const raw = String(lower.get(key) || "").trim().toLowerCase();
    if (!raw) {
      return;
    }
    linked.add(raw.includes("@") ? raw : `${raw}@${SCHOOL_EMAIL_DOMAIN}`);
  });

  ["username", "user_name", "student_username", "login", "student_login"].forEach((key) => {
    const raw = String(lower.get(key) || "").trim().toLowerCase();
    if (!raw) {
      return;
    }
    linked.add(raw.includes("@") ? raw : `${raw}@${SCHOOL_EMAIL_DOMAIN}`);
  });

  return Array.from(linked);
}

function buildStudentClassManagementRow(row) {
  const lower = buildLowerKeyMap(row);
  const firstName = pickRowValue(lower, ["first_name", "first name", "firstname", "given_name", "given name"]);
  const lastName = pickRowValue(lower, ["last_name", "last name", "lastname", "surname", "family_name", "family name"]);
  const fullNameFallback = [firstName, lastName].filter(Boolean).join(" ").trim();
  const status = pickRowValue(lower, ["status", "student_status"]) || "Current";
  const timetable = STUDENT_TIMETABLE_PERIOD_COLUMNS
    .map((columnName) => {
      const value = String(row?.[columnName] || "").trim();
      if (!value) {
        return null;
      }
      return {
        label: TIMETABLE_LABELS.get(columnName) || columnName,
        value
      };
    })
    .filter(Boolean);

  const dtechTimetable = timetable.filter((entry) => {
    const text = String(entry?.value || "").toLowerCase();
    return DTECH_TIMETABLE_KEYWORDS.some((keyword) => text.includes(keyword));
  });

  const programs = getStudentPrograms(row);

  return {
    student_name: pickRowValue(lower, ["student_name", "student name", "full_name", "full name", "name", "student"]) || fullNameFallback || "Unnamed student",
    id_number: pickRowValue(lower, ["id_number", "student_id", "id", "idnumber"]),
    year_level: pickRowValue(lower, ["year_level", "year level", "year", "level", "yeargroup", "year_group"]),
    form_class: pickRowValue(lower, ["form_class", "form class", "form", "tutor", "tutor_class", "timetable_class", "home_room", "homeroom", "class"]),
    homeroom: pickRowValue(lower, ["homeroom", "home_room", "home room", "tutor_class", "tutor", "form_class", "form class", "form", "class"]),
    timetable_class: pickRowValue(lower, ["timetable_class", "timetable class", "timetableclass"]),
    status,
    upload_term: pickRowValue(lower, ["upload_term", "term"]),
    upload_year: pickRowValue(lower, ["upload_year", "year_uploaded"]),
    upload_date: pickRowValue(lower, ["upload_date", "updated_at", "created_at"]),
    programs,
    has_dtech: programs.includes("DTECH"),
    linked_emails: collectStudentLinkedEmails(row),
    dtech_timetable: dtechTimetable,
    timetable
  };
}

function getStudentIdentityKey(row) {
  const idNumber = String(row?.id_number || "").trim().toLowerCase();
  if (idNumber) {
    return `id:${idNumber}`;
  }

  const name = String(row?.student_name || "").trim().toLowerCase();
  if (name) {
    return `name:${name}`;
  }

  const formClass = String(row?.form_class || "").trim().toLowerCase();
  const yearLevel = String(row?.year_level || "").trim().toLowerCase();
  return `fallback:${name}|${formClass}|${yearLevel}`;
}

function toEpochMillis(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function parseTermOrdinal(value) {
  const text = String(value || "").trim().toLowerCase();
  const matched = text.match(/term\s*(\d+)/i) || text.match(/\b(\d+)\b/);
  const term = Number.parseInt(matched?.[1] || "", 10);
  return Number.isInteger(term) ? term : 0;
}

function parseYearOrdinal(value) {
  const year = Number.parseInt(String(value || "").replace(/[^0-9]/g, ""), 10);
  return Number.isInteger(year) ? year : 0;
}

function getDtechSignalScore(row) {
  const hasDtech = row?.has_dtech ? 1 : 0;
  const dtechSlots = Array.isArray(row?.dtech_timetable) ? row.dtech_timetable.length : 0;
  return hasDtech * 100 + dtechSlots;
}

function shouldReplaceStudentSnapshot(currentRow, candidateRow) {
  const currentDate = toEpochMillis(currentRow?.upload_date);
  const candidateDate = toEpochMillis(candidateRow?.upload_date);
  if (candidateDate !== currentDate) {
    return candidateDate > currentDate;
  }

  const currentYear = parseYearOrdinal(currentRow?.upload_year);
  const candidateYear = parseYearOrdinal(candidateRow?.upload_year);
  if (candidateYear !== currentYear) {
    return candidateYear > currentYear;
  }

  const currentTerm = parseTermOrdinal(currentRow?.upload_term);
  const candidateTerm = parseTermOrdinal(candidateRow?.upload_term);
  if (candidateTerm !== currentTerm) {
    return candidateTerm > currentTerm;
  }

  const currentDtechSignal = getDtechSignalScore(currentRow);
  const candidateDtechSignal = getDtechSignalScore(candidateRow);
  if (candidateDtechSignal !== currentDtechSignal) {
    return candidateDtechSignal > currentDtechSignal;
  }

  const currentSlots = Array.isArray(currentRow?.timetable) ? currentRow.timetable.length : 0;
  const candidateSlots = Array.isArray(candidateRow?.timetable) ? candidateRow.timetable.length : 0;
  return candidateSlots > currentSlots;
}

function dedupeToLatestStudentRows(rows) {
  const latestByStudent = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = getStudentIdentityKey(row);
    const existing = latestByStudent.get(key);
    if (!existing) {
      latestByStudent.set(key, row);
      return;
    }

    const replace = shouldReplaceStudentSnapshot(existing, row);
    const preferred = replace ? row : existing;
    const secondary = replace ? existing : row;

    const filledFields = {};
    ["timetable_class", "form_class", "homeroom", "year_level", "id_number"].forEach((field) => {
      if (!String(preferred?.[field] || "").trim() && String(secondary?.[field] || "").trim()) {
        filledFields[field] = secondary[field];
      }
    });

    latestByStudent.set(key, {
      ...preferred,
      ...filledFields,
      linked_emails: mergeUniqueStrings([
        ...(Array.isArray(preferred?.linked_emails) ? preferred.linked_emails : []),
        ...(Array.isArray(secondary?.linked_emails) ? secondary.linked_emails : [])
      ]),
      programs: mergeUniqueStrings([
        ...(Array.isArray(preferred?.programs) ? preferred.programs : []),
        ...(Array.isArray(secondary?.programs) ? secondary.programs : [])
      ])
    });
  });

  return Array.from(latestByStudent.values()).map((row) => ({
    ...row,
    has_dtech: Array.isArray(row?.programs) && row.programs.includes("DTECH")
  }));
}
const suggestionNotificationFallback = String(process.env.SUGGESTION_NOTIFY_EMAILS || "");

function parseCsvEmails(value) {
  return String(value || "")
    .split(/[;,\s]+/)
    .map((item) => normalizeEmail(item))
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
}

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || "", 10) || 587;
const SMTP_SECURE = ["true", "1", "yes", "on"].includes(String(process.env.SMTP_SECURE || "false").trim().toLowerCase());
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(integration.emailSender || "").trim();
const suggestionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const isPdfMime = String(file.mimetype || "").toLowerCase() === "application/pdf";
    const isPdfName = String(file.originalname || "").toLowerCase().endsWith(".pdf");
    callback(null, isPdfMime || isPdfName);
  }
});

const unitPlanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    const isDocxMime = mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isDocxName = name.endsWith(".docx");
    callback(null, isDocxMime || isDocxName);
  }
});

const courseOutlinePdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    const isPdfMime = mime === "application/pdf";
    const isPdfName = name.endsWith(".pdf");
    callback(null, isPdfMime || isPdfName);
  }
});

const lessonResourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, callback) => {
    const name = String(file.originalname || "").toLowerCase();
    const allowed = [".pdf", ".docx", ".pptx", ".ppt", ".xlsx", ".jpg", ".jpeg", ".png", ".webp"].some((extension) => name.endsWith(extension));
    callback(null, allowed);
  }
});

function extractReliefLessonField(text, label, nextLabels) {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextPattern = nextLabels.map((value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = String(text || "").match(new RegExp(`${escapedLabel}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})\\s*:|$)`, "i"));
  return String(match?.[1] || "").replace(/\s+/g, " ").trim();
}

function parseReliefLessonPlanText(text) {
  const labels = ["Unit", "STEAM Component", "Theme", "Discipline", "Focus", "Class", "AIM(S) OF LESSON", "Resources Required", "Preparation (To do before lesson)", "Health & Safety - Digital Technologies classroom", "Starter (max 10 minutes to settle the students)", "Demonstration", "Practice", "Plenary (bring together, complete pack up activities)", "Homework", "Lesson Evaluation"];
  const lessonTitle = extractReliefLessonField(text, "Theme", labels);
  const className = extractReliefLessonField(text, "Class", labels);
  const focus = extractReliefLessonField(text, "Focus", labels);
  const plan = {
    unit: extractReliefLessonField(text, "Unit", labels),
    component: extractReliefLessonField(text, "STEAM Component", labels),
    theme: lessonTitle,
    aim: extractReliefLessonField(text, "AIM(S) OF LESSON", labels),
    resources: extractReliefLessonField(text, "Resources Required", labels),
    preparation: extractReliefLessonField(text, "Preparation (To do before lesson)", labels),
    healthSafety: extractReliefLessonField(text, "Health & Safety - Digital Technologies classroom", labels),
    starter: extractReliefLessonField(text, "Starter (max 10 minutes to settle the students)", labels),
    demonstration: extractReliefLessonField(text, "Demonstration", labels),
    practice: extractReliefLessonField(text, "Practice", labels),
    plenary: extractReliefLessonField(text, "Plenary (bring together, complete pack up activities)", labels),
    homework: extractReliefLessonField(text, "Homework", labels),
    evaluation: extractReliefLessonField(text, "Lesson Evaluation", labels)
  };

  return {
    lesson_title: lessonTitle || "Relief Lesson",
    activity_name: lessonTitle || "Relief Lesson",
    lesson_type: "Digital Technologies",
    lesson_year_level: className || "",
    lesson_focus: focus || plan.aim,
    lesson_plan: plan
  };
}

function stripReliefHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function parseReliefLessonPlanHtml(html) {
  const cells = [];
  const tableMatches = String(html || "").matchAll(/<table[\s\S]*?<\/table>/gi);
  for (const tableMatch of tableMatches) {
    const rows = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((rowMatch) =>
      [...rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => stripReliefHtml(cell[1]))
    );
    cells.push(...rows);
  }

  const findLabelValue = (label) => {
    const normalizedLabel = String(label).toLowerCase();
    for (const row of cells) {
      const index = row.findIndex((cell) => cell.toLowerCase().includes(normalizedLabel));
      if (index >= 0 && row[index + 1]) return row[index + 1];
    }
    return "";
  };
  const KNOWN_SECTION_LABELS = [
    "unit", "steam component", "theme", "focus", "class",
    "aim(s) of lesson", "resources required", "preparation (to do before lesson)", "preparation",
    "health & safety", "starter", "demonstration", "practice",
    "plenary", "homework", "lesson evaluation"
  ];
  const looksLikeAnotherLabel = (value) => {
    const normalized = String(value || "").toLowerCase().replace(/[:\s]+$/, "").trim();
    if (!normalized) return false;
    return KNOWN_SECTION_LABELS.some((label) => normalized === label || normalized.startsWith(label));
  };
  const findSection = (label) => {
    const normalizedLabel = String(label).toLowerCase();
    for (let rowIndex = 0; rowIndex < cells.length; rowIndex += 1) {
      const row = cells[rowIndex];
      const labelIndex = row.findIndex((cell) => cell.toLowerCase().includes(normalizedLabel));
      if (labelIndex < 0) continue;
      const sameRowValue = row.slice(labelIndex + 1).filter(Boolean).join("\n");
      // Some templates put two column labels on one row (e.g. Aim | Resources) with the
      // actual values in the matching column of the following row, so don't mistake a
      // neighbouring label for the value.
      if (sameRowValue && !looksLikeAnotherLabel(sameRowValue)) return sameRowValue;
      const nextRow = cells[rowIndex + 1] || [];
      if (nextRow[labelIndex] && !looksLikeAnotherLabel(nextRow[labelIndex])) return nextRow[labelIndex];
      return nextRow.filter(Boolean).join("\n");
    }
    return "";
  };

  const theme = findLabelValue("theme");
  const focus = findLabelValue("focus");
  return {
    lesson_title: theme || "Relief Lesson",
    activity_name: theme || "Relief Lesson",
    lesson_type: "Digital Technologies",
    lesson_year_level: findLabelValue("class"),
    lesson_focus: focus,
    lesson_plan: {
      unit: findLabelValue("unit"),
      component: findLabelValue("steam component"),
      theme,
      aim: findSection("aim(s) of lesson"),
      resources: findSection("resources required"),
      preparation: findSection("preparation"),
      healthSafety: findSection("health & safety"),
      starter: findSection("starter"),
      demonstration: findSection("demonstration"),
      practice: findSection("practice"),
      plenary: findSection("plenary"),
      homework: findSection("homework"),
      evaluation: findSection("lesson evaluation")
    }
  };
}


const smtpTransporter = integration.mailTransport || null;

const DEFAULT_ROLE_PERMISSIONS = [
  { role_name: "Admin", home_page: true, upload_activity: true, browse_activities: true, planning: true, admin: true },
  { role_name: "Lead Teacher", home_page: true, upload_activity: true, browse_activities: true, planning: true, admin: false },
  { role_name: "Public Access", home_page: true, upload_activity: false, browse_activities: false, planning: false, admin: false },
  { role_name: "Staff", home_page: true, upload_activity: false, browse_activities: true, planning: false, admin: false },
  { role_name: "Student", home_page: true, upload_activity: false, browse_activities: true, planning: false, admin: false },
  { role_name: "Student Admin", home_page: true, upload_activity: false, browse_activities: true, planning: true, admin: true },
  { role_name: "Teacher", home_page: true, upload_activity: false, browse_activities: true, planning: false, admin: false },
  { role_name: "Technician", home_page: true, upload_activity: false, browse_activities: true, planning: false, admin: false }
];

const DEV_ADMIN_EMAILS = new Set(
  String(process.env.HUB_DEVELOPER_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean)
);

let memoryRolePermissions = DEFAULT_ROLE_PERMISSIONS.map((row) => ({ ...row }));

function isDeveloperAdminEmail(email) {
  return false;
}

const ROLE_NAME_ALIASES = new Map([
  ["admin", "Admin"],
  ["leadteacher", "Lead Teacher"],
  ["publicaccess", "Public Access"],
  ["staff", "Staff"],
  ["student", "Student"],
  ["studentadmin", "Student Admin"],
  ["teacher", "Teacher"],
  ["technician", "Technician"]
]);

const DEFAULT_ROLE_ORDER = DEFAULT_ROLE_PERMISSIONS.map((row) => String(row.role_name || "").trim());

function quoteIdentifier(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function canonicalizeEmail(value) {
  const email = normalizeEmail(value);
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return email;
  }

  const localPart = email.slice(0, atIndex).replace(/\+.*/, "");
  const domain = email.slice(atIndex + 1);
  return `${localPart}@${domain}`;
}

function canonicalizeRoleName(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const aliasKey = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ROLE_NAME_ALIASES.has(aliasKey)) {
    return ROLE_NAME_ALIASES.get(aliasKey);
  }

  const words = raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

  return words;
}

function mergeRolePermissionRows(rows) {
  const mergedByRole = new Map();

  const seedRows = Array.isArray(DEFAULT_ROLE_PERMISSIONS) ? DEFAULT_ROLE_PERMISSIONS : [];
  seedRows.forEach((row) => {
    const roleName = canonicalizeRoleName(row?.role_name);
    if (!roleName) {
      return;
    }

    mergedByRole.set(roleName, {
      role_name: roleName,
      home_page: Boolean(row?.home_page),
      upload_activity: Boolean(row?.upload_activity),
      browse_activities: Boolean(row?.browse_activities),
      planning: Boolean(row?.planning),
      admin: Boolean(row?.admin)
    });
  });

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const roleName = canonicalizeRoleName(row?.role_name);
    if (!roleName) {
      return;
    }

    mergedByRole.set(roleName, {
      role_name: roleName,
      home_page: Boolean(row?.home_page),
      upload_activity: Boolean(row?.upload_activity),
      browse_activities: Boolean(row?.browse_activities),
      planning: Boolean(row?.planning),
      admin: Boolean(row?.admin)
    });
  });

  return Array.from(mergedByRole.values()).sort((left, right) => {
    const leftIndex = DEFAULT_ROLE_ORDER.findIndex((value) => value === left.role_name);
    const rightIndex = DEFAULT_ROLE_ORDER.findIndex((value) => value === right.role_name);
    const safeLeft = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
    const safeRight = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;
    if (safeLeft !== safeRight) {
      return safeLeft - safeRight;
    }
    return String(left.role_name || "").localeCompare(String(right.role_name || ""));
  });
}

async function resolveUserRolesColumns() {
  const fallbackColumns = {
    email: "user_email",
    userType: "user_type",
    displayName: "display_name",
    additionalRole: "additional_role",
    legacyRoleName: "role_name",
    hubAccess: "hub_access",
    updatedAt: "updated_at"
  };

  if (!hasDatabase) {
    return fallbackColumns;
  }

  try {
    const result = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_additional_roles'
      `
    );

    const available = new Set(result.rows.map((row) => String(row.column_name || "")));
    const pick = (candidates) => candidates.find((name) => available.has(name)) || null;

    return {
      email: pick(["user_email", "email", "staff_email", "google_email"]),
      userType: pick(["user_type", "type"]),
      displayName: pick(["display_name", "name", "full_name"]),
      additionalRole: pick(["additional_role", "role", "role_name"]),
      legacyRoleName: pick(["role_name"]),
      hubAccess: pick(["hub_access"]),
      updatedAt: pick(["updated_at", "modified_at", "created_at"])
    };
  } catch (_error) {
    return fallbackColumns;
  }
}

async function getAllTableColumns(tableName) {
  if (!hasDatabase) {
    return [];
  }

  const safeTableName = String(tableName || "").trim().toLowerCase();
  if (!safeTableName) {
    return [];
  }

  try {
    const result = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `,
      [safeTableName]
    );

    return result.rows
      .map((row) => String(row?.column_name || "").trim())
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

async function getTableColumnMetadata(tableName) {
  const metadataByColumn = new Map();
  if (!hasDatabase) {
    return metadataByColumn;
  }

  const safeTableName = String(tableName || "").trim().toLowerCase();
  if (!safeTableName) {
    return metadataByColumn;
  }

  try {
    const result = await pool.query(
      `
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `,
      [safeTableName]
    );

    result.rows.forEach((row) => {
      const columnName = String(row?.column_name || "").trim().toLowerCase();
      if (!columnName) {
        return;
      }

      metadataByColumn.set(columnName, {
        columnName,
        dataType: String(row?.data_type || "").trim().toLowerCase(),
        udtName: String(row?.udt_name || "").trim().toLowerCase()
      });
    });
  } catch (_error) {
    return metadataByColumn;
  }

  return metadataByColumn;
}

function pickExistingColumn(availableColumns, candidates) {
  const available = new Set(
    (Array.isArray(availableColumns) ? availableColumns : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const normalized = String(candidate || "").trim().toLowerCase();
    if (normalized && available.has(normalized)) {
      return normalized;
    }
  }

  return null;
}

function isIntegerLikeColumn(metadata) {
  if (!metadata) {
    return false;
  }

  const dataType = String(metadata?.dataType || "").toLowerCase();
  const udtName = String(metadata?.udtName || "").toLowerCase();
  return ["smallint", "integer", "bigint"].includes(dataType)
    || ["int2", "int4", "int8"].includes(udtName);
}

function isJsonLikeColumn(metadata) {
  if (!metadata) {
    return false;
  }

  const dataType = String(metadata?.dataType || "").toLowerCase();
  const udtName = String(metadata?.udtName || "").toLowerCase();
  return dataType === "json" || dataType === "jsonb" || udtName === "json" || udtName === "jsonb";
}

async function getCheckConstraintAllowedValues(tableName, constraintName) {
  if (!hasDatabase) {
    return [];
  }

  const safeTableName = String(tableName || "").trim();
  const safeConstraintName = String(constraintName || "").trim();
  if (!safeTableName || !safeConstraintName) {
    return [];
  }

  try {
    const result = await pool.query(
      `
        SELECT pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = $1
          AND c.conname = $2
        LIMIT 1
      `,
      [safeTableName, safeConstraintName]
    );

    const definition = String(result.rows?.[0]?.definition || "");
    if (!definition) {
      return [];
    }

    const matches = definition.match(/'([^']+)'/g) || [];
    const values = matches
      .map((value) => String(value || "").replace(/^'/, "").replace(/'$/, "").trim())
      .filter(Boolean);

    return Array.from(new Set(values));
  } catch (_error) {
    return [];
  }
}

async function resolveActivityCategoryForInsert(activityCategory, activityType, options = {}) {
  const rawCategory = String(activityCategory || "").trim();
  const rawCategoryLower = rawCategory.toLowerCase();
  const preferAssessment = Boolean(options?.preferAssessment) || ["assessment", "assessment activity", "assessment task"].includes(rawCategoryLower);
  const isExplicitProjectRequest = rawCategoryLower === "project";
  const isExplicitPracticeRequest = ["practice", "skill activity", "practice activity"].includes(rawCategoryLower);
  const isExplicitActivityRequest = rawCategoryLower === "activity";

  if (!hasDatabase) {
    if (preferAssessment) {
      return rawCategory || "Assessment Task";
    }
    return rawCategory || "Activity";
  }

  const allowedActivityCategories = await getCheckConstraintAllowedValues(
    "activities",
    "activities_activity_category_check"
  );

  if (!allowedActivityCategories.length) {
    return rawCategory || "Activity";
  }

  const allowedByLower = new Map(
    allowedActivityCategories.map((value) => [String(value).toLowerCase(), value])
  );

  const findAllowed = (candidates) => {
    const found = (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean)
      .find((candidate) => allowedByLower.has(String(candidate).toLowerCase()));
    return found ? allowedByLower.get(String(found).toLowerCase()) : "";
  };

  if (preferAssessment) {
    const matchedAssessment = findAllowed([
      rawCategory,
      "Assessment Task",
      "Assessment",
      "Assessment Activity"
    ]);
    if (matchedAssessment) {
      return matchedAssessment;
    }
  }

  const preferredFallbacks = preferAssessment
    ? ["Assessment", "Assessment Task", "Assessment Activity", "Project", "Practice", "Activity"]
    : (isExplicitProjectRequest
      ? ["Project", "Practice", "Activity", "Assessment", "Assessment Task", "Assessment Activity"]
      : (isExplicitPracticeRequest
        ? ["Practice", "Activity", "Project", "Assessment", "Assessment Task", "Assessment Activity"]
        : (isExplicitActivityRequest
          ? ["Activity", "Practice", "Project", "Assessment", "Assessment Task", "Assessment Activity"]
          : ["Project", "Practice", "Activity", "Assessment", "Assessment Task", "Assessment Activity"]
        )
      )
    );

  const candidateValues = [
    rawCategory,
    rawCategory.replace(/\s*activity\s*$/i, "").trim(),
    String(activityType || "").trim(),
    ...preferredFallbacks
  ].filter(Boolean);

  const matched = findAllowed(candidateValues);
  return matched
    ? matched
    : allowedActivityCategories[0];
}

async function resolveActivityIdForInsert(idColumn, idMetadata, requestId, fallbackId) {
  const idIsInteger = isIntegerLikeColumn(idMetadata);
  const numericBodyId = Number.parseInt(requestId, 10);
  let resolvedNumericId = Number.isInteger(numericBodyId) ? numericBodyId : null;

  if (idIsInteger && !Number.isInteger(resolvedNumericId) && idColumn) {
    const nextIdResult = await pool.query(
      `SELECT COALESCE(MAX(${quoteIdentifier(idColumn)}), 0) + 1 AS next_id FROM activities`
    );
    const nextId = Number.parseInt(nextIdResult.rows?.[0]?.next_id, 10);
    if (Number.isInteger(nextId) && nextId > 0) {
      resolvedNumericId = nextId;
    }
  }

  const canUseExplicitId = Boolean(idColumn) && (!idIsInteger || Number.isInteger(resolvedNumericId));
  return {
    canUseExplicitId,
    idValueToSave: idIsInteger ? resolvedNumericId : fallbackId
  };
}

async function getMergedRolePermissions() {
  return integration.getRolePermissions();
}

async function getUserRoleByEmail(email) {
  return integration.getUserRole(email);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeStandardCodeList(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[\r\n,;]+/);

  const unique = new Set();
  raw.forEach((entry) => {
    const code = String(entry || "").trim();
    if (code) {
      unique.add(code);
    }
  });

  return Array.from(unique);
}

function normalizeAssessmentStandardCardRow(row) {
  const source = row && typeof row === "object" ? row : {};
  const yearVersionRaw = Number.parseInt(source.year_version ?? source.year ?? source.yearVersion, 10);
  const creditsRaw = Number.parseInt(source.credits, 10);
  return {
    id: String(source.id || "").trim(),
    course_name: String(source.course_name || source.courseName || "").trim(),
    year_level: String(source.year_level || source.yearLevel || "").trim(),
    year_version: Number.isInteger(yearVersionRaw) ? yearVersionRaw : null,
    credits: Number.isInteger(creditsRaw) && creditsRaw >= 0 ? creditsRaw : null,
    standard_codes: normalizeStandardCodeList(source.standard_codes || source.standardCodes),
    achieved_text: String(source.achieved_text || source.achievedText || "").trim(),
    merit_text: String(source.merit_text || source.meritText || "").trim(),
    excellence_text: String(source.excellence_text || source.excellenceText || "").trim(),
    achieved_checklist: normalizeArray(source.achieved_checklist || source.achievedChecklist),
    merit_checklist: normalizeArray(source.merit_checklist || source.meritChecklist),
    excellence_checklist: normalizeArray(source.excellence_checklist || source.excellenceChecklist),
    card_color: "Teal",
    is_active: source.is_active === false ? false : source.isActive === false ? false : true,
    created_by_email: String(source.created_by_email || "").trim().toLowerCase(),
    updated_by_email: String(source.updated_by_email || "").trim().toLowerCase(),
    created_at: source.created_at || source.createdAt || null,
    updated_at: source.updated_at || source.updatedAt || null
  };
}

function pickBestAssessmentStandardCardMatch(cards, { standardCode, yearLevel, courseName, yearVersion }) {
  const normalizedCode = String(standardCode || "").trim();
  if (!normalizedCode) {
    return null;
  }

  const normalizedYearLevel = String(yearLevel || "").trim().toLowerCase();
  const normalizedCourseName = String(courseName || "").trim().toLowerCase();
  const normalizedYearVersion = Number.isInteger(Number.parseInt(yearVersion, 10))
    ? Number.parseInt(yearVersion, 10)
    : null;

  const scored = (Array.isArray(cards) ? cards : [])
    .map((row) => normalizeAssessmentStandardCardRow(row))
    .filter((row) => row.is_active)
    .filter((row) => {
      const rowCourseName = String(row.course_name || "").trim();
      const rowCodeList = Array.isArray(row.standard_codes)
        ? row.standard_codes.map((code) => String(code || "").trim())
        : [];

      if (rowCodeList.includes(normalizedCode)) {
        return true;
      }

      if (rowCodeList.some((code) => code.includes(normalizedCode))) {
        return true;
      }

      return rowCourseName.includes(normalizedCode);
    })
    .map((row) => {
      let score = 0;
      const rowYearLevel = String(row.year_level || "").trim().toLowerCase();
      const rowCourseName = String(row.course_name || "").trim().toLowerCase();
      const rowYearVersion = Number.parseInt(row.year_version, 10);

      if (normalizedYearLevel && rowYearLevel === normalizedYearLevel) score += 5;
      if (normalizedCourseName && rowCourseName === normalizedCourseName) score += 3;
      if (Number.isInteger(normalizedYearVersion) && Number.isInteger(rowYearVersion) && rowYearVersion === normalizedYearVersion) score += 4;
      if (!normalizedYearLevel && rowYearLevel) score += 1;

      const updatedAtTime = Number.isNaN(new Date(row.updated_at || 0).getTime()) ? 0 : new Date(row.updated_at || 0).getTime();
      return { row, score, updatedAtTime };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.updatedAtTime - left.updatedAtTime;
    });

  return scored.length ? scored[0].row : null;
}

async function ensureAssessmentStandardCardsSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assessment_standard_cards (
      id TEXT PRIMARY KEY,
      course_name TEXT NOT NULL,
      year_level TEXT NOT NULL,
      year_version INTEGER NOT NULL,
      credits INTEGER,
      standard_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
      achieved_text TEXT NOT NULL DEFAULT '',
      merit_text TEXT NOT NULL DEFAULT '',
      excellence_text TEXT NOT NULL DEFAULT '',
      achieved_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
      merit_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
      excellence_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
      card_color TEXT NOT NULL DEFAULT 'Teal',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_email TEXT,
      updated_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS course_name TEXT`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS year_level TEXT`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS year_version INTEGER`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS credits INTEGER`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS standard_codes JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS achieved_text TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS merit_text TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS excellence_text TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS achieved_checklist JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS merit_checklist JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS excellence_checklist JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS card_color TEXT NOT NULL DEFAULT 'Teal'`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS created_by_email TEXT`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE assessment_standard_cards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS assessment_standard_cards_year_idx ON assessment_standard_cards (year_version)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS assessment_standard_cards_active_idx ON assessment_standard_cards (is_active)`);
}

async function seedDefaultAssessmentStandardCards() {
  if (!hasDatabase) return;

  for (const card of DEFAULT_ASSESSMENT_STANDARD_CARDS) {
    const cardId = `default-standard-${card.standardNumber}`;
    const standardCodesJson = JSON.stringify([card.standardNumber, card.standardName]);
    const achievedText = card.achievedText || card.standardName;
    const meritText = card.meritText || "";
    const excellenceText = card.excellenceText || "";
    const achievedChecklistJson = JSON.stringify(card.achievedChecklist || []);
    const meritChecklistJson = JSON.stringify(card.meritChecklist || []);
    const excellenceChecklistJson = JSON.stringify(card.excellenceChecklist || []);

    await pool.query(
      `
        INSERT INTO assessment_standard_cards (
          id, course_name, year_level, year_version, credits, standard_codes,
          achieved_text, merit_text, excellence_text,
          achieved_checklist, merit_checklist, excellence_checklist,
          card_color, is_active, created_by_email, updated_by_email, created_at, updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,'Teal',TRUE,'system','system',NOW(),NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          course_name = EXCLUDED.course_name,
          year_level = EXCLUDED.year_level,
          year_version = EXCLUDED.year_version,
          credits = EXCLUDED.credits,
          standard_codes = EXCLUDED.standard_codes,
          achieved_text = EXCLUDED.achieved_text,
          merit_text = EXCLUDED.merit_text,
          excellence_text = EXCLUDED.excellence_text,
          achieved_checklist = EXCLUDED.achieved_checklist,
          merit_checklist = EXCLUDED.merit_checklist,
          excellence_checklist = EXCLUDED.excellence_checklist,
          card_color = 'Teal',
          updated_at = NOW()
      `,
      [
        cardId,
        card.standardNumber,
        card.level,
        card.version,
        card.credits,
        standardCodesJson,
        achievedText,
        meritText,
        excellenceText,
        achievedChecklistJson,
        meritChecklistJson,
        excellenceChecklistJson
      ]
    );

    // Also update any pre-existing rows for this standard code if their checklists/texts were empty
    await pool.query(
      `
        UPDATE assessment_standard_cards
        SET achieved_text = CASE WHEN TRIM(achieved_text) = '' THEN $1 ELSE achieved_text END,
            merit_text = CASE WHEN TRIM(merit_text) = '' THEN $2 ELSE merit_text END,
            excellence_text = CASE WHEN TRIM(excellence_text) = '' THEN $3 ELSE excellence_text END,
            achieved_checklist = CASE WHEN achieved_checklist = '[]'::jsonb THEN $4::jsonb ELSE achieved_checklist END,
            merit_checklist = CASE WHEN merit_checklist = '[]'::jsonb THEN $5::jsonb ELSE merit_checklist END,
            excellence_checklist = CASE WHEN excellence_checklist = '[]'::jsonb THEN $6::jsonb ELSE excellence_checklist END,
            updated_at = NOW()
        WHERE standard_codes ? $7
      `,
      [
        achievedText,
        meritText,
        excellenceText,
        achievedChecklistJson,
        meritChecklistJson,
        excellenceChecklistJson,
        card.standardNumber
      ]
    );
  }
}

async function ensureActivityHubVisibilitySchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_hub_visibility (
      activity_id TEXT NOT NULL,
      hub_name TEXT NOT NULL,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (activity_id, hub_name)
    );
  `);

  await pool.query(`ALTER TABLE activity_hub_visibility ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE activity_hub_visibility ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function upsertHubVisibility(activityIds, hubName, isVisible) {
  if (!hasDatabase) {
    return 0;
  }

  const ids = Array.isArray(activityIds)
    ? activityIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (!ids.length || !String(hubName || "").trim()) {
    return 0;
  }

  await ensureActivityHubVisibilitySchema();

  let affected = 0;
  for (const activityId of ids) {
    await pool.query(
      `
        INSERT INTO activity_hub_visibility (activity_id, hub_name, is_visible, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (activity_id, hub_name) DO UPDATE SET
          is_visible = EXCLUDED.is_visible,
          updated_at = NOW()
      `,
      [activityId, String(hubName).trim(), Boolean(isVisible)]
    );
    affected += 1;
  }

  return affected;
}

function isExcludedNonDtechActivity(activity) {
  const row = activity && typeof activity === "object" ? activity : {};
  const fields = [
    row.name,
    row.title,
    row.type,
    row.subject_stream,
    row.subject,
    row.description,
    row.summary,
    row.short_description,
    row.topic,
    row.learning_area,
    row.tags,
    row.keywords,
    row.activity_category,
    row.category
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  const combined = `${fields.join(" | ")} | ${JSON.stringify(row || {}).toLowerCase()}`;
  const looksLikeSewingRoomContent = [
    "sewing room",
    "machine sewing",
    "fabric",
    "textile",
    "textiles",
    "garment",
    "pattern making",
    "sampler",
    "felt",
    "felting",
    "fixings",
    "zip",
    "zipper",
    "zips",
    "button",
    "buttons",
    "bow",
    "bows",
    "lacing",
    "fastening",
    "fastenings",
    "needle",
    "stitch"
  ].some((token) => combined.includes(token));

  const explicitSewingStream = ["text", "textiles", "sewing", "fashion"].includes(
    String(row.subject_stream || row.subject || "").trim().toLowerCase()
  );

  return looksLikeSewingRoomContent || explicitSewingStream;
}

function hasAssessmentSignals(activity) {
  const row = activity || {};
  const hasMeaningfulValue = (value) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean).length > 0;
    }

    const text = String(value || "").trim();
    if (!text) return false;
    if (text === "[]" || text === "{}") return false;

    const lowered = text.toLowerCase();
    if (lowered === "null" || lowered === "undefined" || lowered === "none" || lowered === "n/a") {
      return false;
    }

    return true;
  };

  return [
    row.standard_details,
    row.tasks_list,
    row.assessment_focus,
    row.achieved,
    row.merit,
    row.excellence,
    row.submission_requirements,
    row.relevant_implications,
    row.progress_logging,
    row.feedback_trialling
  ].some((value) => hasMeaningfulValue(value));
}

function hasAssessmentPayloadShape(activity) {
  const row = activity || {};
  const keys = [
    "standard_details",
    "tasks_list",
    "assessment_focus",
    "achieved",
    "merit",
    "excellence",
    "submission_requirements",
    "relevant_implications",
    "progress_logging",
    "feedback_trialling"
  ];

  return keys.some((key) => Object.prototype.hasOwnProperty.call(row, key));
}

function isAssessmentCategoryLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("assessment");
}

function isExplicitActivityCategoryLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "activity" || normalized === "skill activity" || normalized === "practice" || normalized === "practice activity";
}

function hasMeaningfulCategorySignalValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).length > 0;
  }

  const text = String(value || "").trim();
  if (!text) return false;
  if (text === "[]" || text === "{}") return false;

  const lowered = text.toLowerCase();
  if (lowered === "null" || lowered === "undefined" || lowered === "none" || lowered === "n/a") return false;

  return true;
}

function hasProjectPayloadShape(row) {
  const candidate = row && typeof row === "object" ? row : {};
  return [
    candidate.start_date,
    candidate.startDate,
    candidate.contact_name,
    candidate.contactName,
    candidate.contact_email,
    candidate.contactEmail,
    candidate.company,
    candidate.address,
    candidate.overview,
    candidate.services,
    candidate.costs,
    candidate.outcomes
  ].some((value) => hasMeaningfulCategorySignalValue(value));
}

function normalizeActivityCategoryForResponse(activity) {
  const row = activity && typeof activity === "object" ? { ...activity } : {};
  const resolvedCategoryText = String(row.activity_category || row.category || "").trim();
  if (resolvedCategoryText && !String(row.activity_category || "").trim()) {
    row.activity_category = resolvedCategoryText;
  }

  const rawCategory = String(row.activity_category || "").trim().toLowerCase();
  const hasProjectShape = hasProjectPayloadShape(row);
  const normalizedTitle = String(row.name || row.title || "").trim().toLowerCase();
  const isKnownLegacyAssessmentTitle = normalizedTitle === "making interview show";
  const assessmentText = [row.name, row.title, row.description, row.summary]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");
  const hasAssessmentTextSignal = /\bassessment\b/.test(assessmentText);

  if (isKnownLegacyAssessmentTitle) {
    row.activity_category = "Assessment Task";
    return row;
  }

  if (rawCategory === "assessment" || rawCategory === "assessment activity") {
    row.activity_category = "Assessment Task";
    return row;
  }

  if ((rawCategory === "activity" || rawCategory === "practice" || rawCategory === "practice activity" || rawCategory === "skill activity") && hasProjectShape && !hasAssessmentSignals(row)) {
    row.activity_category = "Project";
    return row;
  }

  if (rawCategory === "" && (hasAssessmentSignals(row) || hasAssessmentTextSignal)) {
    row.activity_category = "Assessment Task";
    return row;
  }

  if (rawCategory === "" && hasProjectShape) {
    row.activity_category = "Project";
  }

  return row;
}

function getDefaultCardColorForCategory(categoryValue) {
  const category = String(categoryValue || "").trim().toLowerCase();

  if (category.includes("task topic")) return "Azure";
  if (category.includes("standard")) return "Teal";
  if (category.includes("lesson")) return "Rose";
  if (category.includes("assessment")) return "Slate";
  if (category.includes("project")) return "Violet";
  if (category.includes("activity") || category.includes("practice")) return "Amber";

  return "Amber";
}

function filterDtechActivities(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !isExcludedNonDtechActivity(row))
    .map((row) => normalizeActivityCategoryForResponse(row));
}

function filterStudentTaskListActivities(rows) {
  return filterDtechActivities(rows);
}

function normalizeUnitLessons(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const coerceBoolean = (rawValue, defaultValue = false) => {
    if (typeof rawValue === "boolean") {
      return rawValue;
    }

    if (typeof rawValue === "string") {
      const normalized = rawValue.trim().toLowerCase();
      if (["true", "yes", "y", "1", "on"].includes(normalized)) {
        return true;
      }
      if (["false", "no", "n", "0", "off", ""].includes(normalized)) {
        return false;
      }
      return defaultValue;
    }

    if (typeof rawValue === "number") {
      return rawValue !== 0;
    }

    if (rawValue === null || rawValue === undefined) {
      return defaultValue;
    }

    return Boolean(rawValue);
  };

  return value.map((lesson, index) => {
    const lessonIndex = Number.parseInt(lesson?.lesson_index ?? lesson?.lessonIndex ?? index + 1, 10);
    const explicitUnitTopic = String(lesson?.unit_topic ?? lesson?.unitTopic ?? lesson?.lessonUnitTopic ?? "").trim();

    return {
      lesson_index: Number.isInteger(lessonIndex) && lessonIndex > 0 ? lessonIndex : index + 1,
      unit_topic: explicitUnitTopic,
      week_label: String(lesson?.week_label ?? lesson?.weekLabel ?? lesson?.week ?? "").trim(),
      title: String(lesson?.title ?? lesson?.lesson_title ?? lesson?.lessonTitle ?? "").trim(),
      focus: String(lesson?.focus ?? lesson?.lesson_focus ?? lesson?.lessonFocus ?? "").trim(),
      calendar_date: String(lesson?.calendar_date ?? lesson?.calendarDate ?? "").trim(),
      duration_minutes: Number.parseInt(lesson?.duration_minutes ?? lesson?.durationMinutes ?? 1, 10) || 1,
      activity_name: String(lesson?.activity_name ?? lesson?.activityName ?? "").trim(),
      activity_type: String(lesson?.activity_type ?? lesson?.activityType ?? "").trim(),
      card_color: String(lesson?.card_color ?? lesson?.cardColor ?? "").trim(),
      year_level: normalizeYearLevel(lesson?.year_level ?? lesson?.yearLevel ?? lesson?.lessonYearLevel ?? []),
      link_url: String(lesson?.link_url ?? lesson?.linkUrl ?? lesson?.lessonLinkUrl ?? lesson?.resource_link ?? lesson?.resourceLink ?? "").trim(),
      subject_stream: String(lesson?.subject_stream ?? lesson?.subjectStream ?? "").trim().toUpperCase(),
      publish_activity: coerceBoolean(lesson?.publish_activity ?? lesson?.publishActivity, true),
      add_to_calendar: Boolean(lesson?.add_to_calendar ?? lesson?.addToCalendar),
      notes: String(lesson?.notes ?? lesson?.lessonNotes ?? "").trim()
    };
  });
}

function normalizeYearLevel(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  }

  return String(value || "")
    .split(/\s*,\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeTimestamp(value, fallback = new Date()) {
  const fallbackDate = fallback instanceof Date ? fallback : new Date(fallback || Date.now());

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return fallbackDate.toISOString();
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackDate.toISOString();
  }

  return parsed.toISOString();
}

function splitDocxLines(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findLineIndex(lines, matcher) {
  return lines.findIndex((line) => matcher(String(line || "").trim().toLowerCase()));
}

function extractLinesBetween(lines, startIndex, endIndex) {
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    return [];
  }

  const safeEndIndex = Number.isInteger(endIndex) && endIndex > startIndex ? endIndex : lines.length;
  return lines.slice(startIndex, safeEndIndex).map((line) => String(line || "").trim()).filter(Boolean);
}

function sanitizeUnitAims(lines) {
  const sourceLines = Array.isArray(lines)
    ? lines.map((line) => String(line || "").trim()).filter(Boolean)
    : [];

  // Remove leading lines that are clearly section headers or not aims content
  const mainSectionPattern = /^(year\s*groups?|main\s*focus|school\s*values|contexts\s*of\s*learning|local\s*curriculum\s*links|skills|slideshow|reporting|assessment|evaluation)\s*(?:[-:]|$)/i;
  const cleaned = [];
  let foundContent = false;

  for (const rawLine of sourceLines) {
    const line = String(rawLine || "").trim();
    if (!line) {
      continue;
    }

    // Skip lines that are clearly main section headers
    if (mainSectionPattern.test(line)) {
      if (foundContent) {
        // If we already have content, stop at main sections
        break;
      }
      // Otherwise skip this header and continue looking for aims
      continue;
    }

    foundContent = true;
    cleaned.push(line);
  }

  return cleaned;
}

function isLessonHeadingLine(line) {
  const text = String(line || "").trim();
  if (!text) {
    return false;
  }

  return /^\d+(?:\/\d+)?(?:\s+.+)?$/.test(text);
}

function parseLessonRowsFromSlideshow(lines) {
  const lessons = [];
  let currentLesson = null;
  let waitingForTitle = false;
  let currentYearLevel = "";
  let currentUnitTopic = "";
  let waitingForTopicAfterYear = false;
  const urlPattern = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i;
  const activityHeadingPattern = /^(.+?)(?:\s+activities?)?\s*:\s*$/i;
  const yearLevelPattern = /^(juniors?|middle(?:\/seniors?)?|seniors?|year\s*\d+(?:\s*(?:\/|and|&)\s*\d+)?)\b/i;
  const likelyLessonObjectivePattern = /^l\d+\s*[-:]|^\d+\s*[-:]/i;
  const blockedTopicLabelPattern = /^(school\s*values?|level\s*\d+|year\s*\d+|technology\s*strand|whanaungatanga|manaakitanga|rangatiratanga|kotahitanga|kaitiakitanga|\d+|\d+\s*\/\s*\d+)$/i;
  const standaloneTopicPattern = /(\bblock\s+programming\b|\btutorial\s+programming\b|\bproject\s+programming\b|^binary\b|^assessment\b|\bbreadboard\b|\bmicro(?:\s*::?\s*|\s*:\s*|\s+)?bit\b|\bmicrobit\b|\bsolder(?:ing)?\b|\bpcb\b|\bprinted\s*circuit\s*boards?\b|\barduino\b)/i;

  const looksLikeUnitTopicLabel = (value) => {
    const text = String(value || "").trim();
    if (!text) return false;
    if (likelyLessonObjectivePattern.test(text)) return false;
    if (blockedTopicLabelPattern.test(text)) return false;
    if (/^\d+(?:\s*\/\s*\d+)?$/.test(text)) return false;
    if (/[.;!?]$/.test(text) || text.includes(". ")) return false;
    if (text.length > 70) return false;
    return true;
  };

  const formatContextUnitTopic = () => {
    const year = String(currentYearLevel || "").trim();
    const topic = String(currentUnitTopic || "").trim();
    if (!topic) {
      return "";
    }
    return year ? `${year} | ${topic}` : topic;
  };

  const flushLesson = () => {
    if (!currentLesson) {
      return;
    }

    const lessonTitle = String(currentLesson.lessonTitle || currentLesson.title || "").trim();
    const lessonFocus = currentLesson.notes.join(" ").trim();

    if (lessonTitle || lessonFocus) {
      const detectedUrl = String(currentLesson.link_url || "").trim();
      lessons.push({
        lesson_index: lessons.length + 1,
        title: lessonTitle || `Lesson ${lessons.length + 1}`,
        focus: lessonFocus,
        notes: lessonFocus,
        duration_minutes: 1,
        activity_name: lessonTitle || `Lesson ${lessons.length + 1}`,
        year_level: String(currentLesson.year_level || currentYearLevel || "").trim(),
        unit_topic: formatContextUnitTopic(),
        link_url: detectedUrl,
        publish_activity: true,
        add_to_calendar: false
      });
    }

    currentLesson = null;
    waitingForTitle = false;
  };

  lines.forEach((line) => {
    const text = String(line || "").trim();
    if (!text) {
      return;
    }

    if (/^reporting\s*&\s*assessment\s*link$/i.test(text) || /^unit evaluation$/i.test(text)) {
      flushLesson();
      return;
    }

    if (yearLevelPattern.test(text)) {
      flushLesson();
      currentYearLevel = text;
      waitingForTopicAfterYear = true;
      return;
    }

    const activityHeadingMatch = text.match(activityHeadingPattern);
    if (activityHeadingMatch) {
      flushLesson();
      currentUnitTopic = String(activityHeadingMatch[1] || "").replace(/:\s*$/, "").trim();
      waitingForTopicAfterYear = false;
      return;
    }

    if (!currentLesson && looksLikeUnitTopicLabel(text) && standaloneTopicPattern.test(text)) {
      flushLesson();
      currentUnitTopic = String(text || "").replace(/:\s*$/, "").trim();
      waitingForTopicAfterYear = false;
      return;
    }

    if (waitingForTopicAfterYear && blockedTopicLabelPattern.test(text)) {
      waitingForTopicAfterYear = false;
      return;
    }

    if (waitingForTopicAfterYear && looksLikeUnitTopicLabel(text)) {
      currentUnitTopic = text;
      waitingForTopicAfterYear = false;
      return;
    }

    if (/^slideshow$/i.test(text)) {
      return;
    }

    const headingMatch = text.match(/^(\d+(?:\/\d+)?)(?:\s+(.*))?$/);
    if (headingMatch) {
      flushLesson();
      currentLesson = {
        title: String(headingMatch[2] || "").trim(),
        notes: []
      };
      waitingForTitle = !headingMatch[2];
      return;
    }

    if (!currentLesson) {
      return;
    }

    if (waitingForTitle) {
      currentLesson.title = text;
      waitingForTitle = false;
      return;
    }

    if (!currentLesson.title && text.length <= 40 && !/[.!?]$/.test(text)) {
      currentLesson.title = text;
      return;
    }

    if (!currentLesson.link_url) {
      const urlMatch = text.match(urlPattern);
      if (urlMatch) {
        const rawUrl = String(urlMatch[1] || "").trim();
        currentLesson.link_url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
      }
    }

    currentLesson.notes.push(text);
  });

  flushLesson();
  return lessons;
}

function extractOrderedUnitTopicsFromSlideshow(lines) {
  const topics = [];
  const seen = new Set();
  let currentYearLevel = "";
  let waitingForTopicAfterYear = false;

  const yearLevelPattern = /^(juniors?|middle(?:\/seniors?)?|seniors?|year\s*\d+(?:\s*(?:\/|and|&)\s*\d+)?)\b/i;
  const activityHeadingPattern = /^(.+?)(?:\s+activities?)?\s*:\s*$/i;
  const ignoredHeadingPattern = /^(slideshow|reporting\s*&\s*assessment\s*link|unit\s*evaluation|assessment\s*link)$/i;
  const likelyLessonObjectivePattern = /^l\d+\s*[-:]|^\d+\s*[-:]/i;
  const blockedTopicLabelPattern = /^(school\s*values?|level\s*\d+|year\s*\d+|technology\s*strand|whanaungatanga|manaakitanga|rangatiratanga|kotahitanga|kaitiakitanga|\d+|\d+\s*\/\s*\d+)$/i;
  const standaloneTopicPattern = /(\bblock\s+programming\b|\btutorial\s+programming\b|\bproject\s+programming\b|^binary\b|^assessment\b|\bbreadboard\b|\bmicro(?:\s*::?\s*|\s*:\s*|\s+)?bit\b|\bmicrobit\b|\bsolder(?:ing)?\b|\bpcb\b|\bprinted\s*circuit\s*boards?\b|\barduino\b)/i;

  const looksLikeUnitTopicLabel = (value) => {
    const text = String(value || "").trim();
    if (!text) return false;
    if (ignoredHeadingPattern.test(text)) return false;
    if (yearLevelPattern.test(text)) return false;
    if (likelyLessonObjectivePattern.test(text)) return false;
    if (blockedTopicLabelPattern.test(text)) return false;
    if (/^\d+(?:\s*\/\s*\d+)?$/.test(text)) return false;
    if (/[.;!?]$/.test(text) || text.includes(". ")) return false;
    if (text.length > 70) return false;
    return true;
  };

  const canonicalizeYearLevel = (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "";
    if (/\bjunior/.test(text)) return "juniors";
    if (/\bmiddle/.test(text)) return "middle";
    if (/\bsenior/.test(text)) return "senior";
    const yearMatch = text.match(/year\s*(\d{1,2})/);
    if (yearMatch?.[1]) return `year${yearMatch[1]}`;
    return text.replace(/[^a-z0-9]+/g, " ").trim();
  };

  const canonicalizeTopicName = (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "";
    if (/\bpcb\b/.test(text) || /printed\s*circuit\s*boards?/.test(text)) return "pcb";
    if (/micro\s*:?\s*:?-?\s*bit/.test(text) || /microbit/.test(text)) return "microbit";
    if (/^ardunio$/.test(text) || /^arduino$/.test(text)) return "arduino";
    return text.replace(/[^a-z0-9]+/g, " ").trim();
  };

  const addTopic = (topicValue) => {
    const topic = String(topicValue || "").trim();
    if (!topic) {
      return;
    }

    const label = currentYearLevel ? `${currentYearLevel} | ${topic}` : topic;
    const key = `${canonicalizeYearLevel(currentYearLevel)}|${canonicalizeTopicName(topic)}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    topics.push(label);
  };

  (Array.isArray(lines) ? lines : []).forEach((line) => {
    const text = String(line || "").trim();
    if (!text) {
      return;
    }

    if (yearLevelPattern.test(text)) {
      currentYearLevel = text;
      waitingForTopicAfterYear = true;
      return;
    }

    if (ignoredHeadingPattern.test(text)) {
      waitingForTopicAfterYear = false;
      return;
    }

    const activityMatch = text.match(activityHeadingPattern);
    if (activityMatch) {
      const topic = String(activityMatch[1] || "").replace(/:\s*$/, "").trim();
      addTopic(topic);
      waitingForTopicAfterYear = false;
      return;
    }

    if (looksLikeUnitTopicLabel(text) && standaloneTopicPattern.test(text)) {
      addTopic(String(text || "").replace(/:\s*$/, "").trim());
      waitingForTopicAfterYear = false;
      return;
    }

    if (waitingForTopicAfterYear && blockedTopicLabelPattern.test(text)) {
      waitingForTopicAfterYear = false;
      return;
    }

    if (waitingForTopicAfterYear && looksLikeUnitTopicLabel(text)) {
      addTopic(text);
      waitingForTopicAfterYear = false;
      return;
    }
  });

  return topics;
}

function detectSubjectStreamFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (lower.includes("dtech") || lower.includes("digital technology")) return "DTECH";
  if (lower.includes("computing") || lower.includes("python") || lower.includes("programming") || lower.includes("computer")) return "COMP";
  if (lower.includes("textile") || lower.includes("sewing")) return "TEXT";
  return "";
}

function parseUnitPlanFromDocxText(rawText, originalName = "") {
  const lines = splitDocxLines(rawText);
  const lineHas = (line, text) => String(line || "").toLowerCase().includes(String(text || "").toLowerCase());
  const isAimsHeading = (line) => {
    const value = String(line || "").trim().toLowerCase();
    return (
      value === "aims" ||
      value === "aims:" ||
      value === "aim(s)" ||
      value === "aim(s):" ||
      value.startsWith("aims of unit") ||
      value.startsWith("aim(s) of unit") ||
      value.startsWith("aim(s) of unit:") ||
      value.startsWith("aim(s) of unit")
    );
  };
  const isAimsStopHeading = (line) => {
    const value = String(line || "").trim().toLowerCase();
    return (
      value.startsWith("year groups") ||
      value.startsWith("year group") ||
      value.startsWith("main focus") ||
      value.startsWith("school values") ||
      lineHas(value, "contexts of learning") ||
      lineHas(value, "local curriculum links") ||
      lineHas(value, "maturanga maori") ||
      lineHas(value, "matauranga maori") ||
      value.startsWith("skills") ||
      value.startsWith("health & safety") ||
      value.startsWith("health and safety") ||
      value.startsWith("safety issues") ||
      value.startsWith("slideshow") ||
      value.startsWith("reporting & assessment link") ||
      value.startsWith("unit evaluation")
    );
  };
  const findNextSectionIndex = (startIndex, matchers = []) => {
    if (!Number.isInteger(startIndex) || startIndex < 0) {
      return -1;
    }

    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const candidate = String(lines[index] || "").trim().toLowerCase();
      if (!candidate) {
        continue;
      }

      if (matchers.some((matcher) => matcher(candidate))) {
        return index;
      }
    }

    return -1;
  };

  const normalizedName = String(originalName || "").replace(/\.docx$/i, "").trim();
  const unitPlanHeadingIndex = findLineIndex(lines, (line) => line.includes("unit plan"));
  const topicIndex = (() => {
    if (unitPlanHeadingIndex < 0) {
      return lines.findIndex((line) => line.length > 0);
    }

    for (let index = unitPlanHeadingIndex + 1; index < Math.min(lines.length, unitPlanHeadingIndex + 8); index += 1) {
      const candidate = lines[index];
      const lower = candidate.toLowerCase();
      if (!candidate || lower.includes("westland high school") || lower.includes("digital technology") || lower.includes("unit plan")) {
        continue;
      }
      return index;
    }

    return -1;
  })();

  const topic = topicIndex >= 0 ? lines[topicIndex] : normalizedName || "Imported Unit Plan";
  const yearLevelLine = lines.find((line) => /year\s*\d|junior|middle|senior/i.test(line) || /main focus:/i.test(line)) || "";
  const yearLevel = (() => {
    const match = yearLevelLine.match(/main focus:\s*(.*)$/i) || yearLevelLine.match(/year\s*groups?:\s*(.*)$/i);
    if (match && String(match[1] || "").trim()) {
      return String(match[1] || "").trim();
    }
    return yearLevelLine || "";
  })();

  const aimIndex = findLineIndex(lines, isAimsHeading);
  const yearGroupsIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("year groups"));
  const schoolValuesIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("school values"));
  const contextsIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("contexts of learning"));
  const localCurriculumIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("local curriculum links"));
  const slideshowIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("slideshow"));
  const reportingIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("reporting & assessment link"));
  const evaluationIndex = findLineIndex(lines, (line) => line.toLowerCase().startsWith("unit evaluation"));

  const aimsEndIndex = (() => {
    if (aimIndex < 0) {
      return -1;
    }

    // Find the next main section header after aims
    const nextSectionIndex = Math.min(
      ...[yearGroupsIndex, schoolValuesIndex, contextsIndex, localCurriculumIndex, slideshowIndex, reportingIndex, evaluationIndex]
        .filter((idx) => idx > aimIndex)
    );

    return Number.isFinite(nextSectionIndex) ? nextSectionIndex : lines.length;
  })();

  const extractedAims = aimIndex >= 0 ? extractLinesBetween(lines, aimIndex + 1, aimsEndIndex) : [];
  const unitAims = sanitizeUnitAims(extractedAims);
  const unitValues = extractLinesBetween(lines, schoolValuesIndex + 1, contextsIndex);
  const contexts = extractLinesBetween(lines, contextsIndex + 1, localCurriculumIndex);
  const curriculumLinks = extractLinesBetween(lines, localCurriculumIndex + 1, slideshowIndex);
  const overviewEndIndex = aimIndex > topicIndex ? aimIndex : yearGroupsIndex;
  const overview = extractLinesBetween(lines, topicIndex + 1, overviewEndIndex).slice(0, 5).join(" ");
  const assessmentLink = extractLinesBetween(lines, reportingIndex + 1, evaluationIndex).slice(0, 4).join(" ");
  const notes = extractLinesBetween(lines, evaluationIndex + 1, lines.length).join(" ");
  const lessonLines = extractLinesBetween(lines, slideshowIndex + 1, reportingIndex);
  const lessons = normalizeUnitLessons(parseLessonRowsFromSlideshow(lessonLines));
  const orderedTopicsFromTable = extractOrderedUnitTopicsFromSlideshow(lessonLines);
  const topicsFromLessons = Array.from(new Set(
    lessons
      .map((lesson) => String(lesson?.unit_topic || "").trim())
      .filter(Boolean)
  ));
  const unitTopics = (() => {
    const ordered = Array.isArray(orderedTopicsFromTable) ? orderedTopicsFromTable : [];
    const fromLessons = Array.isArray(topicsFromLessons) ? topicsFromLessons : [];
    const source = ordered.length ? [...ordered, ...fromLessons] : fromLessons;
    const seen = new Set();
    const result = [];

    source.forEach((topic) => {
      const label = String(topic || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(label);
    });

    return result;
  })();

  return {
    title: topic,
    topic,
    strand: "",
    year_level: yearLevel || "Middle",
    term: "",
    subject_stream: detectSubjectStreamFromText(rawText),
    duration_weeks: Math.max(1, lessons.length ? Math.ceil(lessons.length / 5) : 1),
    overview,
    unit_topics: unitTopics,
    unit_aims: unitAims,
    unit_values: unitValues,
    contexts,
    curriculum_links: curriculumLinks,
    assessment_link: assessmentLink,
    notes,
    lessons
  };
}

function buildUnitPlanPayload(body, userEmail) {
  const title = String(body?.title || body?.unit_title || "").trim();
  const topic = String(body?.topic || body?.unit_topic || "").trim();
  const yearLevel = normalizeYearLevel(body?.year_level ?? body?.yearLevel);
  const fallbackIdSource = title || topic || `unit-plan-${Date.now()}`;
  const id = String(body?.id || slugify(fallbackIdSource)).trim();

  return {
    id,
    title,
    topic,
    strand: String(body?.strand || "").trim(),
    year_level: yearLevel,
    term: String(body?.term || "").trim(),
    subject_stream: String(body?.subject_stream || body?.subjectStream || "").trim().toUpperCase(),
    duration_weeks: Number.parseInt(body?.duration_weeks ?? body?.durationWeeks, 10) || 1,
    overview: String(body?.overview || "").trim(),
    unit_topics: normalizeArray(body?.unit_topics ?? body?.unitTopics),
    unit_aims: normalizeArray(body?.unit_aims ?? body?.unitAims),
    unit_values: normalizeArray(body?.unit_values ?? body?.unitValues),
    contexts: normalizeArray(body?.contexts ?? body?.unitContexts),
    curriculum_links: normalizeArray(body?.curriculum_links ?? body?.curriculumLinks),
    assessment_link: String(body?.assessment_link || body?.assessmentLink || "").trim(),
    notes: String(body?.notes || body?.unitNotes || "").trim(),
    lessons: normalizeUnitLessons(body?.lessons),
    created_by_email: userEmail,
    created_at: normalizeTimestamp(body?.created_at),
    updated_at: normalizeTimestamp(new Date())
  };
}

async function saveUnitPlanPayload(payload) {
  if (!hasDatabase) {
    memoryUnitPlans.set(payload.id, payload);
    return payload;
  }

  await ensureUnitPlanSchema();
  const createdAt = normalizeTimestamp(payload.created_at);
  const updatedAt = normalizeTimestamp(payload.updated_at);
  const result = await pool.query(
    `
      INSERT INTO unit_plans (
        id, title, topic, strand, year_level, term, subject_stream, duration_weeks, overview, unit_topics, unit_aims, unit_values, contexts, curriculum_links, assessment_link, notes, lessons, created_by_email, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17::jsonb, $18, $19::timestamptz, $20::timestamptz
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        topic = EXCLUDED.topic,
        strand = EXCLUDED.strand,
        year_level = EXCLUDED.year_level,
        term = EXCLUDED.term,
        subject_stream = EXCLUDED.subject_stream,
        duration_weeks = EXCLUDED.duration_weeks,
        overview = EXCLUDED.overview,
        unit_topics = EXCLUDED.unit_topics,
        unit_aims = EXCLUDED.unit_aims,
        unit_values = EXCLUDED.unit_values,
        contexts = EXCLUDED.contexts,
        curriculum_links = EXCLUDED.curriculum_links,
        assessment_link = EXCLUDED.assessment_link,
        notes = EXCLUDED.notes,
        lessons = EXCLUDED.lessons,
        created_by_email = EXCLUDED.created_by_email,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `,
    [
      payload.id,
      payload.title,
      payload.topic,
      payload.strand || null,
      payload.year_level,
      payload.term || null,
      payload.subject_stream || null,
      payload.duration_weeks,
      payload.overview || null,
      JSON.stringify(payload.unit_topics || []),
      JSON.stringify(payload.unit_aims || []),
      JSON.stringify(payload.unit_values || []),
      JSON.stringify(payload.contexts || []),
      JSON.stringify(payload.curriculum_links || []),
      payload.assessment_link || null,
      payload.notes || null,
      JSON.stringify(payload.lessons || []),
      payload.created_by_email,
      createdAt,
      updatedAt
    ]
  );

  return result.rows[0];
}

function getUnitPlanLessonCardId(unitPlanId, lessonIndex) {
  const safePlanId = slugify(unitPlanId || "unit-plan");
  return `unitplan-${safePlanId}-lesson-${lessonIndex}`;
}

function buildLessonCardFromUnitLesson(unitPlan, lesson, fallbackIndex = 1) {
  const lessonIndex = Number.parseInt(lesson?.lesson_index ?? fallbackIndex, 10);
  const safeLessonIndex = Number.isInteger(lessonIndex) && lessonIndex > 0 ? lessonIndex : fallbackIndex;
  const lessonTitle = String(lesson?.title || lesson?.activity_name || `Lesson ${safeLessonIndex}`).trim() || `Lesson ${safeLessonIndex}`;
  const lessonFocus = String(lesson?.focus || lesson?.notes || "").trim() || `Lesson ${safeLessonIndex} from ${String(unitPlan?.title || "Unit Plan").trim()}`;
  const explicitPublish = lesson?.publish_activity ?? lesson?.publishActivity;
  const publishActivity =
    typeof explicitPublish === "boolean"
      ? explicitPublish
      : ["false", "no", "0", "off"].includes(String(explicitPublish || "").trim().toLowerCase())
        ? false
        : true;

  return {
    id: getUnitPlanLessonCardId(unitPlan?.id, safeLessonIndex),
    lesson_title: lessonTitle,
    lesson_week: String(lesson?.week_label || "").trim(),
    lesson_date: String(lesson?.calendar_date || "").trim(),
    lesson_duration_minutes: Number.parseInt(lesson?.duration_minutes ?? 1, 10) || 1,
    lesson_type: String(lesson?.activity_type || unitPlan?.topic || "Lesson").trim() || "Lesson",
    lesson_card_color: String(lesson?.card_color || "Rose").trim() || "Rose",
    activity_name: String(lesson?.activity_name || lessonTitle).trim() || lessonTitle,
    lesson_year_level: String(lesson?.year_level || unitPlan?.year_level || "").trim(),
    lesson_link_url: String(lesson?.link_url || "").trim(),
    lesson_focus: lessonFocus,
    lesson_notes: String(lesson?.notes || lessonFocus).trim(),
    publish_activity: publishActivity,
    add_to_calendar: Boolean(lesson?.add_to_calendar),
    created_by_email: String(unitPlan?.created_by_email || "").trim(),
    created_at: normalizeTimestamp(unitPlan?.created_at),
    updated_at: normalizeTimestamp(new Date())
  };
}

function getUnitPlanLessonCardFingerprint(card) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return [
    normalize(card?.lesson_title),
    normalize(card?.lesson_type),
    normalize(card?.lesson_year_level),
    normalize(card?.lesson_focus)
  ].join("|");
}

async function syncUnitPlanLessonsToLibrary(unitPlan) {
  const unitPlanId = String(unitPlan?.id || "").trim();
  if (!unitPlanId) {
    return 0;
  }

  const lessons = normalizeUnitLessons(unitPlan?.lessons);
  const cardPrefix = `unitplan-${slugify(unitPlanId)}-lesson-`;
  let syncedCount = 0;

  if (!hasDatabase) {
    Array.from(memoryLessons.keys())
      .filter((lessonId) => String(lessonId || "").startsWith(cardPrefix))
      .forEach((lessonId) => {
        memoryLessons.delete(lessonId);
      });

    for (let index = 0; index < lessons.length; index += 1) {
      const lesson = lessons[index];
      const card = buildLessonCardFromUnitLesson(unitPlan, lesson, index + 1);
      const fingerprint = getUnitPlanLessonCardFingerprint(card);
      const duplicateExists = Array.from(memoryLessons.values()).some((existing) => (
        String(existing?.id || "").startsWith("unitplan-") &&
        String(existing?.id || "") !== card.id &&
        getUnitPlanLessonCardFingerprint(existing) === fingerprint
      ));

      if (duplicateExists) {
        continue;
      }

      memoryLessons.set(card.id, card);
      syncedCount += 1;
    }

    return syncedCount;
  }

  await pool.query(`DELETE FROM ${lessonTable} WHERE id LIKE $1`, [`${cardPrefix}%`]);

  for (let index = 0; index < lessons.length; index += 1) {
    const lesson = lessons[index];
    const card = buildLessonCardFromUnitLesson(unitPlan, lesson, index + 1);

    const duplicateResult = await pool.query(
      `SELECT id FROM ${lessonTable}
       WHERE id LIKE 'unitplan-%'
         AND id <> $1
         AND lower(trim(COALESCE(lesson_title, ''))) = lower(trim($2))
         AND lower(trim(COALESCE(lesson_type, ''))) = lower(trim($3))
         AND lower(trim(COALESCE(lesson_year_level, ''))) = lower(trim($4))
         AND lower(trim(COALESCE(lesson_focus, ''))) = lower(trim($5))
       LIMIT 1`,
      [card.id, card.lesson_title, card.lesson_type, card.lesson_year_level, card.lesson_focus]
    );

    if (duplicateResult.rowCount) {
      continue;
    }

    await pool.query(
      `INSERT INTO ${lessonTable}
      (id, lesson_title, lesson_week, lesson_date, lesson_duration_minutes, lesson_type, lesson_card_color,
        activity_name, lesson_year_level, lesson_link_url, lesson_focus, lesson_notes, publish_activity,
        add_to_calendar, created_by_email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT(id) DO UPDATE SET
       lesson_title = EXCLUDED.lesson_title,
       lesson_week = EXCLUDED.lesson_week,
       lesson_date = EXCLUDED.lesson_date,
       lesson_duration_minutes = EXCLUDED.lesson_duration_minutes,
       lesson_type = EXCLUDED.lesson_type,
       lesson_card_color = EXCLUDED.lesson_card_color,
       activity_name = EXCLUDED.activity_name,
       lesson_year_level = EXCLUDED.lesson_year_level,
       lesson_link_url = EXCLUDED.lesson_link_url,
       lesson_focus = EXCLUDED.lesson_focus,
       lesson_notes = EXCLUDED.lesson_notes,
       publish_activity = EXCLUDED.publish_activity,
       add_to_calendar = EXCLUDED.add_to_calendar,
       updated_at = EXCLUDED.updated_at`,
      [
        card.id,
        card.lesson_title,
        card.lesson_week,
        card.lesson_date,
        card.lesson_duration_minutes,
        card.lesson_type,
        card.lesson_card_color,
        card.activity_name,
        card.lesson_year_level,
        card.lesson_link_url,
        card.lesson_focus,
        card.lesson_notes,
        card.publish_activity,
        card.add_to_calendar,
        card.created_by_email,
        card.created_at,
        card.updated_at
      ]
    );

    syncedCount += 1;
  }

  return syncedCount;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function normalizeHtmlCellText(html) {
  const withLineBreaks = String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?\s*(p|div|li|ul|ol)\b[^>]*>/gi, "\n");

  const plain = withLineBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(plain)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHtmlCellLines(html) {
  const withLineBreaks = String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?\s*(p|div|li|ul|ol)\b[^>]*>/gi, "\n");

  const plain = withLineBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(plain)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isLikelyYearLabel(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^(juniors?|middle(?:\/seniors?)?|seniors?|year\s*\d+)/i.test(text);
}

function isLikelyValidTopicText(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) return false;
  if (text.length > 90) return false;
  if (/^(school\s*values?|technology\s*strand|level\s*\d+|\d+|\d+\s*\/\s*\d+)$/i.test(lower)) return false;
  if (/^(assessment\s*instructions?|assessment\s*schedule|assessment\s*clarity|assessment\s*due|assessment\s*time)$/i.test(lower)) return false;
  return true;
}

function extractUnitTopicsFromDocxHtml(html) {
  const source = String(html || "");
  if (!source) {
    return [];
  }

  const tableMatches = source.match(/<table[\s\S]*?<\/table>/gi) || [];

  const evaluateTable = (tableHtml) => {
    const lowerTable = String(tableHtml || "").toLowerCase();
    if (!tableHtml) {
      return { score: -1, topics: [] };
    }

    // Explicitly avoid slideshow/reporting/evaluation tables, which contain lesson flow not unit topic map.
    if (/slideshow|reporting\s*&\s*assessment|unit\s*evaluation/.test(lowerTable)) {
      return { score: -1, topics: [] };
    }

    const topics = [];
    const seen = new Set();
    let lastYear = "";
    let validTopicRows = 0;
    let yearTopicRows = 0;

    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    rowMatches.forEach((rowHtml) => {
      const cellMatches = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      const cells = cellMatches
        .map((cellHtml) => normalizeHtmlCellText(cellHtml))
        .filter(Boolean);

      if (cells.length < 2) {
        return;
      }

      const first = cells[0] || "";
      const second = cells[1] || "";
      const rowText = cells.join(" | ").toLowerCase();

      if (/unit\s*topics?|lessons?|learning\s*experience|intentions?/.test(rowText)) {
        return;
      }

      let year = "";
      let topic = "";

      if (isLikelyYearLabel(first)) {
        year = first;
        topic = second;
        lastYear = year;
        yearTopicRows += 1;
      } else if (isLikelyYearLabel(second) && cells.length >= 3) {
        year = second;
        topic = cells[2] || "";
        lastYear = year;
        yearTopicRows += 1;
      } else {
        year = lastYear;
        topic = second || first;
      }

      if (!isLikelyValidTopicText(topic)) {
        return;
      }

      const label = year ? `${year} | ${topic}` : topic;
      const key = label.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      topics.push(label);
      validTopicRows += 1;
    });

    const hasUnitHeadingHint = /unit\s*topics?/.test(lowerTable) ? 4 : 0;
    const score = validTopicRows + (yearTopicRows * 2) + hasUnitHeadingHint;
    return { score, topics };
  };

  let best = { score: -1, topics: [] };
  tableMatches.forEach((tableHtml) => {
    const candidate = evaluateTable(tableHtml);
    if (candidate.score > best.score && candidate.topics.length) {
      best = candidate;
    }
  });

  return best.topics;
}

function extractLessonsFromDocxHtml(html) {
  const source = String(html || "");
  if (!source) {
    return [];
  }

  const tableMatches = source.match(/<table[\s\S]*?<\/table>/gi) || [];
  const lessonTable = tableMatches.find((tableHtml) => /slideshow/i.test(tableHtml) && /slides?/i.test(tableHtml)) || "";
  if (!lessonTable) {
    return [];
  }

  const lessons = [];
  const seen = new Set();
  let currentYear = "";
  let sequence = 1;

  const rowMatches = lessonTable.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  rowMatches.forEach((rowHtml) => {
    const cellMatches = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    if (cellMatches.length < 2) {
      return;
    }

    const col1Lines = normalizeHtmlCellLines(cellMatches[0]);
    const col2Lines = normalizeHtmlCellLines(cellMatches[1]);
    const col3Lines = cellMatches[2] ? normalizeHtmlCellLines(cellMatches[2]) : [];

    const col1Text = col1Lines.join(" ").trim();
    const col2Text = col2Lines.join(" ").trim();
    const rowText = `${col1Text} | ${col2Text} | ${col3Lines.join(" ")}`.toLowerCase();

    if (!col2Lines.length) {
      return;
    }

    if (/main\s*lesson\s*resource|lesson\s*topic|lesson\s*objectives|activity\s*details|slideshow/.test(rowText)) {
      return;
    }

    if (isLikelyYearLabel(col1Text)) {
      currentYear = col1Text;
    }

    const title = String(col2Lines[0] || "").replace(/:\s*$/, "").trim();
    if (!title) {
      return;
    }

    const notesLines = [...col2Lines.slice(1), ...col3Lines].filter(Boolean);
    const focus = notesLines.join(" ").trim();
    const yearLevel = currentYear || col1Text;
    const unitTopic = yearLevel ? `${yearLevel} | ${title}` : title;

    const dedupeKey = `${title.toLowerCase()}|${(yearLevel || "").toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);

    lessons.push({
      lesson_index: sequence,
      title,
      focus,
      notes: focus,
      duration_minutes: 1,
      activity_name: title,
      year_level: yearLevel,
      unit_topic: unitTopic,
      publish_activity: true,
      add_to_calendar: false
    });
    sequence += 1;
  });

  return lessons;
}

function mergeLessonsPreferComplete(primaryLessons, secondaryLessons) {
  const merged = [];
  const seen = new Set();
  const pushUnique = (lesson) => {
    const title = String(lesson?.title || lesson?.lessonTitle || lesson?.activity_name || "").trim();
    const year = String(lesson?.year_level || lesson?.lessonYearLevel || "").trim();
    if (!title) {
      return;
    }
    const key = `${title.toLowerCase()}|${year.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(lesson);
  };

  (Array.isArray(primaryLessons) ? primaryLessons : []).forEach(pushUnique);
  (Array.isArray(secondaryLessons) ? secondaryLessons : []).forEach(pushUnique);

  return normalizeUnitLessons(merged);
}

async function parseDocxBufferToUnitPlanPayload(buffer, originalName, userEmail) {
  const [rawExtraction, htmlExtraction] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer })
  ]);

  const parsed = parseUnitPlanFromDocxText(rawExtraction.value || "", originalName || "");
  const payload = buildUnitPlanPayload(parsed, userEmail);
  const htmlTopics = extractUnitTopicsFromDocxHtml(htmlExtraction?.value || "");
  const htmlLessons = extractLessonsFromDocxHtml(htmlExtraction?.value || "");

  if (htmlTopics.length) {
    payload.unit_topics = htmlTopics;
  }

  if (htmlLessons.length) {
    payload.lessons = mergeLessonsPreferComplete(htmlLessons, payload.lessons || []);
  }

  if (!payload.title || !payload.topic || !payload.year_level) {
    throw new Error("Could not detect unit title, topic, or year level from document");
  }

  return payload;
}

function normalizePdfWhitespace(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function extractStandardRowsFromCourseOutlineText(text) {
  const source = normalizePdfWhitespace(text);
  if (!source) {
    return [];
  }

  const standards = [];
  const seen = new Set();
  const matches = Array.from(source.matchAll(/\b(9\d{4})\s+([\s\S]*?)(?=\n\s*\d+\s+\d+\s+\d+\s+\d+\s+|\n\s*9\d{4}\b|$)/g));

  matches.forEach((match) => {
    const standardNumber = String(match?.[1] || "").trim();
    let titleBlock = String(match?.[2] || "")
      .replace(/\s+/g, " ")
      .replace(/\s+-\s+/g, " - ")
      .trim();

    if (!standardNumber || !titleBlock) {
      return;
    }

    if (seen.has(standardNumber)) {
      return;
    }

    const titleStart = titleBlock.search(/(Digital Technologies|Computing|Hangarau Matihiko|Technology)/i);
    if (titleStart > 0) {
      titleBlock = titleBlock.slice(titleStart).trim();
    }

    const trailingNoiseIndex = titleBlock.search(/\b(Practical Demonstration|Opportunity|Topic Start|Assessment Date|External:)\b/i);
    if (trailingNoiseIndex > 0) {
      titleBlock = titleBlock.slice(0, trailingNoiseIndex).trim();
    }

    if (!titleBlock) {
      return;
    }

    const snippet = source.slice(match.index, Math.min(source.length, match.index + 500));
    const metricsMatch = snippet.match(/\n\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/);
    const version = Number.parseInt(metricsMatch?.[1], 10);
    const level = Number.parseInt(metricsMatch?.[2], 10);
    const credits = Number.parseInt(metricsMatch?.[3], 10);

    standards.push({
      standardNumber,
      title: titleBlock,
      version: Number.isInteger(version) ? version : null,
      level: Number.isInteger(level) ? level : null,
      credits: Number.isInteger(credits) ? credits : null,
      standardLabel: [
        standardNumber,
        titleBlock,
        Number.isInteger(level) ? `L${level}` : "",
        Number.isInteger(credits) ? `${credits} credits` : ""
      ].filter(Boolean).join(" | ")
    });

    seen.add(standardNumber);
  });

  return standards;
}

function parseCourseOutlineFromPdfText(text, sourceName = "") {
  const source = normalizePdfWhitespace(text);
  const nowYear = new Date().getFullYear();

  const courseLineMatch = source.match(/^(Level\s+\d+[^\n]+)/im);
  const extractedCourseName = String(courseLineMatch?.[1] || "").replace(/\s+/g, " ").trim();

  const sourceBaseName = String(sourceName || "").replace(/\.pdf$/i, "").trim();
  const baseCourseName = sourceBaseName.replace(/\s*-\s*assessment\s+statement\s*\d{4}?/i, "").trim();
  const courseName = extractedCourseName || baseCourseName || "";

  const yearMatch = source.match(/\bYear\s*:?\s*(\d{1,2})\b/i);
  const yearLevel = yearMatch ? `Year ${yearMatch[1]}` : "";

  const yearVersionMatch = source.match(/\b(20\d{2})\b/);
  const yearVersion = Number.parseInt(yearVersionMatch?.[1], 10) || nowYear;

  const summaryMatch = source.match(/(This Level[\s\S]{80,}?)(?=\n\s*Course is endorsable|\n\s*Teacher\b|\n\s*Signature\b)/i);
  const summary = String(summaryMatch?.[1] || "")
    .replace(/\s+/g, " ")
    .replace(/\s*Course is endorsable[\s\S]*$/i, "")
    .trim();

  const subjectStream = /\bDigital Technolog/i.test(source) ? "DTECH" : "";
  const standards = extractStandardRowsFromCourseOutlineText(source);

  return {
    courseName,
    yearLevel,
    yearVersion,
    subjectStream,
    summary,
    standards,
    source: String(sourceName || "").trim()
  };
}

app.post("/api/course-outlines/parse-pdf", requireActivityWriteAccess, courseOutlinePdfUpload.single("courseOutlineFile"), async (req, res) => {
  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "A .pdf file is required." });
    return;
  }

  try {
    if (!PDFParse) {
      res.status(503).json({ error: "PDF import is temporarily unavailable because pdf-parse is not installed on the server." });
      return;
    }

    const parser = new PDFParse({
      data: file.buffer,
      verbosity: 0
    });
    const extraction = await parser.getText();
    const parsed = parseCourseOutlineFromPdfText(extraction?.text || "", file.originalname || "");

    res.json({
      ok: true,
      source: file.originalname,
      parsed,
      standardCount: Array.isArray(parsed?.standards) ? parsed.standards.length : 0
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not parse course outline PDF" });
  }
});

app.post("/api/unit-plans/import-docx", unitPlanUpload.single("unitPlanFile"), async (req, res) => {
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || getRequestUserEmail(req));
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "A .docx file is required." });
    return;
  }

  try {
    const payload = await parseDocxBufferToUnitPlanPayload(file.buffer, file.originalname, userEmail);
    const savedPlan = await saveUnitPlanPayload(payload);
    const createdLessonCards = await syncUnitPlanLessonsToLibrary(savedPlan);
    res.status(201).json({
      ok: true,
      unitPlan: savedPlan,
      lessonCount: Array.isArray(savedPlan?.lessons) ? savedPlan.lessons.length : 0,
      createdLessonCards,
      createdActivities: createdLessonCards,
      createdCalendarEvents: 0
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not import unit plan document" });
  }
});

app.post("/api/unit-plans/preview-docx", unitPlanUpload.single("unitPlanFile"), async (req, res) => {
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || getRequestUserEmail(req));
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ error: "A .docx file is required." });
    return;
  }

  try {
    const payload = await parseDocxBufferToUnitPlanPayload(file.buffer, file.originalname, userEmail);
    res.status(200).json({
      ok: true,
      source: file.originalname,
      unitPlan: payload,
      lessonCount: Array.isArray(payload?.lessons) ? payload.lessons.length : 0
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not preview unit plan document" });
  }
});

app.post("/api/unit-plans/import-docx-template", async (req, res) => {
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || getRequestUserEmail(req));
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const templateRelativePath = path.join("TeacherFiles", "Programming - TECHNOLOGY Unit Plan - DT (1).docx");
  const templateAbsolutePath = path.join(__dirname, templateRelativePath);

  try {
    const templateBuffer = await require("fs").promises.readFile(templateAbsolutePath);
    const payload = await parseDocxBufferToUnitPlanPayload(templateBuffer, "Programming - TECHNOLOGY Unit Plan - DT (1).docx", userEmail);
    const savedPlan = await saveUnitPlanPayload(payload);
    const createdLessonCards = await syncUnitPlanLessonsToLibrary(savedPlan);
    res.status(201).json({
      ok: true,
      source: templateRelativePath.replace(/\\/g, "/"),
      unitPlan: savedPlan,
      lessonCount: Array.isArray(savedPlan?.lessons) ? savedPlan.lessons.length : 0,
      createdLessonCards,
      createdActivities: createdLessonCards,
      createdCalendarEvents: 0
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not import TeacherFiles template document" });
  }
});

app.post("/api/unit-plans/preview-docx-template", async (req, res) => {
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || getRequestUserEmail(req));
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const templateRelativePath = path.join("TeacherFiles", "Programming - TECHNOLOGY Unit Plan - DT (1).docx");
  const templateAbsolutePath = path.join(__dirname, templateRelativePath);

  try {
    const templateBuffer = await require("fs").promises.readFile(templateAbsolutePath);
    const payload = await parseDocxBufferToUnitPlanPayload(templateBuffer, "Programming - TECHNOLOGY Unit Plan - DT (1).docx", userEmail);
    res.status(200).json({
      ok: true,
      source: templateRelativePath.replace(/\\/g, "/"),
      unitPlan: payload,
      lessonCount: Array.isArray(payload?.lessons) ? payload.lessons.length : 0
    });
  } catch (error) {
    res.status(400).json({ error: error?.message || "Could not preview TeacherFiles template document" });
  }
});

async function ensureUnitPlanSchema() {
  if (!hasDatabase) {
    return;
  }

  // Unit-plan flows can run before activity/calendar routes on fresh deployments.
  // Ensure dependent tables exist before ALTER statements below.
  await ensureActivitiesSchema();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS unit_plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      strand TEXT,
      year_level TEXT NOT NULL,
      term TEXT,
      subject_stream TEXT,
      duration_weeks INTEGER NOT NULL DEFAULT 1,
      overview TEXT,
      unit_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
      unit_aims JSONB NOT NULL DEFAULT '[]'::jsonb,
      unit_values JSONB NOT NULL DEFAULT '[]'::jsonb,
      contexts JSONB NOT NULL DEFAULT '[]'::jsonb,
      curriculum_links JSONB NOT NULL DEFAULT '[]'::jsonb,
      assessment_link TEXT,
      notes TEXT,
      lessons JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS unit_aims JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS unit_topics JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS unit_values JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS contexts JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS curriculum_links JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS lessons JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE unit_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${lessonTable} (
      id TEXT PRIMARY KEY,
      lesson_title TEXT NOT NULL,
      lesson_week TEXT,
      lesson_date TEXT,
      lesson_duration_minutes INTEGER NOT NULL DEFAULT 60,
      lesson_type TEXT NOT NULL,
      lesson_card_color TEXT,
      activity_name TEXT NOT NULL,
      lesson_year_level TEXT NOT NULL,
      lesson_link_url TEXT,
      lesson_focus TEXT NOT NULL,
      lesson_notes TEXT,
      publish_activity BOOLEAN NOT NULL DEFAULT FALSE,
      add_to_calendar BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_week TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_date TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_duration_minutes INTEGER NOT NULL DEFAULT 60`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_card_color TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_link_url TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_notes TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS relief_course_code TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS lesson_plan JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS publish_activity BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS add_to_calendar BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS created_by_email TEXT`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE ${lessonTable} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS practical_schedule (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      event_type TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      notes TEXT,
      linked_activity_id TEXT,
      linked_url TEXT,
      unit_plan_id TEXT,
      lesson_index INTEGER,
      created_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Backfill older unit-plan lesson cards that were unintentionally saved as unpublished.
  await pool.query(`
    UPDATE ${lessonTable}
    SET publish_activity = TRUE
    WHERE publish_activity = FALSE
      AND id LIKE 'unitplan-%'
  `);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS unit_plan_id TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS unit_lesson_index INTEGER`);
  await pool.query(`ALTER TABLE practical_schedule ADD COLUMN IF NOT EXISTS unit_plan_id TEXT`);
  await pool.query(`ALTER TABLE practical_schedule ADD COLUMN IF NOT EXISTS lesson_index INTEGER`);
  await ensureActivityHubVisibilitySchema();
}

async function ensureActivitiesSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year_level TEXT NOT NULL,
      type TEXT NOT NULL,
      activity_category TEXT,
      duration_minutes INTEGER,
      difficulty TEXT,
      subject_stream TEXT,
      card_color TEXT,
      card_url TEXT,
      outcome_image_url TEXT,
      description TEXT,
      resources JSONB NOT NULL DEFAULT '[]'::jsonb,
      equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
      instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
      class_management_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
      class_preparation JSONB NOT NULL DEFAULT '[]'::jsonb,
      assessment_focus JSONB NOT NULL DEFAULT '[]'::jsonb,
      time_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
      show_in_this_week BOOLEAN NOT NULL DEFAULT FALSE,
      term TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS name TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS year_level TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS type TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_category TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS difficulty TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS subject_stream TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS card_color TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS card_url TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS outcome_image_url TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS resources JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS equipment JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS instructions JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS class_management_notes JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS class_preparation JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS assessment_focus JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS time_sensitive BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS show_in_this_week BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS term TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_date TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS contact_name TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS contact_phone TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS contact_email TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS company TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS address TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS overview JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS costs JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS outcomes JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS withdrawal_date TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS client_id TEXT`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS standard_details JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS tasks_list JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS achieved JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS merit JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS excellence JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS submission_requirements JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS relevant_implications JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS progress_logging JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS feedback_trialling JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensureProjectInterestsSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_interests (
      project_id TEXT NOT NULL,
      student_email TEXT NOT NULL,
      confirmed BOOLEAN NOT NULL DEFAULT FALSE,
      standard_1 TEXT,
      standard_2 TEXT,
      digital_media_type TEXT,
      evidence_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      tools_techniques JSONB NOT NULL DEFAULT '[]'::jsonb,
      template_copies JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, student_email)
    );
  `);

  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS standard_1 TEXT`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS standard_2 TEXT`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS digital_media_type TEXT`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS evidence_steps JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS tools_techniques JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS template_copies JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE project_interests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensureTrelloConnectionsSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_trello_connections (
      student_email TEXT PRIMARY KEY,
      trello_token TEXT NOT NULL,
      trello_member_id TEXT,
      trello_username TEXT,
      trello_full_name TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE student_trello_connections ADD COLUMN IF NOT EXISTS trello_token TEXT`);
  await pool.query(`ALTER TABLE student_trello_connections ADD COLUMN IF NOT EXISTS trello_member_id TEXT`);
  await pool.query(`ALTER TABLE student_trello_connections ADD COLUMN IF NOT EXISTS trello_username TEXT`);
  await pool.query(`ALTER TABLE student_trello_connections ADD COLUMN IF NOT EXISTS trello_full_name TEXT`);
  await pool.query(`ALTER TABLE student_trello_connections ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE student_trello_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensurePracticalSkillsProgressSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS practical_skills_progress (
      student_email TEXT NOT NULL,
      kit_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_email, kit_id)
    );
  `);

  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS responses JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS completed_activities JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE practical_skills_progress ADD COLUMN IF NOT EXISTS certificate_emailed_at TIMESTAMPTZ`);
}

// Starter drafts only — teachers edit the real content via the Kit Content Builder admin page.
const DEFAULT_PRACTICAL_SKILLS_KIT_CONTENT = {
  "kit-login": {
    kitId: "kit-login",
    identity: {
      name: "Login Kit",
      skillArea: "Practical Skills",
      status: "active",
      yearLevel: "All Years"
    },
    theme: { color: "#2f8f61", accent: "#ffd166", icon: "\ud83d\udd10" },
    bannerTitle: "Login Kit",
    bannerSubtitle: "",
    instructions: "",
    teacherNotes: "New students may not have had their Google account provisioned yet.\n\nContact IT if login fails after password reset.\n\nComplete during first DTECH lesson.\n\nEvidence is self-certified; teacher verification not required.",
    learning: {
      whatStudentsWillLearn: "Sign in safely with a school Google account and access the core DTECH tools.",
      whyThisMatters: "Students need reliable access to their DTECH learning environment before starting practical work.",
      keyVocabulary: "username, password, Google account, Google Drive, DTECH-HUB"
    },
    completion: {
      evidenceRequired: "Student completes the checklist and selects the correct password support response.",
      successCriteria: "Student can access DTECH-HUB and Google Drive using their school account.",
      extensionChallenge: "Locate a class file in Google Drive and open it in the appropriate Google app."
    },
    worksheets: [
      { number: 1, activity: "Know Your Username", establishes: "Student knows their school username/email" },
      { number: 2, activity: "Sign In", establishes: "Can independently sign in to their school account" },
      { number: 3, activity: "Password Problems", establishes: "Knows the correct procedure if their password fails" },
      { number: 4, activity: "Open DTECH-HUB", establishes: "Can access your central DTECH environment" },
      { number: 5, activity: "Open Google Drive", establishes: "School Google account is working correctly" },
      { number: 6, activity: "Find Your Files", establishes: "Can locate their Drive/My Drive area" },
      { number: 7, activity: "Open Google Classroom", establishes: "Can reach the appropriate learning environment, if used" },
      { number: 8, activity: "Open a Google App", establishes: "Can successfully access Docs/Slides/etc." },
      { number: 9, activity: "Account Check", establishes: "Can identify which Google account they are currently using" },
      { number: 10, activity: "Sign Out Safely", establishes: "Understands when and how to sign out, especially on shared devices" }
    ],
    questions: [
      { id: "q1", type: "short-answer", prompt: "What is your school username?", lines: 1 },
      {
        id: "q2",
        type: "checklist",
        prompt: "Tick each step once you have done it:",
        options: [
          "Signed in to your school Google account",
          "Opened your DTECH-HUB workspace",
          "Confirmed you can open Google Drive",
          "Confirmed you can open Google Slides"
        ]
      },
      {
        id: "q3",
        type: "multiple-choice",
        prompt: "What should you do if you forget your password?",
        options: [
          "Ask a friend for theirs",
          "Ask a teacher or IT for a reset",
          "Leave the computer and go home",
          "Guess until it works"
        ]
      }
    ],
    images: []
  }
};

function addSearchResultsDetectiveIntroduction(content) {
  if (content?._contentMigrations?.searchResultsDetective >= 11) return content;

  const worksheets = Array.isArray(content?.worksheets) ? content.worksheets : [];
  const activityIndex = worksheets.findIndex((worksheet) =>
    String(worksheet?.activity || "").trim().toLowerCase() === "finding the right result");
  if (activityIndex < 0) return content;

  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  const activity = activities[activityIndex] && typeof activities[activityIndex] === "object"
    ? activities[activityIndex]
    : { title: worksheets[activityIndex].activity };
  const questions = Array.isArray(activity.questions) ? activity.questions.slice() : [];
  if (!questions.some((question) => question?.id === "search-result-clock-tower")) {
    questions.push({
      id: "search-result-clock-tower",
      type: "multiple-choice",
      heading: "Mission 1 – Which Result Would You Open?",
      prompt: "You want to find out how tall the Hokitika Clock Tower is. You search for `Hokitika Clock Tower height`. Which result would you choose?",
      options: [
        "Hokitika Clock Tower – History and Dimensions",
        "Beautiful Photos of Hokitika",
        "Hokitika Weather Forecast"
      ],
      searchResults: {
        title: "Simulated (Fake website) search results",
        results: [
          {
            domain: "heritage.example",
            title: "Hokitika Clock Tower – History and Dimensions",
            description: "Learn about the Clock Tower's construction, height and historic significance."
          },
          {
            domain: "westcoastphotos.example",
            title: "Beautiful Photos of Hokitika",
            description: "Explore pictures of Hokitika, including its famous Clock Tower."
          },
          {
            domain: "weather.example",
            title: "Hokitika Weather Forecast",
            description: "Check the weather in Hokitika today and tomorrow."
          }
        ],
        note: "These are fictional results for practice, not links to real websites."
      },
      images: [
        {
          url: "/practical-skills/images/hokitika-clock-tower.jpg",
          alt: "Hokitika Clock Tower on Weld Street, a heritage building in Hokitika.",
          caption: "Hokitika Clock Tower",
          attribution: "Mike Dickison",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Hokitika_Clock_Tower_MRD_02.jpg",
          license: "CC BY 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
        }
      ]
    });
  }
  if (!questions.some((question) => question?.id === "search-result-pool-hours")) {
    questions.push({
      id: "search-result-pool-hours",
      type: "multiple-choice",
      heading: "Mission 2 – Read Before You Click!",
      prompt: "You want to know what time the Hokitika swimming pool opens. Which result is most likely to give you the opening hours?",
      options: [
        "Hokitika Swimming Club – Competition Results",
        "Best Swimming Pools in New Zealand – Photo Gallery",
        "Hokitika Swimming Pool – Opening Hours and Contact Details"
      ],
      searchResults: {
        title: "Simulated (Fake website) search results",
        results: [
          {
            domain: "hokitikaswimmingclub.example",
            title: "Hokitika Swimming Club – Competition Results",
            description: "See recent race times, competition results and club news."
          },
          {
            domain: "nzpoolphotos.example",
            title: "Best Swimming Pools in New Zealand – Photo Gallery",
            description: "Browse photos of swimming pools around New Zealand."
          },
          {
            domain: "hokitikapool.example",
            title: "Hokitika Swimming Pool – Opening Hours and Contact Details",
            description: "Find pool opening hours, contact details and visitor information."
          }
        ],
        note: "These are fictional results for practice, not links to real websites."
      }
    });
  }
  if (!questions.some((question) => question?.id === "search-result-wrong-place")) {
    questions.push({
      id: "search-result-wrong-place",
      type: "multiple-choice",
      heading: "Mission 3 – The Wrong Place!",
      prompt: "You search for `Hokitika Gorge walking track` but one result is about a different location. Which result doesn't belong?",
      options: [
        "Hokitika Gorge Walk – Department of Conservation",
        "Waimea Gorge Walking Track – Nelson",
        "Hokitika Gorge – Walking Track Information"
      ],
      searchResults: {
        title: "Simulated (Fake website) search results",
        results: [
          {
            domain: "doc.govt.nz.example",
            title: "Hokitika Gorge Walk – Department of Conservation",
            description: "Read about the walking track at Hokitika Gorge."
          },
          {
            domain: "waimeagorge.example",
            title: "Waimea Gorge Walking Track – Nelson",
            description: "Explore a walking track at Waimea Gorge near Nelson."
          },
          {
            domain: "hokitikagorge.example",
            title: "Hokitika Gorge – Walking Track Information",
            description: "Find track information for a walk at Hokitika Gorge."
          }
        ],
        note: "These are fictional results for practice, not links to real websites."
      }
    });
  }
  if (!questions.some((question) => question?.id === "search-result-glowworm-time")) {
    questions.push({
      id: "search-result-glowworm-time",
      type: "multiple-choice",
      heading: "Mission 4 – Find the Useful Information",
      prompt: "Use your search engine to find information about the Hokitika Glow Worm Dell. What is the best time of day to see the glowworms?",
      options: [
        "During the middle of the day",
        "After dark",
        "At lunchtime"
      ],
      presentation: "real-search"
    });
  }
  if (!questions.some((question) => question?.id === "search-result-doc-track")) {
    questions.push({
      id: "search-result-doc-track",
      type: "short-answer",
      heading: "Mission 5 – Find the Official Information",
      prompt: "Search for `Hokitika Gorge DOC`. Find and open the Department of Conservation's Hokitika Gorge Walk webpage. What is the name of the river that flows through Hokitika Gorge?",
      lines: 1,
      presentation: "real-search"
    });
  }
  for (const id of ["search-result-glowworm-time", "search-result-doc-track"]) {
    const questionIndex = questions.findIndex((question) => question?.id === id);
    if (questionIndex >= 0 && !questions[questionIndex].presentation) {
      questions[questionIndex] = { ...questions[questionIndex], presentation: "real-search" };
    }
  }
  const docTrackQuestionIndex = questions.findIndex((question) => question?.id === "search-result-doc-track");
  if (docTrackQuestionIndex >= 0 &&
      questions[docTrackQuestionIndex].type === "multiple-choice" &&
      questions[docTrackQuestionIndex].prompt === "Search for `Hokitika Gorge DOC`. Find and open the Department of Conservation's Hokitika Gorge Walk webpage. Which organisation manages the walking track?") {
    const { options: _options, ...question } = questions[docTrackQuestionIndex];
    questions[docTrackQuestionIndex] = {
      ...question,
      type: "short-answer",
      prompt: "Search for `Hokitika Gorge DOC`. Find and open the Department of Conservation's Hokitika Gorge Walk webpage. What is the name of the river that flows through Hokitika Gorge?",
      lines: 1
    };
  }
  const resultOrders = {
    "search-result-clock-tower": [
      "Beautiful Photos of Hokitika",
      "Hokitika Clock Tower – History and Dimensions",
      "Hokitika Weather Forecast"
    ],
    "search-result-pool-hours": [
      "Hokitika Swimming Club – Competition Results",
      "Hokitika Swimming Pool – Opening Hours and Contact Details",
      "Best Swimming Pools in New Zealand – Photo Gallery"
    ],
    "search-result-wrong-place": [
      "Hokitika Gorge Walk – Department of Conservation",
      "Hokitika Gorge – Walking Track Information",
      "Waimea Gorge Walking Track – Nelson"
    ]
  };
  const reorderedResultOrders = {
    "search-result-clock-tower": [
      "Hokitika Clock Tower – History and Dimensions",
      "Beautiful Photos of Hokitika",
      "Hokitika Weather Forecast"
    ],
    "search-result-pool-hours": [
      "Hokitika Swimming Club – Competition Results",
      "Best Swimming Pools in New Zealand – Photo Gallery",
      "Hokitika Swimming Pool – Opening Hours and Contact Details"
    ],
    "search-result-wrong-place": [
      "Hokitika Gorge Walk – Department of Conservation",
      "Waimea Gorge Walking Track – Nelson",
      "Hokitika Gorge – Walking Track Information"
    ]
  };
  for (const [id, currentOrder] of Object.entries(resultOrders)) {
    const questionIndex = questions.findIndex((question) => question?.id === id);
    if (questionIndex < 0) continue;
    const question = questions[questionIndex];
    const results = question.searchResults?.results;
    if (!Array.isArray(question.options) || question.options.length !== currentOrder.length ||
        !currentOrder.every((option, index) => question.options[index] === option) ||
        !Array.isArray(results) || results.length !== currentOrder.length ||
        !currentOrder.every((title, index) => results[index]?.title === title)) continue;
    const resultsByTitle = new Map(results.map((result) => [result.title, result]));
    const nextOrder = reorderedResultOrders[id];
    questions[questionIndex] = {
      ...question,
      options: nextOrder,
      searchResults: {
        ...question.searchResults,
        results: nextOrder.map((title) => resultsByTitle.get(title))
      }
    };
  }
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    if (question?.searchResults?.title === "Simulated search results") {
      questions[index] = {
        ...question,
        searchResults: {
          ...question.searchResults,
          title: "Simulated (Fake website) search results"
        }
      };
    }
  }

  const hasIntroduction = content?._contentMigrations?.searchResultsDetective >= 1;
  activities[activityIndex] = {
    ...activity,
    questions,
    questionAutoMarkAssessmentId: "search-results-detective-v1",
    information: hasIntroduction && activity.information
      ? activity.information
      : {
      title: "THE MISSION: The Search Results Detective",
      paragraphs: [
        "You've found the right search words. Now it's time to choose the right results!",
        "Not every result will give you the information you're looking for.",
        "Look at the search results, follow the clues and find the information you need.",
        "Can you solve all five missions?"
      ]
    }
  };

  return {
    ...content,
    activities,
    _contentMigrations: {
      ...(content?._contentMigrations || {}),
      searchResultsDetective: 11
    }
  };
}

const SEARCH_KEYWORD_CHALLENGE_INTRODUCTION = {
  title: "🔎 THE MISSION: The West Coast Treasure Hunt",
  paragraphs: [
    "You're on a treasure hunt across the West Coast!",
    "Your challenge is to choose the best search words to find clues about places, objects and wildlife.",
    "Sometimes your first search won't give you what you need. That's when clever searchers change their keywords!",
    "Can you solve all five clues?"
  ]
};

const SEARCH_AND_FIND_INTRODUCTION = {
  title: "🔎 THE MISSION: The West Coast Mystery Trail",
  paragraphs: [
    "There are mysteries hiding all over the West Coast!",
    "Your challenge is to follow five clues and use a search engine to discover the answers.",
    "You can search however you like. If your first search doesn't help, try different words.",
    "Can you solve all five mysteries?"
  ]
};

function searchKeywordChallengeQuestions() {
  return [
    {
      id: "keyword-pounamu-treasure",
      type: "multiple-choice",
      heading: "Mission 1: Find the Treasure",
      prompt: "You want to find out where pounamu can be found on the West Coast. Which search would be most useful?",
      options: [
        "beautiful green rocks",
        "where to find pounamu West Coast NZ",
        "New Zealand beaches"
      ],
      images: [
        {
          url: "/practical-skills/images/pounamu-arahura-river.jpg",
          alt: "Pounamu (greenstone) sourced from the Arahura River, displayed at Wellington Museum.",
          caption: "Pounamu sourced from the Arahura River",
          attribution: "Daderot",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Pounamu_(greenstone),_sourced_from_Arahura_River_-_Wellington_Museum_-_Wellington,_NZ_-_DSC00054.jpg",
          license: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/"
        }
      ]
    },
    {
      id: "keyword-too-many-results",
      type: "multiple-choice",
      heading: "Mission 2: Too Many Results!",
      prompt: "You search for bridge but get results from all over the world. You actually want to find the historic swing bridge at Hokitika Gorge. Which search would help you narrow the results?",
      options: [
        "bridge",
        "bridges New Zealand",
        "Hokitika Gorge swing bridge"
      ]
    },
    {
      id: "keyword-glowworm-mystery",
      type: "multiple-choice",
      heading: "Mission 3 – The Glowworm Mystery",
      prompt: "Your challenge: You've heard about the glowworms at Hokitika's Glow Worm Dell. You want to discover what glowworms eat. Which search would help you find the answer?",
      options: [
        "Hokitika glowworm photos",
        "New Zealand glowworm diet",
        "Hokitika Glow Worm Dell directions"
      ],
      images: [
        {
          url: "/practical-skills/images/new-zealand-glowworm.jpg",
          alt: "Blue-green glowworms shining in a dark cave in New Zealand.",
          caption: "New Zealand glowworm (Arachnocampa luminosa)",
          attribution: "Jon Sullivan",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Arachnocampa_luminosa_2936220.jpg",
          license: "CC BY 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
        }
      ]
    },
    {
      id: "keyword-fix-the-search",
      type: "multiple-choice",
      heading: "Mission 4: Fix the Search",
      prompt: "Someone typed weather but wants to know whether it will rain in Hokitika tomorrow. Which words should they add?",
      options: [
        "Hokitika tomorrow",
        "sunshine",
        "New Zealand"
      ]
    },
    {
      id: "keyword-hokitika-founded",
      type: "short-answer",
      heading: "Mission 5: Your Turn – Find the Answer!",
      prompt: "Use a search engine to find out what year Hokitika was founded as a gold-mining settlement. What year did you find?",
      lines: 1
    }
  ];
}

function searchAndFindQuestions() {
  return [
    {
      id: "search-find-giant-tree",
      type: "short-answer",
      heading: "Mission 1 – The Giant Tree",
      prompt: "One of New Zealand's tallest native tree species grows in West Coast forests. What is the name of this tree?",
      lines: 1,
      hint: "Search for New Zealand's tallest native tree species",
      images: [
        {
          url: "/practical-skills/images/west-coast-tall-tree.jpg",
          alt: "Looking up at the towering trunks of tall native forest trees.",
          caption: "Tall native forest trees",
          attribution: "Geoff McKay",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Standing_Straight_And_Tall_-_Kahikatea_(51236257730)_(cropped).jpg",
          license: "CC BY 2.0",
          licenseUrl: "https://creativecommons.org/licenses/by/2.0/"
        }
      ]
    },
    {
      id: "search-find-gold-rush-town",
      type: "short-answer",
      heading: "Mission 2 – The Gold Rush Town",
      prompt: "Approximately 25 km south of Hokitika is a small town famous for its gold-mining history. What is the name of this town?",
      lines: 1,
      hint: "Search for a historic gold-mining town south of Hokitika."
    },
    {
      id: "search-find-mountain-bird",
      type: "short-answer",
      heading: "Mission 3 – The Mountain Bird",
      prompt: "A large species of kiwi lives in the forests and mountains of the West Coast. What is the Māori name of the great spotted kiwi?",
      lines: 1,
      hint: "Search for the great spotted kiwi's Māori name.",
      images: [
        {
          url: "/practical-skills/images/west-coast-mountain-bird.jpg",
          alt: "A brown, speckled kiwi standing in a museum exhibit.",
          caption: "A kiwi bird",
          attribution: "J Brew",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Great_spotted_kiwi,_apteryx_haastii,_Auckland_War_Memorial_Museum.jpg",
          license: "CC BY-SA 2.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/"
        }
      ]
    },
    {
      id: "search-find-pancake-rocks",
      type: "short-answer",
      heading: "Mission 4 – The Famous Rock Formation",
      prompt: "Near Punakaiki, there are famous rocks that look like stacks of pancakes. What type of rock are the Pancake Rocks made from?",
      lines: 1,
      hint: "Search for what the Punakaiki Pancake Rocks are made of.",
      images: [
        {
          url: "/practical-skills/images/punakaiki-pancake-rocks.jpg",
          alt: "Layered Pancake Rocks beside the sea at Punakaiki.",
          caption: "Pancake Rocks, Paparoa National Park",
          attribution: "W. Bulach",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:00_1273_Pancake_Rocks_-_Paparoa-Nationalpark_(New_Zealand).jpg",
          license: "CC BY-SA 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/"
        }
      ]
    },
    {
      id: "search-find-glacier-mystery",
      type: "short-answer",
      heading: "Mission 5 – The Glacier Mystery",
      prompt: "The West Coast is home to a famous glacier called Franz Josef Glacier. What is its Māori name?",
      lines: 1,
      hint: "Search for the Māori name of Franz Josef Glacier.",
      imageTimeline: true,
      images: [
        {
          url: "/practical-skills/images/franz-josef-glacier-1906.jpg",
          alt: "Black-and-white photo of visitors in long dresses and hats walking across thick glacier ice low in the valley.",
          caption: "1906: visitors walking on thick ice in the valley",
          timelineYear: "1906",
          timelineLabel: "Ice fills the valley",
          attribution: "James Ring, Alexander Turnbull Library",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Francis_Joseph_Glacier,_1906.jpg",
          license: "Public domain",
          licenseUrl: ""
        },
        {
          url: "/practical-skills/images/franz-josef-glacier-2019.jpg",
          alt: "People walking along a wide rocky riverbed in the Franz Josef Glacier valley, with bush-covered hills and no ice in view.",
          caption: "2019: the same valley, now a rocky riverbed",
          timelineYear: "2019",
          timelineLabel: "Ice gone from the valley floor",
          attribution: "Pedro Szekely",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Franz_Josef_Glacier_2019.jpg",
          license: "CC BY-SA 2.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/"
        },
        {
          url: "/practical-skills/images/franz-josef-glacier-2024.jpg",
          alt: "The narrow tongue of Franz Josef Glacier high in a steep mountain valley, below snowy peaks.",
          caption: "2024: the glacier now ends high up the mountain",
          timelineYear: "2024",
          timelineLabel: "Glacier today",
          attribution: "Pseudopanax",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Franz_Josef_Glacier_below_Fritz_Range.jpg",
          license: "Public domain",
          licenseUrl: ""
        }
      ]
    }
  ];
}

const PREVIOUS_GLACIER_IMAGE_URLS = [
  "/practical-skills/images/franz-josef-glacier-2019.jpg",
  "/practical-skills/images/franz-josef-glacier-1906.jpg"
];

function isSearchIntroduction(information, introduction) {
  return information?.title === introduction.title &&
    Array.isArray(information?.paragraphs) &&
    information.paragraphs.length === introduction.paragraphs.length &&
    information.paragraphs.every((paragraph, index) => paragraph === introduction.paragraphs[index]);
}

function insertMissingDefaultQuestions(questions, defaults) {
  defaults.forEach((question, index) => {
    if (questions.some((existing) => existing?.id === question.id)) return;
    const previousIndex = index > 0
      ? questions.findIndex((existing) => existing?.id === defaults[index - 1].id)
      : -1;
    questions.splice(index === 0 ? 0 : previousIndex >= 0 ? previousIndex + 1 : questions.length, 0, question);
  });
  return questions;
}

// The West Coast Mystery Trail missions belong to "Search and Find!". Earlier migrations
// wrongly placed them in "The Keyword Challenge", so this restores both activities.
function addSearchKitKeywordChallenge(content) {
  if (content?._contentMigrations?.searchKeywordChallenge >= 18) return content;

  const worksheets = Array.isArray(content?.worksheets) ? content.worksheets : [];
  const activityIndex = worksheets.findIndex((worksheet) =>
    String(worksheet?.activity || "").trim().toLowerCase() === "the keyword challenge");
  if (activityIndex < 0) return content;

  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  const existingActivity = activities[activityIndex] && typeof activities[activityIndex] === "object";
  const activity = existingActivity
    ? activities[activityIndex]
    : { title: worksheets[activityIndex].activity };
  const updateIntroduction = (content?._contentMigrations?.searchKeywordChallenge || 0) < 1 || !existingActivity;
  const keywordDefaults = searchKeywordChallengeQuestions();
  const misplacedMysteryQuestions = {
    "keyword-west-coast-tree": "keyword-pounamu-treasure",
    "keyword-gold-rush-town": "keyword-too-many-results",
    "keyword-mountain-bird": "keyword-glowworm-mystery",
    "keyword-pancake-rocks": "keyword-fix-the-search"
  };
  const existingQuestions = Array.isArray(activity.questions) ? activity.questions : [];
  const questions = existingQuestions.flatMap((question) => {
    const originalId = misplacedMysteryQuestions[question?.id];
    if (!originalId) return [question];
    if (existingQuestions.some((existing) => existing?.id === originalId)) return [];
    return [keywordDefaults.find((defaultQuestion) => defaultQuestion.id === originalId)];
  });
  insertMissingDefaultQuestions(questions, keywordDefaults);
  activities[activityIndex] = {
    ...activity,
    questions,
    questionAutoMarkAssessmentId: "search-keyword-challenge-v1",
    information: updateIntroduction || isSearchIntroduction(activity.information, SEARCH_AND_FIND_INTRODUCTION)
      ? SEARCH_KEYWORD_CHALLENGE_INTRODUCTION
      : activity.information
  };

  const searchAndFindIndex = worksheets.findIndex((worksheet) =>
    String(worksheet?.activity || "").trim().toLowerCase() === "search and find!");
  if (searchAndFindIndex >= 0 && searchAndFindIndex !== activityIndex) {
    const searchAndFind = activities[searchAndFindIndex] && typeof activities[searchAndFindIndex] === "object"
      ? activities[searchAndFindIndex]
      : { title: worksheets[searchAndFindIndex].activity };
    const searchAndFindQuestionsList = (Array.isArray(searchAndFind.questions) ? searchAndFind.questions : [])
      .filter((question) => !String(question?.id || "").startsWith("keyword-"))
      .map((question) => {
        const imageUrls = Array.isArray(question?.images) ? question.images.map((image) => image?.url) : [];
        if (question?.id !== "search-find-glacier-mystery" || imageUrls.length !== PREVIOUS_GLACIER_IMAGE_URLS.length ||
          !imageUrls.every((url, index) => url === PREVIOUS_GLACIER_IMAGE_URLS[index])) return question;
        const defaultGlacier = searchAndFindQuestions().find((defaultQuestion) => defaultQuestion.id === question.id);
        return { ...question, imageTimeline: true, images: defaultGlacier.images };
      });
    insertMissingDefaultQuestions(searchAndFindQuestionsList, searchAndFindQuestions());
    activities[searchAndFindIndex] = {
      ...searchAndFind,
      questions: searchAndFindQuestionsList,
      questionAutoMarkAssessmentId: "search-and-find-v1",
      information: !searchAndFind.information ||
        isSearchIntroduction(searchAndFind.information, SEARCH_KEYWORD_CHALLENGE_INTRODUCTION)
        ? SEARCH_AND_FIND_INTRODUCTION
        : searchAndFind.information
    };
  }

  return {
    ...content,
    activities,
    _contentMigrations: {
      ...(content?._contentMigrations || {}),
      searchKeywordChallenge: 18
    }
  };
}

const GOOGLE_SEARCH_CHALLENGE_INTRODUCTION = {
  title: "🏆 THE MISSION: My West Coast Discoveries!",
  paragraphs: [
    "You've explored some amazing things about the West Coast!",
    "You've searched for information about wildlife, interesting places, natural wonders and local history.",
    "Now it's time to bring your discoveries together!",
    "Your challenge is to create a Google Docs Research Report about three interesting things you've discovered during the Search Kit.",
    "Your report is already set up for you. Just open it, follow the prompts and add your discoveries.",
    "Ready to become a West Coast Research Champion?"
  ]
};

// Replaced only when it is still unedited, so teacher-written introductions are preserved.
const PREVIOUS_GOOGLE_SEARCH_CHALLENGE_INTRODUCTION = {
  title: "🏆 THE MISSION: The Great West Coast Adventure!",
  paragraphs: [
    "You've been asked to help a visitor explore the amazing West Coast!",
    "They want to see interesting places, discover something unusual and enjoy a great day out.",
    "Your challenge is to use a search engine to help them plan their adventure.",
    "There are five missions to complete. You can use any search engine you like.",
    "Ready to become a West Coast Search Champion?"
  ]
};

// The teacher's master Google Doc is copied exactly for each student; it can be changed in the Kit Builder.
const GOOGLE_SEARCH_RESEARCH_REPORT_TEMPLATE_ID = "12_9pgqJIVnFd14OMhIlBZeorX3e-vDl37uLgLSz3Qf0";
const GOOGLE_SEARCH_RESEARCH_REPORT = {
  id: "search-research-report-v1",
  fileName: "Search Kit - My West Coast Discoveries",
  templateId: GOOGLE_SEARCH_RESEARCH_REPORT_TEMPLATE_ID,
  minimumWords: 25
};

// Only touches the "Google Search Challenge" activity; other Search Kit activities are left as they are.
function addGoogleSearchChallenge(content) {
  const version = Number(content?._contentMigrations?.googleSearchChallenge) || 0;
  if (version >= 4) return content;

  const worksheets = Array.isArray(content?.worksheets) ? content.worksheets.slice() : [];
  const challengeIndex = worksheets.findIndex((worksheet) =>
    String(worksheet?.activity || "").trim().toLowerCase() === "google search challenge");
  if (challengeIndex < 0) return content;

  if (version < 1 && worksheets[challengeIndex].establishes === "Challenge\tUse Google independently to find information") {
    worksheets[challengeIndex] = { ...worksheets[challengeIndex], establishes: "Use Google independently to find information" };
  }
  const activities = Array.isArray(content.activities) ? content.activities.slice() : [];
  while (activities.length < challengeIndex) activities.push(null);
  const challenge = activities[challengeIndex] && typeof activities[challengeIndex] === "object"
    ? activities[challengeIndex]
    : { title: worksheets[challengeIndex].activity };
  activities[challengeIndex] = {
    ...challenge,
    information: JSON.stringify(challenge.information) === JSON.stringify(PREVIOUS_GOOGLE_SEARCH_CHALLENGE_INTRODUCTION) ||
      (version < 1 && !challenge.information?.title)
      ? GOOGLE_SEARCH_CHALLENGE_INTRODUCTION
      : challenge.information,
    researchReport: challenge.researchReport && typeof challenge.researchReport === "object"
      ? {
        ...GOOGLE_SEARCH_RESEARCH_REPORT,
        ...challenge.researchReport,
        templateId: String(challenge.researchReport.templateId || "").trim() || GOOGLE_SEARCH_RESEARCH_REPORT_TEMPLATE_ID
      }
      : { ...GOOGLE_SEARCH_RESEARCH_REPORT }
  };
  if (activities[challengeIndex].information === undefined) delete activities[challengeIndex].information;

  return {
    ...content,
    worksheets,
    activities,
    _contentMigrations: {
      ...(content?._contentMigrations || {}),
      googleSearchChallenge: 4
    }
  };
}

function addSearchKitPenguinMission(content) {
  if (content?._contentMigrations?.searchPenguinMission >= 11) {
    return addGoogleSearchChallenge(addSearchResultsDetectiveIntroduction(addSearchKitKeywordChallenge(content)));
  }

  const worksheets = Array.isArray(content?.worksheets) ? content.worksheets.slice() : [];
  if (!worksheets[0]) worksheets[0] = { number: 1, activity: "Search Like a Pro", establishes: "Uses a search engine to discover information" };
  else if (worksheets[0].establishes === "Understands search engines and keywords") {
    worksheets[0] = { ...worksheets[0], establishes: "Uses a search engine to discover information" };
  }
  const activities = Array.isArray(content?.activities) ? content.activities.slice() : [];
  const activity = activities[0] && typeof activities[0] === "object" ? activities[0] : {};
  const questions = (Array.isArray(activity.questions) ? activity.questions : []).flatMap((question) => {
    if (!question || typeof question !== "object") return [];
    if (question.type === "checklist" && Array.isArray(question.options)) {
      const options = question.options.filter((option) => !/i have opened google/i.test(String(option)));
      if (!options.length && question.options.length) return [];
      return [{ ...question, options }];
    }
    if (/i have opened google|find google/i.test(String(question.prompt || ""))) return [];
    return [question];
  });
  if (!questions.some((question) => question.id === "search-penguin-name")) {
    questions.push({
      id: "search-penguin-name",
      type: "short-answer",
      prompt: "What is another name for New Zealand's little blue penguin?",
      lines: 1
    });
  }
  if (!questions.some((question) => question.id === "search-korora-food-search")) {
    questions.push({
      id: "search-korora-food-search",
      type: "multiple-choice",
      heading: "Mission 2: Choose your own search words",
      prompt: "Now find out what a kororā eats. Which search would help you find the answer?",
      options: [
        "kororā food",
        "penguin colours",
        "birds in New Zealand"
      ]
    });
  }
  const taranakiImage = {
    url: "/practical-skills/images/mount-taranaki.jpg",
    alt: "Mount Taranaki rising above the forested slopes of Egmont National Park.",
    caption: "Mount Taranaki",
    attribution: "Michal Klajban",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Mount_Taranaki,_New_Zealand_(03).JPG",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/"
  };
  const missionThreeIndex = questions.findIndex((question) => question.id === "search-tallest-mountain");
  if (missionThreeIndex < 0) {
    questions.push({
      id: "search-tallest-mountain",
      type: "multiple-choice",
      heading: "Mission 3: Search independently",
      prompt: "Find the name of New Zealand's tallest mountain. What did you find?",
      options: [
        "Mount Ruapehu",
        "Aoraki / Mount Cook",
        "Mount Taranaki"
      ],
      images: [
        {
          url: "/practical-skills/images/mount-ruapehu.jpg",
          alt: "Mount Ruapehu rising above the surrounding landscape.",
          caption: "Mount Ruapehu",
          attribution: "Geoff McKay",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Mount_Ruapehu_-_Flickr_-_Geoff_J_Mckay.jpg",
          license: "CC BY 2.0",
          licenseUrl: "https://creativecommons.org/licenses/by/2.0/"
        },
        {
          url: "/practical-skills/images/aoraki-mount-cook.jpg",
          alt: "Aoraki / Mount Cook rising above the surrounding mountains.",
          caption: "Aoraki / Mount Cook",
          attribution: "Michal Klajban",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Aoraki,_Aoraki_-_Mount_Cook_National_Park,_New_Zealand_02.jpg",
          license: "CC BY-SA 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/"
        },
        taranakiImage
      ]
    });
  } else {
    const missionThree = questions[missionThreeIndex];
    const options = Array.isArray(missionThree.options) ? missionThree.options.slice() : [];
    if (!options.includes("Mount Taranaki")) options.push("Mount Taranaki");
    const images = Array.isArray(missionThree.images) ? missionThree.images.slice() : [];
    if (!images.some((image) => image?.url === taranakiImage.url)) images.push(taranakiImage);
    questions[missionThreeIndex] = { ...missionThree, options, images };
  }
  if (!questions.some((question) => question.id === "search-penguin-location")) {
    questions.push({
      id: "search-penguin-location",
      type: "multiple-choice",
      heading: "Mission 4 – Penguins on the Coast",
      prompt: "Find out where Little Blue Penguins can be seen near Hokitika.",
      options: [
        "The West Coast Wildlife Centre in Franz Josef",
        "Hokitika Beach",
        "The Hokitika Gorge"
      ]
    });
  }
  if (!questions.some((question) => question.id === "search-penguin-safety")) {
    questions.push({
      id: "search-penguin-safety",
      type: "multiple-choice",
      heading: "Mission 5 – Keeping Kororā Safe",
      prompt: "Little Blue Penguins face dangers along the West Coast. Which of these can harm them?",
      options: [
        "Uncontrolled dogs",
        "Native flax plants",
        "Rainbows"
      ]
    });
  }

  const imageUrl = "/practical-skills/images/little-blue-penguin.jpg";
  const images = Array.isArray(activity.images) ? activity.images.slice() : [];
  const penguinImageIndex = images.findIndex((image) =>
    image?.url === imageUrl || image?.url === "/practical-skills/images/little-blue-penguin.svg");
  const penguinImage = {
    url: imageUrl,
    alt: "A little blue penguin moving up from the shore towards its burrow on Kapiti Island, New Zealand.",
    caption: "New Zealand's little blue penguin",
    attribution: "Duncan Wright",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Blue_Penguin_Kapiti.jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/"
  };
  if (penguinImageIndex >= 0) {
    images[penguinImageIndex] = { ...images[penguinImageIndex], ...penguinImage };
  } else {
    images.push({
      ...penguinImage
    });
  }

  const penguinQuestion = questions.find((question) => question.id === "search-penguin-name");
  penguinQuestion.prompt = `Mission 1: ${String(penguinQuestion.prompt || "").replace(/^Mission 1:\s*/i, "")}`;

  activities[0] = {
    ...activity,
    questions,
    images,
    questionAutoMarkAssessmentId: "search-penguin-missions-v1",
    information: {
      title: "THE MISSION: The Penguin Mystery",
      paragraphs: [
        "Did you know that the world's smallest penguin lives right here on the West Coast of the South Island?",
        "Your mission is to investigate the Little Blue Penguin and discover more about its life on our coastline.",
        "Use a search engine of your choice to find the answers to the questions below. Google, Bing or another search engine will do!",
        "Can you solve the Penguin Mystery?"
      ]
    }
  };

  return addGoogleSearchChallenge(addSearchResultsDetectiveIntroduction(addSearchKitKeywordChallenge({
    ...content,
    worksheets,
    activities,
    _contentMigrations: {
      ...(content?._contentMigrations || {}),
      searchPenguinMission: 11
    }
  })));
}

function normalizePracticalSkillsKitContentForStorage(kitId, content) {
  const safeContent = withShortLoginKit(kitId, withLearningSitesActivity(kitId, withLoginAppsActivity(kitId, withLoginIdentityActivity(kitId, withPasswordProblemsActivity(kitId, content && typeof content === "object" ? content : {})))));
  if (String(kitId || "").trim() !== "kit-login") {
    return safeContent;
  }

  return {
    ...safeContent,
    bannerSubtitle: "",
    instructions: ""
  };
}

function normalizePracticalSkillsKitContentForDisplay(kitId, content) {
  const safeContent = normalizePracticalSkillsKitContentForStorage(kitId, content);
  const {
    teacherNotes: _teacherNotes,
    identity: _identity,
    learning: _learning,
    completion: _completion,
    _contentMigrations: _contentMigrations,
    ...studentContent
  } = safeContent;
  return {
    ...studentContent,
    activities: Array.isArray(studentContent.activities) ? studentContent.activities.map((activity) =>
      activity ? { ...activity, ...(activity.loginSites ? { loginSites: publicLoginSites(activity.loginSites) } : {}), assessment: getStudentAssessment(activity.assessmentId) } : activity
    ) : []
  };
}

function getDefaultPracticalSkillsKitContent(kitId) {
  const safeKitId = String(kitId || "").trim();
  return DEFAULT_PRACTICAL_SKILLS_KIT_CONTENT[safeKitId] || {
    kitId: safeKitId,
    theme: { color: "#2f8f61", accent: "#ffd166", icon: "\ud83d\udcdd" },
    bannerTitle: "",
    bannerSubtitle: "",
    instructions: "",
    questions: [],
    images: []
  };
}

async function ensurePracticalSkillsKitContentSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS practical_skills_kit_content (
      kit_id TEXT PRIMARY KEY,
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by_email TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE practical_skills_kit_content ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE practical_skills_kit_content ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE practical_skills_kit_content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function getPracticalSkillsKitContent(kitId) {
  const content = await getStoredPracticalSkillsKitContent(kitId);
  if (!content) return null;
  return normalizePracticalSkillsKitContentForDisplay(kitId, content);
}

async function getStoredPracticalSkillsKitContent(kitId) {
  const safeKitId = String(kitId || "").trim();
  if (!safeKitId) return null;

  if (!hasDatabase) {
    const stored = memoryPracticalSkillsKitContent.get(safeKitId);
    let content = stored || getDefaultPracticalSkillsKitContent(safeKitId);
    if (safeKitId === "kit-google-search") {
      content = addSearchKitPenguinMission(content);
      if (stored) memoryPracticalSkillsKitContent.set(safeKitId, content);
    }
    return withShortLoginKit(safeKitId, withLearningSitesActivity(safeKitId, withLoginAppsActivity(safeKitId, withLoginIdentityActivity(safeKitId, withPasswordProblemsActivity(safeKitId, content)))));
  }

  await ensurePracticalSkillsKitContentSchema();
  const result = await pool.query(`SELECT content FROM practical_skills_kit_content WHERE kit_id = $1 LIMIT 1`, [safeKitId]);
  const stored = result.rows?.[0]?.content;
  const defaults = getDefaultPracticalSkillsKitContent(safeKitId);
  if (!stored || !Object.keys(stored).length) {
    const content = safeKitId === "kit-google-search" ? addSearchKitPenguinMission(defaults) : defaults;
    return withShortLoginKit(safeKitId, withLearningSitesActivity(safeKitId, withLoginAppsActivity(safeKitId, withLoginIdentityActivity(safeKitId, withPasswordProblemsActivity(safeKitId, content)))));
  }

  let merged = { ...defaults, ...stored };
  if (safeKitId === "kit-login" && (!Array.isArray(stored.worksheets) || !stored.worksheets.length)) {
    merged.worksheets = defaults.worksheets;
  }
  if (safeKitId === "kit-google-search") {
    const migrated = addSearchKitPenguinMission(merged);
    if (migrated !== merged) {
      merged = migrated;
      await pool.query(
        `UPDATE practical_skills_kit_content SET content = $1::jsonb, updated_at = NOW() WHERE kit_id = $2`,
        [JSON.stringify(merged), safeKitId]
      );
    }
  }
  return withShortLoginKit(safeKitId, withLearningSitesActivity(safeKitId, withLoginAppsActivity(safeKitId, withLoginIdentityActivity(safeKitId, withPasswordProblemsActivity(safeKitId, merged)))));
}

async function savePracticalSkillsKitContent(kitId, content, updatedByEmail) {
  const safeKitId = String(kitId || "").trim();
  if (!safeKitId) return null;

  const safeContent = normalizePracticalSkillsKitContentForStorage(safeKitId, { ...content, kitId: safeKitId });

  if (!hasDatabase) {
    memoryPracticalSkillsKitContent.set(safeKitId, safeContent);
    return safeContent;
  }

  await ensurePracticalSkillsKitContentSchema();
  await pool.query(
    `INSERT INTO practical_skills_kit_content (kit_id, content, updated_by_email, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (kit_id) DO UPDATE SET
       content = EXCLUDED.content,
       updated_by_email = EXCLUDED.updated_by_email,
       updated_at = NOW()`,
    [safeKitId, JSON.stringify(safeContent), normalizeEmail(updatedByEmail)]
  );
  return safeContent;
}

async function savePracticalSkillsKitResponses(studentEmail, kitId, responses) {
  const email = normalizeEmail(studentEmail);
  const safeKitId = String(kitId || "").trim();
  if (!email || !safeKitId) return null;

  const safeResponses = responses && typeof responses === "object" ? responses : {};
  await ensurePracticalSkillsProgressRow(email, safeKitId);

  if (!hasDatabase) {
    const key = `${email}:${safeKitId}`;
    const existing = memoryPracticalSkillsProgress.get(key) || {};
    const next = { ...existing, responses: safeResponses, updated_at: new Date().toISOString() };
    memoryPracticalSkillsProgress.set(key, next);
    return next;
  }

  await ensurePracticalSkillsProgressSchema();
  const result = await pool.query(
    `UPDATE practical_skills_progress SET responses = $1::jsonb, updated_at = NOW()
     WHERE student_email = $2 AND kit_id = $3 RETURNING *`,
    [JSON.stringify(safeResponses), email, safeKitId]
  );
  return result.rows?.[0] || null;
}

async function setPracticalSkillsActivityCompletion(studentEmail, kitId, activityIndex, completed) {
  const email = normalizeEmail(studentEmail);
  await ensurePracticalSkillsProgressRow(email, kitId);
  const key = String(activityIndex);
  const completedAt = new Date().toISOString();

  if (!hasDatabase) {
    const progressKey = `${email}:${kitId}`;
    const existing = memoryPracticalSkillsProgress.get(progressKey);
    const completedActivities = { ...existing.completed_activities };
    if (completed) completedActivities[key] = completedAt;
    else delete completedActivities[key];
    const next = { ...existing, completed_activities: completedActivities, updated_at: completedAt };
    memoryPracticalSkillsProgress.set(progressKey, next);
    return next;
  }

  const result = completed
    ? await pool.query(
        `UPDATE practical_skills_progress
         SET completed_activities = jsonb_set(completed_activities, ARRAY[$1::text], to_jsonb($2::text)), updated_at = NOW()
         WHERE student_email = $3 AND kit_id = $4 RETURNING *`,
        [key, completedAt, email, kitId]
      )
    : await pool.query(
        `UPDATE practical_skills_progress
         SET completed_activities = completed_activities - $1::text, updated_at = NOW()
         WHERE student_email = $2 AND kit_id = $3 RETURNING *`,
        [key, email, kitId]
      );
  return result.rows?.[0] || null;
}

async function savePracticalSkillsAssessment(studentEmail, kitId, activityIndex, grade) {
  const email = normalizeEmail(studentEmail);
  await ensurePracticalSkillsProgressRow(email, kitId);
  const activityKey = String(activityIndex);
  const responseKey = `${activityIndex}-${grade.assessmentId || PASSWORD_PROBLEMS_ID}`;
  const mergeSiteAnswers = grade.assessmentId === "login-sites-readiness-v1";
  const mergeQuestionAnswers = grade.assessmentId === "search-penguin-missions-v1" ||
    grade.assessmentId === "search-keyword-challenge-v1" ||
    grade.assessmentId === SEARCH_RESULTS_DETECTIVE_ID ||
    grade.assessmentId === SEARCH_AND_FIND_ID;
  const completedAt = new Date().toISOString();

  if (!hasDatabase) {
    const key = `${email}:${kitId}`;
    const existing = memoryPracticalSkillsProgress.get(key);
    const next = {
      ...existing,
      responses: grade.identityLesson || mergeQuestionAnswers ? { ...existing.responses, ...grade.answers } : {
        ...existing.responses,
        [responseKey]: mergeSiteAnswers ? { ...existing.responses?.[responseKey], ...grade.answers } : grade.answers
      },
      completed_activities: {
        ...existing.completed_activities,
        ...(grade.passed ? { [activityKey]: completedAt } : {})
      },
      updated_at: completedAt
    };
    memoryPracticalSkillsProgress.set(key, next);
    return next;
  }

  const result = await pool.query(
    `UPDATE practical_skills_progress
     SET responses = CASE WHEN $8::boolean OR $10::boolean THEN responses || $2::jsonb
           WHEN $9::boolean THEN jsonb_set(responses, ARRAY[$1::text], COALESCE(responses -> $1::text, '{}'::jsonb) || $2::jsonb)
           ELSE jsonb_set(responses, ARRAY[$1::text], $2::jsonb) END,
         completed_activities = CASE WHEN $5::boolean
           THEN jsonb_set(completed_activities, ARRAY[$3::text], to_jsonb($4::text))
           ELSE completed_activities END,
         updated_at = NOW()
     WHERE student_email = $6 AND kit_id = $7 RETURNING *`,
    [responseKey, JSON.stringify(grade.answers), activityKey, completedAt, grade.passed, email, kitId, Boolean(grade.identityLesson), mergeSiteAnswers, mergeQuestionAnswers]
  );
  if (!result.rows?.[0]) throw new Error("Activity progress could not be saved.");
  return result.rows[0];
}

async function ensureStudentHaparaFoldersSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_hapara_folders (
      student_email TEXT PRIMARY KEY,
      folder_url TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      class_label TEXT,
      notes TEXT,
      updated_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS folder_url TEXT`);
  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS folder_id TEXT`);
  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS class_label TEXT`);
  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS notes TEXT`);
  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE student_hapara_folders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS student_hapara_folders_class_idx ON student_hapara_folders (class_label)`);
}

// Growing, student-worded index of Tools & Techniques keywords, learned from what students actually push to
// Trello. Used to recognise tool names typed directly into Trello (not just the hub's known regex keywords).
async function ensureToolsTechniquesKeywordsSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tools_techniques_keywords (
      id SERIAL PRIMARY KEY,
      keyword TEXT NOT NULL,
      keyword_lower TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'auto',
      added_by_email TEXT,
      use_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE tools_techniques_keywords ADD COLUMN IF NOT EXISTS keyword_lower TEXT`);
  await pool.query(`UPDATE tools_techniques_keywords SET keyword_lower = LOWER(TRIM(keyword)) WHERE keyword_lower IS NULL`);
  await pool.query(`ALTER TABLE tools_techniques_keywords ALTER COLUMN keyword_lower SET NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tools_techniques_keywords_lower_idx ON tools_techniques_keywords (keyword_lower)`);
  await pool.query(`ALTER TABLE tools_techniques_keywords ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto'`);
  await pool.query(`ALTER TABLE tools_techniques_keywords ADD COLUMN IF NOT EXISTS added_by_email TEXT`);
  await pool.query(`ALTER TABLE tools_techniques_keywords ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE tools_techniques_keywords ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE tools_techniques_keywords ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensureCourseOutlinesSchema() {
  if (!hasDatabase) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_outlines (
      id TEXT PRIMARY KEY,
      course_name TEXT NOT NULL,
      year_level TEXT NOT NULL,
      year_version INTEGER NOT NULL,
      subject_stream TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      card_color TEXT NOT NULL DEFAULT 'Teal',
      standards JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_email TEXT,
      updated_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS course_name TEXT`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS year_level TEXT`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS year_version INTEGER`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS subject_stream TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS card_color TEXT NOT NULL DEFAULT 'Teal'`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS standards JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS created_by_email TEXT`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE course_outlines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS course_outlines_year_idx ON course_outlines (year_version)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS course_outlines_active_idx ON course_outlines (is_active)`);
}

async function backfillProcessAssessmentAllocations() {
  if (!hasDatabase) {
    return 0;
  }

  const clientProjectsTaskId = String(CLIENT_PROJECTS_TASK_ID || "").trim();
  if (!clientProjectsTaskId) {
    return 0;
  }

  const sourceResult = await pool.query(
    `
      SELECT pi.student_email, pi.confirmed, a.*
      FROM project_interests pi
      JOIN activities a ON a.id::text = pi.project_id::text
      WHERE pi.project_id::text <> $1
    `,
    [clientProjectsTaskId]
  );

  const confirmedByStudent = new Set();
  for (const row of sourceResult.rows || []) {
    const activity = normalizeActivityCategoryForResponse(row);
    const studentEmail = normalizeEmail(row.student_email || "");
    const category = String(activity.activity_category || "").trim().toLowerCase();
    if (!studentEmail || !row.confirmed || (!category.includes("assessment") && !category.includes("project"))) {
      continue;
    }
    confirmedByStudent.add(studentEmail);
  }

  let inserted = 0;
  for (const studentEmail of confirmedByStudent) {
    const result = await pool.query(
      `INSERT INTO project_interests (project_id, student_email, confirmed)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, student_email) DO UPDATE SET confirmed = TRUE`,
      [clientProjectsTaskId, studentEmail, true]
    );
    inserted += Number(result.rowCount || 0);
  }

  return inserted;
}

async function syncProcessAssessmentAllocation(studentEmail) {
  const clientProjectsTaskId = String(CLIENT_PROJECTS_TASK_ID || "").trim();
  if (!hasDatabase || !clientProjectsTaskId || !studentEmail) {
    return false;
  }

  const sourceResult = await pool.query(
    `SELECT pi.confirmed, a.*
     FROM project_interests pi
     JOIN activities a ON a.id::text = pi.project_id::text
     WHERE pi.student_email = $1 AND pi.project_id::text <> $2`,
    [studentEmail, clientProjectsTaskId]
  );
  const hasConfirmedEligibleSource = (sourceResult.rows || []).some((row) => {
    const activity = normalizeActivityCategoryForResponse(row);
    const category = String(activity.activity_category || "").trim().toLowerCase();
    return Boolean(row.confirmed) && (category.includes("assessment") || category.includes("project"));
  });

  if (!hasConfirmedEligibleSource) {
    return false;
  }

  await pool.query(
    `INSERT INTO project_interests (project_id, student_email, confirmed)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (project_id, student_email) DO UPDATE SET confirmed = TRUE`,
    [clientProjectsTaskId, studentEmail]
  );
  return true;
}

async function propagateProcessAssessmentDetails(studentEmail, standard1, standard2, digitalMediaType) {
  const clientProjectsTaskId = String(CLIENT_PROJECTS_TASK_ID || "").trim();
  if (!hasDatabase || !clientProjectsTaskId || !studentEmail) {
    return;
  }

  const sourceResult = await pool.query(
    `SELECT pi.project_id, a.*
     FROM project_interests pi
     JOIN activities a ON a.id::text = pi.project_id::text
     WHERE pi.student_email = $1 AND pi.project_id::text <> $2`,
    [studentEmail, clientProjectsTaskId]
  );

  for (const row of sourceResult.rows || []) {
    const activity = normalizeActivityCategoryForResponse(row);
    const category = String(activity.activity_category || "").trim().toLowerCase();
    if (!category.includes("assessment") && !category.includes("project")) {
      continue;
    }
    await pool.query(
      `UPDATE project_interests
       SET standard_1 = $1, standard_2 = $2, digital_media_type = $3
       WHERE project_id = $4 AND student_email = $5`,
      [standard1 || null, standard2 || null, digitalMediaType || null, String(row.project_id), studentEmail]
    );
  }
}

async function ensureSchema() {
  await ensureActivitiesSchema();
  await ensureProjectInterestsSchema();
  await ensureTrelloConnectionsSchema();
  await ensureStudentHaparaFoldersSchema();
  await ensureStudentDriveSetupSchema();
  await ensureEmailLogsSchema();
  await ensureTriallingComponentsSchema();
  await ensureDigiMedEfficientToolsSchema();
  await ensureUnitPlanSchema();
  await ensureAssessmentStandardCardsSchema();
  await seedDefaultAssessmentStandardCards();
  await ensureCourseOutlinesSchema();
  await ensurePracticalSkillsProgressSchema();
  await ensurePracticalSkillsKitContentSchema();
  await seedOzoneLayerReliefLesson();
  const seededProcessAssessmentAllocations = await backfillProcessAssessmentAllocations();
  if (seededProcessAssessmentAllocations > 0) {
    console.log(`[startup] Backfilled ${seededProcessAssessmentAllocations} student allocation(s) into Process Assessment (${CLIENT_PROJECTS_TASK_ID}).`);
  }
}

async function seedOzoneLayerReliefLesson() {
  const lessonId = "relief-jdtech-ozone-layer-2026";
  const lessonPlan = {
    unit: "Reliever Classwork",
    component: "Technology",
    theme: "International Day for the Preservation of the Ozone Layer",
    aim: "Students will explain what the ozone layer does, identify a human-made cause of ozone depletion, and create a digital infographic showing how technology and international cooperation can help protect it.",
    resources: "Chromebook with internet access; Google Slides or Google Drawings; teacher/reliever display; UN Ozone Day and NZ Ministry for the Environment ozone information.",
    preparation: "Confirm students can access Google Slides or Google Drawings. Display the final product requirements: title, 3 facts, problem -> response -> result sequence, one NZ connection, and sources. Students should paraphrase rather than copy.",
    healthSafety: "Students remain seated while using Chromebooks. Keep bags and charging leads out of walkways, use school-approved websites, do not enter personal information into unfamiliar sites, and follow normal classroom expectations. Encourage a short screen break if required.",
    starter: "5 mins. Ask: What is the ozone layer, and why might people want to protect it? Students write 2-3 ideas, share briefly, and distinguish the ozone layer from climate change.",
    demonstration: "10 mins. Introduce ozone as O3, its location in the stratosphere, its absorption of harmful UV radiation, and the damage caused by chemicals such as CFCs. Explain the Montreal Protocol and demonstrate a one-slide infographic with a title, short text, icons, shapes, arrows, and a source box.",
    practice: "40 mins. Students create one infographic titled Protecting Earth’s Ozone Layer. Include what the ozone layer is, why it matters, what damaged it, what people and technology changed, and why 16 September is significant. Add PROBLEM -> TECHNOLOGICAL / GLOBAL RESPONSE -> RESULT, an Aotearoa New Zealand connection, clear digital layout, paraphrased information, and at least two sources. Extension: compare technology then and now.",
    plenary: "5 mins. Students show the infographic to a partner. Partner gives one WWW and one EBI comment. Exit question: What is one example of technology causing a problem and technology helping solve it? Save as Surname_OzoneDay_2027 and submit as directed.",
    homework: "None. If unfinished, students may complete the infographic if normal class procedures allow.",
    evaluation: "What went well? What did not go well? What changes are needed? How will impact be gathered? Did changes from last time make a difference? What are the next steps? Other comments: This lesson stands alone and does not require previous ozone-layer learning."
  };

  const payload = {
    id: lessonId,
    lesson_title: lessonPlan.theme,
    lesson_week: "Relief Plan",
    lesson_date: "2026-09-16",
    lesson_duration_minutes: 60,
    lesson_type: "Digital Technologies",
    lesson_card_color: "Rose",
    activity_name: lessonPlan.theme,
    lesson_year_level: "NZ Year 7/8 mixed",
    lesson_link_url: "",
    lesson_focus: lessonPlan.aim,
    lesson_notes: "Relief lesson imported from the Ozone Layer Word lesson plan.",
    relief_course_code: "JDTECH",
    lesson_plan: lessonPlan,
    publish_activity: true,
    add_to_calendar: false,
    created_by_email: "relief-plan-seed@westlandhigh.school.nz"
  };

  const seniorLessonId = "relief-mdtech-s2-ozone-layer-2026";
  const seniorLessonPlan = {
    unit: "Reliever Classwork",
    component: "Technology",
    theme: "International Day for the Preservation of the Ozone Layer",
    aim: "Students will explain the purpose and technological causes of ozone depletion, identify how technology, regulation, and international cooperation responded, judge reliable digital information, and create a concise evidence-based infographic.",
    resources: "Chromebook with internet access; Google Slides or Google Drawings; UN Ozone Day and Montreal Protocol information; NZ Ministry for the Environment information; normal school submission/sharing system.",
    preparation: "Confirm students can access Google Slides or Google Drawings. Display the required outcome. Students should use reliable sources, paraphrase rather than copy, record source names or URLs, and create one digital slide/infographic rather than a multi-slide presentation.",
    healthSafety: "Students remain seated while using Chromebooks, keep bags and charging leads clear of walkways, use school-approved websites, avoid entering personal information into unfamiliar sites, and follow normal classroom expectations. No workshop or practical-material hazards are involved.",
    starter: "5 mins. Prompt: A technology solves a problem today but creates an environmental problem later. Who is responsible for fixing it? Students write a brief response. Establish that ozone depletion and climate change are different environmental issues.",
    demonstration: "10 mins. Introduce the chain: useful technology -> unintended consequence -> evidence identifies problem -> technology and policy changes -> recovery. Explain stratospheric ozone, CFCs, the Montreal Protocol, source checking, and how to build a strong infographic using visual hierarchy, evidence-based statements, relationships, consistent formatting, and sources.",
    practice: "40 mins. Create one infographic titled Ozone: When Technology Has to Fix Technology. Include the need, consequence, response, result, and an Aotearoa New Zealand connection. Show cause and effect visually, use at least two reliable sources, acknowledge images, and explain whether technological progress is always positive. Another student should identify the problem, response, and result within 30 seconds.",
    plenary: "5 mins. Peer check: Is the science understandable? Is the technology connection obvious? Can you tell where the information came from? Exit response: One lesson designers and technologists should learn from the ozone-layer problem is... Save as Surname_OzoneDay_2027 and submit as normal.",
    homework: "None. If unfinished, students may complete the infographic if normal class procedures allow.",
    evaluation: "What went well? What did not go well? What changes are needed? How will impact be gathered? Did changes from last time make a difference? What are the next steps? Other comments: This is a stand-alone lesson. Year 9/10 students should show source judgement, cause-and-effect thinking, concise digital communication, and evaluation of technology’s consequences."
  };
  const seniorPayload = {
    ...payload,
    id: seniorLessonId,
    lesson_title: seniorLessonPlan.theme,
    activity_name: seniorLessonPlan.theme,
    lesson_year_level: "NZ Year 9/10 combined",
    lesson_focus: seniorLessonPlan.aim,
    lesson_notes: "Relief lesson imported from the Y9-10 Ozone Layer Word lesson plan.",
    relief_course_code: "MDTECH-S2",
    lesson_plan: seniorLessonPlan
  };

  const seniorDtechLessonId = "relief-senior-dtech-ozone-layer-2026";
  const seniorDtechLessonPlan = {
    unit: "Reliever Classwork",
    component: "Technology",
    theme: "International Day for the Preservation of the Ozone Layer",
    aim: "Students will explain the relationship between technological development, ozone-depleting substances, and environmental consequences; evaluate digital sources; analyse evidence, regulation, and redesign; and produce a concise evidence-based digital brief.",
    resources: "Chromebook with internet access; Google Slides or Google Docs; UN Ozone Day and Montreal Protocol information; NZ Ministry for the Environment information; normal school submission/sharing system.",
    preparation: "Confirm students can access Google Slides or Google Docs. Display the required outcome and source-check questions. Students should work independently, paraphrase evidence, distinguish fact from interpretation, and record sources. The outcome is one-page or one-slide, not a long presentation.",
    healthSafety: "Students remain seated while using Chromebooks, keep bags and charging leads clear of walkways, use school-approved websites, avoid entering personal information into unfamiliar sites, and follow normal expectations for appropriate internet use. Students should not rely on AI-generated summaries as evidence unless the original source is checked. No workshop hazards are involved.",
    starter: "5 mins. Prompt: When a technology produces major benefits but later causes environmental harm, what evidence should be required before society changes or restricts it? Students write 3-4 sentences. Distinguish ozone depletion from climate change and frame the lesson as a technological-systems case study.",
    demonstration: "10 mins. Introduce the systems chain: NEED -> TECHNOLOGICAL DEVELOPMENT -> WIDESPREAD USE -> UNINTENDED CONSEQUENCE -> SCIENTIFIC EVIDENCE -> POLICY/REGULATION -> TECHNOLOGICAL REDESIGN -> OUTCOME. Explain CFCs, ozone loss, the Montreal Protocol, and source evaluation using Authority, Evidence, Currency, and Corroboration. Model a concise evidence brief for a school audience.",
    practice: "40 mins. Research using at least three credible sources, including an authoritative international or NZ government/scientific source. Create one-page evidence brief or one-slide visual brief titled Ozone Layer: A Technology Systems Case Study. Include context, evidence, response, impact, an Aotearoa NZ connection, a justified 80-120 word technology judgement, clear hierarchy, concise writing, meaningful visualisation, and acknowledged sources. Y11 explains and justifies; Y12 analyses relationships and trade-offs; Y13 critically evaluates limitations, competing considerations, and future decision-making. Verify one claim against a second independent source.",
    plenary: "5 mins. Pair exchange: identify the strongest evidence in a partner’s brief and one claim that could be better supported or qualified. Exit statement: The most important lesson this case gives future technologists is... Save as Surname_OzoneDay_2027 and submit as normal.",
    homework: "None. If unfinished, students may complete the evidence brief if normal class procedures allow.",
    evaluation: "What went well? What did not go well? What changes are needed? How will impact be gathered? Did changes from last time make a difference? What are the next steps? Other comments: This is a stand-alone lesson. Senior progression is based on depth of thinking rather than separate tasks."
  };
  const seniorDtechPayload = {
    ...payload,
    id: seniorDtechLessonId,
    lesson_title: seniorDtechLessonPlan.theme,
    activity_name: seniorDtechLessonPlan.theme,
    lesson_year_level: "NZ Year 11/12/13 combined",
    lesson_focus: seniorDtechLessonPlan.aim,
    lesson_notes: "Relief lesson imported from the Y11-13 Ozone Layer Word lesson plan.",
    relief_course_code: "SENIORDTECH",
    lesson_plan: seniorDtechLessonPlan
  };

  if (!hasDatabase) {
    if (!memoryLessons.has(lessonId)) memoryLessons.set(lessonId, { ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!memoryLessons.has(seniorLessonId)) memoryLessons.set(seniorLessonId, { ...seniorPayload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (!memoryLessons.has(seniorDtechLessonId)) memoryLessons.set(seniorDtechLessonId, { ...seniorDtechPayload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return seniorDtechPayload;
  }

  await pool.query(
    `INSERT INTO ${lessonTable} (id, lesson_title, lesson_week, lesson_date, lesson_duration_minutes, lesson_type, lesson_card_color, activity_name, lesson_year_level, lesson_link_url, lesson_focus, lesson_notes, relief_course_code, lesson_plan, publish_activity, add_to_calendar, created_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
    ON CONFLICT (id) DO NOTHING`,
    [payload.id, payload.lesson_title, payload.lesson_week, payload.lesson_date, payload.lesson_duration_minutes, payload.lesson_type, payload.lesson_card_color, payload.activity_name, payload.lesson_year_level, payload.lesson_link_url, payload.lesson_focus, payload.lesson_notes, payload.relief_course_code, JSON.stringify(payload.lesson_plan), payload.publish_activity, payload.add_to_calendar, payload.created_by_email]
  );

  await pool.query(
    `INSERT INTO ${lessonTable} (id, lesson_title, lesson_week, lesson_date, lesson_duration_minutes, lesson_type, lesson_card_color, activity_name, lesson_year_level, lesson_link_url, lesson_focus, lesson_notes, relief_course_code, lesson_plan, publish_activity, add_to_calendar, created_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
     ON CONFLICT (id) DO NOTHING`,
    [seniorPayload.id, seniorPayload.lesson_title, seniorPayload.lesson_week, seniorPayload.lesson_date, seniorPayload.lesson_duration_minutes, seniorPayload.lesson_type, seniorPayload.lesson_card_color, seniorPayload.activity_name, seniorPayload.lesson_year_level, seniorPayload.lesson_link_url, seniorPayload.lesson_focus, seniorPayload.lesson_notes, seniorPayload.relief_course_code, JSON.stringify(seniorPayload.lesson_plan), seniorPayload.publish_activity, seniorPayload.add_to_calendar, seniorPayload.created_by_email]
  );

  await pool.query(
    `INSERT INTO ${lessonTable} (id, lesson_title, lesson_week, lesson_date, lesson_duration_minutes, lesson_type, lesson_card_color, activity_name, lesson_year_level, lesson_link_url, lesson_focus, lesson_notes, relief_course_code, lesson_plan, publish_activity, add_to_calendar, created_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
     ON CONFLICT (id) DO NOTHING`,
    [seniorDtechPayload.id, seniorDtechPayload.lesson_title, seniorDtechPayload.lesson_week, seniorDtechPayload.lesson_date, seniorDtechPayload.lesson_duration_minutes, seniorDtechPayload.lesson_type, seniorDtechPayload.lesson_card_color, seniorDtechPayload.activity_name, seniorDtechPayload.lesson_year_level, seniorDtechPayload.lesson_link_url, seniorDtechPayload.lesson_focus, seniorDtechPayload.lesson_notes, seniorDtechPayload.relief_course_code, JSON.stringify(seniorDtechPayload.lesson_plan), seniorDtechPayload.publish_activity, seniorDtechPayload.add_to_calendar, seniorDtechPayload.created_by_email]
  );

  return seniorDtechPayload;
}

async function syncDtechExcludedActivitiesVisibility() {
  if (!hasDatabase) {
    return 0;
  }

  await ensureActivityHubVisibilitySchema();

  const result = await pool.query(`SELECT * FROM activities`);
  const excludedIds = (Array.isArray(result.rows) ? result.rows : [])
    .filter((row) => isExcludedNonDtechActivity(row))
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);

  if (!excludedIds.length) {
    return 0;
  }

  await upsertHubVisibility(excludedIds, DTECH_HUB_NAME, false);
  await upsertHubVisibility(excludedIds, SEWING_ROOM_HUB_NAME, true);

  return excludedIds.length;
}

app.use(express.json({ limit: "8mb" }));
app.use(async (req, _res, next) => {
  req.authenticated_email = normalizeEmail(req.user?.email);
  req.auth_identity = { mode: "strict", verified: Boolean(req.authenticated_email), source: "whs_session", email: req.authenticated_email };
  next();
});
app.use(/^\/api\/(admin\/)?practical-skills\//, async (_req, res, next) => {
  try {
    await ensureCustomPracticalSkillsKitsLoaded();
    next();
  } catch (error) {
    res.status(500).json({ error: `Could not load kits. ${error.message || ""}`.trim() });
  }
});
app.use("/images/activities", express.static(path.join(__dirname, "images", "activities")));
app.use("/images/activities", express.static(path.join(__dirname, "public", "images", "activities")));
app.get("/practical-skills/library.json", async (_req, res) => {
  try {
    await ensureCustomPracticalSkillsKitsLoaded();
    const kitCards = (await readPracticalSkillsLibraryFile())
      .map((card) => getPracticalSkillsKitDefinition(card.id)
        ? {
            ...card,
            cardLabel: "LICENCE KIT",
            visual: {
              ...card.visual,
              palette: "linear-gradient(135deg, #173858 0%, #246b78 54%, #4fa38d 100%)"
            }
          }
        : card);
    const activityCards = (await Promise.all(kitCards.map((card) => buildPracticalSkillsActivityLibraryCards(card))))
      .flat();
    res.set("Cache-Control", "no-store");
    res.json([...kitCards, ...activityCards]);
  } catch (_error) {
    res.status(500).json({ error: "Could not load Practical Skills library" });
  }
});
require("./learning-pathways/library-store").registerLearningPathways(app, { pool, hasDatabase, requireAdminAccess, requireActivityWriteAccess });
async function getStaffMembers() {
  return (await getStaffDirectoryRows()).flatMap((row) => {
    const name = [row.last_name, row.first_name].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
    return collectDirectoryEmails(row, ["email_school", "email", "user_email", "staff_email", "google_email"]).slice(0, 1)
      .map((email) => ({ email, name: name || email }));
  });
}

async function getYear7To10Students() {
  const rows = dedupeToLatestStudentRows((await getStudentDirectoryRows()).map(buildStudentClassManagementRow));
  return rows.filter((row) => String(row.status || "").toLowerCase() !== "not current"
    && [7, 8, 9, 10].includes(Number(String(row.year_level || "").replace(/^year\s*/i, ""))))
    .map((row) => ({
      email: normalizeEmail(row.linked_emails?.[0] || ""), name: row.student_name,
      yearLevel: Number(String(row.year_level).replace(/^year\s*/i, "")),
      formClass: row.form_class || "", homeroom: row.homeroom || "", timetableClass: row.timetable_class || ""
    }));
}
require("./learning-pathways/activity-progress-store").registerActivityProgress(app, {
  pool, hasDatabase, getRequestUserEmail, normalizeEmail, schoolDomain: SCHOOL_EMAIL_DOMAIN,
  requireTeacherAccess: requireActivityWriteAccess, getStudents: getYear7To10Students, getStaff: getStaffMembers
});
require("./learning-pathways/progression-store").registerProgressionPathway(app, {
  pool, hasDatabase, requireTeacherAccess: requireActivityWriteAccess, requireAdminAccess, getStudents: getYear7To10Students, getStaff: getStaffMembers
});
require("./learning-pathways/comment-bank-store").registerCommentBank(app, {
  pool, hasDatabase, requireTeacherAccess: requireActivityWriteAccess, requireAdminAccess
});
// The host serves only approved UI assets, never the source directory or private records.

function normalizeEvidenceStepsPayload(value) {
  const rows = Array.isArray(value) ? value : [];

  return rows
    .map((row) => {
      const standard = String(row?.standard || "").trim();
      const steps = Array.isArray(row?.steps)
        ? row.steps
          .map((step) => ({
            text: String(step?.text || "").trim(),
            done: Boolean(step?.done)
          }))
          .filter((step) => step.text)
        : [];

      if (!standard) {
        return null;
      }

      return { standard, steps };
    })
    .filter(Boolean);
}

function upsertEvidenceRow(rows, standardKey, nextSteps) {
  const normalizedRows = normalizeEvidenceStepsPayload(rows).filter(
    (row) => String(row?.standard || "").trim() !== String(standardKey || "").trim()
  );

  normalizedRows.push({
    standard: String(standardKey || "").trim(),
    steps: Array.isArray(nextSteps) ? nextSteps : []
  });

  return normalizeEvidenceStepsPayload(normalizedRows);
}

function buildDriveFolderUrlFromId(folderId) {
  const safeId = String(folderId || "").trim();
  return safeId ? `https://drive.google.com/drive/folders/${encodeURIComponent(safeId)}` : "";
}

function normalizeEvidenceStandardSlug(value) {
  return String(value || "task-topic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "task-topic";
}

function ensureGoogleDriveFolderEvidence(rows, standardNumber, folderUrl) {
  const safeUrl = String(folderUrl || "").trim();
  if (!safeUrl || !/drive\.google\.com/i.test(safeUrl)) {
    return { rows: normalizeEvidenceStepsPayload(rows), changed: false };
  }

  const normalizedRows = normalizeEvidenceStepsPayload(rows);
  const hasExisting = normalizedRows.some((row) => (Array.isArray(row?.steps) ? row.steps : []).some((step) => {
    const text = String(step?.text || "").trim();
    return text === `GOOGLE_DRIVE_PROJECT_FOLDER_URL|${safeUrl}` || (/drive\.google\.com/i.test(text) && text.includes(safeUrl));
  }));
  if (hasExisting) {
    return { rows: normalizedRows, changed: false };
  }

  const standardSlug = normalizeEvidenceStandardSlug(standardNumber);
  const standardKey = `task-topic:${standardSlug}:version-control-google-drive`;
  const targetRow = normalizedRows.find((row) => String(row?.standard || "").trim() === standardKey);
  if (targetRow) {
    targetRow.steps.push({ text: `GOOGLE_DRIVE_PROJECT_FOLDER_URL|${safeUrl}`, done: true });
  } else {
    normalizedRows.push({
      standard: standardKey,
      steps: [{ text: `GOOGLE_DRIVE_PROJECT_FOLDER_URL|${safeUrl}`, done: true }]
    });
  }

  return { rows: normalizeEvidenceStepsPayload(normalizedRows), changed: true };
}

async function ensureProjectInterestGoogleDriveFolderEvidence(projectId, studentEmail, folderUrl) {
  if (!hasDatabase) return;
  const safeProjectId = String(projectId || "").trim();
  const safeEmail = normalizeEmail(studentEmail || "");
  const safeUrl = String(folderUrl || "").trim();
  if (!safeProjectId || !safeEmail || !safeUrl) return;

  const current = await pool.query(
    `SELECT standard_1, evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1`,
    [safeProjectId, safeEmail]
  );
  const currentRow = current.rows?.[0] || {};
  const repair = ensureGoogleDriveFolderEvidence(currentRow.evidence_steps || [], currentRow.standard_1 || "", safeUrl);
  if (!repair.changed) return;

  await pool.query(
    `INSERT INTO project_interests (project_id, student_email, evidence_steps, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (project_id, student_email) DO UPDATE
     SET evidence_steps = $3::jsonb,
         updated_at = NOW()`,
    [safeProjectId, safeEmail, JSON.stringify(repair.rows)]
  );
}

async function recordTemplateCopyInDb(projectId, studentEmail, entry) {
  if (!hasDatabase) return;
  const safeEntry = {
    templateId: String(entry?.templateId || "").trim(),
    templateTitle: String(entry?.templateTitle || "").trim(),
    fileUrl: String(entry?.fileUrl || "").trim(),
    fileName: String(entry?.fileName || "").trim(),
    processAssessmentFolderUrl: String(entry?.processAssessmentFolderUrl || "").trim(),
    destinationFolderUrl: String(entry?.destinationFolderUrl || "").trim(),
    destinationFolderId: String(entry?.destinationFolderId || "").trim(),
    copiedAt: new Date().toISOString()
  };
  if (!safeEntry.templateId) return;

  // Upsert so the copy is saved even if the student has no project_interests row yet
  // (a plain UPDATE would silently affect 0 rows and lose the sync).
  await pool.query(
    `INSERT INTO project_interests (project_id, student_email, template_copies, updated_at)
     VALUES ($1, $2, jsonb_build_array($4::jsonb), NOW())
     ON CONFLICT (project_id, student_email) DO UPDATE
     SET template_copies = (
       SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) FROM (
         SELECT elem FROM jsonb_array_elements(COALESCE(project_interests.template_copies, '[]'::jsonb)) AS elem
         WHERE elem->>'templateId' <> $3
         UNION ALL
         SELECT $4::jsonb
       ) sub
     ),
     updated_at = NOW()`,
    [projectId, studentEmail, safeEntry.templateId, JSON.stringify(safeEntry)]
  );
}

async function canManagePracticalSchedule(email) {
  return integration.canTeach(email);
}

async function listPracticalEvents() {
  if (!hasDatabase) {
    return memoryPracticalEvents
      .slice()
      .sort((left, right) => {
        const leftDate = normalizeDateOnly(left.start_date);
        const rightDate = normalizeDateOnly(right.start_date);
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
        return String(left.title || "").localeCompare(String(right.title || ""));
      });
  }

  const result = await pool.query(`
    SELECT id, title, event_type, start_date, end_date, notes, linked_activity_id, linked_url, created_by_email, created_at, updated_at
    FROM practical_schedule
    ORDER BY start_date ASC, title ASC
  `);
  return result.rows;
}

function normalizePracticalSkillStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "planning" || raw === "archive" || raw === "active") {
    return raw;
  }
  return "active";
}

function buildPracticalSkillId(title, fallbackIndex = 0) {
  const slug = slugify(title || "");
  if (slug) {
    return slug;
  }
  return `practical-skill-${fallbackIndex + 1}`;
}

function normalizePracticalSkillLibraryItem(item, fallbackIndex = 0) {
  const title = String(item?.title || "").trim();
  if (!title) {
    return null;
  }

  const id = String(item?.id || "").trim() || buildPracticalSkillId(title, fallbackIndex);
  const summary = String(item?.summary || "").trim();
  const yearLevel = String(item?.yearLevel || item?.year_level || "All Years").trim() || "All Years";
  const area = String(item?.area || "Practical Skills").trim() || "Practical Skills";
  const status = normalizePracticalSkillStatus(item?.status);
  const href = String(item?.href || "/practical-skills/").trim() || "/practical-skills/";
  const imageUrl = String(item?.imageUrl || item?.image_url || "").trim();
  const visualIcon = String(item?.visual?.icon || "PS").trim() || "PS";
  const visualPalette = String(item?.visual?.palette || "linear-gradient(135deg, #2f8f61 0%, #3ca873 54%, #65c494 100%)").trim();

  return {
    id,
    title,
    summary,
    yearLevel,
    area,
    status,
    href,
    imageUrl,
    visual: {
      icon: visualIcon,
      palette: visualPalette
    }
  };
}

async function readPracticalSkillsLibrarySeedFile() {
  let raw;
  try {
    raw = await fs.promises.readFile(PRACTICAL_SKILLS_LIBRARY_FILE, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Practical Skills library must contain a JSON array.");
  return parsed
    .map((item, index) => normalizePracticalSkillLibraryItem(item, index))
    .filter(Boolean);
}

async function ensurePracticalSkillsLibrarySchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS practical_skills_library_store (
      id TEXT PRIMARY KEY,
      cards JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// The deployed library.json is reset on every Render deploy/restart, so the
// published library lives in Postgres and the file is only the first-run seed.
async function readPracticalSkillsLibraryFile() {
  if (!hasDatabase) return readPracticalSkillsLibrarySeedFile();

  await ensurePracticalSkillsLibrarySchema();
  const result = await pool.query(`SELECT cards FROM practical_skills_library_store WHERE id = 'default' LIMIT 1`);
  const stored = result.rows?.[0]?.cards;
  if (Array.isArray(stored)) {
    return stored
      .map((item, index) => normalizePracticalSkillLibraryItem(item, index))
      .filter(Boolean);
  }

  const cards = await readPracticalSkillsLibrarySeedFile();
  await ensurePracticalSkillsKitContentSchema();
  const kitRows = await pool.query(`SELECT kit_id, content FROM practical_skills_kit_content ORDER BY kit_id`);
  for (const row of kitRows.rows || []) {
    if (cards.some((card) => card.id === row.kit_id)) continue;
    const card = buildPracticalSkillsKitLibraryCard(row.kit_id, row.content);
    if (card) cards.push(card);
  }
  return writePracticalSkillsLibraryFile(cards);
}

async function writePracticalSkillsLibraryFile(items) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item, index) => normalizePracticalSkillLibraryItem(item, index))
    .filter(Boolean);

  if (hasDatabase) {
    await ensurePracticalSkillsLibrarySchema();
    await pool.query(
      `INSERT INTO practical_skills_library_store (id, cards, updated_at)
       VALUES ('default', $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET cards = EXCLUDED.cards, updated_at = NOW()`,
      [JSON.stringify(normalized)]
    );
    return normalized;
  }

  await fs.promises.writeFile(
    PRACTICAL_SKILLS_LIBRARY_FILE,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );

  return normalized;
}

async function syncPracticalSkillsKitLibraryCard(kitId, content) {
  const safeKitId = String(kitId || "").trim();
  const title = String(content?.identity?.name || content?.bannerTitle || "").trim();
  if (!safeKitId || !title) return null;

  const cards = await readPracticalSkillsLibraryFile();
  const existingIndex = cards.findIndex((card) => card.id === safeKitId);
  const existing = existingIndex >= 0 ? cards[existingIndex] : null;
  const card = existing
    ? { ...existing, title, href: `/practical-skills/kit-worksheet.html?kit=${encodeURIComponent(safeKitId)}` }
    : buildPracticalSkillsKitLibraryCard(safeKitId, content);

  if (existingIndex >= 0) cards[existingIndex] = card;
  else cards.push(card);
  await writePracticalSkillsLibraryFile(cards);
  return card;
}

function buildPracticalSkillsKitLibraryCard(kitId, content) {
  const safeKitId = String(kitId || "").trim();
  const title = String(content?.identity?.name || content?.bannerTitle || "").trim();
  if (!safeKitId || !title) return null;
  return normalizePracticalSkillLibraryItem({
    id: safeKitId,
    title,
    summary: content.bannerSubtitle || content.learning?.whatStudentsWillLearn || `Explore the ${title} kit and complete its activities.`,
    yearLevel: content.identity?.yearLevel || "All Years",
    area: content.identity?.skillArea || "Practical Skills",
    status: content.identity?.status || "active",
    href: `/practical-skills/kit-worksheet.html?kit=${encodeURIComponent(safeKitId)}`,
    visual: { icon: content.theme?.icon || "PS" }
  });
}

async function buildPracticalSkillsActivityLibraryCards(kitCard) {
  const kitId = String(kitCard?.id || "").trim();
  if (!kitId || !getPracticalSkillsKitDefinition(kitId)) return [];

  const content = await getPracticalSkillsKitContent(kitId);
  const worksheets = Array.isArray(content?.worksheets) ? content.worksheets : [];
  const activities = Array.isArray(content?.activities) ? content.activities : [];
  const themeIcon = String(content?.theme?.icon || kitCard.visual?.icon || "PS").trim() || "PS";

  return worksheets
    .map((worksheet, index) => ({ worksheet, index }))
    .filter(({ worksheet }) => worksheet?.mergedInto === undefined && (!worksheet?.hidden || worksheet?.libraryOnly))
    .map(({ worksheet, index }) => {
      const activity = activities[index] || {};
      const title = String(activity.title || worksheet.activity || `Activity ${index + 1}`).trim();
      if (!title) return null;
      return normalizePracticalSkillLibraryItem({
        id: `activity-${kitId}-${index}`,
        title,
        summary: activity.establishes || worksheet.establishes || `Complete this activity from the ${kitCard.title} kit.`,
        yearLevel: kitCard.yearLevel || "All Years",
        area: kitCard.area || "Practical Skills",
        status: kitCard.status || "active",
        href: `/practical-skills/kit-worksheet.html?kit=${encodeURIComponent(kitId)}&activity=${index}`,
        visual: { icon: themeIcon }
      }, index);
    })
    .map((card) => card ? { ...card, cardLabel: "PRACTICAL SKILL" } : null)
    .filter(Boolean);
}

async function getPracticalSkillsCertificateTeacherRecipients() {
  return integration.emailRecipients("certificate");
}

async function getSuggestionRecipients() {
  return Array.from(new Set([...parseCsvEmails(suggestionNotificationFallback), ...await integration.emailRecipients("suggestions")]));
}

function buildSuggestionEmailHtml(record) {
  const safe = (value) => String(value || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const referenceCell = record.reference_url
    ? `<a href="${safe(record.reference_url)}">${safe(record.reference_url)}</a>`
    : "N/A";

  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;border:1px solid #d4dbe5;border-radius:12px;overflow:hidden;">
      <div style="background:#2f74b9;color:#fff;padding:16px 20px;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">DTECH HUB</div>
        <h2 style="margin:6px 0 0;font-size:32px;">New ${safe(record.suggestion_type)} Suggestion</h2>
      </div>
      <div style="padding:16px 20px;background:#f8fbff;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Date</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(new Date(record.created_at).toISOString().slice(0, 10))}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Type</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(record.suggestion_type)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Title</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(record.suggestion_title)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Suggested By</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(record.submitted_by_name)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Email</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(record.submitted_by_email)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">URL</td><td style="padding:8px;border:1px solid #d4dbe5;">${referenceCell}</td></tr>
        </table>
        <div style="margin-top:14px;">
          <div style="font-weight:700;margin-bottom:6px;">Reason</div>
          <div style="padding:10px;border:1px solid #d4dbe5;border-radius:8px;background:#fff;">${safe(record.reason)}</div>
        </div>
      </div>
    </div>
  `;
}

async function notifySuggestionByEmail(record, attachment) {
  if (!smtpTransporter || !SMTP_FROM) {
    return { status: "not_configured", recipients: [] };
  }

  const recipients = await getSuggestionRecipients();
  if (!recipients.length) {
    return { status: "no_recipients", recipients: [] };
  }

  await sendConfiguredHubEmail({
    to: recipients,
    subject: `[Hub Suggestion] ${record.suggestion_type}: ${record.suggestion_title}`,
    html: buildSuggestionEmailHtml(record),
    attachment
  });
  return { status: "sent", recipients };
}

async function sendConfiguredHubEmail({ to, cc = "", subject, html, attachment = null, emailType = "" }) {
  if (!smtpTransporter || !SMTP_FROM) {
    const error = new Error("Email is not configured. Configure the shared Google Gmail service in Core Administration.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  const mailOptions = {
    from: SMTP_FROM,
    to: Array.isArray(to) ? to.join(",") : to,
    cc: cc || undefined,
    subject,
    html
  };

  if (attachment?.buffer?.length) {
    mailOptions.attachments = [{
      filename: attachment.originalname || "attachment.pdf",
      content: attachment.buffer,
      contentType: attachment.mimetype || "application/pdf"
    }];
  }

  await smtpTransporter.sendMail(mailOptions);
  const recipients = [to, cc].flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeEmail(value)).filter(Boolean);
  const log = { sent_at: new Date().toISOString(), from_email: SMTP_FROM, recipients, subject: String(subject || ""), email_type: emailType || (String(subject || "").startsWith("[Hub Suggestion]") ? "suggestion" : String(subject || "").startsWith("[DTECH HUB] Progress Summary") ? "progress_summary" : "hub_email") };
  if (!hasDatabase) {
    memoryEmailLogs.push(log);
  } else {
    try {
      await ensureEmailLogsSchema();
      await pool.query(`INSERT INTO email_logs (sent_at, from_email, recipients, subject, email_type) VALUES (NOW(), $1, $2, $3, $4)`, [SMTP_FROM, recipients, String(subject || ""), log.email_type]);
    } catch (error) {
      console.error("[email-log] Could not record sent email:", error);
    }
  }
}

async function ensureEmailLogsSchema() {
  if (!hasDatabase) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS email_logs (id BIGSERIAL PRIMARY KEY, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), from_email TEXT, recipients TEXT[] NOT NULL DEFAULT '{}', subject TEXT, email_type TEXT)`);
  await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS from_email TEXT`);
  await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipients TEXT[] NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS subject TEXT`);
  await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS email_type TEXT`);
}

function getHubEmailErrorMessage(error) {
  const code = String(error?.code || "").toUpperCase();
  if (code === "EMAIL_NOT_CONFIGURED") return error.message;
  if (code === "EAUTH") return "The hub email account could not authenticate. Check SMTP_USER and SMTP_PASS in Render.";
  if (code === "ECONNECTION" || code === "ESOCKET") return "The hub could not connect to the email server. Check SMTP_HOST, SMTP_PORT, and SMTP_SECURE in Render.";
  return error?.message || "Could not send email.";
}

function buildAllocationApprovalEmailHtml({ studentEmail, activityName, activityCategory, teacherEmail, approvedAt }) {
  const safe = (value) => String(value || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;border:1px solid #d4dbe5;border-radius:12px;overflow:hidden;">
      <div style="background:#2f74b9;color:#fff;padding:16px 20px;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">DTECH HUB</div>
        <h2 style="margin:6px 0 0;font-size:28px;">Allocation Approved</h2>
      </div>
      <div style="padding:16px 20px;background:#f8fbff;">
        <p style="margin:0 0 10px;">Kia ora ${safe(studentEmail)},</p>
        <p style="margin:0 0 14px;">Your ${safe(activityCategory)} allocation has been approved.</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Task</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(activityName)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Category</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(activityCategory)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Approved At</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(approvedAt)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #d4dbe5;font-weight:700;">Teacher</td><td style="padding:8px;border:1px solid #d4dbe5;">${safe(teacherEmail || "Teacher")}</td></tr>
        </table>
        <p style="margin:14px 0 0;">Please check your task detail page for any standards and evidence checklist expectations.</p>
      </div>
    </div>
  `;
}

async function notifyAllocationApprovedByEmail({ studentEmail, teacherEmail, activityName, activityCategory }) {
  if (!smtpTransporter || !SMTP_FROM) {
    return { status: "not_configured" };
  }

  const toEmail = normalizeEmail(studentEmail);
  const ccEmail = normalizeEmail(teacherEmail);
  if (!toEmail) {
    return { status: "missing_student_email" };
  }

  const approvedAt = new Date().toISOString().slice(0, 10);
  const categoryLabel = String(activityCategory || "Project").trim() || "Project";
  const taskName = String(activityName || "Allocated task").trim() || "Allocated task";

  const mailOptions = {
    from: SMTP_FROM,
    to: toEmail,
    cc: ccEmail || undefined,
    subject: `[DTECH HUB] ${categoryLabel} Approved: ${taskName}`,
    html: buildAllocationApprovalEmailHtml({
      studentEmail: toEmail,
      activityName: taskName,
      activityCategory: categoryLabel,
      teacherEmail: ccEmail,
      approvedAt
    })
  };

  await sendConfiguredHubEmail({
    to: toEmail,
    cc: ccEmail,
    subject: mailOptions.subject,
    html: mailOptions.html
  });
  return {
    status: "sent",
    to: toEmail,
    cc: ccEmail || ""
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getEffectiveAuthMode() {
  if (AUTH_MODE === "legacy" || AUTH_MODE === "hybrid" || AUTH_MODE === "strict") {
    return AUTH_MODE;
  }
  return "hybrid";
}

const effectiveAuthMode = getEffectiveAuthMode();
if (effectiveAuthMode !== AUTH_MODE) {
  console.warn(`[startup] Invalid AUTH_MODE='${AUTH_MODE}'. Falling back to '${effectiveAuthMode}'.`);
}

function extractBearerToken(req) {
  const header = String(req?.headers?.authorization || "").trim();
  if (!header) {
    return "";
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ? String(match[1]).trim() : "";
}

async function verifyGoogleIdTokenAndExtractIdentity(idToken) {
  const token = String(idToken || "").trim();
  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  if (!googleAuthClient) {
    return { ok: false, error: "google_auth_library_unavailable" };
  }

  if (!GOOGLE_ID_TOKEN_AUDIENCES.length) {
    return { ok: false, error: "missing_google_audience_config" };
  }

  try {
    const ticket = await googleAuthClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_ID_TOKEN_AUDIENCES
    });

    const payload = ticket?.getPayload?.() || {};
    const email = normalizeEmail(payload?.email || "");
    const emailVerified = Boolean(payload?.email_verified);
    const hostedDomain = String(payload?.hd || "").trim().toLowerCase();

    if (!email || !emailVerified) {
      return { ok: false, error: "email_not_verified" };
    }

    if (!isSchoolEmail(email)) {
      return { ok: false, error: "non_school_email" };
    }

    return {
      ok: true,
      email,
      hostedDomain,
      subject: String(payload?.sub || "").trim(),
      givenName: String(payload?.given_name || "").trim(),
      familyName: String(payload?.family_name || "").trim(),
      audience: String(payload?.aud || "").trim(),
      issuer: String(payload?.iss || "").trim()
    };
  } catch (_error) {
    return { ok: false, error: "token_verification_failed" };
  }
}

function getRequestUserEmail(req) {
  return normalizeEmail(req.user?.email);
}

function isSchoolEmail(email) {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && normalized.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`));
}

function parseTrelloCardIdentifier(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const shortLinkFromRaw = raw.match(/^[a-zA-Z0-9]{8}$/);
  if (shortLinkFromRaw) {
    return shortLinkFromRaw[0];
  }

  try {
    const parsed = new URL(raw);
    const cardMatch = parsed.pathname.match(/\/c\/([a-zA-Z0-9]+)/i);
    if (cardMatch?.[1]) {
      return cardMatch[1];
    }
  } catch (_error) {
  }

  return "";
}

function parseTrelloBoardIdentifier(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const shortLinkFromRaw = raw.match(/^[a-zA-Z0-9]{8}$/);
  if (shortLinkFromRaw) {
    return shortLinkFromRaw[0];
  }

  try {
    const parsed = new URL(raw);
    const boardMatch = parsed.pathname.match(/\/b\/([a-zA-Z0-9]+)/i);
    if (boardMatch?.[1]) {
      return boardMatch[1];
    }
  } catch (_error) {
  }

  return "";
}

function formatTrelloCommentText({ activityTitle, progressPercent, note, createdByEmail }) {
  const lines = [];
  lines.push(`[DTECH-HUB] Work log update`);
  if (activityTitle) {
    lines.push(`Activity: ${activityTitle}`);
  }
  if (Number.isFinite(progressPercent)) {
    lines.push(`Progress: ${Math.max(0, Math.min(100, Math.round(progressPercent)))}%`);
  }
  if (createdByEmail) {
    lines.push(`Student: ${createdByEmail}`);
  }
  if (note) {
    lines.push(`Note: ${note}`);
  }
  return lines.join("\n");
}

async function trelloApiRequest(pathname, { token = "", method = "GET", query = {}, body = null } = {}) {
  if (!TRELLO_API_KEY) {
    const error = new Error("Trello API key is not configured.");
    error.status = 503;
    throw error;
  }

  const params = new URLSearchParams({ key: TRELLO_API_KEY });
  if (token) {
    params.set("token", token);
  }

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const response = await fetch(`https://api.trello.com/1${pathname}?${params.toString()}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.message || payload?.error || `Trello request failed (${response.status}).`);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function getStoredTrelloConnection(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  if (!hasDatabase) {
    return memoryTrelloConnections.get(normalizedEmail) || null;
  }

  const result = await pool.query(
    `
      SELECT student_email, trello_token, trello_member_id, trello_username, trello_full_name, connected_at, updated_at
      FROM student_trello_connections
      WHERE student_email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return result.rows?.[0] || null;
}

async function saveTrelloConnection(email, token, member) {
  const normalizedEmail = normalizeEmail(email);
  const row = {
    student_email: normalizedEmail,
    trello_token: String(token || "").trim(),
    trello_member_id: String(member?.id || "").trim(),
    trello_username: String(member?.username || "").trim(),
    trello_full_name: String(member?.fullName || "").trim(),
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (!hasDatabase) {
    memoryTrelloConnections.set(normalizedEmail, row);
    return row;
  }

  const result = await pool.query(
    `
      INSERT INTO student_trello_connections (
        student_email,
        trello_token,
        trello_member_id,
        trello_username,
        trello_full_name,
        connected_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (student_email)
      DO UPDATE SET
        trello_token = EXCLUDED.trello_token,
        trello_member_id = EXCLUDED.trello_member_id,
        trello_username = EXCLUDED.trello_username,
        trello_full_name = EXCLUDED.trello_full_name,
        updated_at = NOW()
      RETURNING student_email, trello_token, trello_member_id, trello_username, trello_full_name, connected_at, updated_at
    `,
    [
      normalizedEmail,
      row.trello_token,
      row.trello_member_id || null,
      row.trello_username || null,
      row.trello_full_name || null
    ]
  );

  return result.rows?.[0] || row;
}

async function deleteTrelloConnection(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;

  if (!hasDatabase) {
    memoryTrelloConnections.delete(normalizedEmail);
    return;
  }

  await pool.query(`DELETE FROM student_trello_connections WHERE student_email = $1`, [normalizedEmail]);
}

function extractGoogleDriveFolderId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^[A-Za-z0-9_-]{20,}$/.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || "").toLowerCase();
    if (!host.includes("google.com")) {
      return "";
    }

    const folderPathMatch = String(parsed.pathname || "").match(/\/folders\/([A-Za-z0-9_-]+)/i);
    if (folderPathMatch?.[1]) {
      return String(folderPathMatch[1]).trim();
    }

    const queryId = String(parsed.searchParams.get("id") || "").trim();
    if (/^[A-Za-z0-9_-]{20,}$/.test(queryId)) {
      return queryId;
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function normalizeGoogleDriveFolderUrl(value) {
  const folderId = extractGoogleDriveFolderId(value);
  if (!folderId) return "";
  return `https://drive.google.com/drive/folders/${folderId}`;
}

async function listStudentHaparaFolders() {
  if (!hasDatabase) {
    return Array.from(memoryStudentHaparaFolders.values())
      .sort((a, b) => String(a?.student_email || "").localeCompare(String(b?.student_email || "")));
  }

  await ensureStudentHaparaFoldersSchema();
  const result = await pool.query(
    `
      SELECT student_email, folder_url, folder_id, class_label, notes, updated_by_email, created_at, updated_at
      FROM student_hapara_folders
      ORDER BY student_email ASC
    `
  );

  return Array.isArray(result?.rows) ? result.rows : [];
}

async function upsertStudentHaparaFoldersBulk(rows, updatedByEmail = "") {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const dedupedByEmail = new Map();
  let skipped = 0;

  sourceRows.forEach((entry) => {
    const studentEmail = normalizeEmail(entry?.student_email || entry?.email || entry?.studentEmail || "");
    const rawFolderValue = String(entry?.folder_url || entry?.folderUrl || entry?.folder_id || entry?.folderId || "").trim();
    const folderId = extractGoogleDriveFolderId(rawFolderValue);
    const normalizedDriveFolderUrl = normalizeGoogleDriveFolderUrl(rawFolderValue);
    const folderUrl = normalizedDriveFolderUrl || rawFolderValue;

    if (!studentEmail || !folderUrl) {
      skipped += 1;
      return;
    }

    dedupedByEmail.set(studentEmail, {
      student_email: studentEmail,
      folder_url: folderUrl,
      folder_id: folderId || "",
      class_label: String(entry?.class_label || entry?.classLabel || entry?.class || "").trim(),
      notes: String(entry?.notes || "").trim(),
      updated_by_email: normalizeEmail(updatedByEmail)
    });
  });

  const normalizedRows = Array.from(dedupedByEmail.values());
  if (!normalizedRows.length) {
    return { upserted: 0, skipped, rows: [] };
  }

  if (!hasDatabase) {
    normalizedRows.forEach((row) => {
      const existing = memoryStudentHaparaFolders.get(row.student_email) || {};
      const next = {
        ...existing,
        ...row,
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryStudentHaparaFolders.set(row.student_email, next);
    });

    return { upserted: normalizedRows.length, skipped, rows: normalizedRows };
  }

  await ensureStudentHaparaFoldersSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of normalizedRows) {
      await client.query(
        `
          INSERT INTO student_hapara_folders (
            student_email,
            folder_url,
            folder_id,
            class_label,
            notes,
            updated_by_email,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (student_email)
          DO UPDATE SET
            folder_url = EXCLUDED.folder_url,
            folder_id = EXCLUDED.folder_id,
            class_label = EXCLUDED.class_label,
            notes = EXCLUDED.notes,
            updated_by_email = EXCLUDED.updated_by_email,
            updated_at = NOW()
        `,
        [
          row.student_email,
          row.folder_url || "",
          row.folder_id || "",
          row.class_label || null,
          row.notes || null,
          row.updated_by_email || null
        ]
      );
    }

    await client.query("COMMIT");
    return { upserted: normalizedRows.length, skipped, rows: normalizedRows };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteStudentHaparaFolder(email) {
  const studentEmail = normalizeEmail(email);
  if (!studentEmail) return false;

  if (!hasDatabase) {
    return memoryStudentHaparaFolders.delete(studentEmail);
  }

  await ensureStudentHaparaFoldersSchema();
  const result = await pool.query(
    `DELETE FROM student_hapara_folders WHERE student_email = $1`,
    [studentEmail]
  );
  return Number(result?.rowCount || 0) > 0;
}

async function ensureStudentDriveSetupSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_drive_setup (
      student_email TEXT PRIMARY KEY,
      process_assessment_folder_id TEXT,
      mdtech_project_folder_id TEXT,
      confirmed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE student_drive_setup ADD COLUMN IF NOT EXISTS process_assessment_folder_id TEXT`);
  await pool.query(`ALTER TABLE student_drive_setup ADD COLUMN IF NOT EXISTS mdtech_project_folder_id TEXT`);
  await pool.query(`ALTER TABLE student_drive_setup ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE student_drive_setup ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensureExternalAssessmentAllocationsSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_external_assessment_allocations (
      student_email TEXT PRIMARY KEY,
      project_exam_standard TEXT,
      computer_science_exam_standard TEXT,
      updated_by_email TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE student_external_assessment_allocations ADD COLUMN IF NOT EXISTS project_exam_standard TEXT`);
  await pool.query(`ALTER TABLE student_external_assessment_allocations ADD COLUMN IF NOT EXISTS computer_science_exam_standard TEXT`);
  await pool.query(`ALTER TABLE student_external_assessment_allocations ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE student_external_assessment_allocations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensureExternalExamIntentionsSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_external_exam_intentions (
      student_email TEXT PRIMARY KEY,
      decision TEXT NOT NULL CHECK (decision IN ('yes', 'no')),
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE student_external_exam_intentions ADD COLUMN IF NOT EXISTS decision TEXT`);
  await pool.query(`ALTER TABLE student_external_exam_intentions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE student_external_exam_intentions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

function normalizeExternalExamIntention(value) {
  const answer = String(value || "").trim().toLowerCase();
  if (/^(?:no\b|not\b|i do not\b|i don't\b)/.test(answer)) return "no";
  if (/^(?:yes\b|i intend\b|i will\b|i am\b)/.test(answer)) return "yes";
  return "";
}

function normalizeExternalExamStudentEmail(value) {
  const raw = String(value || "").trim().toLowerCase();
  const escapedDomain = SCHOOL_EMAIL_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`[a-z0-9._%+-]+@${escapedDomain}\\b`, "i"));
  return normalizeEmail(match?.[0] || raw);
}

async function ensureStudentTrackerCommentsSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_tracker_comments (
      student_email TEXT PRIMARY KEY,
      comment TEXT NOT NULL DEFAULT '',
      updated_by_email TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE student_tracker_comments ADD COLUMN IF NOT EXISTS comment TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE student_tracker_comments ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE student_tracker_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

async function ensureDecompositionCoverageSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_decomposition_coverage (
      student_email TEXT NOT NULL,
      activity_id TEXT NOT NULL,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      trello_task_count INTEGER NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_email, activity_id)
    );
  `);
}

async function ensureTriallingComponentsSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_trialling_components (
      student_email TEXT NOT NULL,
      activity_id TEXT NOT NULL,
      presentation_id TEXT,
      components JSONB NOT NULL DEFAULT '[]'::jsonb,
      component_count INTEGER NOT NULL DEFAULT 0,
      modified_time TEXT,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_email, activity_id)
    );
  `);
}

function normalizeTriallingComponents(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean))).slice(0, 30);
}

async function saveTriallingComponents(email, activityId, presentationId, components, modifiedTime) {
  const studentEmail = normalizeEmail(email);
  const safeActivityId = String(activityId || "").trim();
  const safePresentationId = String(presentationId || "").trim();
  const normalizedComponents = normalizeTriallingComponents(components);
  if (!studentEmail || !safeActivityId) return null;

  const record = {
    student_email: studentEmail,
    activity_id: safeActivityId,
    presentation_id: safePresentationId,
    components: normalizedComponents,
    component_count: normalizedComponents.length,
    modified_time: String(modifiedTime || "").trim(),
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (!hasDatabase) {
    memoryTriallingComponents.set(`${studentEmail}:${safeActivityId}`, record);
    return record;
  }

  await ensureTriallingComponentsSchema();
  const result = await pool.query(
    `
      INSERT INTO student_trialling_components
        (student_email, activity_id, presentation_id, components, component_count, modified_time, synced_at, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW())
      ON CONFLICT (student_email, activity_id) DO UPDATE SET
        presentation_id = EXCLUDED.presentation_id,
        components = EXCLUDED.components,
        component_count = EXCLUDED.component_count,
        modified_time = EXCLUDED.modified_time,
        synced_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `,
    [studentEmail, safeActivityId, safePresentationId, JSON.stringify(normalizedComponents), normalizedComponents.length, record.modified_time]
  );
  return result.rows?.[0] || null;
}

async function getTriallingComponents(email, activityId) {
  const studentEmail = normalizeEmail(email);
  const safeActivityId = String(activityId || "").trim();
  if (!studentEmail || !safeActivityId) return null;

  if (!hasDatabase) {
    return memoryTriallingComponents.get(`${studentEmail}:${safeActivityId}`) || null;
  }

  await ensureTriallingComponentsSchema();
  const result = await pool.query(
    `SELECT * FROM student_trialling_components WHERE student_email = $1 AND activity_id = $2 LIMIT 1`,
    [studentEmail, safeActivityId]
  );
  return result.rows?.[0] || null;
}

function buildTriallingComponentsPayload(row) {
  if (!row) return { ok: true, found: false, components: [], component_count: 0, synced_at: null, updated_at: null };
  const components = normalizeTriallingComponents(row.components);
  return {
    ok: true,
    found: true,
    components,
    component_count: Math.max(0, Number.parseInt(row.component_count, 10) || components.length),
    presentation_id: String(row.presentation_id || "").trim(),
    modified_time: String(row.modified_time || "").trim(),
    synced_at: row.synced_at || null,
    updated_at: row.updated_at || null
  };
}

async function ensureDigiMedEfficientToolsSchema() {
  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_digimed_efficient_tools (
      student_email TEXT NOT NULL,
      activity_id TEXT NOT NULL,
      tools JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (student_email, activity_id)
    );
  `);
}

function normalizeDigiMedEfficientTools(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean))).slice(0, 30);
}

async function saveDigiMedEfficientTools(email, activityId, tools) {
  const studentEmail = normalizeEmail(email);
  const safeActivityId = String(activityId || "").trim();
  const normalizedTools = normalizeDigiMedEfficientTools(tools);
  if (!studentEmail || !safeActivityId) return null;

  const record = {
    student_email: studentEmail,
    activity_id: safeActivityId,
    tools: normalizedTools,
    updated_at: new Date().toISOString()
  };

  if (!hasDatabase) {
    memoryDigiMedEfficientTools.set(`${studentEmail}:${safeActivityId}`, record);
    return record;
  }

  await ensureDigiMedEfficientToolsSchema();
  const result = await pool.query(
    `
      INSERT INTO student_digimed_efficient_tools
        (student_email, activity_id, tools, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (student_email, activity_id) DO UPDATE SET
        tools = EXCLUDED.tools,
        updated_at = NOW()
      RETURNING *
    `,
    [studentEmail, safeActivityId, JSON.stringify(normalizedTools)]
  );
  return result.rows?.[0] || null;
}

async function getDigiMedEfficientTools(email, activityId) {
  const studentEmail = normalizeEmail(email);
  const safeActivityId = String(activityId || "").trim();
  if (!studentEmail || !safeActivityId) return null;

  if (!hasDatabase) {
    return memoryDigiMedEfficientTools.get(`${studentEmail}:${safeActivityId}`) || null;
  }

  await ensureDigiMedEfficientToolsSchema();
  const result = await pool.query(
    `SELECT * FROM student_digimed_efficient_tools WHERE student_email = $1 AND activity_id = $2 LIMIT 1`,
    [studentEmail, safeActivityId]
  );
  return result.rows?.[0] || null;
}

function buildDigiMedEfficientToolsPayload(row) {
  if (!row) return { ok: true, found: false, tools: [], updated_at: null };
  return {
    ok: true,
    found: true,
    tools: normalizeDigiMedEfficientTools(row.tools),
    updated_at: row.updated_at || null
  };
}

function normalizeDecompositionCoverageRows(values) {
  return (Array.isArray(values) ? values : [])
    .map((row) => ({
      label: String(row?.label || "").trim(),
      count: Math.max(0, Number.parseInt(row?.count, 10) || 0)
    }))
    .filter((row) => row.label);
}

async function saveDecompositionCoverage(email, activityId, categories, trelloTaskCount) {
  const studentEmail = normalizeEmail(email);
  const safeActivityId = String(activityId || "").trim();
  if (!studentEmail || !safeActivityId) return null;

  const rows = normalizeDecompositionCoverageRows(categories);
  const count = Math.max(0, Number.parseInt(trelloTaskCount, 10) || 0);
  const nowIso = new Date().toISOString();

  if (!hasDatabase) {
    const record = {
      student_email: studentEmail,
      activity_id: safeActivityId,
      categories: rows,
      trello_task_count: count,
      synced_at: nowIso,
      updated_at: nowIso
    };
    memoryDecompositionCoverage.set(`${studentEmail}:${safeActivityId}`, record);
    return record;
  }

  await ensureDecompositionCoverageSchema();
  const result = await pool.query(
    `
      INSERT INTO student_decomposition_coverage (student_email, activity_id, categories, trello_task_count, synced_at, updated_at)
      VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
      ON CONFLICT (student_email, activity_id) DO UPDATE SET
        categories = EXCLUDED.categories,
        trello_task_count = EXCLUDED.trello_task_count,
        synced_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `,
    [studentEmail, safeActivityId, JSON.stringify(rows), count]
  );
  return result.rows?.[0] || null;
}

async function getDecompositionCoverage(email, activityId) {
  const studentEmail = normalizeEmail(email);
  const safeActivityId = String(activityId || "").trim();
  if (!studentEmail || !safeActivityId) return null;

  if (!hasDatabase) {
    return memoryDecompositionCoverage.get(`${studentEmail}:${safeActivityId}`) || null;
  }

  await ensureDecompositionCoverageSchema();
  const result = await pool.query(
    `SELECT * FROM student_decomposition_coverage WHERE student_email = $1 AND activity_id = $2 LIMIT 1`,
    [studentEmail, safeActivityId]
  );
  return result.rows?.[0] || null;
}

function buildDecompositionCoveragePayload(row) {
  if (!row) {
    return { ok: true, found: false, categories: [], trello_task_count: 0, synced_at: null, updated_at: null };
  }

  return {
    ok: true,
    found: true,
    categories: normalizeDecompositionCoverageRows(row.categories),
    trello_task_count: Math.max(0, Number.parseInt(row.trello_task_count, 10) || 0),
    synced_at: row.synced_at || null,
    updated_at: row.updated_at || null
  };
}

async function ensureTemplateLibrarySchema() {  if (!hasDatabase) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS template_library_entries (
      template_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      standard_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
      criteria_text TEXT,
      summary TEXT,
      image_url TEXT,
      template_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'live',
      sort_order INTEGER NOT NULL DEFAULT 0,
      source_folder_id TEXT,
      section_name TEXT,
      updated_by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS standard_codes JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS criteria_text TEXT`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS summary TEXT`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS template_url TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live'`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS source_folder_id TEXT`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS section_name TEXT`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS updated_by_email TEXT`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE template_library_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
}

function toTemplateLibraryEntry(row, fallbackIndex = 0) {
  const buildStableTemplateThumbnailUrl = (templateUrl = "", imageUrl = "") => {
    const template = String(templateUrl || "").trim();
    const image = String(imageUrl || "").trim();

    const extractSlidesId = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const directIdMatch = raw.match(/^[A-Za-z0-9_-]{20,}$/);
      if (directIdMatch) return directIdMatch[0];
      const pathMatch = raw.match(/\/presentation\/d\/([A-Za-z0-9_-]{20,})/i);
      if (pathMatch?.[1]) return pathMatch[1];
      return "";
    };

    const templateId = extractSlidesId(template);
    const imageId = extractSlidesId(image);
    const stableId = templateId || imageId;
    if (stableId) {
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(stableId)}&sz=w1400`;
    }

    return image;
  };

  const standardCodes = Array.isArray(row?.standard_codes)
    ? row.standard_codes
    : (Array.isArray(row?.standardCodes) ? row.standardCodes : []);
  const safeTemplateUrl = String(row?.template_url || row?.templateUrl || "").trim();
  const safeImageUrl = buildStableTemplateThumbnailUrl(safeTemplateUrl, String(row?.image_url || row?.imageUrl || "").trim());
  return {
    id: String(row?.template_id || row?.id || "").trim(),
    title: String(row?.title || "Untitled Template").trim(),
    standardCodes: standardCodes.map((code) => String(code || "").trim()).filter(Boolean),
    criteriaText: String(row?.criteria_text || row?.criteriaText || "").trim(),
    summary: String(row?.summary || "").trim(),
    imageUrl: safeImageUrl,
    templateUrl: safeTemplateUrl,
    status: String(row?.status || "live").trim().toLowerCase() === "coming-soon" ? "coming-soon" : "live",
    sortOrder: Number(row?.sort_order ?? row?.sortOrder ?? fallbackIndex + 1) || fallbackIndex + 1,
    sourceFolderId: String(row?.source_folder_id || row?.sourceFolderId || "").trim(),
    sectionName: String(row?.section_name || row?.sectionName || "").trim()
  };
}

function compareTemplateLibraryEntries(left, right) {
  const leftTitle = String(left?.title || "").trim().toLowerCase();
  const rightTitle = String(right?.title || "").trim().toLowerCase();
  const isPrimaryProcessTemplateTitle = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "process slide templates"
      || normalized === "afull - digital outcome details template";
  };
  const leftPriority = isPrimaryProcessTemplateTitle(leftTitle) ? 0 : 1;
  const rightPriority = isPrimaryProcessTemplateTitle(rightTitle) ? 0 : 1;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftSort = Number(left?.sortOrder || 0);
  const rightSort = Number(right?.sortOrder || 0);
  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  return leftTitle.localeCompare(rightTitle);
}

function inferCanonicalTemplateIdentityFromTitle(title) {
  const normalizedTitle = String(title || "").trim().toLowerCase();

  if (!normalizedTitle) {
    return null;
  }

  if (
    normalizedTitle.includes("process slide templates")
    || /afull\s*-\s*digital\s*outcome\s*details\s*template/.test(normalizedTitle)
  ) {
    return {
      id: "process-slide-templates",
      title: "AFULL - Digital Outcome Details Template",
      criteriaText: ""
    };
  }

  if (/digital\s*outcome\s*description|description\s*-\s*google\s*slides/.test(normalizedTitle)) {
    return {
      id: "digital-outcome-description",
      title: "Digital Outcome Description",
      criteriaText: "Describe what the digital outcome is, who it is for, and what it must do."
    };
  }

  if (/target\s+audience|end\s+user/.test(normalizedTitle)) {
    return {
      id: "target-audience",
      title: "Target Audience",
      criteriaText: "Identify the target audience or end user for this outcome."
    };
  }

  if (/project\s+management/.test(normalizedTitle)) {
    return {
      id: "project-management",
      title: "Project Management",
      criteriaText: "Use recognised and appropriate project management techniques to plan the development of a digital technologies outcome."
    };
  }

  if (/triall?ing\s+components|trailing\s+components|trailing\s+comonents/.test(normalizedTitle)) {
    return {
      id: "trialling-components",
      title: "Trialling Components",
      criteriaText: "Trial components of the digital technologies outcome and use evidence to select and improve them."
    };
  }

  if (/use\s+of\s+tools?\s*(&|and)\s*techniques/.test(normalizedTitle)) {
    return {
      id: "use-of-tools-and-techniques",
      title: "Use of Tools & Techniques",
      criteriaText: "Show the tools and techniques you used, and explain how they are appropriate for the purpose and end users."
    };
  }

  if (/tools\s*(&|and)\s*techniques/.test(normalizedTitle)) {
    return {
      id: "tools-and-techniques",
      title: "Tools & Techniques",
      criteriaText: "List the tools you use and describe the techniques you implement with each one."
    };
  }

  if (/testing\s+functions|test(?:ing)?\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/.test(normalizedTitle)) {
    const testingFunctionsSubtopicMatch = String(title || "").trim().match(/^testing\s+functions\s*-\s*(.+)$/i);
    if (testingFunctionsSubtopicMatch?.[1]) {
      const subtopicRaw = String(testingFunctionsSubtopicMatch[1] || "").trim();
      const subtopicSlug = subtopicRaw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const fallbackSlug = subtopicSlug || "topic";
      return {
        id: `testing-functions-${fallbackSlug}`,
        title: `Testing Functions - ${subtopicRaw}`,
        criteriaText: "Test that the digital technologies outcome functions as intended."
      };
    }

    return {
      id: "testing-functions",
      title: "Testing Functions",
      criteriaText: "Test that the digital technologies outcome functions as intended."
    };
  }

  if (/relevant\s+(?:digimed\s+)?conventions|relevant\s+conventions\s+template/.test(normalizedTitle)) {
    return {
      id: "relevant-digimed-conventions",
      title: "Relevant DigiMed Conventions",
      criteriaText: "Use relevant conventions for the media type."
    };
  }

  if (/user\s+experience\s+(?:\(ux\)\s+)?principles|ux\s+principles/.test(normalizedTitle)) {
    return {
      id: "user-experience-principles",
      title: "User Experience (UX) Principles",
      criteriaText: "Apply user experience principles relevant to the purpose of the outcome."
    };
  }

  if (/afull\s*-\s*relevant\s*implications\s*template/.test(normalizedTitle)) {
    return {
      id: "relevant-implications",
      title: "AFULL - Relevant Implications Template",
      criteriaText: "Identify relevant implications and justify how your project addresses them."
    };
  }

  const relevantImplicationsSubtopicMatch = String(title || "").trim().match(/^relevant\s+implications\s*-\s*(.+)$/i);
  if (relevantImplicationsSubtopicMatch?.[1]) {
    const subtopicRaw = String(relevantImplicationsSubtopicMatch[1] || "").trim();
    const subtopicSlug = subtopicRaw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const fallbackSlug = subtopicSlug || "topic";
    return {
      id: `relevant-implications-${fallbackSlug}`,
      title: `Relevant Implications - ${subtopicRaw}`,
      criteriaText: "Identify relevant implications and justify how your project addresses them."
    };
  }

  if (/development\s+steps|outcome\s+developed|developed|development|tools\/?technologies/.test(normalizedTitle)) {
    return {
      id: "development-steps",
      title: "Development Steps",
      criteriaText: "Explain how the outcome will be developed and what tools/technologies will be used."
    };
  }

  if (/relevant\s+implications/.test(normalizedTitle)) {
    return {
      id: "relevant-implications",
      title: "Relevant Implications",
      criteriaText: "Identify relevant implications and justify how your project addresses them."
    };
  }

  if (/project\s+success\s+criteria|success\s+criteria|success\s+will\s+be\s+measured|success\s+will\s+be\s+evaluated/.test(normalizedTitle)) {
    return {
      id: "project-success-criteria",
      title: "Project Success Criteria",
      criteriaText: "State how success will be measured or evaluated."
    };
  }

  if (/speaker\s*notes|criteria\s*mapping/.test(normalizedTitle)) {
    return {
      id: "speaker-notes-criteria-mapping",
      title: "Speaker Notes Criteria Mapping",
      criteriaText: "Map each presented slide to assessment criteria in Speaker Notes."
    };
  }

  if (/decomposition\s+tasks?/.test(normalizedTitle)) {
    return {
      id: "decomposition-tasks",
      title: "Decomposition Tasks",
      criteriaText: "Break the project into smaller, manageable tasks."
    };
  }

  return null;
}

async function listTemplateLibraryEntries() {
  if (!hasDatabase) {
    const rows = Array.from(memoryTemplateLibraryEntries.values())
      .sort(compareTemplateLibraryEntries);
    const memoryEntries = rows.map((row, index) => toTemplateLibraryEntry(row, index));
    return memoryEntries.length ? memoryEntries : DEFAULT_TEMPLATE_LIBRARY_ENTRIES.map((row, index) => toTemplateLibraryEntry(row, index));
  }

  await ensureTemplateLibrarySchema();
  const result = await pool.query(
    `
      SELECT template_id, title, standard_codes, criteria_text, summary, image_url, template_url, status, sort_order, source_folder_id, section_name
      FROM template_library_entries
      ORDER BY CASE WHEN lower(title) = 'process slide templates' THEN 0 ELSE 1 END ASC, sort_order ASC, lower(title) ASC
    `
  );

  const entries = Array.isArray(result?.rows) ? result.rows.map((row, index) => toTemplateLibraryEntry(row, index)).sort(compareTemplateLibraryEntries) : [];
  if (!entries.length) {
    return DEFAULT_TEMPLATE_LIBRARY_ENTRIES.map((row, index) => toTemplateLibraryEntry(row, index));
  }

  // Fill in any default templates (e.g. "tools-and-techniques") that an admin hasn't added to the DB yet,
  // so their hero preview still resolves instead of falling back to "Template Preview Not Available".
  const defaultsById = new Map(DEFAULT_TEMPLATE_LIBRARY_ENTRIES.map((row) => [String(row?.id || "").trim().toLowerCase(), row]));
  const mergedEntries = entries.map((entry) => {
    const key = String(entry?.id || "").trim().toLowerCase();
    const fallback = defaultsById.get(key);
    const hasTemplateUrl = Boolean(String(entry?.templateUrl || "").trim());
    // A preview image cannot be opened as a template, so restore the default when the Slides URL is missing.
    if (fallback && !hasTemplateUrl) {
      return toTemplateLibraryEntry({ ...fallback, sortOrder: entry.sortOrder }, 0);
    }
    return entry;
  });

  const existingIds = new Set(entries.map((entry) => String(entry?.id || "").trim().toLowerCase()));
  const missingDefaults = DEFAULT_TEMPLATE_LIBRARY_ENTRIES
    .filter((row) => !existingIds.has(String(row?.id || "").trim().toLowerCase()))
    .map((row, index) => toTemplateLibraryEntry(row, entries.length + index));

  return [...mergedEntries, ...missingDefaults];
}

async function upsertTemplateLibraryEntries(entries, updatedByEmail = "") {
  const source = Array.isArray(entries) ? entries : [];
  const normalized = source
    .map((row, index) => toTemplateLibraryEntry(row, index))
    .filter((row) => row.id && row.templateUrl);

  if (!normalized.length) {
    return { upserted: 0 };
  }

  if (!hasDatabase) {
    normalized.forEach((entry, index) => {
      memoryTemplateLibraryEntries.set(entry.id, {
        ...entry,
        sortOrder: entry.sortOrder || index + 1,
        updatedByEmail: normalizeEmail(updatedByEmail),
        updatedAt: new Date().toISOString()
      });
    });
    return { upserted: normalized.length };
  }

  await ensureTemplateLibrarySchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const entry of normalized) {
      await client.query(
        `
          INSERT INTO template_library_entries (
            template_id, title, standard_codes, criteria_text, summary, image_url, template_url,
            status, sort_order, source_folder_id, section_name, updated_by_email, created_at, updated_at
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          ON CONFLICT (template_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            standard_codes = EXCLUDED.standard_codes,
            criteria_text = EXCLUDED.criteria_text,
            summary = EXCLUDED.summary,
            image_url = EXCLUDED.image_url,
            template_url = EXCLUDED.template_url,
            status = EXCLUDED.status,
            sort_order = EXCLUDED.sort_order,
            source_folder_id = EXCLUDED.source_folder_id,
            section_name = EXCLUDED.section_name,
            updated_by_email = EXCLUDED.updated_by_email,
            updated_at = NOW()
        `,
        [
          entry.id,
          entry.title,
          JSON.stringify(entry.standardCodes || []),
          entry.criteriaText || null,
          entry.summary || null,
          entry.imageUrl || null,
          entry.templateUrl,
          entry.status || "live",
          Number(entry.sortOrder || 0),
          entry.sourceFolderId || null,
          entry.sectionName || null,
          normalizeEmail(updatedByEmail) || null
        ]
      );
    }

    await client.query("COMMIT");
    return { upserted: normalized.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTemplateLibraryEntry(templateId) {
  const id = String(templateId || "").trim();
  if (!id) return false;

  if (!hasDatabase) {
    return memoryTemplateLibraryEntries.delete(id);
  }

  await ensureTemplateLibrarySchema();
  const result = await pool.query(
    `DELETE FROM template_library_entries WHERE template_id = $1`,
    [id]
  );
  return Number(result?.rowCount || 0) > 0;
}

async function deleteTemplateLibraryEntriesBySourceFolder(sourceFolderId) {
  const safeSourceFolderId = String(sourceFolderId || "").trim();
  if (!safeSourceFolderId) {
    return { deleted: 0 };
  }

  if (!hasDatabase) {
    let deleted = 0;
    for (const [templateId, entry] of memoryTemplateLibraryEntries.entries()) {
      const entrySourceFolderId = String(entry?.sourceFolderId || entry?.source_folder_id || "").trim();
      if (entrySourceFolderId && entrySourceFolderId === safeSourceFolderId) {
        memoryTemplateLibraryEntries.delete(templateId);
        deleted += 1;
      }
    }
    return { deleted };
  }

  await ensureTemplateLibrarySchema();
  const result = await pool.query(
    `DELETE FROM template_library_entries WHERE source_folder_id = $1`,
    [safeSourceFolderId]
  );
  return { deleted: Number(result?.rowCount || 0) };
}

async function driveApiRequest(pathname, { accessToken, method = "GET", queryParams = {}, body = null } = {}) {
  const params = new URLSearchParams();
  Object.entries(queryParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  const url = `https://www.googleapis.com/drive/v3${pathname}${qs ? `?${qs}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || `Drive API error (${response.status})`);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function googleSlidesApiRequest(presentationId, accessToken) {
  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides API error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function driveDownloadExportedFile(fileId, mimeType, accessToken) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(mimeType)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(String(payload?.error?.message || `Drive export error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return Buffer.from(await response.arrayBuffer());
}

function extractGoogleSlidesMustDos(presentation) {
  const paragraphs = [];
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];

  slides.forEach((slide) => {
    const elements = Array.isArray(slide?.pageElements) ? slide.pageElements : [];
    elements.forEach((element) => {
      const textElements = element?.shape?.text?.textElements;
      if (!Array.isArray(textElements)) return;

      let paragraphText = "";
      let isBullet = false;
      textElements.forEach((textElement) => {
        const content = String(textElement?.textRun?.content || "");
        if (content) paragraphText += content;
        if (textElement?.paragraphMarker?.bullet) isBullet = true;
      });

      paragraphText.split(/\r?\n/).forEach((line) => {
        const text = line.trim().replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "").trim();
        if (text) paragraphs.push({ text, isBullet });
      });
    });
  });

  const headingIndex = paragraphs.findIndex((row) => /digital outcome\s+must\s+do\s+the\s+following/i.test(row.text));
  if (headingIndex < 0) return [];

  const result = [];
  for (let index = headingIndex + 1; index < paragraphs.length; index += 1) {
    const row = paragraphs[index];
    if (/^(the client|my outcome|my digital outcome|the digital outcome)\b/i.test(row.text) && result.length) break;
    if (row.isBullet || result.length === 0) result.push(row.text);
  }
  return Array.from(new Set(result)).slice(0, 30);
}

function extractGoogleSlidesMustDosFromPdfText(source) {
  const text = String(source || "").replace(/\r/g, "");
  const headingMatch = text.match(/digital outcome\s+must\s+do\s+the\s+following\s*:?([\s\S]*)/i);
  if (!headingMatch?.[1]) return [];

  const remainder = headingMatch[1].split(/\n\s*(?:the client|my outcome|my digital outcome)\b/i)[0];
  const candidates = remainder
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7*-]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(candidates)).filter((line) => !/^(slide|digital outcome description)\b/i.test(line)).slice(0, 30);
}

function extractGoogleSlidesRelevantImplications(presentation) {
  const paragraphs = [];
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  slides.forEach((slide) => {
    (Array.isArray(slide?.pageElements) ? slide.pageElements : []).forEach((element) => {
      const textElements = element?.shape?.text?.textElements;
      if (!Array.isArray(textElements)) return;
      let text = "";
      let isBullet = false;
      textElements.forEach((textElement) => {
        text += String(textElement?.textRun?.content || "");
        if (textElement?.paragraphMarker?.bullet) isBullet = true;
      });
      text.split(/\r?\n/).forEach((line) => {
        const cleaned = line.trim().replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "").trim();
        if (cleaned) paragraphs.push({ text: cleaned, isBullet });
      });
    });
  });

  return Array.from(new Set(paragraphs
    .filter((row) => row.isBullet)
    .map((row) => row.text)
    .filter((text) => !/^(relevant implications|how does|is the|what|can|will|does|this is|the implication)/i.test(text))))
    .slice(0, 40);
}

function extractGoogleSlidesRelevantImplicationsFromPdfText(source) {
  return Array.from(new Set(String(source || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7*-]+/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^(relevant implications|how does|is the|what|can|will|does|this is|the implication|slide)\b/i.test(line))))
    .slice(0, 40);
}

function extractGoogleSlidesTableCellText(cell) {
  const textElements = Array.isArray(cell?.text?.textElements) ? cell.text.textElements : [];
  return textElements
    .map((textElement) => String(textElement?.textRun?.content || ""))
    .join("")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractGoogleSlidesTableCellLines(cell) {
  const textElements = Array.isArray(cell?.text?.textElements) ? cell.text.textElements : [];
  const text = textElements
    .map((textElement) => String(textElement?.textRun?.content || ""))
    .join("");
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\u2022\u25CF\u25E6\u25AA\u25B7\u2043\u00B7\u2219*-]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractGoogleSlidesConventionAreas(presentation) {
  const knownAreas = ["Navigation", "Layout", "Typography", "Links", "Buttons/Controls", "Forms", "Visual hierarchy", "Images/Media", "Consistency", "Responsive design", "Feedback", "Content organisation"];
  const found = [];
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];

  slides.forEach((slide) => {
    (Array.isArray(slide?.pageElements) ? slide.pageElements : []).forEach((element) => {
      const table = element?.table;
      if (!table || !Array.isArray(table.tableRows)) return;
      table.tableRows.forEach((row) => {
        const cells = Array.isArray(row?.tableCells) ? row.tableCells : [];
        const value = extractGoogleSlidesTableCellText(cells[0] || null);
        if (!value || /^(?:relevant\s+)?convention\s+area$/i.test(value)) return;
        const area = knownAreas.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
        if (!area || found.includes(area)) return;
        // Only count a convention as discussed once the student has actually written
        // something in one of the other columns (why it's relevant, how it was applied, etc.);
        // the row/label alone is just the template and proves nothing was listed yet.
        const hasListedContent = cells.slice(1).some((cell) => Boolean(extractGoogleSlidesTableCellText(cell)));
        if (hasListedContent) found.push(area);
      });
    });
  });

  return found;
}

function extractGoogleSlidesDevelopmentRows(presentation) {
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const allTableRows = [];

  slides.forEach((slide) => {
    const elements = Array.isArray(slide?.pageElements) ? slide.pageElements : [];
    elements.forEach((element) => {
      const table = element?.table;
      if (!table || !Array.isArray(table.tableRows)) return;

      const tableRows = table.tableRows.map((row) => (
        Array.isArray(row?.tableCells)
          ? row.tableCells.map((cell) => extractGoogleSlidesTableCellText(cell))
          : []
      ));
      const headerRowIndex = tableRows.findIndex((cellTexts) => cellTexts.some((text) => /must[- ]do|components?|tools\s*&\s*techniques|why this/i.test(text)));
      const headerTexts = headerRowIndex >= 0 ? tableRows[headerRowIndex].map((text) => text.toLowerCase()) : [];
      const componentIndex = headerTexts.findIndex((text) => /^components?$/.test(text));
      const toolsIndex = headerTexts.findIndex((text) => /tools\s*&\s*techniques/.test(text));
      const whyIndex = headerTexts.findIndex((text) => /why this/i.test(text));
      const mustDoIndex = headerTexts.findIndex((text) => /^must[- ]do/.test(text));

      tableRows.forEach((cellTexts, rowIndex) => {
        const cells = Array.isArray(table.tableRows[rowIndex]?.tableCells) ? table.tableRows[rowIndex].tableCells : [];
        if (cells.length < 2) return;

        const firstCellText = cellTexts[0] || "";
        const secondCellText = cellTexts[1] || "";
        const thirdCellText = cellTexts[2] || "";
        const firstLower = firstCellText.toLowerCase();
        const secondLower = secondCellText.toLowerCase();
        const thirdLower = thirdCellText.toLowerCase();

        if (rowIndex === headerRowIndex || !cellTexts.some(Boolean)) return;
        if (cellTexts.some((text, index) => /^must[- ]do$/i.test(text)
          || /^(components?|tools\s*&\s*techniques|why this (?:tool|component)\s*&?\s*technique needed\??)$/i.test(text)
          || (index === 0 && /why this component is needed/i.test(text)))) {
          return;
        }

        if (componentIndex >= 0) {
          const componentLines = extractGoogleSlidesTableCellLines(cells[componentIndex]);
          const toolsLines = toolsIndex >= 0 ? extractGoogleSlidesTableCellLines(cells[toolsIndex]) : [];
          const whyLines = whyIndex >= 0 ? extractGoogleSlidesTableCellLines(cells[whyIndex]) : [];
          const components = componentLines.length ? componentLines : [cellTexts[componentIndex] || ""];
          components.forEach((component, componentRowIndex) => {
            allTableRows.push({
              mustDo: mustDoIndex >= 0 ? cellTexts[mustDoIndex] || "" : "",
              component,
              toolsTechniques: toolsLines[componentRowIndex] || (componentRowIndex === 0 ? toolsLines.join(" ") : ""),
              whyNeeded: whyLines[componentRowIndex] || (componentRowIndex === 0 ? whyLines.join(" ") : "")
            });
          });
        } else if (cells.length >= 4) {
          allTableRows.push({
            mustDo: firstCellText,
            component: cellTexts[1] || "",
            toolsTechniques: cellTexts[2] || "",
            whyNeeded: cellTexts[3] || ""
          });
        } else if (cells.length >= 3) {
          allTableRows.push({ mustDo: "", component: firstCellText, toolsTechniques: secondCellText, whyNeeded: thirdCellText });
        } else if (secondCellText) {
          allTableRows.push({ mustDo: firstCellText, component: secondCellText, toolsTechniques: "", whyNeeded: "" });
        }
      });
    });
  });

  const uniqueRows = [];
  const seenRows = new Set();
  allTableRows.forEach((row) => {
    const normalizedRow = {
      mustDo: row.mustDo.replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "").trim(),
      component: row.component.replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "").trim(),
      toolsTechniques: String(row.toolsTechniques || "").replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "").trim(),
      whyNeeded: String(row.whyNeeded || "").replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "").trim()
    };
    const key = `${normalizedRow.mustDo}\n${normalizedRow.component}\n${normalizedRow.toolsTechniques}\n${normalizedRow.whyNeeded}`.toLowerCase();
    if (!normalizedRow.component || seenRows.has(key)) return;
    seenRows.add(key);
    uniqueRows.push(normalizedRow);
  });
  if (uniqueRows.length) return uniqueRows.slice(0, 30);

  const fallbackSource = slides[0];
  const textShapes = (Array.isArray(fallbackSource?.pageElements) ? fallbackSource.pageElements : [])
    .filter((element) => Array.isArray(element?.shape?.text?.textElements))
    .map((element) => {
      const text = element.shape.text.textElements
        .map((textElement) => String(textElement?.textRun?.content || ""))
        .join("");
      return { text, left: Number(element?.transform?.translateX || 0) };
    })
    .filter((shape) => shape.text.trim())
    .sort((left, right) => right.left - left.left);

  const sourceText = String(textShapes[0]?.text || "");
  return Array.from(new Set(sourceText
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+\.|[\u2022\u25CF\u25E6*-])\s*/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^(starters|timeline\b|what the slide needs to cover|some key steps|my outcome|digital outcome)/i.test(line))))
    .slice(0, 30)
    .map((component) => ({ mustDo: "", component }));
}

function extractGoogleSlidesDevelopmentComponents(presentation) {
  return extractGoogleSlidesDevelopmentRows(presentation).map((row) => row.component);
}

function extractGoogleSlidesDevelopmentComponentsFromPdfText(source) {
  const text = String(source || "").replace(/\r/g, "");
  const componentSection = text.match(/component\s*:?([\s\S]*?)(?:why\s+this\s+component\s+is\s+needed|$)/i)?.[1] || "";
  const lines = componentSection
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+\.|[\u2022\u25CF\u25E6*-])\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^(component|why this component is needed)$/i.test(line));

  const values = Array.from(new Set(lines.filter((line) => line && !/^(the|this|that|they|we|students|google|category)/i.test(line))));
  return values.slice(0, 30);
}

function extractGoogleSlidesTestingFunctionLists(presentation) {
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const functionalTesting = [];
  const userTesting = [];
  let currentSection = "functional";

  const pushItem = (section, value) => {
    const text = String(value || "")
      .replace(/^[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219*-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    if (/^(what\s+(function|will|is|was|happened)|how\s+will|expected\s+result|actual\s+result|if\s+it\s+failed|slide\s*\d*|testing\s+functions|functional\s+testing|user\s+testing)\b/i.test(text)) return;
    const target = section === "user" ? userTesting : functionalTesting;
    if (!target.includes(text)) target.push(text);
  };

  slides.forEach((slide) => {
    const elements = Array.isArray(slide?.pageElements) ? slide.pageElements : [];
    const slideText = elements
      .map((element) => (Array.isArray(element?.shape?.text?.textElements) ? element.shape.text.textElements : [])
        .map((textElement) => String(textElement?.textRun?.content || ""))
        .join(""))
      .join("\n");
    if (/user\s+testing/i.test(slideText)) {
      currentSection = "user";
    } else if (/functional\s+testing/i.test(slideText)) {
      currentSection = "functional";
    }

    elements.forEach((element) => {
      const table = element?.table;
      if (!table || !Array.isArray(table.tableRows)) return;
      const rows = table.tableRows.map((row) => (
        Array.isArray(row?.tableCells) ? row.tableCells.map((cell) => extractGoogleSlidesTableCellText(cell)) : []
      ));
      const headerRowIndex = rows.findIndex((row) => row.some((text) => /must[- ]do|what\s+.*test/i.test(text)));
      const headerTexts = headerRowIndex >= 0 ? rows[headerRowIndex].map((text) => text.toLowerCase()) : [];
      const testColumnIndex = headerTexts.length
        ? headerTexts.findIndex((text) => /must[- ]do|function|what\s+.*test/i.test(text))
        : -1;
      const columnIndex = testColumnIndex >= 0 ? testColumnIndex : 0;

      table.tableRows.forEach((row, rowIndex) => {
        if (headerRowIndex >= 0 && rowIndex <= headerRowIndex) return;
        if (headerRowIndex < 0 && rowIndex === 0 && (rows[0] || []).some((text) => /test/i.test(text))) return;
        const cell = Array.isArray(row?.tableCells) ? row.tableCells[columnIndex] : null;
        const lines = extractGoogleSlidesTableCellLines(cell);
        (lines.length ? lines : [rows[rowIndex]?.[columnIndex] || ""]).forEach((line) => pushItem(currentSection, line));
      });
    });
  });

  return { functionalTesting: functionalTesting.slice(0, 40), userTesting: userTesting.slice(0, 40) };
}

function extractGoogleSlidesTestingFunctionListsFromPdfText(source) {
  const functionalTesting = [];
  const userTesting = [];
  let currentSection = "functional";
  String(source || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7*-]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .forEach((line) => {
      if (/^user\s+testing\b/i.test(line)) { currentSection = "user"; return; }
      if (/^functional\s+testing\b/i.test(line)) { currentSection = "functional"; return; }
      if (/^(what\s+(function|will|is|was|happened)|how\s+will|expected\s+result|actual\s+result|if\s+it\s+failed|slide\s*\d*|testing\s+functions)\b/i.test(line)) return;
      const target = currentSection === "user" ? userTesting : functionalTesting;
      if (!target.includes(line)) target.push(line);
    });
  return { functionalTesting: functionalTesting.slice(0, 40), userTesting: userTesting.slice(0, 40) };
}

async function populateSuccessCriteriaRequirements(presentationId, mustDos, accessToken) {
  const requirements = Array.from(new Set((Array.isArray(mustDos) ? mustDos : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter((value) => value && !/^\d+\s+of\s+\d+/i.test(value)))).slice(0, 12);
  if (!presentationId || !requirements.length) return { updated: false, count: 0 };

  const presentation = await googleSlidesApiRequest(presentationId, accessToken);
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const targetSlide = slides[1] || slides.find((slide) => Array.isArray(slide?.pageElements)
    && slide.pageElements.some((element) => element?.table));
  const tableElement = targetSlide?.pageElements?.find((element) => element?.table);
  const table = tableElement?.table;
  const objectId = String(tableElement?.objectId || "").trim();
  const rowCount = Number(table?.rows || 0);
  const columnCount = Number(table?.columns || 0);
  if (!objectId || rowCount < 2 || columnCount < 1) return { updated: false, count: 0 };

  const requests = [];
  requirements.slice(0, rowCount - 1).forEach((requirement, index) => {
    const cellLocation = { rowIndex: index + 1, columnIndex: 0 };
    const cell = table?.tableRows?.[index + 1]?.tableCells?.[0];
    const cellText = (cell?.text?.textElements || [])
      .map((element) => String(element?.textRun?.content || ""))
      .join("")
      .trim();
    if (cellText) {
      requests.push({
        deleteText: {
          objectId,
          cellLocation,
          textRange: { type: "ALL" }
        }
      });
    }
    requests.push({
      insertText: {
        objectId,
        cellLocation,
        insertionIndex: 0,
        text: requirement
      }
    });
  });

  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides update error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return { updated: true, count: Math.min(requirements.length, rowCount - 1) };
}

async function populateSuccessCriteriaImplications(presentationId, implicationNames, accessToken) {
  const names = Array.from(new Set((Array.isArray(implicationNames) ? implicationNames : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean))).slice(0, 12);
  if (!presentationId || !names.length) return { updated: false, count: 0 };

  const presentation = await googleSlidesApiRequest(presentationId, accessToken);
  const targetSlide = presentation?.slides?.[2];
  const tableElement = targetSlide?.pageElements?.find((element) => element?.table);
  const table = tableElement?.table;
  const objectId = String(tableElement?.objectId || "").trim();
  const rowCount = Number(table?.rows || 0);
  if (!objectId || rowCount < 2) return { updated: false, count: 0 };

  const requests = [];
  names.slice(0, rowCount - 1).forEach((name, index) => {
    const cellLocation = { rowIndex: index + 1, columnIndex: 0 };
    const cell = table?.tableRows?.[index + 1]?.tableCells?.[0];
    const cellText = (cell?.text?.textElements || []).map((element) => String(element?.textRun?.content || "")).join("").trim();
    if (cellText) {
      requests.push({ deleteText: { objectId, cellLocation, textRange: { type: "ALL" } } });
    }
    requests.push({ insertText: { objectId, cellLocation, insertionIndex: 0, text: name } });
  });

  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides update error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return { updated: true, count: Math.min(names.length, rowCount - 1) };
}

async function populateDevelopmentStepsMustDos(presentationId, mustDos, accessToken) {
  const requirements = Array.from(new Set((Array.isArray(mustDos) ? mustDos : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter((value) => value && !/^(the digital outcome|my outcome|the client)/i.test(value))
    .filter(Boolean)))
    .slice(0, 12);

  if (!presentationId || !requirements.length) return { updated: false, count: 0 };

  const presentation = await googleSlidesApiRequest(presentationId, accessToken);
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const targetSlide = slides.find((slide) => Array.isArray(slide?.pageElements)
    && slide.pageElements.some((element) => element?.table)) || slides[1] || slides[0];
  const tableElement = targetSlide?.pageElements?.find((element) => element?.table);
  const table = tableElement?.table;
  const objectId = String(tableElement?.objectId || "").trim();
  const rowCount = Number(table?.rows || 0);
  const columnCount = Number(table?.columns || 0);
  if (!objectId || rowCount < 2 || columnCount < 2) return { updated: false, count: 0 };

  const requests = [];
  requirements.slice(0, rowCount - 1).forEach((requirement, index) => {
    const cellLocation = { rowIndex: index + 1, columnIndex: 0 };
    const cell = table?.tableRows?.[index + 1]?.tableCells?.[0];
    const cellText = (cell?.text?.textElements || [])
      .map((element) => String(element?.textRun?.content || ""))
      .join("")
      .trim();
    if (cellText) {
      requests.push({ deleteText: { objectId, cellLocation, textRange: { type: "ALL" } } });
    }
    requests.push({ insertText: { objectId, cellLocation, insertionIndex: 0, text: requirement } });
  });

  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides update error (${response.status})`));
    error.status = response.status;
    throw error;
  }

  return { updated: true, count: Math.min(requirements.length, rowCount - 1) };
}

async function populateTestingFunctionsMustDos(presentationId, mustDos, accessToken) {
  const requirements = Array.from(new Set((Array.isArray(mustDos) ? mustDos : [])
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter((value) => value && !/^(the digital outcome|my outcome|the client)/i.test(value))))
    .slice(0, 12);

  if (!presentationId || !requirements.length) return { updated: false, count: 0 };

  const presentation = await googleSlidesApiRequest(presentationId, accessToken);
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const tableTargets = [];

  slides.forEach((slide) => {
    (Array.isArray(slide?.pageElements) ? slide.pageElements : []).forEach((element) => {
      const table = element?.table;
      if (!table || !Array.isArray(table.tableRows)) return;

      const rows = table.tableRows.map((row) => (
        Array.isArray(row?.tableCells)
          ? row.tableCells.map((cell) => extractGoogleSlidesTableCellText(cell))
          : []
      ));
      const headerRowIndex = rows.findIndex((row) => row.some((text) => /must[- ]do/i.test(text)));
      if (headerRowIndex < 0) return;

      const headerRow = rows[headerRowIndex] || [];
      const mustDoColumnIndex = headerRow.findIndex((text) => /must[- ]do/i.test(text));
      if (mustDoColumnIndex < 0) return;

      tableTargets.push({
        objectId: String(element?.objectId || "").trim(),
        table,
        headerRowIndex,
        mustDoColumnIndex
      });
    });
  });

  if (!tableTargets.length) return { updated: false, count: 0 };

  const requests = [];
  let populatedCount = 0;
  tableTargets.forEach(({ objectId, table, headerRowIndex, mustDoColumnIndex }) => {
    const rowCount = Number(table?.rows || table?.tableRows?.length || 0);
    if (!objectId || rowCount <= headerRowIndex + 1) return;

    const count = Math.min(requirements.length, rowCount - headerRowIndex - 1);
    for (let index = 0; index < count; index += 1) {
      const rowIndex = headerRowIndex + index + 1;
      const cellLocation = { rowIndex, columnIndex: mustDoColumnIndex };
      const cell = table?.tableRows?.[rowIndex]?.tableCells?.[mustDoColumnIndex];
      const cellText = (cell?.text?.textElements || [])
        .map((element) => String(element?.textRun?.content || ""))
        .join("")
        .trim();
      if (cellText) {
        requests.push({ deleteText: { objectId, cellLocation, textRange: { type: "ALL" } } });
      }
      requests.push({
        insertText: {
          objectId,
          cellLocation,
          insertionIndex: 0,
          text: requirements[index]
        }
      });
    }
    populatedCount = Math.max(populatedCount, count);
  });

  if (!requests.length) return { updated: false, count: 0 };

  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requests })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides update error (${response.status})`));
    error.status = response.status;
    throw error;
  }

  return { updated: true, count: populatedCount, tableCount: tableTargets.length };
}

async function populateTriallingComponents(presentationId, sourcePresentationId, accessToken) {
  if (!presentationId || !sourcePresentationId) return { updated: false, count: 0 };

  const sourcePresentation = await googleSlidesApiRequest(sourcePresentationId, accessToken);
  const sourceRows = extractGoogleSlidesDevelopmentRows(sourcePresentation)
    .filter((row) => String(row?.component || "").trim())
    .slice(0, 30);
  if (!sourceRows.length) return { updated: false, count: 0 };

  const targetPresentation = await googleSlidesApiRequest(presentationId, accessToken);
  const targetSlides = Array.isArray(targetPresentation?.slides) ? targetPresentation.slides : [];
  const targetSlide = targetSlides.find((slide) => Array.isArray(slide?.pageElements)
    && slide.pageElements.some((element) => element?.table)) || targetSlides[1] || targetSlides[0];
  const tableElement = targetSlide?.pageElements?.find((element) => element?.table);
  const table = tableElement?.table;
  const objectId = String(tableElement?.objectId || "").trim();
  const rowCount = Number(table?.rows || 0);
  const columnCount = Number(table?.columns || 0);
  if (!objectId || rowCount < 2 || columnCount < 1) return { updated: false, count: 0 };

  const requests = [];
  sourceRows.slice(0, rowCount - 1).forEach((row, index) => {
    const rowIndex = index + 1;
    const values = [
      String(row.component || "").trim(),
      "",
      String(row.toolsTechniques || "").trim()
    ];
    values.slice(0, columnCount).forEach((value, columnIndex) => {
      const cellLocation = { rowIndex, columnIndex };
      const cell = table?.tableRows?.[rowIndex]?.tableCells?.[columnIndex];
      const cellText = (cell?.text?.textElements || [])
        .map((element) => String(element?.textRun?.content || ""))
        .join("")
        .trim();
      if (cellText) {
        requests.push({ deleteText: { objectId, cellLocation, textRange: { type: "ALL" } } });
      }
      if (value) {
        requests.push({ insertText: { objectId, cellLocation, insertionIndex: 0, text: value } });
      }
    });
  });

  if (!requests.length) return { updated: false, count: 0 };
  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides update error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return { updated: true, count: Math.min(sourceRows.length, rowCount - 1) };
}

async function populateUseOfToolsTechniques(presentationId, activityId, studentEmail, accessToken) {
  const safeActivityId = String(activityId || "").trim();
  const safeEmail = normalizeEmail(studentEmail || "");
  if (!hasDatabase || !presentationId || !safeActivityId || !safeEmail) return { updated: false, count: 0 };

  const result = await pool.query(
    "SELECT evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
    [safeActivityId, safeEmail]
  );
  const labels = [];
  normalizeEvidenceStepsPayload(result.rows?.[0]?.evidence_steps).forEach((row) => {
    if (String(row?.standard || "").trim() !== "digimed-tools-techniques") return;
    (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
      const match = String(step?.text || "").match(/^DIGIMED_TOOLS_TECHNIQUES_ACK\|(.+)\|true$/i);
      if (match?.[1] && !labels.includes(match[1].trim())) labels.push(match[1].trim());
    });
  });
  if (!labels.length) return { updated: false, count: 0 };

  const presentation = await googleSlidesApiRequest(presentationId, accessToken);
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const tableElement = slides.flatMap((slide) => Array.isArray(slide?.pageElements) ? slide.pageElements : [])
    .find((element) => element?.table);
  const table = tableElement?.table;
  const objectId = String(tableElement?.objectId || "").trim();
  const rowCount = Number(table?.rows || 0);
  if (!objectId || rowCount < 2 || Number(table?.columns || 0) < 1) return { updated: false, count: 0 };

  // Only fill empty cells so a student's own edits are never overwritten.
  const requests = [];
  let filled = 0;
  labels.slice(0, rowCount - 1).forEach((label, index) => {
    const rowIndex = index + 1;
    const cell = table?.tableRows?.[rowIndex]?.tableCells?.[0];
    if (extractGoogleSlidesTableCellText(cell)) return;
    requests.push({ insertText: { objectId, cellLocation: { rowIndex, columnIndex: 0 }, insertionIndex: 0, text: label } });
    filled += 1;
  });
  if (!requests.length) return { updated: false, count: 0 };

  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Google Slides update error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return { updated: true, count: filled };
}

async function driveFindFolderByName(parentFolderId, folderName, accessToken) {
  const safeName = folderName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safeParent = parentFolderId.replace(/'/g, "\\'");
  const q = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and '${safeParent}' in parents and trashed = false`;
  const result = await driveApiRequest("/files", {
    accessToken,
    queryParams: {
      q,
      fields: "files(id,name,webViewLink)",
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    }
  });
  return result.files?.[0] || null;
}

async function driveFindFolderByNameAnywhere(folderName, accessToken) {
  const name = String(folderName || "").trim().replace(/^\/+|\/+$/g, "");
  if (!name) return null;

  const safeName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const result = await driveApiRequest("/files", {
    accessToken,
    queryParams: {
      q,
      fields: "files(id,name,webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: 25,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    }
  });

  const matches = Array.isArray(result.files) ? result.files : [];
  const exactMatch = matches.find((file) => String(file?.name || "").trim().toLowerCase() === name.toLowerCase());
  return exactMatch || matches[0] || null;
}

async function driveCreateFolder(parentFolderId, folderName, accessToken) {
  return driveApiRequest("/files", {
    accessToken, method: "POST",
    body: { name: folderName, mimeType: "application/vnd.google-apps.folder", parents: [parentFolderId] },
    queryParams: { fields: "id,name,webViewLink" }
  });
}

async function driveEnsureAnyoneEditorPermission(fileId, accessToken) {
  const safeFileId = String(fileId || "").trim();
  if (!safeFileId || !accessToken) return { applied: false, reason: "missing_parameters" };

  const permissions = await driveApiRequest(`/files/${encodeURIComponent(safeFileId)}/permissions`, {
    accessToken,
    queryParams: {
      fields: "permissions(id,type,role,emailAddress)",
      supportsAllDrives: true,
      pageSize: 100
    }
  });
  const existing = (Array.isArray(permissions?.permissions) ? permissions.permissions : [])
    .find((permission) => String(permission?.type || "").toLowerCase() === "anyone");

  if (existing?.id && String(existing?.role || "").toLowerCase() === "writer") {
    return { applied: true, permissionId: existing.id, alreadyConfigured: true };
  }

  if (existing?.id) {
    const updated = await driveApiRequest(`/files/${encodeURIComponent(safeFileId)}/permissions/${encodeURIComponent(existing.id)}`, {
      accessToken,
      method: "PATCH",
      queryParams: { supportsAllDrives: true, fields: "id,type,role" },
      body: { role: "writer" }
    });
    return { applied: true, permissionId: updated?.id || existing.id, alreadyConfigured: false };
  }

  const created = await driveApiRequest(`/files/${encodeURIComponent(safeFileId)}/permissions`, {
    accessToken,
    method: "POST",
    queryParams: { supportsAllDrives: true, sendNotificationEmail: false, fields: "id,type,role" },
    body: { type: "anyone", role: "writer" }
  });
  return { applied: true, permissionId: created?.id || "", alreadyConfigured: false };
}

async function driveEnsureProcessAssessmentFolder(haparaFolderId, accessToken) {
  const existing = await driveFindFolderByName(haparaFolderId, "Process Assessment", accessToken);
  if (existing?.id) return existing;
  return driveCreateFolder(haparaFolderId, "Process Assessment", accessToken);
}

async function driveEnsureFolder(parentFolderId, folderName, accessToken) {
  const existing = await driveFindFolderByName(parentFolderId, folderName, accessToken);
  if (existing?.id) return existing;
  return driveCreateFolder(parentFolderId, folderName, accessToken);
}

const PROCESS_ASSESSMENT_DIGITAL_OUTCOME_FOLDER_NAME = "Digital Outcome Details";
const PROCESS_ASSESSMENT_TRIALLING_COMPONENTS_FOLDER_NAME = "Trailing Components";
const PROCESS_ASSESSMENT_TESTING_FUNCTIONS_FOLDER_NAME = "Testing Functions";
const PROCESS_ASSESSMENT_RELEVANT_DIGIMED_CONVENTIONS_FOLDER_NAME = "Relevant DigiMed Conventions";
const PROCESS_ASSESSMENT_UX_PRINCIPLES_FOLDER_NAME = "User Experience (UX) Principles";
const PROCESS_ASSESSMENT_RELEVANT_IMPLICATIONS_FOLDER_NAME = "Relevant Implications";

const DIGITAL_OUTCOME_DETAILS_TEMPLATE_IDS = new Set([
  "digital-outcome-description",
  "target-audience",
  "development-steps",
  "trialling-components",
  "tools-and-techniques",
  "use-of-tools-and-techniques",
  "project-success-criteria"
]);

function resolveProcessAssessmentSubfolderName(templateId, templateTitle) {
  const normalizedTemplateId = String(templateId || "").trim().toLowerCase();
  const normalizedTitle = String(templateTitle || "").trim().toLowerCase();

  const isTriallingComponentsTemplate = normalizedTemplateId === "trialling-components"
    || /triall?ing\s+components|trailing\s+components|trailing\s+comonents/.test(normalizedTitle);
  if (isTriallingComponentsTemplate) {
    return PROCESS_ASSESSMENT_TRIALLING_COMPONENTS_FOLDER_NAME;
  }

  const isTestingFunctionsTemplate = normalizedTemplateId === "testing-functions"
    || /testing\s+functions/.test(normalizedTitle);
  if (isTestingFunctionsTemplate) {
    return PROCESS_ASSESSMENT_TESTING_FUNCTIONS_FOLDER_NAME;
  }

  const isRelevantDigiMedConventionsTemplate = normalizedTemplateId === "relevant-digimed-conventions"
    || /relevant\s+(?:digimed\s+)?conventions/.test(normalizedTitle);
  if (isRelevantDigiMedConventionsTemplate) {
    return PROCESS_ASSESSMENT_RELEVANT_DIGIMED_CONVENTIONS_FOLDER_NAME;
  }

  const isUXPrinciplesTemplate = normalizedTemplateId === "user-experience-principles"
    || /user\s+experience\s+(?:\(ux\)\s+)?principles|ux\s+principles/.test(normalizedTitle);
  if (isUXPrinciplesTemplate) {
    return PROCESS_ASSESSMENT_UX_PRINCIPLES_FOLDER_NAME;
  }

  const isDigitalOutcomeTemplate = DIGITAL_OUTCOME_DETAILS_TEMPLATE_IDS.has(normalizedTemplateId)
    || normalizedTitle.includes("digital outcome description")
    || normalizedTitle.includes("target audience")
    || normalizedTitle.includes("development steps")
    || normalizedTitle.includes("trialling components")
    || normalizedTitle.includes("trailing components")
    || normalizedTitle.includes("trailing comonents")
    || normalizedTitle.includes("tools and techniques")
    || normalizedTitle.includes("testing functions")
    || normalizedTitle.includes("success criteria");
  if (isDigitalOutcomeTemplate) {
    return PROCESS_ASSESSMENT_DIGITAL_OUTCOME_FOLDER_NAME;
  }

  const isRelevantImplicationsTemplate = normalizedTemplateId === "relevant-implications"
    || normalizedTitle.includes("relevant implications");
  if (isRelevantImplicationsTemplate) {
    return PROCESS_ASSESSMENT_RELEVANT_IMPLICATIONS_FOLDER_NAME;
  }

  return "";
}

async function driveListSlidesInProcessAssessmentTree(processAssessmentFolderId, accessToken) {
  const rootFolderId = String(processAssessmentFolderId || "").trim();
  if (!rootFolderId) return [];

  const rootSlides = await driveListSlidesInFolder(rootFolderId, accessToken);
  const subfolderNames = [
    PROCESS_ASSESSMENT_DIGITAL_OUTCOME_FOLDER_NAME,
    PROCESS_ASSESSMENT_TRIALLING_COMPONENTS_FOLDER_NAME,
    PROCESS_ASSESSMENT_TESTING_FUNCTIONS_FOLDER_NAME,
    PROCESS_ASSESSMENT_RELEVANT_DIGIMED_CONVENTIONS_FOLDER_NAME,
    PROCESS_ASSESSMENT_UX_PRINCIPLES_FOLDER_NAME,
    PROCESS_ASSESSMENT_RELEVANT_IMPLICATIONS_FOLDER_NAME
  ];

  const nestedSlides = [];
  for (const subfolderName of subfolderNames) {
    const folder = await driveFindFolderByName(rootFolderId, subfolderName, accessToken);
    const subfolderId = String(folder?.id || "").trim();
    if (!subfolderId) {
      continue;
    }

    const subfolderSlides = await driveListSlidesInFolder(subfolderId, accessToken);
    subfolderSlides.forEach((file) => {
      nestedSlides.push({ ...file, processAssessmentSubfolder: subfolderName });
    });
  }

  return [
    ...rootSlides.map((file) => ({ ...file, processAssessmentSubfolder: "" })),
    ...nestedSlides
  ];
}

async function driveFindTemplateInFolder(folderId, templateTitle, accessToken) {
  const safeTitle = templateTitle.replace(/\\/g, "\\\\").replace(/'/g, "\\'").slice(0, 60);
  const safeFolder = folderId.replace(/'/g, "\\'");
  const q = `name contains '${safeTitle}' and '${safeFolder}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.presentation'`;
  const result = await driveApiRequest("/files", { accessToken, queryParams: { q, fields: "files(id,name,webViewLink)", pageSize: 5 } });
  return Array.isArray(result.files) ? result.files : [];
}

async function driveCopyFile(fileId, destinationFolderId, copyName, accessToken) {
  return driveApiRequest(`/files/${encodeURIComponent(fileId)}/copy`, {
    accessToken, method: "POST",
    body: { name: copyName, parents: [destinationFolderId] },
    queryParams: { fields: "id,name,webViewLink" }
  });
}

async function driveFindFileByNameInFolder(folderId, fileName, accessToken) {
  const safeName = String(fileName || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safeFolder = String(folderId || "").replace(/'/g, "\\'");
  if (!safeName || !safeFolder) return null;

  const q = `name = '${safeName}' and '${safeFolder}' in parents and trashed = false`;
  const result = await driveApiRequest("/files", {
    accessToken,
    queryParams: { q, fields: "files(id,name,webViewLink)", pageSize: 1, includeItemsFromAllDrives: true, supportsAllDrives: true }
  });
  return result.files?.[0] || null;
}

// Multipart upload/replace of a binary file; Drive's upload host is separate from the v3 API host.
async function driveUploadBinaryFile({ accessToken, folderId, fileName, mimeType, buffer, existingFileId = "" }) {
  const boundary = `dtechhub${Date.now().toString(16)}`;
  const metadata = existingFileId
    ? { name: fileName }
    : { name: fileName, parents: [folderId] };

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, "utf8"),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, "utf8"),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  ]);

  const targetPath = existingFileId ? `/files/${encodeURIComponent(existingFileId)}` : "/files";
  const url = `https://www.googleapis.com/upload/drive/v3${targetPath}?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`;
  const response = await fetch(url, {
    method: existingFileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.error?.message || `Drive upload error (${response.status})`));
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function driveListSlidesInFolder(folderId, accessToken) {
  const safeFolder = String(folderId || "").trim().replace(/'/g, "\\'");
  if (!safeFolder) return [];
  const q = `'${safeFolder}' in parents and mimeType = 'application/vnd.google-apps.presentation' and trashed = false`;
  const result = await driveApiRequest("/files", {
    accessToken,
    queryParams: {
      q,
      fields: "files(id,name,webViewLink,thumbnailLink,modifiedTime)",
      orderBy: "name_natural asc",
      pageSize: 200,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    }
  });
  return Array.isArray(result?.files) ? result.files : [];
}

async function driveListChildFoldersInFolder(folderId, accessToken) {
  const safeFolder = String(folderId || "").trim().replace(/'/g, "\\'");
  if (!safeFolder) return [];

  const q = `'${safeFolder}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const result = await driveApiRequest("/files", {
    accessToken,
    queryParams: {
      q,
      fields: "files(id,name,webViewLink)",
      orderBy: "name_natural asc",
      pageSize: 200,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    }
  });

  return Array.isArray(result?.files) ? result.files : [];
}

async function driveListSlidesInFolderAndSubfolders(folderId, accessToken) {
  const rootFolderId = String(folderId || "").trim();
  if (!rootFolderId) return [];

  const rootSlides = await driveListSlidesInFolder(rootFolderId, accessToken);
  const childFolders = await driveListChildFoldersInFolder(rootFolderId, accessToken);

  const nestedSlides = [];
  for (const childFolder of childFolders) {
    const childFolderId = String(childFolder?.id || "").trim();
    const childFolderName = String(childFolder?.name || "").trim();
    if (!childFolderId) continue;

    const slides = await driveListSlidesInFolder(childFolderId, accessToken);
    slides.forEach((file) => {
      nestedSlides.push({ ...file, sourceSubfolderName: childFolderName });
    });
  }

  return [
    ...rootSlides.map((file) => ({ ...file, sourceSubfolderName: "" })),
    ...nestedSlides
  ];
}

function extractSlidesFileId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname.includes("google.com")) return "";
    const match = parsed.pathname.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/i);
    return match?.[1] || "";
  } catch (_error) {
    return "";
  }
}

async function getStudentDriveSetup(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const haparaRow = hasDatabase
    ? await (async () => {
        await ensureStudentHaparaFoldersSchema();
        const r = await pool.query(`SELECT * FROM student_hapara_folders WHERE student_email = $1 LIMIT 1`, [normalizedEmail]);
        return r.rows?.[0] || null;
      })()
    : memoryStudentHaparaFolders.get(normalizedEmail) || null;

  const setupRow = hasDatabase
    ? await (async () => {
        await ensureStudentDriveSetupSchema();
        const r = await pool.query(`SELECT * FROM student_drive_setup WHERE student_email = $1 LIMIT 1`, [normalizedEmail]);
        return r.rows?.[0] || null;
      })()
    : memoryStudentDriveSetup.get(normalizedEmail) || null;

  if (!haparaRow && !setupRow) return null;

  return {
    haparaFolderId: String(haparaRow?.folder_id || "").trim(),
    haparaFolderUrl: String(haparaRow?.folder_url || "").trim(),
    classLabel: String(haparaRow?.class_label || "").trim(),
    processAssessmentFolderId: String(setupRow?.process_assessment_folder_id || "").trim(),
    mdtechProjectFolderId: String(setupRow?.mdtech_project_folder_id || "").trim(),
    confirmed: Boolean(setupRow?.confirmed_at)
  };
}

function buildStudentDriveSetupPayload(setup = {}, extras = {}) {
  const haparaFolderId = String(setup?.haparaFolderId || "").trim();
  const processAssessmentFolderId = String(setup?.processAssessmentFolderId || "").trim();
  const processAssessmentFolderUrl = String(
    extras?.processAssessmentFolderUrl
      || (processAssessmentFolderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(processAssessmentFolderId)}` : "")
  ).trim();

  return {
    configured: Boolean(haparaFolderId || processAssessmentFolderId),
    driveReady: Boolean(haparaFolderId),
    haparaFolderId: haparaFolderId || null,
    haparaFolderUrl: String(setup?.haparaFolderUrl || "").trim() || null,
    classLabel: String(setup?.classLabel || "").trim() || null,
    processAssessmentFolderId: processAssessmentFolderId || null,
    processAssessmentFolderUrl: processAssessmentFolderUrl || null,
    confirmed: Boolean(setup?.confirmed || processAssessmentFolderId),
    inferredFromDrive: Boolean(extras?.inferredFromDrive)
  };
}

async function resolveStudentDriveSetupState(email, driveAccessToken = "") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const baseSetup = await getStudentDriveSetup(normalizedEmail);
  let mergedSetup = baseSetup ? { ...baseSetup } : {
    haparaFolderId: "",
    haparaFolderUrl: "",
    classLabel: "",
    processAssessmentFolderId: "",
    confirmed: false
  };
  let inferredFromDrive = false;
  let processAssessmentFolderUrl = "";

  if (driveAccessToken) {
    const seniorDtechFolder = await driveFindFolderByName("root", "SeniorDTECH", driveAccessToken);
    const processAssessmentFolder = seniorDtechFolder?.id
      ? await driveFindFolderByName(String(seniorDtechFolder.id), "Process Assessment", driveAccessToken)
      : null;

    if (processAssessmentFolder?.id) {
      const discoveredId = String(processAssessmentFolder.id || "").trim();
      processAssessmentFolderUrl = String(processAssessmentFolder.webViewLink || `https://drive.google.com/drive/folders/${discoveredId}`).trim();

      if (!mergedSetup.processAssessmentFolderId || mergedSetup.processAssessmentFolderId !== discoveredId || !mergedSetup.confirmed) {
        await saveStudentDriveSetup(normalizedEmail, discoveredId);
        inferredFromDrive = !mergedSetup.processAssessmentFolderId;
        mergedSetup = {
          ...mergedSetup,
          processAssessmentFolderId: discoveredId,
          confirmed: true
        };
      }
    }
  }

  if (!baseSetup && !mergedSetup.processAssessmentFolderId && !mergedSetup.haparaFolderId) {
    return null;
  }

  return buildStudentDriveSetupPayload(mergedSetup, {
    processAssessmentFolderUrl,
    inferredFromDrive
  });
}

async function saveStudentDriveSetup(email, processAssessmentFolderId) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !processAssessmentFolderId) return null;

  if (!hasDatabase) {
    const existing = memoryStudentDriveSetup.get(normalizedEmail) || {};
    const next = { ...existing, student_email: normalizedEmail, process_assessment_folder_id: processAssessmentFolderId, confirmed_at: existing.confirmed_at || new Date().toISOString(), updated_at: new Date().toISOString() };
    memoryStudentDriveSetup.set(normalizedEmail, next);
    return next;
  }

  await ensureStudentDriveSetupSchema();
  await ensureExternalAssessmentAllocationsSchema();
  const r = await pool.query(
    `
      INSERT INTO student_drive_setup (student_email, process_assessment_folder_id, confirmed_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (student_email) DO UPDATE SET
        process_assessment_folder_id = EXCLUDED.process_assessment_folder_id,
        confirmed_at = COALESCE(student_drive_setup.confirmed_at, NOW()),
        updated_at = NOW()
      RETURNING *
    `,
    [normalizedEmail, processAssessmentFolderId]
  );
  return r.rows?.[0] || null;
}

async function saveStudentMdtechProjectFolder(email, folderId) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedFolderId = String(folderId || "").trim();
  if (!normalizedEmail || !normalizedFolderId) return null;

  if (!hasDatabase) {
    const existing = memoryStudentDriveSetup.get(normalizedEmail) || {};
    const next = {
      ...existing,
      student_email: normalizedEmail,
      mdtech_project_folder_id: normalizedFolderId,
      confirmed_at: existing.confirmed_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStudentDriveSetup.set(normalizedEmail, next);
    return next;
  }

  await ensureStudentDriveSetupSchema();
  const result = await pool.query(
    `INSERT INTO student_drive_setup (student_email, mdtech_project_folder_id, confirmed_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (student_email) DO UPDATE SET
       mdtech_project_folder_id = EXCLUDED.mdtech_project_folder_id,
       confirmed_at = COALESCE(student_drive_setup.confirmed_at, NOW()),
       updated_at = NOW()
     RETURNING *`,
    [normalizedEmail, normalizedFolderId]
  );
  return result.rows?.[0] || null;
}

async function getStudentTaskListDriveFolder(email) {
  const programmeFolder = await getStudentProgrammeFolder(email);
  const setup = await getStudentDriveSetup(email);
  if (programmeFolder === "MiddleDTECH") {
    return {
      folderId: String(setup?.mdtechProjectFolderId || "").trim(),
      folderName: "MDTECH Project",
      programmeFolder
    };
  }

  return {
    folderId: String(setup?.processAssessmentFolderId || "").trim(),
    folderName: "Process Assessment",
    programmeFolder
  };
}

app.get("/api/template-library", async (_req, res) => {
  try {
    const entries = await listTemplateLibraryEntries();
    res.json({ ok: true, entries });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load template library." });
  }
});

app.post("/api/template-library/sync", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const access = await resolveActivityWriteAccess(email);
  if (!access.allowed) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const folderName = String(req.body?.folderName || "Process Slide Templates").trim();
  if (!driveAccessToken) {
    res.status(400).json({ error: "driveAccessToken is required." });
    return;
  }

  try {
    const folder = await driveFindFolderByNameAnywhere(folderName, driveAccessToken);
    if (!folder?.id) {
      res.status(404).json({ error: `Could not find a Google Drive folder named "${folderName}".` });
      return;
    }

    const slides = await driveListSlidesInFolderAndSubfolders(folder.id, driveAccessToken);
    const syncEntries = slides.map((file, index) => {
      const title = String(file?.name || "Untitled Template").trim();
      const canonical = inferCanonicalTemplateIdentityFromTitle(title);
      const standardCodes = Array.from(new Set((title.match(/\b\d{5}\b/g) || []).map((code) => String(code || "").trim())));
      const sourceSubfolderName = String(file?.sourceSubfolderName || "").trim();
      return {
        id: String(canonical?.id || file?.id || "").trim(),
        title: String(canonical?.title || title).trim(),
        standardCodes,
        criteriaText: String(canonical?.criteriaText || "").trim(),
        summary: sourceSubfolderName
          ? `Synced from ${folderName}/${sourceSubfolderName}.`
          : `Synced from ${folderName}.`,
        imageUrl: String(file?.thumbnailLink || "").trim(),
        templateUrl: String(file?.webViewLink || `https://docs.google.com/presentation/d/${String(file?.id || "").trim()}/edit`).trim(),
        status: "live",
        sortOrder: String(canonical?.id || "") === "process-slide-templates" ? 0 : index + 1,
        sourceFolderId: String(folder.id).trim()
      };
    });

    if (!syncEntries.length) {
      res.status(400).json({ error: `No Google Slides files were found in "${folderName}".` });
      return;
    }

    await deleteTemplateLibraryEntriesBySourceFolder(folder.id);
    const result = await upsertTemplateLibraryEntries(syncEntries, access.email);
    const entries = await listTemplateLibraryEntries();

    res.json({
      ok: true,
      folder: {
        id: String(folder.id || "").trim(),
        name: String(folder.name || folderName).trim(),
        url: String(folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`).trim()
      },
      syncedCount: Number(result?.upserted || 0),
      entries
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not sync template library." });
  }
});

app.delete("/api/template-library/:templateId", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const access = await resolveActivityWriteAccess(email);
  if (!access.allowed) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const templateId = String(req.params?.templateId || "").trim();
  if (!templateId) {
    res.status(400).json({ error: "templateId is required." });
    return;
  }

  try {
    const deleted = await deleteTemplateLibraryEntry(templateId);
    const entries = await listTemplateLibraryEntries();
    res.json({ ok: true, deleted, entries });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not delete template." });
  }
});

// Lets an admin/teacher move a template card to a different Section (folder grouping) in the
// Template Library without needing a full Drive re-sync, so stale duplicate sections can be cleared.
app.patch("/api/template-library/:templateId/section", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const access = await resolveActivityWriteAccess(email);
  if (!access.allowed) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const templateId = String(req.params?.templateId || "").trim();
  const sectionName = String(req.body?.sectionName || "").trim();
  if (!templateId) {
    res.status(400).json({ error: "templateId is required." });
    return;
  }

  try {
    const entries = await listTemplateLibraryEntries();
    const existing = entries.find((entry) => String(entry?.id || "").trim().toLowerCase() === templateId.toLowerCase());
    if (!existing || !existing.templateUrl) {
      res.status(404).json({ error: "Template not found." });
      return;
    }

    await upsertTemplateLibraryEntries([{ ...existing, sectionName }], access.email);
    const nextEntries = await listTemplateLibraryEntries();
    res.json({ ok: true, entries: nextEntries });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not move template." });
  }
});

async function ensureStudentLoginDriveSetupSchema() {
  if (!hasDatabase) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS student_login_drive_setup (
    student_email TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function getStudentLoginDriveSetup(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!hasDatabase) return memoryStudentLoginDriveSetup.get(normalizedEmail) || null;
  await ensureStudentLoginDriveSetupSchema();
  const result = await pool.query("SELECT folder_id FROM student_login_drive_setup WHERE student_email = $1", [normalizedEmail]);
  return result.rows?.[0] || null;
}

async function saveStudentLoginDriveSetup(email, folderId) {
  const normalizedEmail = normalizeEmail(email);
  if (!hasDatabase) {
    memoryStudentLoginDriveSetup.set(normalizedEmail, { folder_id: folderId });
    return;
  }
  await ensureStudentLoginDriveSetupSchema();
  await pool.query(`INSERT INTO student_login_drive_setup (student_email, folder_id) VALUES ($1, $2)
    ON CONFLICT (student_email) DO UPDATE SET folder_id = EXCLUDED.folder_id, confirmed_at = NOW()`,
  [normalizedEmail, folderId]);
}

app.get("/api/student/login-drive-setup", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." }); return;
  }
  try {
    const setup = await getStudentLoginDriveSetup(email);
    res.json({ ready: Boolean(setup?.folder_id), folderUrl: setup?.folder_id ? `https://drive.google.com/drive/folders/${encodeURIComponent(setup.folder_id)}` : null });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load your WHS-DTECH folder setup." });
  }
});

app.post("/api/student/login-drive-setup", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." }); return;
  }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "Google Drive permission is required." }); return; }
  try {
    const identityResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${driveAccessToken}` }
    });
    if (!identityResponse.ok) {
      res.status(401).json({ error: "Google Drive sign-in expired. Sign in again and retry." }); return;
    }
    const identity = await identityResponse.json();
    if (!identity.email_verified || normalizeEmail(identity.email) !== email) {
      res.status(403).json({ error: "Choose the same school Google account as your DTECH-HUB sign-in." }); return;
    }
    const folder = await driveEnsureFolder("root", "WHS-DTECH", driveAccessToken);
    if (!folder?.id) throw new Error("Could not find or create your WHS-DTECH folder.");
    const sharing = await driveEnsureAnyoneEditorPermission(folder.id, driveAccessToken);
    if (!sharing.applied) throw new Error("Could not enable anyone-with-the-link Editor sharing. Ask your teacher for help.");
    await saveStudentLoginDriveSetup(email, folder.id);
    res.json({ ready: true, folderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(folder.id)}`, sharing });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not set up your WHS-DTECH folder." });
  }
});

app.get("/api/student/mdtech-project-folder", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }

  try {
    const programmeFolder = await getStudentProgrammeFolder(email);
    if (programmeFolder !== "MiddleDTECH") {
      res.status(403).json({ error: "The MDTECH Project folder is only available to MiddleDTECH students." });
      return;
    }

    const setup = await getStudentDriveSetup(email);
    const folderId = String(setup?.mdtechProjectFolderId || "").trim();
    res.json({
      ready: Boolean(folderId),
      folderId: folderId || null,
      folderUrl: folderId ? buildDriveFolderUrlFromId(folderId) : null,
      folderName: "MDTECH Project"
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not check your MDTECH Project folder." });
  }
});

app.post("/api/student/mdtech-project-folder", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) {
    res.status(400).json({ error: "Google Drive permission is required." });
    return;
  }

  try {
    const programmeFolder = await getStudentProgrammeFolder(email);
    if (programmeFolder !== "MiddleDTECH") {
      res.status(403).json({ error: "The MDTECH Project folder is only available to MiddleDTECH students." });
      return;
    }

    const identityResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${driveAccessToken}` }
    });
    if (!identityResponse.ok) {
      res.status(401).json({ error: "Google Drive sign-in expired. Sign in again and retry." });
      return;
    }
    const identity = await identityResponse.json();
    if (!identity.email_verified || normalizeEmail(identity.email) !== email) {
      res.status(403).json({ error: "Choose the same school Google account as your DTECH-HUB sign-in." });
      return;
    }

    const savedLoginSetup = await getStudentLoginDriveSetup(email);
    const existingRoot = savedLoginSetup?.folder_id
      ? await driveGetLiveFile(String(savedLoginSetup.folder_id), driveAccessToken)
      : null;
    const root = existingRoot || await driveEnsureFolder("root", "WHS-DTECH", driveAccessToken);
    if (!root?.id) {
      res.status(500).json({ error: "Could not find or create your WHS-DTECH folder." });
      return;
    }
    const middleFolder = await driveEnsureFolder(String(root.id), "MiddleDTECH", driveAccessToken);
    if (!middleFolder?.id) {
      res.status(500).json({ error: "Could not find or create your MiddleDTECH folder." });
      return;
    }
    const folder = await driveEnsureFolder(String(middleFolder.id), "MDTECH Project", driveAccessToken);
    if (!folder?.id) {
      res.status(500).json({ error: "Could not find or create your MDTECH Project folder." });
      return;
    }

    await saveStudentMdtechProjectFolder(email, String(folder.id));
    res.json({
      ready: true,
      folderId: String(folder.id),
      folderUrl: String(folder.webViewLink || buildDriveFolderUrlFromId(folder.id)).trim(),
      folderName: "MDTECH Project"
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not set up your MDTECH Project folder." });
  }
});

app.get("/api/student/drive-setup", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  try {
    const setup = await resolveStudentDriveSetupState(email);
    if (!setup) {
      res.json(buildStudentDriveSetupPayload());
      return;
    }

    res.json(setup);
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load drive setup" });
  }
});

app.post("/api/student/drive-setup/status", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) {
    res.status(400).json({ error: "driveAccessToken is required." });
    return;
  }

  try {
    const setup = await resolveStudentDriveSetupState(email, driveAccessToken);
    if (!setup) {
      res.json(buildStudentDriveSetupPayload());
      return;
    }

    const sharing = { applied: false };
    const sharingWarnings = [];
    if (setup.processAssessmentFolderId) {
      try {
        Object.assign(sharing, await driveEnsureAnyoneEditorPermission(setup.processAssessmentFolderId, driveAccessToken));
      } catch (sharingError) {
        sharingWarnings.push(`Could not set Process Assessment folder sharing to anyone with the link as Editor (${String(sharingError?.message || "Drive permission error")}).`);
      }
    }

    res.json({ ...setup, sharing, warnings: sharingWarnings });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not check Google Drive setup." });
  }
});

app.post("/api/student/drive-setup/confirm", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  try {
    const seniorDtechFolder = await driveEnsureFolder("root", "SeniorDTECH", driveAccessToken);
    if (!seniorDtechFolder?.id) { res.status(500).json({ error: "Could not find or create the SeniorDTECH folder." }); return; }

    const folder = await driveEnsureFolder(String(seniorDtechFolder.id), "Process Assessment", driveAccessToken);
    if (!folder?.id) { res.status(500).json({ error: "Could not find or create the Process Assessment folder." }); return; }

    const setupWarnings = [];
    let sharing = { applied: false };
    try {
      sharing = await driveEnsureAnyoneEditorPermission(folder.id, driveAccessToken);
    } catch (sharingError) {
      setupWarnings.push(`Could not set Process Assessment folder sharing to anyone with the link as Editor (${String(sharingError?.message || "Drive permission error")}).`);
    }
    let digitalOutcomeFolder = null;
    let relevantImplicationsFolder = null;

    try {
      digitalOutcomeFolder = await driveEnsureFolder(String(folder.id), PROCESS_ASSESSMENT_DIGITAL_OUTCOME_FOLDER_NAME, driveAccessToken);
      if (!digitalOutcomeFolder?.id) {
        setupWarnings.push("Could not confirm the Digital Outcome Details sub-folder yet.");
      }
    } catch (subfolderError) {
      setupWarnings.push(`Could not confirm the Digital Outcome Details sub-folder yet (${String(subfolderError?.message || "Drive error")}).`);
    }

    try {
      relevantImplicationsFolder = await driveEnsureFolder(String(folder.id), PROCESS_ASSESSMENT_RELEVANT_IMPLICATIONS_FOLDER_NAME, driveAccessToken);
      if (!relevantImplicationsFolder?.id) {
        setupWarnings.push("Could not confirm the Relevant Implications sub-folder yet.");
      }
    } catch (subfolderError) {
      setupWarnings.push(`Could not confirm the Relevant Implications sub-folder yet (${String(subfolderError?.message || "Drive error")}).`);
    }

    await saveStudentDriveSetup(email, folder.id);
    res.json({
      ok: true,
      seniorDtechFolderId: seniorDtechFolder.id,
      seniorDtechFolderUrl: seniorDtechFolder.webViewLink || `https://drive.google.com/drive/folders/${seniorDtechFolder.id}`,
      processAssessmentFolderId: folder.id,
      processAssessmentFolderUrl: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
      digitalOutcomeDetailsFolderId: String(digitalOutcomeFolder?.id || "").trim() || null,
      digitalOutcomeDetailsFolderUrl: digitalOutcomeFolder?.id
        ? (digitalOutcomeFolder.webViewLink || `https://drive.google.com/drive/folders/${digitalOutcomeFolder.id}`)
        : null,
      relevantImplicationsFolderId: String(relevantImplicationsFolder?.id || "").trim() || null,
      relevantImplicationsFolderUrl: relevantImplicationsFolder?.id
        ? (relevantImplicationsFolder.webViewLink || `https://drive.google.com/drive/folders/${relevantImplicationsFolder.id}`)
        : null,
      sharing,
      warnings: setupWarnings
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not confirm drive setup." });
  }
});

const PROCESS_ASSESSMENT_DECOMPOSITION_FOLDER_NAME = "Decomposition";

app.get("/api/students/decomposition-coverage", async (req, res) => {
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  if (!requesterEmail) { res.status(401).json({ error: "Sign in is required." }); return; }

  const activityId = String(req.query?.activity_id || req.query?.activityId || "").trim();
  if (!activityId) { res.status(400).json({ error: "activity_id is required." }); return; }

  const requestedEmail = normalizeEmail(req.query?.student_email || req.query?.studentEmail || "") || requesterEmail;
  if (requestedEmail !== requesterEmail) {
    const access = await resolveActivityWriteAccess(requesterEmail);
    if (!access.allowed) { res.status(403).json({ error: "You can only view your own decomposition coverage." }); return; }
  }

  try {
    const row = await getDecompositionCoverage(requestedEmail, activityId);
    res.json(buildDecompositionCoveragePayload(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load decomposition coverage." });
  }
});

app.post("/api/students/decomposition-coverage", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }

  const activityId = String(req.body?.activity_id || req.body?.activityId || "").trim();
  if (!activityId) { res.status(400).json({ error: "activity_id is required." }); return; }

  try {
    const row = await saveDecompositionCoverage(
      email,
      activityId,
      req.body?.categories,
      req.body?.trello_task_count ?? req.body?.trelloTaskCount
    );
    res.json(buildDecompositionCoveragePayload(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save decomposition coverage." });
  }
});

app.post("/api/student/drive-setup/upload-decomposition-pdf", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }

  const requestedName = String(req.body?.fileName || "").trim().replace(/[\\/:*?"<>|]/g, "-");
  const fileName = requestedName.toLowerCase().endsWith(".pdf") ? requestedName : `${requestedName || "Trello"}.pdf`;
  const fileBase64 = String(req.body?.fileBase64 || "").trim();
  if (!fileBase64) { res.status(400).json({ error: "fileBase64 is required." }); return; }

  let buffer = null;
  try {
    buffer = Buffer.from(fileBase64, "base64");
  } catch (_error) {
    res.status(400).json({ error: "fileBase64 could not be decoded." });
    return;
  }
  if (!buffer?.length) { res.status(400).json({ error: "The PDF was empty." }); return; }

  try {
    const taskFolder = await getStudentTaskListDriveFolder(email);
    let taskFolderId = String(taskFolder.folderId || "").trim();
    if (!taskFolderId && taskFolder.programmeFolder === "MiddleDTECH") {
      res.status(400).json({ error: "Please set up your MDTECH Project folder first." });
      return;
    }
    if (!taskFolderId) {
      const seniorDtechFolder = await driveEnsureFolder("root", "SeniorDTECH", driveAccessToken);
      if (!seniorDtechFolder?.id) { res.status(500).json({ error: "Could not find or create the SeniorDTECH folder." }); return; }
      const processAssessmentFolder = await driveEnsureFolder(String(seniorDtechFolder.id), "Process Assessment", driveAccessToken);
      if (!processAssessmentFolder?.id) { res.status(500).json({ error: "Could not find or create the Process Assessment folder." }); return; }
      taskFolderId = String(processAssessmentFolder.id);
    }

    const decompositionFolder = await driveEnsureFolder(taskFolderId, PROCESS_ASSESSMENT_DECOMPOSITION_FOLDER_NAME, driveAccessToken);
    if (!decompositionFolder?.id) { res.status(500).json({ error: "Could not find or create the Decomposition folder." }); return; }

    const existing = await driveFindFileByNameInFolder(String(decompositionFolder.id), fileName, driveAccessToken);
    const uploaded = await driveUploadBinaryFile({
      accessToken: driveAccessToken,
      folderId: String(decompositionFolder.id),
      fileName,
      mimeType: "application/pdf",
      buffer,
      existingFileId: String(existing?.id || "")
    });

    res.json({
      ok: true,
      replaced: Boolean(existing?.id),
      fileId: uploaded?.id || "",
      fileName: uploaded?.name || fileName,
      fileUrl: uploaded?.webViewLink || (uploaded?.id ? `https://drive.google.com/file/d/${uploaded.id}/view` : ""),
      decompositionFolderId: decompositionFolder.id,
      decompositionFolderUrl: decompositionFolder.webViewLink || `https://drive.google.com/drive/folders/${decompositionFolder.id}`
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not save the PDF to Google Drive." });
  }
});

app.post("/api/student/drive-setup/copy-template", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const templateTitle = String(req.body?.templateTitle || "").trim();
  const templateFileId = String(req.body?.templateFileId || "").trim();
  const templateId = String(req.body?.templateId || "").trim();
  const sourcePresentationId = String(req.body?.sourcePresentationId || "").trim();
  const sourceRelevantImplications = Array.isArray(req.body?.sourceRelevantImplications)
    ? req.body.sourceRelevantImplications
    : [];
  if (!driveAccessToken || !templateTitle || !templateFileId) {
    res.status(400).json({ error: "driveAccessToken, templateTitle, and templateFileId are required." });
    return;
  }
  if (!/^[A-Za-z0-9_-]{20,}$/.test(templateFileId)) {
    res.status(400).json({ error: "Invalid templateFileId." });
    return;
  }
  try {
    const taskFolder = await getStudentTaskListDriveFolder(email);
    if (!taskFolder.folderId) {
      res.status(400).json({ error: `Please confirm your ${taskFolder.folderName} folder first.` });
      return;
    }
    const processAssessmentFolderId = String(taskFolder.folderId || "").trim();
    const processAssessmentFolderUrl = buildDriveFolderUrlFromId(processAssessmentFolderId);
    const activityId = String(req.body?.activityId || "").trim();
    await driveEnsureAnyoneEditorPermission(processAssessmentFolderId, driveAccessToken).catch(() => {});
    let resolvedSourcePresentationId = sourcePresentationId;
    const isTriallingComponentsTemplate = templateId.toLowerCase() === "trialling-components"
      || /triall?ing\s+components|trailing\s+components/i.test(templateTitle);
    const isDevelopmentStepsTemplate = templateId.toLowerCase() === "development-steps"
      || /development\s+steps/i.test(templateTitle);
    const isTestingFunctionsTemplate = templateId.toLowerCase() === "testing-functions"
      || /testing\s+functions/i.test(templateTitle);
    if ((isTriallingComponentsTemplate || isDevelopmentStepsTemplate || isTestingFunctionsTemplate) && !resolvedSourcePresentationId) {
      const studentSlides = await driveListSlidesInProcessAssessmentTree(processAssessmentFolderId, driveAccessToken);
      const normalizeSlideName = (value) => String(value || "")
        .toLowerCase()
        .replace(/\s+-\s+[^-]+$/, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const sourceName = isDevelopmentStepsTemplate || isTestingFunctionsTemplate ? "digital outcome description" : "development steps";
      const sourceSlide = studentSlides
        .filter((file) => normalizeSlideName(file?.name) === sourceName)
        .sort((left, right) => String(right?.modifiedTime || "").localeCompare(String(left?.modifiedTime || "")))[0];
      resolvedSourcePresentationId = String(sourceSlide?.id || "").trim();
    }
    const subfolderName = resolveProcessAssessmentSubfolderName(templateId, templateTitle);
    let folderId = processAssessmentFolderId;
    if (subfolderName) {
      const subfolder = await driveEnsureFolder(processAssessmentFolderId, subfolderName, driveAccessToken);
      if (!subfolder?.id) {
        res.status(500).json({ error: `Could not find or create the ${subfolderName} folder.` });
        return;
      }
      folderId = String(subfolder.id).trim();
    }

    const existing = await driveFindTemplateInFolder(folderId, templateTitle, driveAccessToken);
    const populateCopiedTemplateData = async (targetFileId) => {
      const isSuccessCriteria = templateId.toLowerCase() === "project-success-criteria"
        || /success\s+criteria/i.test(templateTitle);
      const isDevelopmentSteps = templateId.toLowerCase() === "development-steps"
        || /development\s+steps/i.test(templateTitle);
      const isTriallingComponents = templateId.toLowerCase() === "trialling-components"
        || /triall?ing\s+components|trailing\s+components/i.test(templateTitle);
      const isTestingFunctions = templateId.toLowerCase() === "testing-functions"
        || /testing\s+functions/i.test(templateTitle);
      if (templateId.toLowerCase() === "use-of-tools-and-techniques" || /^use\s+of\s+tools/i.test(templateTitle)) {
        try {
          const result = await populateUseOfToolsTechniques(targetFileId, activityId, email, driveAccessToken);
          return { updated: result.updated, count: result.count, implicationsCount: 0 };
        } catch (error) {
          return { updated: false, count: 0, warning: error.message || "Could not populate Tools & Techniques." };
        }
      }
      if ((!isSuccessCriteria && !isDevelopmentSteps && !isTriallingComponents && !isTestingFunctions) || !resolvedSourcePresentationId) return { updated: false, count: 0 };

      try {
        if (isTestingFunctions) {
          const sourcePresentation = await googleSlidesApiRequest(resolvedSourcePresentationId, driveAccessToken);
          const mustDos = extractGoogleSlidesMustDos(sourcePresentation);
          const result = await populateTestingFunctionsMustDos(targetFileId, mustDos, driveAccessToken);
          return { updated: result.updated, count: result.count, tableCount: result.tableCount || 0 };
        }

        if (isTriallingComponents) {
          const result = await populateTriallingComponents(targetFileId, resolvedSourcePresentationId, driveAccessToken);
          return { updated: result.updated, count: result.count, implicationsCount: 0 };
        }
        const sourcePresentation = await googleSlidesApiRequest(resolvedSourcePresentationId, driveAccessToken);
        const mustDos = extractGoogleSlidesMustDos(sourcePresentation);

        if (isDevelopmentSteps) {
          const result = await populateDevelopmentStepsMustDos(targetFileId, mustDos, driveAccessToken);
          return {
            updated: result.updated,
            count: result.count,
            implicationsCount: 0
          };
        }

        const requirementsResult = await populateSuccessCriteriaRequirements(targetFileId, mustDos, driveAccessToken);
        const implicationsResult = await populateSuccessCriteriaImplications(targetFileId, sourceRelevantImplications, driveAccessToken);
        return {
          updated: requirementsResult.updated || implicationsResult.updated,
          count: requirementsResult.count,
          implicationsCount: implicationsResult.count
        };
      } catch (error) {
        const context = isDevelopmentSteps ? "Development Steps" : "Success Criteria";
        return { updated: false, count: 0, warning: error.message || `Could not populate ${context} requirements.` };
      }
    };

    if (existing.length > 0) {
      const file = existing[0];
      const populated = await populateCopiedTemplateData(file.id);
      if (activityId) {
        await ensureProjectInterestGoogleDriveFolderEvidence(activityId, email, processAssessmentFolderUrl).catch(() => {});
        if (templateId) {
          await recordTemplateCopyInDb(activityId, email, {
            templateId,
            templateTitle,
            fileUrl: file.webViewLink || `https://docs.google.com/presentation/d/${file.id}/edit`,
            fileName: file.name,
            processAssessmentFolderUrl,
            destinationFolderUrl: buildDriveFolderUrlFromId(folderId),
            destinationFolderId: folderId
          }).catch(() => {});
        }
      }
      return res.json({ ok: true, alreadyExists: true, populated: populated.updated, populatedCount: populated.count, populatedImplicationsCount: populated.implicationsCount || 0, populationWarning: populated.warning || "", fileId: file.id, fileUrl: file.webViewLink || `https://docs.google.com/presentation/d/${file.id}/edit`, fileName: file.name, destinationFolderId: folderId, destinationSubfolderName: subfolderName || "" });
    }

    if (folderId !== processAssessmentFolderId) {
      const legacyExisting = await driveFindTemplateInFolder(processAssessmentFolderId, templateTitle, driveAccessToken);
      if (legacyExisting.length > 0) {
        const file = legacyExisting[0];
        const populated = await populateCopiedTemplateData(file.id);
        if (activityId) {
          await ensureProjectInterestGoogleDriveFolderEvidence(activityId, email, processAssessmentFolderUrl).catch(() => {});
          if (templateId) {
            await recordTemplateCopyInDb(activityId, email, {
              templateId,
              templateTitle,
              fileUrl: file.webViewLink || `https://docs.google.com/presentation/d/${file.id}/edit`,
              fileName: file.name,
              processAssessmentFolderUrl,
              destinationFolderUrl: processAssessmentFolderUrl,
              destinationFolderId: processAssessmentFolderId
            }).catch(() => {});
          }
        }
        return res.json({ ok: true, alreadyExists: true, populated: populated.updated, populatedCount: populated.count, populatedImplicationsCount: populated.implicationsCount || 0, populationWarning: populated.warning || "", fileId: file.id, fileUrl: file.webViewLink || `https://docs.google.com/presentation/d/${file.id}/edit`, fileName: file.name, destinationFolderId: processAssessmentFolderId, destinationSubfolderName: "" });
      }
    }

    const emailUsername = email.split("@")[0];
    const firstName = emailUsername.split(/[._]/)[0] || emailUsername;
    const formattedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    const copyName = `${templateTitle} - ${formattedFirstName}`;
    const copied = await driveCopyFile(templateFileId, folderId, copyName, driveAccessToken);
    const populated = await populateCopiedTemplateData(copied.id);

    // Record template copy in DB so task list can track it reliably across devices
    if (hasDatabase && templateId) {
      if (activityId) {
        await ensureProjectInterestGoogleDriveFolderEvidence(activityId, email, processAssessmentFolderUrl).catch(() => {});
        await recordTemplateCopyInDb(activityId, email, {
          templateId,
          templateTitle,
          fileUrl: copied.webViewLink || `https://docs.google.com/presentation/d/${copied.id}/edit`,
          fileName: copied.name,
          processAssessmentFolderUrl,
          destinationFolderUrl: buildDriveFolderUrlFromId(folderId),
          destinationFolderId: folderId
        }).catch(() => {});
      }
    }

    res.json({ ok: true, alreadyExists: false, populated: populated.updated, populatedCount: populated.count, populatedImplicationsCount: populated.implicationsCount || 0, populationWarning: populated.warning || "", fileId: copied.id, fileUrl: copied.webViewLink || `https://docs.google.com/presentation/d/${copied.id}/edit`, fileName: copied.name, destinationFolderId: folderId, destinationSubfolderName: subfolderName || "" });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not copy template." });
  }
});

function findBestStudentTaskTopicSlide(slides, taskTopic) {
  const normalizeText = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const normalizedTopic = normalizeText(taskTopic);
  const tokens = normalizedTopic.split(/\s+/).filter(Boolean);
  const wantsDevelopmentStepsExact = normalizedTopic === "development steps";
  const wantsTargetAudience = tokens.includes("target") || tokens.includes("audience") || (tokens.includes("end") && tokens.includes("user"));
  const wantsDescription = tokens.includes("description") || (tokens.includes("digital") && tokens.includes("outcome"));
  const wantsToolsAndTechniques = tokens.includes("tools") && tokens.includes("techniques");
  const wantsDevelopmentTools = !wantsToolsAndTechniques && !wantsDevelopmentStepsExact
    && (tokens.includes("developed") || tokens.includes("tools") || tokens.includes("technologies"));
  const wantsSuccessCriteria = tokens.includes("success") || tokens.includes("measured") || tokens.includes("evaluated");

  const scored = (Array.isArray(slides) ? slides : [])
    .map((file) => {
      const name = String(file?.name || "").trim();
      const normalizedName = normalizeText(name);
      const normalizedNameWithoutStudent = normalizedName.replace(/\s+-\s+[a-z0-9._-]+$/, "").trim();
      let score = 0;

      if (wantsDevelopmentStepsExact) {
        if (normalizedNameWithoutStudent === "development steps") score += 1000;
        else return { file, score: 0, modifiedTs: Date.parse(String(file?.modifiedTime || "")) || 0 };
      }

      if (wantsTargetAudience) {
        if (normalizedName.includes("target audience")) score += 100;
        if (normalizedName.includes("audience")) score += 50;
        if (normalizedName.includes("end user")) score += 40;
      }

      if (wantsDescription) {
        if (normalizedName.includes("digital outcome description")) score += 100;
        if (normalizedName.includes("description")) score += 40;
      }

      if (wantsToolsAndTechniques
        && normalizedName.includes("tools")
        && normalizedName.includes("techniques")) {
        score += 200;
      }

      if (wantsDevelopmentTools) {
        if (normalizedName.includes("relevant implications")) score += 100;
        if (normalizedName.includes("project success criteria")) score += 80;
        if (normalizedName.includes("tools") || normalizedName.includes("technologies")) score += 35;
      }

      if (wantsSuccessCriteria) {
        if (normalizedName.includes("project success criteria")) score += 110;
        if (normalizedName.includes("success")) score += 45;
        if (normalizedName.includes("criteria")) score += 25;
      }

      if (!wantsTargetAudience && !wantsDescription && !wantsDevelopmentTools
        && !wantsToolsAndTechniques && !wantsSuccessCriteria) {
        score += tokens.reduce((sum, token) => sum + (normalizedName.includes(token) ? 5 : 0), 0);
      }

      return {
        file,
        score,
        modifiedTs: Date.parse(String(file?.modifiedTime || "")) || 0
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.modifiedTs - left.modifiedTs;
    });

  const requiresMatch = wantsDevelopmentStepsExact || wantsToolsAndTechniques;
  return requiresMatch
    ? scored.find((entry) => entry.score > 0)?.file || null
    : scored[0]?.file || null;
}

app.post("/api/student/drive-setup/find-slide", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const taskTopic = String(req.body?.taskTopic || "").trim().toLowerCase();
  if (!driveAccessToken) {
    res.status(400).json({ error: "driveAccessToken is required." });
    return;
  }

  try {
    const taskFolder = await getStudentTaskListDriveFolder(email);
    const folderId = String(taskFolder.folderId || "").trim();
    if (!folderId) {
      res.status(400).json({ error: `Please confirm your ${taskFolder.folderName} folder first.` });
      return;
    }

    const slides = await driveListSlidesInProcessAssessmentTree(folderId, driveAccessToken);
    if (!slides.length) {
      res.status(404).json({ error: `No Google Slides files found in ${taskFolder.folderName} folder.` });
      return;
    }

    const best = findBestStudentTaskTopicSlide(slides, taskTopic);
    if (!best) {
      res.status(404).json({ error: "No matching slide found." });
      return;
    }

    res.json({
      ok: true,
      fileId: String(best.id || "").trim(),
      fileName: String(best.name || "").trim(),
      fileUrl: String(best.webViewLink || `https://docs.google.com/presentation/d/${String(best.id || "").trim()}/edit`).trim(),
      thumbnailUrl: String(best.thumbnailLink || "").trim(),
      modifiedTime: String(best.modifiedTime || "").trim()
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not find matching slide." });
  }
});

const TEMPLATE_ID_FROM_TITLE_PATTERNS = [
  { pattern: /^relevant\s+implications\s*-\s*(.+?)(?:\s+-\s+.+)?$/i, prefix: "relevant-implications-" },
  { pattern: /^testing\s+functions\s*-\s*(.+?)(?:\s+-\s+.+)?$/i, prefix: "testing-functions-" },
  { pattern: /^digital\s+outcome\s+description(?:\s*-\s*.+)?$/i, id: "digital-outcome-description", title: "Digital Outcome Description" },
  { pattern: /^target\s+audience(?:\s*-\s*.+)?$/i, id: "target-audience", title: "Target Audience" },
  { pattern: /^development\s+steps(?:\s*-\s*.+)?$/i, id: "development-steps", title: "Development Steps" },
  { pattern: /^use\s+of\s+tools?\s*(?:&|and)\s*techniques?(?:\s*-\s*.+)?$/i, id: "use-of-tools-and-techniques", title: "Use of Tools & Techniques" },
  { pattern: /^(?:.*\s+)?tools?\s*(?:&|and)\s*techniques?(?:\s*-\s*.+)?$/i, id: "tools-and-techniques", title: "Tools & Techniques" },
  { pattern: /^triall?ing\s+components(?:\s*-\s*.+)?$/i, id: "trialling-components", title: "Trialling Components" },
  { pattern: /^trailing\s+comp(?:onents|onets|onets)?(?:\s*-\s*.+)?$/i, id: "trialling-components", title: "Trialling Components" },
  { pattern: /^testing\s+functions(?:\s*-\s*.+)?$/i, id: "testing-functions", title: "Testing Functions" },
  { pattern: /^(?:afull\s*-\s*)?relevant\s+(?:digimed\s+)?conventions(?:\s+template)?(?:\s*-\s*.+)?$/i, id: "relevant-digimed-conventions", title: "Relevant DigiMed Conventions" },
  { pattern: /^user\s+experience\s+(?:\(ux\)\s+)?principles(?:\s*-\s*.+)?$/i, id: "user-experience-principles", title: "User Experience (UX) Principles" },
  { pattern: /^project\s+success\s+criteria(?:\s*-\s*.+)?$/i, id: "project-success-criteria", title: "Project Success Criteria" },
];

function inferTemplateCopyFromFileName(fileName) {
  const name = String(fileName || "").trim();
  if (!name) return null;

  for (const entry of TEMPLATE_ID_FROM_TITLE_PATTERNS) {
    const match = name.match(entry.pattern);
    if (!match) continue;

    if (entry.prefix) {
      // Variable template — category is the first capture group
      const subtopic = String(match[1] || "").trim();
      const slug = subtopic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const prefixLabel = entry.prefix
        .replace(/-+$/, "")
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return {
        templateId: `${entry.prefix}${slug}`,
        templateTitle: `${prefixLabel} - ${subtopic}`,
        fileUrl: "",
        fileName: name
      };
    }

    return { templateId: entry.id, templateTitle: entry.title, fileUrl: "", fileName: name };
  }

  return null;
}

function inferTemplateCopiesFromSlideSet(presentation, fileUrl, fileName) {
  const copiesById = new Map();
  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const standaloneImplicationCategories = new Set([
    "social", "cultural", "legal", "ethical", "intellectual property", "privacy",
    "accessibility", "usability", "functionality", "aesthetics",
    "sustainability and future proofing", "end-user considerations", "health and safety"
  ]);

  slides.forEach((slide) => {
    const lines = [];
    (Array.isArray(slide?.pageElements) ? slide.pageElements : []).forEach((element) => {
      const textElements = Array.isArray(element?.shape?.text?.textElements)
        ? element.shape.text.textElements : [];
      const shapeText = textElements
        .map((entry) => String(entry?.textRun?.content || ""))
        .join("");
      shapeText.split(/\r?\n/).forEach((line) => {
        const cleanLine = String(line || "")
          .replace(/^\s*(?:\d+\s*[.)]|[\u2022\u25CF\u25E6*-])\s*/, "")
          .replace(/\s+/g, " ")
          .trim();
        if (cleanLine) lines.push(cleanLine);
      });

      const rows = Array.isArray(element?.table?.tableRows) ? element.table.tableRows : [];
      rows.forEach((row) => {
        (Array.isArray(row?.tableCells) ? row.tableCells : []).forEach((cell) => {
          const cellText = extractGoogleSlidesTableCellText(cell);
          String(cellText || "").split(/\r?\n/).forEach((line) => {
            const cleanLine = String(line || "").replace(/\s+/g, " ").trim();
            if (cleanLine) lines.push(cleanLine);
          });
        });
      });
    });

    const entry = lines.map((heading) => {
      const canonical = inferTemplateCopyFromFileName(heading);
      if (canonical) return canonical;

      const normalizedHeading = heading.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
      if (standaloneImplicationCategories.has(normalizedHeading)) {
        const category = heading.trim();
        const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        return {
          templateId: `relevant-implications-${slug}`,
          templateTitle: `Relevant Implications - ${category}`
        };
      }

      return null;
    }).find(Boolean);

    if (!entry?.templateId || copiesById.has(entry.templateId)) return;
    copiesById.set(entry.templateId, {
      ...entry,
      fileUrl: String(fileUrl || "").trim(),
      fileName: String(fileName || "").trim()
    });
  });

  return Array.from(copiesById.values());
}

// POST /api/activities/:id/sync-drive-templates — scan Drive folder, infer template copies, save to DB
app.post("/api/activities/:id/sync-drive-templates", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();

  if (!projectId) { res.status(400).json({ error: "Project ID is required." }); return; }
  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." }); return;
  }
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }

  try {
    const taskFolder = await getStudentTaskListDriveFolder(requesterEmail);
    const folderId = String(taskFolder.folderId || "").trim();
    if (!folderId) {
      res.status(400).json({ error: `Please confirm your ${taskFolder.folderName} folder first.` });
      return;
    }

    const slides = await driveListSlidesInProcessAssessmentTree(folderId, driveAccessToken);
    const inferred = [];

    for (const file of slides) {
      const entry = inferTemplateCopyFromFileName(file.name);
      if (!entry) continue;
      entry.fileUrl = String(file.webViewLink || `https://docs.google.com/presentation/d/${file.id}/edit`).trim();
      entry.fileName = String(file.name || "").trim();
      inferred.push(entry);
    }

    if (hasDatabase && inferred.length > 0) {
      for (const entry of inferred) {
        await recordTemplateCopyInDb(projectId, requesterEmail, entry).catch(() => {});
      }
    }

    // Return the full updated list
    let allCopies = inferred;
    if (hasDatabase) {
      const result = await pool.query(
        `SELECT template_copies FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1`,
        [projectId, requesterEmail]
      );
      allCopies = Array.isArray(result.rows?.[0]?.template_copies) ? result.rows[0].template_copies : inferred;
    }

    res.json({ ok: true, synced: inferred.length, template_copies: allCopies });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not sync from Drive." });
  }
});

app.post("/api/activities/:id/sync-slide-set", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationUrl = String(req.body?.presentationUrl || "").trim();
  const presentationId = presentationUrl.match(/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/i)?.[1] || "";

  if (!projectId) { res.status(400).json({ error: "Project ID is required." }); return; }
  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." }); return;
  }
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  if (!presentationId) {
    res.status(400).json({ error: "Paste a valid Google Slides presentation link." });
    return;
  }

  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(presentationId)}`, {
      accessToken: driveAccessToken,
      queryParams: { fields: "id,name,mimeType,webViewLink,trashed" }
    });
    if (file?.mimeType !== "application/vnd.google-apps.presentation" || file?.trashed) {
      res.status(400).json({ error: "The link must open a Google Slides presentation." });
      return;
    }

    const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
    const fileUrl = String(file?.webViewLink || presentationUrl).trim();
    const fileName = String(file?.name || "Full slide set").trim();
    const fullSlideSetEntry = {
      templateId: "assessment-full-slide-set",
      templateTitle: "Full Assessment Slide Set",
      fileUrl,
      fileName
    };
    const inferred = inferTemplateCopiesFromSlideSet(presentation, fileUrl, fileName);
    const testingFunctionsCounts = inferred.some((entry) => entry.templateId === "testing-functions")
      ? extractGoogleSlidesTestingFunctionLists(presentation)
      : null;

    if (hasDatabase) {
      for (const entry of [fullSlideSetEntry, ...inferred]) {
        await recordTemplateCopyInDb(projectId, requesterEmail, entry);
      }
    }

    let allCopies = [fullSlideSetEntry, ...inferred];
    if (hasDatabase) {
      const result = await pool.query(
        `SELECT template_copies FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1`,
        [projectId, requesterEmail]
      );
      allCopies = Array.isArray(result.rows?.[0]?.template_copies) ? result.rows[0].template_copies : inferred;
    }

    res.json({
      ok: true,
      synced: inferred.length,
      template_copies: allCopies,
      matched: inferred.map((entry) => entry.templateTitle),
      full_slide_set: { fileUrl, fileName },
      testing_functions_counts: testingFunctionsCounts
        ? { functionalCount: testingFunctionsCounts.functionalTesting.length, userCount: testingFunctionsCounts.userTesting.length }
        : null
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not sync the full slide set." });
  }
});

app.post("/api/student/drive-setup/list-process-assessment-slides", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) {
    res.status(400).json({ error: "driveAccessToken is required." });
    return;
  }

  try {
    const taskFolder = await getStudentTaskListDriveFolder(email);
    const folderId = String(taskFolder.folderId || "").trim();
    if (!folderId) {
      res.status(400).json({ error: `Please confirm your ${taskFolder.folderName} folder first.` });
      return;
    }

    const slides = await driveListSlidesInProcessAssessmentTree(folderId, driveAccessToken);
    res.json({
      ok: true,
      slides: slides.map((file) => ({
        id: String(file?.id || "").trim(),
        name: String(file?.name || "").trim(),
        webViewLink: String(file?.webViewLink || `https://docs.google.com/presentation/d/${String(file?.id || "").trim()}/edit`).trim(),
        thumbnailLink: String(file?.thumbnailLink || "").trim(),
        modifiedTime: String(file?.modifiedTime || "").trim(),
        processAssessmentSubfolder: String(file?.processAssessmentSubfolder || "").trim()
      }))
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not list Process Assessment slides." });
  }
});

app.post("/api/student/drive-setup/read-digital-outcome-must-dos", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationId = String(req.body?.presentationId || "").trim();
  if (!driveAccessToken) {
    res.status(400).json({ error: "driveAccessToken is required." });
    return;
  }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(presentationId)) {
    res.status(400).json({ error: "A valid Google Slides presentation ID is required." });
    return;
  }

  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(presentationId)}`, {
      accessToken: driveAccessToken,
      queryParams: { fields: "id,name,modifiedTime,webViewLink" }
    });
    let mustDos = [];
    let extractionSource = "slides-api";
    try {
      const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
      mustDos = extractGoogleSlidesMustDos(presentation);
    } catch (slidesApiError) {
      const pdfBuffer = await driveDownloadExportedFile(presentationId, "application/pdf", driveAccessToken);
      if (!PDFParse) throw slidesApiError;
      const parser = new PDFParse({ data: pdfBuffer, verbosity: 0 });
      const extraction = await parser.getText();
      mustDos = extractGoogleSlidesMustDosFromPdfText(extraction?.text || "");
      extractionSource = "drive-pdf-export";
    }
    res.json({
      ok: true,
      presentationId,
      fileName: String(file?.name || "Digital Outcome Description").trim(),
      fileUrl: String(file?.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`).trim(),
      mustDos,
      extractionSource,
      modifiedTime: String(file?.modifiedTime || "").trim(),
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not read the Digital Outcome Description slideshow." });
  }
});

app.post("/api/student/drive-setup/read-relevant-implications", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationId = String(req.body?.presentationId || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(presentationId)) { res.status(400).json({ error: "A valid Google Slides presentation ID is required." }); return; }

  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(presentationId)}`, {
      accessToken: driveAccessToken,
      queryParams: { fields: "id,name,modifiedTime,webViewLink" }
    });
    let implications = [];
    let extractionSource = "slides-api";
    try {
      const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
      implications = extractGoogleSlidesRelevantImplications(presentation);
    } catch (slidesApiError) {
      const pdfBuffer = await driveDownloadExportedFile(presentationId, "application/pdf", driveAccessToken);
      if (!PDFParse) throw slidesApiError;
      const parser = new PDFParse({ data: pdfBuffer, verbosity: 0 });
      const extraction = await parser.getText();
      implications = extractGoogleSlidesRelevantImplicationsFromPdfText(extraction?.text || "");
      extractionSource = "drive-pdf-export";
    }
    res.json({
      ok: true,
      presentationId,
      fileName: String(file?.name || "Relevant Implications").trim(),
      fileUrl: String(file?.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`).trim(),
      implications,
      extractionSource,
      modifiedTime: String(file?.modifiedTime || "").trim(),
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not read the Relevant Implications slideshow." });
  }
});

app.post("/api/student/drive-setup/read-relevant-conventions", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationId = String(req.body?.presentationId || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(presentationId)) { res.status(400).json({ error: "A valid Google Slides presentation ID is required." }); return; }

  try {
    const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
    const areas = extractGoogleSlidesConventionAreas(presentation);
    res.json({ ok: true, presentationId, areas, syncedAt: new Date().toISOString() });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not read the Relevant DigiMed Conventions slideshow." });
  }
});

app.post("/api/student/drive-setup/read-development-components", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationId = String(req.body?.presentationId || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(presentationId)) { res.status(400).json({ error: "A valid Google Slides presentation ID is required." }); return; }

  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(presentationId)}`, {
      accessToken: driveAccessToken,
      queryParams: { fields: "id,name,modifiedTime,webViewLink" }
    });
    let components = [];
    let developmentRows = [];
    let extractionSource = "slides-api";
    try {
      const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
      const rows = extractGoogleSlidesDevelopmentRows(presentation);
      components = rows.map((row) => row.component);
      developmentRows = rows;
    } catch (slidesApiError) {
      const pdfBuffer = await driveDownloadExportedFile(presentationId, "application/pdf", driveAccessToken);
      if (!PDFParse) throw slidesApiError;
      const parser = new PDFParse({ data: pdfBuffer, verbosity: 0 });
      const extraction = await parser.getText();
      components = extractGoogleSlidesDevelopmentComponentsFromPdfText(extraction?.text || "");
      developmentRows = components.map((component) => ({ mustDo: "", component }));
      extractionSource = "drive-pdf-export";
    }
    res.json({
      ok: true,
      presentationId,
      fileName: String(file?.name || "Development Steps").trim(),
      fileUrl: String(file?.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`).trim(),
      components,
      rows: developmentRows || [],
      extractionSource,
      modifiedTime: String(file?.modifiedTime || "").trim(),
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not read the Development Steps slideshow." });
  }
});

app.post("/api/student/drive-setup/read-trialling-components", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationId = String(req.body?.presentationId || "").trim();
  const activityId = String(req.body?.activityId || req.body?.activity_id || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(presentationId)) { res.status(400).json({ error: "A valid Google Slides presentation ID is required." }); return; }

  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(presentationId)}`, {
      accessToken: driveAccessToken,
      queryParams: { fields: "id,name,modifiedTime,webViewLink" }
    });
    const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
    const rows = extractGoogleSlidesDevelopmentRows(presentation)
      .filter((row) => String(row?.component || "").trim());
    const components = rows.map((row) => String(row.component || "").trim());
    const saved = activityId
      ? await saveTriallingComponents(email, activityId, presentationId, components, file?.modifiedTime)
      : null;
    res.json({
      ok: true,
      presentationId,
      fileName: String(file?.name || "Trialling Components").trim(),
      fileUrl: String(file?.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`).trim(),
      components,
      rows,
      modifiedTime: String(file?.modifiedTime || "").trim(),
      syncedAt: new Date().toISOString(),
      ...(saved ? { component_count: saved.component_count } : {})
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not read the Trialling Components slideshow." });
  }
});

app.post("/api/student/drive-setup/read-testing-functions", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  const presentationId = String(req.body?.presentationId || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "driveAccessToken is required." }); return; }
  if (!/^[A-Za-z0-9_-]{10,}$/.test(presentationId)) { res.status(400).json({ error: "A valid Google Slides presentation ID is required." }); return; }

  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(presentationId)}`, {
      accessToken: driveAccessToken,
      queryParams: { fields: "id,name,modifiedTime,webViewLink" }
    });
    let lists = { functionalTesting: [], userTesting: [] };
    let extractionSource = "slides-api";
    try {
      const presentation = await googleSlidesApiRequest(presentationId, driveAccessToken);
      lists = extractGoogleSlidesTestingFunctionLists(presentation);
    } catch (slidesApiError) {
      const pdfBuffer = await driveDownloadExportedFile(presentationId, "application/pdf", driveAccessToken);
      if (!PDFParse) throw slidesApiError;
      const parser = new PDFParse({ data: pdfBuffer, verbosity: 0 });
      const extraction = await parser.getText();
      lists = extractGoogleSlidesTestingFunctionListsFromPdfText(extraction?.text || "");
      extractionSource = "drive-pdf-export";
    }
    res.json({
      ok: true,
      presentationId,
      fileName: String(file?.name || "Testing Functions").trim(),
      fileUrl: String(file?.webViewLink || `https://docs.google.com/presentation/d/${presentationId}/edit`).trim(),
      functionalTesting: lists.functionalTesting,
      userTesting: lists.userTesting,
      extractionSource,
      modifiedTime: String(file?.modifiedTime || "").trim(),
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not read the Testing Functions slideshow." });
  }
});

app.get("/api/students/trialling-components", async (req, res) => {
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  if (!requesterEmail) { res.status(401).json({ error: "Sign in is required." }); return; }

  const activityId = String(req.query?.activity_id || req.query?.activityId || "").trim();
  if (!activityId) { res.status(400).json({ error: "activity_id is required." }); return; }

  try {
    const row = await getTriallingComponents(requesterEmail, activityId);
    res.json(buildTriallingComponentsPayload(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Trialling Components data." });
  }
});

app.get("/api/students/digimed-efficient-tools", async (req, res) => {
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  if (!requesterEmail) { res.status(401).json({ error: "Sign in is required." }); return; }

  const activityId = String(req.query?.activity_id || req.query?.activityId || "").trim();
  if (!activityId) { res.status(400).json({ error: "activity_id is required." }); return; }

  // Students read their own record; teachers/admins may read a specific student's (read-only).
  const requestedEmail = normalizeEmail(req.query?.student_email || req.query?.studentEmail || "") || requesterEmail;
  if (requestedEmail !== requesterEmail) {
    const access = await resolveActivityWriteAccess(requesterEmail);
    if (!access.allowed) { res.status(403).json({ error: "You can only view your own tools and techniques." }); return; }
  }

  try {
    const row = await getDigiMedEfficientTools(requestedEmail, activityId);
    res.json(buildDigiMedEfficientToolsPayload(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load efficient tools and techniques." });
  }
});

app.post("/api/students/digimed-efficient-tools", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email) { res.status(401).json({ error: "Sign in is required." }); return; }

  const activityId = String(req.body?.activity_id || req.body?.activityId || "").trim();
  if (!activityId) { res.status(400).json({ error: "activity_id is required." }); return; }

  try {
    const row = await saveDigiMedEfficientTools(email, activityId, req.body?.tools);
    res.json(buildDigiMedEfficientToolsPayload(row));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save efficient tools and techniques." });
  }
});

async function resolveActivityWriteAccess(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { allowed: false, email: "", reason: "missing_email" };
  }

  try {
    const allowed = await canManagePracticalSchedule(normalizedEmail);
    return {
      allowed: Boolean(allowed),
      email: normalizedEmail,
      reason: allowed ? "allowed" : "forbidden"
    };
  } catch (_error) {
    return { allowed: false, email: normalizedEmail, reason: "lookup_failed" };
  }
}

async function requireActivityWriteAccess(req, res, next) {
  const email = getRequestUserEmail(req);
  if (!email) {
    const authError = req?.auth_identity?.error || "";
    const strictMessage = effectiveAuthMode === "strict"
      ? "Google ID token is required. Send Authorization: Bearer <id_token>."
      : "User email is required";
    const hybridMessage = authError
      ? "Google token verification failed. Please sign in again and retry."
      : strictMessage;
    res.status(401).json({ error: hybridMessage, auth_mode: effectiveAuthMode, auth_error: authError || undefined });
    return;
  }

  const access = await resolveActivityWriteAccess(email);
  if (!access.allowed) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  req.user_email = access.email;
  req.user_auth_source = req?.auth_identity?.verified ? "google_id_token" : "legacy_header";
  next();
}

function requireSchoolAccountAccess(req, res, next) {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  req.user_email = email;
  next();
}

async function requireTrelloBoardReadAccess(req, res, next) {
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const studentEmail = normalizeEmail(req.query?.student_email || req.query?.studentEmail || "");

  if (!requesterEmail) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  if (!isSchoolEmail(studentEmail)) {
    res.status(400).json({ error: "A valid student email is required" });
    return;
  }

  if (requesterEmail === studentEmail) {
    req.user_email = requesterEmail;
    next();
    return;
  }

  const access = await resolveActivityWriteAccess(requesterEmail);
  if (!access.allowed) {
    res.status(403).json({ error: "You can only view your own Trello board." });
    return;
  }

  req.user_email = access.email;
  next();
}

async function requireAdminAccess(req, res, next) {
  if (!req.dtechAccess?.admin) return res.status(403).json({ error: "DTECH administrator access is required." });
  req.user_email = getRequestUserEmail(req);
  return next();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    auth_mode: effectiveAuthMode,
    google_id_token_audiences_configured: GOOGLE_ID_TOKEN_AUDIENCES.length
  });
});

app.get("/api/activities", async (_req, res) => {
  if (!hasDatabase) {
    const rows = filterDtechActivities(Array.from(memoryActivities.values())).sort((left, right) => {
      return new Date(right.created_at) - new Date(left.created_at);
    });
    res.json(rows);
    return;
  }

  try {
    const result = await pool.query(
      `
        SELECT a.*
        FROM activities a
        LEFT JOIN activity_hub_visibility v
          ON v.activity_id = a.id::text
         AND v.hub_name = $1
        WHERE COALESCE(v.is_visible, TRUE) = TRUE
        ORDER BY a.created_at DESC
      `,
      [DTECH_HUB_NAME]
    );
    res.json(filterDtechActivities(result.rows));
  } catch (error) {
    res.status(500).json({ error: "Could not load activities" });
  }
});

app.get("/api/activities/:id", async (req, res) => {
  if (!hasDatabase) {
    const found = memoryActivities.get(req.params.id);
    if (!found || isExcludedNonDtechActivity(found)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(normalizeActivityCategoryForResponse(found));
    return;
  }

  try {
    const result = await pool.query(
      `
        SELECT a.*
        FROM activities a
        LEFT JOIN activity_hub_visibility v
          ON v.activity_id = a.id::text
         AND v.hub_name = $1
        WHERE a.id = $2
          AND COALESCE(v.is_visible, TRUE) = TRUE
        LIMIT 1
      `,
      [DTECH_HUB_NAME, req.params.id]
    );
    if (!result.rows.length || isExcludedNonDtechActivity(result.rows[0])) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json(normalizeActivityCategoryForResponse(result.rows[0]));
  } catch (error) {
    res.status(500).json({ error: "Could not load activity" });
  }
});

app.post("/api/activities", requireActivityWriteAccess, async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const yearLevel = String(body.year_level || "").trim();
  const type = String(body.type || "").trim();
  const durationMinutesInput = Number.parseInt(
    body.duration_minutes ?? body.durationMinutes ?? body.duration_hours,
    10
  );

  if (!name || !yearLevel || !type) {
    res.status(400).send("name, year_level, and type are required");
    return;
  }

  const id = String(body.id || slugify(name));
  const requestedActivityCategory = String(body.activity_category || body.activityCategory || "").trim();
  const explicitCardColor = String(body.card_color || body.cardColor || "").trim();
  const isExplicitActivityRequest = isExplicitActivityCategoryLabel(requestedActivityCategory);
  const isExplicitNonAssessmentCategoryRequest = [
    "project",
    "activity",
    "practice",
    "practice activity",
    "skill activity",
    "lesson"
  ].includes(String(requestedActivityCategory || "").trim().toLowerCase());
  const hasAssessmentPayload = hasAssessmentSignals(body) || hasAssessmentPayloadShape(body);
  const hasProjectPayload = hasProjectPayloadShape(body);
  const resolvedRequestedCategory = (() => {
    const normalizedRequested = requestedActivityCategory.toLowerCase();
    if (normalizedRequested === "assessment" || normalizedRequested === "assessment activity") {
      return "Assessment Task";
    }
    if (normalizedRequested === "" && hasAssessmentPayload) {
      return "Assessment Task";
    }
    if (normalizedRequested === "" && hasProjectPayload) {
      return "Project";
    }
    return requestedActivityCategory || "Activity";
  })();

  const payload = {
    id,
    name,
    year_level: yearLevel,
    type,
    activity_category: resolvedRequestedCategory,
    duration_minutes: Number.isInteger(durationMinutesInput) && durationMinutesInput > 0 ? durationMinutesInput : 1,
    difficulty: String(body.difficulty || "Beginner").trim() || "Beginner",
    subject_stream: String(body.subject_stream || body.subject || "").trim().toUpperCase(),
    card_color: explicitCardColor || getDefaultCardColorForCategory(resolvedRequestedCategory || requestedActivityCategory),
    card_url: String(body.card_url || "").trim(),
    outcome_image_url: String(body.outcome_image_url || "").trim(),
    description: String(body.description || "").trim(),
    resources: normalizeArray(body.resources),
    equipment: normalizeArray(body.equipment),
    instructions: normalizeArray(body.instructions),
    class_management_notes: normalizeArray(body.class_management_notes),
    class_preparation: normalizeArray(body.class_preparation),
    assessment_focus: normalizeArray(body.assessment_focus ?? body.tasks_list),
    time_sensitive: Boolean(body.time_sensitive ?? body.timeSensitive),
    show_in_this_week: Boolean(body.show_in_this_week),
    term: String(body.term || "Term 2").trim() || "Term 2",
    created_at: String(body.created_at || new Date().toISOString()),
    updated_at: new Date().toISOString(),
    
    // Proposal fields
    start_date: String(body.start_date || "").trim(),
    contact_name: String(body.contact_name || "").trim(),
    contact_phone: String(body.contact_phone || "").trim(),
    contact_email: String(body.contact_email || "").trim(),
    company: String(body.company || "").trim(),
    address: String(body.address || "").trim(),
    overview: normalizeArray(body.overview),
    services: normalizeArray(body.services),
    costs: normalizeArray(body.costs),
    outcomes: normalizeArray(body.outcomes),
    withdrawal_date: String(body.withdrawal_date || "").trim(),
    client_id: String(body.client_id || "").trim(),
    standard_details: normalizeArray(body.standard_details),
    tasks_list: normalizeArray(body.tasks_list),
    achieved: normalizeArray(body.achieved),
    merit: normalizeArray(body.merit),
    excellence: normalizeArray(body.excellence),
    submission_requirements: normalizeArray(body.submission_requirements),
    relevant_implications: normalizeArray(body.relevant_implications),
    progress_logging: normalizeArray(body.progress_logging),
    feedback_trialling: normalizeArray(body.feedback_trialling)
  };

  if (isExcludedNonDtechActivity(payload)) {
    res.status(400).send("This app only accepts DTECH activities/projects. Sewing Hub content is blocked.");
    return;
  }

  if (!hasDatabase) {
    memoryActivities.set(payload.id, payload);
    res.status(201).json(payload);
    return;
  }

  try {
    const activityColumns = await getAllTableColumns("activities");
    const activityColumnMetadata = await getTableColumnMetadata("activities");
    const idColumn = pickExistingColumn(activityColumns, ["id"]);
    const nameColumn = pickExistingColumn(activityColumns, ["name", "activity_name", "title"]);
    const yearLevelColumn = pickExistingColumn(activityColumns, ["year_level", "year", "yeargroup"]);
    const typeColumn = pickExistingColumn(activityColumns, ["type", "activity_type"]);

    if (!idColumn || !nameColumn || !yearLevelColumn || !typeColumn) {
      res.status(500).send("Could not save activity: activities table is missing one or more required columns (id, name, year_level, type).");
      return;
    }

    const activityCategoryColumn = pickExistingColumn(activityColumns, ["activity_category", "category"]);
    const durationMinutesColumn = pickExistingColumn(activityColumns, ["duration_minutes"]);
    const durationHoursColumn = pickExistingColumn(activityColumns, ["duration_hours"]);
    const durationColumn = pickExistingColumn(activityColumns, ["duration"]);
    const difficultyColumn = pickExistingColumn(activityColumns, ["difficulty", "level"]);
    const subjectStreamColumn = pickExistingColumn(activityColumns, ["subject_stream", "subject", "teaching_subject", "stream"]);
    const cardColorColumn = pickExistingColumn(activityColumns, ["card_color", "card_colour", "color"]);
    const cardUrlColumn = pickExistingColumn(activityColumns, ["card_url", "activity_url", "url"]);
    const outcomeImageColumn = pickExistingColumn(activityColumns, ["outcome_image_url", "image_url", "thumbnail_url"]);
    const descriptionColumn = pickExistingColumn(activityColumns, ["description", "summary"]);
    const unitPlanIdColumn = pickExistingColumn(activityColumns, ["unit_plan_id", "unit_plan"]);
    const unitLessonIndexColumn = pickExistingColumn(activityColumns, ["unit_lesson_index", "lesson_index"]);
    const resourcesColumn = pickExistingColumn(activityColumns, ["resources"]);
    const equipmentColumn = pickExistingColumn(activityColumns, ["equipment"]);
    const instructionsColumn = pickExistingColumn(activityColumns, ["instructions", "steps"]);
    const classManagementColumn = pickExistingColumn(activityColumns, ["class_management_notes"]);
    const classPreparationColumn = pickExistingColumn(activityColumns, ["class_preparation"]);
    const assessmentFocusColumn = pickExistingColumn(activityColumns, ["assessment_focus"]);
    const timeSensitiveColumn = pickExistingColumn(activityColumns, ["time_sensitive"]);
    const showInWeekColumn = pickExistingColumn(activityColumns, ["show_in_this_week", "show_this_week", "is_pinned", "is_this_week"]);
    const termColumn = pickExistingColumn(activityColumns, ["term"]);
    const updatedAtColumn = pickExistingColumn(activityColumns, ["updated_at", "updatedon", "last_updated"]);
    
    // Proposal fields
    const startDateColumn = pickExistingColumn(activityColumns, ["start_date"]);
    const contactNameColumn = pickExistingColumn(activityColumns, ["contact_name"]);
    const contactPhoneColumn = pickExistingColumn(activityColumns, ["contact_phone"]);
    const contactEmailColumn = pickExistingColumn(activityColumns, ["contact_email"]);
    const companyColumn = pickExistingColumn(activityColumns, ["company"]);
    const addressColumn = pickExistingColumn(activityColumns, ["address"]);
    const overviewColumn = pickExistingColumn(activityColumns, ["overview"]);
    const servicesColumn = pickExistingColumn(activityColumns, ["services"]);
    const costsColumn = pickExistingColumn(activityColumns, ["costs"]);
    const outcomesColumn = pickExistingColumn(activityColumns, ["outcomes"]);
    const withdrawalDateColumn = pickExistingColumn(activityColumns, ["withdrawal_date"]);
    const clientIdColumn = pickExistingColumn(activityColumns, ["client_id"]);
    const standardDetailsColumn = pickExistingColumn(activityColumns, ["standard_details"]);
    const tasksListColumn = pickExistingColumn(activityColumns, ["tasks_list"]);
    const achievedColumn = pickExistingColumn(activityColumns, ["achieved"]);
    const meritColumn = pickExistingColumn(activityColumns, ["merit"]);
    const excellenceColumn = pickExistingColumn(activityColumns, ["excellence"]);
    const submissionRequirementsColumn = pickExistingColumn(activityColumns, ["submission_requirements"]);
    const relevantImplicationsColumn = pickExistingColumn(activityColumns, ["relevant_implications"]);
    const progressLoggingColumn = pickExistingColumn(activityColumns, ["progress_logging"]);
    const feedbackTriallingColumn = pickExistingColumn(activityColumns, ["feedback_trialling"]);

    const categoryRequestsAssessment = ["assessment", "assessment activity", "assessment task"].includes(String(payload.activity_category || "").toLowerCase());
    const shouldPreferAssessmentResolution = categoryRequestsAssessment || (!requestedActivityCategory && hasAssessmentPayload);

    let resolvedActivityCategory = activityCategoryColumn
      ? await resolveActivityCategoryForInsert(payload.activity_category, payload.type, {
          preferAssessment: shouldPreferAssessmentResolution
        })
      : payload.activity_category;

    if (hasAssessmentPayload && !isAssessmentCategoryLabel(resolvedActivityCategory) && !isExplicitNonAssessmentCategoryRequest) {
      console.warn(
        `[assessment-category-guard] Non-assessment category resolved for assessment payload id=${payload.id} name="${payload.name}" category="${resolvedActivityCategory}"`
      );

      if (activityCategoryColumn) {
        const forcedAssessmentCategory = await resolveActivityCategoryForInsert("Assessment Task", payload.type, {
          preferAssessment: true
        });
        if (isAssessmentCategoryLabel(forcedAssessmentCategory)) {
          resolvedActivityCategory = forcedAssessmentCategory;
        }
      }
    }

    if (!explicitCardColor) {
      payload.card_color = getDefaultCardColorForCategory(resolvedActivityCategory || payload.activity_category);
    }

    const idMetadata = idColumn ? activityColumnMetadata.get(String(idColumn).toLowerCase()) : null;
    const { canUseExplicitId, idValueToSave } = await resolveActivityIdForInsert(
      idColumn,
      idMetadata,
      body.id,
      payload.id
    );

    const sqlColumns = [
      { name: nameColumn, value: payload.name },
      { name: yearLevelColumn, value: payload.year_level },
      { name: typeColumn, value: payload.type }
    ];

    const pushArrayField = (columnName, values) => {
      if (!columnName) {
        return;
      }

      const columnMeta = activityColumnMetadata.get(String(columnName).toLowerCase());
      const arrayValues = Array.isArray(values)
        ? values.map((item) => String(item || "").trim()).filter(Boolean)
        : [];

      if (isJsonLikeColumn(columnMeta)) {
        const cast = String(columnMeta?.dataType || "").toLowerCase() === "json" ? "json" : "jsonb";
        sqlColumns.push({ name: columnName, value: JSON.stringify(arrayValues), cast });
        return;
      }

      sqlColumns.push({ name: columnName, value: arrayValues.join("\n") });
    };

    if (canUseExplicitId) {
      sqlColumns.unshift({ name: idColumn, value: idValueToSave });
    }

    if (activityCategoryColumn) sqlColumns.push({ name: activityCategoryColumn, value: resolvedActivityCategory });
    if (durationMinutesColumn) {
      sqlColumns.push({ name: durationMinutesColumn, value: payload.duration_minutes });
    }
    if (durationHoursColumn) {
      sqlColumns.push({ name: durationHoursColumn, value: payload.duration_minutes / 60 });
    }
    if (durationColumn) {
      sqlColumns.push({ name: durationColumn, value: payload.duration_minutes });
    }
    if (difficultyColumn) sqlColumns.push({ name: difficultyColumn, value: payload.difficulty });
    if (subjectStreamColumn) sqlColumns.push({ name: subjectStreamColumn, value: payload.subject_stream });
    if (cardColorColumn) sqlColumns.push({ name: cardColorColumn, value: payload.card_color });
    if (cardUrlColumn) sqlColumns.push({ name: cardUrlColumn, value: payload.card_url });
    if (outcomeImageColumn) sqlColumns.push({ name: outcomeImageColumn, value: payload.outcome_image_url });
    if (descriptionColumn) sqlColumns.push({ name: descriptionColumn, value: payload.description });
    if (unitPlanIdColumn) sqlColumns.push({ name: unitPlanIdColumn, value: String(body.unit_plan_id || body.unitPlanId || "").trim() });
    if (unitLessonIndexColumn) sqlColumns.push({ name: unitLessonIndexColumn, value: Number.parseInt(body.unit_lesson_index ?? body.unitLessonIndex, 10) || null });
    pushArrayField(resourcesColumn, payload.resources);
    pushArrayField(equipmentColumn, payload.equipment);
    pushArrayField(instructionsColumn, payload.instructions);
    pushArrayField(classManagementColumn, payload.class_management_notes);
    pushArrayField(classPreparationColumn, payload.class_preparation);
    pushArrayField(assessmentFocusColumn, payload.assessment_focus);
    if (timeSensitiveColumn) sqlColumns.push({ name: timeSensitiveColumn, value: payload.time_sensitive });
    if (showInWeekColumn) sqlColumns.push({ name: showInWeekColumn, value: payload.show_in_this_week });
    if (termColumn) sqlColumns.push({ name: termColumn, value: payload.term });
    
    // Add proposal fields
    if (startDateColumn) sqlColumns.push({ name: startDateColumn, value: payload.start_date });
    if (contactNameColumn) sqlColumns.push({ name: contactNameColumn, value: payload.contact_name });
    if (contactPhoneColumn) sqlColumns.push({ name: contactPhoneColumn, value: payload.contact_phone });
    if (contactEmailColumn) sqlColumns.push({ name: contactEmailColumn, value: payload.contact_email });
    if (companyColumn) sqlColumns.push({ name: companyColumn, value: payload.company });
    if (addressColumn) sqlColumns.push({ name: addressColumn, value: payload.address });
    pushArrayField(overviewColumn, payload.overview);
    pushArrayField(servicesColumn, payload.services);
    pushArrayField(costsColumn, payload.costs);
    pushArrayField(outcomesColumn, payload.outcomes);
    if (withdrawalDateColumn) sqlColumns.push({ name: withdrawalDateColumn, value: payload.withdrawal_date });
    if (clientIdColumn) sqlColumns.push({ name: clientIdColumn, value: payload.client_id });
    pushArrayField(standardDetailsColumn, payload.standard_details);
    pushArrayField(tasksListColumn, payload.tasks_list);
    pushArrayField(achievedColumn, payload.achieved);
    pushArrayField(meritColumn, payload.merit);
    pushArrayField(excellenceColumn, payload.excellence);
    pushArrayField(submissionRequirementsColumn, payload.submission_requirements);
    pushArrayField(relevantImplicationsColumn, payload.relevant_implications);
    pushArrayField(progressLoggingColumn, payload.progress_logging);
    pushArrayField(feedbackTriallingColumn, payload.feedback_trialling);

    const insertColumnsSql = sqlColumns.map((column) => quoteIdentifier(column.name)).join(", ");
    const insertValuesSql = sqlColumns
      .map((column, index) => `$${index + 1}${column.cast ? `::${column.cast}` : ""}`)
      .join(", ");
    const updateAssignments = sqlColumns
      .filter((column) => column.name !== idColumn)
      .map((column) => `${quoteIdentifier(column.name)} = EXCLUDED.${quoteIdentifier(column.name)}`);

    if (updatedAtColumn) {
      updateAssignments.push(`${quoteIdentifier(updatedAtColumn)} = NOW()`);
    }

    const updateSql = updateAssignments.length
      ? updateAssignments.join(",\n              ")
      : `${quoteIdentifier(nameColumn)} = EXCLUDED.${quoteIdentifier(nameColumn)}`;

    const insertColumnsWithAudit = updatedAtColumn
      ? `${insertColumnsSql},\n          ${quoteIdentifier(updatedAtColumn)}`
      : insertColumnsSql;

    const insertValuesWithAudit = updatedAtColumn
      ? `${insertValuesSql},\n          NOW()`
      : insertValuesSql;

    const result = canUseExplicitId
      ? await pool.query(
          `
            INSERT INTO activities (
              ${insertColumnsWithAudit}
            ) VALUES (
              ${insertValuesWithAudit}
            )
            ON CONFLICT (${quoteIdentifier(idColumn)}) DO UPDATE SET
              ${updateSql},
              ${quoteIdentifier(idColumn)} = EXCLUDED.${quoteIdentifier(idColumn)}
            RETURNING *
          `,
          sqlColumns.map((column) => column.value)
        )
      : await pool.query(
          `
            INSERT INTO activities (
              ${insertColumnsWithAudit}
            ) VALUES (
              ${insertValuesWithAudit}
            )
            RETURNING *
          `,
          sqlColumns.map((column) => column.value)
        );

    await upsertHubVisibility([result.rows[0].id], DTECH_HUB_NAME, true);

    res.status(201).json(normalizeActivityCategoryForResponse(result.rows[0]));
  } catch (error) {
    console.error("Activity save error:", error);
    const detail = String(error?.message || "Could not save activity");
    res.status(500).send(`Could not save activity: ${detail}`);
  }
});

app.delete("/api/activities/:id", requireActivityWriteAccess, async (req, res) => {
  const requestedId = String(req.params.id || "").trim();
  if (!requestedId) {
    res.status(400).json({ error: "Activity ID is required" });
    return;
  }

  if (!hasDatabase) {
    const deleted = memoryActivities.delete(requestedId);
    if (!deleted) {
      res.status(404).json({ error: "Activity not found" });
      return;
    }

    res.status(200).json({ ok: true, id: requestedId });
    return;
  }

  try {
    const result = await pool.query(
      `
        DELETE FROM activities
        WHERE id::text = $1
        RETURNING id
      `,
      [requestedId]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: "Activity not found" });
      return;
    }

    try {
      await pool.query(
        `DELETE FROM activity_hub_visibility WHERE activity_id = $1`,
        [requestedId]
      );
    } catch (_visibilityError) {
    }

    res.status(200).json({ ok: true, id: String(result.rows[0].id) });
  } catch (error) {
    res.status(500).json({ error: "Could not delete activity" });
  }
});

app.delete("/api/activities", requireActivityWriteAccess, async (_req, res) => {
  if (!hasDatabase) {
    memoryActivities.clear();
    res.status(204).send();
    return;
  }

  try {
    await pool.query("DELETE FROM activities");
    res.status(204).send();
  } catch (error) {
    res.status(500).send("Could not clear activities");
  }
});

app.post("/api/activities/:id/upload-image", requireActivityWriteAccess, async (req, res) => {
  const activityId = String(req.params.id || "").trim();
  const body = req.body || {};
  const imageData = String(body.image_data || "").trim();

  if (!activityId) {
    res.status(400).json({ error: "Activity ID is required" });
    return;
  }

  if (!imageData || !imageData.startsWith("data:image/")) {
    res.status(400).json({ error: "Invalid image data" });
    return;
  }

  try {
    const matches = imageData.match(/^data:image\/([a-z]+);base64,(.+)$/i);
    if (!matches) {
      res.status(400).json({ error: "Invalid base64 image format" });
      return;
    }

    // Persist as a data URL so hosted deploys do not lose files on restart/redeploy.
    res.status(200).json({ image_url: imageData });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// POST /api/activities/:id/interest — toggle a student's interest in a project
app.post("/api/activities/:id/interest", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const email = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ interested: true, count: 1 });
    return;
  }

  try {
    const existing = await pool.query(
      "SELECT 1 FROM project_interests WHERE project_id = $1 AND student_email = $2",
      [projectId, email]
    );

    let interested;
    if (existing.rows.length) {
      await pool.query(
        "DELETE FROM project_interests WHERE project_id = $1 AND student_email = $2",
        [projectId, email]
      );
      interested = false;
    } else {
      await pool.query(
        "INSERT INTO project_interests (project_id, student_email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [projectId, email]
      );
      interested = true;

      // Keep Process Assessment in sync when a student self-registers interest.
      const clientProjectsTaskId = String(CLIENT_PROJECTS_TASK_ID || "").trim();
      if (clientProjectsTaskId && clientProjectsTaskId !== projectId) {
        try {
          const activityRow = await pool.query(
            "SELECT activity_category, to_jsonb(activities)->>'category' AS legacy_category FROM activities WHERE id = $1 LIMIT 1",
            [projectId]
          );
          const rawCat = String(activityRow.rows?.[0]?.activity_category || activityRow.rows?.[0]?.legacy_category || "")
            .toLowerCase()
            .trim();
          const isAssessmentCategory = rawCat.includes("assessment");
          const isProjectCategory = rawCat.includes("project") || !rawCat;
          if (isAssessmentCategory || isProjectCategory) {
            await pool.query(
              "INSERT INTO project_interests (project_id, student_email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
              [clientProjectsTaskId, email]
            );
          }
        } catch (_autoAllocErr) {
          // Non-fatal: do not block the main interest toggle path.
          console.error("[interest-auto-alloc] Could not allocate to Client Projects task:", _autoAllocErr.message);
        }
      }
    }

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM project_interests WHERE project_id = $1",
      [projectId]
    );
    res.json({ interested, count: countResult.rows[0].count });
  } catch (error) {
    console.error("Interest toggle error:", error);
    res.status(500).json({ error: "Could not update interest" });
  }
});

// POST /api/activities/:id/interests — teacher assigns a student to this task/project
app.post("/api/activities/:id/interests", requireActivityWriteAccess, async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const rawStudentEmail = String(req.body?.student_email || req.body?.studentEmail || "").trim();
  const studentEmail = normalizeEmail(rawStudentEmail);

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(400).json({ error: `Student email must end with @${SCHOOL_EMAIL_DOMAIN}` });
    return;
  }

  if (!hasDatabase) {
    res.status(201).json({ ok: true, student_email: studentEmail });
    return;
  }

  try {
    await pool.query(
      "INSERT INTO project_interests (project_id, student_email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [projectId, studentEmail]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM project_interests WHERE project_id = $1",
      [projectId]
    );

    // Auto-allocate to Process Assessment when assigning any activity.
    const clientProjectsTaskId = String(CLIENT_PROJECTS_TASK_ID || "").trim();
    if (clientProjectsTaskId && clientProjectsTaskId !== projectId) {
      try {
        const activityRow = await pool.query(
          "SELECT activity_category, to_jsonb(activities)->>'category' AS legacy_category FROM activities WHERE id = $1 LIMIT 1",
          [projectId]
        );
        const rawCat = String(activityRow.rows?.[0]?.activity_category || activityRow.rows?.[0]?.legacy_category || "")
          .toLowerCase()
          .trim();
        const isAssessmentCategory = rawCat.includes("assessment");
        const isProjectCategory = rawCat.includes("project") || !rawCat;
        if (isAssessmentCategory || isProjectCategory) {
          await pool.query(
            "INSERT INTO project_interests (project_id, student_email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [clientProjectsTaskId, studentEmail]
          );
        }
      } catch (_autoAllocErr) {
        // Non-fatal: log but do not block the main response
        console.error("[auto-alloc] Could not allocate to Client Projects task:", _autoAllocErr.message);
      }
    }

    res.status(201).json({
      ok: true,
      student_email: studentEmail,
      count: Number(countResult.rows?.[0]?.count || 0)
    });
  } catch (error) {
    res.status(500).json({ error: "Could not add student interest" });
  }
});

// GET /api/activities/:id/interests — get interest count/list for a project
app.get("/api/activities/:id/interests", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const email = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ count: 0, my_interest: false, emails: [], confirmed: [] });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT student_email, confirmed, standard_1, standard_2, digital_media_type, evidence_steps, template_copies FROM project_interests WHERE project_id = $1 ORDER BY created_at ASC",
      [projectId]
    );

    await ensureDigiMedEfficientToolsSchema();
    const efficientToolsByEmail = new Map();
    if (result.rows.length) {
      const efficientToolsResult = await pool.query(
        `SELECT student_email, tools FROM student_digimed_efficient_tools WHERE activity_id = $1 AND student_email = ANY($2::text[])`,
        [projectId, result.rows.map((row) => normalizeEmail(row?.student_email || "")).filter(Boolean)]
      );
      for (const efficientToolsRow of efficientToolsResult.rows || []) {
        efficientToolsByEmail.set(normalizeEmail(efficientToolsRow?.student_email || ""), normalizeDigiMedEfficientTools(efficientToolsRow?.tools));
      }
    }

    const studentEmailsForSetup = result.rows
      .map((row) => normalizeEmail(row?.student_email || ""))
      .filter(Boolean);
    const driveSetupByEmail = new Map();
    if (studentEmailsForSetup.length) {
      await ensureStudentDriveSetupSchema();
      const setupResult = await pool.query(
        `SELECT student_email, process_assessment_folder_id FROM student_drive_setup WHERE student_email = ANY($1::text[])`,
        [studentEmailsForSetup]
      );
      for (const setupRow of setupResult.rows || []) {
        const setupEmail = normalizeEmail(setupRow?.student_email || "");
        const folderUrl = buildDriveFolderUrlFromId(setupRow?.process_assessment_folder_id || "");
        if (setupEmail && folderUrl) {
          driveSetupByEmail.set(setupEmail, folderUrl);
        }
      }
    }

    let isTeacher = false;
    if (email) {
      try {
        const access = await resolveActivityWriteAccess(email);
        isTeacher = Boolean(access.allowed);
      } catch (_err) {}
    }

    await Promise.all(result.rows.map(async (row) => {
      const studentEmail = normalizeEmail(row?.student_email || "");
      if (!isTeacher && studentEmail !== email) return;
      const folderUrl = driveSetupByEmail.get(studentEmail) || "";
      if (!studentEmail || !folderUrl) return;
      const repair = ensureGoogleDriveFolderEvidence(row.evidence_steps, row.standard_1, folderUrl);
      if (!repair.changed) {
        row.evidence_steps = repair.rows;
        return;
      }
      row.evidence_steps = repair.rows;
      await pool.query(
        `UPDATE project_interests SET evidence_steps = $1::jsonb, updated_at = NOW() WHERE project_id = $2 AND student_email = $3`,
        [JSON.stringify(repair.rows), projectId, studentEmail]
      );
    }));

    const sourceProjectsByEmail = new Map();
    const isClientProjectsTask = String(projectId) === String(CLIENT_PROJECTS_TASK_ID);
    if (isTeacher && isClientProjectsTask && result.rows.length) {
      const studentEmails = result.rows
        .map((row) => normalizeEmail(row?.student_email || ""))
        .filter(Boolean);

      if (studentEmails.length) {
        const sourceResult = await pool.query(
          `
            SELECT pi.student_email, a.name AS project_name
            FROM project_interests pi
            JOIN activities a ON a.id::text = pi.project_id::text
            WHERE pi.student_email = ANY($1::text[])
              AND pi.project_id::text <> $2
              AND LOWER(TRIM(COALESCE(a.activity_category, to_jsonb(a)->>'category', ''))) NOT LIKE '%assessment%'
            ORDER BY a.name ASC
          `,
          [studentEmails, projectId]
        );

        for (const row of sourceResult.rows || []) {
          const student = normalizeEmail(row?.student_email || "");
          const projectName = String(row?.project_name || "").trim();
          if (!student || !projectName) {
            continue;
          }
          const existing = sourceProjectsByEmail.get(student) || [];
          if (!existing.includes(projectName)) {
            existing.push(projectName);
          }
          sourceProjectsByEmail.set(student, existing);
        }
      }
    }

    const myAllocationRow = email ? result.rows.find((r) => r.student_email === email) : null;
    const myInterest = Boolean(myAllocationRow);
    res.json({
      count: result.rows.length,
      my_interest: myInterest,
      my_allocation: myAllocationRow
        ? {
          email,
          confirmed: Boolean(myAllocationRow.confirmed),
          standard_1: String(myAllocationRow.standard_1 || "").trim(),
          standard_2: String(myAllocationRow.standard_2 || "").trim(),
          digital_media_type: String(myAllocationRow.digital_media_type || "").trim(),
          evidence_steps: normalizeEvidenceStepsPayload(myAllocationRow.evidence_steps),
          template_copies: Array.isArray(myAllocationRow.template_copies) ? myAllocationRow.template_copies : [],
          efficient_tools: efficientToolsByEmail.get(normalizeEmail(myAllocationRow.student_email || email)) || [],
          process_assessment_folder_url: driveSetupByEmail.get(normalizeEmail(myAllocationRow.student_email || email)) || ""
        }
        : null,
      emails: isTeacher ? result.rows.map((r) => r.student_email) : [],
      confirmed: isTeacher ? result.rows.filter((r) => r.confirmed).map((r) => r.student_email) : [],
      students: isTeacher
        ? result.rows.map((r) => ({
          email: r.student_email,
          confirmed: Boolean(r.confirmed),
          standard_1: String(r.standard_1 || "").trim(),
          standard_2: String(r.standard_2 || "").trim(),
          digital_media_type: String(r.digital_media_type || "").trim(),
          evidence_steps: normalizeEvidenceStepsPayload(r.evidence_steps),
          template_copies: Array.isArray(r.template_copies) ? r.template_copies : [],
          efficient_tools: efficientToolsByEmail.get(normalizeEmail(r.student_email || "")) || [],
          process_assessment_folder_url: driveSetupByEmail.get(normalizeEmail(r.student_email || "")) || "",
          source_projects: sourceProjectsByEmail.get(normalizeEmail(r.student_email || "")) || []
        }))
        : []
    });
  } catch (error) {
    res.status(500).json({ error: "Could not load interests" });
  }
});

// PATCH /api/activities/:id/interests/:studentEmail/confirm — teacher confirm/unconfirm allocation
app.patch("/api/activities/:id/interests/:studentEmail/confirm", requireActivityWriteAccess, async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const confirmed = req.body?.confirmed !== false;
  const teacherEmail = normalizeEmail(req.user_email || getRequestUserEmail(req));

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ confirmed, email_notification: "skipped_no_database" });
    return;
  }

  try {
    const currentRowResult = await pool.query(
      "SELECT confirmed FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
      [projectId, studentEmail]
    );

    if (!currentRowResult.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    const previousConfirmed = Boolean(currentRowResult.rows[0]?.confirmed);

    await pool.query(
      "UPDATE project_interests SET confirmed = $1 WHERE project_id = $2 AND student_email = $3",
      [confirmed, projectId, studentEmail]
    );

    if (confirmed && String(projectId) !== String(CLIENT_PROJECTS_TASK_ID)) {
      await syncProcessAssessmentAllocation(studentEmail);
    }

    let emailNotification = "not_sent";
    if (confirmed && !previousConfirmed) {
      try {
        const activityResult = await pool.query(
          "SELECT name, activity_category, category FROM activities WHERE id::text = $1 LIMIT 1",
          [projectId]
        );
        const activityRow = activityResult.rows?.[0] || {};
        const rawCategory = String(activityRow.activity_category || activityRow.category || "Project").toLowerCase();
        const activityCategory = rawCategory.includes("assessment") ? "Assessment Task" : "Project";

        const emailResult = await notifyAllocationApprovedByEmail({
          studentEmail,
          teacherEmail,
          activityName: String(activityRow.name || projectId),
          activityCategory
        });

        emailNotification = String(emailResult?.status || "not_sent");
      } catch (_emailError) {
        emailNotification = "failed";
      }
    }

    res.json({ confirmed, email_notification: emailNotification });
  } catch (error) {
    res.status(500).json({ error: "Could not update confirmation" });
  }
});

// PATCH /api/activities/:id/interests/:studentEmail/standards — teacher assigns up to 2 standards
app.patch("/api/activities/:id/interests/:studentEmail/standards", requireActivityWriteAccess, async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const standard1 = String(req.body?.standard_1 || req.body?.standard1 || "").trim();
  const standard2 = String(req.body?.standard_2 || req.body?.standard2 || "").trim();
  const digitalMediaType = String(req.body?.digital_media_type || req.body?.digitalMediaType || "").trim().slice(0, 80);

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ standard_1: standard1, standard_2: standard2, digital_media_type: digitalMediaType });
    return;
  }

  try {
    await pool.query(
      "UPDATE project_interests SET standard_1 = $1, standard_2 = $2, digital_media_type = $3 WHERE project_id = $4 AND student_email = $5",
      [standard1 || null, standard2 || null, digitalMediaType || null, projectId, studentEmail]
    );
    if (String(projectId) === String(CLIENT_PROJECTS_TASK_ID)) {
      await propagateProcessAssessmentDetails(studentEmail, standard1, standard2, digitalMediaType);
    }
    res.json({ standard_1: standard1, standard_2: standard2, digital_media_type: digitalMediaType });
  } catch (error) {
    res.status(500).json({ error: "Could not update standards" });
  }
});

app.get("/api/activities/:id/interests/:studentEmail/evidence", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  let isTeacher = false;
  try {
    const access = await resolveActivityWriteAccess(requesterEmail);
    isTeacher = Boolean(access.allowed);
  } catch (_error) {
    isTeacher = false;
  }

  if (!isTeacher && requesterEmail !== studentEmail) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!hasDatabase) {
    res.json({
      student_email: studentEmail,
      standard_1: "",
      standard_2: "",
      evidence_steps: []
    });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT standard_1, standard_2, digital_media_type, evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
      [projectId, studentEmail]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    const row = result.rows[0] || {};
    const studentDirectoryRows = await getStudentDirectoryRows();
    const directoryStudent = studentDirectoryRows
      .map((entry) => buildStudentClassManagementRow(entry))
      .find((entry) => (Array.isArray(entry?.linked_emails) ? entry.linked_emails : [])
        .map((linkedEmail) => normalizeEmail(linkedEmail))
        .includes(studentEmail));
    res.json({
      student_email: studentEmail,
      standard_1: String(row.standard_1 || "").trim(),
      standard_2: String(row.standard_2 || "").trim(),
      digital_media_type: String(row.digital_media_type || "").trim(),
      strand: Array.isArray(directoryStudent?.programs) ? directoryStudent.programs.join(", ") : "",
      evidence_steps: normalizeEvidenceStepsPayload(row.evidence_steps)
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not load evidence steps" });
  }
});

app.get("/api/activities/:id/interests/me/evidence", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  if (!hasDatabase) {
    res.json({
      student_email: requesterEmail,
      standard_1: "",
      standard_2: "",
      evidence_steps: []
    });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT standard_1, standard_2, evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
      [projectId, requesterEmail]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    const row = result.rows[0] || {};
    res.json({
      student_email: requesterEmail,
      standard_1: String(row.standard_1 || "").trim(),
      standard_2: String(row.standard_2 || "").trim(),
      evidence_steps: normalizeEvidenceStepsPayload(row.evidence_steps)
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not load evidence steps" });
  }
});

app.patch("/api/activities/:id/interests/:studentEmail/evidence", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  let isTeacher = false;
  try {
    const access = await resolveActivityWriteAccess(requesterEmail);
    isTeacher = Boolean(access.allowed);
  } catch (_error) {
    isTeacher = false;
  }

  if (!isTeacher && requesterEmail !== studentEmail) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const evidenceSteps = normalizeEvidenceStepsPayload(req.body?.evidence_steps);

  if (!hasDatabase) {
    res.json({
      student_email: studentEmail,
      evidence_steps: evidenceSteps
    });
    return;
  }

  try {
    const result = await pool.query(
      `
        UPDATE project_interests
        SET evidence_steps = $1::jsonb,
            updated_at = NOW()
        WHERE project_id = $2 AND student_email = $3
        RETURNING student_email
      `,
      [JSON.stringify(evidenceSteps), projectId, studentEmail]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    res.json({
      student_email: studentEmail,
      evidence_steps: evidenceSteps
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not save evidence steps" });
  }
});

app.patch("/api/activities/:id/interests/me/evidence", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  const evidenceSteps = normalizeEvidenceStepsPayload(req.body?.evidence_steps);

  if (!hasDatabase) {
    res.json({
      student_email: requesterEmail,
      evidence_steps: evidenceSteps
    });
    return;
  }

  try {
    const ensureRow = await pool.query(
      `
        INSERT INTO project_interests (project_id, student_email, confirmed, created_at, updated_at, evidence_steps)
        VALUES ($1, $2, FALSE, NOW(), NOW(), '[]'::jsonb)
        ON CONFLICT (project_id, student_email) DO NOTHING
        RETURNING student_email
      `,
      [projectId, requesterEmail]
    );

    const result = await pool.query(
      `
        UPDATE project_interests
        SET evidence_steps = $1::jsonb,
            updated_at = NOW()
        WHERE project_id = $2 AND student_email = $3
        RETURNING student_email
      `,
      [JSON.stringify(evidenceSteps), projectId, requesterEmail]
    );

    if (!result.rowCount && !ensureRow.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    res.json({
      student_email: requesterEmail,
      evidence_steps: evidenceSteps
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not save evidence steps" });
  }
});

app.get("/api/activities/:id/my-evidence", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ student_email: requesterEmail, evidence_steps: [] });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
      [projectId, requesterEmail]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    res.json({
      student_email: requesterEmail,
      evidence_steps: normalizeEvidenceStepsPayload(result.rows?.[0]?.evidence_steps)
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not load evidence steps" });
  }
});

app.patch("/api/activities/:id/my-evidence", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  const evidenceSteps = normalizeEvidenceStepsPayload(req.body?.evidence_steps);

  if (!hasDatabase) {
    res.json({ student_email: requesterEmail, evidence_steps: evidenceSteps });
    return;
  }

  try {
    const ensureRow = await pool.query(
      `
        INSERT INTO project_interests (project_id, student_email, confirmed, created_at, updated_at, evidence_steps)
        VALUES ($1, $2, FALSE, NOW(), NOW(), '[]'::jsonb)
        ON CONFLICT (project_id, student_email) DO NOTHING
        RETURNING student_email
      `,
      [projectId, requesterEmail]
    );

    const result = await pool.query(
      `
        UPDATE project_interests
        SET evidence_steps = $1::jsonb,
            updated_at = NOW()
        WHERE project_id = $2 AND student_email = $3
        RETURNING student_email
      `,
      [JSON.stringify(evidenceSteps), projectId, requesterEmail]
    );

    if (!result.rowCount && !ensureRow.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    res.json({ student_email: requesterEmail, evidence_steps: evidenceSteps });
  } catch (_error) {
    res.status(500).json({ error: "Could not save evidence steps" });
  }
});

// GET /api/activities/:id/my-template-copies — reliable cross-device record of which templates a student has copied
app.get("/api/activities/:id/my-template-copies", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) { res.status(400).json({ error: "Project ID is required" }); return; }
  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" }); return;
  }

  if (!hasDatabase) {
    res.json({ student_email: requesterEmail, template_copies: [] });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT template_copies FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1`,
      [projectId, requesterEmail]
    );

    const copies = Array.isArray(result.rows?.[0]?.template_copies) ? result.rows[0].template_copies : [];
    res.json({ student_email: requesterEmail, template_copies: copies });
  } catch (_error) {
    res.status(500).json({ error: "Could not load template copies" });
  }
});

app.post("/api/activities/:id/reset-template-use", async (req, res) => {
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const projectId = String(req.params.id || "").trim();
  const templateId = String(req.body?.templateId || "").trim().toLowerCase();
  if (!requesterEmail) { res.status(401).json({ error: "Sign in is required." }); return; }
  if (!projectId) { res.status(400).json({ error: "Activity ID is required." }); return; }
  if (!templateId) { res.status(400).json({ error: "Template ID is required." }); return; }
  if (!hasDatabase) { res.json({ ok: true, reset: false, reason: "database_unavailable" }); return; }

  try {
    const current = projectId.toLowerCase() === "all"
      ? await pool.query(`SELECT project_id, evidence_steps, template_copies FROM project_interests WHERE student_email = $1`, [requesterEmail])
      : await pool.query(
        `SELECT project_id, evidence_steps, template_copies FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1`,
        [projectId, requesterEmail]
      );
    const matchers = {
      "digital-outcome-description": /description\s*-\s*google\s*slides|describe.*digital\s+outcome/i,
      "target-audience": /target\s+audience|end\s+user/i,
      "development-steps": /outcome\s+will\s+be\s+developed|development\s+steps/i,
      "trialling-components": /trial\s+(?:the\s+)?components|triall?ing\s+(?:the\s+)?components/i,
      "tools-and-techniques": /what\s+tools\s+and\s+techniques/i,
      "project-success-criteria": /success\s+criteria|success\s+will\s+be\s+measured|success\s+will\s+be\s+evaluated/i,
      "relevant-implications": /relevant\s+implications/i,
      "decomposition-tasks": /decompos/i,
      "speaker-notes-criteria-mapping": /speaker\s*notes|criteria\s*mapping/i
    };
    let resetCount = 0;
    for (const row of current.rows || []) {
      const evidenceSteps = normalizeEvidenceStepsPayload(row.evidence_steps).map((evidenceRow) => ({
        ...evidenceRow,
        steps: evidenceRow.steps.map((step) => ({
          ...step,
          done: matchers[templateId]?.test(String(step?.text || "")) ? false : Boolean(step.done)
        }))
      }));
      const templateCopies = Array.isArray(row.template_copies)
        ? row.template_copies.filter((copy) => String(copy?.templateId || "").trim().toLowerCase() !== templateId)
        : [];
      await pool.query(
        `UPDATE project_interests SET evidence_steps = $1::jsonb, template_copies = $2::jsonb, updated_at = NOW() WHERE project_id = $3 AND student_email = $4`,
        [JSON.stringify(evidenceSteps), JSON.stringify(templateCopies), row.project_id, requesterEmail]
      );
      resetCount += 1;
    }
    res.json({ ok: true, reset: resetCount > 0, resetCount });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not reset template use." });
  }
});

app.patch("/api/activities/:id/interests/:studentEmail/trello-link", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const trelloCardUrl = String(req.body?.trello_card_url || req.body?.trelloCardUrl || "").trim();

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  let isTeacher = false;
  try {
    const access = await resolveActivityWriteAccess(requesterEmail);
    isTeacher = Boolean(access.allowed);
  } catch (_error) {
    isTeacher = false;
  }

  if (!isTeacher && requesterEmail !== studentEmail) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!trelloCardUrl) {
    res.status(400).json({ error: "Trello card or board link is required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ student_email: studentEmail, trello_card_url: trelloCardUrl, saved: true });
    return;
  }

  try {
    const currentResult = await pool.query(
      "SELECT evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
      [projectId, studentEmail]
    );

    if (!currentResult.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    const existingRows = normalizeEvidenceStepsPayload(currentResult.rows?.[0]?.evidence_steps);
    const nextRows = upsertEvidenceRow(existingRows, "trello-sync", [
      { text: `TRELLO_CARD_URL|${trelloCardUrl}`, done: true },
      { text: `TRELLO_SAVED_AT|${new Date().toISOString()}`, done: true }
    ]);

    await pool.query(
      `
        UPDATE project_interests
        SET evidence_steps = $1::jsonb,
            updated_at = NOW()
        WHERE project_id = $2 AND student_email = $3
      `,
      [JSON.stringify(nextRows), projectId, studentEmail]
    );

    res.json({
      student_email: studentEmail,
      trello_card_url: trelloCardUrl,
      evidence_steps: nextRows,
      saved: true
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not save Trello link" });
  }
});

app.patch("/api/activities/:id/interests/me/trello-link", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const trelloCardUrl = String(req.body?.trello_card_url || req.body?.trelloCardUrl || "").trim();

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  if (!trelloCardUrl) {
    res.status(400).json({ error: "Trello card or board link is required" });
    return;
  }

  if (!hasDatabase) {
    res.json({ student_email: requesterEmail, trello_card_url: trelloCardUrl, saved: true });
    return;
  }

  try {
    const currentResult = await pool.query(
      "SELECT evidence_steps FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1",
      [projectId, requesterEmail]
    );

    let existingRows = [];
    if (currentResult.rowCount) {
      existingRows = normalizeEvidenceStepsPayload(currentResult.rows?.[0]?.evidence_steps);
    } else {
      await pool.query(
        `
          INSERT INTO project_interests (project_id, student_email, confirmed, created_at, updated_at, evidence_steps)
          VALUES ($1, $2, FALSE, NOW(), NOW(), '[]'::jsonb)
          ON CONFLICT (project_id, student_email) DO NOTHING
        `,
        [projectId, requesterEmail]
      );
    }

    const nextRows = upsertEvidenceRow(existingRows, "trello-sync", [
      { text: `TRELLO_CARD_URL|${trelloCardUrl}`, done: true },
      { text: `TRELLO_SAVED_AT|${new Date().toISOString()}`, done: true }
    ]);

    await pool.query(
      `
        UPDATE project_interests
        SET evidence_steps = $1::jsonb,
            updated_at = NOW()
        WHERE project_id = $2 AND student_email = $3
      `,
      [JSON.stringify(nextRows), projectId, requesterEmail]
    );

    res.json({
      student_email: requesterEmail,
      trello_card_url: trelloCardUrl,
      evidence_steps: nextRows,
      saved: true
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not save Trello link" });
  }
});

// DELETE /api/activities/:id/interests/:studentEmail — teacher removes a student's interest
app.delete("/api/activities/:id/interests/:studentEmail", requireActivityWriteAccess, async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const studentEmail = normalizeEmail(req.params.studentEmail || "");

  if (!projectId || !studentEmail) {
    res.status(400).json({ error: "Project ID and student email are required" });
    return;
  }

  if (!hasDatabase) {
    res.status(204).send();
    return;
  }

  try {
    await pool.query(
      "DELETE FROM project_interests WHERE project_id = $1 AND student_email = $2",
      [projectId, studentEmail]
    );
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Could not remove interest" });
  }
});

// GET /api/activities/:id/my-tools-techniques — get the signed-in student's tools & techniques for a project
app.get("/api/activities/:id/my-tools-techniques", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  const storageKey = `${projectId}:${requesterEmail}`;

  if (!hasDatabase) {
    const stored = memoryStudentToolsTechniques.get(storageKey) || { tools_techniques: [] };
    res.json(stored);
    return;
  }

  try {
    const result = await pool.query(
      `SELECT tools_techniques FROM project_interests WHERE project_id = $1 AND student_email = $2 LIMIT 1`,
      [projectId, requesterEmail]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    const toolsTechniques = result.rows[0]?.tools_techniques || [];
    res.json({ tools_techniques: Array.isArray(toolsTechniques) ? toolsTechniques : [] });
  } catch (_error) {
    res.status(500).json({ error: "Could not load tools & techniques" });
  }
});

// PATCH /api/activities/:id/my-tools-techniques — save the signed-in student's tools & techniques for a project
app.patch("/api/activities/:id/my-tools-techniques", async (req, res) => {
  const projectId = String(req.params.id || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const toolsTechniques = Array.isArray(req.body?.tools_techniques) ? req.body.tools_techniques : [];

  if (!projectId) {
    res.status(400).json({ error: "Project ID is required" });
    return;
  }

  if (!requesterEmail || !requesterEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  const storageKey = `${projectId}:${requesterEmail}`;
  const normalizedTools = toolsTechniques.map((item) => ({
    id: String(item?.id || "").trim() || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    toolName: String(item?.toolName || "").trim(),
    status: String(item?.status || "Intend to Use").trim(),
    techniques: String(item?.techniques || "").trim(),
    createdAt: String(item?.createdAt || new Date().toISOString()).trim()
  })).filter((item) => item.toolName);

  if (!hasDatabase) {
    memoryStudentToolsTechniques.set(storageKey, { tools_techniques: normalizedTools });
    res.json({ tools_techniques: normalizedTools });
    return;
  }

  try {
    const ensureRow = await pool.query(
      `
        INSERT INTO project_interests (project_id, student_email, confirmed, created_at, updated_at, tools_techniques)
        VALUES ($1, $2, FALSE, NOW(), NOW(), '[]'::jsonb)
        ON CONFLICT (project_id, student_email) DO NOTHING
        RETURNING student_email
      `,
      [projectId, requesterEmail]
    );

    const result = await pool.query(
      `
        UPDATE project_interests
        SET tools_techniques = $1::jsonb,
            updated_at = NOW()
        WHERE project_id = $2 AND student_email = $3
        RETURNING student_email
      `,
      [JSON.stringify(normalizedTools), projectId, requesterEmail]
    );

    if (!result.rowCount && !ensureRow.rowCount) {
      res.status(404).json({ error: "Student allocation not found" });
      return;
    }

    res.json({ tools_techniques: normalizedTools });
  } catch (_error) {
    res.status(500).json({ error: "Could not save tools & techniques" });
  }
});

// GET /api/tools-techniques-keywords — the growing, student-worded Tools & Techniques keyword index.
// Any signed-in school account can read it (needed client-side to recognise Trello cards typed directly,
// without going through the Push to Trello button).
app.get("/api/tools-techniques-keywords", requireSchoolAccountAccess, async (_req, res) => {
  if (!hasDatabase) {
    const rows = Array.from(memoryToolsTechniquesKeywords.values())
      .sort((a, b) => String(a.keyword).localeCompare(String(b.keyword)));
    res.json({ keywords: rows });
    return;
  }

  try {
    await ensureToolsTechniquesKeywordsSchema();
    const result = await pool.query(
      `SELECT id, keyword, source, added_by_email, use_count, created_at, updated_at
       FROM tools_techniques_keywords
       ORDER BY keyword ASC`
    );
    res.json({ keywords: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load the Tools & Techniques keyword index." });
  }
});

// POST /api/tools-techniques-keywords — add/increment keywords. Called automatically when a student pushes
// tool rows to Trello (each real tool name becomes/reinforces an entry), growing the index over time.
app.post("/api/tools-techniques-keywords", requireSchoolAccountAccess, async (req, res) => {
  const email = req.user_email;
  const source = String(req.body?.source || "").trim().toLowerCase() === "manual" ? "manual" : "auto";
  const keywords = Array.from(new Set(
    (Array.isArray(req.body?.keywords) ? req.body.keywords : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, 50)
  ));

  if (!keywords.length) {
    res.status(400).json({ error: "At least one keyword is required." });
    return;
  }

  if (!hasDatabase) {
    keywords.forEach((keyword) => {
      const lower = keyword.toLowerCase();
      const existing = memoryToolsTechniquesKeywords.get(lower);
      if (existing) {
        existing.use_count = Number(existing.use_count || 0) + 1;
        existing.updated_at = new Date().toISOString();
      } else {
        memoryToolsTechniquesKeywords.set(lower, {
          id: memoryToolsTechniquesKeywords.size + 1,
          keyword,
          source,
          added_by_email: email,
          use_count: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    });
    res.status(201).json({ ok: true });
    return;
  }

  try {
    await ensureToolsTechniquesKeywordsSchema();
    for (const keyword of keywords) {
      await pool.query(
        `
          INSERT INTO tools_techniques_keywords (keyword, keyword_lower, source, added_by_email, use_count, created_at, updated_at)
          VALUES ($1, LOWER(TRIM($1)), $3, $2, 1, NOW(), NOW())
          ON CONFLICT (keyword_lower) DO UPDATE SET
            use_count = tools_techniques_keywords.use_count + 1,
            updated_at = NOW()
        `,
        [keyword, email, source]
      );
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not update the Tools & Techniques keyword index." });
  }
});

// DELETE /api/tools-techniques-keywords/:id — admin/teacher moderation of the keyword index.
app.delete("/api/tools-techniques-keywords/:id", requireActivityWriteAccess, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Keyword id is required." });
    return;
  }

  if (!hasDatabase) {
    const entry = Array.from(memoryToolsTechniquesKeywords.entries()).find(([, row]) => String(row.id) === id);
    if (entry) memoryToolsTechniquesKeywords.delete(entry[0]);
    res.status(204).send();
    return;
  }

  try {
    await ensureToolsTechniquesKeywordsSchema();
    await pool.query(`DELETE FROM tools_techniques_keywords WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not remove that keyword." });
  }
});

// GET /api/my-allocations — returns all projects and assessment tasks the signed-in student is allocated to
app.post("/api/integrations/external-exam-intention", async (req, res) => {
  const expectedSecret = String(process.env.EXTERNAL_EXAM_FORM_WEBHOOK_SECRET || "").trim();
  const suppliedSecret = String(req.headers?.["x-external-exam-webhook-secret"] || "").trim();
  if (!expectedSecret) {
    res.status(503).json({ error: "External exam form sync is not configured." });
    return;
  }
  if (suppliedSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized form response sync." });
    return;
  }

  const studentEmail = normalizeExternalExamStudentEmail(req.body?.student_email || req.body?.email || "");
  const decision = normalizeExternalExamIntention(req.body?.decision || req.body?.answer || "");
  const submittedAtValue = String(req.body?.submitted_at || "").trim();
  const submittedAtDate = submittedAtValue ? new Date(submittedAtValue) : new Date();
  if (!isSchoolEmail(studentEmail)) {
    res.status(400).json({ error: "A valid school student email is required." });
    return;
  }
  if (!decision) {
    res.status(400).json({ error: "The form answer must clearly be Yes or No." });
    return;
  }
  if (Number.isNaN(submittedAtDate.getTime())) {
    res.status(400).json({ error: "The form submission timestamp is invalid." });
    return;
  }

  const record = {
    student_email: studentEmail,
    decision,
    submitted_at: submittedAtDate.toISOString(),
    updated_at: new Date().toISOString()
  };
  if (!hasDatabase) {
    memoryExternalExamIntentions.set(studentEmail, record);
    res.json({ ok: true, student_email: studentEmail, decision });
    return;
  }

  try {
    await ensureExternalExamIntentionsSchema();
    await pool.query(
      `INSERT INTO student_external_exam_intentions (student_email, decision, submitted_at, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (student_email) DO UPDATE SET
         decision = EXCLUDED.decision,
         submitted_at = EXCLUDED.submitted_at,
         updated_at = NOW()`,
      [studentEmail, decision, submittedAtDate]
    );
    res.json({ ok: true, student_email: studentEmail, decision });
  } catch (error) {
    console.error("[external-exam-intention] Could not store form response:", error.message);
    res.status(500).json({ error: "Could not save external exam intention." });
  }
});

app.post("/api/integrations/external-exam-intentions/sync", async (req, res) => {
  const expectedSecret = String(process.env.EXTERNAL_EXAM_FORM_WEBHOOK_SECRET || "").trim();
  const suppliedSecret = String(req.headers?.["x-external-exam-webhook-secret"] || "").trim();
  if (!expectedSecret) return res.status(503).json({ error: "External exam form sync is not configured." });
  if (suppliedSecret !== expectedSecret) return res.status(401).json({ error: "Unauthorized form response sync." });

  const input = req.body?.responses;
  if (!Array.isArray(input) || input.length > 1000) {
    return res.status(400).json({ error: "A valid external exam response snapshot is required." });
  }

  const responsesByEmail = new Map();
  for (const row of input) {
    const studentEmail = normalizeExternalExamStudentEmail(row?.student_email || row?.email || "");
    const decision = normalizeExternalExamIntention(row?.decision || row?.answer || "");
    const submittedAtValue = String(row?.submitted_at || "").trim();
    const submittedAtDate = submittedAtValue ? new Date(submittedAtValue) : new Date();
    if (!isSchoolEmail(studentEmail) || !decision || Number.isNaN(submittedAtDate.getTime())) {
      return res.status(400).json({ error: "Every response needs a school email, a Yes/No decision, and a valid timestamp." });
    }
    responsesByEmail.set(studentEmail, {
      student_email: studentEmail,
      decision,
      submitted_at: submittedAtDate.toISOString()
    });
  }

  const responses = Array.from(responsesByEmail.values());
  if (!hasDatabase) {
    memoryExternalExamIntentions.clear();
    responses.forEach((row) => memoryExternalExamIntentions.set(row.student_email, { ...row, updated_at: new Date().toISOString() }));
    return res.json({ ok: true, synced: responses.length, cleared: input.length - responses.length });
  }

  let client;
  try {
    await ensureExternalExamIntentionsSchema();
    client = await pool.connect();
    await client.query("BEGIN");
    const currentEmails = responses.map((row) => row.student_email);
    const deleted = await client.query(
      `DELETE FROM student_external_exam_intentions WHERE NOT (student_email = ANY($1::text[]))`,
      [currentEmails]
    );
    for (const row of responses) {
      await client.query(
        `INSERT INTO student_external_exam_intentions (student_email, decision, submitted_at, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (student_email) DO UPDATE SET
           decision = EXCLUDED.decision,
           submitted_at = EXCLUDED.submitted_at,
           updated_at = NOW()`,
        [row.student_email, row.decision, row.submitted_at]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, synced: responses.length, cleared: Number(deleted.rowCount || 0) });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[external-exam-intention-sync] Could not reconcile form responses:", error.message);
    res.status(500).json({ error: "Could not sync external exam responses." });
  } finally {
    client?.release();
  }
});

app.get("/api/external-assessment-allocations", requireActivityWriteAccess, async (_req, res) => {
  if (!hasDatabase) {
    res.json({ allocations: Array.from(memoryExternalAssessmentAllocations.values()) });
    return;
  }

  try {
    await ensureExternalAssessmentAllocationsSchema();
    const result = await pool.query(
      `SELECT student_email, project_exam_standard, computer_science_exam_standard, updated_at
       FROM student_external_assessment_allocations
       ORDER BY student_email ASC`
    );
    res.json({ allocations: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load external assessment allocations" });
  }
});

app.put("/api/external-assessment-allocations/:studentEmail", requireActivityWriteAccess, async (req, res) => {
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const projectExamStandard = String(req.body?.project_exam_standard || "").trim();
  const computerScienceExamStandard = String(req.body?.computer_science_exam_standard || "").trim();
  const projectOptions = new Set(["", "92007", "91899", "91909"]);
  const computerScienceOptions = new Set(["", "92006", "91898", "91908"]);

  if (!isSchoolEmail(studentEmail)) {
    res.status(400).json({ error: "A valid school student email is required" });
    return;
  }
  if (!projectOptions.has(projectExamStandard) || !computerScienceOptions.has(computerScienceExamStandard)) {
    res.status(400).json({ error: "Invalid external assessment standard" });
    return;
  }

  const allocation = {
    student_email: studentEmail,
    project_exam_standard: projectExamStandard,
    computer_science_exam_standard: computerScienceExamStandard,
    updated_at: new Date().toISOString()
  };

  if (!hasDatabase) {
    memoryExternalAssessmentAllocations.set(studentEmail, allocation);
    res.json({ ok: true, allocation });
    return;
  }

  try {
    await ensureExternalAssessmentAllocationsSchema();
    const result = await pool.query(
      `INSERT INTO student_external_assessment_allocations (
         student_email, project_exam_standard, computer_science_exam_standard, updated_by_email, updated_at
       ) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (student_email) DO UPDATE SET
         project_exam_standard = EXCLUDED.project_exam_standard,
         computer_science_exam_standard = EXCLUDED.computer_science_exam_standard,
         updated_by_email = EXCLUDED.updated_by_email,
         updated_at = NOW()
       RETURNING student_email, project_exam_standard, computer_science_exam_standard, updated_at`,
      [studentEmail, projectExamStandard || null, computerScienceExamStandard || null, req.user_email]
    );
    res.json({ ok: true, allocation: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save external assessment allocation" });
  }
});

app.get("/api/student-tracker/comments", requireActivityWriteAccess, async (_req, res) => {
  if (!hasDatabase) {
    res.json({ comments: Array.from(memoryStudentTrackerComments.values()) });
    return;
  }

  try {
    await ensureStudentTrackerCommentsSchema();
    const result = await pool.query(
      `SELECT student_email, comment, updated_at FROM student_tracker_comments ORDER BY student_email ASC`
    );
    res.json({ comments: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load student tracker comments" });
  }
});

app.put("/api/student-tracker/comments/:studentEmail", requireActivityWriteAccess, async (req, res) => {
  const studentEmail = normalizeEmail(req.params.studentEmail || "");
  const comment = String(req.body?.comment || "").trim();
  if (!isSchoolEmail(studentEmail)) {
    res.status(400).json({ error: "A valid school student email is required" });
    return;
  }

  const savedComment = {
    student_email: studentEmail,
    comment,
    updated_at: new Date().toISOString()
  };
  if (!hasDatabase) {
    if (comment) memoryStudentTrackerComments.set(studentEmail, savedComment);
    else memoryStudentTrackerComments.delete(studentEmail);
    res.json({ ok: true, comment: savedComment });
    return;
  }

  try {
    await ensureStudentTrackerCommentsSchema();
    const result = comment
      ? await pool.query(
          `INSERT INTO student_tracker_comments (student_email, comment, updated_by_email, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (student_email) DO UPDATE SET comment = EXCLUDED.comment, updated_by_email = EXCLUDED.updated_by_email, updated_at = NOW()
           RETURNING student_email, comment, updated_at`,
          [studentEmail, comment, req.user_email]
        )
      : await pool.query(`DELETE FROM student_tracker_comments WHERE student_email = $1 RETURNING student_email`, [studentEmail]);
    res.json({ ok: true, comment: result.rows[0] || savedComment });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save student tracker comment" });
  }
});

app.post("/api/student-tracker/email-summary", requireActivityWriteAccess, async (req, res) => {
  const studentEmail = normalizeEmail(req.body?.student_email || req.body?.studentEmail || "");
  const summaries = Array.isArray(req.body?.summaries) ? req.body.summaries : [];
  if (!isSchoolEmail(studentEmail)) {
    res.status(400).json({ error: "A valid school student email is required" });
    return;
  }
  if (!summaries.length || summaries.length > 2) {
    res.status(400).json({ error: "At least one summary is required" });
    return;
  }
  if (!smtpTransporter || !SMTP_FROM) {
    res.status(503).json({ error: "Email is not configured on the hub." });
    return;
  }

  const safeSummaries = summaries.map((summary) => ({
    standard: String(summary?.standard || "").trim(),
    label: String(summary?.label || "Summary").trim(),
    html: String(summary?.html || "").trim()
  })).filter((summary) => /^\d{4,6}$/.test(summary.standard) && summary.html && summary.html.length <= 300000);
  if (!safeSummaries.length || safeSummaries.length !== summaries.length) {
    res.status(400).json({ error: "Invalid summary content" });
    return;
  }

  const sentAt = new Date();
  const sentAtLabel = sentAt.toLocaleString("en-NZ", { dateStyle: "short", timeStyle: "medium" });
  const scopeLabel = safeSummaries.map((summary) => `${summary.label} ${summary.standard}`).join(" and ");
  const safe = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  try {
    await sendConfiguredHubEmail({
      to: studentEmail,
      cc: req.user_email,
      subject: `[DTECH HUB] Progress Summary: ${scopeLabel}`,
      html: `<div style="font-family:Arial,sans-serif;color:#17314d;max-width:900px;margin:0 auto;"><p>Kia ora ${safe(studentEmail)},</p><p>Your DTECH Hub progress summary is below.</p>${safeSummaries.map((summary) => `<div style="margin:24px 0;">${summary.html}</div>`).join("")}<p style="color:#5a7188;font-size:12px;">Sent ${safe(sentAtLabel)}.</p></div>`
    });

    const emailEntry = `=== Email sent | ${scopeLabel} | ${sentAtLabel} ===`;
    if (!hasDatabase) {
      const existing = memoryStudentTrackerComments.get(studentEmail);
      const existingComment = String(existing?.comment || "").trim();
      const comment = existingComment ? `${emailEntry}\n${existingComment}` : emailEntry;
      const saved = { student_email: studentEmail, comment, updated_at: sentAt.toISOString() };
      memoryStudentTrackerComments.set(studentEmail, saved);
      res.json({ ok: true, sent_at: sentAt.toISOString(), comment: saved });
      return;
    }

    await ensureStudentTrackerCommentsSchema();
    const existingResult = await pool.query(
      `SELECT comment FROM student_tracker_comments WHERE student_email = $1 LIMIT 1`,
      [studentEmail]
    );
    const existingComment = String(existingResult.rows[0]?.comment || "").trim();
    const combinedComment = existingComment ? `${emailEntry}\n${existingComment}` : emailEntry;
    const result = await pool.query(
      `INSERT INTO student_tracker_comments (student_email, comment, updated_by_email, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (student_email) DO UPDATE SET comment = EXCLUDED.comment, updated_by_email = EXCLUDED.updated_by_email, updated_at = NOW()
       RETURNING student_email, comment, updated_at`,
      [studentEmail, combinedComment, req.user_email]
    );
    res.json({ ok: true, sent_at: sentAt.toISOString(), comment: result.rows[0] });
  } catch (error) {
    console.error("[student-tracker-email] Could not email progress summary:", error);
    res.status(500).json({ error: getHubEmailErrorMessage(error) });
  }
});

app.get("/api/my-allocations", async (req, res) => {
  const taskListView = String(req.query?.view || "").trim().toLowerCase() === "task-list";
  const email = normalizeEmail(
    req?.authenticated_email ||
    req?.headers?.["x-user-email"] ||
    req?.headers?.["x-ms-client-principal-name"] ||
    req?.query?.user_email ||
    req?.query?.email ||
    ""
  );
  if (!email) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }

  if (!hasDatabase) {
    const externalAllocation = memoryExternalAssessmentAllocations.get(email) || {};
    const intention = memoryExternalExamIntentions.get(email)?.decision || "";
    const assignedExternalStandards = [externalAllocation.project_exam_standard, externalAllocation.computer_science_exam_standard]
      .map((standardNumber) => String(standardNumber || "").trim())
      .filter(Boolean);
    res.json({
      assessment_tasks: [],
      projects: [],
      has_external_exam_allocation: assignedExternalStandards.length > 0,
      external_exam_intention: intention,
      external_standards: intention === "no" ? [] : assignedExternalStandards.map((standard_number) => ({ standard_number }))
    });
    return;
  }

  try {
    const studentDirectoryRows = await getStudentDirectoryRows();
    const studentByEmail = new Map();
    studentDirectoryRows.forEach((row) => {
      const normalized = buildStudentClassManagementRow(row);
      const linkedEmails = Array.isArray(normalized?.linked_emails) ? normalized.linked_emails : [];
      linkedEmails.forEach((linkedEmail) => {
        studentByEmail.set(normalizeEmail(linkedEmail), normalized);
      });
    });

    const result = await pool.query(
      `SELECT a.id, a.name, a.activity_category, a.type, pi.student_email, pi.standard_1, pi.standard_2, pi.digital_media_type
       FROM project_interests pi
       JOIN activities a ON a.id::text = pi.project_id::text
       LEFT JOIN activity_hub_visibility v
         ON v.activity_id = a.id::text
        AND v.hub_name = $2
       WHERE pi.student_email = $1
         AND ($3::boolean = FALSE OR a.id::text = $4::text OR COALESCE(v.is_visible, TRUE) = TRUE)
       ORDER BY a.name ASC`,
      [email, DTECH_HUB_NAME, taskListView, CLIENT_PROJECTS_TASK_ID]
    );

    const assessmentTasks = [];
    const projects = [];
    const visibleAllocationRows = taskListView ? filterStudentTaskListActivities(result.rows) : result.rows;
    for (const row of visibleAllocationRows) {
      const cat = String(row.activity_category || "").toLowerCase();
      const item = {
        id: String(row.id),
        name: String(row.name || "Untitled"),
        topic_type: String(row.type || "").trim(),
        activity_category: String(row.activity_category || "").trim(),
        standard_1: String(row.standard_1 || "").trim(),
        standard_2: String(row.standard_2 || "").trim(),
        digital_media_type: String(row.digital_media_type || "").trim()
      };
      const studentRecord = studentByEmail.get(normalizeEmail(row.student_email));
      item.year_group = String(studentRecord?.year_level || "").trim();
      item.course_type = Array.isArray(studentRecord?.programs)
        ? studentRecord.programs.find((program) => ["DTECH", "COMP", "MDTECH"].includes(String(program || "").trim().toUpperCase())) || ""
        : "";
      if (cat.includes("assessment")) {
        assessmentTasks.push(item);
      } else {
        projects.push(item);
      }
    }

    await ensureAssessmentStandardCardsSchema();
    const standardCardsResult = await pool.query(
      `SELECT * FROM assessment_standard_cards WHERE is_active = TRUE ORDER BY updated_at DESC`
    );
    const allocationRows = [...assessmentTasks, ...projects];
    const standardNumbers = Array.from(new Set(
      allocationRows
        .flatMap((item) => [item.standard_1, item.standard_2])
        .map((standard) => String(standard || "").trim())
        .filter(Boolean)
    ));
    const profileRow = allocationRows.find((item) => item.year_group || item.course_type) || {};
    const studentYear = Number.parseInt(String(profileRow.year_group || "").replace(/[^0-9]/g, ""), 10);
    const standardLevel = [11, 12, 13].includes(studentYear) ? `Level ${studentYear - 10}` : "";
    const allocatedStandards = standardNumbers.map((standardNumber) => {
      const card = pickBestAssessmentStandardCardMatch(standardCardsResult.rows, {
        standardCode: standardNumber,
        yearLevel: standardLevel,
        courseName: profileRow.course_type,
        yearVersion: new Date().getFullYear()
      });
      const fallbackStandard = NZQA_STANDARDS_FALLBACK.find((standard) =>
        standard.stream === "digital" && standard.standard_number === standardNumber
      );
      return {
        standard_number: standardNumber,
        credits: Number.isInteger(card?.credits)
          ? card.credits
          : Number.isInteger(fallbackStandard?.credits) ? fallbackStandard.credits : null
      };
    });
    await ensureExternalAssessmentAllocationsSchema();
    const savedExternalResult = await pool.query(
      `SELECT project_exam_standard, computer_science_exam_standard
       FROM student_external_assessment_allocations
       WHERE student_email = $1
       LIMIT 1`,
      [email]
    );
    const savedExternal = savedExternalResult.rows[0] || null;
    const externalStandardNumbers = savedExternal
      ? [savedExternal.project_exam_standard, savedExternal.computer_science_exam_standard]
          .map((standard) => String(standard || "").trim())
          .filter(Boolean)
      : [];
    await ensureExternalExamIntentionsSchema();
    const intentionResult = await pool.query(
      `SELECT decision FROM student_external_exam_intentions WHERE student_email = $1 LIMIT 1`,
      [email]
    );
    const externalExamIntention = String(intentionResult.rows?.[0]?.decision || "").trim().toLowerCase();
    const externalStandards = (externalExamIntention === "no" ? [] : externalStandardNumbers).map((standardNumber) => {
      const standard = NZQA_STANDARDS_FALLBACK.find((row) =>
        row.stream === "digital" && row.standard_number === standardNumber
      );
      return {
        standard_number: standardNumber,
        standard_name: String(standard?.standard_name || "").trim(),
        credits: Number.isInteger(standard?.credits) ? standard.credits : null
      };
    });

    res.json({
      assessment_tasks: assessmentTasks,
      projects,
      allocated_standards: allocatedStandards,
      external_standards: externalStandards,
      has_external_exam_allocation: externalStandardNumbers.length > 0,
      external_exam_intention: externalExamIntention
    });
  } catch (error) {
    console.error("[my-allocations] Query failed:", error.message);
    res.status(500).json({ error: "Could not load allocations" });
  }
});

// POST /api/client-projects/backfill — teacher/admin manual backfill for existing project allocations
app.post("/api/client-projects/backfill", requireActivityWriteAccess, async (_req, res) => {
  if (!hasDatabase) {
    res.json({ ok: true, inserted: 0, client_projects_task_id: CLIENT_PROJECTS_TASK_ID });
    return;
  }

  try {
    const inserted = await backfillProcessAssessmentAllocations();
    res.json({
      ok: true,
      inserted,
      client_projects_task_id: CLIENT_PROJECTS_TASK_ID
    });
  } catch (error) {
    console.error("[client-projects-backfill] Failed:", error.message);
    res.status(500).json({ error: "Could not run client projects backfill" });
  }
});

// GET /api/project-interests — all projects with interest summaries (teacher-only)
app.get("/api/project-interests", requireActivityWriteAccess, async (_req, res) => {
  if (!hasDatabase) {
    res.json([]);
    return;
  }

  try {
    // Reconcile any self-service interest that was saved while its matching Process
    // Assessment allocation could not be created (for example, a transient DB failure).
    await backfillProcessAssessmentAllocations();

    const result = await pool.query(`
      SELECT
        pi.project_id,
        MAX(a.name) AS project_name,
        COUNT(*)::int AS interest_count,
        COUNT(*) FILTER (WHERE pi.confirmed)::int AS confirmed_count,
        json_agg(
          json_build_object(
            'email', pi.student_email,
            'student_email', pi.student_email,
            'confirmed', pi.confirmed,
            'standard_1', pi.standard_1,
            'standard_2', pi.standard_2,
            'digital_media_type', pi.digital_media_type,
            'created_at', pi.created_at
          )
        ) FILTER (WHERE pi.student_email IS NOT NULL) AS students
      FROM project_interests pi
      LEFT JOIN activities a ON a.id::text = pi.project_id
      GROUP BY pi.project_id
      ORDER BY interest_count DESC
    `);

    res.json(result.rows.map((row) => ({
      project_id: row.project_id,
      project_name: row.project_name || row.project_id,
      interest_count: row.interest_count,
      confirmed_count: row.confirmed_count,
      students: Array.isArray(row.students) ? row.students.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) : []
    })));
  } catch (error) {
    console.error("[project-interests] Query failed:", error.message);
    res.status(500).json({ error: "Could not load project interests" });
  }
});

// GET /api/admin/nzqa-standards — admin standards index for assessment management
app.get("/api/admin/nzqa-standards", requireAdminAccess, async (req, res) => {
  const levelParam = String(req.query?.level || "all").trim().toLowerCase();
  const streamParam = String(req.query?.stream || "digital").trim().toLowerCase();
  const standardQuery = String(req.query?.standard || "").trim().toLowerCase();
  const includeDocs = String(req.query?.include_docs || "false").trim().toLowerCase() === "true";

  const levels = levelParam === "all"
    ? [1, 2, 3]
    : [Number.parseInt(levelParam, 10)].filter((value) => [1, 2, 3].includes(value));

  if (!levels.length) {
    res.status(400).json({ error: "level must be one of all, 1, 2, or 3" });
    return;
  }

  const streams = streamParam === "both"
    ? ["digital", "computing"]
    : [streamParam];

  if (!streams.every((stream) => ["digital", "computing"].includes(stream))) {
    res.status(400).json({ error: "stream must be one of digital, computing, or both" });
    return;
  }

  try {
    const jobs = [];
    levels.forEach((level) => {
      streams.forEach((stream) => {
        jobs.push(fetchNzqaStandards(stream, level, { includeDocs }));
      });
    });

    const results = await Promise.all(jobs);
    let standards = results.flat();

    if (standardQuery) {
      standards = standards.filter((item) =>
        String(item.standard_number || "").toLowerCase().includes(standardQuery)
      );
    }

    standards.sort((left, right) => {
      if (left.level !== right.level) {
        return left.level - right.level;
      }
      return String(left.standard_number || "").localeCompare(String(right.standard_number || ""), undefined, { numeric: true });
    });

    res.json({
      generated_at: new Date().toISOString(),
      filters: {
        level: levelParam,
        stream: streamParam,
        standard: standardQuery,
        include_docs: includeDocs
      },
      count: standards.length,
      standards
    });
  } catch (error) {
    res.status(500).json({ error: `Could not load NZQA standards: ${String(error?.message || "unknown error")}` });
  }
});

// GET /api/admin/nzqa-standards/details — load standard details text from PDF/DOCX/HTML
app.get("/api/admin/nzqa-standards/details", requireAdminAccess, async (req, res) => {
  const standardNumber = String(req.query?.standard || "").trim();
  const force = String(req.query?.force || "").trim().toLowerCase() === "true";

  if (!standardNumber) {
    res.status(400).json({ error: "standard is required" });
    return;
  }

  if (force) {
    nzqaStandardDetailsCache.delete(standardNumber);
    nzqaStandardLinksCache.delete(standardNumber);
  }

  try {
    const details = await fetchNzqaStandardDetails(standardNumber);
    res.json({
      ok: true,
      details
    });
  } catch (error) {
    res.status(500).json({ error: `Could not load standard details: ${String(error?.message || "unknown error")}` });
  }
});

// GET /api/assessment-standards/options — staff/admin standards options for allocation dropdowns
app.get("/api/assessment-standards/options", requireActivityWriteAccess, async (req, res) => {
  const levelParam = String(req.query?.level || "all").trim().toLowerCase();
  const streamParam = String(req.query?.stream || "both").trim().toLowerCase();

  const levels = levelParam === "all"
    ? [1, 2, 3]
    : [Number.parseInt(levelParam, 10)].filter((value) => [1, 2, 3].includes(value));

  if (!levels.length) {
    res.status(400).json({ error: "level must be one of all, 1, 2, or 3" });
    return;
  }

  const streams = streamParam === "both"
    ? ["digital", "computing"]
    : [streamParam];

  if (!streams.every((stream) => ["digital", "computing"].includes(stream))) {
    res.status(400).json({ error: "stream must be one of digital, computing, or both" });
    return;
  }

  try {
    const jobs = [];
    levels.forEach((level) => {
      streams.forEach((stream) => {
        jobs.push(fetchNzqaStandards(stream, level));
      });
    });

    const results = await Promise.all(jobs);
    const deduped = new Map();

    results.flat().forEach((row) => {
      const standardNumber = String(row.standard_number || "").trim();
      const level = Number.parseInt(row.level, 10) || 0;
      if (!standardNumber || !level) return;

      const key = `${standardNumber}:${level}`;
      const existing = deduped.get(key);
      const existingVersion = Number.parseInt(existing?.version, 10) || 0;
      const candidateVersion = Number.parseInt(row.version, 10) || 0;

      if (!existing || candidateVersion >= existingVersion) {
        deduped.set(key, row);
      }
    });

    const options = Array.from(deduped.values())
      .map((row) => ({
        standard_number: String(row.standard_number || "").trim(),
        standard_name: String(row.standard_name || "").trim(),
        short_name: String(row.standard_name || "").trim().replace(/\s+/g, " ").slice(0, 88),
        version: String(row.version || "").trim(),
        level: Number.parseInt(row.level, 10) || null,
        credits: Number.isFinite(Number(row.credits)) ? Number(row.credits) : null,
        stream: String(row.stream || "").trim(),
        details_url: String(row.details_url || "").trim()
      }))
      .sort((left, right) => {
        if (left.level !== right.level) {
          return Number(left.level || 0) - Number(right.level || 0);
        }
        return String(left.standard_number || "").localeCompare(String(right.standard_number || ""), undefined, { numeric: true });
      });

    res.json({
      generated_at: new Date().toISOString(),
      count: options.length,
      options
    });
  } catch (error) {
    res.status(500).json({ error: `Could not load standards options: ${String(error?.message || "unknown error")}` });
  }
});

app.get("/api/admin/assessment-standard-cards", requireAdminAccess, async (req, res) => {
  const standardCode = String(req.query?.standard || "").trim();
  const yearLevel = String(req.query?.year_level || req.query?.yearLevel || "").trim().toLowerCase();
  const courseName = String(req.query?.course_name || req.query?.courseName || "").trim().toLowerCase();
  const yearVersion = Number.parseInt(req.query?.year || req.query?.year_version || req.query?.yearVersion, 10);

  if (!hasDatabase) {
    let rows = Array.from(memoryAssessmentStandardCards.values()).map((row) => normalizeAssessmentStandardCardRow(row));
    if (standardCode) {
      rows = rows.filter((row) => row.standard_codes.includes(standardCode));
    }
    if (yearLevel) {
      rows = rows.filter((row) => String(row.year_level || "").trim().toLowerCase() === yearLevel);
    }
    if (courseName) {
      rows = rows.filter((row) => String(row.course_name || "").trim().toLowerCase() === courseName);
    }
    if (Number.isInteger(yearVersion)) {
      rows = rows.filter((row) => Number.parseInt(row.year_version, 10) === yearVersion);
    }

    rows.sort((a, b) => {
      const aTime = Number.isNaN(new Date(a.updated_at || 0).getTime()) ? 0 : new Date(a.updated_at || 0).getTime();
      const bTime = Number.isNaN(new Date(b.updated_at || 0).getTime()) ? 0 : new Date(b.updated_at || 0).getTime();
      return bTime - aTime;
    });

    res.json({ count: rows.length, cards: rows });
    return;
  }

  try {
    await ensureAssessmentStandardCardsSchema();
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (standardCode) {
      conditions.push(`standard_codes ? $${paramIndex}`);
      values.push(standardCode);
      paramIndex += 1;
    }
    if (yearLevel) {
      conditions.push(`LOWER(year_level) = $${paramIndex}`);
      values.push(yearLevel);
      paramIndex += 1;
    }
    if (courseName) {
      conditions.push(`LOWER(course_name) = $${paramIndex}`);
      values.push(courseName);
      paramIndex += 1;
    }
    if (Number.isInteger(yearVersion)) {
      conditions.push(`year_version = $${paramIndex}`);
      values.push(yearVersion);
      paramIndex += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await pool.query(
      `
        SELECT *
        FROM assessment_standard_cards
        ${whereClause}
        ORDER BY updated_at DESC
      `,
      values
    );

    const cards = result.rows.map((row) => normalizeAssessmentStandardCardRow(row));
    res.json({ count: cards.length, cards });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Assessment Standard Cards" });
  }
});

app.get("/api/admin/hapara-folders", requireAdminAccess, async (_req, res) => {
  try {
    const rows = await listStudentHaparaFolders();
    res.json({ count: rows.length, folders: rows });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Hapara folder mappings" });
  }
});

app.post("/api/admin/hapara-folders/bulk", requireAdminAccess, async (req, res) => {
  const payloadRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!payloadRows.length) {
    res.status(400).json({ error: "rows array is required" });
    return;
  }

  if (payloadRows.length > 5000) {
    res.status(400).json({ error: "Maximum 5000 rows per upload" });
    return;
  }

  try {
    const result = await upsertStudentHaparaFoldersBulk(payloadRows, req.user_email || "");
    res.json({
      ok: true,
      upserted: Number(result?.upserted || 0),
      skipped: Number(result?.skipped || 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save Hapara folder mappings" });
  }
});

app.delete("/api/admin/hapara-folders/:email", requireAdminAccess, async (req, res) => {
  const email = normalizeEmail(req.params?.email || "");
  if (!email) {
    res.status(400).json({ error: "Valid email is required" });
    return;
  }

  try {
    const deleted = await deleteStudentHaparaFolder(email);
    res.json({ ok: true, deleted: Boolean(deleted) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not delete mapping" });
  }
});

app.get("/api/assessment-standard-cards", requireSchoolAccountAccess, async (_req, res) => {
  if (!hasDatabase) {
    const cards = Array.from(memoryAssessmentStandardCards.values())
      .map((row) => normalizeAssessmentStandardCardRow(row))
      .filter((row) => row.is_active)
      .sort((a, b) => {
        const aTime = Number.isNaN(new Date(a.updated_at || 0).getTime()) ? 0 : new Date(a.updated_at || 0).getTime();
        const bTime = Number.isNaN(new Date(b.updated_at || 0).getTime()) ? 0 : new Date(b.updated_at || 0).getTime();
        return bTime - aTime;
      });

    res.json({ count: cards.length, cards });
    return;
  }

  try {
    await ensureAssessmentStandardCardsSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM assessment_standard_cards
        WHERE is_active = TRUE
        ORDER BY updated_at DESC
      `
    );

    const cards = result.rows.map((row) => normalizeAssessmentStandardCardRow(row));
    res.json({ count: cards.length, cards });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Assessment Standard Cards" });
  }
});

app.post("/api/admin/maintenance/repair-activity-categories", requireAdminAccess, async (req, res) => {
  const confirmation = String(req.body?.confirm || "").trim();
  if (confirmation !== "REPAIR_ACTIVITY_CATEGORIES") {
    res.status(400).json({
      error: "Confirmation token is required.",
      expected: "REPAIR_ACTIVITY_CATEGORIES"
    });
    return;
  }

  if (!hasDatabase) {
    const rows = Array.from(memoryActivities.values());
    let repaired = 0;

    rows.forEach((row) => {
      const next = normalizeActivityCategoryForResponse(row);
      const nextCategory = String(next?.activity_category || row?.activity_category || row?.category || "Activity").trim() || "Activity";
      const nextColor = getDefaultCardColorForCategory(nextCategory);

      const currentCategory = String(row?.activity_category || row?.category || "").trim();
      const currentColor = String(row?.card_color || row?.card_colour || row?.color || "").trim();
      if (currentCategory !== nextCategory || currentColor !== nextColor) {
        row.activity_category = nextCategory;
        row.card_color = nextColor;
        row.updated_at = new Date().toISOString();
        repaired += 1;
      }

      if (row?.id) {
        memoryActivities.set(String(row.id), row);
      }
    });

    res.status(200).json({
      ok: true,
      dryRun: false,
      hasDatabase: false,
      scanned: rows.length,
      repaired,
      unchanged: Math.max(0, rows.length - repaired),
      samples: []
    });
    return;
  }

  try {
    const activityColumns = await getAllTableColumns("activities");
    const idColumn = pickExistingColumn(activityColumns, ["id"]);
    const categoryColumn = pickExistingColumn(activityColumns, ["activity_category", "category"]);
    const cardColorColumn = pickExistingColumn(activityColumns, ["card_color", "card_colour", "color"]);
    const updatedAtColumn = pickExistingColumn(activityColumns, ["updated_at", "updatedon", "last_updated"]);

    if (!idColumn || !categoryColumn) {
      res.status(500).json({
        error: "Could not repair categories because activities table is missing id or category columns."
      });
      return;
    }

    const allRowsResult = await pool.query(`SELECT * FROM activities`);
    const rows = Array.isArray(allRowsResult?.rows) ? allRowsResult.rows : [];
    const allowedActivityCategories = await getCheckConstraintAllowedValues(
      "activities",
      "activities_activity_category_check"
    );
    const allowedByLower = new Map(
      (Array.isArray(allowedActivityCategories) ? allowedActivityCategories : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value])
    );

    const toConstraintSafeCategory = async (candidateCategory, fallbackType) => {
      const raw = String(candidateCategory || "").trim();
      if (!raw) {
        return await resolveActivityCategoryForInsert("Activity", fallbackType, { preferAssessment: false });
      }

      const directMatch = allowedByLower.get(raw.toLowerCase());
      if (directMatch) {
        return directMatch;
      }

      return await resolveActivityCategoryForInsert(raw, fallbackType, {
        preferAssessment: isAssessmentCategoryLabel(raw)
      });
    };

    let repaired = 0;
    const samples = [];
    const failures = [];

    for (const row of rows) {
      const normalized = normalizeActivityCategoryForResponse(row);
      const currentCategory = String(row?.[categoryColumn] || row?.activity_category || row?.category || "").trim();
      const normalizedNextCategory = String(normalized?.activity_category || currentCategory || "Activity").trim() || "Activity";
      const nextCategory = await toConstraintSafeCategory(normalizedNextCategory, row?.type);

      const currentColor = cardColorColumn
        ? String(row?.[cardColorColumn] || row?.card_color || row?.card_colour || row?.color || "").trim()
        : "";
      const nextColor = getDefaultCardColorForCategory(nextCategory);

      const shouldUpdateCategory = currentCategory !== nextCategory;
      const shouldUpdateColor = Boolean(cardColorColumn) && currentColor !== nextColor;

      if (!shouldUpdateCategory && !shouldUpdateColor) {
        continue;
      }

      try {
        const setClauses = [];
        const values = [];

        if (shouldUpdateCategory) {
          values.push(nextCategory);
          setClauses.push(`${quoteIdentifier(categoryColumn)} = $${values.length}`);
        }

        if (shouldUpdateColor && cardColorColumn) {
          values.push(nextColor);
          setClauses.push(`${quoteIdentifier(cardColorColumn)} = $${values.length}`);
        }

        if (updatedAtColumn) {
          setClauses.push(`${quoteIdentifier(updatedAtColumn)} = NOW()`);
        }

        values.push(row[idColumn]);
        await pool.query(
          `
            UPDATE activities
            SET ${setClauses.join(", ")}
            WHERE ${quoteIdentifier(idColumn)} = $${values.length}
          `,
          values
        );

        repaired += 1;
        if (samples.length < 25) {
          samples.push({
            id: String(row[idColumn] || ""),
            beforeCategory: currentCategory || "",
            afterCategory: nextCategory,
            beforeColor: currentColor || "",
            afterColor: shouldUpdateColor ? nextColor : currentColor || nextColor
          });
        }
      } catch (rowError) {
        if (failures.length < 25) {
          failures.push({
            id: String(row[idColumn] || ""),
            categoryAttempted: nextCategory,
            detail: String(rowError?.message || "unknown error")
          });
        }
      }
    }

    res.status(200).json({
      ok: true,
      dryRun: false,
      hasDatabase: true,
      scanned: rows.length,
      repaired,
      unchanged: Math.max(0, rows.length - repaired),
      failed: failures.length,
      samples,
      failures
    });
  } catch (error) {
    console.error("[admin-repair-activity-categories]", error);
    res.status(500).json({
      error: "Could not repair activity categories.",
      detail: String(error?.message || "unknown error")
    });
  }
});

app.post("/api/admin/assessment-standard-cards", requireAdminAccess, async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestEmail = normalizeEmail(getRequestUserEmail(req));
  const courseName = String(body.course_name || body.courseName || "").trim();
  const yearLevel = String(body.year_level || body.yearLevel || "").trim();
  const yearVersion = Number.parseInt(body.year_version ?? body.yearVersion ?? body.year, 10);
  const creditsRaw = Number.parseInt(body.credits, 10);
  const credits = Number.isInteger(creditsRaw) && creditsRaw >= 0 ? creditsRaw : null;
  const standardCodes = normalizeStandardCodeList(body.standard_codes || body.standardCodes);
  const achievedText = String(body.achieved_text || body.achievedText || "").trim();
  const meritText = String(body.merit_text || body.meritText || "").trim();
  const excellenceText = String(body.excellence_text || body.excellenceText || "").trim();
  const achievedChecklist = normalizeArray(body.achieved_checklist || body.achievedChecklist);
  const meritChecklist = normalizeArray(body.merit_checklist || body.meritChecklist);
  const excellenceChecklist = normalizeArray(body.excellence_checklist || body.excellenceChecklist);
  const isActive = body.is_active === false || body.isActive === false ? false : true;

  if (!courseName) {
    res.status(400).json({ error: "course_name is required" });
    return;
  }
  if (!yearLevel) {
    res.status(400).json({ error: "year_level is required" });
    return;
  }
  if (!Number.isInteger(yearVersion)) {
    res.status(400).json({ error: "year_version must be an integer" });
    return;
  }
  if (!standardCodes.length) {
    res.status(400).json({ error: "At least one standard code is required" });
    return;
  }

  const firstCode = String(standardCodes[0] || "").trim();
  const generatedId = slugify(`${courseName}-${yearLevel}-${yearVersion}-${firstCode}`) || `standard-card-${Date.now()}`;
  const id = String(body.id || generatedId).trim();

  if (!hasDatabase) {
    const nowIso = new Date().toISOString();
    const existing = normalizeAssessmentStandardCardRow(memoryAssessmentStandardCards.get(id) || {});
    const row = normalizeAssessmentStandardCardRow({
      id,
      course_name: courseName,
      year_level: yearLevel,
      year_version: yearVersion,
      credits,
      standard_codes: standardCodes,
      achieved_text: achievedText,
      merit_text: meritText,
      excellence_text: excellenceText,
      achieved_checklist: achievedChecklist,
      merit_checklist: meritChecklist,
      excellence_checklist: excellenceChecklist,
      is_active: isActive,
      created_by_email: existing.created_by_email || requestEmail,
      updated_by_email: requestEmail,
      created_at: existing.created_at || nowIso,
      updated_at: nowIso
    });
    memoryAssessmentStandardCards.set(id, row);
    res.status(201).json({ ok: true, card: row });
    return;
  }

  try {
    await ensureAssessmentStandardCardsSchema();
    const result = await pool.query(
      `
        INSERT INTO assessment_standard_cards (
          id,
          course_name,
          year_level,
          year_version,
          credits,
          standard_codes,
          achieved_text,
          merit_text,
          excellence_text,
          achieved_checklist,
          merit_checklist,
          excellence_checklist,
          card_color,
          is_active,
          created_by_email,
          updated_by_email,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11::jsonb,
          $12::jsonb,
          'Teal',
          $13,
          $14,
          $15,
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          course_name = EXCLUDED.course_name,
          year_level = EXCLUDED.year_level,
          year_version = EXCLUDED.year_version,
          credits = EXCLUDED.credits,
          standard_codes = EXCLUDED.standard_codes,
          achieved_text = EXCLUDED.achieved_text,
          merit_text = EXCLUDED.merit_text,
          excellence_text = EXCLUDED.excellence_text,
          achieved_checklist = EXCLUDED.achieved_checklist,
          merit_checklist = EXCLUDED.merit_checklist,
          excellence_checklist = EXCLUDED.excellence_checklist,
          card_color = 'Teal',
          is_active = EXCLUDED.is_active,
          updated_by_email = EXCLUDED.updated_by_email,
          updated_at = NOW()
        RETURNING *
      `,
      [
        id,
        courseName,
        yearLevel,
        yearVersion,
        credits,
        JSON.stringify(standardCodes),
        achievedText,
        meritText,
        excellenceText,
        JSON.stringify(achievedChecklist),
        JSON.stringify(meritChecklist),
        JSON.stringify(excellenceChecklist),
        isActive,
        requestEmail,
        requestEmail
      ]
    );

    res.status(201).json({ ok: true, card: normalizeAssessmentStandardCardRow(result.rows[0] || {}) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save Assessment Standard Card" });
  }
});

app.delete("/api/admin/assessment-standard-cards/:id", requireAdminAccess, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  if (!hasDatabase) {
    const existed = memoryAssessmentStandardCards.delete(id);
    res.json({ ok: true, deleted: existed ? 1 : 0 });
    return;
  }

  try {
    await ensureAssessmentStandardCardsSchema();
    const result = await pool.query(`DELETE FROM assessment_standard_cards WHERE id = $1`, [id]);
    res.json({ ok: true, deleted: Number(result.rowCount) || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not delete Assessment Standard Card" });
  }
});

app.get("/api/assessment-standard-cards/match", requireActivityWriteAccess, async (req, res) => {
  const standardCode = String(req.query?.standard || "").trim();
  const yearLevel = String(req.query?.year_level || req.query?.yearLevel || "").trim();
  const courseName = String(req.query?.course_name || req.query?.courseName || "").trim();
  const yearVersionRaw = Number.parseInt(req.query?.year || req.query?.year_version || req.query?.yearVersion, 10);

  if (!standardCode) {
    res.status(400).json({ error: "standard is required" });
    return;
  }

  if (!hasDatabase) {
    const match = pickBestAssessmentStandardCardMatch(
      Array.from(memoryAssessmentStandardCards.values()),
      {
        standardCode,
        yearLevel,
        courseName,
        yearVersion: Number.isInteger(yearVersionRaw) ? yearVersionRaw : null
      }
    );

    res.json({ matched: Boolean(match), card: match || null });
    return;
  }

  try {
    await ensureAssessmentStandardCardsSchema();
    const result = await pool.query(
      `
        SELECT *
        FROM assessment_standard_cards
        WHERE is_active = TRUE
        ORDER BY updated_at DESC
      `
    );

    const match = pickBestAssessmentStandardCardMatch(result.rows, {
      standardCode,
      yearLevel,
      courseName,
      yearVersion: Number.isInteger(yearVersionRaw) ? yearVersionRaw : null
    });

    res.json({ matched: Boolean(match), card: match || null });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not match Assessment Standard Card" });
  }
});

// ─── Course Outlines ────────────────────────────────────────────────────────

const memoryCourseOutlines = new Map();

function normalizeCourseOutlineRow(row) {
  if (!row || typeof row !== "object") return null;
  const standards = Array.isArray(row.standards)
    ? row.standards
    : (() => { try { return JSON.parse(row.standards || "[]"); } catch (_) { return []; } })();
  return {
    id: String(row.id || ""),
    course_name: String(row.course_name || ""),
    year_level: String(row.year_level || ""),
    year_version: Number.parseInt(row.year_version, 10) || 0,
    subject_stream: String(row.subject_stream || ""),
    summary: String(row.summary || ""),
    card_color: String(row.card_color || "Teal"),
    standards: standards.map((s) => ({
      standardLabel: String(s?.standardLabel || ""),
      achieved: String(s?.achieved || ""),
      merit: String(s?.merit || ""),
      excellence: String(s?.excellence || "")
    })),
    is_active: row.is_active !== false,
    created_by_email: String(row.created_by_email || ""),
    updated_by_email: String(row.updated_by_email || ""),
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

app.get("/api/course-outlines", requireActivityWriteAccess, async (req, res) => {
  if (!hasDatabase) {
    const rows = Array.from(memoryCourseOutlines.values())
      .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    res.json({ count: rows.length, outlines: rows });
    return;
  }

  try {
    await ensureCourseOutlinesSchema();
    const result = await pool.query(
      `SELECT * FROM course_outlines WHERE is_active = TRUE ORDER BY updated_at DESC`
    );
    const outlines = result.rows.map((row) => normalizeCourseOutlineRow(row));
    res.json({ count: outlines.length, outlines });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Course Outlines" });
  }
});

app.post("/api/course-outlines", requireActivityWriteAccess, async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestEmail = normalizeEmail(getRequestUserEmail(req));
  const courseName = String(body.course_name || body.courseName || "").trim();
  const yearLevel = String(body.year_level || body.yearLevel || "").trim();
  const yearVersion = Number.parseInt(body.year_version ?? body.yearVersion ?? body.year, 10);
  const subjectStream = String(body.subject_stream || body.subjectStream || "").trim();
  const summary = String(body.summary || "").trim();
  const rawStandards = Array.isArray(body.standards) ? body.standards : [];
  const standards = rawStandards.map((s) => ({
    standardLabel: String(s?.standardLabel || "").trim(),
    achieved: String(s?.achieved || "").trim(),
    merit: String(s?.merit || "").trim(),
    excellence: String(s?.excellence || "").trim()
  })).filter((s) => s.standardLabel);

  if (!courseName) { res.status(400).json({ error: "course_name is required" }); return; }
  if (!yearLevel) { res.status(400).json({ error: "year_level is required" }); return; }
  if (!Number.isInteger(yearVersion)) { res.status(400).json({ error: "year_version must be an integer" }); return; }

  const generatedId = slugify(`${courseName}-${yearLevel}-${yearVersion}`) || `course-outline-${Date.now()}`;
  const id = String(body.id || generatedId).trim();

  if (!hasDatabase) {
    const nowIso = new Date().toISOString();
    const existing = memoryCourseOutlines.get(id) || {};
    const row = normalizeCourseOutlineRow({
      id,
      course_name: courseName,
      year_level: yearLevel,
      year_version: yearVersion,
      subject_stream: subjectStream,
      summary,
      card_color: "Teal",
      standards,
      is_active: true,
      created_by_email: existing.created_by_email || requestEmail,
      updated_by_email: requestEmail,
      created_at: existing.created_at || nowIso,
      updated_at: nowIso
    });
    memoryCourseOutlines.set(id, row);
    res.status(201).json({ ok: true, outline: row });
    return;
  }

  try {
    await ensureCourseOutlinesSchema();
    const result = await pool.query(
      `
        INSERT INTO course_outlines (
          id, course_name, year_level, year_version, subject_stream,
          summary, card_color, standards, is_active,
          created_by_email, updated_by_email, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,'Teal',$7::jsonb,$8,$9,$10,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          course_name = EXCLUDED.course_name,
          year_level = EXCLUDED.year_level,
          year_version = EXCLUDED.year_version,
          subject_stream = EXCLUDED.subject_stream,
          summary = EXCLUDED.summary,
          card_color = 'Teal',
          standards = EXCLUDED.standards,
          updated_by_email = EXCLUDED.updated_by_email,
          updated_at = NOW()
        RETURNING *
      `,
      [id, courseName, yearLevel, yearVersion, subjectStream, summary,
       JSON.stringify(standards), true, requestEmail, requestEmail]
    );

    const savedOutline = normalizeCourseOutlineRow(result.rows[0] || {});

    // Sync each standard entry to assessment_standard_cards for auto-populate.
    await ensureAssessmentStandardCardsSchema();
    for (const s of standards) {
      const codeMatch = String(s.standardLabel || "").match(/\b(\d{5})\b/);
      if (!codeMatch) continue;
      const code = codeMatch[1];
      const cardId = slugify(`${courseName}-${yearLevel}-${yearVersion}-${code}`) || `card-${code}-${Date.now()}`;
      await pool.query(
        `
          INSERT INTO assessment_standard_cards (
            id, course_name, year_level, year_version, standard_codes,
            achieved_text, merit_text, excellence_text,
            achieved_checklist, merit_checklist, excellence_checklist,
            card_color, is_active, created_by_email, updated_by_email, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'Teal',TRUE,$9,$10,NOW(),NOW())
          ON CONFLICT (id) DO UPDATE SET
            course_name = EXCLUDED.course_name,
            year_level = EXCLUDED.year_level,
            year_version = EXCLUDED.year_version,
            standard_codes = EXCLUDED.standard_codes,
            achieved_text = EXCLUDED.achieved_text,
            merit_text = EXCLUDED.merit_text,
            excellence_text = EXCLUDED.excellence_text,
            card_color = 'Teal',
            updated_by_email = EXCLUDED.updated_by_email,
            updated_at = NOW()
        `,
        [cardId, courseName, yearLevel, yearVersion, JSON.stringify([code]),
         s.achieved, s.merit, s.excellence, requestEmail, requestEmail]
      );
    }

    res.status(201).json({ ok: true, outline: savedOutline });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save Course Outline" });
  }
});

app.post("/api/staff_upload", async (req, res) => {
  const headers = Array.isArray(req.body?.headers) ? req.body.headers : [];
  const staffRows = Array.isArray(req.body?.staff) ? req.body.staff : [];
  const uploadYear = Number.parseInt(req.body?.uploadYear ?? req.body?.upload_year, 10) || null;
  const uploadTerm = String(req.body?.uploadTerm ?? req.body?.upload_term ?? "").trim();
  const uploadDate = String(req.body?.uploadDate ?? req.body?.upload_date ?? "").trim();

  if (!headers.length || !staffRows.length) {
    res.status(400).json({ error: "headers and staff rows are required" });
    return;
  }

  const dedupedRows = new Map();
  let skippedNoEmail = 0;
  let duplicateEmailsInUpload = 0;

  staffRows.forEach((row) => {
    const record = buildStaffUploadRecord(headers, row, {
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });

    if (!record.email_school) {
      skippedNoEmail += 1;
      return;
    }

    if (dedupedRows.has(record.email_school)) {
      duplicateEmailsInUpload += 1;
    }

    dedupedRows.set(record.email_school, record);
  });

  const normalizedRows = Array.from(dedupedRows.values());

  if (!normalizedRows.length) {
    res.json({
      success: true,
      processed: staffRows.length,
      inserted: 0,
      updated: 0,
      marked_not_current: 0,
      skipped_no_email: skippedNoEmail,
      duplicate_emails_in_upload: duplicateEmailsInUpload,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
    return;
  }

  if (!hasDatabase) {
    upsertMemoryStaffRows(normalizedRows);
    res.json({
      success: true,
      processed: staffRows.length,
      inserted: normalizedRows.length,
      updated: 0,
      marked_not_current: 0,
      skipped_no_email: skippedNoEmail,
      duplicate_emails_in_upload: duplicateEmailsInUpload,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const staffTableName = await resolveStaffTableName();

    let inserted = 0;
    let updated = 0;

    for (const row of normalizedRows) {
      const existing = await client.query(
        `SELECT id FROM ${staffTableName} WHERE LOWER(email_school) = LOWER($1) LIMIT 1`,
        [row.email_school]
      );

      if (existing.rows.length) {
        await client.query(
          `
            UPDATE ${staffTableName}
            SET code = $2,
                last_name = $3,
                first_name = $4,
                title = $5,
                status = $6,
                primary_role = $7,
                upload_year = $8,
                upload_term = $9,
                upload_date = $10,
                updated_at = NOW()
            WHERE id = $1
          `,
          [
            existing.rows[0].id,
            row.code,
            row.last_name,
            row.first_name,
            row.title,
            row.status,
            row.primary_role,
            row.upload_year,
            row.upload_term,
            row.upload_date
          ]
        );
        updated += 1;
      } else {
        await client.query(
          `
            INSERT INTO ${staffTableName} (
              code, last_name, first_name, title, email_school, status,
              primary_role, upload_year, upload_term, upload_date, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, NOW()
            )
          `,
          [
            row.code,
            row.last_name,
            row.first_name,
            row.title,
            row.email_school,
            row.status,
            row.primary_role,
            row.upload_year,
            row.upload_term,
            row.upload_date
          ]
        );
        inserted += 1;
      }
    }

    const currentEmails = normalizedRows.map((row) => row.email_school);
    const markNotCurrentResult = await client.query(
      `
        UPDATE ${staffTableName}
        SET status = 'Not Current', updated_at = NOW()
        WHERE COALESCE(email_school, '') <> ''
          AND LOWER(email_school) <> ALL($1::text[])
          AND COALESCE(status, 'Current') <> 'Not Current'
      `,
      [currentEmails]
    );

    await client.query("COMMIT");
    res.json({
      success: true,
      processed: staffRows.length,
      inserted,
      updated,
      marked_not_current: markNotCurrentResult.rowCount || 0,
      skipped_no_email: skippedNoEmail,
      duplicate_emails_in_upload: duplicateEmailsInUpload,
      upload_year: uploadYear,
      upload_term: uploadTerm,
      upload_date: uploadDate
    });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Could not import staff upload data" });
  } finally {
    client.release();
  }
});

app.get("/api/admin/staff-list", async (_req, res) => {
  try {
    const rows = await getStaffDirectoryRows();
    res.json(rows);
  } catch (_error) {
    res.json([]);
  }
});

app.get("/api/staff_upload/all", async (_req, res) => {
  try {
    const rows = await getStaffDirectoryRows();
    res.json({ staff: rows });
  } catch (_error) {
    res.json({ staff: [] });
  }
});

app.get("/api/student_timetable/all", async (_req, res) => {
  try {
    const rows = await getStudentDirectoryRows();
    res.json({ students: rows });
  } catch (_error) {
    res.json({ students: [] });
  }
});

app.get("/api/timetable/all", async (_req, res) => {
  try {
    const rows = await getTeacherTimetableRows();
    res.json({ timetable: rows });
  } catch (_error) {
    res.json({ timetable: [] });
  }
});

app.get("/api/class-management/students", async (req, res) => {
  const userEmail = getRequestUserEmail(req);
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  try {
    const rows = await getStudentDirectoryRows();
    const normalizedRows = dedupeToLatestStudentRows(rows.map(buildStudentClassManagementRow));
    const currentOnly = String(req.query?.current_only || "true").toLowerCase() !== "false";
    const dtechOnly = String(req.query?.dtech_only || "false").toLowerCase() === "true";

    const filteredRows = normalizedRows.filter((row) => {
      if (currentOnly && String(row.status || "").toLowerCase() === "not current") {
        return false;
      }
      if (dtechOnly && !row.has_dtech) {
        return false;
      }
      return true;
    });

    res.json({
      students: filteredRows,
      summary: {
        total_students: filteredRows.length,
        dtech_students: filteredRows.filter((row) => row.has_dtech).length,
        current_only: currentOnly,
        dtech_only: dtechOnly
      }
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not load class management students" });
  }
});

app.get("/api/class-management/freshness-config", async (req, res) => {
  const userEmail = getRequestUserEmail(req);
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  res.json({
    aging_days: CLASS_DATA_AGING_DAYS,
    stale_days: CLASS_DATA_STALE_DAYS
  });
});

app.get("/api/practicals/events", async (_req, res) => {
  try {
    const rows = await listPracticalEvents();
    res.json(rows);
  } catch (_error) {
    res.status(500).json({ error: "Could not load practical events" });
  }
});

app.get("/api/practical-skills/library", async (_req, res) => {
  try {
    const rows = await readPracticalSkillsLibraryFile();
    res.json(rows);
  } catch (_error) {
    res.status(500).json({ error: "Could not load Practical Skills library" });
  }
});

app.get("/api/admin/practical-skills/preview-users", requireAdminAccess, async (_req, res) => {
  try {
    const [studentRows, staffRows] = await Promise.all([getStudentDirectoryRows(), getStaffDirectoryRows()]);
    const students = dedupeToLatestStudentRows(studentRows.map(buildStudentClassManagementRow))
      .filter((row) => String(row.status || "").toLowerCase() !== "not current")
      .map((row, index) => ({
        id: `student-${index}`,
        type: "Student",
        name: row.student_name,
        email: row.linked_emails[0] || "",
        yearLevel: row.year_level,
        homeroom: row.form_class,
        course: getResearchReportProgrammeFolder(getHuntProfile(row)) || ""
      }));
    const staffByEmail = new Map();
    staffRows.forEach((row, index) => {
      const lower = buildLowerKeyMap(row);
      const email = collectDirectoryEmails(row, ["email_school", "email", "user_email", "staff_email", "google_email"])[0] || "";
      const name = pickRowValue(lower, ["display_name", "staff_name", "full_name", "name"])
        || [pickRowValue(lower, ["first_name", "first name"]), pickRowValue(lower, ["last_name", "last name"])].filter(Boolean).join(" ")
        || email || "Unnamed staff member";
      staffByEmail.set(email || `staff-${index}`, {
        id: `staff-${index}`, type: "Staff", name, email, yearLevel: "", homeroom: "", course: ""
      });
    });
    const users = [...students, ...staffByEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
    res.set("Cache-Control", "no-store");
    res.json({ users });
  } catch (error) {
    console.error("Could not load Licence Library preview users", error);
    res.status(500).json({ error: "Could not load students and staff for the library preview." });
  }
});

app.get("/api/admin/practical-skills/library", requireAdminAccess, async (_req, res) => {
  try {
    const rows = await readPracticalSkillsLibraryFile();
    res.json({ cards: rows });
  } catch (_error) {
    res.status(500).json({ error: "Could not load Practical Skills library" });
  }
});

app.put("/api/admin/practical-skills/library", requireAdminAccess, async (req, res) => {
  const cards = Array.isArray(req.body?.cards) ? req.body.cards : null;
  if (!cards) {
    res.status(400).json({ error: "cards array is required" });
    return;
  }

  try {
    const saved = await writePracticalSkillsLibraryFile(cards);
    res.status(200).json({ ok: true, cards: saved, count: saved.length });
  } catch (_error) {
    res.status(500).json({ error: "Could not save Practical Skills library" });
  }
});

async function syncPracticalSkillsKitCompletion(studentEmail, kitId, content = null) {
  const kitContent = content || await getStoredPracticalSkillsKitContent(kitId);
  const indexes = visibleActivityIndexes(kitContent);
  const row = await ensurePracticalSkillsProgressRow(studentEmail, kitId);
  if (!row) throw new Error("Kit progress could not be loaded.");
  if (!indexes.length) return row;
  if (!hasDatabase) {
    const completed = allActivitiesComplete(kitContent, row);
    const next = {
      ...row, completed,
      completed_at: completed ? row.completed_at || new Date().toISOString() : null
    };
    memoryPracticalSkillsProgress.set(`${normalizeEmail(studentEmail)}:${kitId}`, next);
    return next;
  }
  const ready = "(SELECT bool_and(COALESCE(completed_activities ->> activity_key, '') <> '') FROM unnest($3::text[]) AS activity_key)";
  const result = await pool.query(
    `UPDATE practical_skills_progress
     SET completed = ${ready},
         completed_at = CASE WHEN ${ready} THEN COALESCE(completed_at, NOW()) ELSE NULL END,
         updated_at = CASE WHEN completed IS DISTINCT FROM ${ready} THEN NOW() ELSE updated_at END
     WHERE student_email = $1 AND kit_id = $2 RETURNING *`,
    [normalizeEmail(studentEmail), kitId, indexes]
  );
  if (!result.rows?.[0]) throw new Error("Kit completion could not be saved.");
  return result.rows[0];
}

async function getPracticalSkillsCertificate(req, kitId) {
  const email = normalizeEmail(getRequestUserEmail(req));
  const content = await getStoredPracticalSkillsKitContent(kitId);
  const row = await syncPracticalSkillsKitCompletion(email, kitId, content);
  const name = row.completed ? await getPracticalSkillsStudentName(req) : email;
  return buildKitCertificate(content, row, name);
}

async function getPracticalSkillsStudentName(req) {
  const email = normalizeEmail(getRequestUserEmail(req));
  const identity = req.auth_identity;
  const verifiedName = identity?.verified && normalizeEmail(identity.email) === email
    && identity.givenName && identity.familyName
    ? `${identity.givenName} ${identity.familyName}`.trim() : "";
  let schoolName = "";
  if (!verifiedName) {
    const staff = (await getStaffDirectoryRows()).find((entry) =>
      collectDirectoryEmails(entry, ["email_school", "email", "user_email", "staff_email", "google_email"]).includes(email));
    if (staff) schoolName = [staff.first_name, staff.last_name].filter(Boolean).join(" ").trim();
    if (!schoolName) {
      const students = dedupeToLatestStudentRows((await getStudentDirectoryRows()).map(buildStudentClassManagementRow));
      const student = students.find((entry) => entry.linked_emails.some((value) => normalizeEmail(value) === email));
      if (student && student.student_name !== "Unnamed student") schoolName = student.student_name;
    }
  }
  return verifiedName || schoolName || email;
}

app.get("/api/practical-skills/my-progress", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }

  try {
    await Promise.all(PRACTICAL_SKILLS_KIT_DEFINITIONS.map((kit) => ensurePracticalSkillsProgressRow(studentEmail, kit.id)));
    await refreshLearningSitesCheckIn(studentEmail);
    await Promise.all(PRACTICAL_SKILLS_KIT_DEFINITIONS.map((kit) => syncPracticalSkillsKitCompletion(studentEmail, kit.id)));
    const rows = await getAllPracticalSkillsProgressRows(studentEmail);
    res.json({ ...computePracticalSkillsSnapshot(rows), student: { name: await getPracticalSkillsStudentName(req), email: studentEmail } });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Practical Skills progress." });
  }
});

app.post("/api/practical-skills/progress/:kitId/complete", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }

  try {
    const content = await getStoredPracticalSkillsKitContent(kitId);
    const row = await syncPracticalSkillsKitCompletion(studentEmail, kitId, content);
    if (visibleActivityIndexes(content).length && !allActivitiesComplete(content, row)) {
      return res.status(409).json({ error: "Complete all visible activities to earn this kit." });
    }
    await setPracticalSkillsKitCompletion(studentEmail, kitId, true);
    void autoEmailKitCertificate(req, kitId);
    const rows = await getAllPracticalSkillsProgressRows(studentEmail);
    res.json(computePracticalSkillsSnapshot(rows));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save Practical Skills progress." });
  }
});

app.post("/api/practical-skills/progress/:kitId/reset", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }

  try {
    await setPracticalSkillsKitCompletion(studentEmail, kitId, false);
    const rows = await getAllPracticalSkillsProgressRows(studentEmail);
    res.json(computePracticalSkillsSnapshot(rows));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not reset Practical Skills progress." });
  }
});

app.get("/api/practical-skills/progress/:kitId", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }

  try {
    const courseCheckIn = kitId === "kit-login" && await refreshLearningSitesCheckIn(studentEmail);
    const certificate = await getPracticalSkillsCertificate(req, kitId);
    const certificateEmailed = await autoEmailKitCertificate(req, kitId, certificate);
    const rows = await getAllPracticalSkillsProgressRows(studentEmail);
    const snapshot = computePracticalSkillsSnapshot(rows);
    const row = rows.find((entry) => String(entry?.kit_id || "").trim() === kitId);
    res.json({
      kit: snapshot.kits.find((entry) => entry.id === kitId) || null,
      badges: snapshot.badges,
      responses: row?.responses && typeof row.responses === "object" ? row.responses : {},
      completedActivities: row?.completed_activities || {},
      certificate,
      certificateEmailed,
      courseCheckIn
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load kit progress." });
  }
});

const certificateEmailCooldowns = new Map();

async function sendKitCertificateEmail(studentEmail, kitId, certificate) {
  const buffer = await createKitCertificatePdf(certificate);
  const safe = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const teacherRecipients = (await getPracticalSkillsCertificateTeacherRecipients())
    .filter((email) => email !== normalizeEmail(studentEmail));
  await sendConfiguredHubEmail({
    to: studentEmail,
    cc: teacherRecipients,
    subject: `[DTECH HUB] ${certificate.kitTitle} - Certificate of Completion`,
    html: `<div style="font-family:Arial,sans-serif;color:#173858;"><h2>Certificate of Completion</h2><p>Kia ora ${safe(certificate.studentName)},</p><p>Ka pai! You completed all ${certificate.activityCount} activities in <strong>${safe(certificate.kitTitle)}</strong> on ${safe(certificate.completedDate)}.</p><p>Your landscape PDF certificate is attached. You can save, print or forward it to share your achievement.</p><p>${safe(certificate.issuer)}</p></div>`,
    attachment: { buffer, originalname: `${kitId}-certificate.pdf`, mimetype: "application/pdf" },
    emailType: "kit_certificate"
  });
}

// Claims the one automatic certificate email for a completed kit so concurrent requests cannot send it twice.
async function claimKitCertificateAutoEmail(studentEmail, kitId, claim = true) {
  const email = normalizeEmail(studentEmail);
  if (!hasDatabase) {
    const row = memoryPracticalSkillsProgress.get(`${email}:${kitId}`);
    if (!row) return false;
    if (!claim) { row.certificate_emailed_at = null; return true; }
    if (!row.completed || row.certificate_emailed_at) return false;
    row.certificate_emailed_at = new Date().toISOString();
    return true;
  }
  await ensurePracticalSkillsProgressSchema();
  const result = claim
    ? await pool.query(`UPDATE practical_skills_progress SET certificate_emailed_at = NOW()
        WHERE student_email = $1 AND kit_id = $2 AND completed = TRUE AND certificate_emailed_at IS NULL RETURNING kit_id`, [email, kitId])
    : await pool.query(`UPDATE practical_skills_progress SET certificate_emailed_at = NULL WHERE student_email = $1 AND kit_id = $2 RETURNING kit_id`, [email, kitId]);
  return Boolean(result.rows?.[0]);
}

// Emails the certificate the first time a kit is completed. Never throws; returns true when an email was sent.
async function autoEmailKitCertificate(req, kitId, certificate = undefined) {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  try {
    if (!studentEmail || !smtpTransporter || !SMTP_FROM) return false;
    const ready = certificate === undefined ? await getPracticalSkillsCertificate(req, kitId) : certificate;
    if (!ready || !await claimKitCertificateAutoEmail(studentEmail, kitId)) return false;
    try {
      await sendKitCertificateEmail(studentEmail, kitId, ready);
      return true;
    } catch (error) {
      await claimKitCertificateAutoEmail(studentEmail, kitId, false).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("[kit-certificate-email] Could not automatically email certificate:", error);
    return false;
  }
}

app.get("/api/practical-skills/progress/:kitId/certificate.pdf", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) return res.status(401).json({ error: "School sign-in required." });
  if (!getPracticalSkillsKitDefinition(kitId)) return res.status(404).json({ error: "Unknown kit." });
  try {
    const certificate = await getPracticalSkillsCertificate(req, kitId);
    if (!certificate) return res.status(409).json({ error: "Complete all visible activities before downloading your certificate." });
    const buffer = await createKitCertificatePdf(certificate);
    res.set("Cache-Control", "private, no-store");
    res.type("application/pdf").attachment(`${kitId}-certificate.pdf`).send(buffer);
  } catch (error) {
    console.error("[kit-certificate] Could not generate certificate:", error);
    res.status(500).json({ error: "Could not generate your certificate. Please try again." });
  }
});

app.post("/api/practical-skills/progress/:kitId/certificate/email", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) return res.status(401).json({ error: "School sign-in required." });
  if (!getPracticalSkillsKitDefinition(kitId)) return res.status(404).json({ error: "Unknown kit." });
  if (!smtpTransporter || !SMTP_FROM) return res.status(503).json({ error: "Email is not configured on the hub. You can still download or print your certificate." });
  const key = `${studentEmail}:${kitId}`;
  for (const [entry, expires] of certificateEmailCooldowns) {
    if (expires <= Date.now()) certificateEmailCooldowns.delete(entry);
  }
  if (certificateEmailCooldowns.has(key)) return res.status(429).json({ error: "Please wait a minute before emailing another copy." });
  certificateEmailCooldowns.set(key, Date.now() + 60000);
  try {
    const certificate = await getPracticalSkillsCertificate(req, kitId);
    if (!certificate) {
      certificateEmailCooldowns.delete(key);
      return res.status(409).json({ error: "Complete all visible activities before emailing your certificate." });
    }
    await sendKitCertificateEmail(studentEmail, kitId, certificate);
    await claimKitCertificateAutoEmail(studentEmail, kitId).catch(() => false);
    res.json({ sent: true, recipient: studentEmail });
  } catch (error) {
    certificateEmailCooldowns.delete(key);
    console.error("[kit-certificate-email] Could not email certificate:", error);
    res.status(500).json({ error: getHubEmailErrorMessage(error) });
  }
});

app.post("/api/practical-skills/progress/:kitId/responses", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }

  try {
    const saved = await savePracticalSkillsKitResponses(studentEmail, kitId, req.body?.responses);
    res.json({ ok: true, responses: saved?.responses || {} });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save responses." });
  }
});

app.put("/api/practical-skills/progress/:kitId/activities/:activityIndex", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }
  const activityIndex = Number(req.params.activityIndex);
  if (!/^\d+$/.test(req.params.activityIndex) || !Number.isSafeInteger(activityIndex) || typeof req.body?.completed !== "boolean") {
    res.status(400).json({ error: "A valid activity index and completion state are required." });
    return;
  }

  try {
    const content = await getPracticalSkillsKitContent(kitId);
    if (!Array.isArray(content?.worksheets) || !content.worksheets[activityIndex]) {
      res.status(404).json({ error: "Unknown activity." });
      return;
    }
    if (content.worksheets[activityIndex].mergedInto !== undefined) {
      res.status(409).json({ error: "This activity is now part of Sign In - Google, Microsoft & Your Drives. Open it from the kit menu." });
      return;
    }
    const activity = content.activities?.[activityIndex];
    const siteQuestions = req.body.completed && activity?.loginSites &&
      visibleLoginSites(activity.loginSites, await getLearningSitesStudentProfile(studentEmail)).some((site) => site.readinessQuestion);
    if (req.body.completed && (activity?.assessmentId || activity?.identityLessonVersion ||
        activity?.questionAutoMarkAssessmentId || activity?.researchReport || siteQuestions)) {
      res.status(409).json({ error: "Complete the activity tasks, then check your answers to earn this activity tick." });
      return;
    }
    const saved = await setPracticalSkillsActivityCompletion(studentEmail, kitId, activityIndex, req.body.completed);
    await syncPracticalSkillsKitCompletion(studentEmail, kitId, content);
    void autoEmailKitCertificate(req, kitId);
    res.json({ completedActivities: saved.completed_activities });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save activity completion." });
  }
});

async function getLearningSitesStudentProfile(email) {
  if (await canManagePracticalSchedule(email)) return getHuntProfile(null, { isStaff: true });
  const rows = (await getStudentDirectoryRows()).map(buildStudentClassManagementRow)
    .filter((row) => row.linked_emails.some((linkedEmail) => normalizeEmail(linkedEmail) === email));
  if (new Set(rows.map(getStudentIdentityKey)).size > 1) {
    return { available: false, courseIds: [], message: "More than one student profile is linked to your account. Ask your teacher to check your profile before completing this hunt." };
  }
  const latest = rows.reduce((current, row) => !current || shouldReplaceStudentSnapshot(current, row) ? row : current, null);
  return getHuntProfile(latest?.status?.toLowerCase() === "not current" ? null : latest);
}

async function getSavedLearningSitesCheckIn(email) {
  const content = await getStoredPracticalSkillsKitContent("kit-login");
  const index = Array.isArray(content?.activities)
    ? content.activities.findIndex((activity) => activity?.assessmentId === LEARNING_SITES_ID) : -1;
  if (index < 0) return null;
  const row = (await getAllPracticalSkillsProgressRows(email)).find((entry) => String(entry?.kit_id || "").trim() === "kit-login");
  return {
    index, content,
    answers: row?.responses?.[`${index}-${LEARNING_SITES_ID}`] || {},
    completed: Boolean(row?.completed_activities?.[String(index)])
  };
}

// Yearly course check-in: reopens the Learning Sites activity when the student's directory year level changes.
// Only the activity tick and hunt answers are cleared; Drive folders and other kit progress are untouched.
async function refreshLearningSitesCheckIn(email) {
  try {
    const saved = await getSavedLearningSitesCheckIn(email);
    if (!saved?.completed) return false;
    const profile = await getLearningSitesStudentProfile(email);
    if (!needsCourseCheckIn(saved.answers, profile)) return false;
    await savePracticalSkillsAssessment(email, "kit-login", saved.index, {
      assessmentId: LEARNING_SITES_ID, passed: false,
      answers: { reopenedForYear: profile.year, previousCourse: saved.answers.course || "" }
    });
    await setPracticalSkillsActivityCompletion(email, "kit-login", saved.index, false);
    await syncPracticalSkillsKitCompletion(email, "kit-login", saved.content);
    return true;
  } catch (error) {
    console.error("[learning-sites] Could not refresh the yearly course check-in:", error);
    return false;
  }
}

const memoryStaffCoursePreferences = new Map();

async function getStaffCoursePreference(email) {
  if (!hasDatabase) return memoryStaffCoursePreferences.get(email) || "";
  await ensureStaffCoursePreferencesSchema();
  const result = await pool.query("SELECT course FROM practical_skills_staff_courses WHERE email = $1", [email]);
  return result.rows?.[0]?.course || "";
}

async function ensureStaffCoursePreferencesSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS practical_skills_staff_courses (
    email TEXT PRIMARY KEY, course TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

app.put("/api/admin/practical-skills/my-course", requireAdminAccess, async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  const course = req.body?.course;
  if (!["JuniorDTECH", "MiddleDTECH", "SeniorDTECH"].includes(course)) {
    res.status(400).json({ error: "Choose JuniorDTECH, MiddleDTECH or SeniorDTECH." });
    return;
  }
  try {
    const profile = await getLearningSitesStudentProfile(email);
    if (!profile.courseIds?.includes("STAFF")) {
      res.status(403).json({ error: "Only your own staff course can be changed here." });
      return;
    }
    if (hasDatabase) {
      await ensureStaffCoursePreferencesSchema();
      await pool.query(`INSERT INTO practical_skills_staff_courses (email, course)
        VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET course = EXCLUDED.course, updated_at = NOW()`, [email, course]);
    } else {
      memoryStaffCoursePreferences.set(email, course);
    }
    res.json({ course });
  } catch (error) {
    console.error("Could not save staff course", error);
    res.status(500).json({ error: "Could not save your course. Please try again." });
  }
});

function resolveSidebarCourse(profile, checkIn) {
  if (!profile?.available) return "";
  if (profile.courseIds?.includes("STAFF")) {
    return checkIn?.completed ? getCourseProgrammeFolder(checkIn.answers?.course) : "";
  }
  return getResearchReportProgrammeFolder(profile);
}

app.get("/api/practical-skills/my-course", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  try {
    const profile = await getLearningSitesStudentProfile(email);
    const savedCourse = profile.courseIds?.includes("STAFF") ? await getStaffCoursePreference(email) : "";
    const checkIn = !savedCourse && profile.courseIds?.includes("STAFF") ? await getSavedLearningSitesCheckIn(email) : null;
    res.set("Cache-Control", "no-store");
    res.json({ course: savedCourse || resolveSidebarCourse(profile, checkIn) });
  } catch (error) {
    console.error("Could not load sidebar course", error);
    res.status(500).json({ error: "Could not load your course." });
  }
});

app.get("/api/practical-skills/learning-sites/profile", async (req, res) => {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." }); return;
  }
  try {
    res.json(await getLearningSitesStudentProfile(email));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load your course profile." });
  }
});

app.post("/api/practical-skills/progress/:kitId/activities/:activityIndex/check", async (req, res) => {
  const studentEmail = normalizeEmail(getRequestUserEmail(req));
  const kitId = String(req.params.kitId || "").trim();
  const activityIndex = Number(req.params.activityIndex);
  if (!studentEmail || !studentEmail.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return;
  }
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }
  if (!/^\d+$/.test(req.params.activityIndex) || !Number.isSafeInteger(activityIndex) ||
      !req.body?.answers || typeof req.body.answers !== "object" || Array.isArray(req.body.answers)) {
    res.status(400).json({ error: "A valid activity index and answers are required." });
    return;
  }

  try {
    const content = await getStoredPracticalSkillsKitContent(kitId);
    const activity = content?.activities?.[activityIndex];
    const identityLesson = Boolean(activity?.identityLessonVersion);
    if (!content?.worksheets?.[activityIndex] || (!identityLesson && !activity?.loginSites &&
        !["search-penguin-missions-v1", "search-keyword-challenge-v1", SEARCH_RESULTS_DETECTIVE_ID, SEARCH_AND_FIND_ID].includes(activity?.questionAutoMarkAssessmentId) &&
        ![PASSWORD_PROBLEMS_ID, APPS_WORDSEARCH_ID, LEARNING_SITES_ID].includes(activity?.assessmentId))) {
      res.status(404).json({ error: "Unknown self-marking activity." });
      return;
    }
    if (identityLesson && !req.auth_identity?.verified) {
      res.status(401).json({ error: "Sign in again with Google so we can check your answers against your real school account." });
      return;
    }
    const grade = identityLesson
      ? gradeLoginIdentity(req.body.answers, { ...req.auth_identity, email: studentEmail }, activity.questions || [])
      : activity.loginSites
        ? gradeLoginSites(req.body.answers, visibleLoginSites(activity.loginSites, await getLearningSitesStudentProfile(studentEmail)))
        : activity.questionAutoMarkAssessmentId === "search-penguin-missions-v1"
          ? gradeSearchPenguinMissions(req.body.answers)
          : activity.questionAutoMarkAssessmentId === "search-keyword-challenge-v1"
            ? gradeSearchKeywordChallenge(req.body.answers, activityIndex)
            : activity.questionAutoMarkAssessmentId === SEARCH_RESULTS_DETECTIVE_ID
              ? gradeSearchResultsDetective(req.body.answers, activityIndex)
              : activity.questionAutoMarkAssessmentId === SEARCH_AND_FIND_ID
                ? gradeSearchAndFind(req.body.answers, activityIndex)
        : activity.assessmentId === APPS_WORDSEARCH_ID
        ? gradeAppsWordsearch(req.body.answers, Boolean((await getStudentLoginDriveSetup(studentEmail))?.folder_id))
        : activity.assessmentId === LEARNING_SITES_ID
          ? gradeLearningSites(req.body.answers, await getLearningSitesStudentProfile(studentEmail))
          : gradePasswordProblems(req.body.answers);
    const saved = await savePracticalSkillsAssessment(studentEmail, kitId, activityIndex, grade);
    await syncPracticalSkillsKitCompletion(studentEmail, kitId, content);
    void autoEmailKitCertificate(req, kitId);
    let courseFolder = null;
    let courseFolderError = "";
    if (grade.passed && activity.assessmentId === LEARNING_SITES_ID) {
      const programmeFolder = getCourseProgrammeFolder(grade.answers?.course);
      const driveAccessToken = String(req.body.driveAccessToken || "").trim();
      if (programmeFolder && driveAccessToken) {
        try {
          await verifyDriveTokenForStudent(driveAccessToken, studentEmail);
          const { programme, kits } = await ensureStudentCourseFolders(studentEmail, programmeFolder, driveAccessToken);
          courseFolder = { name: programmeFolder, url: `https://drive.google.com/drive/folders/${encodeURIComponent(programme.id)}`, kitsFolderId: kits.id };
        } catch (error) {
          console.error("[learning-sites] Could not create course folder:", error);
          courseFolderError = `Your tick is saved, but we couldn't create your ${programmeFolder} folder yet. It will be made when a kit needs it.`;
        }
      } else if (programmeFolder) {
        courseFolderError = `Your tick is saved. Your ${programmeFolder} folder will be made in WHS-DTECH when a kit needs it.`;
      }
    }
    res.json({ ...grade, completedActivities: saved.completed_activities, courseFolder, courseFolderError });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not check and save your activity." });
  }
});

async function ensureStudentKitDocumentsSchema() {
  if (!hasDatabase) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS student_kit_documents (
    student_email TEXT NOT NULL,
    kit_id TEXT NOT NULL,
    document_key TEXT NOT NULL,
    document_id TEXT NOT NULL,
    folder_id TEXT,
    template_id TEXT,
    template_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_email, kit_id, document_key)
  )`);
}

// Stored separately from kit progress so a kit reset never loses (or deletes) a student's Drive file.
async function getStudentKitDocument(email, kitId, documentKey) {
  const key = `${normalizeEmail(email)}:${kitId}:${documentKey}`;
  if (!hasDatabase) return memoryStudentKitDocuments.get(key) || null;
  await ensureStudentKitDocumentsSchema();
  const result = await pool.query(
    "SELECT document_id, folder_id, template_id, template_text FROM student_kit_documents WHERE student_email = $1 AND kit_id = $2 AND document_key = $3",
    [normalizeEmail(email), kitId, documentKey]);
  return result.rows?.[0] || null;
}

async function saveStudentKitDocument(email, kitId, documentKey, record) {
  const normalizedEmail = normalizeEmail(email);
  if (!hasDatabase) {
    memoryStudentKitDocuments.set(`${normalizedEmail}:${kitId}:${documentKey}`, { ...record });
    return;
  }
  await ensureStudentKitDocumentsSchema();
  await pool.query(`INSERT INTO student_kit_documents (student_email, kit_id, document_key, document_id, folder_id, template_id, template_text)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (student_email, kit_id, document_key) DO UPDATE SET document_id = EXCLUDED.document_id,
      folder_id = EXCLUDED.folder_id, template_id = EXCLUDED.template_id, template_text = EXCLUDED.template_text`,
  [normalizedEmail, kitId, documentKey, record.document_id, record.folder_id || null, record.template_id || null, record.template_text || null]);
}

function googleDocUrl(documentId) {
  return `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit`;
}

async function verifyDriveTokenForStudent(driveAccessToken, email) {
  const identityResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${driveAccessToken}` }
  });
  if (!identityResponse.ok) {
    const error = new Error("Google sign-in expired. Sign in again and retry.");
    error.status = 401;
    throw error;
  }
  const identity = await identityResponse.json();
  if (!identity.email_verified || normalizeEmail(identity.email) !== email) {
    const error = new Error("Choose the same school Google account as your DTECH-HUB sign-in.");
    error.status = 403;
    throw error;
  }
  return identity;
}

// Name and form class for the report header, from the student directory (Google account name as a fallback).
async function getResearchReportStudentDetails(email, googleName = "") {
  const rows = (await getStudentDirectoryRows()).map(buildStudentClassManagementRow)
    .filter((row) => row.linked_emails.some((linkedEmail) => normalizeEmail(linkedEmail) === email));
  const latest = rows.reduce((current, row) => !current || shouldReplaceStudentSnapshot(current, row) ? row : current, null);
  const directoryName = latest?.student_name && latest.student_name !== "Unnamed student" ? latest.student_name : "";
  return { studentName: directoryName || String(googleName || "").trim(), formClass: String(latest?.form_class || "").trim() };
}

async function fillGoogleDocPlaceholders(documentId, replacements, accessToken) {
  if (!replacements.length) return false;
  const response = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: replacements.map(({ placeholder, value }) => ({
        replaceAllText: { containsText: { text: placeholder, matchCase: true }, replaceText: value }
      }))
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    console.warn("Research report details could not be filled in:", payload?.error?.message || response.status);
    return false;
  }
  return true;
}

async function driveGetLiveFile(fileId, accessToken) {
  if (!fileId) return null;
  try {
    const file = await driveApiRequest(`/files/${encodeURIComponent(fileId)}`, {
      accessToken, queryParams: { fields: "id,name,trashed,mimeType", supportsAllDrives: true }
    });
    return file?.id && !file.trashed ? file : null;
  } catch (error) {
    if (error.status === 404 || error.status === 403) return null;
    throw error;
  }
}

async function exportGoogleDocText(documentId, accessToken) {
  return (await driveDownloadExportedFile(documentId, "text/plain", accessToken)).toString("utf8");
}

async function loadResearchReportActivity(kitId, activityIndexText) {
  const activityIndex = Number(activityIndexText);
  if (!getPracticalSkillsKitDefinition(kitId) || !/^\d+$/.test(String(activityIndexText)) || !Number.isSafeInteger(activityIndex)) return null;
  const content = await getStoredPracticalSkillsKitContent(kitId);
  const activity = content?.activities?.[activityIndex];
  if (!content?.worksheets?.[activityIndex] || !activity?.researchReport?.id) return null;
  return { content, activity, activityIndex, report: activity.researchReport };
}

function researchReportStudentEmail(req, res) {
  const email = normalizeEmail(getRequestUserEmail(req));
  if (!email || !email.endsWith(`@${SCHOOL_EMAIL_DOMAIN}`)) {
    res.status(401).json({ error: "School sign-in required." });
    return "";
  }
  return email;
}

// Finds or creates WHS-DTECH > JuniorDTECH/MiddleDTECH/SeniorDTECH > KITS. Existing folders are reused, never moved or deleted.
async function ensureStudentCourseFolders(email, programmeFolder, driveAccessToken) {
  return withResearchReportLock(`${normalizeEmail(email)}:course-folders`, async () => {
    const savedRoot = await getStudentLoginDriveSetup(email);
    const root = (savedRoot?.folder_id && await driveGetLiveFile(savedRoot.folder_id, driveAccessToken))
      || await driveEnsureFolder("root", "WHS-DTECH", driveAccessToken);
    if (!root?.id) throw new Error("Could not find or create your WHS-DTECH folder.");
    const programme = await driveEnsureFolder(root.id, programmeFolder, driveAccessToken);
    if (!programme?.id) throw new Error(`Could not find or create your ${programmeFolder} folder.`);
    const kits = await driveEnsureFolder(programme.id, "KITS", driveAccessToken);
    if (!kits?.id) throw new Error("Could not find or create your KITS folder.");
    return { root, programme, kits };
  });
}

// Students use their directory year level; staff use their saved choice or Login Kit check-in.
async function getStudentProgrammeFolder(email) {
  const profile = await getLearningSitesStudentProfile(email);
  const savedCourse = profile.courseIds?.includes("STAFF") ? await getStaffCoursePreference(email) : "";
  const programmeFolder = getResearchReportProgrammeFolder(profile,
    savedCourse || getCourseProgrammeFolder((await getSavedLearningSitesCheckIn(email))?.answers?.course));
  if (!programmeFolder) {
    const error = new Error("We couldn't tell if you are in Junior, Middle or Senior DTECH. Ask your teacher to check your profile.");
    error.status = 409;
    throw error;
  }
  return programmeFolder;
}

const MINECRAFT_EXPORTS_FOLDER_NAME = "Minecraft Exports";

// Finds or creates WHS-DTECH > course > KITS > Minecraft Exports. Existing folders are reused, never moved or deleted.
app.post("/api/practical-skills/minecraft-exports-folder", async (req, res) => {
  const email = researchReportStudentEmail(req, res);
  if (!email) return;
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "Google Drive permission is required." }); return; }
  try {
    await verifyDriveTokenForStudent(driveAccessToken, email);
    const programmeFolder = await getStudentProgrammeFolder(email);
    const { kits } = await ensureStudentCourseFolders(email, programmeFolder, driveAccessToken);
    const folder = await withResearchReportLock(`${email}:minecraft-exports`,
      async () => driveEnsureFolder(kits.id, MINECRAFT_EXPORTS_FOLDER_NAME, driveAccessToken));
    if (!folder?.id) throw new Error(`Could not find or create your ${MINECRAFT_EXPORTS_FOLDER_NAME} folder.`);
    res.json({
      folderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(folder.id)}`,
      path: ["WHS-DTECH", programmeFolder, "KITS", MINECRAFT_EXPORTS_FOLDER_NAME]
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not open your Minecraft Exports folder." });
  }
});

// Locates WHS-DTECH > JuniorDTECH/MiddleDTECH/SeniorDTECH > KITS and reopens or copies the report. Only a brand-new copy is filled in; existing files are never changed or deleted.
async function ensureStudentResearchReport(email, kitId, report, driveAccessToken, studentDetails = {}) {
  const existing = await getStudentKitDocument(email, kitId, report.id);
  const liveExisting = existing?.document_id ? await driveGetLiveFile(existing.document_id, driveAccessToken) : null;
  if (liveExisting) return { documentId: liveExisting.id, created: false };

  const programmeFolder = await getStudentProgrammeFolder(email);
  const { kits } = await ensureStudentCourseFolders(email, programmeFolder, driveAccessToken);
  const fileName = String(report.fileName || SEARCH_RESEARCH_REPORT_FILE_NAME).trim() || SEARCH_RESEARCH_REPORT_FILE_NAME;

  const found = await driveFindFileByNameInFolder(kits.id, fileName, driveAccessToken);
  const templateId = resolveResearchReportTemplateId(report, process.env.SEARCH_KIT_REPORT_TEMPLATE_ID);
  if (found?.id) {
    await saveStudentKitDocument(email, kitId, report.id, {
      document_id: found.id, folder_id: kits.id,
      template_id: existing?.template_id || templateId,
      template_text: existing?.template_text || (templateId ? await exportGoogleDocText(templateId, driveAccessToken).catch(() => "") : "")
    });
    return { documentId: found.id, created: false };
  }

  if (!templateId) {
    const error = new Error("Your teacher hasn't connected the research report template yet. Ask your teacher for help.");
    error.status = 409;
    throw error;
  }
  let templateText;
  try {
    templateText = await exportGoogleDocText(templateId, driveAccessToken);
  } catch (error) {
    const friendly = new Error("We couldn't open your teacher's report template. Ask your teacher to check it is shared with students.");
    friendly.status = 409;
    throw friendly;
  }
  const copy = await driveCopyFile(templateId, kits.id, fileName, driveAccessToken);
  if (!copy?.id) throw new Error("Could not create your research report. Please try again.");
  // Only the brand-new copy is filled in; the filled text joins the template snapshot so it is not counted as the student's own words.
  const replacements = buildResearchReportReplacements(studentDetails);
  const filled = await fillGoogleDocPlaceholders(copy.id, replacements, driveAccessToken).catch(() => false);
  if (filled) templateText = applyResearchReportReplacements(templateText, replacements);
  await saveStudentKitDocument(email, kitId, report.id, { document_id: copy.id, folder_id: kits.id, template_id: templateId, template_text: templateText });
  return { documentId: copy.id, created: true };
}

function withResearchReportLock(key, task) {
  const previous = researchReportLocks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  const tracked = next.finally(() => { if (researchReportLocks.get(key) === tracked) researchReportLocks.delete(key); });
  researchReportLocks.set(key, tracked);
  return next;
}

app.get("/api/practical-skills/research-report/:kitId/:activityIndex", async (req, res) => {
  const email = researchReportStudentEmail(req, res);
  if (!email) return;
  try {
    const kitId = String(req.params.kitId || "").trim();
    const loaded = await loadResearchReportActivity(kitId, req.params.activityIndex);
    if (!loaded) { res.status(404).json({ error: "This activity does not have a research report." }); return; }
    const record = await getStudentKitDocument(email, kitId, loaded.report.id);
    res.json({
      exists: Boolean(record?.document_id),
      documentUrl: record?.document_id ? googleDocUrl(record.document_id) : null,
      configured: Boolean(resolveResearchReportTemplateId(loaded.report, process.env.SEARCH_KIT_REPORT_TEMPLATE_ID))
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load your research report." });
  }
});

app.post("/api/practical-skills/research-report/:kitId/:activityIndex", async (req, res) => {
  const email = researchReportStudentEmail(req, res);
  if (!email) return;
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "Google Drive permission is required." }); return; }
  try {
    const kitId = String(req.params.kitId || "").trim();
    const loaded = await loadResearchReportActivity(kitId, req.params.activityIndex);
    if (!loaded) { res.status(404).json({ error: "This activity does not have a research report." }); return; }
    const identity = await verifyDriveTokenForStudent(driveAccessToken, email);
    const result = await withResearchReportLock(`${email}:${kitId}:${loaded.report.id}`,
      async () => ensureStudentResearchReport(email, kitId, loaded.report, driveAccessToken,
        await getResearchReportStudentDetails(email, identity?.name).catch(() => ({ studentName: identity?.name || "" }))));
    res.json({ exists: true, created: result.created, documentUrl: googleDocUrl(result.documentId) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not create your research report." });
  }
});

app.post("/api/practical-skills/research-report/:kitId/:activityIndex/check", async (req, res) => {
  const email = researchReportStudentEmail(req, res);
  if (!email) return;
  const driveAccessToken = String(req.body?.driveAccessToken || "").trim();
  if (!driveAccessToken) { res.status(400).json({ error: "Google Drive permission is required." }); return; }
  try {
    const kitId = String(req.params.kitId || "").trim();
    const loaded = await loadResearchReportActivity(kitId, req.params.activityIndex);
    if (!loaded) { res.status(404).json({ error: "This activity does not have a research report." }); return; }
    await verifyDriveTokenForStudent(driveAccessToken, email);
    const record = await getStudentKitDocument(email, kitId, loaded.report.id);
    const liveFile = record?.document_id ? await driveGetLiveFile(record.document_id, driveAccessToken) : null;
    if (!liveFile) {
      res.status(409).json({ error: "We couldn't find your research report. Click Create My Research Report first." });
      return;
    }
    let templateText = record.template_text || "";
    if (!templateText && record.template_id) templateText = await exportGoogleDocText(record.template_id, driveAccessToken).catch(() => "");
    const studentText = await exportGoogleDocText(liveFile.id, driveAccessToken);
    const grade = gradeResearchReport(studentText, templateText, { minimumWords: loaded.report.minimumWords });
    const saved = await savePracticalSkillsAssessment(email, kitId, loaded.activityIndex, grade);
    await syncPracticalSkillsKitCompletion(email, kitId, loaded.content);
    void autoEmailKitCertificate(req, kitId);
    res.json({ ...grade, completedActivities: saved.completed_activities });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "Could not check your research report." });
  }
});

app.get("/api/practical-skills/kit-content/:kitId", async (req, res) => {
  const kitId = String(req.params.kitId || "").trim();
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }

  try {
    const content = await getPracticalSkillsKitContent(kitId);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load kit content." });
  }
});

app.get("/api/admin/practical-skills/kit-content/:kitId", requireAdminAccess, async (req, res) => {
  const kitId = String(req.params.kitId || "").trim();
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }

  try {
    const content = await getStoredPracticalSkillsKitContent(kitId);
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load kit content." });
  }
});

app.get("/api/practical-skills/login-sites/settings", async (req, res) => {
  try {
    const email = normalizeEmail(getRequestUserEmail(req));
    if (!email || !(await canManagePracticalSchedule(email))) return res.status(403).json({ error: "Staff access required." });
    const content = await getStoredPracticalSkillsKitContent("kit-login");
    const activity = content.activities.find((entry) => entry?.loginSites);
    if (!activity) return res.status(404).json({ error: "Login websites activity not found." });
    res.json({ sites: activity.loginSites });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load website settings." });
  }
});

app.put("/api/practical-skills/login-sites/settings", async (req, res) => {
  try {
    const email = normalizeEmail(getRequestUserEmail(req));
    if (!email || !(await canManagePracticalSchedule(email))) return res.status(403).json({ error: "Staff access required." });
    let sites;
    try { sites = validateLoginSites(req.body?.sites); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const content = await getStoredPracticalSkillsKitContent("kit-login");
    const index = content.activities.findIndex((entry) => entry?.loginSites);
    if (index < 0) return res.status(404).json({ error: "Login websites activity not found." });
    content.activities[index] = { ...content.activities[index], loginSites: sites, loginSitesVersion: 1 };
    await savePracticalSkillsKitContent("kit-login", content, email);
    res.json({ sites });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save website settings." });
  }
});

app.put("/api/admin/practical-skills/kit-content/:kitId", requireAdminAccess, async (req, res) => {
  const kitId = String(req.params.kitId || "").trim();
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  if (!getPracticalSkillsKitDefinition(kitId)) {
    res.status(404).json({ error: "Unknown kit." });
    return;
  }
  const content = req.body?.content && typeof req.body.content === "object" ? req.body.content : null;
  if (!content) {
    res.status(400).json({ error: "content object is required" });
    return;
  }

  try {
    const saved = await savePracticalSkillsKitContent(kitId, customPracticalSkillsKits.has(kitId) ? { ...content, customKit: true } : content, requesterEmail);
    let libraryCard;
    try {
      libraryCard = await syncPracticalSkillsKitLibraryCard(kitId, saved);
    } catch (error) {
      res.status(500).json({
        error: `Kit content was saved, but its Licence Library card could not be updated. Save again to retry. ${error.message || ""}`.trim()
      });
      return;
    }
    res.json({ ok: true, content: saved, libraryCard });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not save kit content." });
  }
});

app.get("/api/admin/practical-skills/kits", requireAdminAccess, async (_req, res) => {
  try {
    const ids = [...PRACTICAL_SKILLS_KIT_DEFINITIONS.map((kit) => kit.id), ...customPracticalSkillsKits.keys()];
    const kits = await Promise.all(ids.map(async (id) => {
      const content = await getStoredPracticalSkillsKitContent(id);
      const title = String(content?.identity?.name || content?.bannerTitle || "").trim() || id;
      return { id, title, custom: customPracticalSkillsKits.has(id) };
    }));
    res.json({ kits });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load kits." });
  }
});

app.post("/api/admin/practical-skills/kits", requireAdminAccess, async (req, res) => {
  const requesterEmail = normalizeEmail(getRequestUserEmail(req));
  const content = req.body?.content && typeof req.body.content === "object" && !Array.isArray(req.body.content) ? req.body.content : null;
  const name = String(content?.identity?.name || content?.bannerTitle || "").trim();
  if (!content || !name) {
    res.status(400).json({ error: "Give the new kit a Kit Name before saving." });
    return;
  }

  const kitId = createCustomPracticalSkillsKitId(name);
  registerCustomPracticalSkillsKit(kitId);
  let saved;
  try {
    saved = await savePracticalSkillsKitContent(kitId, { ...content, customKit: true }, requesterEmail);
  } catch (error) {
    customPracticalSkillsKits.delete(kitId);
    res.status(500).json({ error: error.message || "Could not create kit." });
    return;
  }
  try {
    const libraryCard = await syncPracticalSkillsKitLibraryCard(kitId, saved);
    res.status(201).json({ ok: true, kitId, content: saved, libraryCard });
  } catch (error) {
    res.status(500).json({
      kitId,
      content: saved,
      error: `Kit was created, but its Licence Library card could not be added. Save again to retry. ${error.message || ""}`.trim()
    });
  }
});

app.post("/api/practicals/events", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const eventTypeRaw = String(req.body?.event_type || "Activity").trim();
  const eventType = eventTypeRaw.toLowerCase().includes("project") ? "Project" : "Activity";
  const startDate = normalizeDateOnly(req.body?.start_date);
  const endDateInput = normalizeDateOnly(req.body?.end_date);
  const endDate = endDateInput || startDate;
  const notes = String(req.body?.notes || "").trim();
  const linkedActivityId = String(req.body?.linked_activity_id || "").trim();
  const linkedUrl = String(req.body?.linked_url || "").trim();
  const unitPlanId = String(req.body?.unit_plan_id || req.body?.unitPlanId || "").trim();
  const lessonIndex = Number.parseInt(req.body?.lesson_index ?? req.body?.lessonIndex, 10);
  const createdByEmail = normalizeEmail(req.body?.user_email);

  if (!title || !startDate) {
    res.status(400).json({ error: "title and start_date are required" });
    return;
  }

  if (!createdByEmail || !(await canManagePracticalSchedule(createdByEmail))) {
    res.status(403).json({ error: "Only Teacher/Admin users can add calendar events" });
    return;
  }

  if (!hasDatabase) {
    const existingIndex = unitPlanId && Number.isInteger(lessonIndex) && lessonIndex > 0
      ? memoryPracticalEvents.findIndex((row) => String(row.unit_plan_id || "") === unitPlanId && Number(row.lesson_index) === lessonIndex)
      : -1;

    const row = {
      id: memoryPracticalEventId++,
      title,
      event_type: eventType,
      start_date: startDate,
      end_date: endDate,
      notes,
      linked_activity_id: linkedActivityId || null,
      linked_url: linkedUrl || null,
      unit_plan_id: unitPlanId || null,
      lesson_index: Number.isInteger(lessonIndex) && lessonIndex > 0 ? lessonIndex : null,
      created_by_email: createdByEmail,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (existingIndex >= 0) {
      memoryPracticalEvents[existingIndex] = { ...memoryPracticalEvents[existingIndex], ...row };
      res.status(200).json(memoryPracticalEvents[existingIndex]);
      return;
    }

    memoryPracticalEvents.push(row);
    res.status(201).json(row);
    return;
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO practical_schedule (
          title, event_type, start_date, end_date, notes, linked_activity_id, linked_url, unit_plan_id, lesson_index, created_by_email, created_at, updated_at
        ) VALUES (
          $1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        )
        ON CONFLICT (unit_plan_id, lesson_index) DO UPDATE SET
          title = EXCLUDED.title,
          event_type = EXCLUDED.event_type,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          notes = EXCLUDED.notes,
          linked_activity_id = EXCLUDED.linked_activity_id,
          linked_url = EXCLUDED.linked_url,
          created_by_email = EXCLUDED.created_by_email,
          updated_at = NOW()
        RETURNING id, title, event_type, start_date, end_date, notes, linked_activity_id, linked_url, unit_plan_id, lesson_index, created_by_email, created_at, updated_at
      `,
      [title, eventType, startDate, endDate, notes, linkedActivityId || null, linkedUrl || null, unitPlanId || null, Number.isInteger(lessonIndex) && lessonIndex > 0 ? lessonIndex : null, createdByEmail]
    );
    res.status(201).json(result.rows[0]);
  } catch (_error) {
    res.status(500).json({ error: "Could not save practical event" });
  }
});

app.get("/api/unit-plans", async (_req, res) => {
  if (!hasDatabase) {
    res.json(Array.from(memoryUnitPlans.values()).sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || ""))));
    return;
  }

  try {
    await ensureUnitPlanSchema();
    const result = await pool.query("SELECT * FROM unit_plans ORDER BY updated_at DESC, created_at DESC");
    res.json(result.rows);
  } catch (_error) {
    res.status(500).json({ error: "Could not load unit plans" });
  }
});

app.post("/api/unit-plans/resync-lessons", async (req, res) => {
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || req.query?.user_email || getRequestUserEmail(req));
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  try {
    let unitPlans = [];

    if (!hasDatabase) {
      unitPlans = Array.from(memoryUnitPlans.values());
    } else {
      await ensureUnitPlanSchema();
      const result = await pool.query("SELECT * FROM unit_plans ORDER BY updated_at DESC, created_at DESC");
      unitPlans = result.rows || [];
    }

    let lessonCardsSynced = 0;
    for (const unitPlan of unitPlans) {
      lessonCardsSynced += await syncUnitPlanLessonsToLibrary(unitPlan);
    }

    res.status(200).json({
      ok: true,
      unit_plans_processed: unitPlans.length,
      lesson_cards_synced: lessonCardsSynced
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not resync unit lessons" });
  }
});

app.get("/api/unit-plans/:id", async (req, res) => {
  const requestedId = String(req.params.id || "").trim();
  if (!requestedId) {
    res.status(400).json({ error: "Unit plan ID is required" });
    return;
  }

  if (!hasDatabase) {
    const found = memoryUnitPlans.get(requestedId);
    if (!found) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(found);
    return;
  }

  try {
    await ensureUnitPlanSchema();
    const result = await pool.query("SELECT * FROM unit_plans WHERE id = $1", [requestedId]);
    if (!result.rowCount) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (_error) {
    res.status(500).json({ error: "Could not load unit plan" });
  }
});

app.post("/api/unit-plans", async (req, res) => {
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || getRequestUserEmail(req));
  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const payload = buildUnitPlanPayload(req.body, userEmail);

  if (!payload.title || !payload.topic || !payload.year_level) {
    res.status(400).json({ error: "title, topic and year_level are required" });
    return;
  }

  try {
    const savedPlan = await saveUnitPlanPayload(payload);
    const createdLessonCards = await syncUnitPlanLessonsToLibrary(savedPlan);
    res.status(201).json({
      ...savedPlan,
      lesson_cards_created: createdLessonCards
    });
  } catch (error) {
    console.error("Unit plan save error:", error);
    res.status(500).json({ error: "Could not save unit plan" });
  }
});

app.put("/api/unit-plans/:id", async (req, res) => {
  const unitPlanId = String(req.params.id || "").trim();
  const userEmail = normalizeEmail(req.body?.created_by_email || req.body?.user_email || getRequestUserEmail(req));

  if (!unitPlanId) {
    res.status(400).json({ error: "Unit plan ID is required" });
    return;
  }

  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Teacher/Admin access is required." });
    return;
  }

  const payload = buildUnitPlanPayload(req.body, userEmail);
  payload.id = unitPlanId;

  if (!payload.title || !payload.topic || !payload.year_level) {
    res.status(400).json({ error: "title, topic and year_level are required" });
    return;
  }

  try {
    const savedPlan = await saveUnitPlanPayload(payload);
    const createdLessonCards = await syncUnitPlanLessonsToLibrary(savedPlan);
    res.status(200).json({
      ...savedPlan,
      lesson_cards_created: createdLessonCards
    });
  } catch (error) {
    console.error("Unit plan update error:", error);
    res.status(500).json({ error: "Could not update unit plan" });
  }
});

app.delete("/api/unit-plans/:id", async (req, res) => {
  const unitPlanId = String(req.params.id || "").trim();
  const userEmail = getRequestUserEmail(req);
  const deleteLessonsRaw = String(req.query?.delete_lessons || req.body?.delete_lessons || "").trim().toLowerCase();
  const shouldDeleteLessons = ["1", "true", "yes", "on"].includes(deleteLessonsRaw);
  const lessonCardPrefix = `unitplan-${slugify(unitPlanId)}-lesson-`;

  if (!unitPlanId) {
    res.status(400).json({ error: "Unit plan ID is required" });
    return;
  }

  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Only Teacher/Admin users can delete unit plans" });
    return;
  }

  if (!hasDatabase) {
    if (!memoryUnitPlans.has(unitPlanId)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let deletedLessonCards = 0;
    if (shouldDeleteLessons) {
      Array.from(memoryLessons.keys())
        .filter((lessonId) => String(lessonId || "").startsWith(lessonCardPrefix))
        .forEach((lessonId) => {
          memoryLessons.delete(lessonId);
          deletedLessonCards += 1;
        });
    }

    memoryUnitPlans.delete(unitPlanId);
    res.status(200).json({
      ok: true,
      deleted_unit_plan_id: unitPlanId,
      deleted_lesson_cards: deletedLessonCards,
      kept_lesson_cards: !shouldDeleteLessons
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let deletedLessonCards = 0;
    if (shouldDeleteLessons) {
      const deletedLessonsResult = await client.query(`DELETE FROM ${lessonTable} WHERE id LIKE $1`, [`${lessonCardPrefix}%`]);
      deletedLessonCards = Number(deletedLessonsResult.rowCount || 0);
    }

    const deletedPlanResult = await client.query("DELETE FROM unit_plans WHERE id = $1", [unitPlanId]);
    if (!deletedPlanResult.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Not found" });
      return;
    }

    await client.query("COMMIT");
    res.status(200).json({
      ok: true,
      deleted_unit_plan_id: unitPlanId,
      deleted_lesson_cards: deletedLessonCards,
      kept_lesson_cards: !shouldDeleteLessons
    });
  } catch (_error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Could not delete unit plan" });
  } finally {
    client.release();
  }
});

app.delete("/api/practicals/events/:id", async (req, res) => {
  const eventId = Number.parseInt(req.params.id, 10);
  const userEmail = normalizeEmail(req.query.user_email || req.body?.user_email);

  if (!Number.isInteger(eventId) || eventId <= 0) {
    res.status(400).json({ error: "invalid event id" });
    return;
  }

  if (!userEmail || !(await canManagePracticalSchedule(userEmail))) {
    res.status(403).json({ error: "Only Teacher/Admin users can delete calendar events" });
    return;
  }

  if (!hasDatabase) {
    const index = memoryPracticalEvents.findIndex((row) => Number(row.id) === eventId);
    if (index < 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    memoryPracticalEvents.splice(index, 1);
    res.status(204).send();
    return;
  }

  try {
    const result = await pool.query("DELETE FROM practical_schedule WHERE id = $1", [eventId]);
    if (!result.rowCount) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (_error) {
    res.status(500).json({ error: "Could not delete practical event" });
  }
});

app.get("/api/practicals/calendar.ics", async (_req, res) => {
  try {
    const rows = await listPracticalEvents();
    const ics = buildIcsCalendar(rows);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", "inline; filename=Browse-Practicals.ics");
    res.send(ics);
  } catch (_error) {
    res.status(500).send("Could not generate calendar feed");
  }
});

app.post("/api/suggestions", suggestionUpload.single("attachment"), async (req, res) => {
  const submittedByName = String(req.body?.submitted_by_name || "").trim();
  const submittedByEmail = normalizeEmail(req.body?.submitted_by_email);
  const suggestionTypeRaw = String(req.body?.suggestion_type || "Activity").trim();
  const suggestionType = suggestionTypeRaw.toLowerCase().includes("project") ? "Project" : "Activity";
  const suggestionTitle = String(req.body?.suggestion_title || "").trim();
  const referenceUrl = String(req.body?.reference_url || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const attachment = req.file || null;

  if (!submittedByName || !submittedByEmail || !suggestionTitle || !reason) {
    res.status(400).json({ error: "name, email, title and reason are required" });
    return;
  }

  const suggestionRecord = {
    submitted_by_name: submittedByName,
    submitted_by_email: submittedByEmail,
    suggestion_type: suggestionType,
    suggestion_title: suggestionTitle,
    reference_url: referenceUrl,
    reason,
    attachment_filename: attachment?.originalname || null,
    attachment_mime: attachment?.mimetype || null,
    attachment_size: attachment?.size || null,
    created_at: new Date().toISOString()
  };

  if (!hasDatabase) {
    const memoryRow = {
      id: memorySuggestionId++,
      ...suggestionRecord,
      attachment_data: attachment?.buffer || null
    };
    memorySuggestions.unshift(memoryRow);

    try {
      const emailResult = await notifySuggestionByEmail(memoryRow, attachment);
      res.status(201).json({ ok: true, id: memoryRow.id, email_status: emailResult.status, recipients: emailResult.recipients.length });
    } catch (error) {
      console.error("[suggestion-email] Could not notify suggestion recipients:", error);
      res.status(201).json({ ok: true, id: memoryRow.id, email_status: "failed", email_error: getHubEmailErrorMessage(error), recipients: 0 });
    }
    return;
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO suggestions (
          submitted_by_name,
          submitted_by_email,
          suggestion_type,
          suggestion_title,
          reference_url,
          reason,
          attachment_filename,
          attachment_mime,
          attachment_size,
          attachment_data,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
        )
        RETURNING id, submitted_by_name, submitted_by_email, suggestion_type, suggestion_title, reference_url, reason,
                  attachment_filename, attachment_mime, attachment_size, created_at
      `,
      [
        submittedByName,
        submittedByEmail,
        suggestionType,
        suggestionTitle,
        referenceUrl,
        reason,
        attachment?.originalname || null,
        attachment?.mimetype || null,
        attachment?.size || null,
        attachment?.buffer || null
      ]
    );

    const savedRow = result.rows[0];

    try {
      const emailResult = await notifySuggestionByEmail(savedRow, attachment);
      res.status(201).json({ ok: true, id: savedRow.id, email_status: emailResult.status, recipients: emailResult.recipients.length });
    } catch (error) {
      console.error("[suggestion-email] Could not notify suggestion recipients:", error);
      res.status(201).json({ ok: true, id: savedRow.id, email_status: "failed", email_error: getHubEmailErrorMessage(error), recipients: 0 });
    }
  } catch (error) {
    res.status(500).json({ error: "Could not save suggestion" });
  }
});

app.get("/api/admin/suggestions", async (_req, res) => {
  if (!hasDatabase) {
    res.json(memorySuggestions.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      suggestion_type: row.suggestion_type,
      suggestion_title: row.suggestion_title,
      submitted_by_name: row.submitted_by_name,
      submitted_by_email: row.submitted_by_email,
      reference_url: row.reference_url,
      reason: row.reason,
      has_attachment: Boolean(row.attachment_data),
      attachment_filename: row.attachment_filename
    })));
    return;
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          created_at,
          suggestion_type,
          suggestion_title,
          submitted_by_name,
          submitted_by_email,
          reference_url,
          reason,
          attachment_filename,
          COALESCE(OCTET_LENGTH(attachment_data), 0) > 0 AS has_attachment
        FROM suggestions
        ORDER BY created_at DESC, id DESC
      `
    );

    res.json(result.rows);
  } catch (_error) {
    res.status(500).json({ error: "Could not load suggestions" });
  }
});

app.get("/api/admin/suggestions/activity", requireAdminAccess, async (_req, res) => {
  try {
    const suggestions = hasDatabase
      ? (await pool.query(`SELECT id, created_at, suggestion_type, suggestion_title, submitted_by_name, submitted_by_email, reference_url, reason, attachment_filename, COALESCE(OCTET_LENGTH(attachment_data), 0) > 0 AS has_attachment FROM suggestions ORDER BY created_at DESC, id DESC`)).rows
      : memorySuggestions;
    let emails = [];
    if (hasDatabase) {
      await ensureEmailLogsSchema();
      emails = (await pool.query(`SELECT id, sent_at, from_email, recipients, subject, email_type FROM email_logs ORDER BY sent_at DESC, id DESC`)).rows;
    } else {
      emails = memoryEmailLogs;
    }
    res.json({ suggestions, emails });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load suggestions and email activity" });
  }
});

app.post("/api/admin/suggestions/email-list", requireAdminAccess, async (req, res) => {
  try {
    const rows = hasDatabase
      ? (await pool.query(`SELECT created_at, suggestion_type, suggestion_title, submitted_by_name, submitted_by_email, reference_url, reason FROM suggestions ORDER BY created_at DESC, id DESC`)).rows
      : memorySuggestions;
    const recipients = await getSuggestionRecipients();
    if (!recipients.length) {
      res.status(400).json({ error: "No suggestion notification recipients are configured." });
      return;
    }
    const safe = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const listHtml = rows.length
      ? `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">${rows.map((row) => `<tr><td style="padding:7px;border:1px solid #d4dbe5;vertical-align:top;">${safe(new Date(row.created_at).toLocaleDateString())}</td><td style="padding:7px;border:1px solid #d4dbe5;vertical-align:top;"><strong>${safe(row.suggestion_title)}</strong><br>${safe(row.suggestion_type)}<br>Suggested by ${safe(row.submitted_by_name)} (${safe(row.submitted_by_email)})<br>${safe(row.reason)}</td></tr>`).join("")}</table>`
      : "<p>No suggestions have been submitted yet.</p>";
    const subject = `[Hub Suggestion] Suggestions List (${rows.length})`;
    await sendConfiguredHubEmail({
      to: recipients,
      subject,
      html: `<div style="font-family:Arial,sans-serif;color:#17314d;max-width:900px;margin:0 auto;"><h2>DTECH HUB Suggestions List</h2><p>${rows.length} suggestion${rows.length === 1 ? "" : "s"} currently recorded.</p>${listHtml}</div>`,
      emailType: "suggestions_list"
    });
    res.json({ ok: true, count: rows.length, recipients: recipients.length });
  } catch (error) {
    console.error("[suggestion-list-email] Could not email suggestions list:", error);
    res.status(500).json({ error: getHubEmailErrorMessage(error) });
  }
});

app.get("/api/admin/suggestions/:id/attachment", async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).send("invalid id");
    return;
  }

  if (!hasDatabase) {
    const row = memorySuggestions.find((item) => Number(item.id) === id);
    if (!row?.attachment_data) {
      res.status(404).send("attachment not found");
      return;
    }

    res.setHeader("Content-Type", row.attachment_mime || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${row.attachment_filename || `suggestion-${id}.pdf`}"`);
    res.send(row.attachment_data);
    return;
  }

  try {
    const result = await pool.query(
      `
        SELECT attachment_data, attachment_filename, attachment_mime
        FROM suggestions
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!result.rows.length || !result.rows[0].attachment_data) {
      res.status(404).send("attachment not found");
      return;
    }

    const row = result.rows[0];
    res.setHeader("Content-Type", row.attachment_mime || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${row.attachment_filename || `suggestion-${id}.pdf`}"`);
    res.send(row.attachment_data);
  } catch (_error) {
    res.status(500).send("Could not download attachment");
  }
});

app.get("/api/auth/user-access", async (req, res) => {
  const access = req.dtechAccess;
  return res.json({
    email: getRequestUserEmail(req), is_staff: access.teacher, is_student: !access.teacher,
    additional_role: access.role, can_teacher_view: access.teacher, can_admin: access.admin,
    default_view: access.teacher ? "teacher" : "student"
  });
});

app.get("/api/integrations/trello/config", (_req, res) => {
  res.json({
    enabled: Boolean(TRELLO_API_KEY),
    api_key: TRELLO_API_KEY || ""
  });
});

app.get("/api/integrations/trello/status", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  try {
    const existing = await getStoredTrelloConnection(email);
    if (!existing?.trello_token) {
      res.json({ connected: false, email: normalizeEmail(email) });
      return;
    }

    let me = null;
    try {
      me = await trelloApiRequest("/members/me", {
        token: existing.trello_token,
        query: { fields: "id,username,fullName,url" }
      });
    } catch (_error) {
      res.json({
        connected: false,
        email: normalizeEmail(email),
        reason: "token_invalid"
      });
      return;
    }

    res.json({
      connected: true,
      email: normalizeEmail(email),
      trello: {
        id: String(me?.id || existing.trello_member_id || "").trim(),
        username: String(me?.username || existing.trello_username || "").trim(),
        full_name: String(me?.fullName || existing.trello_full_name || "").trim(),
        url: String(me?.url || "").trim()
      },
      connected_at: existing.connected_at || null,
      updated_at: existing.updated_at || null
    });
  } catch (_error) {
    res.status(500).json({ error: "Could not load Trello connection status" });
  }
});

app.get("/api/integrations/trello/connections", requireActivityWriteAccess, async (req, res) => {
  const emailsParam = String(req.query?.emails || "").trim();
  const parsedEmails = emailsParam
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter((value) => isSchoolEmail(value));
  const uniqueEmails = Array.from(new Set(parsedEmails));

  if (!uniqueEmails.length) {
    res.json({ connections: [] });
    return;
  }

  try {
    if (!hasDatabase) {
      const rows = uniqueEmails.map((email) => {
        const existing = memoryTrelloConnections.get(email) || null;
        return {
          email,
          connected: Boolean(existing?.trello_token),
          connected_at: existing?.connected_at || null,
          updated_at: existing?.updated_at || null
        };
      });
      res.json({ connections: rows });
      return;
    }

    await ensureTrelloConnectionsSchema();
    const result = await pool.query(
      `
        SELECT student_email, trello_token, connected_at, updated_at
        FROM student_trello_connections
        WHERE student_email = ANY($1::text[])
      `,
      [uniqueEmails]
    );

    const byEmail = new Map(
      (result.rows || []).map((row) => [
        normalizeEmail(row.student_email),
        {
          email: normalizeEmail(row.student_email),
          connected: Boolean(row?.trello_token),
          connected_at: row?.connected_at || null,
          updated_at: row?.updated_at || null
        }
      ])
    );

    const rows = uniqueEmails.map((email) => {
      const found = byEmail.get(email);
      return found || { email, connected: false, connected_at: null, updated_at: null };
    });

    res.json({ connections: rows });
  } catch (_error) {
    res.status(500).json({ error: "Could not load Trello connection statuses" });
  }
});

app.get("/api/integrations/trello/list-progress", requireTrelloBoardReadAccess, async (req, res) => {
  const studentEmail = normalizeEmail(req.query?.student_email || req.query?.studentEmail || "");
  const boardUrl = String(req.query?.board_url || req.query?.boardUrl || "").trim();

  if (!isSchoolEmail(studentEmail)) {
    res.status(400).json({ error: "A valid student email is required" });
    return;
  }

  if (!boardUrl) {
    res.status(400).json({ error: "A Trello board or card URL is required" });
    return;
  }

  try {
    const existing = await getStoredTrelloConnection(studentEmail);
    if (!existing?.trello_token) {
      res.status(404).json({ error: "Student has not connected Trello" });
      return;
    }

    let boardId = parseTrelloBoardIdentifier(boardUrl);
    if (!boardId) {
      const cardId = parseTrelloCardIdentifier(boardUrl);
      if (cardId) {
        const card = await trelloApiRequest(`/cards/${encodeURIComponent(cardId)}`, {
          token: existing.trello_token,
          query: { fields: "id,idBoard,url" }
        });
        boardId = String(card?.idBoard || "").trim();
      }
    }

    if (!boardId) {
      res.status(400).json({ error: "Could not resolve Trello board id from URL" });
      return;
    }

    const lists = await trelloApiRequest(`/boards/${encodeURIComponent(boardId)}/lists`, {
      token: existing.trello_token,
      query: { fields: "id,name,closed", filter: "open" }
    });
    const cards = await trelloApiRequest(`/boards/${encodeURIComponent(boardId)}/cards`, {
      token: existing.trello_token,
      query: { fields: "id,idList,name,url,due,dateLastActivity,closed", filter: "open" }
    });

    const openLists = (Array.isArray(lists) ? lists : []).map((list) => ({
      id: String(list?.id || "").trim(),
      name: String(list?.name || "").trim()
    })).filter((list) => list.id);

    const listNameById = new Map(openLists.map((list) => [list.id, list.name]));
    const toDoListIds = openLists
      .filter((list) => /(^|\s)to\s*do($|\s)|^todo$/i.test(list.name))
      .map((list) => list.id);
    const doingListIds = openLists
      .filter((list) => /(^|\s)doing($|\s)|in\s*progress/i.test(list.name))
      .map((list) => list.id);
    const doneListIds = openLists
      .filter((list) => /(^|\s)done($|\s)|complete(d)?|finished/i.test(list.name))
      .map((list) => list.id);

    const openCards = (Array.isArray(cards) ? cards : []).map((card) => ({
      id: String(card?.id || "").trim(),
      idList: String(card?.idList || "").trim(),
      name: String(card?.name || "Untitled task").trim(),
      url: String(card?.url || "").trim(),
      due: String(card?.due || "").trim(),
      dateLastActivity: String(card?.dateLastActivity || "").trim(),
      closed: Boolean(card?.closed)
    })).filter((card) => card.id && card.idList && !card.closed);

    const toDoCount = openCards.filter((card) => toDoListIds.includes(card.idList)).length;
    const doingCount = openCards.filter((card) => doingListIds.includes(card.idList)).length;
    const doneCount = openCards.filter((card) => doneListIds.includes(card.idList)).length;
    const trackedTotal = toDoCount + doingCount + doneCount;
    const completionPercent = trackedTotal > 0
      ? Math.round((doneCount / trackedTotal) * 100)
      : 0;

    const toTaskCards = (listIds) => openCards
      .filter((card) => listIds.includes(card.idList))
      .map((card) => ({
        id: card.id,
        name: card.name,
        url: card.url,
        due: card.due,
        date_last_activity: card.dateLastActivity
      }));

    res.json({
      student_email: studentEmail,
      board_id: boardId,
      open_cards_total: openCards.length,
      todo_count: toDoCount,
      doing_count: doingCount,
      done_count: doneCount,
      completion_percent: completionPercent,
      todo_lists: toDoListIds.map((id) => listNameById.get(id) || id),
      doing_lists: doingListIds.map((id) => listNameById.get(id) || id),
      done_lists: doneListIds.map((id) => listNameById.get(id) || id),
      todo_cards: toTaskCards(toDoListIds),
      doing_cards: toTaskCards(doingListIds),
      done_cards: toTaskCards(doneListIds)
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ error: error.message || "Could not load Trello list progress" });
  }
});

app.post("/api/integrations/trello/connect", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  if (!TRELLO_API_KEY) {
    res.status(503).json({ error: "Trello integration is not configured yet" });
    return;
  }

  const token = String(req.body?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "Trello token is required" });
    return;
  }

  try {
    const me = await trelloApiRequest("/members/me", {
      token,
      query: { fields: "id,username,fullName,url" }
    });

    const saved = await saveTrelloConnection(email, token, me);

    res.status(201).json({
      connected: true,
      email: normalizeEmail(email),
      trello: {
        id: String(me?.id || "").trim(),
        username: String(me?.username || "").trim(),
        full_name: String(me?.fullName || "").trim(),
        url: String(me?.url || "").trim()
      },
      connected_at: saved.connected_at || null,
      updated_at: saved.updated_at || null
    });
  } catch (error) {
    const status = Number(error?.status) || 400;
    const safeStatus = status === 401 ? 400 : status;
    const baseMessage = String(error?.message || "Could not connect Trello account");
    const errorMessage = status === 401
      ? `${baseMessage} Generate a token using this app's key and try again.`
      : baseMessage;

    res.status(safeStatus).json({ error: errorMessage });
  }
});

app.delete("/api/integrations/trello/connect", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  try {
    await deleteTrelloConnection(email);
    res.status(204).send();
  } catch (_error) {
    res.status(500).json({ error: "Could not disconnect Trello account" });
  }
});

app.get("/api/integrations/trello/boards", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  try {
    const existing = await getStoredTrelloConnection(email);
    if (!existing?.trello_token) {
      res.status(404).json({ error: "Connect Trello first" });
      return;
    }

    const boards = await trelloApiRequest("/members/me/boards", {
      token: existing.trello_token,
      query: { fields: "id,name,url,closed", filter: "open" }
    });

    res.json((Array.isArray(boards) ? boards : []).map((board) => ({
      id: String(board?.id || "").trim(),
      name: String(board?.name || "").trim(),
      url: String(board?.url || "").trim()
    })).filter((board) => board.id));
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ error: error.message || "Could not load Trello boards" });
  }
});

app.get("/api/integrations/trello/boards/:boardId/lists", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  const boardId = String(req.params.boardId || "").trim();
  if (!boardId) {
    res.status(400).json({ error: "Board id is required" });
    return;
  }

  try {
    const existing = await getStoredTrelloConnection(email);
    if (!existing?.trello_token) {
      res.status(404).json({ error: "Connect Trello first" });
      return;
    }

    const lists = await trelloApiRequest(`/boards/${encodeURIComponent(boardId)}/lists`, {
      token: existing.trello_token,
      query: { fields: "id,name,closed,pos", filter: "open" }
    });

    res.json((Array.isArray(lists) ? lists : []).map((list) => ({
      id: String(list?.id || "").trim(),
      name: String(list?.name || "").trim(),
      pos: Number(list?.pos) || 0
    })).filter((list) => list.id));
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ error: error.message || "Could not load Trello lists" });
  }
});

app.post("/api/integrations/trello/cards", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  const listId = String(req.body?.list_id || req.body?.idList || "").trim();
  const cardName = String(req.body?.name || "").trim();
  const cardDesc = String(req.body?.desc || "").trim();
  if (!listId || !cardName) {
    res.status(400).json({ error: "List and card name are required" });
    return;
  }

  try {
    const existing = await getStoredTrelloConnection(email);
    if (!existing?.trello_token) {
      res.status(404).json({ error: "Connect Trello first" });
      return;
    }

    const created = await trelloApiRequest("/cards", {
      token: existing.trello_token,
      method: "POST",
      query: {
        idList: listId,
        name: cardName,
        desc: cardDesc,
        pos: String(req.body?.pos || "top").trim() || "top"
      }
    });

    res.status(201).json({
      id: String(created?.id || "").trim(),
      name: String(created?.name || cardName).trim(),
      url: String(created?.url || "").trim(),
      short_link: String(created?.shortLink || "").trim()
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ error: error.message || "Could not create Trello card" });
  }
});

app.post("/api/integrations/trello/work-log", async (req, res) => {
  const email = getRequestUserEmail(req);
  if (!isSchoolEmail(email)) {
    res.status(401).json({ error: "School sign-in required" });
    return;
  }

  try {
    const existing = await getStoredTrelloConnection(email);
    if (!existing?.trello_token) {
      res.status(404).json({ error: "Connect Trello first" });
      return;
    }

    const cardIdentifier = parseTrelloCardIdentifier(req.body?.card_id || req.body?.card_url);
    if (!cardIdentifier) {
      res.status(400).json({ error: "A Trello card link or card id is required" });
      return;
    }

    const note = String(req.body?.note || "").trim();
    const activityTitle = String(req.body?.activity_title || req.body?.activity_name || "").trim();
    const progressRaw = Number(req.body?.progress_percent);
    const progressPercent = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : NaN;

    const text = formatTrelloCommentText({
      activityTitle,
      progressPercent,
      note,
      createdByEmail: normalizeEmail(email)
    });

    const action = await trelloApiRequest(`/cards/${encodeURIComponent(cardIdentifier)}/actions/comments`, {
      token: existing.trello_token,
      method: "POST",
      query: { text }
    });

    const shortLink = String(action?.data?.card?.shortLink || cardIdentifier).trim();
    const cardUrl = shortLink ? `https://trello.com/c/${shortLink}` : "";

    res.status(201).json({
      ok: true,
      card_id: cardIdentifier,
      card_url: cardUrl,
      action_id: String(action?.id || "").trim()
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({ error: error.message || "Could not send Trello work log" });
  }
});

const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || "").trim();
const GITHUB_RAW_CONTENT_BASE = "https://raw.githubusercontent.com";
const GITHUB_EFFICIENT_TOOLS_MAX_VALIDATED_FILES = 3;
const GITHUB_COMMENT_SCAN_MAX_FILES = 40;
const GITHUB_ASSET_FOLDER_NAMES = new Set(["images", "img", "assets", "css", "styles", "js", "scripts", "media"]);
const GITHUB_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".tif", ".tiff", ".bmp", ".heic", ".heif"]);
const GITHUB_OPTIMISED_IMAGE_MAX_BYTES = 500 * 1024;

function parseGithubRepoIdentifier(repoUrl) {
  const raw = String(repoUrl || "").trim();
  if (!raw) return null;
  const match = raw.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return null;
  return {
    owner: String(match[1] || "").trim(),
    repo: String(match[2] || "").trim().replace(/\.git$/i, "")
  };
}

async function githubApiRequest(pathname, query = {}) {
  if (!GITHUB_TOKEN) {
    const error = new Error("GitHub sync is unavailable because the server GITHUB_TOKEN is not configured. Ask a DTECH-HUB administrator to configure it in Render.");
    error.status = 503;
    throw error;
  }

  const params = new URLSearchParams(query || {});
  const suffix = params.toString();
  const url = `https://api.github.com${pathname}${suffix ? `?${suffix}` : ""}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DTECH-HUB"
  };
  headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 401
      ? "The server GITHUB_TOKEN was rejected by GitHub. A DTECH-HUB administrator needs to refresh the token in Render."
      : String(payload?.message || `GitHub request failed (${response.status}).`);
    const error = new Error(message);
    error.status = response.status === 401 ? 503 : (response.status === 404 ? 404 : (response.status === 403 ? 429 : response.status));
    throw error;
  }
  return payload;
}

function githubSourceHasComments(source) {
  const candidates = String(source || "").match(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|^[ \t]*\/\/[^\r\n]*/gm) || [];
  return candidates.some((comment) => {
    const body = comment.startsWith("<!--")
      ? comment.slice(4, -3)
      : comment.startsWith("/*") ? comment.slice(2, -2) : comment.slice(2);
    return Boolean(body.trim());
  });
}

function buildGithubCommentingCategory(sourceFiles) {
  return {
    label: "Commenting",
    done: (Array.isArray(sourceFiles) ? sourceFiles : []).some(githubSourceHasComments)
  };
}

function computeGithubEfficientToolsCategories(treeItems, imageStats) {
  const paths = (Array.isArray(treeItems) ? treeItems : [])
    .filter((item) => item?.type === "blob")
    .map((item) => String(item?.path || "").trim())
    .filter(Boolean);

  const topLevelFolders = new Set(
    paths
      .filter((filePath) => filePath.includes("/"))
      .map((filePath) => filePath.split("/")[0].toLowerCase())
  );
  const hasOrganisedAssetFolders = Array.from(topLevelFolders).some((folder) => GITHUB_ASSET_FOLDER_NAMES.has(folder));

  const cssFiles = paths.filter((filePath) => /\.css$/i.test(filePath));
  const htmlFiles = paths.filter((filePath) => /\.html?$/i.test(filePath));

  return {
    htmlFiles,
    cssFiles,
    categories: [
      { label: "Management of assets", done: hasOrganisedAssetFolders },
      { label: "Using stylesheets", done: cssFiles.length > 0 },
      { label: "Master pages or student developed templates", done: htmlFiles.length >= 2 && cssFiles.length > 0 },
      { label: "Reusing objects, styles and/or frames", done: cssFiles.length > 0 && htmlFiles.length >= 2 },
      {
        label: "Optimisation of media assets",
        done: imageStats.count > 0 && imageStats.maxBytes > 0 && imageStats.maxBytes <= GITHUB_OPTIMISED_IMAGE_MAX_BYTES
      }
    ]
  };
}

// Reliable repo-hygiene signals for the image efficient-tools practices (the 4 that
// can be proven from the repo tree/metadata alone, without opening a binary .psd/.ai).
function computeGithubImageEfficientToolsCategories(treeItems, imageStats) {
  const paths = (Array.isArray(treeItems) ? treeItems : [])
    .filter((item) => item?.type === "blob")
    .map((item) => String(item?.path || "").trim())
    .filter(Boolean);

  const topLevelFolders = new Set(
    paths
      .filter((filePath) => filePath.includes("/"))
      .map((filePath) => filePath.split("/")[0].toLowerCase())
  );
  const hasOrganisedAssetFolders = Array.from(topLevelFolders).some((folder) => GITHUB_ASSET_FOLDER_NAMES.has(folder));

  // Using layers effectively / Using non-destructive editing techniques: a native layered
  // source file (.psd, .ai, .xcf, .clip, .procreate, .kra, .sketch, .fig) is committed.
  const layeredSourceFiles = paths.filter((filePath) => {
    const ext = filePath.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    return GITHUB_IMAGE_PROJECT_EXTENSIONS.has(ext);
  });
  const layeredEditingDone = layeredSourceFiles.length > 0;

  return {
    projectFileCount: layeredSourceFiles.length,
    categories: [
      { label: "Management of assets", done: hasOrganisedAssetFolders },
      { label: "Using layers effectively", done: layeredEditingDone },
      { label: "Using non-destructive editing techniques", done: layeredEditingDone },
      {
        label: "Optimisation and efficient export of image assets",
        done: imageStats.count > 0 && imageStats.maxBytes > 0 && imageStats.maxBytes <= GITHUB_OPTIMISED_IMAGE_MAX_BYTES
      }
    ]
  };
}

// Reliable repo-hygiene signals for the video efficient-tools practices (the 4 that
// can be proven from the repo tree/metadata alone, without opening a binary .drp).
function computeGithubVideoEfficientToolsCategories(treeItems, commitDayCount) {
  const blobs = (Array.isArray(treeItems) ? treeItems : []).filter((item) => item?.type === "blob");
  const paths = blobs.map((item) => String(item?.path || "").trim()).filter(Boolean);
  const lowerPaths = paths.map((filePath) => filePath.toLowerCase());

  const projectFiles = paths.filter((filePath) => {
    const ext = filePath.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    return GITHUB_VIDEO_PROJECT_EXTENSIONS.has(ext);
  });
  const projectFileCount = projectFiles.length;
  const multiCommitDay = Number(commitDayCount || 0) > 1;

  // Version control / project backups: a Resolve/Premiere project file committed, ideally with
  // saves across multiple days or an explicit backup project file present.
  const versionControlDone = projectFileCount > 0 && (multiCommitDay || projectFileCount > 1);

  // Appropriate folder/bin organisation: media files sorted into named subfolders rather than dumped at root.
  const mediaPaths = lowerPaths.filter((filePath) => {
    const ext = filePath.match(/\.[a-z0-9]+$/)?.[0] || "";
    return GITHUB_MEDIA_EXTENSIONS.has(ext);
  });
  const folderPattern = /(?:^|\/)(?:assets?|media|footage|clips?|video|audio|images?|graphics?|exports?|project)(?:\/|$)/;
  const mediaInFolders = mediaPaths.filter((filePath) => filePath.includes("/") && folderPattern.test(filePath)).length;
  const folderOrgDone = mediaPaths.length > 0 && mediaInFolders >= Math.ceil(mediaPaths.length * 0.6);

  // Appropriate file naming: media files avoid default/temp names ("Untitled", "New Folder", "copy", "temp", "draft", "test project").
  // Stock/camera reel IDs (e.g. b004_SFO_LIGHTS_04.mov, A003_08071846_C029.braw), descriptive names (Color Page Timeline 2.mov),
  // and clean snake/camel/space names are all valid media asset naming conventions.
  const defaultTempPattern = /(?:^|\/)(?:untitled|new\s*folder|draft|temp|test\s*project|copy|\.tmp)(?:\/|\.|$)/i;
  const namedFiles = mediaPaths.filter((filePath) => !defaultTempPattern.test(filePath));
  const fileNamingDone = mediaPaths.length > 0 && namedFiles.length === mediaPaths.length;

  // Optimisation/compression of media assets: no single source media file over the oversized threshold.
  const sourceMediaBlobs = blobs.filter((item) => {
    const ext = String(item?.path || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    return GITHUB_MEDIA_EXTENSIONS.has(ext);
  });
  const maxMediaBytes = sourceMediaBlobs.reduce((max, item) => Math.max(max, Number(item?.size || 0) || 0), 0);
  const optimisationDone = sourceMediaBlobs.length > 0 && maxMediaBytes > 0 && maxMediaBytes <= GITHUB_VIDEO_OVERSIZED_ASSET_MAX_BYTES;

  // Management of media assets: source media files exist in the repository and are tracked alongside NLE project files / timelines.
  const mediaAssetCount = sourceMediaBlobs.length;
  const mediaManagementDone = mediaAssetCount > 0 && projectFileCount > 0;

  // Appropriate export settings: exported render files (.mov, .mp4, .webm, etc.) exist, are non-empty, and fit within GitHub's 100MB file size limit.
  const exportVideoBlobs = blobs.filter((item) => {
    const ext = String(item?.path || "").toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    return GITHUB_VIDEO_EXTENSIONS.has(ext);
  });
  const maxExportBytes = exportVideoBlobs.reduce((max, item) => Math.max(max, Number(item?.size || 0) || 0), 0);
  const exportSettingsDone = exportVideoBlobs.length > 0 && maxExportBytes > 0 && maxExportBytes <= GITHUB_VIDEO_OVERSIZED_ASSET_MAX_BYTES;

  return {
    projectFileCount,
    categories: [
      { label: "Version control / project backups", done: versionControlDone },
      { label: "Appropriate folder/bin organisation", done: folderOrgDone },
      { label: "Appropriate file naming", done: fileNamingDone },
      { label: "Optimisation/compression of media assets", done: optimisationDone },
      { label: "Management of media assets", done: mediaManagementDone },
      { label: "Appropriate export settings", done: exportSettingsDone }
    ]
  };
}

// Parse a committed FCPXML timeline export for the practices provable from timeline data.
// Only FCPXML (Resolve 'Export Timeline') is readable text; a .drp stays binary/unreadable.
function parseFcpxmlVideoTools(content) {
  const text = String(content || "");
  if (!/<fcpxml[\s>]/i.test(text)) return [];

  const found = [];
  // Non-destructive editing: any timeline sequence in NLE format (FCPXML timeline export with sequence/spine).
  if (/<fcpxml[\s>]/i.test(text) && /<sequence[\s>]/i.test(text) && /<spine[\s>]/i.test(text)) {
    found.push("Non-destructive editing");
  }
  // Management of media assets: FCPXML timeline explicitly defines and tracks cataloged media asset resources (<asset> tags).
  if (/<asset\b[^>]*\b(?:src|id|name)\s*=/i.test(text)) {
    found.push("Management of media assets");
  }
  // Proxies / optimised workflow: proxy or optimised media or camera RAW (.braw) referenced in the timeline resources.
  if (/<(?:proxy|asset)[^>]*(?:proxy|optimized|optimised)/i.test(text) || /\bproxied\b|\bproxyMedia\b|hasProxy\s*=\s*["']1/i.test(text) || /\.braw\b/i.test(text)) {
    found.push("Proxy media / optimised editing workflow");
  }
  // Adjustment layers / nested sequences: a sequence used as a clip (nested), an adjustment asset, or transform adjustments.
  if (/<(?:asset-clip|clip)[^>]*\bref\s*=\s*["'][^"']*sequence/i.test(text) || (/<sequence\b[^>]*>\s*<spine>/i.test(text) && /<asset-clip/i.test(text)) || /<adjust-transform\b/i.test(text)) {
    found.push("Adjustment layers / nested sequences where appropriate");
  }
  // Reusing titles / presets / effects / templates: effect or title resources referenced on the timeline.
  if (/<(?:effect|title)\b[^>]*\b(?:uid|ref)\s*=|<video[^>]*\bref\s*=\s*["'][^"']*(?:title|effect)/i.test(text) || /<(?:filter-video|filter-audio|title)\b/i.test(text)) {
    found.push("Reusing titles, presets, effects or templates");
  }
  // Sequence / project settings: an explicit timeline format with frame rate / resolution defined.
  if (/<format\b[^>]*\b(?:frameDuration|width|height)\s*=/i.test(text)) {
    found.push("Appropriate sequence/project settings");
  }
  // Appropriate export settings: explicit render output format or media-rep src referencing web-export formats (.mov, .mp4, .webm).
  if (/<format\b[^>]*\b(?:frameDuration|width|height)\s*=/i.test(text) && (/<media-rep\b[^>]*\b(?:src|kind)\s*=/i.test(text) || /\.mov|\.mp4|\.webm/i.test(text))) {
    found.push("Appropriate export settings");
  }
  return found;
}

async function fetchGithubRepoRawFile(owner, repo, branch, filePath) {
  try {
    const rawUrl = `${GITHUB_RAW_CONTENT_BASE}/${owner}/${repo}/${branch}/${filePath}`;
    const response = await fetch(rawUrl, { headers: { "User-Agent": "DTECH-HUB" } });
    if (!response.ok) return "";
    return await response.text();
  } catch (_error) {
    return "";
  }
}

const GITHUB_PSD_PARSE_MAX_BYTES = 6 * 1024 * 1024;
const GITHUB_PSD_HARD_SIZE_CAP_BYTES = 40 * 1024 * 1024;
const GITHUB_PSD_ADJUSTMENT_TAGS = new Set(["brit", "levl", "curv", "expA", "blwh", "hue2", "blnc", "selc", "mixr", "phfl", "nvrt", "post", "thrs", "vibA", "grdm"]);
const GITHUB_PSD_SMART_OBJECT_TAGS = new Set(["SoLd", "SoLE", "PlLd"]);
const GITHUB_PSD_STYLE_TAGS = new Set(["lrFX", "lfx2", "Patt", "PtFl"]);
const GITHUB_PSD_TYPE_TAGS = new Set(["TySh"]);
const GITHUB_PSD_VECTOR_MASK_TAGS = new Set(["vmsk", "vsms"]);

// Fetches only the first N bytes of a raw GitHub file (Range request) so we can read
// binary headers/metadata (e.g. a PSD's layer structure) without downloading huge assets.
async function fetchGithubRepoRawFileBuffer(owner, repo, branch, filePath, maxBytes) {
  try {
    const rawUrl = `${GITHUB_RAW_CONTENT_BASE}/${owner}/${repo}/${branch}/${filePath}`;
    const response = await fetch(rawUrl, {
      headers: { "User-Agent": "DTECH-HUB", Range: `bytes=0-${Math.max(0, maxBytes - 1)}` }
    });
    if (!response.ok && response.status !== 206) return null;
    if (response.status !== 206) {
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > GITHUB_PSD_HARD_SIZE_CAP_BYTES) return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_error) {
    return null;
  }
}

// Best-effort PSD binary parser: reads the header, the Image Resources section (for
// guides/grids), and walks the Layer Info records (metadata only, never pixel data) to
// detect real evidence of layers, masks, adjustment layers, smart objects and type layers.
// Never throws; returns whatever was safely parsed before any bounds/format issue.
function parsePsdBuffer(buffer) {
  const labels = new Set();
  let layerCount = 0;
  let colorMode = "";
  try {
    if (!buffer || buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "8BPS") {
      return { layerCount: 0, colorMode: "", labels: [] };
    }
    if (buffer.readUInt16BE(4) !== 1) {
      return { layerCount: 0, colorMode: "", labels: [] };
    }
    const colorModeNames = { 0: "Bitmap", 1: "Grayscale", 2: "Indexed", 3: "RGB", 4: "CMYK", 7: "Multichannel", 8: "Duotone", 9: "Lab" };
    colorMode = colorModeNames[buffer.readUInt16BE(24)] || "";

    let offset = 26;
    if (offset + 4 > buffer.length) return { layerCount, colorMode, labels: Array.from(labels) };
    offset += 4 + buffer.readUInt32BE(offset);
    if (offset + 4 > buffer.length) return { layerCount, colorMode, labels: Array.from(labels) };

    // Image Resources: look for resource ID 1032 (Grid and Guides Info).
    const imageResourcesLength = buffer.readUInt32BE(offset);
    offset += 4;
    const imageResourcesEnd = Math.min(offset + imageResourcesLength, buffer.length);
    let resourceOffset = offset;
    let resourceGuard = 0;
    while (resourceOffset + 12 <= imageResourcesEnd && resourceGuard < 2000) {
      resourceGuard += 1;
      if (buffer.toString("ascii", resourceOffset, resourceOffset + 4) !== "8BIM") break;
      const resourceId = buffer.readUInt16BE(resourceOffset + 4);
      const nameLen = buffer.readUInt8(resourceOffset + 6);
      const sizeOffset = resourceOffset + 6 + Math.ceil((1 + nameLen) / 2) * 2;
      if (sizeOffset + 4 > imageResourcesEnd) break;
      const resourceSize = buffer.readUInt32BE(sizeOffset);
      if (resourceId === 1032 && resourceSize > 0) {
        labels.add("Using templates, guides and/or grids");
      }
      resourceOffset = sizeOffset + 4 + Math.ceil(resourceSize / 2) * 2;
    }
    offset = imageResourcesEnd;

    if (offset + 4 > buffer.length) return { layerCount, colorMode, labels: Array.from(labels) };
    const layerMaskInfoLength = buffer.readUInt32BE(offset);
    offset += 4;
    const layerMaskInfoEnd = Math.min(offset + layerMaskInfoLength, buffer.length);

    if (offset + 4 > layerMaskInfoEnd) return { layerCount, colorMode, labels: Array.from(labels) };
    const layerInfoLength = buffer.readUInt32BE(offset);
    offset += 4;
    const layerInfoEnd = Math.min(offset + layerInfoLength, buffer.length);

    if (offset + 2 > layerInfoEnd) return { layerCount, colorMode, labels: Array.from(labels) };
    layerCount = Math.abs(buffer.readInt16BE(offset));
    offset += 2;
    if (layerCount > 1) labels.add("Using layers effectively");

    const maxLayersToWalk = Math.min(layerCount, 300);
    for (let i = 0; i < maxLayersToWalk; i += 1) {
      if (offset + 18 > layerInfoEnd) break;
      offset += 16; // bounding rectangle
      const numChannels = buffer.readUInt16BE(offset);
      offset += 2;
      if (offset + numChannels * 6 > layerInfoEnd) break;
      offset += numChannels * 6;
      if (offset + 12 > layerInfoEnd || buffer.toString("ascii", offset, offset + 4) !== "8BIM") break;
      offset += 8; // blend signature + blend key
      offset += 1; // opacity
      const clipping = buffer.readUInt8(offset);
      offset += 1;
      offset += 2; // flags + filler
      if (offset + 4 > layerInfoEnd) break;
      const extraDataLength = buffer.readUInt32BE(offset);
      offset += 4;
      const extraDataEnd = Math.min(offset + extraDataLength, layerInfoEnd);

      if (clipping === 1) labels.add("Using efficient selection and masking techniques");

      let cursor = offset;
      if (cursor + 4 <= extraDataEnd) {
        const maskDataLength = buffer.readUInt32BE(cursor);
        cursor += 4 + maskDataLength;
        if (maskDataLength > 0) labels.add("Using efficient selection and masking techniques");
      }
      if (cursor + 4 <= extraDataEnd) {
        cursor += 4 + buffer.readUInt32BE(cursor);
      }
      if (cursor < extraDataEnd) {
        const nameLen = buffer.readUInt8(cursor);
        cursor += Math.ceil((1 + nameLen) / 4) * 4;
      }

      let blockGuard = 0;
      while (cursor + 12 <= extraDataEnd && blockGuard < 200) {
        blockGuard += 1;
        const sig = buffer.toString("ascii", cursor, cursor + 4);
        if (sig !== "8BIM" && sig !== "8B64") break;
        const key = buffer.toString("ascii", cursor + 4, cursor + 8);
        const blockLength = buffer.readUInt32BE(cursor + 8);
        cursor += 12;
        if (cursor + blockLength > extraDataEnd) break;

        if (GITHUB_PSD_VECTOR_MASK_TAGS.has(key)) labels.add("Using efficient selection and masking techniques");
        if (GITHUB_PSD_ADJUSTMENT_TAGS.has(key)) {
          labels.add("Using non-destructive editing techniques");
          labels.add("Using appropriate colour and typography controls");
        }
        if (GITHUB_PSD_TYPE_TAGS.has(key)) labels.add("Using appropriate colour and typography controls");
        if (GITHUB_PSD_SMART_OBJECT_TAGS.has(key)) {
          labels.add("Using non-destructive editing techniques");
          labels.add("Reusing styles, objects and/or presets");
        }
        if (GITHUB_PSD_STYLE_TAGS.has(key)) labels.add("Reusing styles, objects and/or presets");

        cursor += blockLength + (blockLength % 2);
      }

      offset = extraDataEnd;
    }

    return { layerCount, colorMode, labels: Array.from(labels) };
  } catch (_error) {
    return { layerCount, colorMode, labels: Array.from(labels) };
  }
}

// Cumulatively parses every committed .psd file (bounded to the 5 largest) and merges
// the real layer/mask/adjustment/smart-object evidence found across all of them.
async function computeGithubPsdSignals(owner, repo, branch, treeItems) {
  const candidates = (Array.isArray(treeItems) ? treeItems : [])
    .filter((item) => item?.type === "blob" && /\.psd$/i.test(String(item?.path || "")))
    .sort((left, right) => Number(right?.size || 0) - Number(left?.size || 0))
    .slice(0, 5);

  const files = [];
  const allLabelsSet = new Set();
  for (const candidate of candidates) {
    const candidatePath = String(candidate?.path || "").trim();
    const buffer = await fetchGithubRepoRawFileBuffer(owner, repo, branch, candidatePath, GITHUB_PSD_PARSE_MAX_BYTES);
    if (!buffer) continue;
    const parsed = parsePsdBuffer(buffer);
    files.push({ file: candidatePath, layer_count: parsed.layerCount, color_mode: parsed.colorMode, labels: parsed.labels });
    parsed.labels.forEach((label) => allLabelsSet.add(label));
  }

  return { files, labels: Array.from(allLabelsSet) };
}

// AS91893 "Advanced Tools & Techniques" auto-detection (the 4 shared categories), reusing
// the same tree/FCPXML/PSD evidence already gathered rather than re-scanning the repo.
function computeGithubToolsTechniquesCategories(mediaType, signals) {
  const type = String(mediaType || "").trim().toLowerCase();

  if (type === "video") {
    const labelSet = new Set(Array.isArray(signals?.fcpxmlLabels) ? signals.fcpxmlLabels : []);
    return [
      { label: "Creating or customising scripts, code or presets", done: labelSet.has("Reusing titles, presets, effects or templates") },
      { label: "Using a combination of steps to manipulate or enhance elements", done: labelSet.has("Adjustment layers / nested sequences where appropriate") },
      { label: "Using a third-party library", done: labelSet.has("Proxy media / optimised editing workflow") },
      { label: "Using composite effects", done: labelSet.has("Reusing titles, presets, effects or templates") && labelSet.has("Adjustment layers / nested sequences where appropriate") }
    ];
  }

  if (type === "image") {
    const labelSet = new Set(Array.isArray(signals?.psdLabels) ? signals.psdLabels : []);
    return [
      { label: "Creating or customising scripts, code or presets", done: labelSet.has("Reusing styles, objects and/or presets") },
      { label: "Using a combination of steps to manipulate or enhance elements", done: labelSet.has("Using non-destructive editing techniques") },
      { label: "Using a third-party library", done: labelSet.has("Reusing styles, objects and/or presets") },
      { label: "Using composite effects", done: Number(signals?.primaryLayerCount || 0) > 1 }
    ];
  }

  return [
    { label: "Creating or customising scripts, code or presets", done: Number(signals?.jsFileCount || 0) > 0 },
    { label: "Using a combination of steps to manipulate or enhance elements", done: Number(signals?.jsFileCount || 0) > 0 && Number(signals?.cssFileCount || 0) > 0 },
    { label: "Using a third-party library", done: Boolean(signals?.hasThirdPartyImport) },
    { label: "Using composite effects", done: Boolean(signals?.hasCompositeCss) }
  ];
}

function computeGithubComplexTechniquesCategories(mediaType, signals) {
  if (String(mediaType || "").trim().toLowerCase() !== "image") return [];

  const labelSet = new Set(Array.isArray(signals?.psdLabels) ? signals.psdLabels : []);
  const hasLayeredSource = Number(signals?.primaryLayerCount || 0) > 1;
  const hasImageAssets = Number(signals?.imageCount || 0) > 0;
  return [
    { label: "Non-core functionality", done: labelSet.has("Using non-destructive editing techniques") },
    { label: "Sophisticated digital effects", done: labelSet.has("Reusing styles, objects and/or presets") && hasLayeredSource },
    { label: "Applying industry standards or guidelines", done: labelSet.has("Using templates, guides and/or grids") || labelSet.has("Using appropriate colour and typography controls") },
    { label: "Responsive design for use on multiple devices", done: false },
    { label: "Integration of original media assets", done: hasImageAssets },
    { label: "Dynamic data handling and interactivity", done: false },
    { label: "Automation through scripts", done: false }
  ];
}


// Merge fcpxml-derived practices into the tree-level categories (done wins; never untick).
function mergeVideoToolsCategories(baseCategories, fcpxmlLabels) {
  const extraSet = new Set((Array.isArray(fcpxmlLabels) ? fcpxmlLabels : []).map((label) => String(label || "").trim().toLowerCase()));
  const categories = (Array.isArray(baseCategories) ? baseCategories : []).map((cat) => {
    const label = String(cat?.label || "").trim();
    const isDone = Boolean(cat?.done) || extraSet.has(label.toLowerCase());
    return { ...cat, done: isDone };
  });

  (Array.isArray(fcpxmlLabels) ? fcpxmlLabels : []).forEach((label) => {
    const cleanLabel = String(label || "").trim();
    if (!cleanLabel) return;
    const exists = categories.some((cat) => String(cat?.label || "").trim().toLowerCase() === cleanLabel.toLowerCase());
    if (!exists) {
      categories.push({ label: cleanLabel, done: true });
    }
  });

  return categories;
}

function extractImageStatsFromTree(treeItems) {
  let count = 0;
  let maxBytes = 0;
  (Array.isArray(treeItems) ? treeItems : []).forEach((item) => {
    if (item?.type !== "blob") return;
    const filePath = String(item?.path || "").toLowerCase();
    const extMatch = filePath.match(/\.[a-z0-9]+$/);
    if (!extMatch || !GITHUB_IMAGE_EXTENSIONS.has(extMatch[0])) return;
    count += 1;
    const size = Number(item?.size || 0);
    if (Number.isFinite(size) && size > maxBytes) {
      maxBytes = size;
    }
  });
  return { count, maxBytes };
}

async function validateRawFileViaW3C(rawUrl, type) {
  try {
    const validatorUrl = type === "css"
      ? `https://jigsaw.w3.org/css-validator/validator?uri=${encodeURIComponent(rawUrl)}&output=json`
      : `https://validator.w3.org/nu/?doc=${encodeURIComponent(rawUrl)}&out=json`;
    const response = await fetch(validatorUrl, { headers: { "User-Agent": "DTECH-HUB" } });
    if (!response.ok) return { checked: false, passed: false, errorCount: 0, warningCount: 0 };

    const payload = await response.json().catch(() => null);
    if (!payload) return { checked: false, passed: false, errorCount: 0, warningCount: 0 };

    if (type === "css") {
      const errorCount = Number(payload?.cssvalidation?.errors?.length || 0);
      const warningCount = Number(payload?.cssvalidation?.warnings?.length || 0);
      return { checked: true, passed: errorCount === 0, errorCount, warningCount };
    }

    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const errorCount = messages.filter((message) => String(message?.type || "").toLowerCase() === "error").length;
    const warningCount = messages.filter((message) => String(message?.type || "").toLowerCase() === "info" && /warning/i.test(String(message?.message || ""))).length;
    return { checked: true, passed: errorCount === 0, errorCount, warningCount };
  } catch (_error) {
    return { checked: false, passed: false, errorCount: 0, warningCount: 0 };
  }
}

// Public-repo-only analysis: no OAuth required, just the repo's public tree/commit/file data.
app.get("/api/integrations/github/repo-analysis", async (req, res) => {
  const repoUrl = String(req.query?.repo_url || req.query?.repoUrl || "").trim();
  const identifier = parseGithubRepoIdentifier(repoUrl);
  if (!identifier?.owner || !identifier?.repo) {
    res.status(400).json({ error: "A valid public GitHub repository URL is required." });
    return;
  }

  try {
    const repoInfo = await githubApiRequest(`/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}`);
    const defaultBranch = String(repoInfo?.default_branch || "main").trim();

    const treePayload = await githubApiRequest(
      `/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}/git/trees/${encodeURIComponent(defaultBranch)}`,
      { recursive: "1" }
    );
    const treeItems = Array.isArray(treePayload?.tree) ? treePayload.tree : [];

    let commitDays = new Set();
    let commitCount = 0;
    let latestCommit = null;
    try {
      const commits = await githubApiRequest(
        `/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}/commits`,
        { per_page: "100" }
      );
      const commitRows = Array.isArray(commits) ? commits : [];
      commitCount = commitRows.length;
      latestCommit = commitRows[0] || null;
      commitRows.forEach((commit) => {
        const dateStr = String(commit?.commit?.author?.date || commit?.commit?.committer?.date || "").trim();
        const day = dateStr.slice(0, 10);
        if (day) commitDays.add(day);
      });
    } catch (_commitsError) {
      // Commit history is a bonus signal only; do not fail the whole sync if it can't be read.
    }

    let branchesCount = 0;
    let releasesTagsCount = 0;
    let filesChanged = 0;
    try {
      const [branches, tags, latestCommitDetails] = await Promise.all([
        githubApiRequest(`/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}/branches`, { per_page: "100" }),
        githubApiRequest(`/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}/tags`, { per_page: "100" }),
        latestCommit?.sha
          ? githubApiRequest(`/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}/commits/${encodeURIComponent(latestCommit.sha)}`)
          : Promise.resolve(null)
      ]);
      branchesCount = Array.isArray(branches) ? branches.length : 0;
      releasesTagsCount = Array.isArray(tags) ? tags.length : 0;
      filesChanged = Array.isArray(latestCommitDetails?.files) ? latestCommitDetails.files.length : 0;
    } catch (_repositoryDetailsError) {
      // Supplemental project-management metrics must not prevent the main repo scan.
    }

    const imageStats = extractImageStatsFromTree(treeItems);
    const { htmlFiles, cssFiles, categories } = computeGithubEfficientToolsCategories(treeItems, imageStats);

    const filesToValidate = [
      ...htmlFiles.slice(0, GITHUB_EFFICIENT_TOOLS_MAX_VALIDATED_FILES).map((filePath) => ({ filePath, type: "html" })),
      ...cssFiles.slice(0, GITHUB_EFFICIENT_TOOLS_MAX_VALIDATED_FILES).map((filePath) => ({ filePath, type: "css" }))
    ];

    const validationResults = await Promise.all(filesToValidate.map(async ({ filePath, type }) => {
      const rawUrl = `${GITHUB_RAW_CONTENT_BASE}/${identifier.owner}/${identifier.repo}/${defaultBranch}/${filePath}`;
      const result = await validateRawFileViaW3C(rawUrl, type);
      return { filePath, type, ...result };
    }));

    const anyValidationPassed = validationResults.some((row) => row.checked && row.passed);
    categories.push({ label: "HTML/CSS validation procedures", done: anyValidationPassed });

    // Video efficient-tools auto-detection (the 4 reliably provable from the repo tree/metadata).
    // Backups signal: a project file is committed AND the student committed on more than one day,
    // OR more than one project file exists (an explicit backup copy).
    const videoEfficientTools = computeGithubVideoEfficientToolsCategories(treeItems, commitDays.size);

    // Deeper detection: inspect all committed FCPXML timeline exports (Resolve 'Export Timeline')
    // and cumulatively aggregate detected practices across all exported timelines.
    const fcpxmlCandidates = treeItems
      .filter((item) => /\.(?:fcpxml)$/i.test(String(item?.path || "")) || (/\.xml$/i.test(String(item?.path || "")) && !/\b(?:project|archive)\b/i.test(String(item?.path || ""))))
      .sort((left, right) => Number(right?.size || 0) - Number(left?.size || 0));
    const fcpxmlFiles = [];
    const allFcpxmlLabelsSet = new Set();
    for (const candidate of fcpxmlCandidates) {
      const candidatePath = String(candidate?.path || "").trim();
      const content = await fetchGithubRepoRawFile(identifier.owner, identifier.repo, defaultBranch, candidatePath);
      const labels = parseFcpxmlVideoTools(content);
      if (labels.length > 0 || candidatePath.endsWith(".fcpxml")) {
        fcpxmlFiles.push({ file: candidatePath, labels });
        labels.forEach((label) => allFcpxmlLabelsSet.add(label));
      }
    }
    const allFcpxmlLabels = Array.from(allFcpxmlLabelsSet);
    const primaryFcpxmlPath = fcpxmlFiles[0]?.file || "";
    const videoToolsCategories = mergeVideoToolsCategories(videoEfficientTools.categories, allFcpxmlLabels);

    // Deeper detection: parse committed PSD layer structure (real layers, masks, adjustment
    // layers, smart objects, type layers, guides) rather than only inferring from the extension.
    const psdSignals = await computeGithubPsdSignals(identifier.owner, identifier.repo, defaultBranch, treeItems);
    const imageToolsCategories = mergeVideoToolsCategories(
      computeGithubImageEfficientToolsCategories(treeItems, imageStats).categories,
      psdSignals.labels
    );

    // AS91893 Advanced Tools & Techniques: sample a few committed CSS/JS files (bounded,
    // best-effort) for composite-effect properties and third-party library imports.
    const jsFilePaths = treeItems
      .filter((item) => item?.type === "blob" && GITHUB_JS_EXTENSION.test(String(item?.path || "")))
      .map((item) => String(item?.path || "").trim());
    const toolsTechniquesSampleFiles = Array.from(new Set([
      ...htmlFiles.slice(0, GITHUB_COMMENT_SCAN_MAX_FILES),
      ...cssFiles.slice(0, 3),
      ...jsFilePaths.slice(0, 3)
    ]));
    const commentScanContents = [];
    let hasCompositeCss = false;
    let hasThirdPartyImport = false;
    await Promise.all(toolsTechniquesSampleFiles.map(async (filePath) => {
      const content = await fetchGithubRepoRawFile(identifier.owner, identifier.repo, defaultBranch, filePath);
      if (!content) return;
      commentScanContents.push(content);
      if (/mix-blend-mode|backdrop-filter|filter\s*:|linear-gradient|radial-gradient|animation\s*:|transform\s*:|clip-path/i.test(content)) {
        hasCompositeCss = true;
      }
      if (/@import\s+url\(|cdn\.|unpkg\.com|jsdelivr|googleapis\.com\/ajax|import\s+.+\s+from\s+["'][^."'][^"']*["']|require\(["'][^."'][^"']*["']\)/i.test(content)) {
        hasThirdPartyImport = true;
      }
    }));
    categories.push(buildGithubCommentingCategory(commentScanContents));

    const toolsTechniquesCategories = {
      web: computeGithubToolsTechniquesCategories("web", {
        jsFileCount: jsFilePaths.length,
        cssFileCount: cssFiles.length,
        hasCompositeCss,
        hasThirdPartyImport
      }),
      video: computeGithubToolsTechniquesCategories("video", { fcpxmlLabels: allFcpxmlLabels }),
      image: computeGithubToolsTechniquesCategories("image", {
        psdLabels: psdSignals.labels,
        primaryLayerCount: Number(psdSignals.files?.[0]?.layer_count || 0)
      })
    };
    const complexTechniquesCategories = {
      image: computeGithubComplexTechniquesCategories("image", {
        psdLabels: psdSignals.labels,
        primaryLayerCount: Number(psdSignals.files?.[0]?.layer_count || 0),
        imageCount: imageStats.count
      })
    };

    res.json({
      ok: true,
      owner: identifier.owner,
      repo: identifier.repo,
      default_branch: defaultBranch,
      file_count: treeItems.filter((item) => item?.type === "blob").length,
      html_count: htmlFiles.length,
      css_count: cssFiles.length,
      image_count: imageStats.count,
      commit_count: commitCount,
      commit_day_count: commitDays.size,
      files_changed: filesChanged,
      last_commit: latestCommit ? {
        message: String(latestCommit?.commit?.message || "").split("\n")[0].trim(),
        date: String(latestCommit?.commit?.author?.date || latestCommit?.commit?.committer?.date || "").trim()
      } : null,
      branches_count: branchesCount,
      releases_tags_count: releasesTagsCount,
      categories,
      image_tools_categories: imageToolsCategories,
      video_tools_categories: videoToolsCategories,
      tools_techniques_categories: toolsTechniquesCategories,
      complex_techniques_categories: complexTechniquesCategories,
      fcpxml_detected: { file: primaryFcpxmlPath, labels: allFcpxmlLabels, files: fcpxmlFiles },
      psd_detected: { file: psdSignals.files[0]?.file || "", labels: psdSignals.labels, files: psdSignals.files },
      validation: validationResults
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({
      error: status === 404
        ? "Could not find that GitHub repository. Make sure it is public and the link is correct."
        : (error.message || "Could not analyse the GitHub repository.")
    });
  }
});

const GITHUB_MEDIA_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mp3", ".wav", ".ogg"]);
const GITHUB_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);
const GITHUB_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"]);
const GITHUB_GRAPHIC_EXTENSIONS = new Set([".svg", ".ai", ".eps", ".pdf"]);
const GITHUB_VIDEO_PROJECT_EXTENSIONS = new Set([".prproj", ".drp", ".aep", ".blend", ".fcpxml", ".xml"]);
const GITHUB_IMAGE_PROJECT_EXTENSIONS = new Set([".psd", ".ai", ".xcf", ".clip", ".procreate", ".kra", ".sketch", ".fig", ".afphoto", ".afdesign"]);
const GITHUB_VIDEO_OVERSIZED_ASSET_MAX_BYTES = 100 * 1024 * 1024;
const GITHUB_JS_EXTENSION = /\.js$/i;
const GITHUB_ASSET_HEALTH_MAX_SCANNED_FILES = 40;

function extractLocalReferencesFromContent(content) {
  const refs = new Set();
  const patterns = [
    /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi,
    /url\(\s*["']?([^"')#?]+)["']?\s*\)/gi
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const ref = String(match[1] || "").trim();
      if (!ref) continue;
      if (/^(?:https?:)?\/\//i.test(ref) || ref.startsWith("data:") || ref.startsWith("mailto:") || ref.startsWith("#")) continue;
      refs.add(ref);
    }
  });
  return Array.from(refs);
}

function resolveGithubRelativePath(basePath, ref) {
  const cleanRef = String(ref || "").split("?")[0].split("#")[0];
  if (!cleanRef) return "";
  const baseDir = String(basePath || "").includes("/") ? basePath.slice(0, basePath.lastIndexOf("/")) : "";
  const combined = cleanRef.startsWith("/") ? cleanRef.replace(/^\/+/, "") : (baseDir ? `${baseDir}/${cleanRef}` : cleanRef);
  const stack = [];
  combined.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") { stack.pop(); return; }
    stack.push(part);
  });
  return stack.join("/");
}

function countCssRules(content) {
  return (String(content || "").match(/(^|})\s*[^@{}][^{]*\{/gm) || []).length;
}

function extractCssColourValues(content) {
  return String(content || "").match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black|transparent)\b/gi) || [];
}

function buildCssHealthDetails(cssContents, htmlContents) {
  const cssText = cssContents.join("\n");
  const htmlText = htmlContents.join("\n");
  const colours = extractCssColourValues(cssText).map((value) => value.toLowerCase());
  const colourCounts = new Map();
  colours.forEach((colour) => colourCounts.set(colour, (colourCounts.get(colour) || 0) + 1));

  return {
    rules: countCssRules(cssText),
    variables: (cssText.match(/--[a-z0-9_-]+\s*:/gi) || []).length,
    repeated_colour_values: Array.from(colourCounts.values()).filter((count) => count > 1).length,
    inline_styles: (htmlText.match(/\sstyle\s*=\s*["']/gi) || []).length,
    important_uses: (cssText.match(/!important\b/gi) || []).length,
    media_queries: (cssText.match(/@media\b/gi) || []).length
  };
}

function extractHtmlAssetPaths(content, extensionPattern) {
  const paths = new Set();
  const pattern = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
  let match;
  while ((match = pattern.exec(String(content || ""))) !== null) {
    const filePath = String(match[1] || "").trim();
    if (extensionPattern.test(filePath)) paths.add(filePath);
  }
  return paths;
}

function buildHtmlHealthDetails(htmlContents) {
  const stylesheetCounts = new Map();
  const scriptCounts = new Map();
  const semanticElements = ["header", "nav", "main", "section", "footer"];
  const usedSemanticElements = new Set();
  let repeatedNavigationPages = 0;
  let inlineStyles = 0;

  htmlContents.forEach((content) => {
    extractHtmlAssetPaths(content, /\.css$/i).forEach((filePath) => {
      stylesheetCounts.set(filePath, (stylesheetCounts.get(filePath) || 0) + 1);
    });
    extractHtmlAssetPaths(content, /\.js$/i).forEach((filePath) => {
      scriptCounts.set(filePath, (scriptCounts.get(filePath) || 0) + 1);
    });
    if (/<nav\b/i.test(content)) repeatedNavigationPages += 1;
    inlineStyles += (String(content || "").match(/\sstyle\s*=\s*["']/gi) || []).length;
    semanticElements.forEach((element) => {
      if (new RegExp(`<${element}\\b`, "i").test(content)) usedSemanticElements.add(element);
    });
  });

  return {
    pages: htmlContents.length,
    common_stylesheet: Array.from(stylesheetCounts.values()).some((count) => count >= 2),
    common_javascript: Array.from(scriptCounts.values()).some((count) => count >= 2),
    repeated_navigation_pages: repeatedNavigationPages,
    semantic_elements: semanticElements.filter((element) => usedSemanticElements.has(element)),
    inline_styles: inlineStyles
  };
}

function buildLinkHealthDetails(htmlContents) {
  let internalLinks = 0;
  let externalLinks = 0;
  const linkPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;

  htmlContents.forEach((content) => {
    let match;
    while ((match = linkPattern.exec(String(content || ""))) !== null) {
      const href = String(match[1] || "").trim();
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
      if (/^(?:https?:)?\/\//i.test(href)) {
        externalLinks += 1;
      } else {
        internalLinks += 1;
      }
    }
  });

  return { internal_links: internalLinks, external_links: externalLinks };
}

function buildJavascriptHealthDetails(javascriptContents) {
  const jsText = javascriptContents.join("\n");
  const functionMatches = jsText.match(/\b(?:async\s+)?function\s+[a-z_$][\w$]*\s*\(|(?:\([^)]*\)|[a-z_$][\w$]*)\s*=>/gi) || [];
  const eventListenerMatches = jsText.match(/\.addEventListener\s*\(/gi) || [];
  const domMatches = jsText.match(/\b(?:document|window)\.(?:querySelector(?:All)?|getElementById|createElement|appendChild|removeChild|innerHTML|textContent|classList)\b/gi) || [];
  const fetchMatches = jsText.match(/\b(?:fetch|axios\.[a-z]+)\s*\(/gi) || [];
  const storageMatches = jsText.match(/\b(?:localStorage|sessionStorage)\b/g) || [];
  const importedLibraries = new Set();
  const importPattern = /(?:import\s+(?:.+?\s+from\s+)?|require\()\s*["']([^"']+)["']/gi;
  let importMatch;
  while ((importMatch = importPattern.exec(jsText)) !== null) {
    const library = String(importMatch[1] || "").trim();
    if (library && !library.startsWith(".") && !library.startsWith("/")) importedLibraries.add(library);
  }

  return {
    files: javascriptContents.length,
    functions: functionMatches.length,
    event_listeners: eventListenerMatches.length,
    dom_accesses: domMatches.length,
    fetch_api_calls: fetchMatches.length,
    storage_detected: storageMatches.length > 0,
    imported_libraries: importedLibraries.size,
    repeated_code_blocks: false
  };
}

// Public-repo-only: counts files by type, flags oversized images, and cross-references
// HTML/CSS/JS files against the tree to find unused images and broken local links.
app.get("/api/integrations/github/asset-health", async (req, res) => {
  const repoUrl = String(req.query?.repo_url || req.query?.repoUrl || "").trim();
  const identifier = parseGithubRepoIdentifier(repoUrl);
  if (!identifier?.owner || !identifier?.repo) {
    res.status(400).json({ error: "A valid public GitHub repository URL is required." });
    return;
  }

  try {
    const repoInfo = await githubApiRequest(`/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}`);
    const defaultBranch = String(repoInfo?.default_branch || "main").trim();

    const treePayload = await githubApiRequest(
      `/repos/${encodeURIComponent(identifier.owner)}/${encodeURIComponent(identifier.repo)}/git/trees/${encodeURIComponent(defaultBranch)}`,
      { recursive: "1" }
    );
    const blobs = (Array.isArray(treePayload?.tree) ? treePayload.tree : []).filter((item) => item?.type === "blob");
    const blobPaths = new Set(blobs.map((item) => String(item?.path || "").trim()).filter(Boolean));

    const countByExt = (pattern) => blobs.filter((item) => pattern.test(String(item?.path || ""))).length;
    const totalSizeBytes = blobs.reduce((sum, item) => sum + (Number(item?.size || 0) || 0), 0);
    const imageStats = extractImageStatsFromTree(blobs);
    const oversizedImageCount = blobs.filter((item) => {
      const filePath = String(item?.path || "").toLowerCase();
      const extMatch = filePath.match(/\.[a-z0-9]+$/);
      if (!extMatch || !GITHUB_IMAGE_EXTENSIONS.has(extMatch[0])) return false;
      return Number(item?.size || 0) > GITHUB_OPTIMISED_IMAGE_MAX_BYTES;
    }).length;

    const filesToScan = Array.from(blobPaths)
      .filter((filePath) => /\.(?:html?|css|js)$/i.test(filePath))
      .slice(0, GITHUB_ASSET_HEALTH_MAX_SCANNED_FILES);

    const referencedPaths = new Set();
    const brokenReferences = [];
    const cssContents = [];
    const htmlContents = [];
    const javascriptContents = [];
    await Promise.all(filesToScan.map(async (filePath) => {
      try {
        const rawUrl = `${GITHUB_RAW_CONTENT_BASE}/${identifier.owner}/${identifier.repo}/${defaultBranch}/${filePath}`;
        const response = await fetch(rawUrl, { headers: { "User-Agent": "DTECH-HUB" } });
        if (!response.ok) return;
        const content = await response.text();
        if (/\.css$/i.test(filePath)) cssContents.push(content);
        if (/\.html?$/i.test(filePath)) htmlContents.push(content);
        if (/\.js$/i.test(filePath)) javascriptContents.push(content);
        extractLocalReferencesFromContent(content).forEach((ref) => {
          const resolved = resolveGithubRelativePath(filePath, ref);
          if (!resolved) return;
          referencedPaths.add(resolved);
          if (!blobPaths.has(resolved)) {
            brokenReferences.push({ from: filePath, reference: ref });
          }
        });
      } catch (_scanError) {
        // Best-effort: skip files that fail to fetch rather than failing the whole scan.
      }
    }));

    const imagePaths = Array.from(blobPaths).filter((filePath) => {
      const extMatch = filePath.toLowerCase().match(/\.[a-z0-9]+$/);
      return extMatch && GITHUB_IMAGE_EXTENSIONS.has(extMatch[0]);
    });
    const unusedImages = imagePaths.filter((filePath) => !referencedPaths.has(filePath));
    const filesWithExtension = (extensions) => blobs.filter((item) => {
      const extMatch = String(item?.path || "").toLowerCase().match(/\.[a-z0-9]+$/);
      return extMatch && extensions.has(extMatch[0]);
    });
    const videoFiles = filesWithExtension(GITHUB_VIDEO_EXTENSIONS);
    const audioFiles = filesWithExtension(GITHUB_AUDIO_EXTENSIONS);
    const graphicFiles = filesWithExtension(GITHUB_GRAPHIC_EXTENSIONS);
    const projectFiles = filesWithExtension(GITHUB_VIDEO_PROJECT_EXTENSIONS);
    const sourceMediaBytes = [...videoFiles, ...audioFiles, ...imagePaths.map((filePath) => blobs.find((item) => item.path === filePath)), ...graphicFiles]
      .filter(Boolean)
      .reduce((sum, item) => sum + (Number(item?.size || 0) || 0), 0);
    const videoFormats = Array.from(new Set(videoFiles.map((item) => String(item.path || "").match(/\.[a-z0-9]+$/i)?.[0]?.slice(1).toUpperCase()).filter(Boolean)));
    const audioFormats = Array.from(new Set(audioFiles.map((item) => String(item.path || "").match(/\.[a-z0-9]+$/i)?.[0]?.slice(1).toUpperCase()).filter(Boolean)));
    const imageFormats = Array.from(new Set(imagePaths.map((filePath) => filePath.match(/\.[a-z0-9]+$/i)?.[0]?.slice(1).toUpperCase()).filter(Boolean)));
    const oversizedAssetCount = [...videoFiles, ...audioFiles, ...graphicFiles]
      .filter((item) => Number(item?.size || 0) > 100 * 1024 * 1024).length;

    // Image production breakdown: raster photos/exports, vector graphics, and layered
    // source files (.psd/.ai/.xcf etc.) tracked separately since none share a single "media" bucket.
    const layeredSourceFiles = filesWithExtension(GITHUB_IMAGE_PROJECT_EXTENSIONS);
    const vectorFormats = Array.from(new Set(graphicFiles.map((item) => String(item.path || "").match(/\.[a-z0-9]+$/i)?.[0]?.slice(1).toUpperCase()).filter(Boolean)));
    const sourceFileFormats = Array.from(new Set(layeredSourceFiles.map((item) => String(item.path || "").match(/\.[a-z0-9]+$/i)?.[0]?.slice(1).toUpperCase()).filter(Boolean)));
    const rasterImageBlobs = imagePaths.map((filePath) => blobs.find((item) => item.path === filePath)).filter(Boolean);
    const totalImageAssetBytes = [...rasterImageBlobs, ...graphicFiles, ...layeredSourceFiles]
      .reduce((sum, item) => sum + (Number(item?.size || 0) || 0), 0);

    // Deeper detection: inspect all committed FCPXML timeline exports (Resolve 'Export Timeline')
    // and cumulatively aggregate detected practices across all exported timelines.
    const fcpxmlCandidates = blobs
      .filter((item) => /\.(?:fcpxml)$/i.test(String(item?.path || "")) || (/\.xml$/i.test(String(item?.path || "")) && !/\b(?:project|archive)\b/i.test(String(item?.path || ""))))
      .sort((left, right) => Number(right?.size || 0) - Number(left?.size || 0));
    const fcpxmlFiles = [];
    const allFcpxmlLabelsSet = new Set();
    for (const candidate of fcpxmlCandidates) {
      const candidatePath = String(candidate?.path || "").trim();
      const content = await fetchGithubRepoRawFile(identifier.owner, identifier.repo, defaultBranch, candidatePath);
      const labels = parseFcpxmlVideoTools(content);
      if (labels.length > 0 || candidatePath.endsWith(".fcpxml")) {
        fcpxmlFiles.push({ file: candidatePath, labels });
        labels.forEach((label) => allFcpxmlLabelsSet.add(label));
      }
    }
    const allFcpxmlLabels = Array.from(allFcpxmlLabelsSet);
    const primaryFcpxmlPath = fcpxmlFiles[0]?.file || "";
    const assetVideoToolsCategories = mergeVideoToolsCategories(
      computeGithubVideoEfficientToolsCategories(blobs, 0).categories,
      allFcpxmlLabels
    );
    const fcpxmlDetected = { file: primaryFcpxmlPath, labels: allFcpxmlLabels, files: fcpxmlFiles };

    // Deeper detection: parse committed PSD layer structure (real layers, masks, adjustment
    // layers, smart objects, type layers, guides) rather than only inferring from the extension.
    const psdSignals = await computeGithubPsdSignals(identifier.owner, identifier.repo, defaultBranch, blobs);

    const javascriptFileCount = countByExt(GITHUB_JS_EXTENSION);
    const topLevelFolders = new Set(
      Array.from(blobPaths)
        .filter((filePath) => filePath.includes("/"))
        .map((filePath) => filePath.split("/")[0].toLowerCase())
    );
    const hasOrganisedAssetFolders = Array.from(topLevelFolders).some((folder) => GITHUB_ASSET_FOLDER_NAMES.has(folder));
    const htmlFileCount = countByExt(/\.html?$/i);
    const cssFileCount = countByExt(/\.css$/i);
    const webToolsCategories = [
      { label: "Management of assets", done: hasOrganisedAssetFolders },
      { label: "Using stylesheets", done: cssFileCount > 0 },
      { label: "Master pages or student developed templates", done: htmlFileCount >= 2 && cssFileCount > 0 },
      buildGithubCommentingCategory([...htmlContents, ...cssContents, ...javascriptContents]),
      { label: "Reusing objects, styles and/or frames", done: cssFileCount > 0 && htmlFileCount >= 2 },
      { label: "HTML/CSS validation procedures", done: htmlFileCount > 0 && cssFileCount > 0 && brokenReferences.length === 0 },
      { label: "Optimisation of media assets", done: imageStats.count > 0 && imageStats.maxBytes > 0 && imageStats.maxBytes <= GITHUB_OPTIMISED_IMAGE_MAX_BYTES }
    ];

    res.json({
      ok: true,
      owner: identifier.owner,
      repo: identifier.repo,
      default_branch: defaultBranch,
      counts: {
        html: countByExt(/\.html?$/i),
        css: countByExt(/\.css$/i),
        javascript: javascriptFileCount,
        images: imageStats.count,
        media: blobs.filter((item) => {
          const extMatch = String(item?.path || "").toLowerCase().match(/\.[a-z0-9]+$/);
          return extMatch && GITHUB_MEDIA_EXTENSIONS.has(extMatch[0]);
        }).length
      },
      total_size_bytes: totalSizeBytes,
      oversized_image_count: oversizedImageCount,
      unused_image_count: unusedImages.length,
      unused_images: unusedImages.slice(0, 50),
      broken_reference_count: brokenReferences.length,
      broken_references: brokenReferences.slice(0, 50),
      video_details: {
        total_files: blobs.length,
        video_clips: videoFiles.length,
        audio_files: audioFiles.length,
        images: imagePaths.length,
        graphics: graphicFiles.length,
        project_files: projectFiles.length,
        total_media_files: videoFiles.length + audioFiles.length + imagePaths.length + graphicFiles.length,
        total_source_media_bytes: sourceMediaBytes,
        video_formats: videoFormats,
        audio_formats: audioFormats,
        image_formats: imageFormats,
        missing_offline_media: brokenReferences.length,
        duplicate_assets: 0,
        oversized_assets: oversizedAssetCount
      },
      web_tools_categories: webToolsCategories,
      image_tools_categories: mergeVideoToolsCategories(
        computeGithubImageEfficientToolsCategories(blobs, imageStats).categories,
        psdSignals.labels
      ),
      video_tools_categories: assetVideoToolsCategories,
      image_details: {
        total_files: blobs.length,
        raster_images: imagePaths.length,
        vector_graphics: graphicFiles.length,
        layered_source_files: layeredSourceFiles.length,
        total_image_assets: imagePaths.length + graphicFiles.length + layeredSourceFiles.length,
        total_source_bytes: totalImageAssetBytes,
        image_formats: imageFormats,
        vector_formats: vectorFormats,
        source_file_formats: sourceFileFormats,
        oversized_images: oversizedImageCount
      },
      fcpxml_detected: fcpxmlDetected,
      psd_detected: { file: psdSignals.files[0]?.file || "", labels: psdSignals.labels, files: psdSignals.files },
      css_details: buildCssHealthDetails(cssContents, htmlContents),
      html_details: buildHtmlHealthDetails(htmlContents),
      link_details: buildLinkHealthDetails(htmlContents),
      javascript_details: buildJavascriptHealthDetails(javascriptContents),
      scanned_file_count: filesToScan.length
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    res.status(status).json({
      error: status === 404
        ? "Could not find that GitHub repository. Make sure it is public and the link is correct."
        : (error.message || "Could not analyse the GitHub repository.")
    });
  }
});

app.get("/api/admin/user-roles", async (_req, res) => {
  if (!hasDatabase) {
    res.json(Array.from(memoryUserRoles.values()));
    return;
  }

  try {
    const columns = await resolveUserRolesColumns();
    if (!columns.email) {
      res.json([]);
      return;
    }

    const selectColumns = [
      columns.userType ? `${quoteIdentifier(columns.userType)} AS user_type` : `'Staff' AS user_type`,
      `${quoteIdentifier(columns.email)} AS user_email`,
      columns.displayName ? `${quoteIdentifier(columns.displayName)} AS display_name` : `'' AS display_name`,
      columns.additionalRole && columns.legacyRoleName && columns.additionalRole !== columns.legacyRoleName
        ? `COALESCE(NULLIF(${quoteIdentifier(columns.additionalRole)}, ''), ${quoteIdentifier(columns.legacyRoleName)}) AS additional_role`
        : columns.additionalRole
          ? `${quoteIdentifier(columns.additionalRole)} AS additional_role`
          : `'' AS additional_role`,
      columns.hubAccess
        ? `${quoteIdentifier(columns.hubAccess)} AS hub_access`
        : `ARRAY['DTECH-HUB']::text[] AS hub_access`
    ];

    const orderByColumn = columns.updatedAt || columns.email;

    const result = await pool.query(
      `SELECT ${selectColumns.join(", ")} FROM user_additional_roles ORDER BY ${quoteIdentifier(orderByColumn)} DESC`
    );
    const mergedByEmail = new Map();
    result.rows.forEach((row) => {
      const email = normalizeEmail(row.user_email);
      if (email) mergedByEmail.set(email, row);
    });
    for (const row of memoryUserRoles.values()) {
      const email = normalizeEmail(row.user_email);
      if (email && !mergedByEmail.has(email)) {
        mergedByEmail.set(email, row);
      }
    }
    res.json(Array.from(mergedByEmail.values()));
  } catch (error) {
    console.error("Could not load user roles", error);
    res.json(Array.from(memoryUserRoles.values()));
  }
});

app.post("/api/admin/user-roles", async (req, res) => {
  const body = req.body || {};
  const userType = String(body.user_type || "").trim();
  const userEmail = normalizeEmail(body.user_email);
  const additionalRole = String(body.additional_role || "").trim();
  const displayName = String(body.display_name || "").trim();
  const hubAccessInput = Array.isArray(body.hub_access)
    ? body.hub_access
    : String(body.hub_access || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const hubAccess = Array.from(new Set(hubAccessInput.length ? hubAccessInput : ["DTECH-HUB"]));

  if (!userType || !userEmail || !additionalRole) {
    res.status(400).send("user_type, user_email and additional_role are required");
    return;
  }

  const payload = {
    user_type: userType,
    user_email: userEmail,
    display_name: displayName,
    additional_role: additionalRole,
    hub_access: hubAccess
  };

  if (!hasDatabase) {
    memoryUserRoles.set(userEmail, payload);
    res.status(201).json(payload);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const columns = await resolveUserRolesColumns();
    if (!columns.email) {
      throw new Error("Missing user_email column");
    }

    const updateAssignments = [];
    const updateValues = [userEmail];

    if (columns.userType) {
      updateAssignments.push(`user_type = $${updateValues.length + 1}`);
      updateValues.push(userType);
    }
    if (columns.displayName) {
      updateAssignments.push(`display_name = $${updateValues.length + 1}`);
      updateValues.push(displayName);
    }
    if (columns.additionalRole) {
      updateAssignments.push(`additional_role = $${updateValues.length + 1}`);
      updateValues.push(additionalRole);
    }
    if (columns.legacyRoleName && columns.legacyRoleName !== columns.additionalRole) {
      updateAssignments.push(`role_name = $${updateValues.length + 1}`);
      updateValues.push(additionalRole);
    }
    if (columns.hubAccess) {
      updateAssignments.push(`hub_access = $${updateValues.length + 1}`);
      updateValues.push(hubAccess);
    }
    if (columns.updatedAt) {
      updateAssignments.push("updated_at = NOW()");
    }

    const returnColumns = [
      columns.userType ? `${quoteIdentifier(columns.userType)} AS user_type` : `'Staff' AS user_type`,
      `${quoteIdentifier(columns.email)} AS user_email`,
      columns.displayName ? `${quoteIdentifier(columns.displayName)} AS display_name` : `'' AS display_name`,
      columns.additionalRole && columns.legacyRoleName && columns.additionalRole !== columns.legacyRoleName
        ? `COALESCE(NULLIF(${quoteIdentifier(columns.additionalRole)}, ''), ${quoteIdentifier(columns.legacyRoleName)}) AS additional_role`
        : columns.additionalRole
          ? `${quoteIdentifier(columns.additionalRole)} AS additional_role`
          : `'' AS additional_role`,
      columns.hubAccess
        ? `${quoteIdentifier(columns.hubAccess)} AS hub_access`
        : `ARRAY['DTECH-HUB']::text[] AS hub_access`
    ];

    const updateSqlAssignments = updateAssignments
      .map((assignment) => assignment
        .replace("user_type", columns.userType ? quoteIdentifier(columns.userType) : "user_type")
        .replace("display_name", columns.displayName ? quoteIdentifier(columns.displayName) : "display_name")
        .replace("additional_role", columns.additionalRole ? quoteIdentifier(columns.additionalRole) : "additional_role")
        .replace("role_name", columns.legacyRoleName ? quoteIdentifier(columns.legacyRoleName) : "role_name")
        .replace("hub_access", columns.hubAccess ? quoteIdentifier(columns.hubAccess) : "hub_access")
        .replace("updated_at", columns.updatedAt ? quoteIdentifier(columns.updatedAt) : "updated_at"));

    const updateResult = updateSqlAssignments.length
      ? await client.query(
          `
            UPDATE user_additional_roles
            SET ${updateSqlAssignments.join(", ")}
            WHERE LOWER(${quoteIdentifier(columns.email)}) = LOWER($1)
            RETURNING ${returnColumns.join(", ")}
          `,
          updateValues
        )
      : { rows: [] };

    let savedRow = updateResult.rows[0];

    if (!savedRow) {
      const insertColumns = [quoteIdentifier(columns.email)];
      const insertValues = [userEmail];

      if (columns.userType) {
        insertColumns.push(quoteIdentifier(columns.userType));
        insertValues.push(userType);
      }
      if (columns.displayName) {
        insertColumns.push(quoteIdentifier(columns.displayName));
        insertValues.push(displayName);
      }
      if (columns.additionalRole) {
        insertColumns.push(quoteIdentifier(columns.additionalRole));
        insertValues.push(additionalRole);
      }
      if (columns.legacyRoleName && columns.legacyRoleName !== columns.additionalRole) {
        insertColumns.push(quoteIdentifier(columns.legacyRoleName));
        insertValues.push(additionalRole);
      }
      if (columns.hubAccess) {
        insertColumns.push(quoteIdentifier(columns.hubAccess));
        insertValues.push(hubAccess);
      }

      const valuePlaceholders = insertValues.map((_, index) => `$${index + 1}`);
      if (columns.updatedAt) {
        insertColumns.push(quoteIdentifier(columns.updatedAt));
        valuePlaceholders.push("NOW()");
      }

      const insertResult = await client.query(
        `
          INSERT INTO user_additional_roles (
            ${insertColumns.join(", ")}
          ) VALUES (
            ${valuePlaceholders.join(", ")}
          )
          RETURNING ${returnColumns.join(", ")}
        `,
        insertValues
      );

      savedRow = insertResult.rows[0];
    }

    await client.query("COMMIT");

    res.status(201).json(savedRow);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Could not save user role", error);
    memoryUserRoles.set(userEmail, payload);
    res.status(201).json(payload);
  } finally {
    client.release();
  }
});

app.delete("/api/admin/user-roles/:email", async (req, res) => {
  const email = normalizeEmail(req.params.email);
  if (!email) {
    res.status(400).send("email is required");
    return;
  }

  memoryUserRoles.delete(email);

  if (!hasDatabase) {
    res.status(204).send();
    return;
  }

  try {
    const columns = await resolveUserRolesColumns();
    if (!columns.email) {
      res.status(204).send();
      return;
    }

    await pool.query(
      `DELETE FROM user_additional_roles WHERE LOWER(${quoteIdentifier(columns.email)}) = LOWER($1)`,
      [email]
    );
    res.status(204).send();
  } catch (error) {
    console.error("Could not remove user role", error);
    res.status(204).send();
  }
});

app.get("/api/admin/role-permissions", async (_req, res) => {
  try {
    const permissions = await getMergedRolePermissions();
    res.json(permissions);
  } catch (_error) {
    res.status(500).json({ error: "Could not load role permissions" });
  }
});

app.put("/api/admin/role-permissions", async (req, res) => {
  const rows = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  if (!rows.length) {
    res.status(400).send("permissions array is required");
    return;
  }

  const normalized = rows.map((row) => ({
    role_name: canonicalizeRoleName(row.role_name),
    home_page: Boolean(row.home_page),
    upload_activity: Boolean(row.upload_activity),
    browse_activities: Boolean(row.browse_activities),
    planning: Boolean(row.planning),
    admin: Boolean(row.admin)
  })).filter((row) => row.role_name);

  const merged = mergeRolePermissionRows(normalized);

  if (!merged.length) {
    res.status(400).send("at least one valid role permission row is required");
    return;
  }

  if (!hasDatabase) {
    memoryRolePermissions = merged;
    res.json({ ok: true });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions");

    for (const row of merged) {
      await client.query(
        `
          INSERT INTO role_permissions (
            role_name, home_page, upload_activity, browse_activities, planning, admin, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
        [row.role_name, row.home_page, row.upload_activity, row.browse_activities, row.planning, row.admin]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (_error) {
    await client.query("ROLLBACK");
    res.status(500).send("Could not update role permissions");
  } finally {
    client.release();
  }
});

app.post("/api/admin/role-permissions/reset", async (_req, res) => {
  if (!hasDatabase) {
    memoryRolePermissions = DEFAULT_ROLE_PERMISSIONS.map((row) => ({ ...row }));
    res.json({ ok: true, permissions: memoryRolePermissions });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM role_permissions");

    for (const row of DEFAULT_ROLE_PERMISSIONS) {
      await client.query(
        `
          INSERT INTO role_permissions (
            role_name, home_page, upload_activity, browse_activities, planning, admin, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
        [row.role_name, row.home_page, row.upload_activity, row.browse_activities, row.planning, row.admin]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true, permissions: DEFAULT_ROLE_PERMISSIONS });
  } catch (_error) {
    await client.query("ROLLBACK");
    res.status(500).send("Could not reset role permissions");
  } finally {
    client.release();
  }
});

// GET /api/lessons — List all lessons
app.get("/api/lessons", async (_req, res) => {
  if (!hasDatabase) {
    const lessonsArray = Array.from(memoryLessons.values()).sort((left, right) => {
      const leftTime = new Date(left.created_at || 0);
      const rightTime = new Date(right.created_at || 0);
      return rightTime - leftTime;
    });
    res.json(lessonsArray);
    return;
  }

  try {
    const result = await pool.query(`SELECT * FROM ${lessonTable} ORDER BY created_at DESC`);
    res.json([...result.rows, ...await legacyLessons.list()]);
  } catch (error) {
    console.error("Lesson library error:", error);
    res.status(500).json({ error: "Could not load the lesson library." });
  }
});

// Reuse the integrated Learning Sites calendar through the shared school session.
app.get("/api/relief-plan/events", requireSchoolAccountAccess, async (_req, res) => {
  try {
    res.json(await integration.getReliefPlanEvents());
  } catch (error) {
    console.error("Shared Relief Plan error:", error);
    res.status(502).json({ ok: false, error: "The Relief Plan is currently unavailable" });
  }
});

// GET /api/lessons/:id — Get a specific lesson
app.get("/api/lessons/:id", async (req, res) => {
  const found = memoryLessons.get(req.params.id);
  if (found) {
    res.json(found);
    return;
  }

  if (!hasDatabase) {
    res.status(404).send("Lesson not found");
    return;
  }

  try {
    const legacyId = req.params.id.startsWith("legacy-course-") ? req.params.id.slice("legacy-course-".length) : null;
    const result = legacyId === null
      ? await pool.query(`SELECT * FROM ${lessonTable} WHERE id = $1`, [req.params.id])
      : { rows: await legacyLessons.list(legacyId) };
    if (result.rows && result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).send("Lesson not found");
    }
  } catch (error) {
    console.error("Lesson load error:", error);
    res.status(500).json({ error: "Could not load the lesson." });
  }
});

// GET /api/relief-lessons/:courseCode — List database-backed lesson plans for a DTECH class
app.get("/api/relief-lessons/:courseCode", requireSchoolAccountAccess, async (req, res) => {
  const courseCode = String(req.params.courseCode || "").trim().toUpperCase();
  if (!courseCode) {
    res.status(400).json({ error: "Course code is required" });
    return;
  }

  if (!hasDatabase) {
    const lessons = Array.from(memoryLessons.values()).filter((lesson) =>
      String(lesson.relief_course_code || "").trim().toUpperCase() === courseCode
    );
    res.json({ courseCode, lessons });
    return;
  }

  try {
    let result = await pool.query(
      `SELECT * FROM ${lessonTable} WHERE UPPER(TRIM(relief_course_code)) = $1 AND publish_activity = TRUE ORDER BY lesson_date ASC NULLS LAST, lesson_title ASC`,
      [courseCode]
    );

    if (courseCode === "SENIORDTECH" && (!result.rows || result.rows.length === 0)) {
      const seededLesson = await seedOzoneLayerReliefLesson();
      result = await pool.query(
        `SELECT * FROM ${lessonTable} WHERE UPPER(TRIM(relief_course_code)) = $1 AND publish_activity = TRUE ORDER BY lesson_date ASC NULLS LAST, lesson_title ASC`,
        [courseCode]
      );
      if (!result.rows || result.rows.length === 0) {
        result = { rows: [seededLesson] };
      }
    }

    res.json({ courseCode, lessons: result.rows || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load Relief Lessons" });
  }
});

app.post("/api/lessons/preview-relief-docx", requireSchoolAccountAccess, lessonResourceUpload.array("resourceFiles", 12), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const docxFile = files.find((file) => String(file.originalname || "").toLowerCase().endsWith(".docx"));
  if (!docxFile) {
    res.status(400).json({ error: "Select a lesson-plan DOCX file to preview." });
    return;
  }

  try {
    const extraction = await mammoth.convertToHtml({ buffer: docxFile.buffer });
    res.json({ ok: true, lesson: parseReliefLessonPlanHtml(extraction.value || "") });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not parse the lesson-plan DOCX." });
  }
});

// POST /api/lessons — Create a new lesson
app.post("/api/lessons", lessonResourceUpload.fields([{ name: "resourceFiles", maxCount: 12 }, { name: "exemplarFile", maxCount: 1 }]), async (req, res) => {
  try {
  const body = req.body || {};
  const lessonTitle = String(body.lesson_title || body.lessonTitle || "").trim();
  const lessonType = String(body.lesson_type || body.lessonType || "").trim();
  const activityName = String(body.activity_name || body.activityName || "").trim();
  const lessonYearLevel = String(body.lesson_year_level || body.lessonYearLevel || "").trim();
  const lessonFocus = String(body.lesson_focus || body.lessonFocus || "").trim();

  if (!lessonTitle || !lessonType || !activityName || !lessonYearLevel || !lessonFocus) {
    res.status(400).send("lesson_title, lesson_type, activity_name, lesson_year_level, and lesson_focus are required");
    return;
  }

  const lessonId = String(body.id || `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  if (lessonId.startsWith("legacy-course-")) {
    res.status(409).json({ error: "Existing course lessons are read-only. Upload a new lesson instead." });
    return;
  }
  const parseBooleanPayload = (value) => value === true || value === "true" || value === "1" || value === 1 || value === "on";
  let parsedLessonPlan = body.lesson_plan;
  if (typeof parsedLessonPlan === "string") {
    try {
      parsedLessonPlan = JSON.parse(parsedLessonPlan);
    } catch (_error) {
      parsedLessonPlan = {};
    }
  }
  const lessonPlan = parsedLessonPlan && typeof parsedLessonPlan === "object" ? { ...parsedLessonPlan } : {};
  const resourceFiles = Array.isArray(req.files?.resourceFiles) ? req.files.resourceFiles : [];
  const exemplarFiles = Array.isArray(req.files?.exemplarFile) ? req.files.exemplarFile : [];
  if (resourceFiles.length) {
    const uploadDirectory = path.join(__dirname, "TeacherFiles", "Lesson Plans", "Uploaded");
    await fs.promises.mkdir(uploadDirectory, { recursive: true });
    const uploadedResources = [];
    for (const file of resourceFiles) {
      const safeName = String(file.originalname || "resource")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "resource";
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      await integration.saveTeachingFile(`Lesson Plans/Uploaded/${storedName}`, file.buffer, file.mimetype);
      uploadedResources.push({
        label: String(file.originalname || safeName),
        url: `/TeacherFiles/Lesson%20Plans/Uploaded/${encodeURIComponent(storedName)}`
      });
    }
    lessonPlan.attachedResources = [
      ...(Array.isArray(lessonPlan.attachedResources) ? lessonPlan.attachedResources : []),
      ...uploadedResources
    ];
  }
  if (exemplarFiles.length) {
    const file = exemplarFiles[0];
    const uploadDirectory = path.join(__dirname, "TeacherFiles", "Lesson Plans", "Uploaded");
    await fs.promises.mkdir(uploadDirectory, { recursive: true });
    const safeName = String(file.originalname || "exemplar").replace(/[^a-zA-Z0-9._-]+/g, "-") || "exemplar";
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    await integration.saveTeachingFile(`Lesson Plans/Uploaded/${storedName}`, file.buffer, file.mimetype);
    lessonPlan.exemplar = { label: String(file.originalname || safeName), url: `/TeacherFiles/Lesson%20Plans/Uploaded/${encodeURIComponent(storedName)}` };
  }

  const payload = {
    id: lessonId,
    lesson_title: lessonTitle,
    lesson_week: String(body.lesson_week || body.lessonWeek || "").trim(),
    lesson_date: String(body.lesson_date || body.lessonDate || "").trim(),
    lesson_duration_minutes: Number.parseInt(body.lesson_duration_minutes ?? body.lessonDurationMinutes ?? "60", 10) || 60,
    lesson_type: lessonType,
    lesson_card_color: String(body.lesson_card_color || body.lessonCardColor || "Rose").trim(),
    activity_name: activityName,
    lesson_year_level: lessonYearLevel,
    lesson_link_url: String(body.lesson_link_url || body.lessonLinkUrl || "").trim(),
    lesson_focus: lessonFocus,
    lesson_notes: String(body.lesson_notes || body.lessonNotes || "").trim(),
    relief_course_code: String(body.relief_course_code || body.reliefCourseCode || "").trim().toUpperCase(),
    lesson_plan: lessonPlan,
    publish_activity: parseBooleanPayload(body.publish_activity ?? body.publishActivity),
    add_to_calendar: parseBooleanPayload(body.add_to_calendar ?? body.addToCalendar),
    created_by_email: String(body.created_by_email || getRequestUserEmail(req) || "").trim(),
    created_at: String(body.created_at || new Date().toISOString()),
    updated_at: new Date().toISOString()
  };

  if (!hasDatabase) {
    memoryLessons.set(payload.id, payload);
    res.status(201).json(payload);
    return;
  }

    const result = await pool.query(
      `INSERT INTO ${lessonTable}
      (id, lesson_title, lesson_week, lesson_date, lesson_duration_minutes, lesson_type, lesson_card_color,
       activity_name, lesson_year_level, lesson_link_url, lesson_focus, lesson_notes, relief_course_code, lesson_plan,
       publish_activity, add_to_calendar, created_by_email, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19)
       ON CONFLICT(id) DO UPDATE SET
       lesson_title = EXCLUDED.lesson_title,
       lesson_week = EXCLUDED.lesson_week,
       lesson_date = EXCLUDED.lesson_date,
       lesson_duration_minutes = EXCLUDED.lesson_duration_minutes,
       lesson_type = EXCLUDED.lesson_type,
       lesson_card_color = EXCLUDED.lesson_card_color,
       activity_name = EXCLUDED.activity_name,
       lesson_year_level = EXCLUDED.lesson_year_level,
       lesson_link_url = EXCLUDED.lesson_link_url,
       lesson_focus = EXCLUDED.lesson_focus,
       lesson_notes = EXCLUDED.lesson_notes,
      relief_course_code = EXCLUDED.relief_course_code,
      lesson_plan = EXCLUDED.lesson_plan,
       publish_activity = EXCLUDED.publish_activity,
       add_to_calendar = EXCLUDED.add_to_calendar,
       updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        payload.id, payload.lesson_title, payload.lesson_week, payload.lesson_date,
        payload.lesson_duration_minutes, payload.lesson_type, payload.lesson_card_color,
        payload.activity_name, payload.lesson_year_level, payload.lesson_link_url,
        payload.lesson_focus, payload.lesson_notes, payload.relief_course_code, JSON.stringify(payload.lesson_plan), payload.publish_activity,
        payload.add_to_calendar, payload.created_by_email, payload.created_at, payload.updated_at
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Lesson save error:", error);
    res.status(500).send(`Could not save lesson: ${String(error?.message || "Unknown error")}`);
  }
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "DTECH-HUB",
    startedAt: SERVER_STARTED_AT,
    hasDatabase
  });
});

app.get("/assessment-standard-card.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "assessment-standard-card.html"));
});

app.get("*", (_req, res) => {
  res.status(404).json({ error: "DTECH route not found." });
});

return {
  app,
  pool,
  async initialize() {
    if (hasDatabase && await legacyLessons.initialize()) lessonTable = "whs_dtech_lessons";
    await ensureSchema();
    await syncDtechExcludedActivitiesVisibility();
    const tables = await resolveExistingTableNames(STUDENT_TABLE_CANDIDATES);
    await syncStudentTimetableClasses(tables, { force: true });
  }
};
};
