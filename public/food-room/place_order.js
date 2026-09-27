(function () {
  'use strict';

  var state = {
    weekStart: '',
    weekEnd: '',
    timelineStart: '',
    timelineEnd: '',
    today: '',
    formUrl: '',
    submissions: [],
    runningItems: [],
    teacher: null,
    sourceReady: true,
    sourceMessage: '',
    isAdmin: false,
    activeRecipients: [],
    bulkRecipients: [],
    eligibleBulkTeachers: [],
    resolvedFormUrl: '',
    resolvedCsvUrl: '',
    liveCheckSummary: 'Not run yet.',
    runningTeacherFilter: '',
    runningSort: 'count_desc'
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '').trim())) return null;
    return new Date(iso + 'T00:00:00');
  }

  function addDaysIso(iso, days) {
    var d = toDate(iso);
    if (!d) return '';
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  function mondayFromIso(iso) {
    var d = toDate(iso);
    if (!d) return '';
    var day = d.getDay();
    var diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  }

  function longLabel(iso) {
    var d = toDate(iso);
    if (!d) return iso;
    try {
      return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return iso;
    }
  }

  function getWeekRangeLabel(start, end) {
    return longLabel(start) + ' - ' + longLabel(end);
  }

  function renderTimetable(teacher) {
    var host = document.getElementById('poTimetable');
    if (!host) return;

    var week = teacher && Array.isArray(teacher.timetable) ? teacher.timetable : [];
    if (!week.length) {
      host.innerHTML = '<div class="place-order-muted">No timetable found for this teacher yet.</div>';
      return;
    }

    var html = '<div class="po-day-grid">';
    week.forEach(function (day) {
      var periods = day && day.periods ? day.periods : {};
      var list = [];
      ['P1', 'P2', 'P3', 'P4', 'P5'].forEach(function (slot) {
        var classes = Array.isArray(periods[slot]) ? periods[slot].filter(Boolean) : [];
        if (classes.length) {
          list.push('<li><b>' + slot + ':</b> ' + esc(classes.join(', ')) + '</li>');
        }
      });
      html += '<div class="po-day">';
      html += '<h3>' + esc(day.day || '') + '</h3>';
      html += list.length ? ('<ul>' + list.join('') + '</ul>') : '<div class="place-order-muted">No classes</div>';
      html += '</div>';
    });
    html += '</div>';

    host.innerHTML = html;
  }

  function renderRunningItems(items) {
    var host = document.getElementById('poRunningList');
    var teacherFilter = document.getElementById('poRunningTeacherFilter');
    if (!host) return;
    var baseList = Array.isArray(items) ? items : [];
    var teacherOptions = [];

    baseList.forEach(function (row) {
      var names = Array.isArray(row && row.submitter_names) ? row.submitter_names : [];
      names.forEach(function (name) {
        if (name && teacherOptions.indexOf(name) === -1) teacherOptions.push(name);
      });
    });

    teacherOptions.sort(function (a, b) { return String(a).localeCompare(String(b)); });

    if (teacherFilter) {
      var selected = state.runningTeacherFilter || '';
      if (selected && teacherOptions.indexOf(selected) === -1) {
        selected = '';
        state.runningTeacherFilter = '';
      }

      teacherFilter.innerHTML = '<option value="">All teachers</option>' + teacherOptions.map(function (name) {
        var isSelected = name === selected ? ' selected' : '';
        return '<option value="' + esc(name) + '"' + isSelected + '>' + esc(name) + '</option>';
      }).join('');
    }

    var list = baseList.slice();
    if (state.runningTeacherFilter) {
      list = list.filter(function (row) {
        var names = Array.isArray(row && row.submitter_names) ? row.submitter_names : [];
        return names.indexOf(state.runningTeacherFilter) !== -1;
      });
    }

    list.sort(function (a, b) {
      var sortMode = state.runningSort || 'count_desc';
      if (sortMode === 'item_asc') {
        return String(a.item || '').localeCompare(String(b.item || ''));
      }
      if (sortMode === 'teacher_asc') {
        var aTeacher = Array.isArray(a.submitter_names) && a.submitter_names.length ? a.submitter_names[0] : '';
        var bTeacher = Array.isArray(b.submitter_names) && b.submitter_names.length ? b.submitter_names[0] : '';
        var teacherCompare = String(aTeacher).localeCompare(String(bTeacher));
        if (teacherCompare !== 0) return teacherCompare;
        return String(a.item || '').localeCompare(String(b.item || ''));
      }
      if (Number(b.count || 0) !== Number(a.count || 0)) {
        return Number(b.count || 0) - Number(a.count || 0);
      }
      return String(a.item || '').localeCompare(String(b.item || ''));
    });

    if (!list.length) {
      host.innerHTML = '<div class="place-order-muted">No items submitted for this week yet.</div>';
      return;
    }

    var rows = list.map(function (row) {
      return '<tr><td>' + esc(row.item || '') + '</td><td>' + String(row.count || 0) + '</td><td>' + esc(row.submitter_summary || '') + '</td></tr>';
    }).join('');

    host.innerHTML = '<table class="po-running-table"><thead><tr><th>Item</th><th>Count</th><th>Submitted By</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderSubmissions(submissions) {
    var host = document.getElementById('poEmailList');
    if (!host) return;

    var rows = Array.isArray(submissions) ? submissions : [];
    if (!rows.length) {
      host.innerHTML = '<li class="place-order-muted">No requests submitted for this week yet.</li>';
      return;
    }

    host.innerHTML = rows.map(function (row) {
      var who = row.teacher_name || row.email || 'Teacher';
      var when = row.submitted_at_iso ? new Date(row.submitted_at_iso).toLocaleString('en-NZ') : '';
      var classLabel = row.class_name ? ('Class: ' + row.class_name) : '';
      var dayLabel = row.day_label ? ('Day: ' + row.day_label) : '';
      var items = Array.isArray(row.items) ? row.items : [];
      var itemHtml = items.length
        ? items.map(function (item) { return '<span class="po-item-badge">' + esc(item) + '</span>'; }).join('')
        : '<span class="place-order-muted">No item lines detected.</span>';
      var isManual = row && row.source === 'manual_import' && Number(row.manual_import_id) > 0;
      var actionsHtml = isManual
        ? ('<div class="po-submission-actions"><button class="btn btn-secondary po-remove-import-btn" data-import-id="' + String(row.manual_import_id) + '" type="button">Remove Imported Entry</button></div>')
        : '';

      return '<li>' +
        '<div class="po-email-meta"><span><b>' + esc(who) + '</b></span><span>' + esc(when) + '</span>' +
        (classLabel ? ('<span>' + esc(classLabel) + '</span>') : '') +
        (dayLabel ? ('<span>' + esc(dayLabel) + '</span>') : '') +
        '</div>' +
        '<div>' + itemHtml + '</div>' +
        actionsHtml +
      '</li>';
    }).join('');

    host.querySelectorAll('.po-remove-import-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-import-id') || 0);
        removeManualImport(id).catch(function (err) {
          if (window.showToast) window.showToast(err.message || 'Unable to remove imported entry.', 'error');
        });
      });
    });
  }

  function renderStatusPanel() {
    var formEl = document.getElementById('poResolvedFormUrl');
    var csvEl = document.getElementById('poResolvedCsvUrl');
    var detailsEl = document.getElementById('poLiveCheckDetails');
    var summaryEl = document.getElementById('poLiveCheckSummary');

    if (formEl) formEl.textContent = state.resolvedFormUrl || 'Not set';
    if (csvEl) csvEl.textContent = state.resolvedCsvUrl || 'Not set';
    if (detailsEl) detailsEl.textContent = state.liveCheckSummary || 'Not run yet.';
    if (summaryEl) summaryEl.textContent = state.liveCheckSummary || 'Not run yet.';
  }

  function renderHeader() {
    var teacherLabel = document.getElementById('poTeacherLabel');
    var formLink = document.getElementById('poFormLink');
    var weekBadge = document.getElementById('poWeekBadge');
    var sourceWarning = document.getElementById('poSourceWarning');
    var sendNowBtn = document.getElementById('poSendNowBtn');
    var adminRecipientsSection = document.getElementById('poAdminRecipientsSection');
    var adminBulkRecipientsSection = document.getElementById('poAdminBulkRecipientsSection');

    var teacherName = '';
    if (state.teacher) {
      teacherName = [state.teacher.first_name || '', state.teacher.last_name || ''].join(' ').trim();
    }
    teacherLabel.textContent = teacherName ? ('Teacher: ' + teacherName) : 'Teacher Place Order dashboard';

    if (state.formUrl) {
      formLink.href = state.formUrl;
      formLink.removeAttribute('aria-disabled');
      formLink.style.pointerEvents = '';
      formLink.style.opacity = '';
    } else {
      formLink.href = '#';
      formLink.setAttribute('aria-disabled', 'true');
      formLink.style.pointerEvents = 'none';
      formLink.style.opacity = '0.6';
    }

    weekBadge.textContent = getWeekRangeLabel(state.timelineStart || state.weekStart, state.timelineEnd || state.weekEnd);

    if (sendNowBtn) {
      sendNowBtn.style.display = state.isAdmin ? '' : 'none';
    }
    if (adminRecipientsSection) {
      adminRecipientsSection.style.display = state.isAdmin ? '' : 'none';
    }
    if (adminBulkRecipientsSection) {
      adminBulkRecipientsSection.style.display = state.isAdmin ? '' : 'none';
    }

    if (!state.sourceReady && state.sourceMessage) {
      sourceWarning.style.display = '';
      sourceWarning.textContent = state.sourceMessage;
    } else {
      sourceWarning.style.display = 'none';
      sourceWarning.textContent = '';
    }

    renderRecipientsList(state.activeRecipients);
    renderBulkRecipientsList(state.bulkRecipients);
    renderEligibleTeacherOptions(state.eligibleBulkTeachers);
  }

  function renderRecipientsList(recipients) {
    var host = document.getElementById('poRecipientsList');
    if (!host) return;

    var list = Array.isArray(recipients) ? recipients : [];
    if (!list.length) {
      host.innerHTML = '<div class="place-order-muted">No active recipients added yet. Fallback recipient is still used.</div>';
      return;
    }

    host.innerHTML = list.map(function (email) {
      var encoded = encodeURIComponent(String(email || '').trim());
      return '<div class="po-recipient-item">' +
        '<span>' + esc(email) + '</span>' +
        '<button class="btn btn-secondary po-remove-recipient-btn" data-email="' + encoded + '" type="button">Remove</button>' +
      '</div>';
    }).join('');

    host.querySelectorAll('.po-remove-recipient-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var encodedEmail = btn.getAttribute('data-email') || '';
        removeRecipient(encodedEmail);
      });
    });
  }

  function renderBulkRecipientsList(recipients) {
    var host = document.getElementById('poBulkRecipientsList');
    if (!host) return;

    var eligibleMap = getEligibleTeacherMap();
    var list = Array.isArray(recipients) ? recipients : [];
    if (!list.length) {
      host.innerHTML = '<div class="place-order-muted">No bulk recipients added yet.</div>';
      return;
    }

    host.innerHTML = list.map(function (email) {
      var encoded = encodeURIComponent(String(email || '').trim());
      var teacher = eligibleMap[email] || null;
      var label = teacher ? (teacher.full_name + ' <' + email + '>') : email;
      var roleNote = teacher && teacher.effective_role_label ? ('<div class="po-recipient-note">' + esc(teacher.effective_role_label) + '</div>') : '';
      return '<div class="po-recipient-item">' +
        '<div><span>' + esc(label) + '</span>' + roleNote + '</div>' +
        '<button class="btn btn-secondary po-remove-bulk-recipient-btn" data-email="' + encoded + '" type="button">Remove</button>' +
      '</div>';
    }).join('');

    host.querySelectorAll('.po-remove-bulk-recipient-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var encodedEmail = btn.getAttribute('data-email') || '';
        removeBulkRecipient(encodedEmail);
      });
    });
  }

  function getEligibleTeacherMap() {
    var map = {};
    (Array.isArray(state.eligibleBulkTeachers) ? state.eligibleBulkTeachers : []).forEach(function (teacher) {
      var email = String(teacher && teacher.email || '').trim().toLowerCase();
      if (email) map[email] = teacher;
    });
    return map;
  }

  function renderEligibleTeacherOptions(teachers) {
    var host = document.getElementById('poEligibleTeacherList');
    var help = document.getElementById('poBulkRecipientHelp');
    if (!host) return;

    var list = Array.isArray(teachers) ? teachers : [];
    host.innerHTML = list.map(function (teacher) {
      return '<option value="' + esc(teacher.search_label || teacher.email || '') + '"></option>';
    }).join('');

    if (help) {
      help.textContent = list.length
        ? String(list.length) + ' eligible teachers available from current staff and role permissions.'
        : 'No eligible teachers found from the current staff upload and role settings.';
    }
  }

  function resolveBulkRecipientEmail(rawValue) {
    var value = String(rawValue || '').trim();
    if (!value) return '';

    var lowerValue = value.toLowerCase();
    var teachers = Array.isArray(state.eligibleBulkTeachers) ? state.eligibleBulkTeachers : [];
    for (var i = 0; i < teachers.length; i += 1) {
      var teacher = teachers[i] || {};
      var email = String(teacher.email || '').trim().toLowerCase();
      var searchLabel = String(teacher.search_label || '').trim().toLowerCase();
      if (lowerValue === email || lowerValue === searchLabel) {
        return email;
      }
    }

    return /^\S+@\S+\.\S+$/.test(value) ? lowerValue : '';
  }

  function renderAll() {
    renderHeader();
    renderTimetable(state.teacher);
    renderRunningItems(state.runningItems);
    renderSubmissions(state.submissions);
    renderStatusPanel();
  }

  async function loadDashboard(weekStart) {
    var query = weekStart ? ('?week_start=' + encodeURIComponent(weekStart)) : '';
    var res = await fetch('/api/place-order/dashboard' + query, { credentials: 'include' });
    var data = await res.json().catch(function () { return {}; });

    if (!res.ok || !data.success) {
      var message = data && data.error ? data.error : 'Unable to load Place Order dashboard.';
      throw new Error(message);
    }

    state.weekStart = data.week_start;
    state.weekEnd = data.week_end;
    state.timelineStart = data.timeline_start || data.week_start;
    state.timelineEnd = data.timeline_end || data.week_end;
    state.today = data.today_date;
    state.formUrl = data.form_url || '';
    state.teacher = data.teacher || null;
    state.submissions = Array.isArray(data.submissions) ? data.submissions : [];
    state.runningItems = Array.isArray(data.running_items) ? data.running_items : [];
    state.sourceReady = !!data.responses_source_ready;
    state.sourceMessage = String(data.responses_source_message || '');
    state.isAdmin = !!data.is_admin;
    state.activeRecipients = Array.isArray(data.active_recipients) ? data.active_recipients : [];
    state.bulkRecipients = Array.isArray(data.bulk_recipients) ? data.bulk_recipients : [];
    state.eligibleBulkTeachers = Array.isArray(data.eligible_bulk_teachers) ? data.eligible_bulk_teachers : [];
    state.resolvedFormUrl = String(data.resolved_form_url || data.form_url || '');
    state.resolvedCsvUrl = String(data.resolved_csv_url || '');
    if (!state.liveCheckSummary || state.liveCheckSummary === 'Not run yet.') {
      state.liveCheckSummary = state.sourceReady ? 'Source loaded from dashboard.' : (state.sourceMessage || 'Source not ready.');
    }

    renderAll();
  }

  async function runLiveCheck() {
    var btn = document.getElementById('poRunLiveCheckBtn');
    if (!btn) return;

    btn.disabled = true;
    var prior = btn.textContent;
    btn.textContent = 'Checking...';

    try {
      var res = await fetch('/api/place-order/admin/live-check', { credentials: 'include' });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success || !data.check) {
        throw new Error(data && data.error ? data.error : 'Live check failed.');
      }

      var check = data.check;
      state.resolvedFormUrl = String(check.resolved_form_url || state.resolvedFormUrl || '');
      state.resolvedCsvUrl = String(check.resolved_csv_url || state.resolvedCsvUrl || '');
      state.liveCheckSummary = String(check.message || '') + ' (' + String(check.csv_status || 'n/a') + ')';
      renderStatusPanel();

      if (window.showToast) {
        window.showToast(state.liveCheckSummary, check.csv_fetch_ok ? 'success' : 'error');
      }
    } catch (err) {
      state.liveCheckSummary = err.message || 'Live check failed.';
      renderStatusPanel();
      if (window.showToast) window.showToast(state.liveCheckSummary, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = prior;
    }
  }

  async function removeManualImport(id) {
    if (!id || id <= 0) return;
    var res = await fetch('/api/place-order/manual-import/' + encodeURIComponent(String(id)), {
      method: 'DELETE',
      credentials: 'include'
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data && data.error ? data.error : 'Unable to remove imported entry.');
    }

    await loadDashboard(state.weekStart || '');
    if (window.showToast) window.showToast('Imported entry removed.', 'success');
  }

  async function addRecipient() {
    var input = document.getElementById('poRecipientEmailInput');
    if (!input) return;
    var email = String(input.value || '').trim().toLowerCase();
    if (!email) {
      if (window.showToast) window.showToast('Enter an email first.', 'error');
      return;
    }

    var res = await fetch('/api/place-order/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data && data.error ? data.error : 'Unable to add recipient.');
    }

    input.value = '';
    await loadDashboard(state.weekStart || '');
    if (window.showToast) window.showToast('Recipient added.', 'success');
  }

  async function removeRecipient(encodedEmail) {
    if (!encodedEmail) return;
    var res = await fetch('/api/place-order/recipients/' + encodedEmail, {
      method: 'DELETE',
      credentials: 'include'
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data && data.error ? data.error : 'Unable to remove recipient.');
    }

    await loadDashboard(state.weekStart || '');
    if (window.showToast) window.showToast('Recipient removed.', 'success');
  }

  async function addBulkRecipient() {
    var input = document.getElementById('poBulkRecipientInput');
    if (!input) return;
    var email = resolveBulkRecipientEmail(input.value || '');
    if (!email) {
      throw new Error('Select a teacher from the staff list or enter a valid school email with Place Order access.');
    }

    var res = await fetch('/api/place-order/bulk-recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data && data.error ? data.error : 'Unable to add bulk recipient.');
    }

    input.value = '';
    await loadDashboard(state.weekStart || '');
    if (window.showToast) window.showToast('Bulk recipient added.', 'success');
  }

  async function removeBulkRecipient(encodedEmail) {
    if (!encodedEmail) return;
    var res = await fetch('/api/place-order/bulk-recipients/' + encodedEmail, {
      method: 'DELETE',
      credentials: 'include'
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) {
      throw new Error(data && data.error ? data.error : 'Unable to remove bulk recipient.');
    }

    await loadDashboard(state.weekStart || '');
    if (window.showToast) window.showToast('Bulk recipient removed.', 'success');
  }

  async function importManualText() {
    var textEl = document.getElementById('poManualImportText');
    var statusEl = document.getElementById('poManualImportStatus');
    var btn = document.getElementById('poManualImportBtn');
    if (!textEl || !statusEl || !btn) return;

    var text = String(textEl.value || '').trim();
    if (!text) {
      statusEl.textContent = 'Paste text before importing.';
      return;
    }

    btn.disabled = true;
    statusEl.textContent = 'Importing...';

    try {
      var res = await fetch('/api/place-order/manual-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: text, week_start: state.weekStart })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(data && data.error ? data.error : 'Unable to import text.');
      }

      statusEl.textContent = 'Imported ' + String(data.imported || 0) + ' entries.';
      textEl.value = '';
      await loadDashboard(state.weekStart || '');
      if (window.showToast) window.showToast('Manual import successful.', 'success');
    } catch (err) {
      statusEl.textContent = err.message || 'Import failed.';
      if (window.showToast) window.showToast(err.message || 'Import failed.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function sendNow() {
    var btn = document.getElementById('poSendNowBtn');
    if (!btn) return;

    btn.disabled = true;
    var prior = btn.textContent;
    btn.textContent = 'Sending...';

    try {
      var res = await fetch('/api/place-order/send-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(data && data.error ? data.error : 'Unable to send email.');
      }

      if (window.showToast) {
        var sentCount = Number(data.result && data.result.sent || 0);
        var skippedCount = Number(data.result && data.result.skipped || 0);
        var failedCount = Number(data.result && data.result.failed || 0);
        if (sentCount > 0) {
          window.showToast('Place Order reminders sent: ' + sentCount + ' (skipped: ' + skippedCount + ', failed: ' + failedCount + ').', 'success');
        } else if (skippedCount > 0 && failedCount === 0) {
          window.showToast('All Place Order reminders were already sent for today.', 'info');
        } else {
          window.showToast('No reminders sent. Failed: ' + failedCount + '.', 'error');
        }
      } else {
        alert('Pilot email request complete.');
      }
    } catch (err) {
      if (window.showToast) {
        window.showToast(err.message || 'Unable to send pilot email.', 'error');
      } else {
        alert(err.message || 'Unable to send pilot email.');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = prior;
    }
  }

  async function sendBulkNow() {
    var btn = document.getElementById('poSendBulkNowBtn');
    if (!btn) return;

    btn.disabled = true;
    var prior = btn.textContent;
    btn.textContent = 'Sending...';

    try {
      var res = await fetch('/api/place-order/send-bulk-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(data && data.error ? data.error : 'Unable to send bulk emails.');
      }

      if (window.showToast) {
        var sentCount = Number(data.result && data.result.sent || 0);
        var skippedCount = Number(data.result && data.result.skipped || 0);
        var failedCount = Number(data.result && data.result.failed || 0);
        if (sentCount > 0) {
          window.showToast('Bulk Place Order reminders sent: ' + sentCount + ' (skipped: ' + skippedCount + ', failed: ' + failedCount + ').', 'success');
        } else if (skippedCount > 0 && failedCount === 0) {
          window.showToast('All bulk Place Order reminders were already sent for today.', 'info');
        } else {
          window.showToast('No bulk reminders sent. Failed: ' + failedCount + '.', 'error');
        }
      }
    } catch (err) {
      if (window.showToast) {
        window.showToast(err.message || 'Unable to send bulk reminders.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = prior;
    }
  }

  function bindEvents() {
    var prevBtn = document.getElementById('poPrevWeekBtn');
    var nextBtn = document.getElementById('poNextWeekBtn');
    var thisBtn = document.getElementById('poThisWeekBtn');
    var sendBtn = document.getElementById('poSendNowBtn');
    var sendTestBtn = document.getElementById('poSendTestNowBtn');
    var addRecipientBtn = document.getElementById('poAddRecipientBtn');
    var addBulkRecipientBtn = document.getElementById('poAddBulkRecipientBtn');
    var sendBulkBtn = document.getElementById('poSendBulkNowBtn');
    var manualImportBtn = document.getElementById('poManualImportBtn');
    var liveCheckBtn = document.getElementById('poRunLiveCheckBtn');
    var runningTeacherFilter = document.getElementById('poRunningTeacherFilter');
    var runningSortSelect = document.getElementById('poRunningSortSelect');

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (!state.weekStart) return;
        loadDashboard(addDaysIso(state.weekStart, -7)).catch(handleLoadError);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (!state.weekStart) return;
        loadDashboard(addDaysIso(state.weekStart, 7)).catch(handleLoadError);
      });
    }

    if (thisBtn) {
      thisBtn.addEventListener('click', function () {
        var start = mondayFromIso(state.today || new Date().toISOString().slice(0, 10));
        loadDashboard(start).catch(handleLoadError);
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', sendNow);
    }

    if (sendTestBtn) {
      sendTestBtn.addEventListener('click', sendNow);
    }

    if (addRecipientBtn) {
      addRecipientBtn.addEventListener('click', function () {
        addRecipient().catch(function (err) {
          if (window.showToast) window.showToast(err.message || 'Unable to add recipient.', 'error');
        });
      });
    }

    if (addBulkRecipientBtn) {
      addBulkRecipientBtn.addEventListener('click', function () {
        addBulkRecipient().catch(function (err) {
          if (window.showToast) window.showToast(err.message || 'Unable to add bulk recipient.', 'error');
        });
      });
    }

    if (sendBulkBtn) {
      sendBulkBtn.addEventListener('click', function () {
        sendBulkNow();
      });
    }

    if (manualImportBtn) {
      manualImportBtn.addEventListener('click', function () {
        importManualText();
      });
    }

    if (liveCheckBtn) {
      liveCheckBtn.addEventListener('click', function () {
        runLiveCheck();
      });
    }

    if (runningTeacherFilter) {
      runningTeacherFilter.addEventListener('change', function () {
        state.runningTeacherFilter = String(runningTeacherFilter.value || '');
        renderRunningItems(state.runningItems);
      });
    }

    if (runningSortSelect) {
      runningSortSelect.value = state.runningSort || 'count_desc';
      runningSortSelect.addEventListener('change', function () {
        state.runningSort = String(runningSortSelect.value || 'count_desc');
        renderRunningItems(state.runningItems);
      });
    }
  }

  function handleLoadError(err) {
    var host = document.getElementById('poEmailList');
    if (host) {
      host.innerHTML = '<li class="place-order-muted" style="color:#b91c1c;">' + esc(err.message || 'Unable to load Place Order data.') + '</li>';
    }
  }

  function init() {
    bindEvents();
    loadDashboard('').catch(handleLoadError);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
