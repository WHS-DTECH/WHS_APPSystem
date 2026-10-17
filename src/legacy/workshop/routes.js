const express = require('express');
const multer = require('multer');
const JSZip = require('jszip');
const crypto = require('crypto');
const path = require('path');
const { pool } = require('../../db');
const config = require('../../config');
const { sendEmail } = require('../../email');

// Legacy Workshop Hub API, ported from the original TECH-WORKSHOP server.js.
// Only login, sessions and role tables were replaced; they now come from the app's Google session.
const router = express.Router();


// Email uses the framework's Google Gmail API sender (src/email.js) instead of the legacy SMTP transport.
const hasMailerConfig = config.email.gmail.isConfigured;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value) {
  const email = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normaliseHttpUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Multer — memory storage (keeps PDF in RAM, stores in DB as buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

// Upload image for activity cards (PNG/JPG/JPEG only)
const uploadOutcomeImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG and JPG images are allowed'));
  }
});

// Upload supporting assessment images (up to 5 PNG/JPG files)
const uploadAssessmentImages = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG and JPG images are allowed'));
  }
});

const uploadPlannerDocx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || String(file.originalname || '').toLowerCase().endsWith('.docx');
    if (isDocx) cb(null, true);
    else cb(new Error('Only DOCX files are allowed'));
  }
});

const uploadTopicsDocx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || String(file.originalname || '').toLowerCase().endsWith('.docx');
    if (isDocx) cb(null, true);
    else cb(new Error('Only DOCX files are allowed'));
  }
});

const uploadWorksheetFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];

    const allowedExtension = name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.doc');
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtension) {
      cb(null, true);
      return;
    }

    cb(new Error('Only PDF and Word files are allowed for worksheets.'));
  }
});

const uploadWorksheetFiles = uploadWorksheetFile.fields([
  { name: 'worksheet_files', maxCount: 40 },
  { name: 'worksheet_file', maxCount: 1 },
]);

function inferWorksheetCategory(sourceText) {
  const text = String(sourceText || '').toLowerCase();

  if (/safety|safe\b/.test(text)) return 'Safety';
  if (/hand\s*tools?|tools?\s*hand/.test(text)) return 'Hand tools';
  if (/abrasive|abrasives|sandpaper|sanding/.test(text)) return 'Abrasives';
  if (/joint|joints|process|processes/.test(text)) return 'Joints and Processes';
  if (/finish|finishes|finishing|stain|varnish|polyurethane|oil\b|wax|lacquer/.test(text)) return 'Type of wood finishes';

  return 'Uncategorized';
}

function normaliseSyncText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function worksheetSyncKey(entry) {
  const title = normaliseSyncText(entry.worksheetTitle ?? entry.worksheet_title);
  const strandTitle = normaliseSyncText(entry.strandTitle ?? entry.strand_title);
  const strandNumber = Number.isInteger(entry.strandNumber)
    ? entry.strandNumber
    : (Number.isInteger(entry.strand_number) ? entry.strand_number : null);
  const strandPart = strandNumber === null ? 'no-strand' : `strand-${strandNumber}`;
  return `${strandPart}|strand-title-${strandTitle || 'none'}|${title}`;
}

function lessonNoteSyncKey(entry) {
  const title = normaliseSyncText(entry.lessonNoteTitle ?? entry.lesson_note_title);
  const strandTitle = normaliseSyncText(entry.strandTitle ?? entry.strand_title);
  const strandNumber = Number.isInteger(entry.strandNumber)
    ? entry.strandNumber
    : (Number.isInteger(entry.strand_number) ? entry.strand_number : null);
  const strandPart = strandNumber === null ? 'no-strand' : `strand-${strandNumber}`;
  return `${strandPart}|strand-title-${strandTitle || 'none'}|${title}`;
}

async function extractWorksheetTitlesFromDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) return [];

  const documentXml = await documentEntry.async('string');
  const paragraphMatches = [...String(documentXml || '').matchAll(/<w:p(?:\s|>)[\s\S]*?<\/w:p>/gi)];

  const paragraphs = paragraphMatches.map((paragraphMatch) => {
    const paragraphXml = paragraphMatch[0];
    const textMatches = [...paragraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)];
    const text = textMatches.map(match => match[1]).join(' ');
    return String(text || '').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);

  const worksheetTitles = paragraphs.filter((paragraph) => {
    if (!/worksheet\b/i.test(paragraph)) return false;
    if (/strand\s*\d+/i.test(paragraph)) return false;
    if (/lesson\s*notes?/i.test(paragraph)) return false;
    return true;
  });

  return [...new Set(worksheetTitles)];
}

async function extractWorksheetStructureFromDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    return { lessonNotes: [], worksheets: [] };
  }

  const documentXml = await documentEntry.async('string');
  const paragraphMatches = [...String(documentXml || '').matchAll(/<w:p(?:\s|>)[\s\S]*?<\/w:p>/gi)];
  const paragraphs = paragraphMatches.map((paragraphMatch) => {
    const paragraphXml = paragraphMatch[0];
    const textMatches = [...paragraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)];
    const text = textMatches.map(match => match[1]).join(' ');
    return String(text || '').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);

  const lessonNotes = [];
  const worksheets = [];
  let currentStrand = null;

  for (const paragraph of paragraphs) {
    const genericResourcesMatch = paragraph.match(/^(.+?)\s+Resources?$/i);
    if (
      genericResourcesMatch
      && !/^Strand\s*\d+/i.test(paragraph)
      && !/worksheet\b/i.test(paragraph)
      && !/lesson\s*notes?/i.test(paragraph)
    ) {
      const baseTitle = String(genericResourcesMatch[1] || '').trim();
      const strandTitle = /\bdvc\b/i.test(baseTitle)
        ? 'DVC'
        : baseTitle;
      currentStrand = {
        strandNumber: null,
        strandTitle: strandTitle || null,
      };
      continue;
    }

    const combinedStrandLessonMatch = paragraph.match(/^Strand\s*(\d+)\s*[-:]\s*(.+?)\s*Lesson\s*Notes?$/i);
    if (combinedStrandLessonMatch) {
      const strandNumber = Number.parseInt(combinedStrandLessonMatch[1], 10);
      const strandTitle = String(combinedStrandLessonMatch[2] || '').trim() || null;
      currentStrand = { strandNumber, strandTitle };

      lessonNotes.push({
        lessonNoteTitle: paragraph,
        strandNumber,
        strandTitle,
      });
      continue;
    }

    const strandOnlyMatch = paragraph.match(/^Strand\s*(\d+)\b(?:\s*[-:]\s*(.+))?$/i);
    if (strandOnlyMatch) {
      const strandNumber = Number.parseInt(strandOnlyMatch[1], 10);
      const strandTitle = String(strandOnlyMatch[2] || '').trim() || null;
      currentStrand = { strandNumber, strandTitle };
      continue;
    }

    const isLessonNoteLine = /lesson\s*notes?/i.test(paragraph);
    if (isLessonNoteLine) {
      const notesAfterPrefix = paragraph.match(/^Lesson\s*Notes?\s*[-:]\s*(.+)$/i);
      const notesBeforeSuffix = paragraph.match(/^(.+?)\s*[-:]?\s*Lesson\s*Notes?$/i);

      const extractedStrandTitle = String(
        (notesAfterPrefix && notesAfterPrefix[1])
        || (notesBeforeSuffix && notesBeforeSuffix[1])
        || ''
      ).trim() || null;

      const strandNumber = currentStrand && Number.isInteger(currentStrand.strandNumber)
        ? currentStrand.strandNumber
        : null;

      const strandTitle = strandNumber === null
        ? ((currentStrand && currentStrand.strandTitle) || extractedStrandTitle || null)
        : (extractedStrandTitle || (currentStrand ? currentStrand.strandTitle : null));

      if (currentStrand && !currentStrand.strandTitle && strandTitle) {
        currentStrand.strandTitle = strandTitle;
      }

      const lessonNoteTitle = strandNumber !== null
        ? `Strand ${strandNumber}${strandTitle ? ` - ${strandTitle}` : ''} Lesson Notes`
        : ((currentStrand && currentStrand.strandTitle)
          ? `${currentStrand.strandTitle} Lesson Notes${extractedStrandTitle && extractedStrandTitle.toLowerCase() !== currentStrand.strandTitle.toLowerCase() ? ` - ${extractedStrandTitle}` : ''}`
          : paragraph);

      lessonNotes.push({
        lessonNoteTitle,
        strandNumber,
        strandTitle,
      });
      continue;
    }

    if (/worksheet\b/i.test(paragraph) && !/lesson\s*notes?/i.test(paragraph)) {
      worksheets.push({
        worksheetTitle: paragraph,
        strandNumber: currentStrand ? currentStrand.strandNumber : null,
        strandTitle: currentStrand ? currentStrand.strandTitle : null,
      });
    }
  }

  const dedupedLessonNotes = lessonNotes.filter((note, index, list) => {
    const key = `${note.strandNumber || ''}|${String(note.strandTitle || '').toLowerCase()}|${String(note.lessonNoteTitle || '').toLowerCase()}`;
    return list.findIndex(item => `${item.strandNumber || ''}|${String(item.strandTitle || '').toLowerCase()}|${String(item.lessonNoteTitle || '').toLowerCase()}` === key) === index;
  });

  return {
    lessonNotes: dedupedLessonNotes,
    worksheets,
  };
}

