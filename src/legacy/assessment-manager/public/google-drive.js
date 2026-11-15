(() => {
  'use strict';
  let libraries;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 20000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        reject(new Error('Google Drive could not load. Check your connection and browser restrictions, then retry.'));
      }
      script.src = src;
      script.async = true;
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = fail;
      document.head.append(script);
    });
  }
  function loadLibraries() {
    if (!libraries) {
      libraries = Promise.all([
        globalThis.google?.accounts?.oauth2 ? Promise.resolve() : loadScript('https://accounts.google.com/gsi/client'),
        globalThis.gapi ? Promise.resolve() : loadScript('https://apis.google.com/js/api.js')
      ]).then(() => new Promise((resolve, reject) => {
        globalThis.gapi.load('picker', {
          callback: resolve,
          onerror: () => reject(new Error('Google Drive file chooser could not load. Please retry.')),
          timeout: 20000,
          ontimeout: () => reject(new Error('Google Drive file chooser timed out. Please retry.'))
        });
      })).catch(error => { libraries = undefined; throw error; });
    }
    return libraries;
  }
  function resourceLink(value) {
    const line = value.trim();
    const separator = /^https?:\/\//i.test(line) ? -1 : line.lastIndexOf(' | ');
    return separator < 0 ? { url: line, name: line } :
      { url: line.slice(separator + 3).trim(), name: line.slice(0, separator).trim() };
  }
  function appendFiles(value, documents, maximum = 20000) {
    if (!Array.isArray(documents) || !documents.length) throw new Error('Google returned no selected files. Please try again.');
    const urls = documents.map(item => {
      if (typeof item.url !== 'string') throw new Error('Google returned a file without a valid link. Please try again.');
      const url = new URL(item.url);
      if (url.protocol !== 'https:' || !['docs.google.com', 'drive.google.com'].includes(url.hostname) || url.username || url.password) {
        throw new Error('Google returned an unsupported file link. No links were added.');
      }
      const name = typeof item.name === 'string' ? item.name.replace(/[\r\n]+/g, ' ').trim() : '';
      return { url: url.href, line: name ? name + ' | ' + url.href : url.href };
    });
    const seen = new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      try { return new URL(resourceLink(line).url).href; } catch { return line; }
    }));
    const added = urls.filter(({ url }) => {
      if (seen.has(url)) return false;
      seen.add(url); return true;
    });
    const next = value + (added.length ? (value && !value.endsWith('\n') ? '\n' : '') + added.map(item => item.line).join('\n') : '');
    if (next.length > maximum) throw new Error('These links exceed the resource text box limit. Remove some links or select fewer files. No links were added.');
    return { value: next, count: added.length };
  }
  function mountSetup(host, { el, request }) {
    host.append(el('h2', 'Google Drive Setup', { class: 'paper-heading' }),
      el('p', 'Choose Drive files from Resource links in any Period Planner or Moderation document form. In Moderation, choose your own Assessment and Moderation folder to save generated documents. Google asks for permission when you use Drive; access tokens stay in memory only. Existing file sharing permissions stay unchanged; new documents inherit their chosen folder’s permissions.'));
    const button = el('button', 'Check Google Drive setup', { type: 'button' });
    const feedback = el('p', '', { role: 'status', 'aria-live': 'polite' });
    host.append(button, feedback);
    async function check() {
      button.disabled = true;
      feedback.setAttribute('role', 'status');
      feedback.textContent = 'Checking Google Drive setup...';
      try {
        const config = await request();
        if (!host.isConnected) return;
        if (!config.configured) throw new Error('Google Drive is not configured. Contact your planner administrator. You can still paste resource links into your period plans.');
        await loadLibraries();
        if (!host.isConnected) return;
        feedback.textContent = 'Google Drive configuration is present and the chooser libraries loaded. Open a Period Planner and choose files to approve access and test file selection.';
      } catch (error) {
        console.error('Google Drive setup check failed.');
        if (!host.isConnected) return;
        feedback.setAttribute('role', 'alert');
        feedback.textContent = error.message;
      } finally { if (host.isConnected) button.disabled = false; }
    }
    button.addEventListener('click', check);
    check();
  }
  function mount(host, { el, resources, request, openSetup, label }) {
    const button = el('button', label || 'Choose from Google Drive', { type: 'button', 'aria-haspopup': 'dialog' });
    const feedback = el('p', 'Preparing Google Drive...', { role: 'status', 'aria-live': 'polite' });
    host.append(button, feedback);
    let client, config, picker;
    function message(text, error = false) {
      feedback.textContent = text;
      feedback.setAttribute('role', error ? 'alert' : 'status');
    }
    function finish(text, error = false) {
      if (picker) { picker.dispose(); picker = undefined; }
      if (!host.isConnected) return;
      button.disabled = false;
      message(text, error);
      button.focus();
    }
    function selected(result) {
      const action = globalThis.google.picker.Action;
      if (result.action !== action.PICKED && result.action !== action.CANCEL) return;
      if (!host.isConnected || !resources.isConnected) {
        if (picker) { picker.dispose(); picker = undefined; }
        return;
      }
      if (result.action === action.CANCEL) { finish('Selection cancelled. Your resource links are unchanged.'); return; }
      try {
        const next = appendFiles(resources.value, result.docs, resources.maxLength);
        if (next.count) {
          resources.value = next.value;
          resources.dispatchEvent(new Event('input', { bubbles: true }));
        }
        finish(next.count ? next.count + ' file link(s) added. Planner autosave will save these links.' : 'Those links are already in this plan. No duplicates were added.');
      } catch (error) { finish(error.message, true); }
    }
    async function prepare() {
      button.disabled = true;
      message('Preparing Google Drive...');
      try {
        config = await request();
        if (!host.isConnected) return;
        if (!config.configured) throw new Error('Google Drive is not ready. Open Google Drive Setup in Setup My Planner. You can still paste links below.');
        await loadLibraries();
        if (!host.isConnected) return;
        client = globalThis.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId, scope: config.scope, include_granted_scopes: false,
          callback: token => {
            if (!host.isConnected || !resources.isConnected) return;
            if (token.error || !token.access_token) { finish('Google Drive permission was denied or expired. Try again; your links are unchanged.', true); return; }
            try {
              const googlePicker = globalThis.google.picker;
              picker = new googlePicker.PickerBuilder()
                .setTitle('Choose resources for this period')
                .setDeveloperKey(config.apiKey).setAppId(config.appId).setOAuthToken(token.access_token)
                .setOrigin(location.origin)
                .addView(new googlePicker.DocsView(googlePicker.ViewId.DOCS)
                  .setLabel('My Drive').setParent('root')
                  .setIncludeFolders(true).setSelectFolderEnabled(false))
                .enableFeature(googlePicker.Feature.MULTISELECT_ENABLED)
                .setCallback(selected).build();
              message('Browse My Drive folders, select one or more files, then choose Select. File sharing permissions will not change.');
              picker.setVisible(true);
            } catch { finish('Google Drive file chooser could not open. Check Google setup and retry. Your links are unchanged.', true); }
          },
          error_callback: error => finish(error.type === 'popup_closed' ?
            'Google sign-in was closed. Your resource links are unchanged.' :
            'Google sign-in could not open. Allow pop-ups for this site, then try again.', error.type !== 'popup_closed')
        });
        button.textContent = 'Choose from Google Drive';
        message('Choose multiple Drive files, or paste links below. Existing file sharing permissions stay unchanged.');
      } catch (error) {
        console.error('Google Drive chooser setup failed.');
        button.textContent = 'Open Google Drive Setup';
        message(error.message, true);
      } finally { if (host.isConnected) button.disabled = false; }
    }
    button.addEventListener('click', () => {
      if (!client) { openSetup(); return; }
      button.disabled = true;
      message('Complete Google sign-in to choose files. Your planner edits remain here.');
      try { client.requestAccessToken({ prompt: 'select_account' }); }
      catch { finish('Google sign-in could not start. Please retry. Your links are unchanged.', true); }
    });
    prepare();
  }
  async function prepareDocumentAccess(request) {
    const config = await request();
    if (!config.configured) throw new Error('Google Drive is not configured. Open Google Drive Setup in Setup My Planner.');
    await loadLibraries();
    let token = '', expires = 0, pending;
    const client = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId, scope: config.scope, include_granted_scopes: false,
      callback: result => {
        if (!pending) return;
        if (result.error || !result.access_token) pending.reject(new Error('Google Drive permission was denied. Your database forms are unchanged.'));
        else if (typeof globalThis.google.accounts.oauth2.hasGrantedAllScopes === 'function' &&
            !globalThis.google.accounts.oauth2.hasGrantedAllScopes(result, config.scope)) {
          pending.reject(new Error('Tick "See, edit, create and delete all of your Google Drive files" when Google asks, so existing moderation folders can be found. Your database forms are unchanged.'));
        } else {
          token = result.access_token; expires = Date.now() + Number(result.expires_in || 300) * 1000;
          pending.resolve();
        }
        pending = undefined;
      },
      error_callback: () => {
        pending?.reject(new Error('Google sign-in was closed or blocked. Allow pop-ups and retry.'));
        pending = undefined;
      }
    });
    function authorize() {
      if (token && expires > Date.now() + 60000) return Promise.resolve();
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try { client.requestAccessToken({ prompt: 'select_account' }); }
        catch (error) { pending = undefined; reject(error); }
      });
    }
    async function drive(path, options = {}, binary = false) {
      if (!token || expires <= Date.now()) throw new Error('Google Drive access expired. Retry to sign in again.');
      const response = await fetch('https://www.googleapis.com/' + path, {
        ...options, headers: { Authorization: 'Bearer ' + token, ...options.headers },
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) {
        if (response.status === 401) { token = ''; expires = 0; }
        console.error('Google Drive document request failed (HTTP ' + response.status + ').');
        const error = new Error(response.status === 404 ? 'The Drive file is missing or this Google account cannot access it. Choose an existing document or explicitly create a replacement.' :
          'Google Drive returned HTTP ' + response.status + '. Check your Google account, file permissions and Drive API setup, then retry. Your database forms are still saved.');
        error.status = response.status;
        throw error;
      }
      if (binary) return response.blob();
      const result = await response.json();
      const etag = response.headers.get('etag');
      return etag ? { ...result, etag } : result;
    }
    function pick({ folder = false, allowPdf = false, resources = false, multiple = false } = {}) {
      return new Promise((resolve, reject) => {
        let picker;
        try {
          const gp = globalThis.google.picker;
          const view = new gp.DocsView(folder ? gp.ViewId.FOLDERS : gp.ViewId.DOCS)
            .setIncludeFolders(true).setSelectFolderEnabled(folder).setParent('root');
          if (!resources) view.setMimeTypes(folder ? 'application/vnd.google-apps.folder' :
            'application/vnd.google-apps.document,application/vnd.openxmlformats-officedocument.wordprocessingml.document' +
              (allowPdf ? ',application/pdf' : ''));
          const builder = new gp.PickerBuilder().setTitle(folder ? 'Choose your Assessment and Moderation folder' :
            resources ? 'Choose files to link (any file type)' : 'Choose the existing assessment document')
            .setDeveloperKey(config.apiKey).setAppId(config.appId).setOAuthToken(token).setOrigin(location.origin)
            .addView(view).setCallback(result => {
              if (result.action === gp.Action.CANCEL) { picker.dispose(); resolve(null); }
              if (result.action === gp.Action.PICKED) {
                picker.dispose();
                if (!result.docs?.length || result.docs.some(file => !file.id)) reject(new Error('Google did not return a selected file or folder. Please retry.'));
                else resolve(resources ? result.docs : result.docs[0]);
              }
            });
          if (multiple) builder.enableFeature(gp.Feature.MULTISELECT_ENABLED);
          picker = builder.build();
          picker.setVisible(true);
        } catch (error) { picker?.dispose(); reject(error); }
      });
    }
    function choose(folder = false, allowPdf = false) { return pick({ folder, allowPdf }); }
    function chooseFiles(multiple = true) { return pick({ resources: true, multiple }); }
    function metadata(id) {
      if (!/^[\w-]{10,200}$/.test(id)) throw new Error('Choose a valid Google Drive file or folder.');
      return drive('drive/v3/files/' + id + '?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,parents,trashed,capabilities(canEdit,canAddChildren)');
    }
    async function find(folderId, properties) {
      const clauses = ["trashed=false", "'" + folderId + "' in parents",
        ...Object.entries(properties).map(([key, value]) => "appProperties has { key='" + key + "' and value='" + value + "' }")];
      const result = await drive('drive/v3/files?' + new URLSearchParams({
        q: clauses.join(' and '), fields: 'files(id,name,mimeType,modifiedTime)', pageSize: '100',
        supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'
      }));
      if (result.files.length > 1) throw new Error('More than one matching Drive document exists. Use Choose existing document to select the correct one.');
      return result.files[0] || null;
    }
    async function ensureFolder(parentId, name, create = true) {
      if (!/^[\w-]{10,200}$/.test(parentId) || !name || name.length > 500) throw new Error('Choose a valid parent folder and folder name.');
      const quote = value => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const result = await drive('drive/v3/files?' + new URLSearchParams({
        q: "trashed=false and mimeType='application/vnd.google-apps.folder' and '" + parentId +
          "' in parents and name='" + quote(name) + "'",
        fields: 'files(id,name),nextPageToken', pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'
      }));
      if (result.nextPageToken || result.files.length > 1) throw new Error('More than one "' + name + '" folder exists. Resolve the duplicate folders in Drive before retrying.');
      if (result.files[0] || !create) return result.files[0] || null;
      return drive('drive/v3/files?supportsAllDrives=true&fields=id,name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
      });
    }
    async function ensureAssessmentFolders(parentId, level, number) {
      if (level !== undefined && (!['1', '2', '3'].includes(level) || !/^\d{4,8}$/.test(number))) {
        throw new Error('Automatic assessment folders require a Level 1, 2 or 3 standard with a valid standard number.');
      }
      const folders = {};
      for (const value of ['1', '2', '3']) folders[value] = await ensureFolder(parentId, 'Level ' + value);
      return level === undefined ? folders : ensureFolder(folders[level].id, number);
    }
    async function listAssessmentFolderLinks(levels) {
      const result = {};
      for (const level of ['1', '2', '3']) {
        const standards = [];
        let pageToken;
        do {
          const response = await drive('drive/v3/files?' + new URLSearchParams({
            q: "trashed=false and mimeType='application/vnd.google-apps.folder' and '" + levels[level].id + "' in parents",
            fields: 'files(id,name),nextPageToken', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
            ...(pageToken ? { pageToken } : {})
          }));
          standards.push(...response.files.filter(folder => /^\d{4,8}$/.test(folder.name)).map(({ id, name }) => ({ id, name })));
          pageToken = response.nextPageToken;
        } while (pageToken);
        standards.sort((a, b) => Number(a.name) - Number(b.name));
        result[level] = { id: levels[level].id, standards };
      }
      return result;
    }
    async function assessmentFolderLinks(parentId) {
      const levels = await ensureAssessmentFolders(parentId);
      return { root: parentId, levels: await listAssessmentFolderLinks(levels) };
    }
    const validTopic = topic => typeof topic === 'string' && topic === topic.trim() && topic && topic.length <= 80 &&
      topic !== '.' && topic !== '..' && !/[\/\\\u0000-\u001f\u007f]/.test(topic);
    // Standard folders sit directly inside a topic and are named "Level 2 - 91892".
    const STANDARD_FOLDER = /^Level\s*([123])\s*[-\u2013\u2014]\s*(\d{4,8})$/i;
    async function listFolders(parentId) {
      if (!/^[\w-]{10,200}$/.test(parentId)) throw new Error('Choose a valid parent folder.');
      const folders = [];
      let pageToken;
      do {
        const response = await drive('drive/v3/files?' + new URLSearchParams({
          q: "trashed=false and mimeType='application/vnd.google-apps.folder' and '" + parentId + "' in parents",
          fields: 'files(id,name),nextPageToken', pageSize: '1000', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
          ...(pageToken ? { pageToken } : {})
        }));
        folders.push(...response.files.map(({ id, name }) => ({ id, name })));
        pageToken = response.nextPageToken;
      } while (pageToken);
      return folders;
    }
    // Hand-made topics may instead hold "Level 2" folders containing "91892" (or "Level 2 - 91892") folders.
    const LEVEL_FOLDER = /^Level\s*([123])$/i;
    const NESTED_STANDARD_FOLDER = /^(?:Level\s*([123])\s*[-\u2013\u2014]\s*)?(?:AS\s*)?(\d{4,8})(?:\b.*)?$/i;
    async function listTopicStandardFolders(topicFolderId) {
      const standards = [];
      for (const folder of await listFolders(topicFolderId)) {
        const name = typeof folder.name === 'string' ? folder.name.trim() : '';
        const match = name.match(STANDARD_FOLDER);
        if (match) { standards.push({ id: folder.id, level: match[1], number: match[2] }); continue; }
        const level = name.match(LEVEL_FOLDER);
        if (!level) continue;
        for (const child of await listFolders(folder.id)) {
          const nested = typeof child.name === 'string' && child.name.trim().match(NESTED_STANDARD_FOLDER);
          if (nested && (!nested[1] || nested[1] === level[1])) standards.push({ id: child.id, level: level[1], number: nested[2] });
        }
      }
      return standards.sort((a, b) => a.level.localeCompare(b.level) || Number(a.number) - Number(b.number));
    }
    async function ensureTopicStandardFolder(topicFolderId, level, number) {
      if (!['1', '2', '3'].includes(level) || !/^\d{4,8}$/.test(number)) {
        throw new Error('Automatic assessment folders require a Level 1, 2 or 3 standard with a valid standard number.');
      }
      const name = 'Level ' + level + ' - ' + number;
      const matches = (await listTopicStandardFolders(topicFolderId)).filter(folder => folder.level === level && folder.number === number);
      if (matches.length > 1) throw new Error('More than one "' + name + '" folder exists. Resolve the duplicate folders in Drive before retrying.');
      if (matches[0]) return { id: matches[0].id, name };
      return ensureFolder(topicFolderId, name);
    }
    async function ensureAssessmentTopicFolder(parentId, year, topic) {
      if (!/^[\w-]{10,200}$/.test(parentId) || !Number.isInteger(year) || year < 2000 || year > 2100 || !validTopic(topic)) {
        throw new Error('Choose a valid Assessment / Moderation folder, year and topic.');
      }
      const yearFolder = await ensureFolder(parentId, String(year));
      return ensureFolder(yearFolder.id, topic);
    }
    async function syncAssessmentYearFolders(parentId, year, topics) {
      if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Array.isArray(topics) || !topics.every(validTopic)) {
        throw new Error('Choose a valid year and topic list before syncing folders.');
      }
      const key = name => name.toLocaleLowerCase('en-NZ');
      const yearFolder = await ensureFolder(parentId, String(year), false);
      if (!yearFolder) return null;
      const found = new Map();
      for (const folder of (await listFolders(yearFolder.id)).filter(item => validTopic(item.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'en-NZ'))) {
        if (found.has(key(folder.name))) throw new Error('More than one "' + folder.name + '" topic folder exists in ' + year + '. Resolve the duplicate folders in Drive before syncing.');
        found.set(key(folder.name), folder);
      }
      const names = [...topics];
      const known = new Set(names.map(key));
      for (const folder of found.values()) if (!known.has(key(folder.name))) { known.add(key(folder.name)); names.push(folder.name); }
      if (names.length > 30) throw new Error('More than 30 topics would be listed for ' + year + '. Remove unused topics, then sync again.');
      const linked = [];
      for (const name of names) {
        const folder = found.get(key(name));
        if (folder) linked.push({ name, id: folder.id, standards: await listTopicStandardFolders(folder.id) });
      }
      return { topics: names, links: { root: parentId, year: { id: yearFolder.id, name: String(year) }, topics: linked } };
    }
    async function assessmentYearFolderLinks(parentId, year, topics) {
      if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Array.isArray(topics) || topics.length > 30) {
        throw new Error('Choose a valid year and no more than 30 topic names before preparing folders.');
      }
      const names = topics.map(topic => {
        if (!validTopic(topic)) throw new Error('Topic names must be 1 to 80 characters and cannot contain slashes.');
        return topic;
      });
      if (new Set(names.map(topic => topic.toLocaleLowerCase('en-NZ'))).size !== names.length) {
        throw new Error('Topic names must be unique.');
      }
      const topicsFolder = await ensureFolder(parentId, String(year));
      const linkedTopics = [];
      for (const name of names) {
        const topicFolder = await ensureFolder(topicsFolder.id, name);
        linkedTopics.push({ name, id: topicFolder.id, standards: await listTopicStandardFolders(topicFolder.id) });
      }
      return { root: parentId, year: { id: topicsFolder.id, name: String(year) }, topics: linkedTopics };
    }
    async function ensureStudentFolder(standardFolderId, index) {
      if (!Number.isInteger(index) || index < 0 || index >= 50) throw new Error('Choose a valid moderation entry (1 to 50).');
      const suffix = index < 26 ? String.fromCharCode(65 + index) : 'A' + String.fromCharCode(65 + index - 26);
      return ensureFolder(standardFolderId, 'Student ' + suffix);
    }
    function upload(blob, { id, name, folderId, properties, mimeType, etag, mediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) {
      const boundary = 'planner_' + crypto.randomUUID().replace(/-/g, '');
      const metadata = { name, appProperties: properties, ...(id ? {} : { parents: [folderId] }),
        mimeType: mimeType || 'application/vnd.google-apps.document' };
      const body = new Blob([
        '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata),
        '\r\n--' + boundary + '\r\nContent-Type: ' + mediaType + '\r\n\r\n',
        blob, '\r\n--' + boundary + '--'
      ], { type: 'multipart/related; boundary=' + boundary });
      return drive('upload/drive/v3/files' + (id ? '/' + id : '') +
        '?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime',
      { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': body.type, ...(etag ? { 'If-Match': etag } : {}) }, body });
    }
    function download(file) {
      return drive('drive/v3/files/' + file.id + (file.mimeType === 'application/vnd.google-apps.document'
        ? '/export?mimeType=application%2Fvnd.openxmlformats-officedocument.wordprocessingml.document' : '?alt=media&supportsAllDrives=true'), {}, true);
    }
    async function savePdf(file, { documentBlob, ...options }) {
      let source = file, temporary;
      try {
        if (file.mimeType !== 'application/vnd.google-apps.document') {
          temporary = await upload(documentBlob, { name: 'Temporary PDF conversion - ' + file.name, folderId: options.folderId });
          source = temporary;
        }
        const blob = await drive('drive/v3/files/' + source.id + '/export?mimeType=application%2Fpdf', {}, true);
        return await upload(blob, { ...options, mimeType: 'application/pdf', mediaType: 'application/pdf' });
      } finally {
        if (temporary) await drive('drive/v3/files/' + temporary.id + '?supportsAllDrives=true', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true })
        });
      }
    }
    return { authorize, choose, chooseFiles, metadata, find, upload, download, savePdf, ensureAssessmentFolders,
      ensureAssessmentTopicFolder, ensureTopicStandardFolder, syncAssessmentYearFolders, assessmentFolderLinks,
      assessmentYearFolderLinks, ensureStudentFolder };
  }
  globalThis.plannerGoogleDrive = { mount, mountSetup, appendFiles, resourceLink, prepareDocumentAccess };
})();
