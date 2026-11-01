const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const template = path.join(__dirname, '..', 'module-templates', 'node');

test('new Node modules require the patched Node release in package, Docker and CI', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(template, 'package.json.template'), 'utf8'));
  const dockerfile = fs.readFileSync(path.join(template, 'Dockerfile'), 'utf8');
  const workflow = fs.readFileSync(path.join(template, 'ci.yml.template'), 'utf8');
  const readme = fs.readFileSync(path.join(template, 'README.md.template'), 'utf8');

  assert.equal(packageJson.engines.node, '>=22.23.4 <23');
  assert.match(dockerfile, /^FROM node:22\.23\.4-bookworm-slim$/m);
  assert.match(dockerfile, /apt-get install .*ca-certificates/);
  assert.match(dockerfile, /update-ca-certificates/);
  assert.match(workflow, /node-version: 22\.23\.4/);
  assert.match(readme, /Node 22\.23\.4 or a later 22\.x release/);
});