const isAdminUser = (user) => Boolean(user?.roles?.includes('ADMIN'));

async function hasWorkshopHubRole(user, roleKey) {
  if (!user) return false;
  const result = await pool.query(
    `SELECT 1
     FROM user_hub_roles assignments
     INNER JOIN hub_roles roles ON roles.id = assignments.hub_role_id
     WHERE assignments.user_id = $1 AND roles.hub_key = 'workshop' AND roles.role_key = $2
     LIMIT 1`,
    [user.id, roleKey]
  );
  return result.rowCount > 0;
}

// Maps the app's roles onto the legacy role names the Workshop pages understand.
async function legacyRolesFor(user) {
  const roles = [];
  if (isAdminUser(user)) roles.push('Admin');
  if (await hasWorkshopHubRole(user, 'lead-teacher')) roles.push('Lead Teacher');
  if (user.roles.includes('Teacher') || await hasWorkshopHubRole(user, 'teacher')) roles.push('Teacher');
  if (await hasWorkshopHubRole(user, 'technician')) roles.push('Technician');
  if (user.roles.includes('Staff')) roles.push('Staff');
  if (user.roles.includes('Student') || await hasWorkshopHubRole(user, 'student')) roles.push('Student');
  return roles;
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (isAdminUser(req.user)) return next();
  return res.status(403).json({ error: 'Admin access required' });
}

