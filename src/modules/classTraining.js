const express = require('express');
const hostedApps = require('../hostedApps');
const { accessForEmail } = require('./dtechHub');
const email = require('../email');

function createClassTrainingRouter({ access = accessForEmail, proxy = hostedApps.proxy, env = process.env } = {}) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    try {
      if (!req.user) return res.redirect(`/auth/google?next=${encodeURIComponent(req.originalUrl)}`);
      const domain = env.GOOGLE_HOSTED_DOMAIN || 'westlandhigh.school.nz';
      if (!req.user.email?.toLowerCase().endsWith(`@${domain.toLowerCase()}`)) {
        return res.status(403).render('error', { title: 'Access denied', message: 'Use your school Google account for Class Training.' });
      }
      const permissions = await access(req.user.email);
      if (!permissions.active) return res.status(403).render('error', { title: 'Access denied', message: 'This school account is inactive.' });
      if (!env.CLASS_TRAINING_DATABASE_URL) {
        return res.status(503).render('error', {
          title: 'Class Training setup required',
          message: 'Connect CLASS_TRAINING_DATABASE_URL to the existing DTECH-CLASSWORK-DB2 database. Do not change the DTECH or Core database connections.'
        });
      }
      if ([env.DATABASE_URL, env.DTECH_DATABASE_URL].includes(env.CLASS_TRAINING_DATABASE_URL)) {
        return res.status(503).render('error', { title: 'Class Training setup required', message: 'Class Training needs its separate existing classwork database.' });
      }
      return proxy(req, res, 'dtech-class-training', {
        email: req.user.email, name: req.user.display_name,
        role: permissions.admin || ['Lead Teacher', 'Teacher'].includes(permissions.role) ? 'teacher' : 'student'
      });
    } catch (error) { return next(error); }
  });
  return router;
}

async function trainingEmail(req, res, next) {
  if (!hostedApps.validProxyToken(req.get('x-whs-token'))) return res.status(403).json({ success: false, error: 'Forbidden' });
  try {
    const { to, subject, message, sender } = req.body || {};
    const address = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof to !== 'string' || !address.test(to) || typeof sender !== 'string' || !address.test(sender)
      || typeof message !== 'string' || !message.trim() || message.length > 20000
      || typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject)) {
      return res.status(400).json({ success: false, error: 'Valid teacher, sender, subject and message are required.' });
    }
    const result = await email.sendEmail({
      to, subject: `[DTECH Class Training] ${subject}`, text: `From school account: ${sender}\n\n${message}`,
      source: 'DTECH Class Training'
    });
    if (!result.ok) return res.status(502).json({ success: false, error: result.error || result.message || 'School email failed.' });
    return res.json({ success: true });
  } catch (error) { return next(error); }
}

module.exports = { createClassTrainingRouter, trainingEmail };
