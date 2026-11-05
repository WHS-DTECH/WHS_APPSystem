const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { query } = require('./db');
const { ensureRole } = require('./middleware');

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const statuses = { open: 'Open', 'in-progress': 'In progress', resolved: 'Resolved' };
const cleanText = (value, max, required = false) => typeof value === 'string' && value.length <= max &&
  (!required || value.trim().length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);

function faultInput(body) {
  const text = key => typeof body[key] === 'string' ? body[key].trim() : '';
  const values = { subject: text('subject'), appName: text('appName'), pageUrl: text('pageUrl'), description: text('description') };
  if (!cleanText(values.subject, 150, true) || /[\r\n]/.test(values.subject) ||
    !cleanText(values.appName, 100, true) || /[\r\n]/.test(values.appName) ||
    !cleanText(values.description, 10000, true) || !cleanText(values.pageUrl, 2048)) {
    throw new Error('Enter a subject (1-150 characters), app/service (1-100 characters), and fault details (1-10,000 characters).');
  }
  if (values.pageUrl) {
    const local = values.pageUrl.startsWith('/') && !values.pageUrl.startsWith('//');
    let url;
    try { url = new URL(values.pageUrl, local ? 'https://whs.invalid' : undefined); }
    catch { throw new Error('Use a page path beginning with / or a full HTTP/HTTPS address.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\s\\]/.test(values.pageUrl)) {
      throw new Error('Use a page path or HTTP/HTTPS address without passwords or spaces.');
    }
    values.pageUrl = local ? url.pathname : url.origin + url.pathname;
  }
  return values;
}

function createHelpdeskRouters({ dbQuery = query } = {}) {
  const faults = express.Router();
  const helpdesk = express.Router();
  function authenticated(req, res, next) {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
    if (req.user.is_active === false) {
      return res.status(403).render('error', { title: 'Access denied', message: 'This school account is inactive.' });
    }
    if (!req.session.faultCsrf) req.session.faultCsrf = crypto.randomBytes(32).toString('hex');
    next();
  }
  function token(req, res, next) {
    const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
    const expected = Buffer.from(req.session.faultCsrf);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      console.warn('[helpdesk] Form token rejected.');
      return res.status(403).render('error', {
        title: 'Form expired', message: 'Reload the fault form or Helpdesk ticket and try again. No changes were saved.'
      });
    }
    next();
  }
  faults.use(authenticated);
  helpdesk.use(authenticated, ensureRole('ADMIN'));
  const formatDate = value => new Intl.DateTimeFormat('en-NZ', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland'
  }).format(new Date(value));
  function renderForm(req, res, code = 200, message = '', values = {}) {
    return res.status(code).render('faults/new', {
      title: 'Report a fault', csrf: req.session.faultCsrf, message, values, sender: req.user.email
    });
  }
  function list(manage) {
    return async (req, res, next) => {
      const selectedStatus = req.query.status || '';
      const page = Number(req.query.page || 1);
      if (typeof selectedStatus !== 'string' || selectedStatus && !Object.hasOwn(statuses, selectedStatus) ||
        !Number.isInteger(page) || page < 1 || page > 100000) {
        console.warn('[helpdesk] Invalid ticket filter.');
        return res.status(400).render('error', { title: 'Invalid filter', message: 'Choose a valid ticket status and page.' });
      }
      try {
        const result = await dbQuery(`SELECT f.id,f.ticket_number,f.subject,f.app_name,f.status,f.created_at,
          u.display_name AS reporter_name FROM helpdesk_faults f JOIN users u ON u.id=f.reporter_id
          WHERE ($1::uuid IS NULL OR f.reporter_id=$1) AND ($2::text='' OR f.status=$2)
          ORDER BY f.created_at DESC,f.id LIMIT 26 OFFSET $3`,
        [manage ? null : req.user.id, selectedStatus, (page - 1) * 25]);
        res.render('faults/list', { title: manage ? 'Helpdesk' : 'My fault reports', manage,
          tickets: result.rows.slice(0, 25), more: result.rows.length > 25, page, selectedStatus, statuses, formatDate });
      } catch (error) { next(error); }
    };
  }
  function detail(manage) {
    return async (req, res, next) => {
      if (!UUID.test(req.params.id)) {
        console.warn('[helpdesk] Invalid ticket address.');
        return res.status(400).render('error', { title: 'Invalid ticket', message: 'Choose a ticket from your fault reports or Helpdesk.' });
      }
      try {
        const result = await dbQuery(`SELECT f.*,u.display_name AS reporter_name,u.email AS reporter_email
          FROM helpdesk_faults f JOIN users u ON u.id=f.reporter_id
          WHERE f.id=$1 AND ($2::uuid IS NULL OR f.reporter_id=$2)`, [req.params.id, manage ? null : req.user.id]);
        if (!result.rows.length) {
          return res.status(404).render('error', { title: 'Ticket not found', message: 'This fault report was not found or is not available to your account.' });
        }
        res.render('faults/detail', { title: 'Fault #' + result.rows[0].ticket_number, ticket: result.rows[0], manage,
          csrf: req.session.faultCsrf, statuses, formatDate,
          message: req.query.created === '1' ? 'Your fault report has been saved to Helpdesk.' :
            req.query.saved === '1' && manage ? 'Ticket updated.' : '' });
      } catch (error) { next(error); }
    };
  }
  faults.get('/', list(false));
  faults.get('/new', (req, res) => renderForm(req, res));
  faults.post('/', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5,
    handler(req, res) {
      console.warn('[helpdesk] Fault submission rate limit reached.');
      renderForm(req, res, 429, 'Too many fault reports. Please wait 15 minutes before trying again.');
    }
  }), token, async (req, res) => {
    let values;
    try { values = faultInput(req.body); }
    catch (error) {
      console.warn('[helpdesk] Invalid fault form.');
      const retained = Object.fromEntries(['subject', 'appName', 'pageUrl', 'description'].map(key =>
        [key, typeof req.body[key] === 'string' ? req.body[key].slice(0, key === 'description' ? 10000 : 2048) : '']));
      return renderForm(req, res, 400, error.message, retained);
    }
    try {
      const result = await dbQuery(`INSERT INTO helpdesk_faults(id,reporter_id,subject,app_name,page_url,description)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [crypto.randomUUID(), req.user.id, values.subject, values.appName, values.pageUrl, values.description]);
      if (!result.rows.length) throw new Error('Fault insert returned no ticket.');
      res.redirect(303, '/faults/' + result.rows[0].id + '?created=1');
    } catch (error) {
      console.error('[helpdesk] Fault report could not be saved:', error.message);
      return renderForm(req, res, 503, 'Your fault report was NOT saved. Please retry or email tech@westlandhigh.school.nz directly.', values);
    }
  });
  faults.get('/:id', detail(false));
  helpdesk.get('/', list(true));
  helpdesk.get('/:id', detail(true));
  helpdesk.post('/:id', token, async (req, res, next) => {
    const status = req.body.status;
    const revision = Number(req.body.revision);
    const reply = typeof req.body.reply === 'string' ? req.body.reply.trim() : '';
    if (!UUID.test(req.params.id) || typeof status !== 'string' || !Object.hasOwn(statuses, status) ||
      !Number.isInteger(revision) || revision < 1 || typeof req.body.reply !== 'string' || !cleanText(reply, 4000)) {
      console.warn('[helpdesk] Invalid ticket update.');
      return res.status(400).render('error', { title: 'Invalid ticket update', message: 'Choose Open, In progress or Resolved and a reply of at most 4,000 characters.' });
    }
    try {
      const result = await dbQuery(`UPDATE helpdesk_faults SET status=$2,reply=$3,updated_by=$4,
        updated_at=NOW(),revision=revision+1 WHERE id=$1 AND revision=$5 RETURNING id`,
      [req.params.id, status, reply, req.user.id, revision]);
      if (!result.rows.length) {
        console.warn('[helpdesk] Ticket revision conflict.');
        return res.status(409).render('faults/conflict', {
          title: 'Ticket changed', id: req.params.id, reply, status: statuses[status]
        });
      }
      res.redirect(303, '/admin/helpdesk/' + result.rows[0].id + '?saved=1');
    } catch (error) { next(error); }
  });
  return { faults, helpdesk };
}

module.exports = { createHelpdeskRouters, faultInput };
