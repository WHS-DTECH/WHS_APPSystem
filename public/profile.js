(function () {
  var root = document.getElementById('pf-root');
  if (!root) return;
  var email = root.getAttribute('data-email');

  function el(tag, text, cls) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }

  function byId(id) { return document.getElementById(id); }

  function detail(container, label, value) {
    var cell = el('div');
    cell.appendChild(el('span', label));
    cell.appendChild(el('strong', value || 'Not available'));
    container.appendChild(cell);
  }

  function table(headers, rows) {
    var tbl = el('table', null, 'pf-table');
    var head = tbl.createTHead().insertRow();
    headers.forEach(function (h) { head.appendChild(el('th', h)); });
    var body = tbl.createTBody();
    rows.forEach(function (row) {
      var tr = body.insertRow();
      row.forEach(function (cell) { tr.insertCell().textContent = cell === '' || cell == null ? '-' : cell; });
    });
    return tbl;
  }

  function getJson(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function renderTimetable(data, isStudent) {
    var week = data.timetable && Array.isArray(data.timetable.week) ? data.timetable.week : [];
    if (!week.length) return;
    byId('pf-timetable-note').textContent = isStudent
      ? 'Pulled from the current student timetable.'
      : 'Pulled from the timetable upload for your teacher code.';
    var rows = week.map(function (day) {
      var periods = day.periods || {};
      return [day.day].concat(['P1', 'P2', 'P3', 'P4', 'P5'].map(function (p) { return (periods[p] || []).join(', '); }));
    });
    byId('pf-timetable').appendChild(table(['Day', 'P1', 'P2', 'P3', 'P4', 'P5'], rows));
    byId('pf-timetable-card').hidden = false;
  }

  function renderClasses(classes) {
    if (!classes || !classes.length) return;
    var box = byId('pf-classes');
    classes.forEach(function (cls) {
      var details = el('details');
      details.appendChild(el('summary', (cls.class_name || cls.code) + ' (' + cls.code + ') - ' + (cls.student_count || 0) + ' student(s)'));
      var students = cls.students || [];
      if (students.length) {
        var wrap = el('div', null, 'pf-scroll');
        wrap.appendChild(table(['Student', 'ID', 'Form class', 'Year'], students.map(function (s) {
          return [s.student_name, s.id_number, s.form_class, s.year_level];
        })));
        details.appendChild(wrap);
      } else {
        details.appendChild(el('p', 'No students found for this class in the current timetable.', 'pf-muted'));
      }
      box.appendChild(details);
    });
    byId('pf-classes-card').hidden = false;
  }

  function renderHistory(history) {
    if (!history || !history.length) return;
    byId('pf-history').appendChild(table(['Year', 'Term', 'Upload date', 'Status'], history.map(function (h) {
      return [h.upload_year, h.upload_term, h.upload_date ? new Date(h.upload_date).toLocaleDateString('en-NZ') : '', h.status_snapshot];
    })));
    byId('pf-history-card').hidden = false;
  }

  function setRecord(label, text) {
    var badge = byId('pf-record-badge');
    badge.textContent = label;
    badge.hidden = false;
    var check = byId('pf-record-check');
    check.textContent = '';
    check.appendChild(el('span', text ? '\u2713' : '\u2013'));
    check.appendChild(document.createTextNode(' School record: ' + (text || 'Not linked')));
  }

  // Staff are matched first; anyone else is looked up as a student. Missing school data never blocks the page.
  var base = '/food-room/api/user_roles/profile?identifier=' + encodeURIComponent(email);
  getJson(base + '&userType=staff').then(function (staffData) {
    var school = byId('pf-school');
    if (staffData && staffData.isStaff) {
      var staff = staffData.staff || {};
      var dept = staffData.department || {};
      detail(school, 'Staff code', staff.code);
      detail(school, 'Department', dept.primary || dept.all);
      detail(school, 'Form class', staffData.timetable && staffData.timetable.form_class);
      detail(school, 'Assigned classes', dept.classes);
      setRecord('Linked to staff record', 'Matched to staff record');
      renderTimetable(staffData, false);
      renderClasses(staffData.classes);
      renderHistory(staffData.upload_history);
      return;
    }
    return getJson(base + '&userType=student').then(function (studentData) {
      if (studentData && studentData.isStudent) {
        var student = studentData.student || {};
        detail(school, 'Student ID', student.id_number);
        detail(school, 'Form class', student.form_class);
        detail(school, 'Year level', student.year_level);
        detail(school, 'Status', student.status);
        setRecord('Linked to student record', 'Matched to student record');
        renderTimetable(studentData, true);
      } else {
        setRecord('', '');
      }
    });
  });
})();
