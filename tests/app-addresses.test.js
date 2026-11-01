const test = require('node:test');
const assert = require('node:assert/strict');
const { httpsAppUrl, appDestination } = require('../src/appAddresses');
const { appUrl } = require('../src/moduleBuilder');

test('registered app origins support other providers without loosening exact origin validation', () => {
  for (const url of ['https://fixture.onrender.com', 'https://planner.example.school.nz', 'https://app.other-provider.example/']) {
    assert.equal(httpsAppUrl(url), new URL(url).href);
    assert.equal(appUrl(url), new URL(url).href);
  }
  for (const url of ['http://example.school.nz', 'https://localhost/', 'https://example.school.nz/path',
    'https://user:password@example.school.nz', 'https://example.school.nz:8443', 'https://example.school.nz/?token=value',
    'https://example.school.nz/#fragment', '//example.school.nz', 'https://example.school.nz/\\path',
    'https://example.school.nz/\n']) {
    assert.throws(() => httpsAppUrl(url));
    assert.throws(() => appUrl(url));
  }
});

test('app destinations accept stable local paths or HTTPS and reject unsafe navigation', () => {
  assert.equal(appDestination('/teacher-planner/'), '/teacher-planner/');
  assert.equal(appDestination('/international-app/?view=home'), '/international-app/?view=home');
  assert.equal(appDestination('https://example.school.nz/app/'), 'https://example.school.nz/app/');
  for (const url of ['javascript:alert(1)', 'http://example.school.nz', '//example.school.nz', '/\\example.school.nz',
    '/a/../admin', '/a/%2e%2e/admin', '/app/\n', '', '#', 'https://user:password@example.school.nz']) {
    assert.throws(() => appDestination(url));
  }
});
