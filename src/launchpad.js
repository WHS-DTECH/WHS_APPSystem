const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query } = require('./db');
const { ensureAuthenticated, ensureRole } = require('./middleware');

const template = fs.readFileSync(path.join(__dirname, '..', 'public', 'launchpad.html'), 'utf8');
const icons = Object.fromEntries([...template.matchAll(/<span class="icon" data-icon="([^"]+)" aria-hidden="true">(<svg[\s\S]*?<\/svg>)<\/span>/g)]
  .map(([, name, svg]) => [name, svg]));
const iconLabels = {
  learning: 'Book', hub: 'Module grid', planner: 'Calendar',
  guidance: 'Conversation', international: 'Globe', bus: 'Bus'
};
const cardRegion = /<!-- LAUNCHPAD_CARDS_START -->[\s\S]*?<!-- LAUNCHPAD_CARDS_END -->/;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function linkInput(body) {
  const text = key => typeof body[key] === 'string' ? body[key].trim() : '';
  const title = text('title');
  const description = text('description');
  const url = text('url');
  const icon = text('icon');
  const order = text('sortOrder');
  if (!title || title.length > 100 || !description || description.length > 500 ||
      url.length > 2048 || !Object.hasOwn(iconLabels, icon) ||
      !/^\d{1,4}$/.test(order) || /[\x00-\x1f\x7f]/.test(title + description + url)) {
    throw new Error('Enter a title (1-100 characters), description (1-500 characters), HTTPS address, icon and order (0-9999).');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Enter a valid absolute HTTPS address.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Use an HTTPS address without embedded sign-in credentials.');
  }
  return { title, description, url: parsed.href, icon, sortOrder: Number(order), visible: body.visible === 'on' };
}

function renderLaunchpad(links) {
  if (!cardRegion.test(template)) throw new Error('Launchpad template is missing its card markers.');
  const cards = links.filter(link => link.is_visible).map(link => {
    if (!Object.hasOwn(icons, link.icon)) throw new Error('Unknown Launchpad icon.');
    const parsed = new URL(link.url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Invalid Launchpad link address.');
    return `<a class="app" href="${escapeHtml(link.url)}">
      <span class="icon" aria-hidden="true">${icons[link.icon]}</span>
      <h3>${escapeHtml(link.title)}</h3>
      <p class="description">${escapeHtml(link.description)}</p>
      <span class="open">Open ${escapeHtml(link.title)} <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></span>
    </a>`;
  }).join('\n');
  return template.replace(cardRegion, () => `<div class="apps">${cards || '<p>No services are currently published. Please check back later.</p>'}</div>`);
}

function createPublicLaunchpad({ dbQuery = query } = {}) {
  return async (req, res, next) => {
    try {
      const { rows } = await dbQuery('SELECT * FROM launchpad_links WHERE is_visible=true ORDER BY sort_order,title,id');
      res.set('Cache-Control', 'no-store');
      res.type('html').send(renderLaunchpad(rows));
    } catch (error) {
      console.error('[launchpad] Could not load public links:', error);
      res.status(503).type('text').send('The school Launchpad is temporarily unavailable. Please try again later or contact tech@westlandhigh.school.nz.');
    }
  };
}

function createLaunchpadAdminRouter({ dbQuery = query } = {}) {
  const router = express.Router();
  router.use(ensureAuthenticated, ensureRole('ADMIN'));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.user.is_active === false) return res.status(403).render('error', { title: 'Access denied', message: 'This school account is inactive.' });
    if (!req.session.launchpadCsrf) req.session.launchpadCsrf = crypto.randomBytes(32).toString('hex');
    if (req.method !== 'GET') {
      const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
      const expected = Buffer.from(req.session.launchpadCsrf);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
        return res.status(403).render('error', { title: 'Form expired', message: 'Reload Launchpad Management and try again. No links were changed.' });
      }
    }
    next();
  });
  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await dbQuery('SELECT * FROM launchpad_links ORDER BY sort_order,title,id');
      res.render('admin/launchpad', {
        title: 'Launchpad Management', links: rows, iconLabels,
        csrf: req.session.launchpadCsrf, saved: req.query.saved === '1'
      });
    } catch (error) { next(error); }
  });
  router.get('/download', async (req, res, next) => {
    try {
      const { rows } = await dbQuery('SELECT * FROM launchpad_links WHERE is_visible=true ORDER BY sort_order,title,id');
      // Downloads must bypass shared HTML-navigation injection.
      res.attachment('launchpad.html').type('application/octet-stream').send(renderLaunchpad(rows));
    } catch (error) { next(error); }
  });
  router.post('/save', async (req, res, next) => {
    const id = typeof req.body.id === 'string' ? req.body.id : '';
    if (id && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).render('error', { title: 'Link not saved', message: 'Choose a valid Launchpad link to edit.' });
    }
    let input;
    try {
      input = linkInput(req.body);
    } catch (error) {
      return res.status(400).render('error', { title: 'Link not saved', message: error.message });
    }
    const params = [input.title, input.url, input.description, input.icon, input.sortOrder, input.visible, req.user.id];
    try {
      if (id) {
        const result = await dbQuery(`UPDATE launchpad_links SET title=$1,url=$2,description=$3,icon=$4,
          sort_order=$5,is_visible=$6,updated_by=$7,updated_at=NOW() WHERE id=$8 RETURNING id`, [...params, id]);
        if (!result.rowCount) return res.status(404).render('error', { title: 'Link not found', message: 'This Launchpad link no longer exists. Reload the page.' });
      } else {
        await dbQuery(`INSERT INTO launchpad_links(title,url,description,icon,sort_order,is_visible,updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, params);
      }
      res.redirect(303, '/admin/launchpad?saved=1');
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createPublicLaunchpad, createLaunchpadAdminRouter, renderLaunchpad, linkInput };
