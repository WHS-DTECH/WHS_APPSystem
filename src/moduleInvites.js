const express = require('express');
const { isDeepStrictEqual } = require('node:util');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { query } = require('./db');
const { sendEmail } = require('./email');
const config = require('./config');
const { HUBS, SYSTEM_MODULES } = require('./hubRoles');
const { appUrl } = require('./moduleBuilder');
const { BuilderError } = require('./moduleBuilderProviders');

const ROOT = '/admin/users/invites';
const TEST_ADDRESS = 'tech@westlandhigh.school.nz';
const LOGO_CID = 'whs-school-logo@westlandhigh.school.nz';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'whs logo circular reo .png');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const email = value => typeof value === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const descriptions = {
  'teacher-planner': [
    'a digital space to organise your teaching year.',
    'The planner includes year and term overviews, weekly planning, timetable information, and space for notes and reflections. It can also bring relevant school events and your connected Google Calendar into your planning.'
  ],
  'dtech-hub': ['a shared space for Digital Technologies teaching and learning.',
    'Browse activities and teaching resources, and use the planning tools available for your assigned role.'],
  'sewing-hub': ['a shared space for sewing and textiles teaching resources.',
    'Explore sewing activities and resources, with teaching and management tools available according to your assigned role.'],
  'food-room': ['a shared space for Food Room teaching and practical organisation.',
    'Find recipes and practical resources, with booking, planning and ordering tools available according to your assigned role.'],
  workshop: ['a shared space for workshop teaching and learning.',
    'Find workshop activities, worksheets and lesson resources, with planning and management tools available according to your assigned role.'],
  'technology-hub': ['a starting point for the school\'s Technology learning spaces.',
    'Open the Technology areas assigned to you and find the relevant teaching resources. Area access is managed separately.'],
  'learning-sites': ['a shared space for school course information and learning resources.',
    'Find course and assessment information. Teaching roles can open the Relief Plan, and the module Lead Teacher can manage the HOD Update Dashboard.']
};