async function requireAdminOrLead(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  try {
    if (isAdminUser(req.user) || await hasWorkshopHubRole(req.user, 'lead-teacher')) return next();
    return res.status(403).json({ error: 'Admin or Lead Teacher access required' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
}

router.get('/api/user', (req, res) => {
  if (!req.user) return res.json(null);
  return res.json({
    id: req.user.id,
    name: req.user.display_name,
    email: req.user.email,
    picture: null,
    csrfToken: 'session'
  });
});

router.get('/api/my-roles', requireAuth, async (req, res) => {
  try {
    const roles = await legacyRolesFor(req.user);
    res.json(roles.map((role) => ({ role, user_type: role === 'Student' ? 'Student' : 'Staff' })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/api/auth/logout', requireAuth, (req, res) => {
  req.logout((error) => (error ? res.status(500).json({ error: 'Failed to log out.' }) : res.json({ success: true })));
});

// Role management now lives in the app's user administration.
router.get(['/admin_user_roles.html', '/admin_permissions.html'], (req, res) => {
  res.redirect(req.path.includes('user_roles') ? '/hubs/workshop/roles' : '/admin/roles');
});

router.get('/admin_school_terms.html', (req, res) => res.redirect('/admin/school-terms'));
router.get('/profile.html', (req, res) => res.redirect('/profile'));

const SCHOOL_TERMS_SOURCE_URL = 'https://www.education.govt.nz/school-terms-and-holidays-dates';

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBasicEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function sanitizeMinistryHtml(rawHtml) {
  const mainMatch = rawHtml.match(/<main[\s\S]*?<\/main>/i)
    || rawHtml.match(/<article[\s\S]*?<\/article>/i)
    || rawHtml.match(/<body[\s\S]*?<\/body>/i);

  let contentHtml = mainMatch ? mainMatch[0] : rawHtml;

  contentHtml = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return contentHtml
    .replace(/href="\/(?!\/)/gi, 'href="https://www.education.govt.nz/')
    .replace(/src="\/(?!\/)/gi, 'src="https://www.education.govt.nz/');
}

function decodeXmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractDocxTableRows(documentXml) {
  const tableMatch = String(documentXml || '').match(/<w:tbl(?:\s|>)[\s\S]*?<\/w:tbl>/i);
  if (!tableMatch) return [];

  const tableXml = tableMatch[0];
  const rowMatches = [...tableXml.matchAll(/<w:tr(?:\s|>)[\s\S]*?<\/w:tr>/gi)];

  return rowMatches.map((rowMatch) => {
    const rowXml = rowMatch[0];
    const cellMatches = [...rowXml.matchAll(/<w:tc(?:\s|>)[\s\S]*?<\/w:tc>/gi)];

    return cellMatches.map((cellMatch) => {
      const cellXml = cellMatch[0];
      const textMatches = [...cellXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)];
      const text = textMatches.length
        ? textMatches.map(match => match[1]).join(' ')
        : cellXml;

      return decodeXmlEntities(text)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    });
  });
}

  function extractDocxParagraphTexts(documentXml) {
    const paragraphMatches = [...String(documentXml || '').matchAll(/<w:p(?:\s|>)[\s\S]*?<\/w:p>/gi)];

    return paragraphMatches.map((paragraphMatch) => {
      const paragraphXml = paragraphMatch[0];
      const textMatches = [...paragraphXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi)];
      const text = textMatches.map(match => match[1]).join(' ');

      return decodeXmlEntities(text)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }).filter(Boolean);
  }

  function deriveTopicTitle(paragraphs) {
    const heading = paragraphs.find(paragraph => /^Unit Standard Topic:\s*(.+)$/i.test(paragraph));
    if (heading) {
      return heading.replace(/^Unit Standard Topic:\s*/i, '').trim();
    }

    return paragraphs[0] || 'Imported Topic';
  }

  function deriveYearLevelFromParagraphs(paragraphs, fallbackYearLevel = '') {
    const text = paragraphs.join(' ');
    const match = text.match(/\bYear\s*(\d{1,2})\b/i);
    return (fallbackYearLevel || (match ? `Year ${match[1]}` : '') || '').trim();
  }

  async function parseTopicDocx(buffer, fallbackYearLevel = '') {
    const zip = await JSZip.loadAsync(buffer);
    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) {
      throw new Error('DOCX file is missing document.xml');
    }

    const documentXml = await documentEntry.async('string');
    const paragraphs = extractDocxParagraphTexts(documentXml);

    if (!paragraphs.length) {
      throw new Error('The DOCX file does not contain readable topic text.');
    }

    const topicName = deriveTopicTitle(paragraphs);
    const yearLevel = deriveYearLevelFromParagraphs(paragraphs, fallbackYearLevel);
    const titleIndex = paragraphs.findIndex(paragraph => /^Unit Standard Topic:\s*(.+)$/i.test(paragraph));
    const contentParagraphs = paragraphs.slice(titleIndex >= 0 ? titleIndex + 1 : 1);
    const sectionPattern = /^(?:Week|Weeks|Sub[-\s]*Topic|Subtopic)\s*(?:\d+(?:\s*[-–]\s*\d+)?)?\b\s*(.*)$/i;
    const sections = [];
    const introLines = [];
    let currentSection = null;

    for (const paragraph of contentParagraphs) {
      const sectionMatch = paragraph.match(sectionPattern);
      if (sectionMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          name: paragraph.trim(),
          detailsLines: [],
        };
        continue;
      }

      if (!currentSection) {
        introLines.push(paragraph);
        continue;
      }

      currentSection.detailsLines.push(paragraph);
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    const topicDetails = introLines.length
      ? introLines.join('\n')
      : `Imported from ${topicName}${yearLevel ? ` (${yearLevel})` : ''}.`;

    return {
      topicName,
      yearLevel,
      topicDetails,
      subTopics: sections.map(section => ({
        name: section.name,
        details: section.detailsLines.join('\n').trim(),
      })).filter(section => section.name),
    };
  }

async function upsertYearPlannerTemplate(yearLevel, fileName, planner, importedBy) {
  const result = await pool.query(
    `INSERT INTO year_planner_templates (year_level, file_name, planner, imported_by, imported_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (year_level)
     DO UPDATE SET file_name = EXCLUDED.file_name,
                   planner = EXCLUDED.planner,
                   imported_by = EXCLUDED.imported_by,
                   imported_at = CURRENT_TIMESTAMP
     RETURNING year_level, file_name, planner, imported_at`,
    [yearLevel, fileName, planner, importedBy || null]
  );

  return result.rows[0];
}

async function getYearPlannerTemplates() {
  const result = await pool.query(
    `SELECT year_level, file_name, planner, imported_at
     FROM year_planner_templates
     ORDER BY year_level`
  );

  return result.rows;
}

async function parsePlannerDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    throw new Error('DOCX file is missing document.xml');
  }

  const documentXml = await documentEntry.async('string');
  const tableRows = extractDocxTableRows(documentXml);

  if (tableRows.length < 2) {
    throw new Error('Planner table was not found in the DOCX file.');
  }

  const headerRow = tableRows[0];
  if (!headerRow.length || !String(headerRow[0] || '').toLowerCase().includes('term')) {
    throw new Error('The first table in the DOCX does not look like a planner table.');
  }

  const rows = tableRows.slice(1).map((cells) => ({
    term: cells[0] || '',
    weeks: cells[1] || '',
    unitStandard: cells[2] || '',
    unitCode: cells[3] || '',
    level: cells[4] || '',
    version: cells[5] || '',
    credits: cells[6] || '',
  })).filter(row => Object.values(row).some(Boolean));

  return {
    headerRow,
    rows,
  };
}

async function fetchMinistryTermsRawHtml() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(SCHOOL_TERMS_SOURCE_URL, {
      signal: controller.signal,
      headers: {
        'user-agent': 'WHS-Workshop-TermsFetcher/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Source responded with ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseMinistryTermDates(rawHtml) {
  const monthIndex = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  const cleanText = decodeBasicEntities(stripHtmlTags(rawHtml));
  const yearMatch = cleanText.match(/school terms and holidays[^0-9]*(20\d{2})/i);
  const targetYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : new Date().getFullYear();

  function buildDate(day, monthName, explicitYear) {
    const month = monthIndex[String(monthName || '').toLowerCase()];
    if (Number.isNaN(day) || month === undefined) return null;
    const year = explicitYear ? Number.parseInt(explicitYear, 10) : targetYear;
    const dt = new Date(Date.UTC(year, month, day));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function toIso(dt) {
    return dt.toISOString().slice(0, 10);
  }

  function formatWeekRange(start, end) {
    const fmt = new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', day: 'numeric', month: 'short' });
    return `Mon ${fmt.format(start)} - Fri ${fmt.format(end)}`;
  }

  const terms = [];

  // Split content into per-term sections so dates from other terms do not leak in.
  const headingRegex = /Term\s*(\d)\s*\(([^)]*)\)/gi;
  const headings = [];
  let hm;
  while ((hm = headingRegex.exec(cleanText)) !== null) {
    headings.push({
      term: Number.parseInt(hm[1], 10),
      meta: hm[2] || '',
      index: hm.index,
      headingEnd: headingRegex.lastIndex,
    });
  }

  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    const next = headings[i + 1];
    const sectionText = cleanText.slice(current.headingEnd, next ? next.index : cleanText.length);

    const sectionDateRegex = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d{2}))?/gi;
    const foundDates = [];
    let dm;
    while ((dm = sectionDateRegex.exec(sectionText)) !== null) {
      const day = Number.parseInt(dm[1], 10);
      const dt = buildDate(day, dm[2], dm[3]);
      if (dt) foundDates.push(dt);
    }

    const uniqueDates = [...new Map(foundDates.map(d => [toIso(d), d])).values()]
      .sort((a, b) => a - b);

    if (!uniqueDates.length) continue;

    const startDate = uniqueDates[0];
    const endDate = uniqueDates[uniqueDates.length - 1];
    const weekCountMatch = String(current.meta || '').match(/(\d+)\s*weeks?/i);
    const explicitWeekCount = weekCountMatch ? Number.parseInt(weekCountMatch[1], 10) : null;

    const weeks = [];
    const weekLimit = explicitWeekCount && explicitWeekCount > 0 ? explicitWeekCount : 20;
    let cursor = new Date(startDate.getTime());

    for (let w = 0; w < weekLimit; w++) {
      const weekStart = new Date(cursor.getTime());
      const weekEnd = new Date(cursor.getTime());
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);

      if (!explicitWeekCount && weekStart > endDate) break;

      weeks.push({
        week: w + 1,
        startDate: toIso(weekStart),
        endDate: toIso(weekEnd),
        label: formatWeekRange(weekStart, weekEnd),
      });

      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    terms.push({
      term: current.term,
      startDate: toIso(startDate),
      endDate: toIso(endDate),
      weeks,
    });
  }

  terms.sort((a, b) => a.term - b.term);

  // Keep only one block per term number (the first parsed block for that term).
  const uniqueTerms = [];
  const seenTerms = new Set();
  for (const t of terms) {
    if (seenTerms.has(t.term)) continue;
    seenTerms.add(t.term);
    uniqueTerms.push(t);
  }

  return { year: targetYear, terms: uniqueTerms };
}

router.get('/api/admin/school-terms', requireAuth, requireAdminOrLead, async (req, res) => {
  try {
    const rawHtml = await fetchMinistryTermsRawHtml();
    const contentHtml = sanitizeMinistryHtml(rawHtml);

    res.json({
      sourceUrl: SCHOOL_TERMS_SOURCE_URL,
      fetchedAt: new Date().toISOString(),
      html: contentHtml,
    });
  } catch (error) {
    console.error('School terms fetch error:', error);
    res.status(502).json({ error: 'Failed to load school terms from the Ministry website.' });
  }
});

router.get('/api/planning/term-dates', async (req, res) => {
  try {
    const rawHtml = await fetchMinistryTermsRawHtml();
    const parsed = parseMinistryTermDates(rawHtml);

    res.json({
      sourceUrl: SCHOOL_TERMS_SOURCE_URL,
      fetchedAt: new Date().toISOString(),
      ...parsed,
    });
  } catch (error) {
    console.error('Term dates parse error:', error);
    res.status(502).json({ error: 'Failed to fetch term dates.' });
  }
});

router.get('/api/planning/year-planner-templates', async (req, res) => {
  try {
    const templates = await getYearPlannerTemplates();
    res.json({ templates });
  } catch (error) {
    console.error('Year planner templates fetch error:', error);
    res.status(500).json({ error: 'Failed to load planner templates.' });
  }
});

router.post('/api/planning/import-year-planner', requireAuth, requireAdminOrLead, uploadPlannerDocx.single('planner_docx'), async (req, res) => {
  try {
    const yearLevel = String(req.body.year_level || '').trim();
    if (!yearLevel) {
      return res.status(400).json({ error: 'Year level is required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a DOCX file to upload.' });
    }

    const planner = await parsePlannerDocx(req.file.buffer);
    const stored = await upsertYearPlannerTemplate(yearLevel, req.file.originalname, planner, req.user.id);

    res.json({
      success: true,
      yearLevel,
      fileName: req.file.originalname,
      importedAt: stored.imported_at,
      planner: stored.planner,
    });
  } catch (error) {
    console.error('Year planner import error:', error);
    res.status(400).json({ error: error.message || 'Failed to import planner document.' });
  }
});

router.post('/api/topics/import-docx', requireAuth, requireAdminOrLead, uploadTopicsDocx.single('topic_docx'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a DOCX file to upload.' });
    }

    const fallbackYearLevel = String(req.body.year_level || '').trim();
    const parsed = await parseTopicDocx(req.file.buffer, fallbackYearLevel);

    res.json({
      success: true,
      fileName: req.file.originalname || 'topic-import.docx',
      ...parsed,
    });
  } catch (error) {
    console.error('Topic DOCX import error:', error);
    res.status(400).json({ error: error.message || 'Failed to import topic document.' });
  }
});

