const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query } = require('./db');
const { ensureAuthenticated, ensureRole } = require('./middleware');
const { accessibleModules } = require('./moduleAccess');
const { appDestination } = require('./appAddresses');
const { developmentProjects } = require('./developmentProjects');

const template = fs.readFileSync(path.join(__dirname, '..', 'views', 'launchpad.html'), 'utf8');
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
  const moduleKey = text('moduleKey');
  const icon = text('icon');
  const order = text('sortOrder');
  if (!title || title.length > 100 || !description || description.length > 500 ||
      !/^[a-z][a-z0-9-]{1,79}$/.test(moduleKey) || !Object.hasOwn(iconLabels, icon) ||
      !/^\d{1,4}$/.test(order) || /[\x00-\x1f\x7f]/.test(title + description)) {
    throw new Error('Enter a title (1-100 characters), description (1-500 characters), registered module, icon and order (0-9999).');
  }
  return { title, description, moduleKey, icon, sortOrder: Number(order), visible: body.visible === 'on' };
}

function renderLaunchpad(links) {
  if (!cardRegion.test(template)) throw new Error('Launchpad template is missing its card markers.');
  const cards = links.filter(link => link.is_visible).map(link => {
    if (!Object.hasOwn(icons, link.icon)) throw new Error('Unknown Launchpad icon.');
    const destination = appDestination(link.url);
    const badge = link.development ? '<span class="dev-badge">In development · ADMIN only</span>' : '';
    return `<a class="app${link.development ? ' app-dev' : ''}" href="${escapeHtml(destination)}">
      <span class="icon" aria-hidden="true">${icons[link.icon]}</span>
      ${badge}<h3>${escapeHtml(link.title)}</h3>
      <p class="description">${escapeHtml(link.description)}</p>
      <span class="open">Open ${escapeHtml(link.title)} <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></span>
    </a>`;
  }).join('\n');
  return template.replace(cardRegion, () => `<div class="apps">${cards || '<p>No active apps are assigned to your account. Ask your module Lead Teacher or a Global Control administrator for access.</p>'}</div>`);
}

function createLaunchpad({ dbQuery = query } = {}) {
  return async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      if (!req.user) return res.render('home', { title: 'WHS Launchpad', modules: [], loginFailed: req.query.login === 'failed' });
      if (req.user.is_active === false) {
        return res.status(403).render('error', { title: 'Access denied', message: 'This school account is inactive.' });
      }
      const modules = await accessibleModules(req.user, dbQuery);
      const { rows } = await dbQuery('SELECT * FROM launchpad_links ORDER BY sort_order,title,id');
      const cards = modules.map(module => {
        const configured = rows.find(link => link.module_key === module.module_key);
        return configured ? { ...configured, url: `/launchpad/apps/${encodeURIComponent(module.module_key)}` } : {
          title: module.display_name, description: module.description || 'Open your assigned school app.',
          icon: 'hub', is_visible: true, sort_order: 100,
          url: `/launchpad/apps/${encodeURIComponent(module.module_key)}`
        };
      }).sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
      const origin = value => { try { return new URL(value).origin; } catch { return null; } };
      const shownNames = new Set(cards.map(card => card.title.trim().toLowerCase())
        .concat(modules.map(module => String(module.display_name || '').trim().toLowerCase())));
      const shownOrigins = new Set(modules.map(module => origin(module.path)).filter(Boolean));
      for (const project of await developmentProjects(req.user, dbQuery)) {
        if (shownNames.has(project.name.trim().toLowerCase()) || shownOrigins.has(origin(project.app_url))) continue;
        cards.push({
          title: project.name, icon: 'hub', is_visible: true, development: true,
          description: project.description || (project.app_url
            ? 'New app in development. Only global administrators can see this card.'
            : 'Not deployed yet. Open its setup in Module Builder.'),
          url: project.app_url || `/module-builder/${project.id}/setup`
        });
      }
      res.type('html').send(renderLaunchpad(cards));
    } catch (error) {
      console.error('[launchpad] Could not load assigned apps:', error);
      res.status(503).render('launchpad-unavailable', { title: 'Launchpad temporarily unavailable' });
    }
  };
}

function createLaunchApp({ dbQuery = query } = {}) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.redirect('/auth/google?next=' + encodeURIComponent(req.originalUrl));
    try {
      const modules = await accessibleModules(req.user, dbQuery);
      const module = modules.find(item => item.module_key === req.params.moduleKey);
      if (!module) return res.status(403).render('error', { title: 'App access denied', message: 'This app is inactive or has not been assigned to your active school account.' });
      const destination = appDestination(module.path);
      if (destination === '/' || /^\/(?:launchpad|auth)(?:[/?#]|$)/i.test(destination)) {
        throw new Error('The registered app destination points to Global Control sign-in or the Launchpad.');
      }
      res.redirect(destination);
    } catch (error) { next(error); }
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
      const [links, modules] = await Promise.all([
        dbQuery('SELECT * FROM launchpad_links ORDER BY sort_order,title,id'),
        dbQuery('SELECT * FROM modules ORDER BY display_name')
      ]);
      res.render('admin/launchpad', {
        title: 'Launchpad Management', links: links.rows, modules: modules.rows, iconLabels,
        csrf: req.session.launchpadCsrf, saved: req.query.saved === '1'
      });
    } catch (error) { next(error); }
  });
  router.get('/download', (req, res) => {
    res.status(410).render('error', { title: 'Standalone download retired', message: 'The Launchpad now requires Google sign-in and live app assignments. Share the WHS_APPSystem address instead of a standalone HTML copy.' });
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
      console.warn('[launchpad] Link input rejected:', error.message);
      return res.status(400).render('error', { title: 'Link not saved', message: error.message });
    }
    try {
      const module = (await dbQuery('SELECT * FROM modules WHERE module_key=$1', [input.moduleKey])).rows[0];
      if (!module) return res.status(400).render('error', { title: 'Link not saved', message: 'Choose a registered module. Register the app in App Module Management first.' });
      if ((await dbQuery('SELECT id FROM launchpad_links WHERE module_key=$1 AND id::text<>$2', [input.moduleKey, id])).rows.length) {
        return res.status(409).render('error', { title: 'Link not saved', message: 'This module already has a Launchpad card. Edit that card instead.' });
      }
      const params = [input.title, module.path, input.description, input.icon, input.sortOrder, input.visible, req.user.id, input.moduleKey];
      if (id) {
        const result = await dbQuery(`UPDATE launchpad_links SET title=$1,url=$2,description=$3,icon=$4,
          sort_order=$5,is_visible=$6,updated_by=$7,module_key=$8,updated_at=NOW() WHERE id=$9 RETURNING id`, [...params, id]);
        if (!result.rowCount) return res.status(404).render('error', { title: 'Link not found', message: 'This Launchpad link no longer exists. Reload the page.' });
      } else {
        await dbQuery(`INSERT INTO launchpad_links(title,url,description,icon,sort_order,is_visible,updated_by,module_key)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, params);
      }
      res.redirect(303, '/admin/launchpad?saved=1');
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createLaunchpad, createLaunchApp, createLaunchpadAdminRouter, renderLaunchpad, linkInput };
