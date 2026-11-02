const { Pool } = require('pg');

const SCHOOL_DOMAIN = '@westlandhigh.school.nz';
const SCHOOL_EMAIL = /^[a-z0-9]+(?:[._][a-z0-9]+)*@westlandhigh\.school\.nz$/;
const MARKER = /GITHUB_REPO_URL\|\s*(https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})/g;

// The username part of the school email, without underscores, e.g. j_pinkerneil -> JPinkerneil.
function creditFromEmail(email) {
  const user = String(email || '').trim().toLowerCase().split('@')[0];
  return user.split(/[._]/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('').slice(0, 40);
}

function githubOwner(url) {
  const match = String(url || '').match(/^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/[A-Za-z0-9._-]+$/);
  return match ? match[1] : null;
}

function normaliseRepoUrl(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const match = trimmed.match(/^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/i);
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}

// Read-only lookup of the shared GitHub links a student saved in their DTECH Hub task lists.
function createDtechRecords({ env = process.env, pool = null } = {}) {
  let shared = pool;
  function db() {
    if (shared) return shared;
    if (!env.DTECH_DATABASE_URL) return null;
    if (env.DTECH_DATABASE_URL === env.DATABASE_URL) return null;
    shared = new Pool({
      connectionString: env.DTECH_DATABASE_URL,
      ssl: env.DTECH_DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 10000
    });
    return shared;
  }

  async function githubLinks(email) {
    const target = db();
    if (!target) return { unavailable: true, links: [] };
    try {
      const rows = (await target.query(
        `SELECT pi.project_id, a.name, a.year_level, pi.evidence_steps::text AS evidence, pi.updated_at
         FROM project_interests pi LEFT JOIN activities a ON a.id = pi.project_id
         WHERE lower(pi.student_email) = lower($1) ORDER BY pi.updated_at DESC`, [email]
      )).rows;
      const seen = new Map();
      for (const row of rows) {
        for (const match of String(row.evidence || '').matchAll(MARKER)) {
          const url = normaliseRepoUrl(match[1]);
          if (url && !seen.has(url.toLowerCase())) {
            seen.set(url.toLowerCase(), { url, project: row.name || row.project_id, yearLevel: row.year_level || '' });
          }
        }
      }
      return { unavailable: false, links: [...seen.values()] };
    } catch (error) {
      console.warn('[student-builders] DTECH Hub lookup unavailable:', error.message);
      return { unavailable: true, links: [] };
    }
  }

  return { githubLinks };
}

module.exports = { createDtechRecords, creditFromEmail, githubOwner, normaliseRepoUrl, SCHOOL_DOMAIN, SCHOOL_EMAIL };