router.post('/api/worksheets/upload', requireAuth, requireAdminOrLead, uploadWorksheetFiles, async (req, res) => {
  try {
    const files = [
      ...((req.files && req.files.worksheet_files) || []),
      ...((req.files && req.files.worksheet_file) || []),
    ];

    if (!files.length) {
      return res.status(400).json({ error: 'Please choose one or more worksheet files to upload.' });
    }

    const worksheetTitleInput = String(req.body.worksheet_title || '').trim();
    const worksheetCategoryInput = String(req.body.worksheet_category || '').trim();
    const yearLevel = String(req.body.year_level || '').trim();
    const splitDocxList = ['1', 'true', 'on', 'yes'].includes(String(req.body.split_docx_list || '').toLowerCase());

    if (!yearLevel) {
      return res.status(400).json({ error: 'Year level is required.' });
    }

    const uploadedRows = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const lowerName = String(file.originalname || '').toLowerCase();

      if (splitDocxList && files.length === 1 && lowerName.endsWith('.docx')) {
        const parsedStructure = await extractWorksheetStructureFromDocx(file.buffer);
        const parsedWorksheets = (parsedStructure.worksheets || []).filter(item => String(item.worksheetTitle || '').trim());

        if (parsedWorksheets.length) {
          const uniqueNotes = [];
          const noteSeenKeys = new Set();
          for (const note of (parsedStructure.lessonNotes || [])) {
            const key = lessonNoteSyncKey(note);
            if (!noteSeenKeys.has(key)) {
              noteSeenKeys.add(key);
              uniqueNotes.push(note);
            }
          }

          const lessonNoteIdByStrand = new Map();
          const lessonNoteIdByStrandTitle = new Map();
          const keptLessonNoteIds = new Set();
          const existingLessonNotesResult = await pool.query(
            `SELECT id, lesson_note_title, strand_number, strand_title
             FROM uploaded_lesson_notes
             WHERE year_level = $1
               AND source_file_name = $2`,
            [yearLevel, file.originalname]
          );
          const existingLessonNotes = existingLessonNotesResult.rows;
          const existingLessonNoteByKey = new Map(existingLessonNotes.map(note => [lessonNoteSyncKey(note), note]));

          for (const note of uniqueNotes) {
            const key = lessonNoteSyncKey(note);
            const matched = existingLessonNoteByKey.get(key);
            let syncedNote;

            if (matched) {
              const updated = await pool.query(
                `UPDATE uploaded_lesson_notes
                 SET created_by = $2,
                     lesson_note_title = $3,
                     strand_number = $4,
                     strand_title = $5,
                     source_file_mime = $6,
                     source_file_size = $7,
                     source_file_data = $8
                 WHERE id = $1
                 RETURNING id, strand_number`,
                [
                  matched.id,
                  req.user.id,
                  note.lessonNoteTitle,
                  Number.isInteger(note.strandNumber) ? note.strandNumber : null,
                  note.strandTitle || null,
                  file.mimetype || null,
                  file.size || null,
                  file.buffer,
                ]
              );
              syncedNote = updated.rows[0];
            } else {
              const inserted = await pool.query(
                `INSERT INTO uploaded_lesson_notes (
                  created_by, lesson_note_title, year_level, strand_number, strand_title,
                  source_file_name, source_file_mime, source_file_size, source_file_data
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, strand_number`,
                [
                  req.user.id,
                  note.lessonNoteTitle,
                  yearLevel,
                  Number.isInteger(note.strandNumber) ? note.strandNumber : null,
                  note.strandTitle || null,
                  file.originalname,
                  file.mimetype || null,
                  file.size || null,
                  file.buffer,
                ]
              );
              syncedNote = inserted.rows[0];
            }

            keptLessonNoteIds.add(syncedNote.id);
            if (syncedNote && Number.isInteger(syncedNote.strand_number)) {
              lessonNoteIdByStrand.set(syncedNote.strand_number, syncedNote.id);
            }
            if (syncedNote && syncedNote.strand_title) {
              lessonNoteIdByStrandTitle.set(normaliseSyncText(syncedNote.strand_title), syncedNote.id);
            }
          }

          for (const existingNote of existingLessonNotes) {
            if (!keptLessonNoteIds.has(existingNote.id)) {
              await pool.query('DELETE FROM uploaded_lesson_notes WHERE id = $1', [existingNote.id]);
            }
          }

          const uniqueWorksheets = [];
          const worksheetSeenKeys = new Set();
          for (const worksheet of parsedWorksheets) {
            const key = worksheetSyncKey(worksheet);
            if (!worksheetSeenKeys.has(key)) {
              worksheetSeenKeys.add(key);
              uniqueWorksheets.push(worksheet);
            }
          }

          const keptWorksheetIds = new Set();
          const existingWorksheetsResult = await pool.query(
            `SELECT id, worksheet_title, strand_number
             FROM uploaded_worksheets
             WHERE year_level = $1
               AND file_name = $2`,
            [yearLevel, file.originalname]
          );
          const existingWorksheets = existingWorksheetsResult.rows;
          const existingWorksheetByKey = new Map(existingWorksheets.map(row => [worksheetSyncKey(row), row]));

          for (const worksheetMeta of uniqueWorksheets) {
            const worksheetTitle = worksheetMeta.worksheetTitle;
            const strandNumber = Number.isInteger(worksheetMeta.strandNumber) ? worksheetMeta.strandNumber : null;
            const strandTitle = worksheetMeta.strandTitle || null;
            const linkedByNumber = strandNumber !== null && lessonNoteIdByStrand.has(strandNumber)
              ? lessonNoteIdByStrand.get(strandNumber)
              : null;
            const linkedByTitle = strandTitle && lessonNoteIdByStrandTitle.has(normaliseSyncText(strandTitle))
              ? lessonNoteIdByStrandTitle.get(normaliseSyncText(strandTitle))
              : null;
            const linkedLessonNoteId = linkedByNumber || linkedByTitle || null;
            const worksheetCategory = worksheetCategoryInput && worksheetCategoryInput !== 'Auto-detect'
              ? worksheetCategoryInput
              : inferWorksheetCategory(worksheetTitle);

            const key = worksheetSyncKey(worksheetMeta);
            const matched = existingWorksheetByKey.get(key);
            let syncedWorksheet;

            if (matched) {
              const updated = await pool.query(
                `UPDATE uploaded_worksheets
                 SET created_by = $2,
                     worksheet_title = $3,
                     worksheet_category = $4,
                     strand_number = $5,
                     strand_title = $6,
                     lesson_note_id = $7,
                     file_mime = $8,
                     file_size = $9,
                     file_data = $10
                 WHERE id = $1
                 RETURNING id, worksheet_title, year_level, worksheet_category, strand_number, strand_title, lesson_note_id,
                           file_name, file_mime, file_size, created_at`,
                [
                  matched.id,
                  req.user.id,
                  worksheetTitle,
                  worksheetCategory,
                  strandNumber,
                  strandTitle,
                  linkedLessonNoteId,
                  file.mimetype || null,
                  file.size || null,
                  file.buffer,
                ]
              );
              syncedWorksheet = updated.rows[0];
            } else {
              const inserted = await pool.query(
                `INSERT INTO uploaded_worksheets (
                  created_by, worksheet_title, year_level, worksheet_category, strand_number, strand_title,
                  lesson_note_id, file_name, file_mime, file_size, file_data
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id, worksheet_title, year_level, worksheet_category, strand_number, strand_title, lesson_note_id,
                          file_name, file_mime, file_size, created_at`,
                [
                  req.user.id,
                  worksheetTitle,
                  yearLevel,
                  worksheetCategory,
                  strandNumber,
                  strandTitle,
                  linkedLessonNoteId,
                  file.originalname,
                  file.mimetype || null,
                  file.size || null,
                  file.buffer,
                ]
              );
              syncedWorksheet = inserted.rows[0];
            }

            keptWorksheetIds.add(syncedWorksheet.id);
            uploadedRows.push(syncedWorksheet);
          }

          for (const existingWorksheet of existingWorksheets) {
            if (!keptWorksheetIds.has(existingWorksheet.id)) {
              await pool.query('DELETE FROM uploaded_worksheets WHERE id = $1', [existingWorksheet.id]);
            }
          }

          continue;
        }
      }

      const fallbackTitle = String(file.originalname || '').replace(/\.[^.]+$/, '');
      const worksheetTitle = files.length === 1 && worksheetTitleInput
        ? worksheetTitleInput
        : fallbackTitle;

      const worksheetCategory = worksheetCategoryInput && worksheetCategoryInput !== 'Auto-detect'
        ? worksheetCategoryInput
        : inferWorksheetCategory(`${worksheetTitle} ${file.originalname || ''}`);

      const existingWorksheetResult = await pool.query(
        `SELECT id
         FROM uploaded_worksheets
         WHERE year_level = $1
           AND worksheet_title = $2
           AND file_name = $3
         LIMIT 1`,
        [yearLevel, worksheetTitle, file.originalname]
      );

      let result;
      if (existingWorksheetResult.rows.length) {
        result = await pool.query(
          `UPDATE uploaded_worksheets
           SET created_by = $2,
               worksheet_category = $3,
               file_mime = $4,
               file_size = $5,
               file_data = $6
           WHERE id = $1
           RETURNING id, worksheet_title, year_level, worksheet_category, strand_number, strand_title, lesson_note_id,
                     file_name, file_mime, file_size, created_at`,
          [
            existingWorksheetResult.rows[0].id,
            req.user.id,
            worksheetCategory,
            file.mimetype || null,
            file.size || null,
            file.buffer,
          ]
        );
      } else {
        result = await pool.query(
          `INSERT INTO uploaded_worksheets (
            created_by, worksheet_title, year_level, worksheet_category, strand_number, strand_title,
            lesson_note_id, file_name, file_mime, file_size, file_data
          )
          VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5, $6, $7, $8)
          RETURNING id, worksheet_title, year_level, worksheet_category, strand_number, strand_title, lesson_note_id,
                    file_name, file_mime, file_size, created_at`,
          [
            req.user.id,
            worksheetTitle,
            yearLevel,
            worksheetCategory,
            file.originalname,
            file.mimetype || null,
            file.size || null,
            file.buffer,
          ]
        );
      }

      uploadedRows.push(result.rows[0]);
    }

    res.json({
      success: true,
      uploadedCount: uploadedRows.length,
      worksheets: uploadedRows,
      worksheet: uploadedRows[0],
    });
  } catch (error) {
    console.error('Worksheet upload error:', error);
    res.status(400).json({ error: error.message || 'Failed to upload worksheet.' });
  }
});

