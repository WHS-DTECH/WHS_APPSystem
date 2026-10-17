/* Shared Assessment Management page used by the Workshop, Sewing (Textiles) and Food hubs.
   Usage: <div id="assessment-root" data-hub="workshop"></div><script src="/assessment-standards.js"></script> */
(function () {
  var root = document.getElementById('assessment-root');
  if (!root) return;
  var hub = root.getAttribute('data-hub');
  var api = '/hubs/' + encodeURIComponent(hub) + '/assessment-standards';
  var state = { standards: [], canManage: false, hubInfo: null };

  var css = [
    '.asm{max-width:1100px;margin:28px auto;padding:0 20px 60px;font-family:Lexend,system-ui,-apple-system,Segoe UI,sans-serif;color:#14284b}',
    '.asm *{box-sizing:border-box}',
    '.asm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}',
    '.asm-head h1{margin:0 0 4px;font-size:28px;font-weight:700;color:#14284b}',
    '.asm-head p{margin:0;color:#4b5f7f;font-size:14px}',
    '.asm-btn{display:inline-block;padding:9px 16px;border-radius:8px;border:1px solid #b9c8dc;background:#fff;color:#14284b;font:600 13px Lexend,system-ui,sans-serif;cursor:pointer;text-decoration:none}',
    '.asm-btn:hover{background:#eef3fa}',
    '.asm-btn.primary{background:#2a7fd4;border-color:#2a7fd4;color:#fff}',
    '.asm-btn.primary:hover{background:#1f66ae}',
    '.asm-btn.danger{color:#a32b2b;border-color:#e2b8b8;padding:4px 10px;font-size:12px}',
    '.asm-card{background:#fff;border:1px solid #d3deec;border-radius:16px;padding:22px 24px;box-shadow:0 4px 18px rgba(20,40,75,.08);margin-bottom:18px}',
    '.asm-card h2{margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid #d3deec;font-size:15px;font-weight:700;letter-spacing:.02em}',
    '.asm-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:10px}',
    '.asm label{display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#4b5f7f}',
    '.asm select,.asm input,.asm textarea{width:100%;padding:9px 11px;border:1px solid #b9c8dc;border-radius:8px;font:400 13px Lexend,system-ui,sans-serif;color:#14284b;background:#fff}',
    '.asm-info{margin:6px 0 12px;font-size:13px;color:#4b5f7f}',
    '.asm-wrap{overflow-x:auto}',
    '.asm table{width:100%;border-collapse:collapse;font-size:13px}',
    '.asm th{background:#eef3fa;text-align:left;padding:10px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#4b5f7f}',
    '.asm td{padding:10px 12px;border-top:1px solid #e3ebf5;vertical-align:top}',
    '.asm td a{color:#2a7fd4;font-weight:600;text-decoration:none}',
    '.asm-empty{padding:18px 12px;color:#4b5f7f}',
    '.asm-msg{margin:10px 0 0;font-size:13px}',
    '.asm-msg.err{color:#a32b2b}.asm-msg.ok{color:#1d6b3c}',
    '.asm-add{display:grid;grid-template-columns:110px 1fr 1fr 90px 90px 110px auto;gap:10px;align-items:end}',
    '.asm details{margin-top:14px}.asm summary{cursor:pointer;font-weight:600;font-size:13px}',
    '.asm textarea{min-height:110px;font-family:ui-monospace,Consolas,monospace;margin:8px 0}',
    '@media(max-width:800px){.asm-grid,.asm-add{grid-template-columns:1fr}.asm-head{flex-direction:column}}'
  ].join('\n');

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function uniq(field) {
    var seen = {};
    state.standards.forEach(function (s) { if (s[field]) seen[s[field]] = true; });
    return Object.keys(seen).sort();
  }

  function fillSelect(id, values, allLabel) {
    var select = document.getElementById(id);
    var current = select.value;
    select.innerHTML = '<option value="">' + allLabel + '</option>' + values.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    }).join('');
    select.value = values.indexOf(current) >= 0 ? current : '';
  }

  function render() {
    var subject = document.getElementById('asm-subject').value;
    var level = document.getElementById('asm-level').value;
    var q = document.getElementById('asm-search').value.trim().toLowerCase();
    var rows = state.standards.filter(function (s) {
      if (subject && s.subject_set !== subject) return false;
      if (level && s.level !== level) return false;
      if (q && (s.standard_number + ' ' + s.standard_name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var body = document.getElementById('asm-body');
    var cols = state.canManage ? 7 : 6;
    body.innerHTML = rows.length ? rows.map(function (s) {
      return '<tr><td>' + esc(s.standard_number) + '</td><td>' + esc(s.standard_name) + '</td><td>' + esc((s.level || '').replace('Level ', '')) +
        '</td><td>' + esc(s.credits) + '</td><td>' + esc(s.assessment_type) + '</td><td>' +
        (s.nzqa_url ? '<a href="' + esc(s.nzqa_url) + '" target="_blank" rel="noopener noreferrer">View</a>' : '') + '</td>' +
        (state.canManage ? '<td><button type="button" class="asm-btn danger" data-del="' + s.id + '">Delete</button></td>' : '') + '</tr>';
    }).join('') : '<tr><td colspan="' + cols + '" class="asm-empty">' +
      (state.standards.length ? 'No standards match the current filters.' : 'No standards have been added for this hub yet.' +
        (state.canManage ? ' Use "Add standards" below.' : '')) + '</td></tr>';
    document.getElementById('asm-info').textContent = 'Showing ' + rows.length + ' of ' + state.standards.length + ' standards.';
  }

  function say(text, ok) {
    var el = document.getElementById('asm-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'asm-msg ' + (ok ? 'ok' : 'err');
  }

  function send(method, url, payload) {
    return fetch(url, {
      method: method, credentials: 'same-origin',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; }); });
  }

  function load() {
    return fetch(api, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
      return r.json().then(function (d) {
        if (r.status === 401 || r.status === 403 || !r.ok) throw new Error(d.error || 'Unable to load standards.');
        return d;
      });
    }).then(function (d) {
      state.standards = d.standards;
      state.canManage = d.canManage;
      state.hubInfo = d.hub;
      fillSelect('asm-subject', uniq('subject_set'), 'All subject sets');
      fillSelect('asm-level', uniq('level'), 'All levels');
      render();
    });
  }

  // Import lines: number | name | level | credits | type | subject set  (tab, comma or | separated)
  function parseImport(text) {
    return text.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
      var parts = line.split(line.indexOf('\t') >= 0 ? '\t' : (line.indexOf('|') >= 0 ? '|' : ',')).map(function (p) { return p.trim(); });
      return { standard_number: parts[0], standard_name: parts[1], level: parts[2], credits: parts[3], assessment_type: parts[4], subject_set: parts[5] };
    }).filter(function (r) { return /^\d/.test(r.standard_number || ''); });
  }

  function build(hubLabel) {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    root.innerHTML =
      '<div class="asm"><div class="asm-head"><div><h1>Assessment Management</h1><p>NZQA assessment standards for the ' + esc(hubLabel) + '.</p></div>' +
      '<a class="asm-btn" id="asm-back" href="/">&larr; Back to Hub</a></div>' +
      '<section class="asm-card"><h2>Assessment Standards Manager</h2>' +
      '<div class="asm-grid"><label>Subject Set<select id="asm-subject"></select></label>' +
      '<label>Level<select id="asm-level"></select></label>' +
      '<label>Standard Number<input id="asm-search" placeholder="e.g. 92013 or 14995"></label></div>' +
      '<p class="asm-info" id="asm-info">Loading...</p>' +
      '<div class="asm-wrap"><table><thead><tr><th style="width:90px">Standard</th><th>Standard Name</th><th style="width:70px">Level</th><th style="width:80px">Credits</th><th style="width:90px">Type</th><th style="width:80px">NZQA</th><th class="asm-actions-col" style="width:90px"></th></tr></thead><tbody id="asm-body"></tbody></table></div>' +
      '<p class="asm-msg" id="asm-msg"></p></section>' +
      '<section class="asm-card" id="asm-manage" style="display:none"><h2>Add standards</h2>' +
      '<form id="asm-add" class="asm-add"><label>Number<input name="standard_number" required></label><label>Name<input name="standard_name" required></label>' +
      '<label>Subject set<input name="subject_set"></label><label>Level<input name="level" placeholder="1, 2 or 3"></label>' +
      '<label>Credits<input name="credits" type="number" min="0"></label><label>Type<select name="assessment_type"><option>Internal</option><option>External</option></select></label>' +
      '<button class="asm-btn primary" type="submit">Add</button></form>' +
      '<details><summary>Paste a list to import</summary><p class="asm-info">One standard per line: number | name | level | credits | type | subject set. Existing numbers are updated.</p>' +
      '<textarea id="asm-paste" placeholder="91300 | Example standard name | 2 | 4 | Internal | Subject"></textarea>' +
      '<button class="asm-btn primary" type="button" id="asm-import">Import</button></details></section></div>';

    ['asm-subject', 'asm-level'].forEach(function (id) { document.getElementById(id).addEventListener('change', render); });
    document.getElementById('asm-search').addEventListener('input', render);

    document.getElementById('asm-body').addEventListener('click', function (event) {
      var id = event.target.getAttribute && event.target.getAttribute('data-del');
      if (!id || !window.confirm('Delete this standard from the ' + hubLabel + '?')) return;
      send('DELETE', api + '/' + id).then(load).then(function () { say('Standard deleted.', true); }).catch(function (e) { say(e.message, false); });
    });

    document.getElementById('asm-add').addEventListener('submit', function (event) {
      event.preventDefault();
      var data = {};
      new FormData(event.target).forEach(function (v, k) { data[k] = v; });
      send('POST', api, data).then(function () { event.target.reset(); return load(); })
        .then(function () { say('Standard saved.', true); }).catch(function (e) { say(e.message, false); });
    });

    document.getElementById('asm-import').addEventListener('click', function () {
      var rows = parseImport(document.getElementById('asm-paste').value);
      if (!rows.length) return say('No valid lines found. Each line must start with the standard number.', false);
      send('POST', api, { standards: rows }).then(function (d) { document.getElementById('asm-paste').value = ''; return load().then(function () { say('Imported ' + d.saved + ' standards.', true); }); })
        .catch(function (e) { say(e.message, false); });
    });
  }

  var labels = { workshop: 'Workshop', 'sewing-hub': 'Sewing Room (Textiles)', 'food-room': 'Food Room' };
  var homes = { workshop: '/workshop/index.html', 'sewing-hub': '/sewing-hub/index.html', 'food-room': '/food-room/index.html' };
  build(labels[hub] || hub);
  document.getElementById('asm-back').setAttribute('href', homes[hub] || '/dashboard');

  load().then(function () {
    document.getElementById('asm-manage').style.display = state.canManage ? 'block' : 'none';
    if (!state.canManage) {
      var col = document.querySelector('.asm-actions-col');
      if (col) col.remove();
    }
    render();
  }).catch(function (e) {
    root.innerHTML = '<div class="asm"><section class="asm-card"><h2>Access denied</h2><p>' + esc(e.message) +
      '</p><a class="asm-btn" href="' + esc(homes[hub] || '/dashboard') + '">&larr; Back to Hub</a></section></div>';
  });
})();
