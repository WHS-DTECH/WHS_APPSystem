const UPDATED_AT = '2026-11-13T19:25:31.843Z';
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function renderShell({ baseUrl, coreUrl, standalone, displayName = 'My planner', userId = '', userEmail = '', now = new Date() }) {
  const asset = (file) => escape(baseUrl + 'framework/' + file);
  const monthYear = new Intl.DateTimeFormat('en-NZ', {
    month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(now);
  const updated = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(new Date(UPDATED_AT));
  const title = 'teacher-planner'.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | WHS APPSystem</title>
${standalone ? `<meta name="whs-global-control" content="${escape(coreUrl)}">` : ''}
<link rel="icon" type="image/png" href="${asset('whs-logo.png')}">
<link rel="stylesheet" href="${asset('account-controls.css')}">
<link rel="stylesheet" href="${asset('module-shell.css')}">
<link rel="stylesheet" href="${asset('planner.css?v=navigation-37')}">
</head><body class="whs-module-shell whs-planner" data-api="${escape(baseUrl)}api/planner/" data-assets="${escape(baseUrl)}framework/" data-planner-name="${escape(displayName)}" data-user-id="${escape(userId)}" data-user-email="${escape(userEmail)}" data-core-url="${escape(coreUrl)}">
<main class="planner-main" aria-label="${escape(title)}">
<header class="planner-heading">
  <img src="${asset('whs-logo.png')}" alt="Westland High School" width="64" height="64">
  <div class="planner-heading-copy"><h1>Pukapuka whakamahere | Teacher Planner</h1><p>Your private teaching, reflection and professional learning space.</p></div>
  <div class="planner-toolbar" role="group" aria-label="Planner year and printing">
    <button type="button" id="open-year" class="planner-year-badge" aria-label="Open planner year 2026" title="Open planner year 2026">
      <span id="planner-year-badge-value">2026</span><span class="planner-year-badge-action">Open year</span>
    </button>
    <div class="planner-year-actions">
      <label>Planner year <input id="planner-year" type="number" min="2000" max="2100" value="2026"></label>
      <button type="button" id="print-planner">Print current view</button>
    </div>
  </div>
</header>
<nav class="planner-tabs" aria-label="Teacher Planner navigation">
  <section class="planner-nav-group planner-nav-planning" aria-labelledby="planner-nav-planning">
    <h2 id="planner-nav-planning">Planner</h2>
    <div class="planner-nav-buttons">
    <button type="button" data-section="cover" aria-current="page">Planner cover</button>
    <button type="button" data-section="year">Year overview</button>
    <button type="button" data-section="term">Term plan</button>
    <button type="button" data-section="week">Weekly planner</button>
    <button type="button" id="refresh-weekly-duties" hidden>Refresh duties</button>
    </div>
  </section>
  <div class="planner-nav-menus">
    <details class="planner-nav-menu planner-nav-setup">
      <summary id="planner-nav-setup">Setup</summary>
      <div class="planner-nav-buttons" aria-labelledby="planner-nav-setup">
        <button type="button" data-section="setup">Setup My Planner</button>
      </div>
    </details>
    <details class="planner-nav-menu planner-nav-modules">
      <summary id="planner-nav-modules">Modules</summary>
      <div class="planner-nav-buttons" aria-labelledby="planner-nav-modules">
        <button type="button" data-section="attendance">Attendance</button>
        <button type="button" data-section="moderation">Moderation</button>
        <button type="button" data-section="standards">Teaching Standards</button>
        <button type="button" data-section="learning">Professional learning</button>
        <a href="${escape(coreUrl)}/launchpad/apps/whs-techstudent-tracker" target="_blank" rel="noopener" title="Open Student Tracker in a new tab">Student Tracker</a>
        <a href="${escape(coreUrl)}/launchpad/apps/relief-plan" target="_blank" rel="noopener" title="Open Relief Library in a new tab">Relief Library</a>
        <a href="${escape(coreUrl)}/launchpad/apps/whs-unit-library" target="_blank" rel="noopener" title="Open WHS Unit Library in a new tab">Lesson</a>
        <a href="${escape(coreUrl)}/launchpad/apps/whs-assessment-manager" target="_blank" rel="noopener" title="Open WHS Assessment Manager in a new tab">Assessment</a>
        <button type="button" data-section="reporting">Reporting</button>
      </div>
    </details>
  </div>
</nav>
<div class="planner-page-controls">
<div id="planner-selectors"></div>
<div class="planner-feedback">
<div class="planner-save"><button type="submit" form="planner-form" id="save-planner" disabled>Save changes</button><span id="save-note">Private Planner edits autosave. Wait for Autosaved before closing.</span></div>
<p id="planner-status" role="status" aria-live="polite">Loading your private planner...</p>
<button type="button" id="retry-planner" hidden>Retry loading</button>
<div id="planner-signin" hidden>
  <p id="planner-signin-help"></p>
  <a id="planner-signin-link" href="${escape(baseUrl)}auth/global-control">Sign in again</a>
  <button type="button" id="resume-planner">I have signed in - retry</button>
</div>
</div>
</div>
<form id="planner-form">
  <div id="planner-content"></div>
</form>
<noscript>This planner needs JavaScript enabled to load and save your entries.</noscript>
</main>
<footer class="whs-module-footer">
<p>&copy; ${escape(monthYear)} Westland High School</p>
<p>Last Updated: <time datetime="${UPDATED_AT}">${escape(updated)}</time></p>
<p><a href="${escape(coreUrl)}/contact">Contact Web Master</a></p>
</footer>
${standalone ? `<script src="${asset('global-nav.js')}" defer></script>` : ''}
<script src="${asset('planner-reference.js')}" defer></script>
<script src="${asset('holiday-regions.js')}" defer></script>
<script src="${asset('opening-dates-2026.js')}" defer></script>
<script src="${asset('weekly-prompts.js')}" defer></script>
<script src="${asset('google-calendar.js')}" defer></script>
<script src="${asset('google-doc-sync.js')}" defer></script>
<script src="${asset('duty-roster.js?v=weekly-term-duties-4')}" defer></script>
<script src="${asset('attendance.js?v=manual-sync-11')}" defer></script>
<script src="${asset('google-tasks.js')}" defer></script>
<script src="${asset('google-drive.js?v=moderation-resource-files-1')}" defer></script>
<script src="${asset('moderation-schema.js?v=requirement-cleanup-2')}" defer></script>
<script src="${asset('moderation.js?v=nzqa-version-8')}" defer></script>
<script src="${asset('textarea-autosize.js')}" defer></script>
<script src="${asset('reporting-schema.js?v=6')}" defer></script>
<script src="${asset('reporting.js?v=7')}" defer></script>
<script src="${asset('planner.js?v=navigation-35')}" defer></script>
</body></html>`;
}

module.exports = { renderShell };
