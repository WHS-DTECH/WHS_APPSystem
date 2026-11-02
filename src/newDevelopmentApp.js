const crypto = require('crypto');
const { BuilderError } = require('./moduleBuilderProviders');
const { DEVELOPMENT_POLICY } = require('./developmentPolicy');

const signature = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function testerDirectory(accounts, directory) {
  const normaliseEmail = value => String(value || '').trim().toLowerCase();
  const byEmail = new Map();
  for (const account of accounts) {
    const email = normaliseEmail(account.email);
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(account);
  }
  const matchedEmails = new Set();
  const testers = [];
  for (const [kind, people] of [['staff', directory.staff], ['student', directory.students]]) {
    for (const person of people) {
      const email = normaliseEmail(person.email_school);
      const matches = byEmail.get(email) || [];
      const account = matches.length === 1 ? matches[0] : null;
      const unavailable = !email ? 'No school email recorded in Kamar' :
        matches.length > 1 ? 'Multiple matching accounts - administrator check required' :
          !account ? 'Not signed in yet - school sign-in required before selection' :
            !account.is_active ? 'Account inactive - administrator check required' : '';
      const reference = String(kind === 'staff' ? person.code || '' : person.id_number || '').trim();
      testers.push({
        id: !unavailable ? account.id : null,
        display_name: [person.first_name, person.last_name].map(value => String(value || '').trim()).filter(Boolean).join(' ') || reference || email || 'Name not recorded',
        email, reference, unavailable,
        is_staff: kind === 'staff', is_student: kind === 'student'
      });
      if (email) matchedEmails.add(email);
    }
  }
  for (const account of accounts) {
    if (account.is_active && !matchedEmails.has(normaliseEmail(account.email))) {
      testers.push({ ...account, reference: '', unavailable: '', is_staff: false, is_student: false });
    }
  }
  return testers.sort((a, b) => a.display_name.localeCompare(b.display_name, 'en-NZ') || a.email.localeCompare(b.email));
}

function newAppInput(body) {
  function text(value, field, limit) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limit ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f]|postgres(?:ql)?:\/\/|-----BEGIN|github_pat_|gh[pousr]_/i.test(value)) {
      throw new BuilderError(`Enter a valid ${field}, without secrets.`);
    }
    return value.trim();
  }
  const name = text(body.name, 'app name', 100);
  const description = text(body.description, 'purpose', 1500);
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');
  if (!/^[a-z][a-z0-9-]{2,39}$/.test(slug)) throw new BuilderError('Use an app name that produces a key of 3-40 letters, digits or hyphens, beginning with a letter.');
  const raw = body.testers === undefined ? [] : Array.isArray(body.testers) ? body.testers : [body.testers];
  if (raw.length > 50 || raw.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new BuilderError('Choose up to 50 active school testers.');
  }
  return { name, description, slug, testers: [...new Set(raw)].sort() };
}
function newAppApproval(input, configuration) {
  return signature({ input, configuration, policy: DEVELOPMENT_POLICY, version: 1 });
}
function setupFingerprint(project, settings, configuration) {
  return signature({
    slug: project.slug, name: project.name, description: project.description, branch: project.branch,
    mountPath: project.mount_path, deploymentType: project.deployment_type,
    settings: { serviceName: settings.serviceName, databaseName: settings.databaseName, region: settings.region,
      servicePlan: settings.servicePlan, databasePlan: settings.databasePlan, healthPath: settings.healthPath,
      dockerfilePath: settings.dockerfilePath },
    configuration
  });
}
function nextSetupAction(project, settings) {
  if (!project.repository) return 'repository';
  if (!project.repository_managed) throw new BuilderError('Guided setup will not change a repository it did not create. Use technical details.', 409);
  if (!project.framework_commit) return 'scaffold';
  if (!settings.databaseId) return 'database';
  if (!settings.databaseManaged) throw new BuilderError('Guided setup requires its own separate database. Use technical details to inspect this record.', 409);
  if (!settings.serviceId) return 'service';
  return null;
}

module.exports = { testerDirectory, newAppInput, newAppApproval, setupFingerprint, nextSetupAction };