router.get('/api/worksheets', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.id, w.worksheet_title, w.year_level, w.worksheet_category, w.strand_number, w.strand_title,
              w.lesson_note_id, w.file_name, w.file_mime, w.file_size, w.created_at,
              ln.lesson_note_title
       FROM uploaded_worksheets w
       LEFT JOIN uploaded_lesson_notes ln ON ln.id = w.lesson_note_id
       ORDER BY w.created_at DESC, w.id DESC`
    );

    res.json({ worksheets: result.rows });
  } catch (error) {
    console.error('Worksheets fetch error:', error);
    res.status(500).json({ error: 'Failed to load worksheets.' });
  }
});

router.post('/api/lesson-notes/upload', requireAuth, requireAdminOrLead, uploadWorksheetFile.single('lesson_note_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose a lesson note file to upload.' });
    }

    const splitDocxLessonList = ['1', 'true', 'on', 'yes'].includes(String(req.body.split_docx_lesson_list || '').toLowerCase());
    const lessonNoteTitle = String(req.body.lesson_note_title || '').trim() || String(req.file.originalname || '').replace(/\.[^.]+$/, '');
    const yearLevel = String(req.body.year_level || '').trim();
    const strandNumberRaw = String(req.body.strand_number || '').trim();
    const strandNumber = strandNumberRaw ? Number.parseInt(strandNumberRaw, 10) : null;
    const strandTitle = String(req.body.strand_title || '').trim() || null;

    if (!yearLevel) {
      return res.status(400).json({ error: 'Year level is required.' });
    }

    if (!lessonNoteTitle) {
      return res.status(400).json({ error: 'Lesson note title is required.' });
    }

    if (splitDocxLessonList) {
      const lowerName = String(req.file.originalname || '').toLowerCase();
      if (!lowerName.endsWith('.docx')) {
        return res.status(400).json({ error: 'Lesson Note DOCX Split Mode only works with a single DOCX file.' });
      }

      const parsedStructure = await extractWorksheetStructureFromDocx(req.file.buffer);
      const parsedLessonNotes = parsedStructure.lessonNotes || [];

      if (!parsedLessonNotes.length) {
        return res.status(400).json({ error: 'No individual lesson notes were detected in this DOCX file.' });
      }

      const uniqueParsedLessonNotes = [];
      const seenKeys = new Set();
      for (const note of parsedLessonNotes) {
        const key = lessonNoteSyncKey(note);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueParsedLessonNotes.push(note);
        }
      }

      const existingResult = await pool.query(
        `SELECT id, lesson_note_title, strand_number, strand_title
         FROM uploaded_lesson_notes
         WHERE year_level = $1
           AND source_file_name = $2`,
        [yearLevel, req.file.originalname]
      );
      const existing = existingResult.rows;
      const existingByKey = new Map(existing.map(item => [lessonNoteSyncKey(item), item]));
      const keptIds = new Set();
      const syncedRows = [];

      for (const note of uniqueParsedLessonNotes) {
        const key = lessonNoteSyncKey(note);
        const matched = existingByKey.get(key);
        let synced;

        if (matched) {
          const updated = await pool.query(
            `UPDATE uploaded_lesson_notes
             SET created_by = $2,
                 lesson_note_title = $3,
                 strand_number = $4,
                 strand_title = $5,
                 source_file_mime = $6,
                 source_file_size = $7,
                 source_file_data = $8
             WHERE id = $1
             RETURNING id, lesson_note_title, year_level, strand_number, strand_title, source_file_name, created_at`,
            [
              matched.id,
              req.user.id,
              note.lessonNoteTitle,
              Number.isInteger(note.strandNumber) ? note.strandNumber : null,
              note.strandTitle || null,
              req.file.mimetype || null,
              req.file.size || null,
              req.file.buffer,
            ]
          );
          synced = updated.rows[0];
        } else {
          const inserted = await pool.query(
            `INSERT INTO uploaded_lesson_notes (
              created_by, lesson_note_title, year_level, strand_number, strand_title,
              source_file_name, source_file_mime, source_file_size, source_file_data
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, lesson_note_title, year_level, strand_number, strand_title, source_file_name, created_at`,
            [
              req.user.id,
              note.lessonNoteTitle,
              yearLevel,
              Number.isInteger(note.strandNumber) ? note.strandNumber : null,
              note.strandTitle || null,
              req.file.originalname,
              req.file.mimetype || null,
              req.file.size || null,
              req.file.buffer,
            ]
          );
          synced = inserted.rows[0];
        }

        keptIds.add(synced.id);
        syncedRows.push(synced);

        if (Number.isInteger(synced.strand_number)) {
          await pool.query(
            `UPDATE uploaded_worksheets
             SET lesson_note_id = $1
             WHERE year_level = $2
               AND strand_number = $3
               AND (lesson_note_id IS NULL OR file_name = $4)`,
            [synced.id, synced.year_level, synced.strand_number, req.file.originalname]
          );
        } else if (synced.strand_title) {
          await pool.query(
            `UPDATE uploaded_worksheets
             SET lesson_note_id = $1
             WHERE year_level = $2
               AND LOWER(COALESCE(strand_title, '')) = LOWER($3)
               AND (lesson_note_id IS NULL OR file_name = $4)`,
            [synced.id, synced.year_level, synced.strand_title, req.file.originalname]
          );
        }
      }

      for (const existingRow of existing) {
        if (!keptIds.has(existingRow.id)) {
          await pool.query('DELETE FROM uploaded_lesson_notes WHERE id = $1', [existingRow.id]);
        }
      }

      return res.json({
        success: true,
        uploadedCount: syncedRows.length,
        lessonNotes: syncedRows,
        lessonNote: syncedRows[0],
      });
    }

    const existingSingleResult = await pool.query(
      `SELECT id
       FROM uploaded_lesson_notes
       WHERE year_level = $1
         AND lesson_note_title = $2
         AND COALESCE(strand_number, -1) = COALESCE($3, -1)
         AND COALESCE(source_file_name, '') = COALESCE($4, '')
       LIMIT 1`,
      [
        yearLevel,
        lessonNoteTitle,
        Number.isInteger(strandNumber) ? strandNumber : null,
        req.file.originalname || null,
      ]
    );

    let result;
    if (existingSingleResult.rows.length) {
      result = await pool.query(
        `UPDATE uploaded_lesson_notes
         SET created_by = $2,
             strand_title = $3,
             source_file_mime = $4,
             source_file_size = $5,
             source_file_data = $6
         WHERE id = $1
         RETURNING id, lesson_note_title, year_level, strand_number, strand_title, source_file_name, created_at`,
        [
          existingSingleResult.rows[0].id,
          req.user.id,
          strandTitle,
          req.file.mimetype || null,
          req.file.size || null,
          req.file.buffer,
        ]
      );
    } else {
      result = await pool.query(
        `INSERT INTO uploaded_lesson_notes (
          created_by, lesson_note_title, year_level, strand_number, strand_title,
          source_file_name, source_file_mime, source_file_size, source_file_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, lesson_note_title, year_level, strand_number, strand_title, source_file_name, created_at`,
        [
          req.user.id,
          lessonNoteTitle,
          yearLevel,
          Number.isInteger(strandNumber) ? strandNumber : null,
          strandTitle,
          req.file.originalname,
          req.file.mimetype || null,
          req.file.size || null,
          req.file.buffer,
        ]
      );
    }

    res.json({ success: true, uploadedCount: 1, lessonNotes: result.rows, lessonNote: result.rows[0] });
  } catch (error) {
    console.error('Lesson note upload error:', error);
    res.status(400).json({ error: error.message || 'Failed to upload lesson note.' });
  }
});

router.delete('/api/worksheets/:id', requireAuth, requireAdminOrLead, async (req, res) => {
  try {
    const worksheetId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) {
      return res.status(400).json({ error: 'Invalid worksheet ID.' });
    }

    const result = await pool.query(
      `DELETE FROM uploaded_worksheets
       WHERE id = $1
       RETURNING id, worksheet_title`,
      [worksheetId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Worksheet not found.' });
    }

    res.json({ success: true, worksheet: result.rows[0] });
  } catch (error) {
    console.error('Worksheet delete error:', error);
    res.status(500).json({ error: 'Failed to delete worksheet.' });
  }
});

router.delete('/api/lesson-notes/:id', requireAuth, requireAdminOrLead, async (req, res) => {
  try {
    const lessonNoteId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(lessonNoteId) || lessonNoteId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson note ID.' });
    }

    const result = await pool.query(
      `DELETE FROM uploaded_lesson_notes
       WHERE id = $1
       RETURNING id, lesson_note_title`,
      [lessonNoteId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Lesson note not found.' });
    }

    res.json({ success: true, lessonNote: result.rows[0] });
  } catch (error) {
    console.error('Lesson note delete error:', error);
    res.status(500).json({ error: 'Failed to delete lesson note.' });
  }
});

router.get('/api/lesson-notes', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ln.id, ln.lesson_note_title, ln.year_level, ln.strand_number, ln.strand_title,
              ln.source_file_name, ln.created_at,
              COUNT(w.id)::INTEGER AS linked_worksheet_count
       FROM uploaded_lesson_notes ln
       LEFT JOIN uploaded_worksheets w ON w.lesson_note_id = ln.id
       GROUP BY ln.id
       ORDER BY ln.created_at DESC, ln.id DESC`
    );

    res.json({ lessonNotes: result.rows });
  } catch (error) {
    console.error('Lesson notes fetch error:', error);
    res.status(500).json({ error: 'Failed to load lesson notes.' });
  }
});

