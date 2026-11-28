const UPDATED_AT = '2026-11-13T18:10:00.000Z';
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function renderShell({ baseUrl, coreUrl, standalone, now = new Date() }) {
  const asset = (file) => escape(baseUrl + 'framework/' + file);
  const monthYear = new Intl.DateTimeFormat('en-NZ', {
    month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(now);
  const updated = new Intl.DateTimeFormat('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland'
  }).format(new Date(UPDATED_AT));
  const title = 'Relief';
  const learningSites = (path) => escape((coreUrl || '') + path);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} | WHS APPSystem</title>
${standalone ? `<meta name="whs-global-control" content="${escape(coreUrl)}">` : ''}
<link rel="icon" type="image/png" href="${asset('whs-logo.png')}">
<link rel="stylesheet" href="${asset('account-controls.css')}">
<link rel="stylesheet" href="${asset('module-shell.css')}">
<link rel="stylesheet" href="${asset('relief-plan.css')}">
</head><body class="whs-module-shell" data-relief-events-url="${escape(baseUrl + 'api/relief-plan/events')}">
<main class="whs-module-main relief-plan" aria-label="${escape(title)}">
<header class="relief-plan-heading">
<div>
<p class="relief-plan-eyebrow">Staff planning</p>
<h1>Relief Plan</h1>
<p class="relief-plan-intro">2027 technology events, observances, and planning anchors from the reliever calendar.</p>
</div>
</header>
<p class="relief-plan-status" id="relief-plan-status" role="status" aria-live="polite">Loading calendar...</p>
<section class="relief-plan-content" aria-label="Relief Plan calendar">
<div class="relief-plan-controls" aria-label="Calendar navigation">
<button class="relief-plan-button" id="relief-plan-previous" type="button">Previous month</button>
<button class="relief-plan-button" id="relief-plan-today" type="button">Today</button>
<label for="relief-plan-date">Go to date</label>
<input id="relief-plan-date" type="date" value="">
<button class="relief-plan-button" id="relief-plan-next" type="button">Next month</button>
</div>
<div class="relief-plan-calendar-heading"><h2 id="relief-plan-month-label"></h2></div>
<div class="relief-plan-calendar" id="relief-plan-calendar" aria-label="Events by date"></div>
<aside class="relief-plan-details" id="relief-plan-details" aria-live="polite">
<h2>Event Details</h2>
<p>Select an event in the calendar to view its description and source.</p>
</aside>
<aside class="relief-plan-description" id="relief-plan-description" aria-live="polite">
<h2>Event Description</h2>
<p>Select an event in the calendar to view its description and source.</p>
</aside>
<section class="relief-plan-course-links" aria-labelledby="relief-plan-course-links-title">
<h2 id="relief-plan-course-links-title">Relief Lessons</h2>
<ul>
<li><a href="${learningSites('/DTECH/JDTECH/')}">JDTECH - Junior Digital Tech</a></li>
<li><a href="${learningSites('/DTECH/MDTECH-S1/')}">MDTECH - Semester 1</a></li>
<li><a href="${learningSites('/DTECH/MDTECH-S2/')}">MDTECH - Semester 2</a></li>
<li><a href="${learningSites('/DTECH/11DTECH/')}">11DTECH - Year 11 Digital Tech</a></li>
<li><a href="${learningSites('/DTECH/12DTECH/')}">12DTECH - Year 12 Digital Tech</a></li>
<li><a href="${learningSites('/DTECH/13DTECH/')}">13DTECH - Year 13 Digital Tech</a></li>
</ul>
</section>
</section>
</main>
<footer class="whs-module-footer">
<p>&copy; ${escape(monthYear)} Westland High School</p>
<p>Last Updated: <time datetime="${UPDATED_AT}">${escape(updated)}</time></p>
<p><a href="${escape(coreUrl)}/contact">Contact Web Master</a></p>
</footer>
${standalone ? `<script src="${asset('global-nav.js')}" defer></script>` : ''}
<script src="${asset('relief-plan.js')}" defer></script>
</body></html>`;
}

module.exports = { renderShell };