class InviteError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function createModuleInvitesRouter({ dbQuery = query, mail = sendEmail, baseUrl = config.appBaseUrl } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (req.user.is_active === false) {
      return deny(res, new InviteError('This administrator account is inactive. Sign in with an active administrator account.', 403));
    }
    next();
  });
  async function snapshot(moduleKey, userId, actor) {
    if (!uuid(userId) || typeof moduleKey !== 'string' || SYSTEM_MODULES.includes(moduleKey)) {
      throw new InviteError('Choose an assigned user in a teaching module, not Global Control or a system administration module.');
    }
    if (!email(actor.email)) throw new InviteError('Your signed-in Google email is missing or invalid. Sign in again.', 409);
    const user = (await dbQuery('SELECT id,email,display_name FROM users WHERE id=$1 AND is_active=true', [userId])).rows[0];
    if (!user || !email(user.email)) throw new InviteError('This user is inactive or has no valid email address.', 409);
    const roles = (await dbQuery(`SELECT r.role_key,r.display_name FROM user_hub_roles ur
      JOIN hub_roles r ON r.id=ur.hub_role_id
      WHERE ur.user_id=$1 AND r.hub_key=$2 AND ur.area_key IS NULL ORDER BY r.role_key`, [userId, moduleKey])).rows;
    if (!roles.length) throw new InviteError('This user no longer has a module-wide role in the selected module.', 409);
    const registered = (await dbQuery(`SELECT display_name,description,path,is_active FROM modules
      WHERE module_key=$1`, [moduleKey])).rows[0];
    const app = (await dbQuery(`SELECT a.*,m.is_active AS module_active FROM student_apps a
      LEFT JOIN modules m ON m.module_key='student-app-'||a.slug
      WHERE a.hub_key=$1`, [moduleKey])).rows[0];
    const project = (await dbQuery(`SELECT p.*,e.config->>'appUrl' AS app_url FROM module_builder_projects p
      LEFT JOIN module_builder_environments e ON e.project_id=p.id
        AND e.kind=CASE WHEN p.stage='released' THEN 'production' ELSE 'development' END
      WHERE p.slug=$1`, [moduleKey])).rows[0];
    if (registered?.is_active === false || app?.module_active === false || project?.stage === 'archived') {
      throw new InviteError('This module is inactive or archived. Enable it before preparing an invitation.', 409);
    }
    let name, description, url;
    if (app) {
      if (app.status !== 'active') throw new InviteError('Register and activate this app before inviting its users.', 409);
      const mapping = (await dbQuery('SELECT platform_role,app_role FROM student_app_role_map WHERE app_id=$1', [app.id])).rows;
      if (!roles.some(role => mapping.some(row => row.platform_role === (role.role_key === 'technician' ? 'teacher' : role.role_key) && row.app_role))) {
        throw new InviteError('Map this user\'s role to a role inside the app before sending an invitation.', 409);
      }
      name = app.name; description = app.description;
      url = new URL('/student-apps/' + encodeURIComponent(app.slug) + '/open', baseUrl).href;
    } else if (project) {
      if (!roles.some(role => ['lead-teacher', 'teacher', 'technician'].includes(role.role_key))) {
        throw new InviteError('This project requires a Lead Teacher, Teacher or Technician assignment.', 409);
      }
      if (!project.app_url) throw new InviteError('Set the project\'s deployed app URL before sending an invitation.', 409);
      name = project.name; description = project.description;
      url = appUrl(project.app_url);
    } else {
      const hub = HUBS[moduleKey];
      if (!registered && !hub) throw new InviteError('Register a working module link before sending an invitation.', 409);
      name = hub?.label || registered.display_name; description = registered?.description;
      const path = hub?.home || registered.path;
      if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) {
        throw new InviteError('Set a valid local module link before sending an invitation.', 409);
      }
      url = new URL(path, baseUrl).href;
    }
    if (typeof name !== 'string' || !name.trim() || /[\r\n]/.test(name)) throw new InviteError('Correct the module name before sending an invitation.', 409);
    const intro = descriptions[moduleKey] || [
      'a school module for ' + name + '.',
      description || 'Use the module features available for your assigned role. Please contact Technology Support if you need help getting started.'
    ];
    const greeting = String(user.display_name || '').trim().split(/\s+/)[0] || 'there';
    const subject = name + ' \u2014 Your invitation to get started';
    const paragraphs = [
      'Kia ora ' + greeting + ',',
      'You\'ve been given access to ' + name + ', ' + intro[0],
      'Your module role' + (roles.length === 1 ? ' is ' : 's are ') + roles.map(role => role.display_name).join(', ') + '.',
      intro[1],
      'Open ' + name + ':\n' + url,
      'Sign in using your Westland High School Google account.',
      'As you start using ' + (moduleKey === 'teacher-planner' ? 'the planner' : name) + ', we\'d love your feedback. If there are features you would find useful, or anything that could work better for you, please email ' + TEST_ADDRESS + '.',
      'Ng\u0101 mihi,\nWHS Technology Support'
    ];
    const text = paragraphs.join('\n\n');
    const html = `<div style="padding:0 0 16px;margin:0 0 24px;border-bottom:2px solid #193d6a"><img src="cid:${LOGO_CID}" alt="Westland High School logo" width="104" height="104" style="display:block;width:104px;height:104px;margin:0 0 12px"><strong style="font-family:Arial,sans-serif;font-size:20px;color:#193d6a">Westland High School</strong></div>` + paragraphs.map((paragraph, index) => index === 4
      ? `<p>Open ${escape(name)}:<br><a href="${escape(url)}">Open ${escape(name)}</a></p>`
      : `<p>${escape(paragraph).replace(/\n/g, '<br>').replace(TEST_ADDRESS, `<a href="mailto:${TEST_ADDRESS}">${TEST_ADDRESS}</a>`)}</p>`).join('');
    return { to: user.email, cc: actor.email, name, url, subject, text, html };
  }
  const deny = (res, error) => {
    console.warn('Module invitation rejected:', error.message);
    return res.status(error.status).render('error', { title: 'Module invitation not sent', message: error.message });
  };
  const wrap = handler => async (req, res, next) => {
    try { await handler(req, res); } catch (error) {
      if (error instanceof InviteError || error instanceof BuilderError) return deny(res, error);
      next(error);
    }
  };
  router.post('/', wrap(async (req, res) => {
    const content = await snapshot(req.body.module, req.body.userId, req.user);
    const draft = (await dbQuery(`INSERT INTO module_invitations(actor_id,user_id,module_key,snapshot)
      VALUES ($1,$2,$3,$4) RETURNING id`, [req.user.id, req.body.userId, req.body.module, JSON.stringify(content)])).rows[0];
    res.redirect(ROOT + '/' + draft.id);
  }));
  async function draftFor(req) {
    if (!uuid(req.params.id)) throw new InviteError('Choose a valid module invitation.');
    const draft = (await dbQuery(`SELECT *,expires_at>NOW() AS valid FROM module_invitations
      WHERE id=$1 AND actor_id=$2`, [req.params.id, req.user.id])).rows[0];
    if (!draft) throw new InviteError('This invitation belongs to another administrator or no longer exists.', 404);
    return draft;
  }
  router.get('/:id', wrap(async (req, res) => {
    const draft = await draftFor(req);
    res.render('admin/module-invite', {
      title: 'Send Module Invite', draft, content: draft.snapshot, testAddress: TEST_ADDRESS,
      csrf: req.session.adminUsersCsrf
    });
  }));
  async function deliver(req, res, test) {
    const draft = await draftFor(req);
    if (!draft.valid) throw new InviteError('This preview expired. Prepare a new invitation and send a fresh test.', 409);
    if (!test && req.body.confirm !== 'send') throw new InviteError('Tick the confirmation box after reviewing the test email.');
    const current = await snapshot(draft.module_key, draft.user_id, req.user);
    if (!isDeepStrictEqual(current, draft.snapshot)) {
      throw new InviteError('The recipient, role, module or email content changed. Prepare a new invitation and send a fresh test.', 409);
    }
    const claimed = await dbQuery(`UPDATE module_invitations SET status=$3
      WHERE id=$1 AND actor_id=$2 AND status=$4 AND expires_at>NOW() RETURNING id`,
    [draft.id, req.user.id, test ? 'test_sending' : 'sending', test ? 'prepared' : 'test_sent']);
    if (!claimed.rowCount) throw new InviteError('This step has already been attempted or the test has not succeeded. Refresh the preview. No additional email was sent.', 409);
    let result;
    try {
      result = await mail({
        to: test ? TEST_ADDRESS : current.to,
        cc: test ? [] : [current.cc],
        subject: test ? '[TEST] ' + current.subject : current.subject,
        text: test ? `TEST ONLY - no invitation has been sent to the user.\nIntended To: ${current.to}\nIntended CC: ${current.cc}\n\n${current.text}` : current.text,
        html: test ? `<p><strong>TEST ONLY - no invitation has been sent to the user.</strong><br>Intended To: ${escape(current.to)}<br>Intended CC: ${escape(current.cc)}</p>${current.html}` : current.html,
        attachments: [{
          filename: 'whs-school-logo.png', content: await readFile(LOGO_PATH),
          contentType: 'image/png', contentDisposition: 'inline', cid: LOGO_CID
        }]
      });
    } catch (error) {
      await dbQuery("UPDATE module_invitations SET status='failed' WHERE id=$1", [draft.id]);
      console.error('Module invitation delivery threw an error:', error.message);
      throw new InviteError('Delivery could not be confirmed. Check the Email Service log before preparing another invitation. No automatic retry was made.', 502);
    }
    if (!result.ok) {
      await dbQuery("UPDATE module_invitations SET status='failed' WHERE id=$1", [draft.id]);
      console.error('Module invitation delivery failed:', result.error || result.message);
      throw new InviteError('The email was not confirmed as sent. Check Gmail configuration and the Email Service log before preparing another invitation. No automatic retry was made.', 502);
    }
    await dbQuery(test
      ? "UPDATE module_invitations SET status='test_sent',test_sent_at=NOW(),test_message_id=$2 WHERE id=$1"
      : "UPDATE module_invitations SET status='sent',sent_at=NOW(),message_id=$2 WHERE id=$1",
    [draft.id, result.messageId || null]);
    res.redirect(ROOT + '/' + draft.id);
  }
  router.post('/:id/test', wrap((req, res) => deliver(req, res, true)));
  router.post('/:id/confirm', wrap((req, res) => deliver(req, res, false)));
  return router;
}

module.exports = { createModuleInvitesRouter };
