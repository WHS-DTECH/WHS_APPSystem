(() => {
  'use strict';
  const { common, documents, yesNo, critique, documentResources, sourceScheduleLinks, internalFieldValue, isSchedulePlaceholder, nzqaCriteriaCitation, nzqaCriteriaCitations, appendCitations, requirementLevel, normaliseStaffName, staffLeadershipPositions } = globalThis.plannerModerationSchema;
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
      if (hidden.version.value !== details.version) {
        update('version', details.version);
        refreshLibraryCourses();
      }
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
    const area = el('section', '', { class: 'paper-page moderation-page' + (page === 'schedule' ? ' moderation-page-schedule' : '') });
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
    function criteriaSources(schedule, number) {
      const next = { ...schedule }, citations = [];
      for (const key of ['achieved', 'merit', 'excellence']) {
        if (typeof next[key] !== 'string') continue;
        const match = /\r?\n\r?\n(Source: NZQA, Achievement Standard [^\r\n]+)$/.exec(next[key]);
        if (match && nzqaCriteriaCitation(match[1], number)) {
          citations.push(match[1]);
          next[key] = next[key].slice(0, match.index);
        }
      }
      if (Array.isArray(next.requirements)) next.requirements = next.requirements.map(row => {
        if (typeof row.requirement !== 'string') return row;
        const source = /\r?\n\r?\n(Source: NZQA, Achievement Standard [^\r\n]+)$/.exec(row.requirement);
        if (!source || !nzqaCriteriaCitation(source[1], number)) return row;
        citations.push(source[1]);
        let requirement = row.requirement.slice(0, source.index);
        const context = /^([^\r\n]+\binvolves:)\r?\n([\s\S]+)$/i.exec(requirement);
        let level = row.level;
        if (context && /^[\u2022\u25cf\uf0b7]\s/.test(context[2])) {
          if (!level) level = requirementLevel(context[1], next);
          requirement = context[2];
          if (!/\r?\n[\u2022\u25cf\uf0b7]\s/.test(requirement)) requirement = requirement.replace(/^[\u2022\u25cf\uf0b7]\s*/, '');
        }
        return { ...row, requirement, ...(level ? { level } : {}) };
      });
      next.notes = appendCitations(next.notes, citations);
      if (!next.notes && schedule.notes === undefined) delete next.notes;
      if ((next.notes || '').length > 8000 || JSON.stringify(next).length > 20000) {
        throw new Error('The NZQA source cannot be moved to Supporting notes because the schedule is full. Shorten the notes and reopen the schedule; existing text is unchanged.');
      }
      return next;
    }
    async function persist() {
      if (!await saveNow()) throw new Error('The latest form changes are not saved. Resolve the database save error before continuing.');
    }
    function button(label, callback, parent = area, tone = '') {
      const node = el('button', label, { type: 'button', ...(tone ? { class: 'moderation-button-' + tone } : {}) });
      node.addEventListener('click', callback); parent.append(node); return node;
    }
    function input(definition, value, onChange, parent, idPrefix = '', autoGrow = false) {
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
      let mirror;
      if (autoGrow && kind === 'area') {
        wrapper.setAttribute('class', 'planner-field moderation-autogrow');
        mirror = el('div', control.value, { class: 'moderation-autogrow-mirror', 'aria-hidden': 'true' });
      }
      const handleChange = () => { if (mirror) mirror.textContent = control.value; onChange(control.value); };
      control.addEventListener('input', handleChange);
      control.addEventListener('change', handleChange);
      wrapper.append(el('label', label, { for: id }), control);
      if (mirror) wrapper.append(mirror);
      parent.append(wrapper);
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
    let refreshFolder = () => {}, refreshRetention = () => {}, refreshLibraryCourses = () => {};
    function standardFolderMetadata(folder, root, level, number) {
      return JSON.stringify({ id: folder.id, root, level, number });
    }
    function standardFolderPath(level, number, topic) {
      return topic ? [String(year), topic, 'Level ' + level + ' - ' + number] : ['Level ' + level, number];
    }
    async function ensureStandardFolder(folderId, level, number, topic) {
      if (!topic) return access.ensureAssessmentFolders(folderId, level, number);
      const topicFolder = await access.ensureAssessmentTopicFolder(folderId, Number(year), topic);
      return access.ensureTopicStandardFolder(topicFolder.id, level, number);
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
        [hidden.folderName.value, ...standardFolderPath(folder.level, folder.number, hidden.topic.value)].filter(Boolean).join(' / '),
        'https://drive.google.com/drive/folders/' + folder.id
      ].join('\n') : '';
      if (values.internal.retentionLocation === location) return false;
      values.internal.retentionLocation = location;
      values.internal.retentionAutoProcessed = '';
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
        const topic = hidden.topic.value && Array.isArray(hierarchy.topics)
          ? hierarchy.topics.find(item => item.name === hidden.topic.value) : null;
        let matches;
        if (topic && Array.isArray(topic.standards)) {
          matches = topic.standards.filter(folder => folder.level === level && folder.number === number);
        } else {
          const folders = topic ? topic.levels?.[level]?.standards : hierarchy.levels?.[level]?.standards;
          if (folders === undefined) return;
          if (!Array.isArray(folders)) throw new Error('The saved standard-folder list is invalid.');
          matches = folders.filter(folder => folder.name === number);
        }
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
      const standard = await ensureStandardFolder(folderId, hidden.level.value, hidden.standardNumber.value, hidden.topic.value);
      if (data.parentRecord) {
        const parent = await request(year + '/moderation/' + data.parentRecord);
        const samples = JSON.parse(parent.content.internal || '{}').samples || [];
        if (data.additionalMarking === 'Yes') {
          const students = JSON.parse(parent.content.markingStudents || '[]');
          const matches = students.filter(item => item.record === record);
          if (matches.length !== 1) {
            throw new Error('This student must match exactly one entry in the parent marking record before preparing a folder.');
          }
          const student = await access.ensureAdditionalStudentFolder(standard.id, record, matches[0].initials);
          rememberStandardFolder(standard, folderId);
          return student;
        }
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
      function readTopicNames() {
        const topics = JSON.parse(hidden.folderTopics.value || '[]');
        if (!Array.isArray(topics)) throw new Error('The saved topic list is invalid.');
        return topics;
      }
      async function saveHierarchy(root) {
        if (!options.setupOnly) return;
        const topics = readTopicNames();
        const hierarchy = await access.assessmentYearFolderLinks(root, Number(year), topics);
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
        if (!confirm('Use "' + folder.name + '" as the main folder? New folders for ' + year +
            ' will be created under each topic when you prepare them. Files inherit this folder’s sharing permissions. Existing documents will not be moved.')) return;
        const previous = { folderId: hidden.folderId.value, folderName: hidden.folderName.value,
          standardFolder: hidden.standardFolder?.value, internal: hidden.internal?.value };
        update('folderId', folder.id); update('folderName', folder.name);
        if (record && hidden.level.value && hidden.standardNumber.value) {
          try { await prepareRecordFolders(folder.id); }
          catch (error) {
            update('folderId', previous.folderId); update('folderName', previous.folderName);
            if (previous.standardFolder !== undefined) update('standardFolder', previous.standardFolder);
            if (previous.internal !== undefined) update('internal', previous.internal);
            throw error;
          }
        }
        refresh(); refreshHierarchy();
        if (record) { fillRetentionLocation(); refreshFolder(); }
        await persist();
        message(record ? 'Main folder saved. New documents will use this record’s year / topic / level folder.' :
          'Main folder saved. Add topics, then prepare the year folders. Existing documents will not be moved.');
      }, parent);
      let prepareParent = parent;
      if (options.setupOnly) {
        const topicPanel = el('section', '', { class: 'moderation-topic-setup' });
        topicPanel.append(el('h4', 'Topics for ' + year),
          el('p', 'Add the topic folder names you need for this year. Standard folders are created inside each topic as "Level 2 - 91892". Use Sync existing folders to add the topics already in your ' + year + ' Drive folder.'));
        const topicControls = el('div', '', { class: 'moderation-topic-controls' });
        const topicInput = el('input', '', { id: 'moderation-topic-name', type: 'text', maxlength: '80', autocomplete: 'off' });
        topicControls.append(el('label', 'Topic folder name', { for: 'moderation-topic-name' }), topicInput);
        const topicList = el('ul', '', { class: 'moderation-topic-list' });
        const topicStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
        let renderTopics = () => {};
        button('Add topic', async () => {
          let topics;
          try { topics = readTopicNames(); }
          catch (error) { topicStatus.textContent = error.message; topicStatus.setAttribute('role', 'alert'); return; }
          const name = topicInput.value.trim();
          if (!name || name.length > 80 || name === '.' || name === '..' || /[\/\\\u0000-\u001f\u007f]/.test(name)) {
            topicStatus.textContent = 'Enter a topic name of 1 to 80 characters without slashes.';
            topicStatus.setAttribute('role', 'alert'); topicInput.focus(); return;
          }
          if (topics.some(topic => topic.toLocaleLowerCase('en-NZ') === name.toLocaleLowerCase('en-NZ'))) {
            topicStatus.textContent = 'That topic has already been added.';
            topicStatus.setAttribute('role', 'alert'); topicInput.focus(); return;
          }
          if (topics.length >= 30) {
            topicStatus.textContent = 'Add no more than 30 topics for each year.';
            topicStatus.setAttribute('role', 'alert'); return;
          }
          const previous = hidden.folderTopics.value;
          update('folderTopics', JSON.stringify([...topics, name]));
          try {
            await persist(); topicInput.value = ''; topicStatus.textContent = 'Topic added.';
            topicStatus.setAttribute('role', 'status'); renderTopics(); refreshHierarchy();
          } catch (error) {
            update('folderTopics', previous); topicStatus.textContent = error.message;
            topicStatus.setAttribute('role', 'alert'); renderTopics();
          }
        }, topicControls);
        const syncControls = el('div', '', { class: 'moderation-topic-controls' });
        topicPanel.append(topicControls, syncControls, topicList, topicStatus);
        prepareParent = syncControls;
        driveButton('Sync existing folders', async () => {
          if (!hidden.folderId.value) throw new Error('Choose your main Assessment / Moderation folder first.');
          const result = await access.syncAssessmentYearFolders(hidden.folderId.value, Number(year), readTopicNames());
          if (!result || !result.links.topics.length) {
            throw new Error('No topic folders were found in ' + (hidden.folderName.value || 'your main folder') + ' / ' + year +
              '. Nothing was created or changed.');
          }
          const previous = { topics: hidden.folderTopics.value, links: hidden.folderLinks.value };
          try {
            update('folderTopics', JSON.stringify(result.topics));
            update('folderLinks', JSON.stringify(result.links));
            await persist();
          } catch (error) {
            update('folderTopics', previous.topics); update('folderLinks', previous.links);
            renderTopics(); refreshHierarchy();
            throw error;
          }
          renderTopics(); refreshHierarchy();
          const linkedTopics = result.links.topics;
          const standards = linkedTopics.reduce((total, topic) => total + topic.standards.length, 0);
          message('Synced ' + linkedTopics.length + ' topic folder' + (linkedTopics.length === 1 ? '' : 's') + ' and ' + standards +
            ' standard folder' + (standards === 1 ? '' : 's') + ' for ' + year + '. Nothing was created; existing folders and documents were not moved.');
        }, syncControls);
        renderTopics = () => {
          topicList.replaceChildren();
          let topics;
          try { topics = readTopicNames(); }
          catch (error) { topicStatus.textContent = error.message; topicStatus.setAttribute('role', 'alert'); return; }
          if (!topics.length) topicList.append(el('li', 'No topics added for ' + year + ' yet.'));
          for (const name of topics) {
            const item = el('li', '', { class: 'moderation-topic-item' });
            item.append(el('span', name), button('Remove', async () => {
              if (!confirm('Remove "' + name + '" from the topic list? Its Drive folder and existing records will not be deleted or moved.')) return;
              const previous = hidden.folderTopics.value;
              update('folderTopics', JSON.stringify(topics.filter(topic => topic !== name)));
              try {
                await persist(); topicStatus.textContent = 'Topic removed from future assignments. Existing folders and records are unchanged.';
                topicStatus.setAttribute('role', 'status'); renderTopics(); refreshHierarchy();
              } catch (error) {
                update('folderTopics', previous); topicStatus.textContent = error.message;
                topicStatus.setAttribute('role', 'alert'); renderTopics();
              }
            }, item, 'danger'));
            topicList.append(item);
          }
        };
        parent.append(topicPanel);
        renderTopics();
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
            hierarchy.append(el('p', 'Sync existing folders, or add topics and prepare year / topic folders, to show their links here.'));
            return;
          }
          const folderButton = (title, id) => el('a', title, {
            href: 'https://drive.google.com/drive/folders/' + id, target: '_blank', rel: 'noopener noreferrer',
            class: 'moderation-folder-button'
          });
          if (Array.isArray(saved.topics)) {
            const yearHeading = el('h3');
            yearHeading.append(folderButton('Year ' + saved.year.name, saved.year.id)); hierarchy.append(yearHeading);
            let configured;
            try { configured = new Set(readTopicNames().map(topic => topic.toLocaleLowerCase('en-NZ'))); }
            catch (error) { hierarchy.append(el('p', error.message, { role: 'alert' })); return; }
            if (saved.topics.some(topic => !configured.has(topic.name.toLocaleLowerCase('en-NZ'))) ||
                configured.size !== saved.topics.length) {
              hierarchy.append(el('p', 'The topic list has changed. Prepare folders again to update it; existing folders and documents will not be moved.'));
            }
            for (const topic of saved.topics) {
              const topicGroup = el('section', '', { class: 'moderation-folder-topic' });
              const topicHeading = el('h4');
              topicHeading.append(folderButton(topic.name, topic.id)); topicGroup.append(topicHeading);
              if (Array.isArray(topic.standards)) {
                const standards = el('div', '', { class: 'moderation-folder-standards' });
                for (const standard of topic.standards) {
                  standards.append(folderButton('Level ' + standard.level + ' - ' + standard.number, standard.id));
                }
                if (!topic.standards.length) standards.append(el('p', 'No standard folders yet.'));
                topicGroup.append(standards); hierarchy.append(topicGroup);
                continue;
              }
              for (const level of ['1', '2', '3']) {
                const group = el('section', '', { class: 'moderation-folder-level' });
                const folder = topic.levels[level];
                const heading = el('h5');
                heading.append(folderButton('Level ' + level, folder.id)); group.append(heading);
                const standards = el('div', '', { class: 'moderation-folder-standards' });
                for (const standard of folder.standards) standards.append(folderButton(standard.name, standard.id));
                if (!folder.standards.length) standards.append(el('p', 'No standard folders yet.'));
                group.append(standards); topicGroup.append(group);
              }
              hierarchy.append(topicGroup);
            }
          } else {
            hierarchy.append(el('p', 'Previously prepared top-level folders. New year and topic folders will be created separately; existing folders and documents will not be moved.'));
            for (const level of ['1', '2', '3']) {
              const group = el('section', '', { class: 'moderation-folder-level' });
              const folder = saved.levels[level];
              const heading = el('h4');
              heading.append(folderButton('Level ' + level, folder.id)); group.append(heading);
              const standards = el('div', '', { class: 'moderation-folder-standards' });
              for (const standard of folder.standards) standards.append(folderButton(standard.name, standard.id));
              if (!folder.standards.length) standards.append(el('p', 'No standard folders yet.'));
              group.append(standards); hierarchy.append(group);
            }
          }
        };
        refreshHierarchy();
      }
      if (record) {
        const standardLabel = el('p'), standardLink = el('a', '', { target: '_blank', rel: 'noopener noreferrer' });
        standardLabel.append(standardLink); parent.append(standardLabel);
        refreshFolder = () => {
          const folder = currentStandardFolder();
          standardLink.textContent = standardFolderPath(hidden.level.value, hidden.standardNumber.value, hidden.topic.value).join(' / ') +
            (folder ? '' : ' (prepare folders to link)');
          if (folder) standardLink.href = 'https://drive.google.com/drive/folders/' + folder.id;
          else standardLink.removeAttribute('href');
        };
        refreshFolder();
      }
      driveButton(options.setupOnly ? 'Prepare year / topic folders' : 'Prepare level / standard folders', async () => {
        if (!hidden.folderId.value) throw new Error('Choose your main Assessment / Moderation folder first.');
        await persist();
        const folder = await access.metadata(hidden.folderId.value);
        if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) {
          throw new Error('The selected main folder cannot accept files. Choose an editable folder.');
        }
        if (options.setupOnly) await saveHierarchy(hidden.folderId.value);
        else if (record) await prepareRecordFolders();
        await persist();
        message((options.setupOnly ? 'Year and topic folders' : 'Folders') +
          (record ? ', the standard folder and entry student folders' : '') +
          ' are ready. Student folders use entry order, without names or initials. Existing files have not been moved.');
      }, prepareParent);
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
    if (options.setupOnly) {
      field('folderTopics', data.folderTopics || '[]');
      field('folderLinks', data.folderLinks || '');
    } else field('topic', data.topic || '');
    if (record) field('standardFolder', data.standardFolder || '');
    if (options.setupOnly) {
      const folderYear = el('input', '', { id: 'moderation-folder-year', type: 'number', min: '2000', max: '2100', value: String(year) });
      const yearControl = el('div', '', { class: 'moderation-folder-year' });
      yearControl.append(el('label', 'Folder year', { for: 'moderation-folder-year' }), folderYear);
      async function openYear(selectedYear) {
        if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) {
          message('Choose a year from 2000 to 2100.', true); folderYear.focus(); return;
        }
        if (typeof options.changeYear !== 'function') {
          message('Year selection is unavailable. Reload the page and retry.', true); return;
        }
        try {
          if (!hidden.folderId.value) {
            await options.changeYear(selectedYear);
            return;
          }
          if (!access) { message('Google Drive is not ready. Retry Google Drive setup before opening the year folder.', true); return; }
          await operate(async () => {
            await persist();
            const path = selectedYear + '/moderation/main';
            const target = await request(path);
            const root = target.content.folderId || hidden.folderId.value;
            const yearLinks = await access.assessmentYearFolderLinks(root, selectedYear, []);
            let existingLinks;
            try { existingLinks = JSON.parse(target.content.folderLinks || 'null'); }
            catch { throw new Error('The saved folder links for this year could not be read. They have not been changed.'); }
            if (existingLinks?.root === root && existingLinks.year?.id === yearLinks.year.id && Array.isArray(existingLinks.topics)) {
              yearLinks.topics = existingLinks.topics;
            }
            const content = { ...target.content, folderId: root,
              folderName: target.content.folderName || hidden.folderName.value,
              folderLinks: JSON.stringify(yearLinks) };
            await options.mutate(path, { content, revision: target.revision });
            await options.changeYear(selectedYear);
          });
        }
        catch (error) { message(error.message, true); }
      }
      button('Open year', () => openYear(Number(folderYear.value)), yearControl);
      area.append(el('h2', 'Setup Moderation', { class: 'paper-heading' }), yearControl,
        el('p', 'Keep a record for an assessment or individual student. Each record links to four separate document forms. Form data saves privately to the database; documents and supporting files stay in your Google Drive. Nothing is saved in browser storage.'),
        el('p', 'Select a folder appropriate for student assessment information. Add topics for ' + year +
          ' and prepare folders as Year / Topic / Level N - Standard. A shared folder gives its members access to documents created there.'));
      const folder = el('section', '', { class: 'moderation-panel' });
      folder.append(el('h3', 'My Assessment and Moderation folder'));
      area.append(folder, feedback); showFolder(folder); prepareDrive(); return { openYear };
    }
    const contentsPage = page === 'marking' ? 'overview' : documents[page] ? page : 'internal';
    const tabs = el('nav', '', { class: 'moderation-tabs', 'aria-label': 'Year moderation contents', 'data-planner-navigation': '' });
    for (const [key, title] of [['overview', 'Records'], ['internal', 'Internal Moderation'],
      ['schedule', 'Marking Schedule'], ['feedback', 'Marking Confirmation & Feedback'], ['coversheet', 'WHS Coversheet'], ['verifiers', 'Verifiers']]) {
      const tab = button(title, () => navigate('', key).catch(error => message(error.message, true)), tabs);
      if (key === (record ? contentsPage : page)) tab.setAttribute('aria-current', 'page');
    }
    area.append(tabs);
    if (!record) {
      const reusable = {
        feedback: { title: 'Confirmation & Feedback', url: options.feedbackTemplateUrl, filename: 'confirmation-feedback-template.docx',
          action: 'Create / open Confirmation & Feedback', existing: 'Existing assessment-level feedback remains available through Records.' },
        schedule: { title: 'Marking Schedule', url: options.scheduleTemplateUrl, filename: 'marking-schedule-template.docx',
          action: 'Create / open marking schedule', existing: 'Existing standard-specific instructions and criteria remain available through Records → Internal Moderation Marking Schedules. Fill in the correct criteria for each standard before using a completed schedule.' },
        coversheet: { title: 'WHS Coversheet', url: options.coversheetTemplateUrl, filename: 'whs-coversheet-template.docx',
          existing: 'Existing assessment-level coversheets remain available through Records.' }
      }[page];
      area.append(el('h2', page === 'verifiers' ? 'Verifiers — shared across years' : 'Moderation — ' + year, { class: 'paper-heading' }));
      area.append(el('p', page === 'verifiers'
        ? 'Manage shared contacts and view authorised moderation history across years. Email selection uses your records for ' + year + '.'
        : reusable
        ? 'Use the same blank ' + reusable.title + ' template for every standard. Keep a separate completed sheet for each student and standard.'
        : 'Choose a record below to open its form. Use the tabs above to browse this year’s other document types.'));
      if (reusable) {
        const template = el('section', '', { class: 'moderation-panel' });
        template.append(el('h3', 'Reusable ' + reusable.title + ' template'),
          el('p', 'This blank template has no student, standard or assessment results filled in. Use it for any standard; it is not a separate template for each assessment.'),
          el('a', 'Download blank ' + reusable.title + ' template', { href: reusable.url, download: reusable.filename }),
          el('p', (page === 'coversheet'
            ? 'Open a student WHS Coversheet from the list below. If the student is not listed, create their marking schedule in Internal Moderation first, then return to this tab. '
            : 'To create or open a student sheet, use Internal Moderation → ' + reusable.action + ' for that student. ') +
            'You can then import a completed copy or create a Google Drive document. ' + reusable.existing));
        area.append(template);
      }
      if (page === 'overview') area.append(el('p', 'Your main Assessment and Moderation folder is managed in Setup Moderation.'));
      const create = el('section', '', { class: 'moderation-panel', 'data-planner-navigation': '' });
      create.append(el('h3', 'New moderation record'));
      const standard = el('select', '', { id: 'moderation-new-standard', 'aria-label': 'Use a standard from My Standards' });
      standard.append(el('option', 'Choose from My Standards', { value: '' }));
      create.append(el('label', 'Use a standard from My Standards', { for: 'moderation-new-standard' }), standard);
      const standardsStatus = el('p', 'Loading My Standards…', { role: 'status' });
      create.append(standardsStatus, el('p', 'Creating a record checks the NZQA PDF version and creates or reuses its numbered folder under the standard’s assigned topic and level. Google Drive permission is required.'));
      let standards = [];
      const createButton = button('Create moderation record', async () => {
        if (working) return;
        const selected = standards.find(item => item.number === standard.value);
        if (!selected) { message('Choose a standard from My Standards before creating a moderation record.', true); standard.focus(); return; }
        if (!hidden.folderId.value) { message('Choose your main Assessment / Moderation folder before creating a record.', true); return; }
        if (!access) { message('Google Drive is not ready. Retry Google Drive setup before creating the standard folder.', true); return; }
        working = true; area.inert = true; area.dataset.moderationBusy = 'true'; createButton.disabled = true;
        try {
          const setup = await request(year + '/moderation/main');
          let topics;
          try { topics = JSON.parse(setup.content.folderTopics || '[]'); }
          catch { throw new Error('Saved moderation topics could not be read. Reopen Setup Moderation and retry.'); }
          let topic = selected.topic;
          if (!topic) {
            // Use the synced Drive layout when exactly one topic folder already holds this standard.
            let links = null;
            try { links = JSON.parse(setup.content.folderLinks || 'null'); } catch {}
            const holders = links && links.root === hidden.folderId.value && Array.isArray(links.topics)
              ? links.topics.filter(item => Array.isArray(item.standards) && item.standards.some(entry => entry.number === selected.number))
              : [];
            if (holders.length !== 1) {
              throw new Error(holders.length ? 'Standard ' + selected.number + ' has folders in more than one topic. Choose its topic in Setup Assessment.'
                : 'Choose a topic for this standard in Setup Assessment, or sync its existing folder in Setup Moderation.');
            }
            topic = holders[0].name;
          }
          if (!Array.isArray(topics) || !topics.includes(topic)) {
            throw new Error('This standard’s topic is not configured for the current year. Add it in Setup Moderation or assign the standard to a configured topic in Setup Assessment.');
          }
          await access.authorize();
          await persist();
          const metadata = await request('standards/' + selected.number + '/details');
          if (!metadata.level || !metadata.version) throw new Error('NZQA did not return the level and PDF version for this standard. Retry shortly.');
          const standardFolder = await ensureStandardFolder(hidden.folderId.value, metadata.level, selected.number, topic);
          const id = crypto.randomUUID();
          const content = { title: selected.number + ' — ' + selected.title, folderId: hidden.folderId.value, folderName: hidden.folderName.value,
            standardNumber: selected.number, standardTitle: selected.title, subject: selected.subject,
            credits: selected.credits.replace(/\s*credits?$/i, '').trim(), level: metadata.level, topic,
            version: metadata.version, assessors: assessorName,
            standardFolder: standardFolderMetadata(standardFolder, hidden.folderId.value, metadata.level, selected.number),
            internal: JSON.stringify({ retentionLocation: [
              [hidden.folderName.value, ...standardFolderPath(metadata.level, selected.number, topic)].filter(Boolean).join(' / '),
              'https://drive.google.com/drive/folders/' + standardFolder.id
            ].join('\n') }) };
          await mutate(year + '/moderation/' + id, { content, revision: 0 });
          delete area.dataset.moderationBusy; working = false;
          await navigate(id, 'overview');
        } catch (error) { console.error('Moderation record creation failed.'); message(error.message, true); }
        finally { delete area.dataset.moderationBusy; area.inert = false; working = false; createButton.disabled = false; }
      }, create);
      const listing = el('section', '', { class: 'moderation-panel' });
      const listTitle = page === 'verifiers' ? 'Verifiers' : page === 'overview' ? 'Marking Records'
        : (reusable ? 'Student ' + reusable.title + ' forms' : page === 'internal' ? 'Internal Moderation' : documents[page].title) + ' — ' + year;
      listing.append(el('h3', listTitle), el('p', 'Loading records…', { role: 'status' }));
      if (page === 'overview') area.append(create);
      else {
        create.hidden = true;
      }
      area.append(listing, feedback);
      const emailPanel = el('section', '', { class: 'moderation-panel moderation-email', 'aria-label': 'Email verifier' });
      for (const type of ['input', 'change']) emailPanel.addEventListener(type, event => event.stopPropagation());
      emailPanel.hidden = true; area.append(emailPanel);
      let emailVerifier;
      function chooseVerifierRecords(records) {
        emailPanel.hidden = false;
        emailPanel.replaceChildren(el('h3', 'Email verifier'),
          el('p', 'Choose the internal moderation sheets to include. Only existing Drive document links are included; no email is sent by this app. Update the sheets in Drive first if their saved forms have changed.'));
        const choices = el('fieldset');
        choices.append(el('legend', 'Moderation records to include'));
        const selections = records.map(item => {
          const id = 'moderation-email-record-' + item.entry_key;
          const box = el('input', '', { type: 'checkbox', id });
          box.type = 'checkbox';
          const row = el('div', '', { class: 'moderation-check' });
          row.append(box, el('label', item.title || item.standard_number || 'Untitled assessment', { for: id }));
          choices.append(row);
          return { box, item };
        });
        const status = el('p', '', { role: 'status' });
        emailPanel.append(choices, status);
        const prepare = button('Prepare verifier email', async () => {
          const selected = selections.filter(entry => entry.box.checked);
          if (!selected.length) { status.textContent = 'Select at least one moderation record.'; status.setAttribute('role', 'alert'); return; }
          prepare.disabled = true; choices.disabled = true;
          status.textContent = 'Loading selected moderation sheets...'; status.setAttribute('role', 'status');
          try {
            const sheets = await Promise.all(selected.map(async ({ item }) => {
              const saved = await request(year + '/moderation/' + encodeURIComponent(item.entry_key));
              const content = saved.content;
              if (!saved.revision || !content || content.parentRecord) throw new Error('Reopen Records: ' + (item.title || item.entry_key) + ' is no longer an assessment record.');
              let links, internal;
              try { links = JSON.parse(content.driveDocuments || '{}'); internal = JSON.parse(content.internal || '{}'); }
              catch { throw new Error('Saved document links or samples could not be read for ' + (item.title || item.entry_key) + '. Open its Internal Moderation sheet to resolve this.'); }
              const file = links?.internal;
              if (!file || !/^[A-Za-z0-9_-]{10,}$/.test(file.id || '') || ![GOOGLE_DOC, DOCX].includes(file.mimeType)) {
                throw new Error('Create or link the Internal Moderation Drive document for ' + (item.title || item.entry_key) + ', then try again.');
              }
              if (!/^(?:[1-9]|10)$/.test(content.level || '')) throw new Error('Record a valid level for ' + (item.title || item.entry_key) + ' before preparing this email.');
              if (!internal || typeof internal !== 'object' || Array.isArray(internal) ||
                  internal.samples !== undefined && !Array.isArray(internal.samples)) throw new Error('Saved samples could not be read for ' + (item.title || item.entry_key) + '.');
              return { content, internal, title: [content.standardNumber, content.standardTitle || content.title || 'Internal Moderation Sheet'].filter(Boolean).join(' - '),
                url: file.mimeType === GOOGLE_DOC ? 'https://docs.google.com/document/d/' + file.id + '/edit' : 'https://drive.google.com/file/d/' + file.id + '/view' };
            }));
            if (area.isConnected && prepare.isConnected && !emailPanel.hidden) renderVerifierEmail(records, sheets);
          } catch (error) {
            console.error('Verifier email preparation failed.');
            status.textContent = error.message; status.setAttribute('role', 'alert');
          } finally { prepare.disabled = false; choices.disabled = false; }
        }, emailPanel);
        button('Cancel email', () => { emailPanel.hidden = true; emailPanel.replaceChildren(); }, emailPanel);
        selections[0].box.focus();
      }
      function renderVerifierEmail(records, sheets) {
        emailPanel.replaceChildren(el('h3', 'Review verifier email'),
          el('p', 'Check the recipient and student counts. Counts start from distinct sample names in the selected sheets, not class rolls; adjust them if needed. Links keep their existing Drive permissions: ensure your verifier has access.'),
          el('p', 'Gmail opens an editable draft with plain-text headings and links. Add any formatting or Drive link cards in Gmail, then send it yourself. This app does not change sharing or mark moderation as complete.'));
        const fields = el('div', '', { class: 'moderation-fields' });
        emailPanel.append(fields);
        const names = [...new Set(sheets.map(sheet => (sheet.internal.verifierName || '').trim()).filter(Boolean))];
        const recipient = input(['recipient', 'Verifier email'], emailVerifier?.email || '', refresh, fields, 'email-');
        recipient.type = 'email';
        const subject = input(['subject', 'Email subject'], 'Internal moderation for verification - ' + year, refresh, fields, 'email-');
        const greeting = input(['greeting', 'Greeting'], emailVerifier ? 'Kia ora ' + emailVerifier.name + ',' : names.length === 1 ? 'Kia ora ' + names[0] + ',' : 'Kia ora,', refresh, fields, 'email-');
        const introduction = input(['introduction', 'Introduction / request', 'area'],
          'Could you please verify the internal moderation sheets linked below? Please let me know if you have any questions or would like to discuss any of the judgements. Thank you for your help.', refresh, fields, 'email-');
        const closing = input(['closing', 'Closing / signature', 'area'], 'Kind regards,\n' + assessorName, refresh, fields, 'email-');
        const levels = [...new Set(sheets.map(sheet => sheet.content.level))].sort((a, b) => Number(a) - Number(b));
        const counts = new Map(levels.map(level => {
          const names = new Set(sheets.filter(sheet => sheet.content.level === level).flatMap(sheet =>
            (sheet.internal.samples || []).map(sample => String(sample.student || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NZ')).filter(Boolean)));
          const control = input(['count-' + level, 'Level ' + level + ' student count'], String(names.size), refresh, fields, 'email-');
          control.type = 'number'; control.min = '0'; control.step = '1';
          return [level, control];
        }));
        const preview = el('section', '', { class: 'moderation-email-preview', 'aria-label': 'Verifier email preview' });
        const status = el('p', '', { role: 'status' });
        const draft = el('a', 'Open Gmail draft', { target: '_blank', rel: 'noopener noreferrer' });
        emailPanel.append(preview, status, draft);
        function refresh() {
          preview.replaceChildren(el('h4', subject.value), el('p', greeting.value), el('p', introduction.value));
          const body = [greeting.value, introduction.value];
          let validCounts = true;
          for (const level of levels) {
            const value = counts.get(level).value.trim();
            if (!/^\d{1,5}$/.test(value)) validCounts = false;
            const heading = 'Level ' + level + ': ' + value + (Number(value) === 1 ? ' student' : ' students');
            preview.append(el('h4', heading)); body.push(heading);
            for (const sheet of sheets.filter(sheet => sheet.content.level === level)) {
              const line = el('p');
              line.append(el('a', sheet.title, { href: sheet.url, target: '_blank', rel: 'noopener noreferrer' }));
              preview.append(line); body.push(sheet.title + '\n' + sheet.url);
            }
          }
          preview.append(el('p', closing.value)); body.push(closing.value);
          const email = recipient.value.trim();
          const error = !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ? 'Enter one valid verifier email address.'
            : !subject.value.trim() ? 'Enter an email subject.' : !validCounts ? 'Enter a whole student count from 0 to 99999 for each level.' : '';
          status.textContent = error || 'Ready to review in Gmail. Nothing has been sent.';
          status.setAttribute('role', error ? 'alert' : 'status');
          draft.hidden = Boolean(error);
          if (error) draft.removeAttribute('href');
          else {
            const parameters = new URLSearchParams({ view: 'cm', fs: '1', to: email, su: subject.value, body: body.filter(Boolean).join('\n\n') });
            if (options.userEmail) parameters.set('authuser', options.userEmail);
            draft.setAttribute('href', 'https://mail.google.com/mail/?' + parameters);
          }
        }
        button('Change selected records', () => chooseVerifierRecords(records), emailPanel);
        button('Cancel email', () => { emailPanel.hidden = true; emailPanel.replaceChildren(); }, emailPanel);
        refresh(); recipient.focus();
      }
      async function loadRecords() {
        try {
          const result = await request('moderation/' + year);
          if (!area.isConnected) return;
          listing.replaceChildren(el('h3', listTitle));
          const records = result.records.filter(item => reusable ? item.parent_record : page !== 'internal' || !item.parent_record);
          if (!records.length) listing.append(el('p', reusable
            ? 'No student ' + reusable.title + ' forms yet. Use Internal Moderation to create a separate sheet for each student and standard.'
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
            table.append(el('caption', 'Marking Records — ' + year));
            const head = el('thead'), headings = el('tr');
            for (const title of ['Standard Number', 'Standard Marking Record', 'Internal Moderation Sheet', 'Internal Moderation Marking Schedules']) {
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
              const marking = el('td'), markingList = el('ul');
              for (const assessment of assessments) {
                const entry = el('li');
                entry.append(recordLink(assessment, 'marking', assessments.length === 1 ? 'Open' : 'Open — ' + (assessment.title || 'Untitled assessment')));
                markingList.append(entry);
              }
              marking.append(assessments.length ? markingList : el('p', 'No assessment record'));
              row.append(marking);
              const internal = el('td'), internalList = el('ul');
              for (const assessment of assessments) {
                const entry = el('li');
                entry.append(recordLink(assessment, 'internal', assessments.length === 1 ? 'Open' : 'Open — ' + (assessment.title || 'Untitled assessment')));
                internalList.append(entry);
              }
              internal.append(assessments.length ? internalList : el('p', 'No assessment record'));
              row.append(internal);
              const linkedAdditional = new Set();
              for (const assessment of assessments.filter(parent =>
                students.some(item => item.parent_record === parent.entry_key && item.additional_marking === 'Yes'))) {
                const parent = await request(year + '/moderation/' + assessment.entry_key);
                const samples = JSON.parse(parent.content.internal || '{}').samples || [];
                for (const sample of samples) if (sample.markingScheduleRecord) linkedAdditional.add(sample.markingScheduleRecord);
              }
              for (const target of ['schedule']) {
                const cell = el('td'), list = el('ul');
                for (const item of [...assessments, ...students.filter(item =>
                  item.additional_marking !== 'Yes' || linkedAdditional.has(item.entry_key))]) {
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
      if (page === 'verifiers') {
        return globalThis.assessmentVerifiers.mount(listing, {
          el, request, mutate, year,
          onEmail: async verifier => {
            const result = await request('moderation/' + year);
            const records = result.records.filter(item => !item.parent_record);
            if (!records.length) throw new Error('No assessment records are available for ' + year + '. Create a record from Records first.');
            emailVerifier = verifier;
            chooseVerifierRecords(records);
          }
        });
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
          const levels = ['1', '2', '3'];
          const groups = levels.map(level => ['Level ' + level, standards.filter(item => String(item.level).trim() === level)]);
          groups.push(['Other / level not recorded', standards.filter(item => !levels.includes(String(item.level).trim()))]);
          for (const [label, items] of groups) {
            if (!items.length) continue;
            const group = el('optgroup', '', { label });
            for (const item of items) group.append(el('option', item.number + ' — ' + item.title, { value: item.number }));
            standard.append(group);
          }
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
    field('resourceLibrary', data.resourceLibrary || '');
    field('resourceLibraryId', data.resourceLibraryId || '');
    if (data.courseLibraryInitialized) field('courseLibraryInitialized', data.courseLibraryInitialized);
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
    let cleanedInternal = false, cleanedLibrarySource = false;
    const requirements = values.schedule.requirements;
    const cleanedSchedule = Array.isArray(requirements) && requirements.some(isSchedulePlaceholder);
    if (cleanedSchedule) values.schedule.requirements = requirements.filter(row => !isSchedulePlaceholder(row));
    let movedCriteriaSources = false, criteriaSourceError;
    if (page === 'schedule') {
      try {
        const cleaned = criteriaSources(values.schedule, hidden.standardNumber.value);
        movedCriteriaSources = JSON.stringify(cleaned) !== JSON.stringify(values.schedule);
        values.schedule = cleaned;
      } catch (error) { criteriaSourceError = error.message; }
    }
    for (const key of Object.keys(values.internal)) {
      const clean = internalFieldValue(key, values.internal[key]);
      if (clean !== values.internal[key]) { values.internal[key] = clean; cleanedInternal = true; }
    }
    if (!data.parentRecord && hidden.resourceLibrary.value && values.internal.source) {
      try {
        const saved = JSON.parse(hidden.resourceLibrary.value);
        if (globalThis.assessmentLibrarySchema.validSnapshot(saved) && values.internal.source === saved.source) {
          const clean = globalThis.assessmentLibrarySchema.moderationSource(saved);
          if (clean !== values.internal.source) { values.internal.source = clean; cleanedInternal = true; cleanedLibrarySource = true; }
        }
      } catch (error) {
        area.append(el('p', 'Saved library source could not be simplified: ' + error.message, { role: 'alert' }));
      }
    }
    if (!hidden.assessors.value && assessorName) {
      // Let the host finish loading before dispatching the autosave event.
      Promise.resolve().then(() => { if (area.isConnected && !hidden.assessors.value) update('assessors', assessorName); });
    }
    field('driveDocuments', JSON.stringify(links));
    if (page === 'marking' && !data.parentRecord) field('markingStudents', data.markingStudents || '[]');
    const contactEmail = (options.userEmail || '').trim();
    const fillContactEmail = page === 'feedback' && !values.feedback.contactEmail?.trim() && contactEmail;
    if (fillContactEmail) values.feedback.contactEmail = contactEmail;
    for (const key of Object.keys(documents)) field(key, JSON.stringify(values[key]));
    if (fillContactEmail) Promise.resolve().then(() => {
      if (area.isConnected) update('feedback', JSON.stringify(values.feedback));
    });
    if (cleanedInternal) Promise.resolve().then(() => {
      if (area.isConnected) {
        update('internal', JSON.stringify(values.internal));
        if (cleanedLibrarySource) message('Library source simplified. Original links, dates and modification notes remain in the library and saved selection.');
      }
    });
    if (cleanedSchedule || movedCriteriaSources || criteriaSourceError) Promise.resolve().then(() => {
      if (area.isConnected) {
        if (cleanedSchedule || movedCriteriaSources) update('schedule', JSON.stringify(values.schedule));
        if (criteriaSourceError) message(criteriaSourceError, true);
        else message(movedCriteriaSources ? 'NZQA sources moved to Supporting notes. Requirement text was simplified; existing marking is unchanged.' :
          'Template-only requirement rows removed. Actual requirements and marking are unchanged; autosave will save the corrected layout.');
      }
    });
    Promise.resolve().then(() => { if (area.isConnected) fillRetentionLocation(); });
    fillSetupFolderLink();
    const documentHeading = ['coversheet', 'feedback'].includes(page) ? documents[page].title : '';
    const headingTitle = documentHeading && data.title
      ? data.title.replace(/ — Marking Schedule$/, ' — ' + documentHeading) : data.title;
    const heading = el('h2', headingTitle || documentHeading || 'Moderation record', { class: 'paper-heading' });
    area.append(heading);
    if (data.parentRecord) {
      button('Back to Standard Marking Record', () => navigate(data.parentRecord, 'marking'));
    }
    if (page === 'marking' && !data.parentRecord) {
      let students;
      try {
        students = JSON.parse(hidden.markingStudents.value);
        if (!Array.isArray(students)) throw new Error('Invalid marking list');
      } catch {
        area.append(el('p', 'The saved marking list could not be read. Existing records are unchanged.', { role: 'alert' }));
        return;
      }
      const layout = el('div', '', { class: 'moderation-marking-layout' });
      const left = el('section', '', { class: 'moderation-panel' });
      const right = el('section', '', { class: 'moderation-panel' });
      const setup = el('section', '', { class: 'moderation-panel' });
      const roster = el('div'), moderation = el('div'), setupBody = el('div');
      left.append(el('h3', 'Standard Marking Record'),
        el('p', 'A linked Drive document shows that a link was saved, not that the file has been checked or is complete.'), roster);
      right.append(el('h3', 'Internal Moderation'), moderation);
      layout.append(left, right);
      setup.append(el('h3', 'Setup Marking'), el('p',
        'Load saved markbook PDF students, review the suggested initials and tick the students to add. The PDF is the source for this list; missing or ambiguous identities require review. Existing students and documents are never removed by a sync.'), setupBody);
      const markingTabs = el('nav', '', { class: 'moderation-tabs', 'aria-label': 'Standard marking pages' });
      const listTab = button('Standard Marking Record', () => showSetup(false), markingTabs);
      const setupTab = button('Setup Marking', () => showSetup(true), markingTabs);
      function showSetup(show) {
        layout.hidden = show; setup.hidden = !show;
        if (show) { setupTab.setAttribute('aria-current', 'page'); listTab.removeAttribute('aria-current'); }
        else { listTab.setAttribute('aria-current', 'page'); setupTab.removeAttribute('aria-current'); }
      }
      showSetup(false);
      area.append(markingTabs, layout, setup, feedback);
      for (const type of ['input', 'change']) {
        layout.addEventListener(type, event => event.stopPropagation());
        setup.addEventListener(type, event => event.stopPropagation());
      }
      const samples = () => values.internal.samples || [];
      let latestIds = null;
      let documentLinks = null, documentError = '';
      let documentStatuses = [];
      let linkedOnly = false;
      let markingSort = { key: 'last', direction: 'ascending' };
      let focusSort = '';
      const selectedForModeration = new Set();
      const filterLabel = el('label'), filter = el('input', '', { type: 'checkbox', 'aria-label': 'Show only students with linked documents' });
      const filterStatus = el('span', 'Checking document links…', { role: 'status' });
      filter.type = 'checkbox'; filter.disabled = true;
      filter.addEventListener('change', () => { linkedOnly = filter.checked; renderMarking(); });
      filterLabel.append(filter, el('span', 'Show only students with linked documents'));
      left.insertBefore(filterLabel, roster);
      left.insertBefore(filterStatus, roster);
      const compareMarking = (a, b) => a.localeCompare(b, 'en-NZ', { numeric: true, sensitivity: 'base' });
      function markingName(student) {
        const comma = student.name.indexOf(',');
        return comma < 0 ? { last: student.name, first: '' } :
          { last: student.name.slice(0, comma).trim(), first: student.name.slice(comma + 1).trim() };
      }
      function markingClass(student) {
        return [...(student.classes || [])].sort(compareMarking).join(', ');
      }
      function sortedMarkingStudents() {
        return [...students].sort((a, b) => {
          const aName = markingName(a), bName = markingName(b);
          const key = markingSort.key;
          const primary = key === 'class' ? compareMarking(markingClass(a), markingClass(b)) :
            compareMarking(aName[key], bName[key]);
          return (markingSort.direction === 'ascending' ? primary : -primary) ||
            compareMarking(aName.last, bName.last) || compareMarking(aName.first, bName.first) ||
            compareMarking(a.name, b.name);
        });
      }
      function renderDocumentStatus(node, student, target) {
        node.replaceChildren();
        if (documentError) { node.append(el('span', 'Document links unavailable; retry by reopening this page.', { role: 'alert' })); return; }
        if (!documentLinks) { node.append(el('span', 'Checking saved links…')); return; }
        const file = documentLinks.get(student.record)?.[target];
        if (!file) { node.append(el('span', 'No Drive document linked')); return; }
        if (!/^[\w-]{10,200}$/.test(file.id) || ![GOOGLE_DOC, DOCX].includes(file.mimeType)) {
          node.append(el('span', 'Saved document link is invalid; review the form.', { role: 'alert' })); return;
        }
        const href = file.mimeType === GOOGLE_DOC ? 'https://docs.google.com/document/d/' + file.id + '/edit' :
          'https://drive.google.com/file/d/' + file.id + '/view';
        node.append(el('a', 'Linked Drive document', { href, target: '_blank', rel: 'noopener noreferrer',
          'aria-label': 'Open linked ' + target + ' document for ' + student.name }));
      }
      function showDocumentStatus(parent, student, target) {
        const node = el('div');
        parent.append(node); documentStatuses.push({ node, student, target });
        renderDocumentStatus(node, student, target);
      }
      function savedStudents() { update('markingStudents', JSON.stringify(students)); }
      function sampleIndex(student) {
        const found = samples().map((sample, index) => sample.markingScheduleRecord === student.record ? index : -1)
          .filter(index => index >= 0);
        if (found.length > 1) throw new Error('This marking record is linked to more than one moderation entry. Resolve the duplicate in Internal Moderation.');
        return found.length ? found[0] : -1;
      }
      async function openStudent(student, target) {
        if (working) return;
        working = true;
        try {
          await persist();
          const parent = await request(year + '/moderation/' + record);
          const roster = JSON.parse(parent.content.markingStudents || '[]');
          const current = roster.filter(item => item.record === student.record && item.email === student.email);
          if (current.length !== 1) throw new Error('The student list changed. Reload this marking record.');
          const parentSamples = JSON.parse(parent.content.internal || '{}').samples || [];
          const matches = parentSamples.map((sample, index) => sample.markingScheduleRecord === student.record ? index : -1).filter(index => index >= 0);
          if (matches.length > 1) throw new Error('This student is linked to more than one moderation entry.');
          const path = year + '/moderation/' + student.record;
          const existing = await request(path);
          if (existing.revision && existing.content.parentRecord !== record) {
            throw new Error('The linked student record belongs to another assessment. No changes were made.');
          }
          if (!existing.revision) {
            const label = matches.length ? parentSamples[matches[0]].student : 'Student - ' + student.initials;
            const content = Object.fromEntries(common.map(([key]) => [key, parent.content[key] || '']));
            Object.assign(content, {
              title: (parent.content.standardNumber + ' — ' + label + ' — Marking Schedule').slice(0, 500),
              studentName: label, studentId: '', parentRecord: record,
              folderId: parent.content.folderId || '', folderName: parent.content.folderName || '',
              topic: parent.content.topic || '', standardFolder: parent.content.standardFolder || '',
              ...(parent.content.resourceLibrary ? { resourceLibrary: parent.content.resourceLibrary } : {}),
              ...(!matches.length ? { additionalMarking: 'Yes' } : {}),
              schedule: JSON.stringify({ ...sourceScheduleLinks(JSON.parse(parent.content.internal || '{}').source),
                ...scheduleTemplate(JSON.parse(parent.content.schedule || '{}')) })
            });
            await mutate(path, { content, revision: 0 });
          }
          await navigate(student.record, target);
        } catch (error) {
          console.error('Student marking form could not be opened.');
          message(error.message, true);
        } finally { working = false; }
      }
      async function openExistingSample(sample, target) {
        try {
          await persist();
          const existing = await request(year + '/moderation/' + sample.markingScheduleRecord);
          if (!existing.revision || existing.content.parentRecord !== record) {
            throw new Error('The sample form is not available. Open Internal Moderation to create or review it.');
          }
          await navigate(sample.markingScheduleRecord, target);
        } catch (error) { message(error.message, true); }
      }
      function renderMarking() {
        documentStatuses = [];
        roster.replaceChildren();
        moderation.replaceChildren();
        if (!students.length) roster.append(el('p', 'No students have been added. Use Setup Marking below.'));
        const table = el('table', '', { class: 'moderation-records-table' });
        const head = el('thead'), headings = el('tr'), sortControls = new Map();
        for (const [label, key] of [['Last name', 'last'], ['First name', 'first'], ['Class', 'class'],
          ['Marking Schedule'], ['Marking Confirmation & Feedback'], ['WHS Coversheet'], ['Moderation'], ['Entered KAMAR']]) {
          const heading = el('th', '', { scope: 'col' });
          if (key) {
            if (markingSort.key === key) heading.setAttribute('aria-sort', markingSort.direction);
            const control = button(label + (markingSort.key === key ? markingSort.direction === 'ascending' ? ' ▲' : ' ▼' : ''), () => {
              markingSort = { key, direction: markingSort.key === key && markingSort.direction === 'ascending' ? 'descending' : 'ascending' };
              focusSort = key;
              renderMarking();
            }, heading);
            sortControls.set(key, control);
          } else heading.append(el('span', label));
          headings.append(heading);
        }
        head.append(headings); table.append(head);
        const body = el('tbody'), selections = [];
        const visible = sortedMarkingStudents().filter(student => !linkedOnly ||
          ['schedule', 'feedback', 'coversheet'].some(key => documentLinks.get(student.record)?.[key]));
        for (const student of visible) {
          const parts = markingName(student);
          const row = el('tr'), name = el('th', parts.last || '—', { scope: 'row' });
          const warnings = [];
          if (!parts.last || !parts.first) warnings.push('Name not in Last, First format; review.');
          if (!student.id) warnings.push('Manually added; identity not verified against KAMAR.');
          else if (latestIds && !latestIds.has(student.id)) warnings.push('Not found in the latest loaded PDFs; review. Saved marking is retained.');
          if (warnings.length) {
            name.setAttribute('title', warnings.join(' '));
            name.setAttribute('aria-description', warnings.join(' '));
          }
          const first = el('td', parts.first || '—');
          first.append(el('p', 'Initials: ' + student.initials));
          const classCell = el('td', markingClass(student) || '—');
          row.append(name, first, classCell);
          for (const [target, label] of [['schedule', 'Open schedule'], ['feedback', 'Open feedback'], ['coversheet', 'Open coversheet']]) {
            const cell = el('td');
            button(label, () => openStudent(student, target), cell);
            showDocumentStatus(cell, student, target); row.append(cell);
          }
          const cell = el('td'), index = sampleIndex(student);
          if (index >= 0) cell.append(el('span', 'Student ' + (index < 26 ? String.fromCharCode(65 + index) : 'A' + String.fromCharCode(65 + index - 26))));
          else {
            const box = el('input', '', { type: 'checkbox', 'aria-label': 'Select ' + student.name + ' for moderation' });
            box.type = 'checkbox'; box.checked = selectedForModeration.has(student.record);
            box.addEventListener('change', () => {
              if (box.checked) selectedForModeration.add(student.record);
              else selectedForModeration.delete(student.record);
            });
            selections.push({ box, student }); cell.append(box);
          }
          const kamar = el('td'), entered = el('input', '', { type: 'checkbox', 'aria-label': 'Entered KAMAR for ' + student.name });
          entered.type = 'checkbox'; entered.checked = student.enteredKamar === true;
          const answer = el('span', entered.checked ? 'Yes' : 'No');
          entered.addEventListener('change', () => {
            if (entered.checked) student.enteredKamar = true;
            else delete student.enteredKamar;
            answer.textContent = entered.checked ? 'Yes' : 'No';
            savedStudents();
          });
          kamar.append(entered, answer);
          row.append(cell, kamar); body.append(row);
        }
        table.append(body);
        if (students.length) {
          const scroll = el('div', '', { class: 'moderation-records-table-scroll' });
          scroll.append(table); roster.append(scroll);
          if (linkedOnly && !visible.length) roster.append(el('p', 'No students have a saved document link.'));
          if (focusSort) { sortControls.get(focusSort).focus(); focusSort = ''; }
          const assignButton = button('Assign selected students to moderation', async () => {
            if (working) return;
            working = true; assignButton.disabled = true;
            try {
              const chosen = selections.filter(item => item.box.checked).map(item => item.student);
              if (!chosen.length) throw new Error('Tick the students selected for moderation first.');
              if (chosen.some(student => sampleIndex(student) >= 0)) throw new Error('A selected student is already linked to moderation. Reload and review the selection.');
              const entries = samples();
              const available = ['A', 'B', 'C', 'D'].flatMap((letter, index) =>
                !values.internal['randomInitials' + letter] &&
                (!entries[index] || !Object.values(entries[index]).some(Boolean)) ? [index] : []);
              if (chosen.length > available.length) throw new Error('There are not enough empty A–D slots. Existing moderation entries are unchanged.');
              if (!confirm('Assign ' + chosen.length + ' selected student(s) randomly to the available moderation slots? Existing entries and documents will be kept.')) return;
              for (let i = chosen.length - 1; i > 0; i--) {
                const random = new Uint32Array(1);
                crypto.getRandomValues(random);
                const j = random[0] % (i + 1);
                [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
              }
              values.internal.samples ||= [];
              chosen.forEach((student, position) => {
                const index = available[position], letter = String.fromCharCode(65 + index);
                while (values.internal.samples.length <= index) values.internal.samples.push({});
                values.internal.samples[index] = { student: 'Student ' + letter + ' - ' + student.initials,
                  randomSlot: letter, markingScheduleRecord: student.record };
                values.internal['randomInitials' + letter] = student.initials;
              });
              update('internal', JSON.stringify(values.internal));
              await persist();
              for (const student of chosen) selectedForModeration.delete(student.record);
              renderMarking();
              message('Moderation selection saved. The students remain in the full marking list.');
            } catch (error) { message(error.message, true); }
            finally { working = false; assignButton.disabled = false; }
          }, roster);
        }
        moderation.append(el('p', 'Selected students link to the same marking records and documents shown on the left.'));
        button('Open Internal Moderation Sheet', () => navigate(record, 'internal'), moderation);
        const list = el('ul', '', { class: 'moderation-sample-list' });
        for (const [index, sample] of samples().entries()) {
          const entry = el('li', '', { class: 'moderation-sample' });
          const linked = students.filter(student => student.record === sample.markingScheduleRecord);
          entry.append(el('strong', sample.student || 'Entry ' + (index + 1)));
          if (linked.length === 1) {
            entry.append(el('p', linked[0].name, { class: 'moderation-sample-description' }));
          } else {
            entry.append(el('p', 'Existing sample not linked to this marking list.', { class: 'moderation-sample-description' }));
          }
          if (linked.length === 1 || sample.markingScheduleRecord) {
            const reference = linked.length === 1 ? linked[0] :
              { record: sample.markingScheduleRecord, name: sample.student || 'moderation sample' };
            const documents = el('div', '', { class: 'moderation-sample-documents' });
            for (const [target, label] of [['schedule', 'Schedule'], ['feedback', 'Feedback'], ['coversheet', 'Coversheet']]) {
              const row = el('div', '', { class: 'moderation-sample-document' });
              button(label, () => linked.length === 1 ? openStudent(reference, target) : openExistingSample(sample, target), row);
              showDocumentStatus(row, reference, target);
              documents.append(row);
            }
            entry.append(documents);
          }
          if (linked.length !== 1) {
            const review = el('div', '', { class: 'moderation-sample-review' });
            const labelMatch = (sample.student || '').trim().match(/^Student\s+[A-Z]{1,2}\s*[-–—]\s*(\p{L}{1,10})$/iu);
            const slot = index < 4 ? String.fromCharCode(65 + index) : '';
            const savedInitials = slot && values.internal['randomInitials' + slot];
            const initials = labelMatch && (!savedInitials || savedInitials.toUpperCase() === labelMatch[1].toUpperCase()) ?
              labelMatch[1].toUpperCase() : '';
            const available = sortedMarkingStudents().filter(item => sampleIndex(item) < 0);
            const matches = initials ? available.filter(item => item.initials.toUpperCase() === initials) : [];
            if (matches.length) review.append(el('p', matches.length === 1 ?
              'Possible match by initials only; check the sample and documents before linking.' :
              'Multiple students have these initials; check the sample and documents before linking.'));
            else review.append(el('p', 'No match suggested. Review the sample and documents before linking.'));
            const select = el('select', '', { 'aria-label': 'Link existing sample ' + (index + 1) });
            select.append(el('option', 'Choose a student', { value: '' }));
            for (const student of available) {
              select.append(el('option', (matches.includes(student) ? 'Possible match: ' : '') +
                student.name + ' (' + student.initials + ')', { value: student.record }));
            }
            review.append(el('span', 'Review and link to marking list'), select);
            const linkButton = button('Link reviewed student', async () => {
              if (working) return;
              working = true; linkButton.disabled = true;
              try {
                const student = students.find(item => item.record === select.value);
                if (!student) throw new Error('Choose a student to link.');
                if (sampleIndex(student) >= 0) throw new Error('This student is already linked to a moderation entry.');
                if (!confirm('Link ' + student.name + ' to the existing ' + (sample.student || 'moderation entry ' + (index + 1)) +
                    '? Check the existing sample and documents first. Nothing will be overwritten or moved.')) return;
                await persist();
                if (sample.markingScheduleRecord && sample.markingScheduleRecord !== student.record) {
                  const [current, existing] = await Promise.all([
                    request(year + '/moderation/' + student.record),
                    request(year + '/moderation/' + sample.markingScheduleRecord)
                  ]);
                  if (current.revision && current.content.parentRecord !== record) throw new Error('The student record belongs to another assessment.');
                  if (existing.revision && existing.content.parentRecord !== record) throw new Error('The sample record belongs to another assessment.');
                  if (students.some(other => other !== student && other.record === sample.markingScheduleRecord)) {
                    throw new Error('This sample is already linked to another student.');
                  }
                  if (current.revision) {
                    if (!confirm('Both records are saved separately. Use the marking-list record for this moderation sample? ' +
                        'Its schedule, feedback and coversheet will be shown in moderation. The previous sample record and its documents remain unchanged and can be opened from Records. Nothing will be combined.')) return;
                    sample.markingScheduleRecord = student.record;
                  } else {
                    student.record = sample.markingScheduleRecord;
                    savedStudents();
                  }
                } else if (!sample.markingScheduleRecord) {
                  sample.markingScheduleRecord = student.record;
                }
                update('internal', JSON.stringify(values.internal));
                await persist(); renderMarking();
                message('Existing moderation sample linked. Its documents were not moved or changed.');
              } catch (error) { message(error.message, true); }
              finally { working = false; linkButton.disabled = false; }
            }, review);
            entry.append(review);
          }
          list.append(entry);
        }
        if (!samples().length) moderation.append(el('p', 'No moderation students selected.'));
        else moderation.append(list);
      }
      const dept = el('select', '', { 'aria-label': 'Marking department' });
      const status = el('p', 'Loading authorised departments…', { role: 'status' });
      const suggestions = el('div');
      setupBody.append(dept, status, suggestions);
      let departments = [];
      dept.addEventListener('change', () => {
        suggestions.replaceChildren(); latestIds = null; renderMarking();
        status.textContent = 'Load saved PDF evidence for the selected department.';
      });
      request('students-audit?year=' + year).then(result => {
        departments = result.departments.filter(item => item.markbookEvidence);
        dept.replaceChildren(el('option', 'Choose department', { value: '' }));
        for (const item of departments) dept.append(el('option', item.name, { value: item.id }));
        if (departments.length === 1) dept.value = departments[0].id;
        status.textContent = departments.length ? 'Load saved PDF evidence for this assessment.' : 'No authorised markbook department is available.';
      }).catch(error => { status.setAttribute('role', 'alert'); status.textContent = error.message; });
      let loadingStudents = false;
      const loadStudentsButton = button('Load markbook students', async () => {
        if (loadingStudents) return;
        loadingStudents = true; loadStudentsButton.disabled = true;
        try {
          if (!departments.some(item => item.id === dept.value)) throw new Error('Choose an authorised department.');
          await persist();
          const departmentId = dept.value, number = hidden.standardNumber.value, version = hidden.version.value;
          const result = await request('students-audit/marking?' + new URLSearchParams({
            year: String(year), departmentId, record
          }));
          if (dept.value !== departmentId || hidden.standardNumber.value !== number || hidden.version.value !== version ||
              result.standardNumber !== number || result.version !== version) {
            throw new Error('The department, standard or version changed while loading. Load the markbook students again.');
          }
          suggestions.replaceChildren();
          status.setAttribute('role', 'status');
          status.textContent = 'PDF sync: ' + result.syncedAt + (result.complete ? '' : ' — incomplete sources; review before adding.') +
            '. ' + result.issues.length + ' unmatched or conflicting PDF row(s) require review.';
          if (!result.summary) suggestions.append(el('p', 'Enrolled List summary has not been synced; totals cannot be compared.'));
          else {
            suggestions.append(el('p', 'Enrolled List summary synced: ' + result.summary.syncedAt + '.'));
            if (!result.summary.entries.length) suggestions.append(el('p', 'This standard and version were not found in the Enrolled List summary; counts cannot be compared.', { role: 'alert' }));
            for (const entry of result.summary.entries) {
              const sources = result.evidence.filter(item => item.course === entry.course);
              const count = new Set(sources.flatMap(item => item.students.map(person => person.id))).size;
              if (!sources.length || sources.some(item => item.conflict || item.unmatched) || entry.enrolled == null) {
                suggestions.append(el('p', entry.course + ': PDF student total cannot be compared reliably with the Enrolled List.'));
              } else if (count !== entry.enrolled) {
                suggestions.append(el('p', entry.course + ': ' + count + ' distinct PDF students; Enrolled List count ' +
                  entry.enrolled + '. Review the difference.', { role: 'alert' }));
              }
            }
          }
          for (const issue of result.issues) {
            const warning = el('p', issue.name + ' — ' + issue.reason + ' ', { role: 'alert' });
            warning.append(el('a', 'Open source PDF', { href: issue.url, target: '_blank', rel: 'noopener noreferrer' }));
            suggestions.append(warning);
          }
          if (!result.evidence.length) suggestions.append(el('p', 'No saved PDF matches this standard and version.'));
          const candidates = new Map();
          for (const source of result.evidence) {
            suggestions.append(el('p', source.course + (source.teachers?.length ? ' — markbook teacher(s): ' + source.teachers.join(', ') : '') +
              (source.modifiedTime ? ' — updated ' + source.modifiedTime : '') + (source.conflict ? ' — conflicting PDFs' : '')),
              el('a', 'Open source PDF', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }));
            for (const person of source.students) {
              if (!candidates.has(person.id)) candidates.set(person.id, { ...person, courses: [], classes: [] });
              const candidate = candidates.get(person.id);
              candidate.courses.push(source.course);
              candidate.classes.push(...(person.classCodes || []));
            }
          }
          latestIds = result.complete && result.evidence.length && !result.issues.length &&
            result.evidence.every(source => !source.conflict && !source.unmatched) ? new Set(candidates.keys()) : null;
          renderMarking();
          async function verifyEvidence() {
            const fresh = await request('students-audit/marking?' + new URLSearchParams({
              year: String(year), departmentId, record
            }));
            if (dept.value !== departmentId || hidden.standardNumber.value !== number || hidden.version.value !== version ||
                fresh.standardNumber !== number || fresh.version !== version || fresh.syncedAt !== result.syncedAt ||
                fresh.complete !== result.complete || JSON.stringify(fresh.evidence) !== JSON.stringify(result.evidence) ||
                JSON.stringify(fresh.issues) !== JSON.stringify(result.issues)) {
              throw new Error('The PDF evidence or KAMAR identity changed. Load and review the students again.');
            }
            return fresh;
          }
          async function verifyCandidate(person) {
            const fresh = await verifyEvidence();
            if (!fresh.evidence.some(source => source.students.some(item =>
              item.id === person.id && item.email === person.email && item.name === person.name))) {
              throw new Error('The PDF evidence or KAMAR identity changed. Load and review the students again.');
            }
          }
          const choices = [];
          for (const person of candidates.values()) {
            const row = el('div', '', { class: 'moderation-marking-candidate' });
            const byId = students.find(student => student.id === person.id);
            const byEmail = person.email && students.find(student => student.email === person.email);
            const already = Boolean(byId || byEmail);
            const box = el('input', '', { type: 'checkbox', 'aria-label': 'Add ' + person.name });
            box.type = 'checkbox'; box.checked = Boolean(person.email && !already); box.disabled = !person.email || already;
            const parts = person.name.split(',');
            const initials = (parts.length === 2 ? [parts[1], parts[0]] : person.name.split(/\s+/))
              .map(part => part.trim().match(/^\p{L}/u)?.[0] || '').join('').toUpperCase().slice(0, 10);
            const control = el('input', '', { type: 'text', 'aria-label': 'Initials for ' + person.name, maxlength: '10' });
            control.value = initials; control.maxLength = 10;
            row.append(box, el('span', person.name + ' — ' + [...new Set(person.courses)].join(', ') +
              (person.classes.length ? ' — classes: ' + [...new Set(person.classes)].join(', ') : '') +
              (person.email ? ' — school email: ' + person.email : '') +
              (byId && byId.email !== person.email ? ' — school email changed or unavailable; review identity' :
                byId && byId.name !== person.name ? ' — saved name differs; review identity' :
                byEmail && byEmail.id && byEmail.id !== person.id ? ' — email conflicts with another saved identity' :
                  already ? ' — already added' : !person.email ? ' — missing or duplicate school email; review manually' : '')), control);
            if (person.email && byId && byId.email !== person.email && !byEmail) {
              button('Review changed email for ' + person.name, async () => {
                try {
                  if (students.some(item => item !== byId && item.email === person.email)) throw new Error('This school email is already used by another marking student.');
                  if (!confirm('Update the saved school email for ' + byId.name + '? Check the KAMAR identity and address first. Existing marking documents remain unchanged.')) return;
                  await verifyCandidate(person);
                  byId.email = person.email; savedStudents(); await persist(); renderMarking();
                  message('School email updated; marking documents are unchanged.');
                } catch (error) { message(error.message, true); }
              }, row);
            } else if (person.email && byEmail && !byEmail.id && !byId) {
              button('Verify manual student ' + person.name, async () => {
                try {
                  if (!confirm('Link the manually added ' + byEmail.name + ' to ' + person.name + ' in KAMAR? Check both names and the school email first.')) return;
                  await verifyCandidate(person);
                  byEmail.id = person.id;
                  byEmail.courses = [...new Set(person.courses)].sort(compareMarking);
                  byEmail.classes = [...new Set(person.classes)];
                  savedStudents(); await persist(); renderMarking();
                  message('Manual student linked to the reviewed KAMAR identity.');
                } catch (error) { message(error.message, true); }
              }, row);
            }
            suggestions.append(row); choices.push({ box, control, person });
          }
          let addingStudents = false;
          const addStudentsButton = button('Add ticked students', async () => {
            if (addingStudents) return;
            addingStudents = true; addStudentsButton.disabled = true;
            try {
              const selected = choices.filter(item => item.box.checked && !item.box.disabled);
              if (!selected.length) throw new Error('Tick at least one student to add.');
              if (dept.value !== departmentId || hidden.standardNumber.value !== number || hidden.version.value !== version) {
                throw new Error('The department, standard or version changed. Load and review the students again.');
              }
              const fresh = await request('students-audit/marking?' + new URLSearchParams({
                year: String(year), departmentId, record
              }));
              const freshPeople = fresh.evidence.flatMap(source => source.students);
              if (dept.value !== departmentId || hidden.standardNumber.value !== number || hidden.version.value !== version ||
                  fresh.standardNumber !== number || fresh.version !== version || fresh.syncedAt !== result.syncedAt ||
                  fresh.complete !== result.complete || JSON.stringify(fresh.evidence) !== JSON.stringify(result.evidence) ||
                  JSON.stringify(fresh.issues) !== JSON.stringify(result.issues) || selected.some(({ person }) => !freshPeople.some(item =>
                    item.id === person.id && item.email === person.email && item.name === person.name))) {
                throw new Error('The PDF evidence or KAMAR identity changed. Load and review the students again.');
              }
              const additions = selected.map(({ person, control }) => ({ id: person.id, email: person.email,
                name: person.name.trim(), initials: control.value.trim().toUpperCase(), record: crypto.randomUUID(),
                classes: [...new Set(person.classes)], courses: [...new Set(person.courses)].sort(compareMarking) }));
              if (additions.some(item => !/^\p{L}{1,10}$/u.test(item.initials))) throw new Error('Enter one to ten letters for each student’s initials.');
              if (students.length + additions.length > 1000 ||
                  new Set([...students, ...additions].map(item => item.email)).size !== students.length + additions.length ||
                  new Set([...students, ...additions].map(item => item.id).filter(Boolean)).size !== students.filter(item => item.id).length + additions.length) {
                throw new Error('The list contains a duplicate student or school email, or exceeds 1,000 students.');
              }
              students.push(...additions); savedStudents(); await persist(); renderMarking();
              for (const item of selected) { item.box.checked = false; item.box.disabled = true; }
              message('Students added to the marking list. No moderation selection or documents were created.');
            } catch (error) { message(error.message, true); }
            finally { addingStudents = false; addStudentsButton.disabled = false; }
          }, suggestions);
          if (students.some(student => student.id && candidates.has(student.id))) {
            let updatingMarkbooks = false;
            const updateMarkbooksButton = button('Update markbooks for saved students', async () => {
              if (updatingMarkbooks) return;
              updatingMarkbooks = true; updateMarkbooksButton.disabled = true;
              try {
                if (!result.complete || result.issues.length || result.evidence.some(source => source.conflict || source.unmatched)) {
                  throw new Error('The PDF evidence is incomplete or conflicting. Resolve the issues and load it again before updating saved markbooks.');
                }
                const updates = students.flatMap(student => {
                  const person = candidates.get(student.id);
                  if (!person || !person.email || student.email !== person.email || student.name !== person.name) return [];
                  const courses = [...new Set(person.courses)].sort(compareMarking);
                  return JSON.stringify(student.courses || []) === JSON.stringify(courses) ? [] : [{ student, courses }];
                });
                const skipped = students.filter(student => {
                  const person = candidates.get(student.id);
                  return person && (!person.email || student.email !== person.email || student.name !== person.name);
                }).length;
                if (!updates.length) throw new Error('No matching saved students need a markbook update. Check any unmatched names and emails.');
                if (!confirm('Update the markbook courses for ' + updates.length +
                    ' saved student(s) using the reviewed PDFs? Marking records and documents will not be changed.')) return;
                await verifyEvidence();
                for (const update of updates) update.student.courses = update.courses;
                savedStudents(); await persist(); renderMarking();
                message('Saved students’ markbooks updated. Marking documents are unchanged.' +
                  (skipped ? ' ' + skipped + ' saved student(s) had differing names or emails and were not updated; review their identities.' : ''));
              } catch (error) { message(error.message, true); }
              finally { updatingMarkbooks = false; updateMarkbooksButton.disabled = false; }
            }, suggestions);
          }
        } catch (error) { status.setAttribute('role', 'alert'); status.textContent = error.message; }
        finally { loadingStudents = false; loadStudentsButton.disabled = false; }
      }, setupBody);
      const manual = el('div', '', { class: 'moderation-fields' });
      manual.append(el('h4', 'Add a student manually'));
      const manualName = input(['name', 'Student name'], '', () => {}, manual, 'marking-manual-');
      const manualEmail = input(['email', 'School email'], '', () => {}, manual, 'marking-manual-');
      manualEmail.type = 'email';
      const manualInitials = input(['initials', 'Initials'], '', () => {}, manual, 'marking-manual-');
      setupBody.append(manual, el('p', 'Manual entries are not verified against KAMAR. Check the name and school email before saving.'));
      button('Add manual student', async () => {
        try {
          const name = manualName.value.trim(), email = manualEmail.value.trim().toLowerCase();
          const initials = manualInitials.value.trim().toUpperCase();
          if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name) ||
              email.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email) ||
              !/^\p{L}{1,10}$/u.test(initials)) throw new Error('Enter a student name, school email and one to ten letters for initials.');
          if (students.length >= 1000 || students.some(item => item.email === email)) throw new Error('This email is already in the list or the list is full.');
          if (!confirm('Add ' + name + ' with this school email? This manual identity has not been verified against KAMAR.')) return;
          students.push({ id: '', name, email, initials, record: crypto.randomUUID() });
          savedStudents(); await persist(); renderMarking();
          manualName.value = ''; manualEmail.value = ''; manualInitials.value = '';
          message('Manual student added. No moderation selection or documents were created.');
        } catch (error) { message(error.message, true); }
      }, setupBody);
      renderMarking();
      request('moderation/' + year + '/' + record + '/marking-documents').then(result => {
        if (!Array.isArray(result.records) || result.records.some(item => !item || typeof item.record !== 'string' ||
            !item.documents || typeof item.documents !== 'object')) throw new Error('Invalid marking document links.');
        documentLinks = new Map(result.records.map(item => [item.record, item.documents]));
        if (area.isConnected) {
          filter.disabled = false; filterStatus.textContent = '';
          for (const item of documentStatuses) renderDocumentStatus(item.node, item.student, item.target);
        }
      }).catch(() => {
        console.error('Marking document links could not be loaded.');
        documentError = 'unavailable';
        if (area.isConnected) {
          filterStatus.textContent = 'Document links could not be loaded; reopen the page to retry.';
          filterStatus.setAttribute('role', 'alert');
          for (const item of documentStatuses) renderDocumentStatus(item.node, item.student, item.target);
        }
      });
      return;
    }
    if (!documents[page]) {
      area.append(el('h3', 'Record details'),
        el('p', 'These details populate the four documents. Work with the assessment standard here; student names will be handled in a later workflow. Any previously saved student details are retained.'));
      const details = el('div', '', { class: 'moderation-detail-blocks' });
      const slots = {}, order = [];
      for (const [legend, rows] of [
        ['Assessment Details', [['title'], ['standardNumber', 'standardTitle'], ['level', 'version', 'credits']]],
        ['Assessor Details', [['department', 'teacher', 'subject'], ['course', 'assessors']]]
      ]) {
        const block = el('fieldset', '', { class: 'moderation-detail-block' });
        block.append(el('legend', legend));
        for (const keys of rows) {
          const row = el('div', '', { class: 'moderation-fields moderation-detail-row moderation-detail-row-' + keys.length + (keys[0] === 'title' ? ' moderation-detail-title' : '') });
          block.append(row);
          for (const key of keys) { slots[key] = row; order.push(key); }
        }
        details.append(block);
      }
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
        renderAssessors();
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
      const suggestions = {};
      let refreshTeaching = () => {}, renderAssessors = () => {}, renderCourseChoices = () => {}, teachingDepartments = [];
      for (const key of order) {
        const definition = common.find(item => item[0] === key), slot = slots[key];
        if (definition[0] === 'department') {
          const wrapper = el('div', '', { class: 'planner-field' });
          wrapper.append(el('label', 'Faculty / Department', { for: 'moderation-department' }), departmentSelect, departmentStatus);
          slot.append(wrapper); continue;
        }
        if (definition[0] === 'teacher') {
          const wrapper = el('div', '', { class: 'planner-field' });
          const teacher = el('select', '', { id: 'moderation-teacher', 'aria-describedby': 'moderation-teacher-status' });
          teacherSelect = teacher;
          const staffStatus = el('p', '', { id: 'moderation-teacher-status', role: 'status' });
          wrapper.append(el('label', 'Teacher in charge', { for: 'moderation-teacher' }), teacher, staffStatus);
          slot.append(wrapper);
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
        if (definition[0] === 'assessors') {
          const wrapper = el('div', '', { class: 'planner-field' });
          const select = el('select', '', { id: 'moderation-assessors', 'aria-describedby': 'moderation-assessors-status' });
          const other = el('input', '', { id: 'moderation-assessors-other', type: 'text', 'aria-label': 'Assessor name' });
          other.type = 'text'; other.maxLength = 500; other.hidden = true;
          const status = el('p', '', { id: 'moderation-assessors-status', role: 'status' });
          wrapper.append(el('label', 'Assessor', { for: 'moderation-assessors' }), select, other, status);
          slot.append(wrapper);
          const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
          renderAssessors = () => {
            const selected = hidden.assessors.value || assessorName, department = hidden.department.value;
            const members = teachingDepartments.find(item => department && normal(item.name) === normal(department))?.teachers || [];
            select.replaceChildren(el('option', 'Choose Assessor', { value: '' }));
            if (selected && !members.includes(selected)) select.append(el('option', selected + ' (saved)', { value: selected }));
            if (members.length) {
              const group = el('optgroup', '', { label: department + ' members (WHS Unit Library)' });
              for (const name of members) group.append(el('option', name, { value: name }));
              select.append(group);
            }
            select.append(el('option', 'Someone else (type a name)…', { value: '__other' }));
            select.value = other.hidden ? selected : '__other';
            status.textContent = !assessorName && !hidden.assessors.value ? 'Your signed-in display name is unavailable. Choose the Assessor; email addresses are not used as the default.' :
              !department ? 'Choose a Faculty / Department to list its members.' :
              members.length ? 'Members of ' + department + ' from the WHS Unit Library Learning Area Profile.' :
              'No WHS Unit Library members are listed for ' + department + '. Choose Someone else to type a name.';
          };
          select.addEventListener('change', () => {
            other.hidden = select.value !== '__other';
            if (other.hidden) update('assessors', select.value);
            else { other.value = hidden.assessors.value; other.focus?.(); }
          });
          other.addEventListener('input', () => update('assessors', other.value));
          renderAssessors();
          continue;
        }
        const control = input(definition, hidden[definition[0]].value, value => {
          update(definition[0], value);
          if (['level', 'standardNumber'].includes(definition[0])) { fillRetentionLocation(); refreshFolder(); }
          if (definition[0] === 'title') heading.textContent = value || 'Moderation record';
          if (definition[0] === 'subject') refreshTeaching(true);
          if (definition[0] === 'course') renderCourseChoices();
          if (definition[0] === 'standardNumber') refreshLibraryCourses();
        }, slot);
        if (['subject', 'course'].includes(definition[0])) {
          const list = el('datalist', '', { id: 'moderation-' + definition[0] + '-options' });
          control.setAttribute('list', 'moderation-' + definition[0] + '-options');
          control.parentElement.append(list);
          suggestions[definition[0]] = { control, list };
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
                  if (key === 'level') { fillSetupFolderLink(); refreshTeaching(true); }
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
      if (suggestions.subject && suggestions.course) {
        let teachingClasses = [], libraryCourses = [], librarySearchVersion = 0;
        const teachingStatus = el('p', '', { role: 'status' });
        suggestions.course.control.parentElement.append(teachingStatus);
        const setValue = (key, value) => {
          update(key, value); suggestions[key].control.value = value;
          if (key === 'course') renderCourseChoices();
        };
        const same = (a, b) => a.trim().toLocaleLowerCase('en-NZ') === b.trim().toLocaleLowerCase('en-NZ');
        const courseWrapper = suggestions.course.control.parentElement;
        const classBox = el('fieldset', '', { class: 'library-class-box' });
        const classList = el('div', '', { class: 'library-class-options', id: 'moderation-course-choices' });
        const libraryStatus = el('p', '', { role: 'status', 'aria-live': 'polite' });
        const libraryChoice = el('select', '', { id: 'moderation-course-library', 'aria-label': 'Matching library assessment for class codes' });
        classBox.append(el('legend', 'Choose class codes'), classList,
          el('label', 'Matching assessment in Resource Library', { for: 'moderation-course-library' }), libraryChoice);
        const selectedCodes = () => hidden.course.value.split(',').map(value => value.trim()).filter(Boolean);
        renderCourseChoices = () => {
          const selected = selectedCodes(), codes = [];
          for (const code of [...selected, ...libraryCourses, ...teachingClasses.map(item => item.course)]) {
            if (code && !codes.some(value => same(value, code))) codes.push(code);
          }
          codes.sort((a, b) => a.localeCompare(b, 'en-NZ', { numeric: true }));
          classList.replaceChildren();
          if (!codes.length) classList.append(el('p', 'No class codes available yet. Choose an assessment or enter a code below.'));
          for (const code of codes) {
            const label = el('label', '', { class: 'library-class-choice' });
            const check = el('input', '', { type: 'checkbox', value: code });
            check.type = 'checkbox'; check.checked = selected.some(value => same(value, code));
            check.addEventListener('change', () => {
              const next = selectedCodes().filter(value => !same(value, code));
              if (check.checked) next.push(code);
              if (!globalThis.assessmentLibrarySchema.validClassCodes(next) || next.join(', ').length > 500) {
                check.checked = !check.checked;
                libraryStatus.setAttribute('role', 'alert');
                libraryStatus.textContent = 'The selected course codes do not fit in the 500-character Course Code field. Existing values were kept.';
                return;
              }
              setValue('course', next.join(', '));
              libraryStatus.setAttribute('role', 'status');
              libraryStatus.textContent = 'Class choices updated.';
            });
            label.append(check, el('span', code)); classList.append(label);
          }
        };
        async function findLibraryCourses() {
          const number = hidden.standardNumber.value, version = hidden.version.value, token = ++librarySearchVersion;
          libraryChoice.replaceChildren(el('option', 'Choose an assessment', { value: '' }));
          if (!number || !version) {
            libraryChoice.disabled = false;
            libraryStatus.textContent = 'Load the standard number and version before finding matching assessments.';
            return;
          }
          libraryChoice.disabled = true;
          libraryStatus.setAttribute('role', 'status');
          libraryStatus.textContent = 'Loading matching assessments…';
          try {
            const result = await request('resource-library?active=1&standard=' + encodeURIComponent(number) + '&version=' + encodeURIComponent(version));
            if (!area.isConnected || token !== librarySearchVersion || number !== hidden.standardNumber.value || version !== hidden.version.value) return;
            if (!Array.isArray(result.records)) throw new Error('The matching assessments could not be read.');
            const saved = hidden.resourceLibrary.value ? JSON.parse(hidden.resourceLibrary.value) : null;
            if (saved && !globalThis.assessmentLibrarySchema.validSnapshot(saved)) throw new Error('The saved library selection is invalid.');
            if (saved && (saved.standardNumber !== number || saved.version !== version)) throw new Error('The saved library selection does not match the current standard and version.');
            const linkedId = saved?.resourceId || hidden.resourceLibraryId.value;
            const records = linkedId ? result.records.filter(item => item.id.toLowerCase() === linkedId.toLowerCase()) : result.records;
            if (linkedId && !records.some(item => item.id.toLowerCase() === linkedId.toLowerCase())) {
              const entry = saved ? { id: saved.resourceId, title: saved.title, edition: saved.edition } :
                await request('resource-library/' + encodeURIComponent(linkedId));
              if (!area.isConnected || token !== librarySearchVersion || number !== hidden.standardNumber.value || version !== hidden.version.value) return;
              if (!saved && !entry.content?.standards?.some(item => item.number === number && item.version === version)) {
                throw new Error('The linked assessment no longer matches the standard and version.');
              }
              records.unshift(saved ? entry : { id: entry.id, title: entry.content.title, edition: entry.content.edition });
            }
            for (const item of records) libraryChoice.append(el('option', item.title + (item.edition ? ' - ' + item.edition : ''), { value: item.id }));
            if (linkedId && records.length === 1) libraryChoice.value = records[0].id;
            libraryStatus.textContent = records.length ? 'Select the assessment, then add its class codes. This does not apply its critique or source details.' :
              'No matching library assessment found. You can still select confirmed classes or enter a code.';
            if (!linkedId && result.total > records.length) libraryStatus.textContent += ' Only the first 50 matches are shown.';
            if (linkedId && !data.parentRecord) await addLibraryCourses(true, token);
          } catch (error) {
            console.error('Matching library assessments could not be loaded.');
            if (area.isConnected && token === librarySearchVersion) { libraryStatus.setAttribute('role', 'alert'); libraryStatus.textContent = error.message; }
          } finally {
            if (area.isConnected && token === librarySearchVersion) libraryChoice.disabled = false;
          }
        }
        button('Find library assessments', findLibraryCourses, classBox);
        async function addLibraryCourses(automatic = false, searchToken = librarySearchVersion) {
          const id = libraryChoice.value, number = hidden.standardNumber.value, version = hidden.version.value;
          if (!id) { libraryStatus.setAttribute('role', 'alert'); libraryStatus.textContent = 'Choose a matching library assessment first.'; return; }
          try {
            const saved = hidden.resourceLibrary.value ? JSON.parse(hidden.resourceLibrary.value) : null;
            let codes;
            if (saved?.resourceId.toLowerCase() === id.toLowerCase() && saved.classCodes !== undefined) codes = saved.classCodes;
            else {
              const entry = await request('resource-library/' + encodeURIComponent(id));
              if (automatic && searchToken !== librarySearchVersion) return;
              if (!area.isConnected || libraryChoice.value !== id || number !== hidden.standardNumber.value || version !== hidden.version.value) {
                throw new Error('The assessment or standard changed. Choose it again before adding class codes.');
              }
              if (!entry.content?.standards?.some(item => item.number === number && item.version === version)) {
                throw new Error('This assessment no longer matches the standard and version.');
              }
              codes = entry.content.classCodes || [];
            }
            if (!globalThis.assessmentLibrarySchema.validClassCodes(codes)) throw new Error('The library class codes are invalid.');
            if (codes.some(code => code.includes(','))) throw new Error('A library class code contains a comma. Edit it into separate class codes in the Resource Library first.');
            const initialized = hidden.courseLibraryInitialized?.value.toLowerCase() === id.toLowerCase();
            const hadCourse = Boolean(hidden.course.value.trim()), applyCodes = !automatic || !initialized && !hadCourse;
            const next = selectedCodes();
            if (applyCodes) for (const code of codes) if (!next.some(value => same(value, code))) next.push(code);
            if (applyCodes && (!globalThis.assessmentLibrarySchema.validClassCodes(next) || next.join(', ').length > 500)) {
              throw new Error('These class codes exceed the Course Code limit. Existing values were kept.');
            }
            libraryCourses = [...codes];
            if (codes.length && applyCodes) setValue('course', next.join(', '));
            else renderCourseChoices();
            if (automatic && !initialized) {
              if (!hidden.courseLibraryInitialized) field('courseLibraryInitialized', '');
              update('courseLibraryInitialized', id);
            }
            libraryStatus.setAttribute('role', 'status');
            libraryStatus.textContent = codes.length ?
              (automatic && initialized ? 'Linked assessment class choices are available above.' :
                automatic && hadCourse ? 'Existing course codes kept. Use Add library class codes to include the linked assessment’s choices.' :
                'Library class codes added. Untick any that do not apply to this record.') :
              'No class codes are recorded for this assessment.';
          } catch (error) {
            console.error('Library class codes could not be added.');
            if (area.isConnected && (!automatic || searchToken === librarySearchVersion)) {
              libraryStatus.setAttribute('role', 'alert'); libraryStatus.textContent = error.message;
            }
          }
        }
        button('Add library class codes', () => addLibraryCourses(), classBox);
        classBox.append(libraryStatus);
        const courseLabel = courseWrapper.children[0];
        courseWrapper.replaceChildren(courseLabel, classBox, suggestions.course.control, suggestions.course.list, teachingStatus);
        renderCourseChoices();
        refreshLibraryCourses = findLibraryCourses;
        findLibraryCourses();
        refreshTeaching = fill => {
          const subjects = [...new Set(teachingClasses.map(item => item.subject))];
          suggestions.subject.list.replaceChildren(...subjects.map(value => el('option', '', { value })));
          if (fill && !hidden.subject.value.trim() && subjects.length === 1) setValue('subject', subjects[0]);
          const subject = hidden.subject.value;
          const matching = subject.trim() ? teachingClasses.filter(item => same(item.subject, subject)) : teachingClasses;
          suggestions.course.list.replaceChildren(...[...new Set(matching.map(item => item.course))].map(value => el('option', '', { value })));
          renderCourseChoices();
          const course = hidden.course.value;
          // Replace an empty course, or one suggested for a different subject, when the level identifies one course (e.g. Level 3 → 13DTECH).
          const stale = course.trim() && teachingClasses.some(item => same(item.course, course)) && !matching.some(item => same(item.course, course));
          if (!fill || !subject.trim() || !matching.length || course.trim() && !stale ||
              hidden.resourceLibrary.value || hidden.resourceLibraryId.value) return;
          const byLevel = /^[123]$/.test(hidden.level.value) ? matching.filter(item => new RegExp('^1' + hidden.level.value + '\\D').test(item.course)) : [];
          const courses = [...new Set((byLevel.length ? byLevel : matching).map(item => item.course))];
          if (courses.length === 1) setValue('course', courses[0]);
        };
        request('teaching-subjects/' + year).then(result => {
          if (!area.isConnected) return;
          teachingClasses = result.classes;
          teachingDepartments = result.departments || [];
          renderAssessors();
          teachingStatus.textContent = teachingClasses.length
            ? 'Suggestions come from your confirmed classes in the WHS Unit Library Learning Area Profile.'
            : 'No confirmed classes were found for you this year. Type Subject and Course Code.';
          refreshTeaching(true);
        }).catch(error => {
          if (!area.isConnected) return;
          teachingStatus.setAttribute('role', 'alert'); teachingStatus.textContent = error.message;
        });
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
      schedule = criteriaSources(schedule, hidden.standardNumber.value);
      const template = {};
      for (const key of ['instructions', 'submissions', 'assessmentInstructionsLink', 'topicBriefLink', 'achieved', 'merit', 'excellence']) {
        if (typeof schedule[key] === 'string') template[key] = schedule[key];
      }
      if (Array.isArray(schedule.requirements)) template.requirements = schedule.requirements
        .filter(row => !isSchedulePlaceholder(row) && (row.requirement || '').trim())
        .map(row => ({ requirement: row.requirement, ...(row.level ? { level: row.level } : {}) }));
      const citations = nzqaCriteriaCitations(schedule.notes, hidden.standardNumber.value);
      if (citations.length) template.notes = [...new Set(citations)].join('\n\n');
      return template;
    }
    const definition = documents[page], state = values[page];
    const documentPanel = el('section', '', { class: 'moderation-panel' });
    const libraryPanel = el('section', '', { class: 'moderation-panel' });
    if (['internal', 'schedule'].includes(page)) {
      libraryPanel.append(el('h3', 'Assessment Resource Library'),
        el('p', data.parentRecord ? 'Fill missing assessment and topic brief links. Student submissions and marking are never copied from the library.' :
          'Fill an empty course code, source, approved critique details and recorded checks, plus the standard marking schedule links. Existing values stay unchanged. New student schedules inherit the standard template links.'));
      const chooser = el('div'), selection = el('p');
      libraryPanel.append(selection, chooser);
      function savedSelection() {
        if (!hidden.resourceLibrary.value) return null;
        const saved = JSON.parse(hidden.resourceLibrary.value);
        if (!globalThis.assessmentLibrarySchema.validSnapshot(saved)) throw new Error('The saved library selection is invalid. No library content was applied.');
        return saved;
      }
      function showSelection() {
        const saved = savedSelection();
        selection.textContent = saved ? 'Saved selection: ' + saved.title + (saved.edition ? ' - ' + saved.edition : '') + ' (library revision ' + saved.revision +
          '). Later library edits do not change this snapshot.' : hidden.resourceLibraryId.value ?
            'This record is linked to a Resource Library entry for sharing its evaluation. Choose that entry below to apply its details.' :
            'No library assessment selected.';
      }
      async function applyLibrary(selected) {
        if (working) throw new Error('Wait for the current moderation action to finish.');
        if (selected.standardNumber !== hidden.standardNumber.value || selected.version !== hidden.version.value) {
          throw new Error('The library selection does not match the current standard and version.');
        }
        const saved = savedSelection();
        if (hidden.resourceLibraryId.value && hidden.resourceLibraryId.value.toLowerCase() !== selected.resourceId.toLowerCase()) {
          throw new Error('This record is linked to a different Resource Library entry. Unlink it in that entry before selecting another.');
        }
        const comparable = { ...selected };
        if (saved && saved.classCodes === undefined) delete comparable.classCodes;
        if (saved && saved.sourceProvenance === undefined) delete comparable.sourceProvenance;
        if (saved && globalThis.assessmentLibrarySchema.moderationSource(saved) === selected.source) comparable.source = saved.source;
        if (saved && JSON.stringify(saved) !== JSON.stringify(comparable)) {
          throw new Error('This record already has a saved library edition and critique. Reuse its saved selection, or create a new moderation record for a different selection.');
        }
        const next = globalThis.assessmentLibrarySchema.fillMissing(values.internal, values.schedule, selected, !data.parentRecord);
        const course = !data.parentRecord && !hidden.course.value.trim() ? (selected.classCodes || []).join(', ') : '';
        if (course && selected.classCodes.some(code => code.includes(','))) throw new Error('A library class code contains a comma. Edit it into separate class codes in the Resource Library first.');
        if (course.length > 500) throw new Error('The library class codes exceed the 500-character Course Code limit. Enter the relevant codes in Record details before applying the library.');
        working = true; area.inert = true;
        try {
          Object.assign(values.internal, next.internal); Object.assign(values.schedule, next.schedule);
          update('internal', JSON.stringify(values.internal)); update('schedule', JSON.stringify(values.schedule));
          if (course) update('course', course);
          update('resourceLibrary', JSON.stringify(saved ? { ...saved,
            ...(saved.classCodes === undefined && selected.classCodes !== undefined ? { classCodes: selected.classCodes } : {}) } : selected));
          if (hidden.resourceLibraryId.value) update('resourceLibraryId', selected.resourceId);
          sourceLinks = data.parentRecord ? sourceLinks : sourceScheduleLinks(values.internal.source);
          renderEditor(); showSelection();
          await persist();
          message('Missing library fields saved. Existing values, student marking and Drive documents are unchanged. Update the Drive sheet when ready.');
        } finally { working = false; area.inert = false; }
      }
      button('Choose from Resource Library', () => {
        globalThis.assessmentResourceLibrary.mountPicker(chooser, { el, request,
          standardNumber: hidden.standardNumber.value, version: hidden.version.value, apply: applyLibrary });
      }, libraryPanel);
      button('Fill missing from saved library selection', async () => {
        try {
          const saved = savedSelection();
          if (!saved) throw new Error('Choose a resource edition from the library first.');
          await applyLibrary(saved);
        } catch (error) { console.error('Saved library selection could not be applied.'); message(error.message, true); }
      }, libraryPanel);
      try { showSelection(); } catch (error) { selection.textContent = error.message; selection.setAttribute('role', 'alert'); }
    }
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
    if (page === 'feedback' || page === 'coversheet') {
      const details = el('div', '', { class: 'moderation-fields' });
      if (page === 'coversheet') documentPanel.append(el('h4', 'Standard information'));
      for (const key of (page === 'coversheet'
        ? ['standardNumber', 'standardTitle', 'standardType', 'level', 'credits', 'version', 'studentName']
        : ['standardNumber', 'level', 'credits', 'version', 'studentName'])) {
        const definition = key === 'standardType' ? ['standardType', 'Standard type'] : common.find(def => def[0] === key);
        const control = input(definition, hidden[key].value, value => update(key, value), details, page + '-details-');
        feedbackDetails.set(key, control);
        if (page === 'coversheet') control.readOnly = true;
        if (key === 'version') { control.readOnly = true; versionControls.add(control); }
      }
      documentPanel.append(details);
    }
    const decisionControls = new Map(), fieldControls = new Map();
    const verifierComplete = () => Boolean((state.verifierName || '').trim() && (state.verificationDate || '').trim());
    let fillSightedBy = () => {};
    function updateRetentionDecision() {
      if (page !== 'internal' || !(state.retentionLocation || '').trim() || state.retentionAutoProcessed === 'Yes') return false;
      state.retentionAutoProcessed = 'Yes';
      state.retained = 'Yes';
      return true;
    }
    function refreshDecision(key) {
      const decision = decisionControls.get(key);
      if (!decision) return;
      decision.checkbox.checked = state[key] === 'Yes';
      decision.checkbox.indeterminate = !state[key] || state[key] === 'Not applicable';
      decision.answer.textContent = state[key] || 'Not recorded';
    }
    refreshRetention = () => {
      const control = fieldControls.get('retentionLocation');
      if (control) { control.value = state.retentionLocation || ''; control.readOnly = Boolean(currentStandardFolder()); }
      if (updateRetentionDecision()) {
        refreshDecision('retained');
        update('internal', JSON.stringify(state));
      }
    };
    let syncedVerificationDate = state.verificationDate || '';
    let consentRequest, consentNumber;
    function showConsentScope(cell) {
      const number = hidden.standardNumber.value;
      const note = el('p', '', { role: 'status' });
      cell.append(note, el('a', 'NZQA base scope of assessment', {
        href: 'https://www2.nzqa.govt.nz/ncea/ncea-for-teachers-and-schools/consent-to-assess-for-secondary-schools/base-scope-of-assessment-for-schools-bsas/',
        target: '_blank', rel: 'noopener noreferrer'
      }));
      if (state.consentBsasStandard && state.consentBsasStandard !== number) {
        if (state.consent === 'Yes') state.consent = '';
        delete state.consentBsasStandard;
        const decision = decisionControls.get('consent');
        decision.checkbox.checked = state.consent === 'Yes'; decision.checkbox.indeterminate = !state.consent || state.consent === 'Not applicable';
        decision.answer.textContent = state.consent || 'Not recorded';
        sync();
      }
      if (!/^\d{4,8}$/.test(number)) {
        note.textContent = 'Enter a standard number to check the NZQA base scope.';
        return;
      }
      if (year !== Number(todayInNewZealand().slice(0, 4))) {
        note.textContent = 'NZQA’s current base scope may not apply to this assessment year. Check consent manually.';
        return;
      }
      note.textContent = 'Checking the standard against NZQA’s base scope…';
      if (!consentRequest || consentNumber !== number) {
        consentNumber = number;
        consentRequest = request('standards/' + encodeURIComponent(number) + '/consent-scope');
        consentRequest.catch(() => { if (consentNumber === number) consentRequest = undefined; });
      }
      consentRequest.then(result => {
        if (!area.isConnected || !note.isConnected || hidden.standardNumber.value !== number) return;
        if (result.number !== number || typeof result.eligible !== 'boolean' || typeof result.expired !== 'boolean' ||
            typeof result.domain !== 'string' || !Number.isInteger(result.level) ||
            !(result.bsasLevel === null || Number.isInteger(result.bsasLevel)) ||
            result.eligible && (result.expired || result.bsasLevel === null || result.level > result.bsasLevel)) {
          throw new Error('NZQA returned an invalid consent result.');
        }
        const decision = decisionControls.get('consent');
        if (result.eligible) {
          if (!state.consent) {
            state.consent = 'Yes'; state.consentBsasStandard = number;
            decision.checkbox.checked = true; decision.checkbox.indeterminate = false; decision.answer.textContent = 'Yes';
            sync();
          }
          note.textContent = result.domain + ' (standard level ' + result.level + ', BSAS level ' + result.bsasLevel +
            ') is covered by NZQA’s current base scope.' + (state.consentBsasStandard === number ? ' Consent was set to Yes automatically.' : ' Your existing answer was kept.');
        } else {
          if (state.consentBsasStandard === number) {
            if (state.consent === 'Yes') state.consent = '';
            delete state.consentBsasStandard;
            decision.checkbox.checked = state.consent === 'Yes'; decision.checkbox.indeterminate = !state.consent || state.consent === 'Not applicable';
            decision.answer.textContent = state.consent || 'Not recorded';
            sync();
          }
          note.textContent = result.expired ? 'NZQA lists this standard as expired. Check consent and availability manually.' :
            'This standard was not verified within the current base scope. Check the school’s separate consent or extension manually.';
        }
      }).catch(error => {
        console.error('NZQA consent could not be verified.');
        if (!area.isConnected || !note.isConnected || hidden.standardNumber.value !== number) return;
        note.setAttribute('role', 'alert');
        note.textContent = 'Consent could not be verified: ' + error.message + ' Existing answers were kept; check NZQA and retry.';
      });
    }
    // Class size is display-only guidance and is never stored in the record or exported.
    const classSizes = new Map();
    function showClassSize(cell) {
      const note = el('div', '', { class: 'moderation-class-size', role: 'status' });
      cell.append(note);
      const recorded = (hidden.course.value || '').trim().toUpperCase();
      const courses = [...new Set(recorded.split(',').map(value => value.trim()).filter(Boolean))];
      if (!courses.length) {
        note.textContent = 'Add a Course Code (for example 13DTECH) in Record details to show the class size from Student Tracker.';
        return;
      }
      note.textContent = 'Loading class sizes from Student Tracker…';
      Promise.all(courses.map(async course => {
        if (!/^[A-Z0-9]{2,20}$/.test(course)) return { course, error: 'Invalid course code. Correct it in Record details.' };
        if (!classSizes.has(course)) {
          const pending = request('class-size/' + year + '?course=' + encodeURIComponent(course));
          pending.catch(() => classSizes.delete(course));
          classSizes.set(course, pending);
        }
        try { return { course, result: await classSizes.get(course) }; }
        catch (error) {
          console.error('Class size could not be loaded.');
          return { course, error: error.message + ' Reopen the sheet to retry.' };
        }
      })).then(entries => {
        if (!area.isConnected || (hidden.course.value || '').trim().toUpperCase() !== recorded) return;
        const complete = entries.every(({ result }) => result?.linked && !result.ambiguous);
        const sameTimetable = complete && new Set(entries.map(({ result }) => result.term)).size === 1;
        const total = complete && sameTimetable ? entries.reduce((sum, { result }) => sum + result.students, 0) : null;
        // A total under 6 needs no sampling, so the whole group counts as the random selection.
        const small = total !== null && total > 0 && total < 6;
        if (small && state.randomSelection !== 'Yes') {
          state.randomSelection = 'Yes';
          const decision = decisionControls.get('randomSelection');
          if (decision) { decision.checkbox.checked = true; decision.checkbox.indeterminate = false; decision.answer.textContent = 'Yes'; }
          sync();
        }
        note.replaceChildren();
        for (const { course, result, error } of entries) {
          const text = error ? 'unavailable. ' + error : !result.linked ? 'unavailable. No Student Tracker classes are linked for your departments.' :
            result.students + ' student' + (result.students === 1 ? '' : 's') +
            (result.term ? ' (Term ' + result.term + ' timetable)' : '') +
            (result.ambiguous ? ' (incomplete: check shared timetable class links in Student Tracker)' : '');
          note.append(el('p', course + ': ' + text));
        }
        if (total === null) {
          note.setAttribute('role', 'alert');
          note.append(el('p', 'Total students: unavailable. ' + (complete ?
            'Class counts use different timetables; check Student Tracker.' : 'Check the unavailable or incomplete class counts above.')));
        } else {
          note.append(el('p', 'Total students: ' + total + (small ? '. Under 6 students, so Random selection is set to Yes.' : '.')));
        }
        if (courses.length > 1) note.append(el('p', 'Total is the sum of class counts; students in multiple classes are counted more than once.'));
        note.append(el('p', 'Student Tracker counts are not included in the exported sheet.'));
      });
    }
    function todayInNewZealand() {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    }
    function sync(reconcileResults = false, onlyIfChanged = false, enteredResultsDate = false, preserveClearedResultsDate = false) {
      const before = JSON.stringify(state);
      if (page === 'internal') {
        for (const key of ['signatory', 'signatoryPosition', 'signatoryDate']) {
          const control = fieldControls.get(key);
          if (control) {
            const complete = verifierComplete();
            control.disabled = !complete;
            const value = complete ? state[key] || '' : '';
            if (control.value !== value) control.value = value;
          }
        }
        const students = (state.samples || []).filter(item => (item.student || '').trim());
        // Date moderated follows the verification date unless a different date was entered for that student.
        const verified = state.verificationDate || '';
        for (const item of students) {
          if ((item.moderatedDate || '') === verified || (item.moderatedDate && item.moderatedDate !== syncedVerificationDate)) continue;
          item.moderatedDate = verified;
          const control = moderatedControls.get(item);
          if (control) control.value = verified;
        }
        syncedVerificationDate = verified;
        const allReported = students.length > 0 && students.every(item => item.reportedGrade && item.reportedDate);
        if (reconcileResults && !(preserveClearedResultsDate && state.resultsDate === '') &&
            (students.length || state.resultsLoaded === 'Yes')) {
          if (!allReported) state.resultsLoaded = 'No';
          else if (state.resultsDate === undefined) {
            state.resultsDate = students.map(item => item.reportedDate).sort().at(-1);
            state.resultsLoaded = 'Yes';
          } else if (state.resultsDate) state.resultsLoaded = 'Yes';
        }
        if (enteredResultsDate && state.resultsDate && allReported) state.resultsLoaded = 'Yes';
        if (state.resultsLoaded === 'Yes' && state.resultsDate === undefined) {
          const dates = students.map(item => item.reportedDate).filter(Boolean).sort();
          if (dates.length) state.resultsDate = dates.at(-1);
        }
        refreshDecision('resultsLoaded');
        const date = fieldControls.get('resultsDate');
        if (date) date.value = state.resultsDate || '';
        const today = todayInNewZealand();
        if ((state.evaluationComments || '').trim() || /^\d{4}-\d{2}-\d{2}$/.test(state.resultsDate || '') && state.resultsDate < today) {
          state.reviewed = 'Yes';
        }
        const reviewed = decisionControls.get('reviewed');
        if (reviewed) {
          reviewed.checkbox.checked = state.reviewed === 'Yes';
          reviewed.checkbox.indeterminate = !state.reviewed || state.reviewed === 'Not applicable';
          reviewed.answer.textContent = state.reviewed || 'Not recorded';
        }
        fillRetentionLocation();
        updateRetentionDecision();
        refreshDecision('retained');
        const location = fieldControls.get('retentionLocation');
        if (location) location.value = state.retentionLocation || '';
      }
      if (page === 'schedule' && hidden.standardType.value === 'Unit') {
        state.merit = ''; state.excellence = '';
      }
      const json = JSON.stringify(state);
      if (onlyIfChanged && json === before) return;
      update(page, json);
      if (json.length > 20000) message('This document form exceeds its 20,000-character limit and cannot save. Shorten notes or use supporting Drive files.', true);
    }
    const editor = el('div');
    let sourceLinks = data.parentRecord ? {} : sourceScheduleLinks(values.internal.source);
    const sampleControls = new Map(), moderatedControls = new Map();
    async function fillMarkerDetails() {
      if (page !== 'internal') return;
      const failures = [];
      await Promise.all((state.samples || []).map(async item => {
        const scheduleRecord = item.markingScheduleRecord;
        if (!scheduleRecord || ((item.comments || '').trim() && item.markerGrade)) return;
        try {
          const result = await request(year + '/moderation/' + scheduleRecord);
          if (!area.isConnected) return;
          if (result.revision === 0 || result.content.parentRecord !== record) throw new Error('The linked marking schedule is missing or does not belong to this moderation record.');
          const schedule = JSON.parse(result.content.schedule || '{}');
          const grades = documents.internal.rows.fields.find(def => def[0] === 'markerGrade')[2];
          if (!state.samples.includes(item) || item.markingScheduleRecord !== scheduleRecord) return;
          let filled = false;
          for (const [key, value, valid, label] of [
            ['comments', schedule.markerComments, value => typeof value === 'string', 'comments are'],
            ['markerGrade', schedule.grade, value => grades.includes(value), 'grade is']
          ]) {
            if ((item[key] || '').trim() || value === undefined) continue;
            if (!valid(value)) {
              failures.push('The saved marker ' + label + ' invalid.');
            } else if (value) {
              item[key] = value;
              const control = sampleControls.get(item)?.get(key);
              if (control) control.value = value;
              filled = true;
            }
          }
          if (filled) sync();
        } catch (error) {
          console.error('Marker details could not be loaded.');
          failures.push(error.message);
        }
      }));
      if (failures.length && area.isConnected) {
        message('Some marker grades or comments could not be populated: ' + [...new Set(failures)].join(' ') + ' Existing entries are preserved. Reopen this sheet to retry.', true);
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
    let standardTypeVerified = false;
    function renderEditor() {
      editor.replaceChildren();
      decisionControls.clear(); fieldControls.clear();
      const groupPanels = [];
      const personBlocks = {
        critiqueName: 'Critiquer', critiqueSchool: 'Critiquer', critiqueDate: 'Critiquer',
        verifierName: 'Verifier', verifierSchool: 'Verifier', verifierPosition: 'Verifier', verificationDate: 'Verifier', verificationEvidence: 'Verifier',
        signatory: 'Sighted by (record only)', signatoryPosition: 'Sighted by (record only)', signatoryDate: 'Sighted by (record only)',
        evaluationName: 'Evaluator Details', evaluationPosition: 'Evaluator Details', evaluationDate: 'Evaluator Details'
      };
      for (const [title, definitions] of definition.groups) {
        const people = new Map();
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
        const decisions = definitions.filter(def => def[2] === yesNo && !(page === 'internal' && def[0] === 'randomSelection'));
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
              if (page === 'internal' && key === 'consent') delete state.consentBsasStandard;
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
            if (page === 'internal' && key === 'reviewed') {
              heading.append(el('p', 'Automatically set to Yes when evaluation comments are entered or the KAMAR loaded date has passed, even without comments. It remains Yes if those details are later cleared.'));
            }
            if (page === 'internal' && key === 'resultsLoaded') {
              heading.append(el('p', 'Automatically set to Yes when a loaded date is recorded and at least one student is named, with a reported grade and date for every named student.'));
            }
            if (page === 'internal' && key === 'retained') {
              heading.append(el('p', 'A location sets this to Yes, including an automatically prepared folder. A folder path alone does not confirm that the work is retained.'));
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
            cell.append(checkbox, answer);
            const relatedKey = page === 'internal' && (key === 'resultsLoaded' ? 'resultsDate' : key === 'retained' ? 'retentionLocation' : '');
            if (relatedKey) {
              const definition = definitions.find(def => def[0] === relatedKey);
              const control = input(definition, state[relatedKey], value => {
                const changed = state[relatedKey] !== value;
                state[relatedKey] = value;
                if (relatedKey === 'retentionLocation' && changed) state.retentionAutoProcessed = '';
                sync(false, false, relatedKey === 'resultsDate' && changed && Boolean(value));
              }, cell, page + '-');
              fieldControls.set(relatedKey, control);
              if (relatedKey === 'retentionLocation' && currentStandardFolder()) control.readOnly = true;
            }
            row.append(heading, cell); body.append(row);
            if (page === 'internal' && key === 'consent') showConsentScope(cell);
          }
          table.append(body); group.append(table);
        }
        for (const def of definitions) {
          if (page === 'internal' && ['resultsDate', 'retentionLocation'].includes(def[0])) continue;
          if (['schedule', 'coversheet'].includes(page) && hidden.standardType.value === 'Unit' && ['merit', 'excellence'].includes(def[0])) continue;
          if (page === 'coversheet' && def[0] === 'higherGrades' && !(state.higherGrades || '').trim()) continue;
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
          const person = page === 'internal' && personBlocks[def[0]];
          let parent = grid;
          if (person) {
            if (!people.has(person)) {
              const block = el('fieldset', '', { class: 'moderation-detail-block moderation-person-block' });
              block.append(el('legend', person));
              if (person === 'Sighted by (record only)') block.append(el('p',
                'Enter the verifier name and verification date to show and enable these fields. Existing details are retained but hidden until verification is complete.'));
              const fields = el('div', '', { class: 'moderation-fields' });
              block.append(fields); people.set(person, { block, fields });
            }
            parent = people.get(person).fields;
          }
          const sightedField = page === 'internal' && ['signatory', 'signatoryPosition', 'signatoryDate'].includes(def[0]);
          const control = input(def, sightedField && !verifierComplete() ? '' : state[def[0]], value => {
            const previous = state[def[0]];
            state[def[0]] = value;
            if (page === 'internal' && def[0] === 'verifierName' && value !== previous && state.verifierId) {
              delete state.verifierId;
              message('Saved verifier association removed because the name changed. Use Verifiers to link the correct contact.');
            }
            if (page === 'internal' && def[0] === 'evaluationComments' && value !== previous &&
                value.trim() && !(state.evaluationDate || '').trim()) {
              state.evaluationDate = todayInNewZealand();
              const date = fieldControls.get('evaluationDate');
              if (date) date.value = state.evaluationDate;
            }
            sync();
            if (page === 'internal' && ['verifierName', 'verificationDate'].includes(def[0])) fillSightedBy();
          }, parent, page + '-', page === 'schedule' && def[0] === 'markerComments' ||
            page === 'internal' && def[0] === 'evaluationComments');
          fieldControls.set(def[0], control);
          if (sightedField) control.disabled = !verifierComplete();
          if (page === 'internal' && def[0] === 'retentionLocation' && currentStandardFolder()) control.readOnly = true;
        }
        const personPanels = [...people.values()].map(item => item.block);
        if (page === 'internal' && title === 'Assessment Evaluation') group.append(...personPanels);
        if (grid.children.length) group.append(grid);
        if (page !== 'internal' || title !== 'Assessment Evaluation') group.append(...personPanels);
        groupPanels.push(group);
        if (page === 'internal' && title === 'Assessment Evaluation') {
          group.append(el('p', 'Saved evaluations are automatically shared with signed-in staff in the selected Resource Library entry. Choose an entry above to share this evaluation; avoid student names and identifiers in comments.'));
        }
      }
      editor.append(...(page === 'internal' ? groupPanels.slice(0, 2) : groupPanels));
      if (definition.rows) {
        const rows = definition.rows, section = el('section', '', { class: 'moderation-panel' });
        section.append(el('h3', rows.title));
        let refreshRandomSelection = () => {};
        if (page === 'internal') {
          const random = el('div', '', { class: 'moderation-random-selection' });
          const heading = el('strong', 'Random selection procedure used (if required)', { id: 'moderation-random-selection-label' });
          const details = el('div');
          const id = 'moderation-internal-randomSelection';
          const checkbox = el('input', '', { type: 'checkbox', id, 'aria-labelledby': 'moderation-random-selection-label',
            'aria-describedby': id + '-answer' });
          checkbox.type = 'checkbox'; checkbox.checked = state.randomSelection === 'Yes';
          checkbox.indeterminate = !state.randomSelection || state.randomSelection === 'Not applicable';
          const answer = el('span', state.randomSelection || 'Not recorded', { id: id + '-answer' });
          decisionControls.set('randomSelection', { checkbox, answer });
          checkbox.addEventListener('change', () => {
            checkbox.indeterminate = false;
            state.randomSelection = checkbox.checked ? 'Yes' : 'No';
            answer.textContent = state.randomSelection; sync();
          });
          const tick = el('label', '', { for: id });
          tick.append(checkbox, answer); details.append(tick); showClassSize(details);
          const initialsPanel = el('div');
          initialsPanel.append(el('p', 'Enter the initials of the randomly selected students.'));
          const table = el('table', '', { class: 'moderation-random-initials' });
          const body = el('tbody'), controls = [];
          for (const [index, letter] of ['A', 'B', 'C', 'D'].entries()) {
            const row = el('tr'), label = el('th', '', { scope: 'row' }), cell = el('td');
            const inputId = 'moderation-internal-randomInitials' + letter;
            label.append(el('label', 'Student ' + letter, { for: inputId }));
            const control = el('input', '', { id: inputId, type: 'text', 'aria-label': 'Student ' + letter + ' initials',
              autocomplete: 'off', maxlength: '10' });
            control.maxLength = 10;
            const match = (state.samples?.[index]?.student || '').match(new RegExp('^Student ' + letter + ' - (\\p{L}{1,10})$', 'iu'));
            control.value = state['randomInitials' + letter] || match?.[1] || '';
            controls.push({ letter, index, control });
            cell.append(control); row.append(label, cell); body.append(row);
          }
          table.append(body);
          const status = el('p', '', { role: 'status', 'aria-live': 'polite' });
          initialsPanel.append(table, status); random.append(heading, details, initialsPanel); section.append(random);
          refreshRandomSelection = (tickWhenComplete = false) => {
            const conflicts = [], invalid = [];
            for (const { letter, index, control } of controls) {
              const value = control.value.trim().toUpperCase();
              if (value && !/^\p{L}{1,10}$/u.test(value)) { invalid.push(letter); continue; }
              if (value && (state.samples?.[index]?.student || '').trim() !== 'Student ' + letter + ' - ' + value) conflicts.push(letter);
            }
            status.setAttribute('role', invalid.length || conflicts.length ? 'alert' : 'status');
            status.textContent = invalid.length ? 'Use up to 10 letters for initials: Student ' + invalid.join(', Student ') + '.' :
              conflicts.length ? 'Existing evidence entries were not changed for Student ' + conflicts.join(', Student ') +
                '. Check their identifiers before confirming the selection.' :
                'Existing entries and linked marking are preserved.';
            if (tickWhenComplete && !invalid.length && !conflicts.length && controls.every(({ control }) => control.value.trim())) {
              state.randomSelection = 'Yes'; checkbox.checked = true; checkbox.indeterminate = false; answer.textContent = 'Yes';
            }
          };
          for (const { letter, index, control } of controls) control.addEventListener('input', () => {
            const value = control.value.trim().toUpperCase();
            if (value && !/^\p{L}{1,10}$/u.test(value)) { refreshRandomSelection(); return; }
            control.value = value;
            state['randomInitials' + letter] = value;
            if (value) {
              while (state.samples.length <= index) state.samples.push({});
              const sample = state.samples[index], desired = 'Student ' + letter + ' - ' + value;
              const empty = !Object.entries(sample).some(([key, item]) => key !== 'randomSlot' && Boolean(item));
              const editable = sample.randomSlot === letter && !Object.entries(sample).some(([key, item]) =>
                !['randomSlot', 'student'].includes(key) && Boolean(item));
              if (empty || editable) { sample.student = desired; sample.randomSlot = letter; }
            }
            refreshRandomSelection(true); sync(true); renderRows();
          });
          refreshRandomSelection();
        }
        if (page === 'internal') section.append(el('p', 'Each entry has its own marking schedule. Enter the student identifier, then choose Create / open marking schedule to import an existing document or complete a blank form.'));
        state[rows.key] ||= [];
        const list = el('div');
        function renderRows() {
          list.replaceChildren();
          sampleControls.clear(); moderatedControls.clear();
          if (page === 'schedule') {
            list.setAttribute('class', 'moderation-requirements-scroll');
            const table = el('table', '', { class: 'moderation-requirements-table' });
            const graded = standardTypeVerified && hidden.standardType.value === 'Achievement';
            const grades = graded ? ['N', 'A', 'M', 'E'] : [];
            table.append(el('caption', graded
              ? 'Choose each requirement level, then tick N if not met or its level if met. Untick to clear. Set the overall grade separately.'
              : 'Record the requirements, evidence and judgements here. Select the overall grade under Marking decision.'));
            const head = el('thead'), headings = el('tr');
            for (const label of ['Key requirements (list)', ...grades, 'Describe or attach the evidence considered', 'Explain how the judgement was made']) {
              headings.append(el('th', label, { scope: 'col', ...(grades.includes(label) ? { class: 'moderation-grade-heading' } : {}) }));
            }
            head.append(headings); table.append(head);
            const body = el('tbody');
            state[rows.key].forEach((item, i) => {
              const row = el('tr'), requirement = el('td');
              requirement.append(el('strong', 'Requirement ' + (i + 1)));
              input(rows.fields.find(def => def[0] === 'requirement'), item.requirement,
                value => { item.requirement = value; sync(); }, requirement, page + '-' + i + '-', true);
              if (graded) input(rows.metadata.find(def => def[0] === 'level'), item.level,
                value => { item.level = value; sync(); renderRows(); }, requirement, page + '-' + i + '-');
              button('Remove requirement ' + (i + 1), () => {
                if (!confirm('Remove this requirement?')) return;
                state[rows.key].splice(i, 1); sync(); renderRows();
              }, requirement, 'danger');
              const allowed = ['N', ...(item.level ? [item.level] : [])];
              if (graded && item.grade && !allowed.includes(item.grade)) {
                requirement.append(el('p', 'Saved grade: ' + item.grade + '. Review the level, select an available tick, or clear the saved grade.'));
                button('Clear saved grade for requirement ' + (i + 1), () => {
                  item.grade = ''; sync(); renderRows();
                }, requirement, 'danger');
              }
              row.append(requirement);
              const boxes = [];
              for (const grade of grades) {
                const cell = el('td', '', { class: 'moderation-grade-tick' });
                if (allowed.includes(grade)) {
                  const box = el('input', '', { type: 'checkbox', 'aria-label': grade + ' for requirement ' + (i + 1) });
                  box.type = 'checkbox'; box.checked = item.grade === grade;
                  boxes.push({ box, grade });
                  box.addEventListener('change', () => {
                    const hadConflict = item.grade && !allowed.includes(item.grade);
                    item.grade = box.checked ? grade : '';
                    for (const entry of boxes) entry.box.checked = item.grade === entry.grade;
                    sync();
                    if (hadConflict) renderRows();
                  });
                  cell.append(box);
                } else cell.append(el('span', '—'));
                row.append(cell);
              }
              for (const key of ['evidence', 'judgement']) {
                const cell = el('td');
                input(rows.fields.find(def => def[0] === key), item[key],
                  value => { item[key] = value; sync(); }, cell, page + '-' + i + '-', true);
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
              const control = input(def, item[def[0]], value => {
                item[def[0]] = value;
                if (page === 'internal' && def[0] === 'student') {
                  if (item.randomSlot && value !== 'Student ' + item.randomSlot + ' - ' + (state['randomInitials' + item.randomSlot] || '')) delete item.randomSlot;
                  refreshRandomSelection(true);
                }
                sync(['student', 'reportedGrade', 'reportedDate'].includes(def[0]));
              },
                page === 'internal' && !primary ? reporting : grid, page + '-' + i + '-');
              if (primary) control.setAttribute('class', 'moderation-student-highlight');
              if (page === 'internal' && ['comments', 'markerGrade'].includes(def[0])) {
                if (!sampleControls.has(item)) sampleControls.set(item, new Map());
                sampleControls.get(item).set(def[0], control);
              }
              if (page === 'internal' && def[0] === 'moderatedDate') moderatedControls.set(item, control);
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
                    const standardFolder = await ensureStandardFolder(hidden.folderId.value,
                      hidden.level.value, hidden.standardNumber.value, hidden.topic.value);
                    await access.ensureStudentFolder(standardFolder.id, i);
                    rememberStandardFolder(standardFolder); await persist();
                    if (existing.revision === 0) {
                      const content = Object.fromEntries(common.map(([key]) => [key, hidden[key].value]));
                      Object.assign(content, { title: (hidden.standardNumber.value + ' — ' + student + ' — Marking Schedule').slice(0, 500),
                        studentName: student, studentId: '', parentRecord: record,
                        folderId: hidden.folderId.value, folderName: hidden.folderName.value, topic: hidden.topic.value,
                        standardFolder: hidden.standardFolder.value,
                        ...(hidden.resourceLibrary.value ? { resourceLibrary: hidden.resourceLibrary.value } : {}),
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
              const markingStudents = JSON.parse(data.markingStudents || '[]');
              if (state[rows.key].slice(i).some(sample => sample.markingScheduleRecord &&
                  markingStudents.some(student => student.record === sample.markingScheduleRecord))) {
                message('This entry cannot be removed because it would remove or shift a sample linked to a Standard Marking Record. Existing marking and folders must be preserved.', true);
                return;
              }
              if (!confirm('Remove this evidence entry?' + (item.markingScheduleRecord ? ' Its individual marking schedule will remain saved in Marking Records.' : ''))) return;
              state[rows.key].splice(i, 1); refreshRandomSelection(); sync(true); renderRows();
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
      input(['notes', 'Supporting notes', 'area'], state.notes, value => { state.notes = value; sync(); }, support, page + '-', page === 'schedule');
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
      const incomingDocument = page === 'schedule' ? criteriaSources(imported.document, hidden.standardNumber.value) : imported.document;
      const criteriaCopied = page === 'schedule' && ['achieved', 'merit', 'excellence'].some(key => empty(merged[key]) && !empty(incomingDocument[key]));
      const fields = [...definition.groups.flatMap(([, fields]) => fields), ['notes'], ['resources']];
      for (const [key, , kind] of fields) {
        const value = incomingDocument[key];
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
      if (criteriaCopied) merged.notes = appendCitations(merged.notes, nzqaCriteriaCitations(incomingDocument.notes, hidden.standardNumber.value));
      const rows = merged.requirements || [];
      let requirementCopied = false;
      for (const incoming of (page === 'schedule' ? incomingDocument.requirements || [] : [])) {
        if (isSchedulePlaceholder(incoming)) continue;
        if (!definition.rows.fields.some(([key]) => !empty(incoming[key]))) continue;
        const name = (incoming.requirement || '').trim();
        const matches = name ? rows.filter(row => (row.requirement || '').trim() === name &&
          (!row.level || !incoming.level || row.level === incoming.level)) : [];
        if (matches.length === 1) {
          for (const [key] of definition.rows.fields) {
            if (empty(matches[0][key]) && !empty(incoming[key])) matches[0][key] = incoming[key];
          }
          if (!matches[0].level && incoming.level) { matches[0].level = incoming.level; requirementCopied = true; }
        } else if (!rows.some(row => [...definition.rows.fields, ...(definition.rows.metadata || [])]
          .every(([key]) => (row[key] || '').trim() === (incoming[key] || '').trim()))) {
          rows.push({ ...incoming }); requirementCopied = true;
        }
      }
      if (requirementCopied) merged.notes = appendCitations(merged.notes, nzqaCriteriaCitations(incomingDocument.notes, hidden.standardNumber.value));
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
          const old = (state.samples || []).filter(item => (item.student || '').trim() === name);
          if (name && imported.document.samples.filter(item => (item.student || '').trim() === name).length === 1) {
            const linked = old.filter(item => item.markingScheduleRecord);
            if (!sample.markingScheduleRecord && linked.length === 1) sample.markingScheduleRecord = linked[0].markingScheduleRecord;
            if (old.length === 1 && old[0].randomSlot) sample.randomSlot = old[0].randomSlot;
          }
        }
      }
      if (page === 'internal') {
        const markingStudents = JSON.parse(data.markingStudents || '[]');
        const replacementSamples = imported.document.samples || [];
        if ((state.samples || []).some((sample, index) => sample.markingScheduleRecord &&
            markingStudents.some(student => student.record === sample.markingScheduleRecord) &&
            replacementSamples[index]?.markingScheduleRecord !== sample.markingScheduleRecord)) {
          throw new Error('This import would remove or shift a sample linked to a Standard Marking Record. Existing marking and folders were left unchanged.');
        }
        const formOnly = ['notes', 'resources', ...definition.groups.flatMap(([, fields]) => fields)
          .filter(([key, , kind]) => kind === 'url' || key === 'signatoryPosition').map(([key]) => key),
          ...['A', 'B', 'C', 'D'].map(letter => 'randomInitials' + letter)];
        for (const key of formOnly) {
          if (imported.document[key] === undefined && state[key] !== undefined) imported.document[key] = state[key];
        }
      }
      for (const [key, value] of Object.entries(imported.common)) if (key !== 'version' && hidden[key] && value) update(key, value);
      for (const [key, control] of feedbackDetails) control.value = hidden[key].value;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, imported.document); fillSourceLinks(); sync(true); renderEditor(); fillSightedBy();
      await fillSetupFolderLink();
      await fillMarkerDetails();
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
    if (data.additionalMarking === 'Yes') driveButton('Prepare / rename student folder', async () => {
      if (!hidden.folderId.value || !hidden.level.value || !hidden.standardNumber.value) {
        throw new Error('Choose the assessment folder and standard details before preparing the student folder.');
      }
      await persist();
      const folder = await prepareRecordFolders();
      await persist();
      message('Student folder ready: ' + folder.name + '. Existing documents were not moved or changed.');
    }, actions);
    documentPanel.append(actions);
    area.append(documentPanel, feedback);
    if (['internal', 'schedule'].includes(page)) area.append(libraryPanel);
    let refreshNzqaPreview = () => {};
    if (page === 'schedule' || page === 'coversheet') {
      const panel = el('section', '', { class: 'moderation-panel' });
      const preview = el('div');
      const heading = el('h3'), description = el('p');
      panel.append(heading, description, preview);
      let loading = false;
      const previewButton = button('Preview NZQA Standard', async () => {
        if (loading) return;
        loading = true;
        preview.replaceChildren();
        try {
          const number = hidden.standardNumber.value;
          if (!number) throw new Error('Choose a standard in Record details first.');
          const type = hidden.standardType.value;
          if (!['Unit', 'Achievement'].includes(type)) throw new Error('The standard type is not verified. Reopen the form and retry.');
          const path = 'standards/' + encodeURIComponent(number) + '/' + (type === 'Unit' ? 'unit-preview' : 'achievement-preview');
          const details = await request(path);
          if (!area.isConnected) return;
          if (number !== hidden.standardNumber.value || type !== hidden.standardType.value || details.number !== number || details.standardType !== type ||
              details.version !== hidden.version.value || !details.criteria || !Array.isArray(details.requirements)) {
            throw new Error('The standard or PDF version changed. Check Record details and retry.');
          }
          const snapshot = JSON.stringify(state);
          const citation = 'Source: NZQA, ' + type + ' Standard ' + number + ', version ' + details.version + ' — ' + details.url;
          preview.append(el('p', 'NZQA standard ' + number + ', version ' + details.version + '. Review each selection before applying.'),
            el('a', 'Open official NZQA standard PDF', { href: details.url, target: '_blank', rel: 'noopener noreferrer' }));
          const selections = [];
          const criteria = type === 'Unit' ? [['achieved', 'Outcome']] : [['achieved', 'Achieved'], ['merit', 'Merit'], ['excellence', 'Excellence']];
          for (const [key, label] of criteria) {
            if (typeof details.criteria[key] !== 'string' || !details.criteria[key].trim()) throw new Error('The PDF did not contain the expected criteria.');
            const row = el('div'), box = el('input', '', { type: 'checkbox', 'aria-label': 'Import ' + label + ' criteria' });
            box.type = 'checkbox'; box.checked = !(state[key] || '').trim();
            box.disabled = !box.checked;
            row.append(box, el('strong', label + (box.disabled ? ' (existing text retained)' : '')),
              el('pre', details.criteria[key], { class: 'moderation-nzqa-preview' }));
            selections.push({ box, key, text: details.criteria[key] }); preview.append(row);
          }
          if (page === 'schedule') {
            preview.append(el('h4', type === 'Unit' ? 'Performance criteria' : 'Possible standard requirements'),
              el('p', type === 'Unit' ? 'Review the criteria and ranges against the official PDF. Select those relevant to this assessment; existing requirements and marking are retained.' :
                'Select individual requirements appropriate to this assessment. They are standard-wide guidance, not a complete assessment-specific checklist. Previously saved grouped requirements remain unchanged.'));
            button('Select all requirements', () => {
              for (const selection of selections) if (!selection.key && !selection.box.disabled) selection.box.checked = true;
            }, preview);
            if (!details.requirements.length) preview.append(el('p', 'No requirements could be extracted reliably. Use the official PDF to add requirements manually.'));
            let previousContext;
            details.requirements.forEach((text, index) => {
              const separator = type === 'Unit' ? -1 : text.indexOf('\n');
              const context = separator < 0 ? '' : text.slice(0, separator);
              const level = context ? requirementLevel(context, details.criteria) : '';
              if (context && context !== previousContext) {
                const label = { A: 'Achieved', M: 'Merit', E: 'Excellence' }[level];
                preview.append(el('h5', label ? label + ' requirements' : 'Standard requirements'), el('p', context));
              }
              previousContext = context;
              const row = el('div'), box = el('input', '', { type: 'checkbox', 'aria-label': 'Import proposed requirement ' + (index + 1) });
              box.type = 'checkbox';
              row.append(box, el('strong', 'Proposed requirement ' + (index + 1)),
                el('pre', separator < 0 ? text : text.slice(separator + 1), { class: 'moderation-nzqa-preview' }));
              selections.push({ box, text: separator < 0 ? text : text.slice(separator + 1).replace(/^[\u2022\u25cf\uf0b7]\s*/, ''), level }); preview.append(row);
            });
          }
          button('Apply selected NZQA details', async () => {
            if (loading) return;
            loading = true;
            try {
              const latest = await request(path);
              if (!area.isConnected) return;
              if (number !== hidden.standardNumber.value || type !== hidden.standardType.value || latest.standardType !== type || details.version !== hidden.version.value ||
                  JSON.stringify(state) !== snapshot || latest.number !== number || latest.version !== details.version ||
                  latest.url !== details.url || JSON.stringify(latest.criteria) !== JSON.stringify(details.criteria) ||
                  JSON.stringify(latest.requirements) !== JSON.stringify(details.requirements)) {
                throw new Error('The form or NZQA standard changed while the preview was open. Preview again before applying.');
              }
              const next = page === 'schedule' ? { ...state, requirements: [...(state.requirements || [])] } : { ...state };
              let added = 0;
              for (const selection of selections.filter(item => item.box.checked && !item.box.disabled)) {
                const text = selection.text;
                if (text.length > 8000) throw new Error('A selected item exceeds the 8,000-character field limit.');
                if (selection.key) {
                  if (!(next[selection.key] || '').trim()) {
                    next[selection.key] = text;
                    next.notes = appendCitations(next.notes, [citation]);
                    added++;
                  }
                } else if (!next.requirements.some(row => row.requirement === text && (row.level || '') === selection.level)) {
                  next.requirements.push({ requirement: text, ...(selection.level ? { level: selection.level } : {}) });
                  next.notes = appendCitations(next.notes, [citation]);
                  added++;
                }
              }
              if (!added) throw new Error('Select at least one new item to apply.');
              if ((next.requirements || []).length > 50 || (next.notes || '').length > 8000 || JSON.stringify(next).length > 20000) {
                throw new Error(page === 'schedule' ? 'The selected items exceed the schedule limit. Select fewer requirements.' :
                  'The selected items exceed the coversheet limit. Select fewer criteria.');
              }
              Object.assign(state, next); sync(); renderEditor();
              preview.replaceChildren();
              await persist();
              message('Selected NZQA details saved. Existing marking and Drive documents are unchanged; review the form before updating Drive.');
            } catch (error) {
              console.error('NZQA details could not be applied.');
              message(error.message, true);
            } finally { loading = false; }
          }, preview);
        } catch (error) {
          preview.replaceChildren();
          preview.append(el('p', error.message, { role: 'alert' }));
          console.error('NZQA standard preview failed.');
          message(error.message, true);
        } finally { loading = false; }
      }, panel);
      refreshNzqaPreview = () => {
        const type = hidden.standardType.value;
        const label = ['Unit', 'Achievement'].includes(type) ? type + ' Standard' : 'Standard';
        heading.textContent = 'NZQA ' + label + ' details';
        previewButton.textContent = 'Preview NZQA ' + label;
        description.textContent = page === 'schedule'
          ? 'Preview the official criteria and select requirements relevant to this assessment. Check the PDF: some details or layouts may not be extracted. Existing criteria and marking are never replaced.'
          : 'Preview the official criteria and check them against the PDF before applying. Existing criteria and results are never replaced.';
      };
      refreshNzqaPreview();
      area.append(panel);
    }
    area.append(editor);
    renderEditor(); prepareDrive();
    if (page === 'feedback') Promise.resolve().then(() => {
      if (!area.isConnected) return;
      try { if (reconcileFeedbackLinks()) renderEditor(); }
      catch (error) {
        console.error('Confirmation resource links could not be reconciled.');
        message(error.message, true);
      }
    });
    if (page === 'internal') Promise.resolve().then(() => { if (area.isConnected) sync(true, true, false, true); });
    if (page === 'internal' && assessorName) {
      const normal = normaliseStaffName;
      const fill = (key, value) => {
        if ((state[key] || '').trim() || !value) return false;
        state[key] = value;
        const control = fieldControls.get(key);
        if (control) control.value = value;
        return true;
      };
      let staffRequest;
      function fillPeople(people) {
        if (!area.isConnected) return;
        const eligible = person => person.name !== 'signatory' || verifierComplete();
        let changedName = false;
        for (const person of people.filter(eligible)) {
          if (person.name === 'evaluationName' && !(state.evaluationName || '').trim() &&
              [state.evaluationPosition, state.evaluationDate, state.evaluationComments].some(value => (value || '').trim())) continue;
          changedName = fill(person.name, assessorName) || changedName;
        }
        if (changedName) sync();
        const needsPosition = () => people.filter(person => eligible(person) && !(state[person.position] || '').trim() &&
          normal(state[person.name]) === normal(assessorName));
        if (!needsPosition().length) return;
        if (!staffRequest) staffRequest = request('staff');
        const finish = (position, note) => {
          if (!area.isConnected) return;
          const remaining = needsPosition();
          let changedPosition = false;
          for (const person of remaining) changedPosition = fill(person.position, position) || changedPosition;
          if (changedPosition) sync();
          if (note && remaining.length) message(remaining.map(person => person.label).join(' and ') + ' uses your name. ' + note);
        };
        staffRequest.then(result => {
          const choices = staffLeadershipPositions(result.departments || [], assessorName, hidden.department.value);
          finish(choices.length === 1 ? choices[0] : '', choices.length === 1 ? '' :
            (choices.length ? 'You hold several leadership roles; ' : 'No HOL, HOLA or TIC role is recorded for you; ') + 'enter the Position.');
        }).catch(() => {
          staffRequest = undefined;
          console.error('Signatory and evaluator positions could not be loaded.');
          finish('', 'Your position could not be loaded. Enter the Position or reopen the sheet to retry.');
        });
      }
      const sighted = { name: 'signatory', position: 'signatoryPosition', label: 'Sighted by' };
      fillSightedBy = () => fillPeople([sighted]);
      fillPeople([sighted, { name: 'evaluationName', position: 'evaluationPosition', label: 'Evaluator' }]);
    }
    fillMarkerDetails();
    if (['schedule', 'coversheet'].includes(page) && hidden.standardNumber.value) {
      loadStandardDetails().then(details => {
        if (!area.isConnected) return;
        if (details.number !== hidden.standardNumber.value || !['Unit', 'Achievement'].includes(details.standardType)) throw new Error('NZQA did not identify the selected standard type.');
        update('standardType', details.standardType);
        standardTypeVerified = true;
        if (feedbackDetails.has('standardType')) feedbackDetails.get('standardType').value = details.standardType;
        if (page === 'schedule' && details.standardType === 'Unit') {
          const criteria = (state.achieved || '').trim();
          if ((!criteria || /^achieved[.:]?$/i.test(criteria)) && details.outcomes?.length) {
            state.achieved = details.outcomes.join('\n\n');
          } else if ((!criteria || /^achieved[.:]?$/i.test(criteria)) && !details.outcomes?.length) {
            message('The Unit Standard PDF contains no recognised Outcome statements. Enter the Achieved Grade Criteria manually; saved marking is unchanged.', true);
          }
        }
        if (page === 'schedule' && details.standardType === 'Unit') sync();
        refreshNzqaPreview();
        renderEditor();
      }).catch(error => {
        console.error('Standard grade criteria could not be verified.');
        if (area.isConnected) message('Standard type could not be verified: ' + error.message + ' Reopen the form to retry. Existing criteria have not been cleared.', true);
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
