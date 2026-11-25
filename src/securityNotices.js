const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { query } = require('./db');
const { ensureAuthenticated, ensureRole } = require('./middleware');

const severities = ['critical', 'high', 'medium', 'low'];
const statuses = ['verification-required', 'in-progress', 'resolved', 'not-affected'];

function validateNotice(body) {
  const value = {};
  for (const [key, limit] of Object.entries({ title: 200, reference: 100, notice: 12000,
    remediation: 12000, verification: 12000, sourceUrl: 2000 })) {
    if (typeof body[key] !== 'string' || body[key].trim().length > limit) throw new Error(`Enter valid ${key} text (maximum ${limit} characters).`);
    value[key] = body[key].trim();
  }
  if (!value.title || !value.notice || !severities.includes(body.severity) || !statuses.includes(body.status)) {
    throw new Error('Title, notice, severity and status are required.');
  }
  if (value.sourceUrl) {
    let url;
    try { url = new URL(value.sourceUrl); } catch { throw new Error('The source link must be a valid HTTPS URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The source link must be an HTTPS URL without credentials.');
  }
  const date = body.receivedOn;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error('Enter a valid received date.');
  }
  if (['resolved', 'not-affected'].includes(body.status) && !value.verification) {
    throw new Error('Record verification evidence before closing a notice.');
  }
  return { ...value, severity: body.severity, status: body.status, receivedOn: date };
}

function createSecurityNoticesRouter({ dbQuery = query } = {}) {
  const router = express.Router();
  router.use(ensureAuthenticated, ensureRole('ADMIN'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.session.securityNoticesCsrf) req.session.securityNoticesCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method !== 'GET') {
      const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
      const expected = Buffer.from(req.session.securityNoticesCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload Security Vulnerability Notices and try again. No changes were made.' });
      }
    }
    next();
  });
  router.get('/', async (req, res, next) => {
    try {
      const result = await dbQuery('SELECT * FROM security_vulnerability_notices ORDER BY updated_at DESC, id DESC');
      res.render('admin/security-notices', { title: 'Security Vulnerability Notices', notices: result.rows,
        csrf: req.session.securityNoticesCsrf, statuses, severities, saved: req.query.saved === '1' });
    } catch (error) { next(error); }
  });
  router.get('/render-notice', (req, res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(__dirname, 'security-notices', 'render-upload2shell.png'));
  });
  router.post('/', async (req, res, next) => {
    let details;
    try { details = validateNotice(req.body); }
    catch (error) { return res.status(400).render('error', { title: 'Invalid notice', message: error.message }); }
    try {
      await dbQuery('INSERT INTO security_vulnerability_notices (details, created_by, updated_by) VALUES ($1::jsonb, $2, $2)',
        [JSON.stringify(details), req.user.email]);
      res.redirect('/admin/security-notices?saved=1');
    } catch (error) { next(error); }
  });
  router.post('/:id', async (req, res, next) => {
    if (!/^[1-9]\d{0,17}$/.test(req.params.id) || !/^[1-9]\d{0,8}$/.test(req.body.version || '')) {
      return res.status(400).render('error', { title: 'Invalid notice', message: 'A valid notice and version are required.' });
    }
    let details;
    try { details = validateNotice(req.body); }
    catch (error) { return res.status(400).render('error', { title: 'Invalid notice', message: error.message }); }
    try {
      const result = await dbQuery(`UPDATE security_vulnerability_notices SET
        history = history || jsonb_build_array(jsonb_build_object('details', details, 'version', version,
          'updated_by', updated_by, 'updated_at', updated_at)),
        details = $1::jsonb, updated_by = $2, updated_at = NOW(), version = version + 1
        WHERE id = $3 AND version = $4 RETURNING id`, [JSON.stringify(details), req.user.email, req.params.id, Number(req.body.version)]);
      if (!result.rows.length) return res.status(409).render('error', {
        title: 'Notice changed', message: 'The notice changed or no longer exists. Reload before saving; no changes were made.'
      });
      res.redirect('/admin/security-notices?saved=1');
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createSecurityNoticesRouter, validateNotice };