router.get('/api/lesson-notes/:id/file', requireAuth, async (req, res) => {
  try {
    const lessonNoteId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(lessonNoteId) || lessonNoteId <= 0) {
      return res.status(400).json({ error: 'Invalid lesson note ID.' });
    }

    const result = await pool.query(
      `SELECT source_file_data, source_file_name, source_file_mime
       FROM uploaded_lesson_notes
       WHERE id = $1`,
      [lessonNoteId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Lesson note not found.' });
    }

    const row = result.rows[0];
    if (!row.source_file_data) {
      return res.status(404).json({ error: 'No lesson note file is stored for this record.' });
    }

    const mime = row.source_file_mime || 'application/octet-stream';
    const fileName = row.source_file_name || `lesson-note-${lessonNoteId}`;
    const download = String(req.query.download || '').toLowerCase() === '1';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.send(row.source_file_data);
  } catch (error) {
    console.error('Lesson note file fetch error:', error);
    res.status(500).json({ error: 'Failed to load lesson note file.' });
  }
});

router.get('/api/worksheets/:id/file', requireAuth, async (req, res) => {
  try {
    const worksheetId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) {
      return res.status(400).json({ error: 'Invalid worksheet ID.' });
    }

    const result = await pool.query(
      `SELECT file_data, file_name, file_mime
       FROM uploaded_worksheets
       WHERE id = $1`,
      [worksheetId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Worksheet not found.' });
    }

    const row = result.rows[0];
    const mime = row.file_mime || 'application/octet-stream';
    const fileName = row.file_name || `worksheet-${worksheetId}`;
    const download = String(req.query.download || '').toLowerCase() === '1';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${fileName}"`);
    res.send(row.file_data);
  } catch (error) {
    console.error('Worksheet file fetch error:', error);
    res.status(500).json({ error: 'Failed to load worksheet file.' });
  }
});

