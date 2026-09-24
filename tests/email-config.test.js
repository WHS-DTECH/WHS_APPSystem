const test = require('node:test');
const assert = require('node:assert/strict');

const emailService = require('../src/email');
const config = require('../src/config');

test('email config is present but disabled until Gmail API credentials are configured', () => {
  assert.ok(config.email && config.email.gmail);
  assert.equal(typeof config.email.gmail.isConfigured, 'boolean');
  assert.equal(typeof emailService.sendEmail, 'function');
});

test('sendEmail returns a safe disabled response when Gmail config is missing', async () => {
  const result = await emailService.sendEmail({
    to: 'admin@example.com',
    subject: 'Test',
    text: 'Hello'
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
});
