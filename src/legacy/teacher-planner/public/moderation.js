(() => {
  'use strict';
  const { common, documents, yesNo, critique, documentResources, sourceScheduleLinks, internalFieldValue, isSchedulePlaceholder } = globalThis.plannerModerationSchema;
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const GOOGLE_DOC = 'application/vnd.google-apps.document';
  function mount(host, options) {
    const { el, data, year, record, page, request, mutate, binaryRequest, saveNow, navigate, ownerId } = options;
    const assessorName = options.displayName && !options.displayName.includes('@') && options.displayName !== 'My planner' ? options.displayName : '';
    const hidden = {};
    const versionControls = new Set();
    async function verifyVersion() {
      const number = hidden.standardNumber.value;
      const details = await loadStandardDetails();
      if (number !== hidden.standardNumber.value || details.number !== number || !/^\d{1,3}$/.test(details.version || '')) {
        throw new Error("NZQA did not verify this standard's PDF version. Retry before syncing.");
      }
      if (hidden.version.value !== details.version) update('version', details.version);
      for (const control of versionControls) control.value = details.version;
      return details;
    }
    let standardDetailsRequest, standardDetailsNumber;
    async function loadStandardDetails() {
      if (!standardDetailsRequest || standardDetailsNumber !== hidden.standardNumber.value) {
        standardDetailsNumber = hidden.standardNumber.value;
        standardDetailsRequest = request('standards/' + encodeURIComponent(standardDetailsNumber) + '/details');
      }
      try { return await standardDetailsRequest; }
      catch (error) { standardDetailsRequest = undefined; throw error; }
    }
    const area = el('section', '', { class: 'paper-page moderation-page' });
    host.append(area);
    const feedback = el('p', '', { role: 'status', 'aria-live': 'polite' });
    let working = false, access;
    function message(value, error = false) { feedback.textContent = value; feedback.setAttribute('role', error ? 'alert' : 'status'); }
    function field(name, value = '') {
      const input = el('input', '', { type: 'hidden', ...(options.setupOnly ? { 'data-moderation-setting': name } : { name }) });
      input.value = value; area.append(input); hidden[name] = input;
      return input;
    }
    function changed(input) { input.dispatchEvent(new Event('input', { bubbles: true })); }
    function update(name, value) { hidden[name].value = value; changed(hidden[name]); }
    async function persist() {
      if (!await saveNow()) throw new Error('The latest form changes are not saved. Resolve the database save error before continuing.');
    }
    function button(label, callback, parent = area, tone = '') {
      const node = el('button', label, { type: 'button', ...(tone ? { class: 'moderation-button-' + tone } : {}) });
      node.addEventListener('click', callback); parent.append(node); return node;
    }
    function input(definition, value, onChange, parent, idPrefix = '') {
      const [key, label, kind] = definition, wrapper = el('div', '', { class: 'planner-field' });
      const id = 'moderation-' + idPrefix + key;
      if (kind?.checks) {
        const group = el('fieldset', '', { class: 'planner-field moderation-checks', id });
        group.append(el('legend', label));
        const selected = new Set(String(value || '').split(', ').filter(Boolean));
        const boxes = kind.checks.map(option => {
          const boxId = id + '-' + option.toLowerCase().replace(/\W+/g, '-');
          const box = el('input', '', { id: boxId, type: 'checkbox', value: option });
          box.type = 'checkbox'; box.checked = selected.has(option);
          box.addEventListener('change', () => onChange(boxes.filter(item => item.checked).map(item => item.value).join(', ')));
          const item = el('span', '', { class: 'moderation-check' });
          item.append(box, el('label', option, { for: boxId })); group.append(item);
          return box;
        });
        parent.append(group);
        return group;
      }
      const control = el(Array.isArray(kind) ? 'select' : kind === 'area' ? 'textarea' : 'input', '', { id });
      if (Array.isArray(kind)) for (const option of kind) control.append(el('option', option || 'Not recorded', { value: option }));
      else if (kind === 'area') { control.rows = 4; control.maxLength = 8000; }
      else { control.type = ['date', 'url'].includes(kind) ? kind : 'text'; control.maxLength = 500; }
      control.value = value || '';
      control.addEventListener('input', () => onChange(control.value));
      control.addEventListener('change', () => onChange(control.value));
      wrapper.append(el('label', label, { for: id }), control); parent.append(wrapper);
      return control;
    }
    const driveButtons = [];
    function driveButton(label, callback, parent) {
      const node = button(label, () => operate(callback), parent, 'drive');
      node.disabled = !access || working; driveButtons.push(node); return node;
    }
    async function operate(callback) {
      if (working || !access) return;
      working = true; area.dataset.moderationBusy = 'true';
      driveButtons.forEach(node => { node.disabled = true; });
      try {
        // Request access while still handling the teacher's click, before any database round trip.
        await access.authorize();
        if (!area.isConnected) return;
        area.inert = true;
        await callback();
      } catch (error) {
        console.error('Moderation Drive action failed.');
        if (area.isConnected) message(error.message, true);
      } finally {
        working = false; area.inert = false; delete area.dataset.moderationBusy;
        driveButtons.forEach(node => { node.disabled = !access; });
      }
    }
    let refreshFolder = () => {}, refreshRetention = () => {};
    function standardFolderMetadata(folder, root, level, number) {
      return JSON.stringify({ id: folder.id, root, level, number });
    }
    function currentStandardFolder() {
      const folder = JSON.parse(hidden.standardFolder.value || 'null');
      return folder && folder.root === hidden.folderId.value && folder.level === hidden.level.value &&
        folder.number === hidden.standardNumber.value ? folder : null;
    }
    function fillRetentionLocation() {
      const folder = currentStandardFolder();
      const saved = JSON.parse(hidden.standardFolder.value || 'null');
      const oldUrl = saved && 'https://drive.google.com/drive/folders/' + saved.id;
      const oldLocation = values.internal.retentionLocation || '';
      if (!folder && (!oldUrl || oldLocation !== oldUrl && !oldLocation.endsWith('\n' + oldUrl))) return false;
      const location = folder ? [
        [hidden.folderName.value, 'Level ' + folder.level, folder.number].filter(Boolean).join(' / '),
        'https://drive.google.com/drive/folders/' + folder.id
      ].join('\n') : '';
      if (values.internal.retentionLocation === location) return false;
      values.internal.retentionLocation = location;
      update('internal', JSON.stringify(values.internal));
      refreshRetention();
      return true;
    }
    function rememberStandardFolder(standard, root = hidden.folderId.value) {
      update('standardFolder', standardFolderMetadata(standard, root, hidden.level.value, hidden.standardNumber.value));
      fillRetentionLocation(); refreshFolder();
    }
    async function fillSetupFolderLink() {
      const root = hidden.folderId.value, level = hidden.level.value, number = hidden.standardNumber.value;
      if (!root || !level || !number) return;
      try {
        const result = await request(year + '/moderation/main');
        if (!area.isConnected || root !== hidden.folderId.value || level !== hidden.level.value || number !== hidden.standardNumber.value) return;
        if (result.content.folderId !== root || !result.content.folderLinks) return;
        const hierarchy = JSON.parse(result.content.folderLinks);
        if (hierarchy.root !== root) return;
        const folders = hierarchy.levels[level]?.standards;
        if (folders === undefined) return;
        if (!Array.isArray(folders)) throw new Error('The saved standard-folder list is invalid.');
        const matches = folders.filter(folder => folder.name === number);
        if (matches.length > 1) throw new Error('More than one folder matches this standard. Resolve the duplicate folders in Drive, then prepare folders again in Setup Moderation.');
        if (!matches.length) return;
        if (typeof matches[0].id !== 'string' || !/^[\w-]{10,200}$/.test(matches[0].id)) throw new Error('The saved standard-folder link is invalid.');
        const metadata = standardFolderMetadata(matches[0], root, level, number);
        if (hidden.standardFolder.value !== metadata) update('standardFolder', metadata);
        fillRetentionLocation(); refreshFolder();
      } catch (error) {
        console.error('Moderation setup folder link could not be loaded.');
        if (area.isConnected) message('Location / file path could not be populated from Setup Moderation: ' + error.message + ' Reopen this page to retry. Existing location is unchanged.', true);
      }
    }
    async function prepareRecordFolders(folderId = hidden.folderId.value) {
      const standard = await access.ensureAssessmentFolders(folderId, hidden.level.value, hidden.standardNumber.value);
      if (data.parentRecord) {
        const parent = await request(year + '/moderation/' + data.parentRecord);
        const samples = JSON.parse(parent.content.internal || '{}').samples || [];
        const matches = samples.map((item, index) => item.markingScheduleRecord === record ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new Error('This schedule must match exactly one entry in its parent moderation record before preparing a student folder.');
        const student = await access.ensureStudentFolder(standard.id, matches[0]);
        rememberStandardFolder(standard, folderId);
        return student;
      }
      for (const [index] of (values.internal.samples || []).entries()) await access.ensureStudentFolder(standard.id, index);
      rememberStandardFolder(standard, folderId);
      return standard;
    }
    function showFolder(parent) {
      const label = el('p'), link = el('a', '', { target: '_blank', rel: 'noopener noreferrer' });
      label.append(link); parent.append(label);
      function refresh() {
        link.textContent = hidden.folderName.value || 'No Assessment / Moderation folder selected';
        if (hidden.folderId.value) link.href = 'https://drive.google.com/drive/folders/' + hidden.folderId.value;
        else link.removeAttribute('href');
      }
      refresh();
      let refreshHierarchy = () => {};
      async function saveHierarchy(root) {
        if (!options.setupOnly) return;
        const hierarchy = await access.assessmentFolderLinks(root);
        update('folderLinks', JSON.stringify(hierarchy));
        refreshHierarchy();
      }
      driveButton(record ? 'Choose a folder for this record' : 'Choose my Assessment / Moderation folder', async () => {
        const selected = await access.choose(true);
        if (!selected) { message('Folder selection cancelled. The saved folder is unchanged.'); return; }
        const folder = await access.metadata(selected.id);
        if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) {
          throw new Error('Choose a Drive folder where your Google account can add files.');
        }
        if (!confirm('Use "' + folder.name + '" as the main folder? This creates or reuses Level 1, Level 2 and Level 3 folders, with numbered standard folders for new records. Files inherit this folder’s sharing permissions. Existing documents will not be moved.')) return;
        await access.ensureAssessmentFolders(folder.id);
        if (record && hidden.level.value && hidden.standardNumber.value) {
          await prepareRecordFolders(folder.id);
        }
        update('folderId', folder.id); update('folderName', folder.name); refresh(); refreshHierarchy();
        if (record) { fillRetentionLocation(); refreshFolder(); }
        await saveHierarchy(folder.id);
        await persist();
        message('Main Drive folder and Level 1, Level 2 and Level 3 folders are ready. ' +
          (record ? 'New documents will use its level / standard folder.' : 'New records will create a numbered folder under their level.'));
      }, parent);
      if (options.setupOnly) {
        const hierarchy = el('div', '', { class: 'moderation-folder-levels' });
        parent.append(hierarchy);
        refreshHierarchy = () => {
          hierarchy.replaceChildren();
          let saved;
          try { saved = JSON.parse(hidden.folderLinks.value || 'null'); }
          catch {
            hierarchy.append(el('p', 'Saved folder links could not be read. Prepare folders to refresh them.', { role: 'alert' }));
            return;
          }
          if (!saved || saved.root !== hidden.folderId.value) {
            hierarchy.append(el('p', 'Prepare level / standard folders to show their links here.'));
            return;
          }
          for (const level of ['1', '2', '3']) {
            const group = el('section', '', { class: 'moderation-folder-level' });
            const folder = saved.levels[level];
            const folderButton = (title, id) => el('a', title, {
              href: 'https://drive.google.com/drive/folders/' + id, target: '_blank', rel: 'noopener noreferrer',
              class: 'moderation-folder-button'
            });
            const heading = el('h4');
            heading.append(folderButton('Level ' + level, folder.id)); group.append(heading);
            const standards = el('div', '', { class: 'moderation-folder-standards' });
            for (const standard of folder.standards) standards.append(folderButton(standard.name, standard.id));
            if (!folder.standards.length) standards.append(el('p', 'No standard folders yet.'));
            group.append(standards); hierarchy.append(group);
          }
        };
        refreshHierarchy();
      }
      if (record) {
        const standardLabel = el('p'), standardLink = el('a', '', { target: '_blank', rel: 'noopener noreferrer' });
        standardLabel.append(standardLink); parent.append(standardLabel);
        refreshFolder = () => {
          const folder = currentStandardFolder();
          standardLink.textContent = 'Level ' + hidden.level.value + ' / ' + hidden.standardNumber.value +
            (folder ? '' : ' (prepare folders to link)');
          if (folder) standardLink.href = 'https://drive.google.com/drive/folders/' + folder.id;
          else standardLink.removeAttribute('href');
        };
        refreshFolder();
      }
      driveButton('Prepare level / standard folders', async () => {
        if (!hidden.folderId.value) throw new Error('Choose your main Assessment / Moderation folder first.');
        await persist();
        const folder = await access.metadata(hidden.folderId.value);
        if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) {
          throw new Error('The selected main folder cannot accept files. Choose an editable folder.');
        }
        if (options.setupOnly) await saveHierarchy(hidden.folderId.value);
        else await access.ensureAssessmentFolders(hidden.folderId.value);
        if (record) await prepareRecordFolders();
        await persist();
        message('Level folders' + (record ? ', the standard folder and entry student folders' : '') + ' are ready. Student folders use entry order, without names or initials. Existing files have not been moved.');
      }, parent);
    }
    async function prepareDrive() {
      try {
        access = await globalThis.plannerGoogleDrive.prepareDocumentAccess(() => request('google-drive/config'));
        if (!area.isConnected) return;
        driveButtons.forEach(node => { node.disabled = false; });
      } catch (error) {
        console.error('Moderation Drive setup failed.');
        if (area.isConnected) {
          message(error.message + ' Your forms can still save to the database.', true);
          button('Retry Google Drive setup', prepareDrive);
        }
      }
    }
    field('folderId', data.folderId || ''); field('folderName', data.folderName || '');
    if (options.setupOnly) field('folderLinks', data.folderLinks || '');
    if (record) field('standardFolder', data.standardFolder || '');
    if (options.setupOnly) {
      area.append(el('h2', 'Setup Moderation — ' + year, { class: 'paper-heading' }),
        el('p', 'Keep a record for an assessment or individual student. Each record links to four separate document forms. Form data saves privately to the database; documents and supporting files stay in your Google Drive. Nothing is saved in browser storage.'),
        el('p', 'Select a folder appropriate for student assessment information. A shared folder gives its members access to documents created there.'));
      const folder = el('section', '', { class: 'moderation-panel' });
      folder.append(el('h3', 'My Assessment and Moderation folder'));
      area.append(folder, feedback); showFolder(folder); prepareDrive(); return;
    }
    const contentsPage = documents[page] ? page : 'internal';
    const tabs = el('nav', '', { class: 'moderation-tabs', 'aria-label': 'Year moderation contents', 'data-planner-navigation': '' });
    for (const [key, title] of [['overview', 'Records'], ['internal', 'Internal Moderation'],
      ['schedule', 'Marking Schedule'], ['feedback', 'Marking Confirmation & Feedback'], ['coversheet', 'WHS Coversheet']]) {
      const tab = button(title, () => navigate('', key), tabs);
      if (key === (record ? contentsPage : page)) tab.setAttribute('aria-current', 'page');
    }
    area.append(tabs);
    if (!record) {
      area.append(el('h2', 'Moderation — ' + year, { class: 'paper-heading' }));
      area.append(el('p', page === 'feedback'
        ? 'Use the same blank Confirmation & Feedback template for every standard. Keep a separate completed sheet for each student and standard.'
        : 'Choose a record below to open its form. Use the tabs above to browse this year’s other document types.'));
      if (page === 'feedback') {
        const template = el('section', '', { class: 'moderation-panel' });
        template.append(el('h3', 'Reusable Confirmation & Feedback template'),
          el('p', 'This blank template has no student, standard or assessment results filled in. Use it for any standard; it is not a separate template for each assessment.'),
          el('a', 'Download blank Confirmation & Feedback template', { href: options.feedbackTemplateUrl, download: 'confirmation-feedback-template.docx' }),
          el('p', 'To create or open a student sheet, use Internal Moderation → Create / open Confirmation & Feedback for that student. You can then import a completed copy or create a Google Drive document. Existing assessment-level feedback remains available through Records.'));
        area.append(template);
      }
      if (page === 'overview') area.append(el('p', 'Your main Assessment and Moderation folder is managed in Setup Assessment → Setup Moderation.'));
      const create = el('section', '', { class: 'moderation-panel', 'data-planner-navigation': '' });
      create.append(el('h3', 'New moderation record'));
      const standard = el('select', '', { id: 'moderation-new-standard', 'aria-label': 'Use a standard from My Standards' });
      standard.append(el('option', 'Choose from My Standards', { value: '' }));
      create.append(el('label', 'Use a standard from My Standards', { for: 'moderation-new-standard' }), standard);
      const standardsStatus = el('p', 'Loading My Standards…', { role: 'status' });
      create.append(standardsStatus, el('p', 'Creating a record checks the NZQA PDF version and creates or reuses its numbered folder under Level 1, Level 2 or Level 3 in your chosen main folder. Google Drive permission is required.'));
      let standards = [];
      const createButton = button('Create moderation record', async () => {
        if (working) return;
        const selected = standards.find(item => item.number === standard.value);
        if (!selected) { message('Choose a standard from My Standards before creating a moderation record.', true); standard.focus(); return; }
        if (!hidden.folderId.value) { message('Choose your main Assessment / Moderation folder before creating a record.', true); return; }
        if (!access) { message('Google Drive is not ready. Retry Google Drive setup before creating the standard folder.', true); return; }
        working = true; area.inert = true; area.dataset.moderationBusy = 'true'; createButton.disabled = true;
        try {
          await access.authorize();
          await persist();
          const metadata = await request('standards/' + selected.number + '/details');
          if (!metadata.level || !metadata.version) throw new Error('NZQA did not return the level and PDF version for this standard. Retry shortly.');
          const standardFolder = await access.ensureAssessmentFolders(hidden.folderId.value, metadata.level, selected.number);
          const id = crypto.randomUUID();
          const content = { title: selected.number + ' — ' + selected.title, folderId: hidden.folderId.value, folderName: hidden.folderName.value,
            standardNumber: selected.number, standardTitle: selected.title, subject: selected.subject,
            credits: selected.credits.replace(/\s*credits?$/i, '').trim(), level: metadata.level,
            version: metadata.version, assessors: assessorName,
            standardFolder: standardFolderMetadata(standardFolder, hidden.folderId.value, metadata.level, selected.number),
            internal: JSON.stringify({ retentionLocation: [
              [hidden.folderName.value, 'Level ' + metadata.level, selected.number].filter(Boolean).join(' / '),
              'https://drive.google.com/drive/folders/' + standardFolder.id
            ].join('\n') }) };
          await mutate(year + '/moderation/' + id, { content, revision: 0 });
          delete area.dataset.moderationBusy; working = false;
          await navigate(id, 'overview');
        } catch (error) { console.error('Moderation record creation failed.'); message(error.message, true); }
        finally { delete area.dataset.moderationBusy; area.inert = false; working = false; createButton.disabled = false; }
      }, create);
      const listing = el('section', '', { class: 'moderation-panel' });
      const listTitle = page === 'overview' ? 'My moderation records'
        : (page === 'feedback' ? 'Student Confirmation & Feedback forms' : page === 'internal' ? 'Internal Moderation' : documents[page].title) + ' — ' + year;
      listing.append(el('h3', listTitle), el('p', 'Loading records…', { role: 'status' }));
      if (page === 'overview') area.append(create);
      else {
        create.hidden = true;
      }
      area.append(listing, feedback);
      async function loadRecords() {
        try {
          const result = await request('moderation/' + year);
          if (!area.isConnected) return;
          listing.replaceChildren(el('h3', listTitle));
          const records = result.records.filter(item => page === 'feedback' ? item.parent_record : page !== 'internal' || !item.parent_record);
          if (!records.length) listing.append(el('p', page === 'feedback'
            ? 'No student feedback forms yet. Use Internal Moderation to create a separate Confirmation & Feedback sheet for each student and standard.'
            : 'No records for this contents page yet. Use Records to create an assessment.'));
          const groups = new Map();
          for (const item of records.sort((a, b) => String(a.standard_number || '').localeCompare(String(b.standard_number || ''), 'en-NZ', { numeric: true }) ||
              String(a.title || '').localeCompare(String(b.title || ''), 'en-NZ'))) {
            const key = item.standard_number || 'No standard selected';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(item);
          }
          function recordLink(item, target, label) {
            const link = el('a', label, { href: '#' + new URLSearchParams({ year: String(year), section: 'moderation', record: item.entry_key, page: target }).toString() });
            link.addEventListener('click', event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
              event.preventDefault(); navigate(item.entry_key, target);
            });
            return link;
          }
          if (page === 'overview' && records.length) {
            const wrapper = el('div', '', { class: 'moderation-records-table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Moderation records by standard' });
            const table = el('table', '', { class: 'moderation-records-table' });
            table.append(el('caption', 'My moderation records — ' + year));
            const head = el('thead'), headings = el('tr');
            for (const title of ['Standard Number', 'Internal Moderation Sheet', 'Marking Schedules']) {
              headings.append(el('th', title, { scope: 'col' }));
            }
            head.append(headings); table.append(head);
            const body = el('tbody');
            for (const [number, items] of groups) {
              const row = el('tr'), standard = el('th', '', { scope: 'row' });
              const assessments = items.filter(item => !item.parent_record);
              const students = items.filter(item => item.parent_record);
              const title = items.find(item => item.standard_title)?.standard_title;
              for (const assessment of assessments) {
                standard.append(recordLink(assessment, 'overview', assessments.length === 1 ? number : number + ' — ' + (assessment.title || 'Untitled assessment')));
              }
              if (!assessments.length) standard.append(el('span', number));
              if (title) standard.append(el('p', title));
              row.append(standard);
              const internal = el('td'), internalList = el('ul');
              for (const assessment of assessments) {
                const entry = el('li');
                entry.append(recordLink(assessment, 'internal', assessments.length === 1 ? 'Open' : 'Open — ' + (assessment.title || 'Untitled assessment')));
                internalList.append(entry);
              }
              internal.append(assessments.length ? internalList : el('p', 'No assessment record'));
              row.append(internal);
              for (const target of ['schedule']) {
                const cell = el('td'), list = el('ul');
                for (const item of [...assessments, ...students]) {
                  const label = item.parent_record ? item.student_name || item.title || 'Individual student' : 'Standard marking schedule template' +
                    (assessments.length > 1 ? ' — ' + (item.title || 'Untitled assessment') : '');
                  const entry = el('li');
                  entry.append(recordLink(item, target, label));
                  list.append(entry);
                }
                cell.append(list); row.append(cell);
              }
              body.append(row);
            }
            table.append(body); wrapper.append(table); listing.append(wrapper);
            return;
          }
          for (const [number, items] of groups) {
            const group = el('section', '', { class: 'moderation-contents-group' });
            const title = items.find(item => item.standard_title)?.standard_title;
            group.append(el('h4', number + (title ? ' — ' + title : '')));
            const list = el('ul');
            for (const item of items) {
              const row = el('li');
              const label = ['feedback', 'coversheet'].includes(page)
                ? (item.student_name || (item.title || 'Untitled assessment').replace(/ — Marking Schedule$/, '')) +
                  ' — ' + (page === 'feedback' ? 'Confirmation & Feedback' : documents[page].title)
                : (item.title || 'Untitled assessment') +
                  (page === 'schedule' ? item.parent_record ? ' (Individual schedule)' : ' (Standard marking schedule template)' : '');
              row.append(recordLink(item, page, label)); list.append(row);
            }
            group.append(list); listing.append(group);
          }
        } catch (error) {
          console.error('Moderation record list failed.');
          listing.replaceChildren(el('p', error.message, { role: 'alert' }));
          button('Retry loading records', loadRecords, listing);
        }
      }
      loadRecords();
      async function loadStandards() {
        standard.disabled = true;
        standardsStatus.setAttribute('role', 'status');
        standardsStatus.textContent = 'Loading My Standards…';
        try {
          const result = await request(year + '/assessmentSetup/main');
          standards = JSON.parse(result.content.selectedStandards || '[]');
          if (!area.isConnected) return;
          standard.replaceChildren(el('option', 'Choose from My Standards', { value: '' }));
          for (const item of standards) standard.append(el('option', item.number + ' — ' + item.title, { value: item.number }));
          standard.value = '';
          standardsStatus.textContent = standards.length ? 'Choose the standard you want to work with. Its number and title will name the record automatically.' :
            'No standards selected for ' + year + '. Add standards in Setup Assessment → My Standards first.';
        } catch (error) {
          console.error('Moderation standards list failed.');
          if (area.isConnected) {
            standardsStatus.setAttribute('role', 'alert');
            standardsStatus.textContent = 'My Standards could not be loaded: ' + error.message;
          }
        } finally { if (area.isConnected) standard.disabled = false; }
      }
      button('Refresh My Standards', loadStandards, create);
      if (page === 'overview') { loadStandards(); prepareDrive(); }
      return;
    }

    for (const [key] of common) field(key, data[key] || '');
    if (hidden.standardNumber.value) Promise.resolve().then(async () => {
      if (!area.isConnected) return;
      try { await verifyVersion(); }
      catch (error) {
        console.error('Moderation PDF version verification failed.');
        if (area.isConnected) area.append(el('p', error.message + ' The saved version is unverified; retry before syncing.', { role: 'alert' }));
      }
    });
    field('standardType', data.standardType || '');
    if (data.parentRecord) field('parentRecord', data.parentRecord);
    let links, values = {};
    try {
      links = JSON.parse(data.driveDocuments || '{}');
      JSON.parse(data.standardFolder || 'null');
      for (const key of Object.keys(documents)) values[key] = JSON.parse(data[key] || '{}');
    } catch {
      area.append(el('p', 'Saved moderation data could not be read. It has been left unchanged. Contact the planner administrator.', { role: 'alert' }));
      return;
    }
    let cleanedInternal = false;
    const requirements = values.schedule.requirements;
    const cleanedSchedule = Array.isArray(requirements) && requirements.some(isSchedulePlaceholder);
    if (cleanedSchedule) values.schedule.requirements = requirements.filter(row => !isSchedulePlaceholder(row));
    for (const key of Object.keys(values.internal)) {
      const clean = internalFieldValue(key, values.internal[key]);
      if (clean !== values.internal[key]) { values.internal[key] = clean; cleanedInternal = true; }
    }
    if (!hidden.assessors.value && assessorName) {
      // Let the host finish loading before dispatching the autosave event.
      Promise.resolve().then(() => { if (area.isConnected && !hidden.assessors.value) update('assessors', assessorName); });
    }
    field('driveDocuments', JSON.stringify(links));
    const contactEmail = (options.userEmail || '').trim();
    const fillContactEmail = page === 'feedback' && !values.feedback.contactEmail?.trim() && contactEmail;
    if (fillContactEmail) values.feedback.contactEmail = contactEmail;
    for (const key of Object.keys(documents)) field(key, JSON.stringify(values[key]));
    if (fillContactEmail) Promise.resolve().then(() => {
      if (area.isConnected) update('feedback', JSON.stringify(values.feedback));
    });
    if (cleanedInternal) Promise.resolve().then(() => {
      if (area.isConnected) update('internal', JSON.stringify(values.internal));
    });
    if (cleanedSchedule) Promise.resolve().then(() => {
      if (area.isConnected) {
        update('schedule', JSON.stringify(values.schedule));
        message('Template-only requirement rows removed. Actual requirements and marking are unchanged; autosave will save the corrected layout.');
      }
    });
    Promise.resolve().then(() => { if (area.isConnected) fillRetentionLocation(); });
    fillSetupFolderLink();
    const heading = el('h2', data.title || 'Moderation record', { class: 'paper-heading' });
    area.append(heading);
    if (!documents[page]) {
      area.append(el('h3', 'Assessment details'),
        el('p', 'These details populate the four documents. Work with the assessment standard here; student names will be handled in a later workflow. Any previously saved student details are retained.'));
      const details = el('div', '', { class: 'moderation-fields' });
      let departments = [], teacherSelect, refreshTeacherOptions = () => {};
      const departmentSelect = el('select', '', { id: 'moderation-department', 'aria-describedby': 'moderation-department-status' });
      const departmentStatus = el('p', 'Loading departments from Kamar Uploader…', { id: 'moderation-department-status', role: 'status' });
      function renderDepartments() {
        const selected = hidden.department.value;
        departmentSelect.replaceChildren(el('option', 'Choose Faculty / department', { value: '' }));
        if (selected && !departments.some(item => item.name === selected)) departmentSelect.append(el('option', selected + ' (saved value)', { value: selected }));
        for (const item of departments) departmentSelect.append(el('option', item.name, { value: item.name }));
        departmentSelect.value = selected;
      }
      departmentSelect.disabled = true;
      renderDepartments();
      departmentSelect.addEventListener('change', () => {
        update('department', departmentSelect.value);
        const chosen = departments.find(item => item.name === departmentSelect.value);
        if (chosen?.teacher) {
          update('teacher', chosen.teacher);
          refreshTeacherOptions();
          teacherSelect.value = chosen.teacher;
          departmentStatus.textContent = 'Teacher in Charge set to ' + chosen.teacher + '. You can choose another teacher.';
        } else {
          departmentStatus.textContent = 'No single available leader is recorded for this department. Choose Teacher in Charge below; the existing teacher has not been cleared.';
        }
      });
      for (const definition of common) {
        if (definition[0] === 'studentName' || definition[0] === 'studentId') continue;
        if (definition[0] === 'department') {
          const wrapper = el('div', '', { class: 'planner-field' });
          wrapper.append(el('label', 'Faculty / Department', { for: 'moderation-department' }), departmentSelect, departmentStatus);
          details.append(wrapper); continue;
        }
        if (definition[0] === 'teacher') {
          const wrapper = el('div', '', { class: 'planner-field' });
          const teacher = el('select', '', { id: 'moderation-teacher', 'aria-describedby': 'moderation-teacher-status' });
          teacherSelect = teacher;
          const staffStatus = el('p', '', { id: 'moderation-teacher-status', role: 'status' });
          wrapper.append(el('label', 'Teacher in charge', { for: 'moderation-teacher' }), teacher, staffStatus);
          details.append(wrapper);
          teacher.addEventListener('change', () => update('teacher', teacher.value));
          function savedOption() {
            teacher.replaceChildren(el('option', 'Choose Teacher in Charge', { value: '' }));
            if (hidden.teacher.value) teacher.append(el('option', hidden.teacher.value, { value: hidden.teacher.value }));
            teacher.value = hidden.teacher.value;
          }
          savedOption();
          let currentStaff = [];
          refreshTeacherOptions = () => {
            const selected = hidden.teacher.value;
            teacher.replaceChildren(el('option', 'Choose Teacher in Charge', { value: '' }));
            if (selected && !currentStaff.some(person => person.name === selected)) {
              teacher.append(el('option', selected + ' (saved / department leader)', { value: selected }));
            }
            const frequent = currentStaff.filter(person => person.uses > 0).sort((a, b) => b.uses - a.uses ||
              currentStaff.indexOf(a) - currentStaff.indexOf(b));
            if (frequent.length) {
              const group = el('optgroup', '', { label: 'Most used by me' });
              for (const person of frequent) group.append(el('option', person.name, { value: person.name }));
              teacher.append(group, el('hr'));
            }
            const all = el('optgroup', '', { label: 'All current staff' });
            for (const person of currentStaff) all.append(el('option', person.name, { value: person.name }));
            teacher.append(all); teacher.value = selected;
          };
          async function loadTeachers() {
            teacher.disabled = true; refreshTeachers.disabled = true;
            staffStatus.setAttribute('role', 'status'); staffStatus.textContent = 'Loading Kamar staff…';
            try {
              const result = await request('staff');
              if (!area.isConnected) return;
              currentStaff = result.staff; departments = result.departments;
              renderDepartments(); departmentSelect.disabled = false;
              departmentStatus.setAttribute('role', 'status');
              departmentStatus.textContent = departments.length ?
                'Select a department to fill Teacher in Charge. Acting leaders take priority; review website roles before use.' :
                'No departments recorded. Contact the Kamar Uploader administrator.';
              const chosen = departments.find(item => item.name === hidden.department.value);
              if (!hidden.teacher.value && chosen?.teacher) update('teacher', chosen.teacher);
              refreshTeacherOptions();
              staffStatus.textContent = result.staff.length ?
                'Current Kamar staff, ordered by surname. Most used is based on your saved moderation records across all years.' :
                'No current staff found. Ask your administrator to update the Kamar Uploader staff list.';
            } catch (error) {
              console.error('Moderation staff list failed.');
              if (!area.isConnected) return;
              savedOption();
              staffStatus.setAttribute('role', 'alert'); staffStatus.textContent = error.message;
              departmentStatus.setAttribute('role', 'alert'); departmentStatus.textContent = error.message + ' Use Refresh staff list to retry.';
            } finally {
              if (area.isConnected) { teacher.disabled = false; refreshTeachers.disabled = false; }
            }
          }
          const refreshTeachers = button('Refresh staff list', loadTeachers, wrapper);
          loadTeachers();
          continue;
        }
        const control = input(definition, definition[0] === 'assessors' ? hidden.assessors.value || assessorName : hidden[definition[0]].value, value => {
          update(definition[0], value);
          if (['level', 'standardNumber'].includes(definition[0])) { fillRetentionLocation(); refreshFolder(); }
          if (definition[0] === 'title') heading.textContent = value || 'Moderation record';
        }, details);
        if (definition[0] === 'assessors' && !assessorName && !hidden.assessors.value) {
          control.parentElement.append(el('p', 'Your signed-in display name is unavailable. Enter the assessor name; email addresses are not used as the default.', { role: 'status' }));
        }
        if (definition[0] === 'level' || definition[0] === 'version') {
          const key = definition[0], label = key === 'version' ? 'version' : 'level';
          control.readOnly = true;
          if (key === 'version') versionControls.add(control);
          const levelStatus = el('p', '', { role: 'status' });
          control.parentElement.append(levelStatus);
          if ((!hidden[key].value || key === 'version') && hidden.standardNumber.value) {
            async function loadLevel() {
              retryLevel.disabled = true;
              levelStatus.setAttribute('role', 'status'); levelStatus.textContent = 'Loading standard ' + label + ' from NZQA PDF…';
              try {
                const selected = key === 'version' ? await verifyVersion() : await loadStandardDetails();
                if (!area.isConnected) return;
                if (!selected?.[key]) throw new Error('The standard ' + label + ' could not be found at NZQA.');
                if (!hidden[key].value) {
                  update(key, selected[key]); control.value = selected[key]; fillRetentionLocation(); refreshFolder();
                  if (key === 'level') fillSetupFolderLink();
                }
                levelStatus.textContent = label + ' set from the selected NZQA standard PDF.';
                retryLevel.hidden = true;
              } catch (error) {
                console.error('Moderation standard metadata load failed.');
                if (area.isConnected) { levelStatus.setAttribute('role', 'alert'); levelStatus.textContent = error.message; }
              } finally { retryLevel.disabled = false; }
            }
            const retryLevel = button('Retry standard ' + label, loadLevel, control.parentElement); loadLevel();
          } else levelStatus.textContent = label + ' comes from the selected standard.';
        }
      }
      area.append(details);
      showFolder(area);
      const cards = el('div', '', { class: 'moderation-document-cards' });
      for (const [key, doc] of Object.entries(documents)) {
        const card = el('section', '', { class: 'moderation-panel' });
        card.append(el('h3', doc.title), el('p', doc.description));
        button('Open ' + doc.title, () => navigate(record, key), card); cards.append(card);
      }
      area.append(cards, feedback); prepareDrive(); return;
    }
    function scheduleTemplate(schedule) {
      const template = {};
      for (const key of ['instructions', 'submissions', 'assessmentInstructionsLink', 'topicBriefLink', 'achieved', 'merit', 'excellence']) {
        if (typeof schedule[key] === 'string') template[key] = schedule[key];
      }
      if (Array.isArray(schedule.requirements)) template.requirements = schedule.requirements
        .filter(row => !isSchedulePlaceholder(row) && (row.requirement || '').trim())
        .map(row => ({ requirement: row.requirement }));
      return template;
    }
    const definition = documents[page], state = values[page];
    const documentPanel = el('section', '', { class: 'moderation-panel' });
    const isScheduleTemplate = page === 'schedule' && !data.parentRecord;
    documentPanel.append(el('h3', isScheduleTemplate ? 'Standard marking schedule template' : definition.title), el('p', definition.description),
      el('p', 'Database forms are the source for generated documents. ' +
        (['schedule', 'feedback'].includes(page) ? 'Importing fills empty fields, adds missing file links' + (page === 'schedule' ? ' and new requirements' : '') + ', and keeps existing values. The selected document becomes the target for future updates. ' :
          'Choosing an existing document imports its supported fields. ') +
        'Review the import before updating Drive; updating replaces the whole document, including changes made directly in Drive. Signatures recorded here are not electronic signatures.'));
    if (isScheduleTemplate) documentPanel.append(el('p',
      'Choose/import your standard marking schedule below, edit its reusable content here, and sync its master Drive document. New student schedules copy instructions, assessment links, criteria and requirement text. Existing student schedules change only when you choose Fill missing from standard template. Grades, marker comments, evidence, judgements and student submission files are never copied.'));
    const current = el('p'); documentPanel.append(current);
    function refreshLink() {
      current.replaceChildren();
      if (links[page]) current.append(el('a', links[page].name || 'Open saved document',
        { href: 'https://drive.google.com/file/d/' + links[page].id + '/view', target: '_blank', rel: 'noopener noreferrer' }));
      else current.textContent = 'No Drive document linked yet.';
      if (links[page]?.pdf) current.append(el('br'), el('a', 'Open PDF copy', {
        href: 'https://drive.google.com/file/d/' + links[page].pdf.id + '/view', target: '_blank', rel: 'noopener noreferrer'
      }));
    }
    refreshLink();
    const feedbackDetails = new Map();
    if (page === 'feedback') {
      const details = el('div', '', { class: 'moderation-fields' });
      for (const key of ['standardNumber', 'level', 'credits', 'version', 'studentName']) {
        const control = input(common.find(def => def[0] === key), hidden[key].value, value => update(key, value), details, 'feedback-details-');
        feedbackDetails.set(key, control);
        if (key === 'version') { control.readOnly = true; versionControls.add(control); }
      }
      documentPanel.append(details);
    }
    const decisionControls = new Map(), fieldControls = new Map();
    refreshRetention = () => {
      const control = fieldControls.get('retentionLocation');
      if (control) { control.value = state.retentionLocation || ''; control.readOnly = Boolean(currentStandardFolder()); }
    };
    function sync(reconcileResults = false, onlyIfChanged = false) {
      const before = JSON.stringify(state);
      if (page === 'internal') {
        const students = (state.samples || []).filter(item => (item.student || '').trim());
        if (reconcileResults && (students.length || state.resultsLoaded === 'Yes')) {
          state.resultsLoaded = students.length && students.every(item => item.reportedGrade && item.reportedDate) ? 'Yes' : 'No';
        }
        if (state.resultsLoaded === 'Yes' && !state.resultsDate) {
          const dates = students.map(item => item.reportedDate).filter(Boolean).sort();
          if (dates.length) state.resultsDate = dates.at(-1);
        }
        const decision = decisionControls.get('resultsLoaded');
        if (decision) {
          decision.checkbox.checked = state.resultsLoaded === 'Yes';
          decision.checkbox.indeterminate = !state.resultsLoaded || state.resultsLoaded === 'Not applicable';
          decision.answer.textContent = state.resultsLoaded || 'Not recorded';
        }
        const date = fieldControls.get('resultsDate');
        if (date) date.value = state.resultsDate || '';
        fillRetentionLocation();
        const location = fieldControls.get('retentionLocation');
        if (location) location.value = state.retentionLocation || '';
      }
      if (page === 'schedule' && hidden.standardType.value === 'Unit') {
        state.merit = ''; state.excellence = '';
        const requirements = state.requirements || [];
        state.grade = requirements.length && requirements.every(row => row.grade === 'A') ? 'A' : '';
        const grade = fieldControls.get('grade');
        if (grade) grade.value = state.grade;
      }
      const json = JSON.stringify(state);
      if (onlyIfChanged && json === before) return;
      update(page, json);
      if (json.length > 20000) message('This document form exceeds its 20,000-character limit and cannot save. Shorten notes or use supporting Drive files.', true);
    }
    const editor = el('div');
    let sourceLinks = data.parentRecord ? {} : sourceScheduleLinks(values.internal.source);
    const discussionControls = new Map();
    async function fillMarkerComments() {
      if (page !== 'internal') return;
      const failures = [];
      await Promise.all((state.samples || []).map(async item => {
        if (!item.markingScheduleRecord || (item.comments || '').trim()) return;
        try {
          const result = await request(year + '/moderation/' + item.markingScheduleRecord);
          if (!area.isConnected) return;
          if (result.revision === 0 || result.content.parentRecord !== record) throw new Error('The linked marking schedule is missing or does not belong to this moderation record.');
          const comments = JSON.parse(result.content.schedule || '{}').markerComments;
          if (comments !== undefined && typeof comments !== 'string') throw new Error('The saved marker comments are invalid.');
          if (comments && !(item.comments || '').trim() && state.samples.includes(item)) {
            item.comments = comments;
            sync();
            const control = discussionControls.get(item);
            if (control) control.value = comments;
          }
        } catch (error) {
          console.error('Marker comments could not be loaded.');
          failures.push(error.message);
        }
      }));
      if (failures.length && area.isConnected) {
        message('Some marker comments could not be populated: ' + [...new Set(failures)].join(' ') + ' Existing discussion text is unchanged. Reopen this sheet to retry.', true);
      }
    }
    function fillSourceLinks() {
      if (page !== 'schedule') return false;
      let filled = false;
      for (const [key, value] of Object.entries(sourceLinks)) {
        if (!state[key]) { state[key] = value; filled = true; }
      }
      if (filled) sync();
      return filled;
    }
    function reconcileFeedbackLinks() {
      const feedback = values.feedback;
      const before = JSON.stringify(feedback);
      if (links.schedule?.pdf) {
        feedback.markingScheduleLink = 'Marking Schedule | https://drive.google.com/file/d/' + links.schedule.pdf.id + '/view';
      }
      for (const [key, label] of [['markingScheduleLink', 'Marking Schedule'], ['coversheetLink', 'Cover Sheet']]) {
        const resources = documentResources(feedback[key] || '');
        if (!resources) throw new Error('The saved ' + label + ' links are invalid. Correct them before syncing.');
        const generic = resources.filter(item => item.name.trim().replace(/:$/, '').toLowerCase() === label.toLowerCase());
        const selected = generic.length ? generic : resources;
        if (feedback[key] !== undefined) feedback[key] = selected.filter((item, index) =>
          selected.findIndex(other => other.url === item.url) === index).map(item => item.name + ' | ' + item.url).join('\n');
      }
      if (before === JSON.stringify(feedback)) return false;
      update('feedback', JSON.stringify(feedback));
      return true;
    }
    function renderEditor() {
      editor.replaceChildren();
      decisionControls.clear(); fieldControls.clear();
      const groupPanels = [];
      for (const [title, definitions] of definition.groups) {
        const group = el('section', '', { class: 'moderation-panel' });
        group.append(el('h3', title));
        const grid = el('div', '', { class: 'moderation-fields' });
        let instructionLinks, submissionLinks;
        if (page === 'schedule' && definitions.some(def => def[2] === 'drive')) {
          const columns = el('div', '', { class: 'moderation-resource-columns' });
          instructionLinks = el('div', '', { class: 'moderation-resource-stack' });
          submissionLinks = el('div', '', { class: 'moderation-resource-stack' });
          columns.append(instructionLinks, submissionLinks); grid.append(columns);
        }
        const decisions = definitions.filter(def => def[2] === yesNo);
        if (decisions.length) {
          const table = el('table', '', { class: 'moderation-decisions' });
          table.append(el('caption', 'Tick = Yes; untick = No. Existing unrecorded or not-applicable answers stay unchanged until their checkbox is changed.'));
          const head = el('thead'), headings = el('tr');
          headings.append(el('th', 'Field', { scope: 'col' }), el('th', 'Tick (Yes)', { scope: 'col' }));
          head.append(headings); table.append(head);
          const body = el('tbody');
          for (const [key, label] of decisions) {
            const id = 'moderation-' + page + '-' + key;
            const row = el('tr'), heading = el('th', '', { scope: 'row' }), cell = el('td');
            const checkbox = el('input', '', { type: 'checkbox', id, 'aria-describedby': id + '-answer' });
            checkbox.type = 'checkbox';
            checkbox.checked = state[key] === 'Yes';
            checkbox.indeterminate = !state[key] || state[key] === 'Not applicable';
            const answer = el('span', state[key] || 'Not recorded', { id: id + '-answer', class: 'moderation-decision-answer' });
            decisionControls.set(key, { checkbox, answer });
            checkbox.addEventListener('change', () => {
              checkbox.indeterminate = false;
              state[key] = checkbox.checked ? 'Yes' : 'No';
              answer.textContent = state[key];
              if (page === 'internal' && key === 'previousCritique' && checkbox.checked) {
                for (const [dependentKey] of critique.slice(4)) {
                  state[dependentKey] = 'Yes';
                  const dependent = decisionControls.get(dependentKey);
                  dependent.checkbox.checked = true;
                  dependent.checkbox.indeterminate = false;
                  dependent.answer.textContent = 'Yes';
                }
              }
              sync();
            });
            heading.append(el('label', label, { for: id }));
            if (page === 'internal' && key === 'previousCritique') {
              heading.append(el('p', 'Ticking Yes also sets the eight critique checks below to Yes. You can adjust each check afterwards; unticking this box does not clear them.'));
            }
            const reference = definitions.find(def => def[2] === 'url' && def[3] === key);
            if (reference) {
              const link = el('a', 'Open reference document', { target: '_blank', rel: 'noopener noreferrer' });
              function refreshReference(value) {
                let url;
                try { url = value && new URL(value); } catch { url = undefined; }
                const valid = url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
                link.hidden = !valid;
                if (valid) link.setAttribute('href', url.href);
                else link.removeAttribute('href');
              }
              const control = input(reference, state[reference[0]], value => {
                state[reference[0]] = value; sync(); refreshReference(value);
              }, heading, page + '-');
              control.placeholder = 'https://…';
              heading.append(link); refreshReference(control.value);
              if (page === 'internal' && ['moderatorReportLink', 'conditionsLink'].includes(reference[0])) {
                const suggestions = el('div', '', { class: 'moderation-reference-suggestions' });
                const status = el('p', '', { role: 'status', 'aria-live': 'polite' });
                const find = button('Find NZQA references', async () => {
                  find.disabled = true; suggestions.replaceChildren();
                  status.setAttribute('role', 'status');
                  status.textContent = 'Checking official NZQA resources for this standard and year…';
                  try {
                    const result = await request('standards/' + encodeURIComponent(hidden.standardNumber.value) + '/references?year=' + year);
                    if (!control.isConnected) return;
                    if (result.number !== hidden.standardNumber.value || result.year !== year) throw new Error('NZQA returned references for a different standard or year.');
                    const matches = result.suggestions.filter(item => item.target === reference[0]);
                    status.textContent = (matches.length ? 'Suggestions checked ' + new Date(result.checkedAt).toLocaleString('en-NZ') + '. Review applicability before using a link. Finding a reference does not mark it as checked.' :
                      'No matching reference was verified. You can enter a link manually.') +
                      (result.warnings.length ? ' ' + result.warnings.join(' ') : '');
                    for (const item of matches) {
                      const url = new URL(item.url);
                      if (url.protocol !== 'https:' || !['www.nzqa.govt.nz', 'www2.nzqa.govt.nz'].includes(url.hostname) ||
                          url.username || url.password || url.port) throw new Error('An unsupported reference link was returned.');
                      const card = el('div');
                      card.append(el('a', item.title, { href: url.href, target: '_blank', rel: 'noopener noreferrer' }),
                        el('p', item.kind + ' | Year: ' + item.year + ' | ' + item.scope));
                      button('Use this link', () => {
                        if (control.value && control.value !== url.href &&
                            !confirm('Replace the existing reference link with "' + item.title + '"? Your checked answer will not change.')) return;
                        control.value = url.href;
                        state[reference[0]] = url.href; sync(); refreshReference(url.href);
                        message('Reference link selected. Autosave will save it; review the document before marking it checked.');
                      }, card);
                      suggestions.append(card);
                    }
                    suggestions.append(el('a', 'Open NZQA standard details', { href: 'https://www.nzqa.govt.nz/ncea/assessment/search.do?query=' +
                      encodeURIComponent(hidden.standardNumber.value) + '&view=all', target: '_blank', rel: 'noopener noreferrer' }));
                  } catch (error) {
                    console.error('NZQA reference lookup failed.');
                    status.textContent = error.message + ' Saved links are unchanged. Retry using Find NZQA references or enter a link manually.';
                    status.setAttribute('role', 'alert');
                  } finally { if (control.isConnected) find.disabled = false; }
                }, heading);
                heading.append(status, suggestions);
              }
            }
            cell.append(checkbox, answer); row.append(heading, cell); body.append(row);
          }
          table.append(body); group.append(table);
        }
        for (const def of definitions) {
          if (page === 'schedule' && hidden.standardType.value === 'Unit' && ['merit', 'excellence'].includes(def[0])) continue;
          if (def[2] === yesNo || def[2] === 'url' && def[3]) continue;
          if (page === 'schedule' && def[0] === 'tourReportLink') continue;
          if (def[2] === 'drive') {
            const [key, label] = def;
            const panel = el('section', '', { class: 'planner-field' });
            const link = el('div', '', { class: 'moderation-resource-links' });
            function refreshResource() {
              link.replaceChildren();
              const resources = documentResources(state[key] || '');
              if (!resources || !resources.length) {
                link.textContent = state[key] ? 'Saved links are invalid. Check the saved record before adding files.' : 'No document linked yet.';
                return;
              }
              const table = el('table', '', { class: 'moderation-resource-table', 'aria-label': label + ' files' });
              const head = el('thead'), headings = el('tr');
              headings.append(el('th', 'Filename', { scope: 'col' }), el('th', 'Action', { scope: 'col' }));
              head.append(headings);
              const body = el('tbody');
              resources.forEach((resource, index) => {
                const item = el('tr'), filename = el('td'), action = el('td');
                filename.append(el('a', resource.name, { href: resource.url, target: '_blank', rel: 'noopener noreferrer' }));
                const remove = button('Remove', async () => {
                  if (working || !confirm('Remove this file link? The Drive file will not be deleted.')) return;
                  state[key] = state[key].split('\n').filter((_, i) => i !== index).join('\n');
                  sync(); refreshResource();
                  try { await persist(); message(label + ' link removed.'); }
                  catch (error) { message(error.message, true); }
                }, action, 'danger');
                remove.setAttribute('aria-label', 'Remove ' + resource.name + ' from ' + label);
                item.append(filename, action); body.append(item);
              });
              table.append(head, body); link.append(table);
            }
            panel.append(el('h4', label), link);
            driveButton('Choose Google Drive files for ' + label, async () => {
              const selected = await access.chooseFiles(page !== 'feedback');
              if (!selected) { message('File selection cancelled. The saved links are unchanged.'); return; }
              const resources = documentResources(state[key] || '');
              if (!resources) throw new Error('The saved resource links are invalid. Resolve them before adding another file.');
              const urls = new Set(page === 'feedback' ? [] : resources.map(resource => resource.url));
              const additions = [];
              for (const selection of selected) {
                const file = await access.metadata(selection.id);
                if (file.trashed || file.mimeType === 'application/vnd.google-apps.folder' ||
                    !/^[\w-]{10,200}$/.test(file.id) || typeof file.name !== 'string' || !file.name.trim()) {
                  throw new Error('Choose accessible files, not folders. No links from this selection have been saved.');
                }
                const url = 'https://drive.google.com/file/d/' + file.id + '/view';
                const value = file.name.replace(/[\r\n]+/g, ' ') + ' | ' + url;
                if (value.length > 500) throw new Error('A file name is too long to save. Shorten its name in Drive and try again. No links from this selection have been saved.');
                if (!urls.has(url)) { urls.add(url); additions.push(value); }
              }
              if (!additions.length) { message('These files are already linked.'); return; }
              const next = [...(page === 'feedback' ? [] : [state[key]]), ...additions].filter(Boolean).join('\n');
              if (next.length > 8000) throw new Error('These resource links exceed the 8,000-character limit. Remove a link before adding another.');
              state[key] = next;
              if (page === 'feedback') reconcileFeedbackLinks();
              sync(); refreshResource(); await persist();
              message(page === 'feedback' && key === 'markingScheduleLink' && links.schedule?.pdf ?
                'The automatically generated Marking Schedule PDF remains linked. Document contents remain in Google Drive.' :
                label + ' links saved. File contents remain in Google Drive.');
            }, panel);
            refreshResource();
            (page === 'schedule' ? (['assessmentInstructionsLink', 'topicBriefLink'].includes(key) ? instructionLinks : submissionLinks) : grid).append(panel);
            continue;
          }
          if (page === 'schedule' && ['instructions', 'submissions'].includes(def[0])) continue;
          if (page === 'feedback' && def[0] === 'feedback') continue;
          if (page === 'internal' && def[0] === 'source') {
            const row = el('div', '', { class: 'moderation-source' });
            const control = input(def, state.source, value => { state.source = value; sync(); }, row, page + '-');
            control.rows = 2; control.hidden = true;
            const wrapper = control.parentElement;
            const links = el('ul', '', { class: 'moderation-source-links' });
            const edit = el('button', 'Edit source details', { type: 'button', 'aria-expanded': 'false', 'aria-controls': control.id || 'moderation-internal-source' });
            edit.addEventListener('click', () => {
              control.hidden = !control.hidden;
              edit.setAttribute('aria-expanded', String(!control.hidden));
              edit.textContent = control.hidden ? 'Edit source details' : 'Hide link addresses';
              if (!control.hidden) control.focus();
            });
            function renderLinks() {
              links.replaceChildren();
              const lines = control.value.split('\n').map(line => line.trim()).filter(Boolean);
              if (!lines.length) links.append(el('li', 'No assessment linked yet.'));
              for (const value of lines) {
                const item = el('li');
                const resource = globalThis.plannerGoogleDrive.resourceLink?.(value);
                let url;
                try { url = resource && new URL(resource.url); } catch { url = undefined; }
                if (url && ['https:', 'http:'].includes(url.protocol)) {
                  item.append(el('a', resource.name && resource.name !== resource.url ? resource.name : 'Linked assessment',
                    { href: url.href, target: '_blank', rel: 'noopener noreferrer' }));
                } else item.textContent = value;
                links.append(item);
              }
            }
            control.addEventListener('input', () => { state.source = control.value; sync(); renderLinks(); });
            wrapper.append(links, edit); renderLinks();
            const chooser = el('div', '', { class: 'moderation-source-drive' });
            row.append(chooser); grid.append(row);
            globalThis.plannerGoogleDrive.mount(chooser, { el, resources: control, request: () => request('google-drive/config'),
              label: 'Link assessment from Google Drive',
              openSetup: () => message('Open Planner cover → Setup My Planner → Google Drive Setup to check your connection.', true) });
            continue;
          }
          const control = input(def, state[def[0]], value => { state[def[0]] = value; sync(); }, grid, page + '-');
          fieldControls.set(def[0], control);
          if (page === 'internal' && def[0] === 'retentionLocation' && currentStandardFolder()) control.readOnly = true;
        }
        group.append(grid); groupPanels.push(group);
      }
      editor.append(...(page === 'internal' ? groupPanels.slice(0, 2) : groupPanels));
      if (definition.rows) {
        const rows = definition.rows, section = el('section', '', { class: 'moderation-panel' });
        section.append(el('h3', rows.title));
        if (page === 'internal') section.append(el('p', 'Each entry has its own marking schedule. Enter the student identifier, then choose Create / open marking schedule to import an existing document or complete a blank form.'));
        state[rows.key] ||= [];
        const list = el('div');
        function renderRows() {
          list.replaceChildren();
          discussionControls.clear();
          if (page === 'schedule') {
            list.setAttribute('class', 'moderation-requirements-scroll');
            const table = el('table', '', { class: 'moderation-requirements-table' });
            table.append(el('caption', 'Select one grade per requirement. Untick to clear it.'));
            const grades = hidden.standardType.value === 'Unit' ? ['A'] : ['A', 'M', 'E'];
            const head = el('thead'), headings = el('tr');
            for (const label of ['Key requirements (list)', ...grades, 'Describe or attach the evidence considered', 'Explain how the judgement was made']) {
              headings.append(el('th', label, { scope: 'col' }));
            }
            head.append(headings); table.append(head);
            const body = el('tbody');
            state[rows.key].forEach((item, i) => {
              const row = el('tr'), requirement = el('td');
              requirement.append(el('strong', 'Requirement ' + (i + 1)));
              input(rows.fields.find(def => def[0] === 'requirement'), item.requirement,
                value => { item.requirement = value; sync(); }, requirement, page + '-' + i + '-');
              button('Remove requirement ' + (i + 1), () => {
                if (!confirm('Remove this requirement?')) return;
                state[rows.key].splice(i, 1); sync(); renderRows();
              }, requirement, 'danger');
              if (item.grade && !grades.includes(item.grade)) requirement.append(el('p',
                'Saved grade: ' + item.grade + '. Select an available tick to replace it, or clear the saved grade.'));
              if (item.grade && !grades.includes(item.grade)) button('Clear saved grade for requirement ' + (i + 1), () => {
                item.grade = ''; sync(); renderRows();
              }, requirement, 'danger');
              row.append(requirement);
              const boxes = [];
              for (const grade of grades) {
                const cell = el('td', '', { class: 'moderation-grade-tick' });
                const box = el('input', '', { type: 'checkbox', 'aria-label': grade + ' for requirement ' + (i + 1) });
                box.type = 'checkbox'; box.checked = item.grade === grade;
                boxes.push({ box, grade });
                box.addEventListener('change', () => {
                  item.grade = box.checked ? grade : '';
                  for (const entry of boxes) entry.box.checked = item.grade === entry.grade;
                  sync();
                });
                cell.append(box); row.append(cell);
              }
              for (const key of ['evidence', 'judgement']) {
                const cell = el('td');
                input(rows.fields.find(def => def[0] === key), item[key],
                  value => { item[key] = value; sync(); }, cell, page + '-' + i + '-');
                row.append(cell);
              }
              body.append(row);
            });
            table.append(body); list.append(table); return;
          }
          state[rows.key].forEach((item, i) => {
            const row = el('fieldset', '', { class: 'moderation-panel' });
            const studentLabel = 'Student ' + (i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26));
            row.append(el('legend', page === 'internal' ? studentLabel : 'Entry ' + (i + 1)));
            const grid = el('div', '', { class: page === 'internal' ? 'moderation-fields moderation-student-fields' : 'moderation-fields' });
            const reporting = el('div', '', { class: 'moderation-fields moderation-student-reporting' });
            const topKeys = ['student', 'markerGrade', 'comments'];
            const fields = page === 'internal' ? [
              ...topKeys.map(key => rows.fields.find(def => def[0] === key)),
              ...rows.fields.filter(def => !topKeys.includes(def[0]))
            ] : rows.fields;
            for (const def of fields) {
              const primary = page === 'internal' && topKeys.includes(def[0]);
              const control = input(def, item[def[0]], value => { item[def[0]] = value; sync(['student', 'reportedGrade', 'reportedDate'].includes(def[0])); },
                page === 'internal' && !primary ? reporting : grid, page + '-' + i + '-');
              if (primary) control.setAttribute('class', 'moderation-student-highlight');
              if (page === 'internal' && def[0] === 'comments') discussionControls.set(item, control);
            }
            row.append(grid);
            if (page === 'internal') row.append(reporting);
            if (page === 'internal') {
              for (const target of ['schedule', 'feedback']) {
                button((target === 'schedule' ? 'Create / open marking schedule for entry ' : 'Create / open Confirmation & Feedback for entry ') + (i + 1), async () => {
                  if (working) return;
                  const student = (item.student || '').trim();
                  if (!student) { message('Enter a student name / identifier before opening their moderation forms.', true); return; }
                  working = true; area.inert = true; area.dataset.moderationBusy = 'true';
                  try {
                    if (!access) throw new Error('Google Drive is not ready. Check your Drive setup and retry.');
                    await access.authorize();
                    await persist();
                    if (!item.markingScheduleRecord) {
                      item.markingScheduleRecord = crypto.randomUUID();
                      sync(); await persist();
                    }
                    const id = item.markingScheduleRecord;
                    const path = year + '/moderation/' + id;
                    const existing = await request(path);
                    if (existing.revision !== 0 && existing.content.parentRecord !== record) {
                      throw new Error('The linked schedule belongs to another moderation record. No changes were made.');
                    }
                    const standardFolder = await access.ensureAssessmentFolders(hidden.folderId.value, hidden.level.value, hidden.standardNumber.value);
                    await access.ensureStudentFolder(standardFolder.id, i);
                    rememberStandardFolder(standardFolder); await persist();
                    if (existing.revision === 0) {
                      const content = Object.fromEntries(common.map(([key]) => [key, hidden[key].value]));
                      Object.assign(content, { title: (hidden.standardNumber.value + ' — ' + student + ' — Marking Schedule').slice(0, 500),
                        studentName: student, studentId: '', parentRecord: record,
                        folderId: hidden.folderId.value, folderName: hidden.folderName.value,
                        standardFolder: hidden.standardFolder.value,
                        schedule: JSON.stringify({ ...sourceScheduleLinks(state.source), ...scheduleTemplate(values.schedule) }),
                        ...(target === 'feedback' ? { feedback: JSON.stringify({ grade: item.markerGrade || '' }) } : {}) });
                      await mutate(path, { content, revision: 0 });
                    } else if (target === 'feedback') {
                      const feedback = JSON.parse(existing.content.feedback || '{}');
                      const schedule = JSON.parse(existing.content.schedule || '{}');
                      const content = { ...existing.content };
                      if (!(content.studentName || '').trim()) content.studentName = student;
                      for (const [key] of common) {
                        if (!(content[key] || '').trim() && hidden[key].value) content[key] = hidden[key].value;
                      }
                      if (!feedback.grade) feedback.grade = schedule.grade || item.markerGrade || '';
                      content.feedback = JSON.stringify(feedback);
                      if (JSON.stringify(content) !== JSON.stringify(existing.content)) {
                        await mutate(path, { content, revision: existing.revision });
                      }
                    }
                    delete area.dataset.moderationBusy; working = false; area.inert = false;
                    await navigate(id, target);
                  } catch (error) {
                    console.error('Individual moderation form could not be opened.');
                    message(error.message + ' Your entry remains saved; retry this button to open its form.', true);
                  } finally { delete area.dataset.moderationBusy; working = false; area.inert = false; }
                }, row);
              }
            }
            button('Remove entry ' + (i + 1), () => {
              if (!confirm('Remove this evidence entry?' + (item.markingScheduleRecord ? ' Its individual marking schedule will remain saved in My moderation records.' : ''))) return;
              state[rows.key].splice(i, 1); sync(true); renderRows();
            }, row, 'danger');
            list.append(row);
          });
        }
        section.append(list);
        button(page === 'schedule' ? 'Add requirement' : 'Add evidence entry', () => {
          if (state[rows.key].length >= 50) { message(page === 'schedule' ? 'Each schedule supports up to 50 requirements.' : 'Each document supports up to 50 evidence entries.', true); return; }
          state[rows.key].push({}); sync(); renderRows();
        }, section);
        renderRows(); editor.append(section);
      }
      if (page === 'internal') editor.append(...groupPanels.slice(2));
      const support = el('section', '', { class: 'moderation-panel' });
      support.append(el('h3', 'Supporting information for this stage'));
      input(['notes', 'Supporting notes', 'area'], state.notes, value => { state.notes = value; sync(); }, support, page + '-');
      const resources = input(['resources', 'Supporting resource links', 'area'], state.resources, value => { state.resources = value; sync(); }, support, page + '-');
      const chooser = el('div');
      support.append(chooser);
      globalThis.plannerGoogleDrive.mount(chooser, { el, resources, request: () => request('google-drive/config'),
        openSetup: () => message('Open Planner cover → Setup My Planner → Google Drive Setup to check your connection.', true) });
      editor.append(support);
    }
    async function saveLink(file) {
      links[page] = { id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime,
        ...(links[page]?.pdf ? { pdf: links[page].pdf } : {}) };
      update('driveDocuments', JSON.stringify(links)); refreshLink();
      await persist();
    }
    const actions = el('div', '', { class: 'moderation-actions' });
    function mergeDocument(imported) {
      const merged = JSON.parse(JSON.stringify(state));
      const empty = value => value === undefined || typeof value === 'string' && !value.trim();
      const fields = [...definition.groups.flatMap(([, fields]) => fields), ['notes'], ['resources']];
      for (const [key, , kind] of fields) {
        const value = imported.document[key];
        if (kind === 'drive') {
          const existing = documentResources(merged[key] || ''), incoming = documentResources(value || '');
          if (!existing || !incoming) throw new Error('The resource links are invalid. No imported information or document link has been saved.');
          const urls = new Set(existing.map(resource => resource.url));
          const additions = incoming.filter(resource => {
            if (urls.has(resource.url)) return false;
            urls.add(resource.url); return true;
          }).map(resource => resource.name + ' | ' + resource.url);
          if (additions.length) merged[key] = [merged[key], ...additions].filter(Boolean).join('\n');
        } else if (empty(merged[key]) && !empty(value)) merged[key] = value;
      }
      const rows = merged.requirements || [];
      for (const incoming of (page === 'schedule' ? imported.document.requirements || [] : [])) {
        if (isSchedulePlaceholder(incoming)) continue;
        if (!definition.rows.fields.some(([key]) => !empty(incoming[key]))) continue;
        const name = (incoming.requirement || '').trim();
        const matches = name ? rows.filter(row => (row.requirement || '').trim() === name) : [];
        if (matches.length === 1) {
          for (const [key] of definition.rows.fields) {
            if (empty(matches[0][key]) && !empty(incoming[key])) matches[0][key] = incoming[key];
          }
        } else if (!rows.some(row => definition.rows.fields.every(([key]) => (row[key] || '').trim() === (incoming[key] || '').trim()))) {
          rows.push({ ...incoming });
        }
      }
      if (merged.requirements || rows.length) merged.requirements = rows;
      if (rows.length > 50 || fields.some(([key]) => typeof merged[key] === 'string' && merged[key].length > 8000) ||
          JSON.stringify(merged).length > 20000) {
        throw new Error('The combined form exceeds the 50-requirement, 8,000-character field or 20,000-character form limit. Shorten the forms before importing. No imported information or document link has been saved.');
      }
      return merged;
    }
    if (page === 'schedule' && data.parentRecord) button('Fill missing from standard template', async () => {
      if (working) return;
      working = true; area.inert = true;
      try {
        await persist();
        const parent = await request(year + '/moderation/' + data.parentRecord);
        if (!parent.revision || parent.content.parentRecord ||
            parent.content.standardNumber !== hidden.standardNumber.value) {
          throw new Error('The standard template is missing or belongs to a different standard. No template content was applied.');
        }
        const template = scheduleTemplate(JSON.parse(parent.content.schedule || '{}'));
        const merged = mergeDocument({ document: template });
        if (JSON.stringify(merged) === JSON.stringify(state)) {
          message('No missing template content to add. Existing marking and Drive links are unchanged.'); return;
        }
        if (!confirm('Fill missing instructions, assessment links, criteria and requirements from the standard template? Existing marking and student files stay unchanged. No Drive documents will be updated.')) return;
        Object.assign(state, merged); sync(); renderEditor(); await persist();
        message('Missing template content saved. Existing marking and Drive sync targets are unchanged. Sync this student schedule when ready to publish its changes.');
      } catch (error) {
        console.error('Standard schedule template could not be applied.');
        message(error.message, true);
      } finally { area.inert = false; working = false; }
    }, actions);
    if (page === 'schedule') driveButton('Import missing resource links from linked schedule', async () => {
      await persist();
      if (!links.schedule) throw new Error('Choose your existing marking schedule and import its form data first. Its heading hyperlinks will be imported automatically.');
      const file = await access.metadata(links.schedule.id);
      if (file.trashed || ![GOOGLE_DOC, DOCX].includes(file.mimeType)) throw new Error('The linked schedule is unavailable or is not a Google Doc or Word document.');
      const blob = await access.download(file);
      const imported = await binaryRequest('moderation/import/schedule', { method: 'POST', body: blob, headers: { 'Content-Type': DOCX } });
      const fields = definition.groups.flatMap(([, fields]) => fields).filter(def => def[2] === 'drive');
      let count = 0;
      for (const [key] of fields) {
        if (!state[key] && imported.document[key] && documentResources(imported.document[key])) {
          state[key] = imported.document[key]; count++;
        }
      }
      if (count) { sync(); renderEditor(); await persist(); }
      message((count ? count + ' missing resource link(s) saved.' : 'No new resource links found.') +
        ' Existing links, marking data and Drive documents are unchanged. ' + imported.warning);
    }, actions);
    driveButton('Choose existing document and import its form data', async () => {
      await persist();
      const selected = await access.choose();
      if (!selected) { message('Document selection cancelled. Saved forms are unchanged.'); return; }
      const file = await access.metadata(selected.id);
      if (file.trashed || ![GOOGLE_DOC, DOCX].includes(file.mimeType) || !file.capabilities?.canEdit) {
        throw new Error('Choose an editable Google Doc or Word document matching this form.');
      }
      const blob = await access.download(file);
      const imported = await binaryRequest('moderation/import/' + page, { method: 'POST', body: blob, headers: { 'Content-Type': DOCX } });
      if (imported.common.standardNumber && hidden.standardNumber.value && imported.common.standardNumber !== hidden.standardNumber.value) {
        throw new Error('The selected document is for standard ' + imported.common.standardNumber + ', not ' + hidden.standardNumber.value + '. Choose the correct document. The current form and document link are unchanged.');
      }
      if (['schedule', 'feedback'].includes(page)) {
        const merged = mergeDocument(imported);
        if (!confirm('Import missing information from "' + file.name + '" and use it for future syncs? Existing text, grades and dates will stay unchanged. Missing file links' + (page === 'schedule' ? ' and new requirements' : '') + ' will be added. Neither Google document will be changed by this import.')) return;
        for (const [key] of common) {
          if (key === 'version') continue;
          const value = imported.common[key];
          if (!hidden[key].value.trim() && typeof value === 'string' && value.trim()) update(key, value);
        }
        for (const [key, control] of feedbackDetails) control.value = hidden[key].value;
        Object.assign(state, merged); fillSourceLinks();
        if (page === 'feedback') reconcileFeedbackLinks();
        sync(); renderEditor();
        await saveLink(file);
        message('Missing information imported; existing values preserved. Future syncs will update "' + file.name +
          '". Neither Google document was changed. ' + imported.warning);
        return;
      }
      if (!confirm('Import "' + file.name + '"? This replaces this document form and matching assessment details in the database. The Drive document will not be changed until you choose Update.')) return;
      if (page === 'internal' && imported.document.samples) {
        for (const sample of imported.document.samples) {
          const name = (sample.student || '').trim();
          const old = (state.samples || []).filter(item => (item.student || '').trim() === name && item.markingScheduleRecord);
          if (name && !sample.markingScheduleRecord && old.length === 1 &&
              imported.document.samples.filter(item => (item.student || '').trim() === name).length === 1) {
            sample.markingScheduleRecord = old[0].markingScheduleRecord;
          }
        }
      }
      if (page === 'internal') {
        const formOnly = ['notes', 'resources', ...definition.groups.flatMap(([, fields]) => fields)
          .filter(([key, , kind]) => kind === 'url' || key === 'signatoryPosition').map(([key]) => key)];
        for (const key of formOnly) {
          if (imported.document[key] === undefined && state[key] !== undefined) imported.document[key] = state[key];
        }
      }
      for (const [key, value] of Object.entries(imported.common)) if (key !== 'version' && hidden[key] && value) update(key, value);
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, imported.document); fillSourceLinks(); sync(true); renderEditor();
      await fillSetupFolderLink();
      await fillMarkerComments();
      await saveLink(file);
      message(imported.warning);
    }, actions);
    const properties = { plannerRecord: record, plannerDocument: page, plannerYear: String(year), plannerOwner: ownerId };
    async function writeDocument(replacement = false) {
      await verifyVersion();
      if (page === 'feedback' && reconcileFeedbackLinks()) renderEditor();
      await persist();
      let destinationId = hidden.folderId.value;
      let file = replacement ? null : links[page];
      if (!file) {
        if (!hidden.folderId.value) throw new Error('Choose your Assessment / Moderation folder on Record details before creating a document.');
        const folder = await access.metadata(hidden.folderId.value);
        if (folder.trashed || !folder.capabilities?.canAddChildren) throw new Error('The chosen folder cannot accept files. Choose another folder on Record details.');
        if (!replacement) file = await access.find(hidden.folderId.value, properties);
        if (!file) {
          if (!hidden.level.value || !hidden.version.value) throw new Error('Open Record details to load the standard level and PDF version before creating a document.');
          const destination = await prepareRecordFolders();
          await persist();
          destinationId = destination.id;
          if (!replacement) file = await access.find(destinationId, properties);
        }
      }
      if (file) {
        file = await access.metadata(file.id);
        if (file.trashed) throw new Error('The linked file is in the Drive bin. Restore it or explicitly create a replacement.');
        if (!file.capabilities?.canEdit) throw new Error('This Google account cannot edit the linked document.');
        if (!confirm('Replace the full contents of "' + file.name + '" with the saved form? Any direct edits, comments tied to removed content, or supporting content inside that document may be lost. Separate supporting files will not change.')) return;
      } else if (!confirm('Create a new Google Doc in "' + hidden.folderName.value + ' / Level ' + hidden.level.value + ' / ' + hidden.standardNumber.value + '"? It inherits that folder’s sharing permissions.' +
          (replacement ? ' This will leave any previously linked document unchanged.' : ''))) return;
      const controls = [...editor.querySelectorAll('input,textarea,select,button')];
      controls.forEach(control => { control.disabled = true; });
      try {
        message(file ? 'Updating Drive document…' : 'Creating Drive document…');
        let pdfQuery = '';
        if (page === 'schedule') {
          const details = await loadStandardDetails();
          if (!details.url) throw new Error('The official NZQA standard PDF link could not be loaded. Retry the standard lookup before syncing.');
          pdfQuery = '?standardPdfUrl=' + encodeURIComponent(details.url);
        }
        const blob = await binaryRequest('moderation/' + year + '/' + record + '/' + page + '/document' + pdfQuery, { blobResponse: true });
        const name = [year, hidden.standardNumber.value, hidden.studentName.value || hidden.title.value, definition.title].filter(Boolean).join(' - ').slice(0, 240);
        const result = await access.upload(blob, { id: file?.id, name: file?.name || name, folderId: destinationId, properties, mimeType: file?.mimeType, etag: file?.etag });
        await saveLink(result);
        if (['schedule', 'feedback'].includes(page)) {
          try {
            message('Editable document synced. Saving its PDF copy…');
            const source = await access.metadata(result.id);
            const folderId = source.parents?.[0];
            if (!folderId) throw new Error('The document folder could not be identified. Check your Drive access and retry.');
            const pdfProperties = { ...properties, plannerDocument: page + '-pdf' };
            let pdf = links[page].pdf || await access.find(folderId, pdfProperties);
            if (pdf) {
              pdf = await access.metadata(pdf.id);
              if (pdf.trashed || pdf.mimeType !== 'application/pdf' || !pdf.capabilities?.canEdit) {
                throw new Error('The linked PDF is missing, in the bin, or cannot be edited. Restore access before retrying.');
              }
            }
            const savedPdf = await access.savePdf(result, { documentBlob: blob, id: pdf?.id,
              name: result.name.replace(/\.docx$/i, '') + '.pdf', folderId, properties: pdfProperties, etag: pdf?.etag });
            links[page].pdf = { id: savedPdf.id, name: savedPdf.name, mimeType: savedPdf.mimeType, modifiedTime: savedPdf.modifiedTime };
            if (page === 'schedule') reconcileFeedbackLinks();
            update('driveDocuments', JSON.stringify(links)); refreshLink(); await persist();
            message('Editable document and PDF copy saved in Google Drive. Future syncs update both existing files.');
          } catch (error) {
            throw new Error('The editable document synced successfully, but the PDF step did not complete: ' + error.message +
              ' Retry Create / update Google Drive document to finish the PDF sync.');
          }
          return;
        }
        message('Document ' + (file ? 'updated' : 'created') + ' in Google Drive. Its link and form data are saved in your private database record.');
      } finally { controls.forEach(control => { control.disabled = false; }); }
    }
    driveButton('Create / update Google Drive document', () => writeDocument(), actions);
    driveButton('Create a replacement document', () => writeDocument(true), actions)
      .setAttribute('class', 'moderation-button-warning');
    documentPanel.append(actions);
    area.append(documentPanel, feedback, editor);
    renderEditor(); prepareDrive();
    if (page === 'feedback') Promise.resolve().then(() => {
      if (!area.isConnected) return;
      try { if (reconcileFeedbackLinks()) renderEditor(); }
      catch (error) {
        console.error('Confirmation resource links could not be reconciled.');
        message(error.message, true);
      }
    });
    if (page === 'internal') Promise.resolve().then(() => { if (area.isConnected) sync(true, true); });
    fillMarkerComments();
    if (page === 'schedule' && hidden.standardNumber.value) {
      loadStandardDetails().then(details => {
        if (!area.isConnected) return;
        if (details.number !== hidden.standardNumber.value || !['Unit', 'Achievement'].includes(details.standardType)) throw new Error('NZQA did not identify the selected standard type.');
        update('standardType', details.standardType);
        if (details.standardType === 'Unit') {
          const criteria = (state.achieved || '').trim();
          if ((!criteria || /^achieved[.:]?$/i.test(criteria)) && details.outcomes?.length) {
            state.achieved = details.outcomes.join('\n\n');
          } else if ((!criteria || /^achieved[.:]?$/i.test(criteria)) && !details.outcomes?.length) {
            message('The Unit Standard PDF contains no recognised Outcome statements. Enter the Achieved Grade Criteria manually; saved marking is unchanged.', true);
          }
        }
        if (details.standardType === 'Unit') sync();
        renderEditor();
      }).catch(error => {
        console.error('Standard grade criteria could not be verified.');
        if (area.isConnected) message('Standard type could not be verified: ' + error.message + ' Reopen the schedule to retry. Existing requirements have not been cleared.', true);
      });
    }
    Promise.resolve().then(() => { if (area.isConnected && fillSourceLinks()) renderEditor(); });
    if (page === 'schedule' && data.parentRecord) {
      request(year + '/moderation/' + data.parentRecord).then(parent => {
        if (!area.isConnected) return;
        sourceLinks = sourceScheduleLinks(JSON.parse(parent.content.internal || '{}').source);
        if (fillSourceLinks()) {
          renderEditor();
          message('Empty assessment / topic brief links filled from Internal Moderation source materials. Autosave will save these links.');
        }
      }).catch(error => {
        console.error('Moderation source materials could not be loaded.');
        if (area.isConnected) message('Source material links could not be populated: ' + error.message + ' Reopen the schedule to retry, or select the links manually.', true);
      });
    }
  }
  globalThis.plannerModeration = { mount };
})();