// ── Activity Suggestion ───────────────────────────────────────────
router.post('/api/upload-activity', requireAuth, uploadOutcomeImage.single('outcome_image_file'), async (req, res) => {
  try {
    const activityName = String(req.body.activity_name || '').trim();
    if (!activityName) {
      return res.status(400).json({ error: 'Activity name is required.' });
    }

    const durationRaw = String(req.body.duration_minutes || '').trim();
    const durationMinutes = durationRaw ? Number.parseInt(durationRaw, 10) : null;
    if (durationRaw && Number.isNaN(durationMinutes)) {
      return res.status(400).json({ error: 'Duration must be a number of minutes.' });
    }

    const commonResourcesRaw = req.body.common_resources;
    const commonResources = Array.isArray(commonResourcesRaw)
      ? commonResourcesRaw.filter(Boolean)
      : (commonResourcesRaw ? [commonResourcesRaw] : []);

    const showThisWeek = req.body.show_this_week === 'on' || req.body.show_this_week === 'true';

    const file = req.file;
    const insert = await pool.query(
      `INSERT INTO uploaded_activities
      (created_by, activity_name, card_url, year_level, activity_type, activity_category, duration_minutes,
       difficulty, card_color, subject_stream, outcome_image_url, outcome_image_data, outcome_image_mime,
       outcome_image_filename, short_description, resources_text, equipment_text, instructions_text,
       management_notes, class_preparation, assessment_focus, common_resources, show_this_week)
      VALUES
      ($1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18,
       $19, $20, $21, $22, $23)
      RETURNING id, created_at`,
      [
        req.user.id,
        activityName,
        String(req.body.card_url || '').trim() || null,
        String(req.body.year_level || '').trim() || null,
        String(req.body.activity_type || '').trim() || null,
        String(req.body.activity_category || '').trim() || null,
        durationMinutes,
        String(req.body.difficulty || '').trim() || null,
        String(req.body.card_color || '').trim() || null,
        String(req.body.subject_stream || '').trim() || null,
        String(req.body.outcome_image_url || '').trim() || null,
        file ? file.buffer : null,
        file ? file.mimetype : null,
        file ? file.originalname : null,
        String(req.body.short_description || '').trim() || null,
        String(req.body.resources_text || '').trim() || null,
        String(req.body.equipment_text || '').trim() || null,
        String(req.body.instructions_text || '').trim() || null,
        String(req.body.management_notes || '').trim() || null,
        String(req.body.class_preparation || '').trim() || null,
        String(req.body.assessment_focus || '').trim() || null,
        commonResources,
        showThisWeek
      ]
    );

    res.json({ success: true, id: insert.rows[0].id, created_at: insert.rows[0].created_at });
  } catch (e) {
    console.error('Upload activity error:', e);
    res.status(500).json({ error: 'Failed to save activity.' });
  }
});

