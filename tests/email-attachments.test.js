const test = require('node:test');
const assert = require('node:assert/strict');
const { google } = require('googleapis');
const config = require('../src/config');
const db = require('../src/db');
const { sendEmail } = require('../src/email');

test('module invitation test MIME goes only to Tech, with no CC, BCC or default recipients', async (t) => {
  const originalConfig = { ...config.email.gmail };
  t.after(() => Object.assign(config.email.gmail, originalConfig));
  let message, log;
  t.mock.method(google, 'gmail', () => ({ users: { messages: { send: async request => {
    message = Buffer.from(request.requestBody.raw, 'base64url').toString('utf8');
    return { data: { id: 'invitation-test-message' }, status: 200 };
  } } } }));
  t.mock.method(db, 'query', async (_sql, values) => { log = values; return { rows: [] }; });
  Object.assign(config.email.gmail, {
    isConfigured: true, clientId: 'fixture', clientSecret: 'fixture', refreshToken: 'fixture',
    senderEmail: 'sender@example.test', defaultRecipients: ['never-send@example.test']
  });
  const result = await sendEmail({
    to: 'tech@westlandhigh.school.nz', cc: [],
    subject: '[TEST] Teacher Planner \u2014 Your invitation to get started',
    text: 'Kia ora Ema,\n\nNg\u0101 mihi,\nWHS Technology Support',
    html: '<p>Kia ora Ema,</p><p>Ng\u0101 mihi,<br>WHS Technology Support</p>'
  });
  assert.equal(result.ok, true);
  assert.match(message, /^To: tech@westlandhigh.school.nz\r?$/m);
  assert.doesNotMatch(message, /^(?:Cc|Bcc):/mi);
  assert.doesNotMatch(message, /never-send@example.test/);
  assert.match(message, /Subject:.*=\?UTF-8\?/i);
  assert.equal(log[1], 'sent');
  assert.equal(log[2], 'tech@westlandhigh.school.nz');
});

test('shared Gmail preserves DTECH attachment bytes and CC without external file access', async () => {
  const originalGmail = google.gmail;
  const originalQuery = db.query;
  const originalConfig = { ...config.email.gmail };
  let message;
  let log;
  google.gmail = () => ({ users: { messages: { send: async (request) => {
    message = Buffer.from(request.requestBody.raw, 'base64url').toString('utf8');
    return { data: { id: 'fixture-message' }, status: 200 };
  } } } });
  db.query = async (sql, values) => { log = values; return { rows: [] }; };
  Object.assign(config.email.gmail, {
    isConfigured: true, clientId: 'fixture', clientSecret: 'fixture', refreshToken: 'fixture',
    senderEmail: 'teacher@example.test'
  });
  try {
    const result = await sendEmail({
      to: ['student@example.test'], cc: 'teacher@example.test', subject: '[DTECH Hub] Certificate',
      html: '<p>Certificate attached.</p>',
      attachments: [{ filename: 'certificate.pdf', content: Buffer.from('%PDF-fixture'), contentType: 'application/pdf' }]
    });
    assert.equal(result.ok, true);
    assert.match(message, /Cc: teacher@example.test/);
    assert.match(message, /Content-Disposition: attachment; filename=certificate.pdf/);
    assert.match(message, new RegExp(Buffer.from('%PDF-fixture').toString('base64')));
    assert.equal(log[0], 'DTECH Hub');
    assert.equal(log[1], 'sent');
  } finally {
    google.gmail = originalGmail;
    db.query = originalQuery;
    Object.assign(config.email.gmail, originalConfig);
  }
});
