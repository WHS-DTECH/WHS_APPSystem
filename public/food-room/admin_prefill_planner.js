function getCurrentStaffEmail() {
  try {
    const raw = sessionStorage.getItem('currentStaffUser');
    const parsed = raw ? JSON.parse(raw) : null;
    return String(parsed && parsed.email_school ? parsed.email_school : '').trim().toLowerCase();
  } catch (err) {
    return '';
  }
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDefaultDates() {
  const startEl = document.getElementById('prefillStartDate');
  const endEl = document.getElementById('prefillEndDate');
  if (!startEl || !endEl) return;

  const now = new Date();
  startEl.value = toIsoDate(now);
  endEl.value = `${now.getFullYear()}-12-31`;
}

function setStatus(message, isError) {
  const statusEl = document.getElementById('prefillStatus');
  if (!statusEl) return;
  statusEl.textContent = String(message || '');
  statusEl.classList.toggle('error', !!isError);
}

function setResults(payload) {
  const resultsEl = document.getElementById('prefillResults');
  if (!resultsEl) return;
  if (!payload) { resultsEl.innerHTML = ''; return; }
  const s = payload.summary || {};
  const isDry = payload.dryRun;

  let html = `<div class="pf-section">`;
  html += `<strong>${isDry ? 'Dry Run Summary' : 'Prefill Summary'}</strong> &nbsp; ${s.startDate} → ${s.endDate}<br>`;
  html += `Planner recipes found: <b>${s.plannerRecipesFound}</b> &nbsp;|&nbsp; `;
  html += `Candidates: <b>${s.candidates}</b> &nbsp;|&nbsp; `;
  html += `Single-period: <b>${s.singlePeriodCandidates || 0}</b> &nbsp;|&nbsp; `;
  html += `Multi-period: <b>${s.multiPeriodCandidates || 0}</b> &nbsp;|&nbsp; `;
  html += `${isDry ? 'Would insert' : 'Inserted'}: <b style="color:${s.inserted > 0 ? '#2e7d32' : '#374151'}">${s.inserted}</b> &nbsp;|&nbsp; `;
  html += `Already exist: <b>${s.skippedExisting}</b> &nbsp;|&nbsp; `;
  html += `No planner: <b>${s.skippedNoPlanner}</b>`;
  html += `</div>`;

  if (isDry && payload.plannerRecipes && payload.plannerRecipes.length) {
    html += `<div class="pf-section"><strong>Planner recipes loaded (${payload.plannerRecipes.length})</strong><table class="pf-table"><tr><th>Date</th><th>Stream</th><th>Recipe</th></tr>`;
    for (const r of payload.plannerRecipes) {
      html += `<tr><td>${r.date}</td><td>${r.stream}</td><td>${r.recipe}</td></tr>`;
    }
    html += `</table></div>`;
  }

  if (isDry && payload.preview && payload.preview.length) {
    html += `<div class="pf-section"><strong>Would insert (${s.inserted} total, showing first ${payload.preview.length})</strong><table class="pf-table"><tr><th>Date</th><th>P</th><th>Class</th><th>Teacher</th><th>Recipe</th></tr>`;
    for (const b of payload.preview) {
      html += `<tr><td>${b.booking_date}</td><td>${b.period}</td><td><b>${b.class_name}</b></td><td>${b.staff_name || ''}</td><td>${b.recipe}</td></tr>`;
    }
    html += `</table></div>`;
  }

  if (isDry && payload.alreadyExist && payload.alreadyExist.length) {
    html += `<div class="pf-section"><strong>Already booked — skipped (${s.skippedExisting} total, showing first ${payload.alreadyExist.length})</strong><table class="pf-table"><tr><th>Date</th><th>P</th><th>Class</th><th>Teacher</th><th>Recipe</th></tr>`;
    for (const b of payload.alreadyExist) {
      html += `<tr><td>${b.date}</td><td>${b.period}</td><td><b>${b.class}</b></td><td>${b.teacher}</td><td>${b.recipe}</td></tr>`;
    }
    html += `</table></div>`;
  }

  if (isDry && payload.singlePeriodMatches && payload.singlePeriodMatches.length) {
    html += `<div class="pf-section"><strong>Single-period classes matched to planner (showing first ${payload.singlePeriodMatches.length})</strong><table class="pf-table"><tr><th>Date</th><th>P</th><th>Class</th><th>Teacher</th><th>Stream</th><th>Status</th><th>Recipe</th></tr>`;
    for (const b of payload.singlePeriodMatches) {
      html += `<tr><td>${b.date}</td><td>${b.period}</td><td><b>${b.class}</b></td><td>${b.teacher}</td><td>${b.stream}</td><td>${b.status}</td><td>${b.recipe}</td></tr>`;
    }
    html += `</table></div>`;
  }

  if (isDry && payload.noPlanner && payload.noPlanner.length) {
    html += `<div class="pf-section pf-warn"><strong>⚠ Food classes with no matching planner recipe (${s.skippedNoPlanner} total, showing first ${payload.noPlanner.length})</strong><table class="pf-table"><tr><th>Date</th><th>Class</th><th>Teacher</th><th>Stream</th></tr>`;
    for (const b of payload.noPlanner) {
      html += `<tr><td>${b.date}</td><td><b>${b.class}</b></td><td>${b.teacher}</td><td>${b.stream}</td></tr>`;
    }
    html += `</table></div>`;
  }

  if (!isDry) {
    html += `<details><summary style="cursor:pointer;font-size:0.82rem;color:#6b7280;">Raw JSON</summary><pre style="font-size:0.78rem;margin-top:0.4rem">${JSON.stringify(payload, null, 2)}</pre></details>`;
  }

  resultsEl.innerHTML = html;
}


async function runPrefill(dryRun) {
  const startEl = document.getElementById('prefillStartDate');
  const endEl = document.getElementById('prefillEndDate');
  const dryBtn = document.getElementById('prefillDryRunBtn');
  const runBtn = document.getElementById('prefillRunBtn');

  const email = getCurrentStaffEmail();
  if (!email) {
    setStatus('Could not determine admin email from session.', true);
    return;
  }

  const body = {
    dryRun: !!dryRun,
    startDate: startEl && startEl.value ? startEl.value : undefined,
    endDate: endEl && endEl.value ? endEl.value : undefined
  };

  if (dryBtn) dryBtn.disabled = true;
  if (runBtn) runBtn.disabled = true;
  setStatus(dryRun ? 'Running dry run...' : 'Preloading bookings...', false);

  try {
    const resp = await fetch('/api/bookings/prefill-from-planner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': email
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.success === false) {
      throw new Error(data.error || `Request failed (${resp.status})`);
    }
    setResults(data);
    if (window.QC && typeof window.QC.toast === 'function') {
      window.QC.toast(dryRun ? 'Dry run complete' : 'Prefill complete', 'success');
    }
    setStatus(dryRun ? 'Dry run complete.' : 'Prefill complete.', false);
  } catch (err) {
    setStatus(err.message || 'Request failed.', true);
    if (window.QC && typeof window.QC.toast === 'function') {
      window.QC.toast(err.message || 'Request failed', 'error');
    }
  } finally {
    if (dryBtn) dryBtn.disabled = false;
    if (runBtn) runBtn.disabled = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  const dryBtn = document.getElementById('prefillDryRunBtn');
  const runBtn = document.getElementById('prefillRunBtn');

  if (dryBtn) {
    dryBtn.addEventListener('click', () => runPrefill(true));
  }
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      const yes = window.confirm('Create bookings now? This inserts class bookings for matching Food/HOSP periods (single and double).');
      if (!yes) return;
      runPrefill(false);
    });
  }
});