router.post('/api/upload-url-idea', requireAuth, async (req, res) => {
  try {
    const activityName = String(req.body.activity_name || '').trim();
    const ideaUrl = String(req.body.idea_url || '').trim();
    const activityType = String(req.body.activity_type || '').trim();
    const cardColor = String(req.body.card_color || '').trim() || 'Teal';
    const shortDescription = String(req.body.short_description || '').trim();

    if (!activityName || !ideaUrl) {
      return res.status(400).json({ error: 'Activity name and URL are required.' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(ideaUrl);
    } catch {
      return res.status(400).json({ error: 'Please enter a valid URL starting with http:// or https://.' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Only http and https URLs are allowed.' });
    }

    const result = await pool.query(
      `INSERT INTO uploaded_url_ideas
        (created_by, activity_name, activity_type, card_color, idea_url, short_description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [req.user.id, activityName, activityType || null, cardColor, ideaUrl, shortDescription || null]
    );

    res.json({ success: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (e) {
    console.error('Upload URL idea error:', e);
    res.status(500).json({ error: 'Failed to save URL idea.' });
  }
});

router.post('/api/upload-assessment-task', requireAuth, uploadAssessmentImages.array('supporting_images', 5), async (req, res) => {
  try {
    const taskName = String(req.body.assessment_task_name || '').trim();
    if (!taskName) {
      return res.status(400).json({ error: 'Assessment task name is required.' });
    }

    const selectedStandard = String(req.body.selected_standard || '').trim();
    const filesMeta = (req.files || []).map(file => ({
      name: file.originalname,
      mime: file.mimetype,
      size: file.size,
    }));

    const showThisWeek = req.body.show_this_week === 'on' || req.body.show_this_week === 'true';

    const result = await pool.query(
      `INSERT INTO uploaded_assessment_tasks
      (created_by, assessment_task_name, year_level, task_type, activity_category, difficulty, subject_stream,
       duration_hours, card_color, short_description, task_list, selected_standard, standard_details,
       req_achieved, req_merit, req_excellence, submit_requirements, relevant_implications,
       progress_record, feedback_training, supporting_files, show_this_week)
      VALUES
      ($1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18,
       $19, $20, $21, $22)
      RETURNING id, created_at`,
      [
        req.user.id,
        taskName,
        String(req.body.year_level || '').trim() || null,
        String(req.body.task_type || '').trim() || null,
        String(req.body.activity_category || '').trim() || null,
        String(req.body.difficulty || '').trim() || null,
        String(req.body.subject_stream || '').trim() || null,
        String(req.body.duration_hours || '').trim() || null,
        String(req.body.card_color || '').trim() || null,
        String(req.body.short_description || '').trim() || null,
        String(req.body.task_list || '').trim() || null,
        selectedStandard || null,
        String(req.body.standard_details || '').trim() || null,
        String(req.body.req_achieved || '').trim() || null,
        String(req.body.req_merit || '').trim() || null,
        String(req.body.req_excellence || '').trim() || null,
        String(req.body.submit_requirements || '').trim() || null,
        String(req.body.relevant_implications || '').trim() || null,
        String(req.body.progress_record || '').trim() || null,
        String(req.body.feedback_training || '').trim() || null,
        JSON.stringify(filesMeta),
        showThisWeek,
      ]
    );

    res.json({ success: true, id: result.rows[0].id, created_at: result.rows[0].created_at });
  } catch (e) {
    console.error('Upload assessment task error:', e);
    res.status(500).json({ error: 'Failed to save assessment task.' });
  }
});

router.post('/api/suggest-activity', upload.single('pdf'), async (req, res) => {
  try {
    const { name, email, activity_name, activity_url, reason } = req.body;
    if (!name || !email || !activity_name) {
      return res.status(400).json({ error: 'Name, email, and activity name are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const normalizedActivityUrl = activity_url?.trim()
      ? normaliseHttpUrl(activity_url)
      : null;
    if (activity_url?.trim() && !normalizedActivityUrl) {
      return res.status(400).json({ error: 'Activity URL must be a valid http/https address.' });
    }

    const pdfData = req.file ? req.file.buffer : null;
    const pdfFilename = req.file ? req.file.originalname : null;
    const insertResult = await pool.query(
      `INSERT INTO activity_suggestions (submitter_name, submitter_email, activity_name, activity_url, reason, pdf_data, pdf_filename)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, submitted_at`,
      [name.trim(), email.trim(), activity_name.trim(), normalizedActivityUrl, reason?.trim() || null, pdfData, pdfFilename]
    );

    let emailNotificationSent = false;
    let emailNotificationError = null;

    // Send notification email to all Admins and Lead Teachers
    try {
      const adminRes = await pool.query(
        `SELECT DISTINCT u.email, u.display_name AS name FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         LEFT JOIN user_hub_roles uhr ON uhr.user_id = u.id
         LEFT JOIN hub_roles hr ON hr.id = uhr.hub_role_id AND hr.hub_key = 'workshop' AND hr.role_key = 'lead-teacher'
         WHERE (r.name = 'ADMIN' OR hr.id IS NOT NULL) AND u.email IS NOT NULL`
      );
      if (adminRes.rows.length && hasMailerConfig) {
        const recipients = adminRes.rows.map(r => String(r.email || '').trim()).filter(isValidEmail);
        if (!recipients.length) {
          throw new Error('No valid Admin or Lead Teacher email addresses to notify.');
        }
        const submittedAt = insertResult.rows[0].submitted_at;
        const dateStr = new Date(submittedAt).toISOString().slice(0, 10);
        const siteUrl = process.env.SITE_URL || 'https://whs-appsystem.onrender.com';
        const safeName = escapeHtml(name.trim());
        const safeEmail = escapeHtml(email.trim());
        const safeActivityName = escapeHtml(activity_name.trim());
        const safePdfFilename = pdfFilename ? escapeHtml(pdfFilename) : null;
        const safeReason = reason?.trim() ? escapeHtml(reason.trim()) : '';
        const safeSiteUrl = escapeHtml(siteUrl);
        const safeSuggestionsUrl = `${siteUrl}/workshop/admin_suggestions.html`;
        const safeSuggestionsUrlEscaped = escapeHtml(safeSuggestionsUrl);
        const safeUrlCell = normalizedActivityUrl
          ? `<a href="${escapeHtml(normalizedActivityUrl)}" style="color:#1c74b9">${escapeHtml(normalizedActivityUrl)}</a>`
          : 'N/A';

        const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1c74b9;padding:22px 28px;border-radius:8px 8px 0 0">
    <p style="color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:1px;text-transform:uppercase;margin:0 0 4px">WORKSHOP</p>
    <h2 style="color:#fff;margin:0;font-size:22px">New Activity Suggestion</h2>
  </div>
  <div style="background:#f8fbff;padding:24px 28px;border:1px solid #d6e4f0;border-top:none;border-radius:0 0 8px 8px">
    <p style="color:#444;margin:0 0 18px">A new suggestion has been submitted for review.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:9px 12px;border:1px solid #e0e8f0;font-weight:700;background:#fff;width:130px">Date</td><td style="padding:9px 12px;border:1px solid #e0e8f0;background:#fff">${dateStr}</td></tr>
      <tr><td style="padding:9px 12px;border:1px solid #e0e8f0;font-weight:700;background:#fafcff">Activity</td><td style="padding:9px 12px;border:1px solid #e0e8f0;background:#fafcff">${safeActivityName}</td></tr>
      <tr><td style="padding:9px 12px;border:1px solid #e0e8f0;font-weight:700;background:#fff">Suggested By</td><td style="padding:9px 12px;border:1px solid #e0e8f0;background:#fff">${safeName}</td></tr>
      <tr><td style="padding:9px 12px;border:1px solid #e0e8f0;font-weight:700;background:#fafcff">Email</td><td style="padding:9px 12px;border:1px solid #e0e8f0;background:#fafcff"><a href="mailto:${safeEmail}" style="color:#1c74b9">${safeEmail}</a></td></tr>
      <tr><td style="padding:9px 12px;border:1px solid #e0e8f0;font-weight:700;background:#fff">URL</td><td style="padding:9px 12px;border:1px solid #e0e8f0;background:#fff">${safeUrlCell}</td></tr>
      ${safePdfFilename ? `<tr><td style="padding:9px 12px;border:1px solid #e0e8f0;font-weight:700;background:#fafcff">PDF</td><td style="padding:9px 12px;border:1px solid #e0e8f0;background:#fafcff">${safePdfFilename} <em style="color:#888">(download from Suggestions page)</em></td></tr>` : ''}
    </table>
    ${safeReason ? `
    <p style="font-weight:700;color:#1a2a3a;margin:18px 0 6px">Reason</p>
    <div style="background:#fff;border:1px solid #e0e8f0;border-radius:6px;padding:12px 14px;color:#444;font-size:14px">${safeReason}</div>` : ''}
    <div style="margin-top:24px">
      <a href="${safeSuggestionsUrlEscaped}" style="display:inline-block;background:#1c74b9;color:#fff;text-decoration:none;padding:11px 22px;border-radius:7px;font-weight:700;font-size:14px">Open Suggestions List</a>
    </div>
    <p style="margin:14px 0 0;font-size:12px;color:#888">Direct link: <a href="${safeSuggestionsUrlEscaped}" style="color:#1c74b9">${safeSuggestionsUrlEscaped}</a></p>
  </div>
</div>`;

        const sendResult = await sendEmail({
          to: recipients,
          subject: `[Workshop Hub] Activity Suggestion: ${activity_name.trim()}`,
          html: htmlBody
        });
        if (!sendResult.ok) {
          throw new Error(sendResult.error || sendResult.message || 'Gmail API send failed');
        }
        emailNotificationSent = true;
      } else if (!hasMailerConfig) {
        emailNotificationError = 'Google Gmail API is not configured.';
      }
    } catch (emailErr) {
      // Don't fail the request if email fails — just log it
      console.error('Email notification failed:', emailErr.message);
      emailNotificationError = String(emailErr && emailErr.message ? emailErr.message : 'Unknown email transport error');
    }

    res.json({ success: true, emailNotificationSent, emailNotificationError });
  } catch (e) {
    console.error('Suggestion error:', e);
    res.status(500).json({ error: 'Failed to save suggestion.' });
  }
});

// Admin: view all suggestions
router.get('/api/admin/suggestions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, submitter_name, submitter_email, activity_name, activity_url, reason, pdf_filename, submitted_at
       FROM activity_suggestions ORDER BY submitted_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: download PDF for a suggestion
router.get('/api/admin/suggestions/:id/pdf', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT pdf_data, pdf_filename FROM activity_suggestions WHERE id = $1',
      [parseInt(req.params.id)]
    );
    if (!result.rows.length || !result.rows[0].pdf_data) {
      return res.status(404).json({ error: 'No PDF found.' });
    }
    const { pdf_data, pdf_filename } = result.rows[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf_filename || 'suggestion.pdf'}"`);
    res.send(pdf_data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

// Shared with the Global Control School Terms & Holidays page.
module.exports.loadSchoolTerms = async () => ({
  sourceUrl: SCHOOL_TERMS_SOURCE_URL,
  fetchedAt: new Date().toISOString(),
  html: sanitizeMinistryHtml(await fetchMinistryTermsRawHtml())
});
