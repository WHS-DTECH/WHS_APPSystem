const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');

test('setup refreshes resources/links/history between steps and shows a deployment failure without recreating anything', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'public', 'new-development-app.js'), 'utf8');
  const button = { textContent: 'Start / Resume approved setup', disabled: false };
  const status = { textContent: '' };
  const form = {
    action: 'https://core.example.test/module-builder/project/setup/step',
    querySelector: () => button,
    addEventListener(type, handler) { this[type] = handler; }
  };
  let snapshots = 0, posts = 0, reloads = 0;
  const replaced = [];
  const elements = Object.fromEntries(['setup-resources', 'setup-links', 'setup-history'].map(id => [
    id, { replaceWith(node) { replaced.push({ id, snapshot: node.snapshot }); } }
  ]));
  const results = [
    { state: 'progress', message: 'Repository created and recorded.' },
    { state: 'waiting', message: 'Render deployment is build_in_progress; waiting for it to become live.' },
    { error: 'Development deployment is update_failed. Check Render logs; no resource will be recreated.' }
  ];
  vm.runInNewContext(source, {
    document: {
      getElementById: id => id === 'development-setup' ? form : id === 'setup-status' ? status : elements[id],
      importNode: node => node
    },
    DOMParser: class {
      parseFromString(text) { return { getElementById: id => id === 'development-setup' ? {} : { snapshot: text } }; }
    },
    FormData: class { *[Symbol.iterator]() { yield ['csrf', 'fixture']; } },
    URLSearchParams, AbortSignal, Date,
    window: { location: { reload() { reloads++; } } },
    setTimeout: resolve => {
      if (posts === 2) {
        assert.match(button.textContent, /Waiting for Render/);
        assert.match(status.textContent, /build_in_progress/);
        assert.match(status.textContent, /Checking again in 10 seconds/);
      }
      resolve();
    },
    fetch: async (url, options) => {
      if (options.method === 'POST') {
        assert.equal(button.disabled, true);
        const result = results[posts++];
        return { ok: !result.error, headers: { get: () => 'application/json' }, json: async () => result };
      }
      assert.equal(url, 'https://core.example.test/module-builder/project/setup');
      snapshots++;
      return { ok: true, text: async () => String(snapshots) };
    }
  });
  await form.submit({ preventDefault() {} });
  assert.equal(posts, 3);
  assert.equal(snapshots, 4);
  assert.equal(replaced.length, 12);
  assert.match(status.textContent, /Setup stopped.*update_failed/);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Start / Resume approved setup');
  assert.equal(reloads, 0);
});

test('generated migration diagnostics identify safe failure categories without echoing credentials or SQL', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'module-templates', 'node', 'migrate.js.template'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, { module, require, process });
  const { migrationFailure } = module.exports;
  assert.match(migrationFailure({ code: 'ENOENT', message: 'private path' }), /files are missing/);
  assert.match(migrationFailure({ code: '28P01', message: 'password secret' }), /authentication failed/);
  assert.match(migrationFailure({ code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'private hostname' }), /TLS certificate/);
  assert.match(migrationFailure({ message: 'The server does not support SSL connections' }), /does not support.*TLS/);
  assert.equal(migrationFailure({ code: 'secret-code', message: 'postgresql://password; private SQL' }),
    'Module migration failed. Check database access and migration files.');
});
