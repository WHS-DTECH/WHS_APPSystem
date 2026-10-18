const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { sendEmail } = require('./email');

const RECIPIENT = 'tech@westlandhigh.school.nz';
const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function createContactRouter({ deliver = sendEmail } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user) return res.redirect('/auth/google?next=%2Fcontact');
    if (req.user.is_active === false) {
      return res.status(403).render('error', { title: 'Access denied', message: 'This school account is inactive.' });
    }
    if (!req.session.contactCsrf) req.session.contactCsrf = crypto.randomBytes(32).toString('hex');
    next();
  });
  function render(req, res, status = 200, message = '', values = {}, sent = false) {
    return res.status(status).render('contact', {
      title: 'Contact Web Master', csrf: req.session.contactCsrf, recipient: RECIPIENT,
      sender: req.user.email, message, values, sent
    });
  }
  router.get('/', (req, res) => {
    const sent = Boolean(req.session.contactSent);
    delete req.session.contactSent;
    return render(req, res, 200, sent ? 'Your message has been sent to the Web Master.' : '', {}, sent);
  });
  router.post('/', rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5,
    handler: (req, res) => {
      console.warn('[contact] Submission rate limit reached.');
      render(req, res, 429, 'Too many contact attempts. Please wait 15 minutes before trying again.');
    }
  }), async (req, res, next) => {
    const supplied = Buffer.from(typeof req.body.csrf === 'string' ? req.body.csrf : '');
    const expected = Buffer.from(req.session.contactCsrf);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      console.warn('[contact] Invalid form token.');
      return render(req, res, 403, 'This form has expired. Please try again using this refreshed form.');
    }
    const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
    const body = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!subject || subject.length > 150 || /[\r\n\x00-\x1f\x7f]/.test(subject)
      || !body || body.length > 10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body)) {
      console.warn('[contact] Invalid contact form fields.');
      return render(req, res, 400, 'Enter a subject (1-150 characters) and message (1-10,000 characters).',
        { subject: subject.slice(0, 150), message: body.slice(0, 10000) });
    }
    if (typeof req.user.email !== 'string' || !/^[^\s<>@,;]+@[^\s<>@,;]+$/.test(req.user.email)) {
      console.warn('[contact] Invalid signed-in email address.');
      return render(req, res, 403, 'Your school email could not be verified. Please sign in again.');
    }
    const text = `Web Master contact from ${req.user.email}\n\n${body}`;
    try {
      const result = await deliver({
        to: [RECIPIENT], replyTo: req.user.email, subject: `[Web Master] ${subject}`,
        text, html: `<pre>${escapeHtml(text)}</pre>`
      });
      if (!result.ok) {
        console.error('[contact] Global Control email delivery failed.');
        return render(req, res, 503, 'Your message was not sent. Please retry later or email ' + RECIPIENT + ' directly.',
          { subject, message: body });
      }
      req.session.contactSent = true;
      return res.redirect(303, '/contact');
    } catch (error) {
      next(error);
    }
  });
  return router;
}

module.exports = { createContactRouter };
