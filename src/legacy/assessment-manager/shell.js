const UPDATED_AT = '2026-11-18T01:09:19.727Z';
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function renderShell({ baseUrl, coreUrl, standalone, displayName = '', userEmail = '', userId = '', now = new Date() }) {
  const asset = (file) => escape(baseUrl + 'framework/' + file + '?v=students-audit-4');
  const monthYear = new Intl.DateTimeFormat('en-NZ', {
    month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(now);
  const updated = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(new Date(UPDATED_AT));
  const title = 'WHS Assessment Manager';
  const currentYear = new Intl.DateTimeFormat('en-NZ', {
    year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(now);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | WHS APPSystem</title>
${standalone ? `<meta name="whs-global-control" content="${escape(coreUrl)}">` : ''}
<link rel="icon" type="image/png" href="${asset('whs-logo.png')}">
<link rel="stylesheet" href="${asset('account-controls.css')}">
<link rel="stylesheet" href="${asset('module-shell.css')}">
<link rel="stylesheet" href="${asset('assessment-manager.css')}">
</head><body class="whs-module-shell whs-assessment-manager" data-api="${escape(baseUrl)}api/moderation/"
  data-user-id="${escape(userId)}" data-planner-name="${escape(displayName)}" data-user-email="${escape(userEmail)}">
<main class="whs-module-main assessment-manager-main" aria-label="${escape(title)}">
<header class="assessment-manager-header">
  <div class="assessment-manager-brand">
    <img class="whs-module-logo" src="${asset('whs-logo.png')}" alt="Westland High School" width="80" height="80">
    <div><h1>${escape(title)}</h1><p>Assessment planning and moderation</p></div>
  </div>
  <label class="assessment-manager-year" for="assessment-year">Assessment year
    <input id="assessment-year" type="number" min="2000" max="2100" value="${escape(currentYear)}">
  </label>
</header>
<nav class="assessment-manager-nav" aria-label="Assessment Manager">
  <a href="#?section=home" aria-current="page">Home</a>
  <a href="#?section=standards">Setup Assessment</a>
  <a href="#?section=audit">Audit Standards</a>
  <a href="#?section=library">Resource Library</a>
  <a href="#?section=suppliers">Suppliers</a>
  <a href="#?section=moderation">Moderation</a>
  <a href="#?section=setup">Setup Moderation</a>
</nav>
<p id="assessment-manager-status" role="status" aria-live="polite"></p>
<section id="assessment-manager-content" aria-label="Assessment Manager workspace"></section>
</main>
<footer class="whs-module-footer">
<p>&copy; ${escape(monthYear)} Westland High School</p>
<p>Last Updated: <time datetime="${UPDATED_AT}">${escape(updated)}</time></p>
<p><a href="${escape(coreUrl)}/contact">Contact Web Master</a></p>
</footer>
${standalone ? `<script src="${asset('global-nav.js')}" defer></script>` : ''}
<script src="${asset('google-drive.js')}" defer></script>
<script src="${asset('moderation-schema.js')}" defer></script>
<script src="${asset('resource-library-schema.js')}" defer></script>
<script src="${asset('resource-library.js')}" defer></script>
<script src="${asset('suppliers.js')}" defer></script>
<script src="${asset('verifiers.js')}" defer></script>
<script src="${asset('moderation.js')}" defer></script>
<script src="${asset('assessment-home.js')}" defer></script>
<script src="${asset('senior-audit.js')}" defer></script>
<script src="${asset('students-audit.js')}" defer></script>
<script src="${asset('assessment-manager.js')}" defer></script>
</body></html>`;
}

module.exports = { renderShell };
