(function (root) {
  'use strict';
  const { critique, yesNo, documentResources } = typeof module === 'object' && module.exports
    ? require('./moderation-schema') : root.plannerModerationSchema;
  const critiqueChecks = critique.slice(4);
  const sourceTypes = ['Commercial', 'Own', 'TKI', 'NZQA'];
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const DRIVE_ID = /^[\w-]{10,200}$/;
  const fileGroups = [
    ['purchaseZip', 'Original purchase ZIP', 1],
    ['resourceFolder', 'Resource folder', 1],
    ['assessmentFiles', 'Assessment Instructions & Schedule', 20],
    ['topicBriefFiles', 'Topic Brief', 20],
    ['purchaseDocuments', 'Invoice / purchase documents', 10]
  ];
  const detailGroups = [
    ['Assessment edition', [
      ['title', 'Assessment Brief Title'], ['edition', 'Supplier edition / resource version'],
      ['department', 'Faculty / Department'], ['subject', 'Subject'],
      ['status', 'Library status', ['Active', 'Superseded']],
      ['description', 'Assessment Brief Description', 'area']
    ]],
    ['Supplier and purchase', [
      ['supplier', 'Supplier name'], ['supplierWebsite', 'Supplier website', 'url'],
      ['productUrl', 'Product web link', 'url'], ['purchaseDate', 'Date of purchase', 'date'],
      ['price', 'Price paid', 'money'], ['currency', 'Currency (for example NZD)'],
      ['gst', 'GST', ['', 'Included', 'Excluded', 'Not applicable', 'Unknown']],
      ['orderReference', 'Invoice / order reference']
    ]],
    ['Licence and notes', [
      ['licence', 'Permitted use / distribution restrictions', 'area'],
      ['licenceExpiry', 'Licence expiry (if applicable)', 'date'], ['notes', 'Library notes', 'area']
    ]]
  ];
  const text = (value, limit = 500) => typeof value === 'string' && value.length <= limit &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
  const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
  const validChecks = value => keys(value, critiqueChecks.map(([key]) => key)) &&
    Object.values(value).every(answer => yesNo.includes(answer));
  function date(value) {
    return text(value, 10) && (!value || /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  }
  function url(value) {
    if (!value) return true;
    try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; }
    catch { return false; }
  }
  function driveUrl(file) {
    return file.mimeType === 'application/vnd.google-apps.folder'
      ? 'https://drive.google.com/drive/folders/' + file.id : 'https://drive.google.com/file/d/' + file.id + '/view';
  }
  function validFile(file) {
    return keys(file, ['id', 'name', 'mimeType', 'modifiedTime']) && text(file.id, 200) && DRIVE_ID.test(file.id) &&
      text(file.name) && Boolean(file.name.trim()) && !/[\r\n|]/.test(file.name) &&
      text(file.mimeType, 200) && Boolean(file.mimeType) && text(file.modifiedTime || '', 100);
  }
  const fileLine = file => file.name + ' | ' + driveUrl(file);
  function validClassCodes(value) {
    return Array.isArray(value) && value.length <= 100 && value.every(code =>
      text(code, 80) && Boolean(code.trim()) && code === code.trim() && !/[\r\n\t]/.test(code)) &&
      new Set(value.map(code => code.toLocaleUpperCase('en-NZ'))).size === value.length;
  }
  function validOrigin(value, draft = false) {
    if (value === undefined) return true;
    if (!keys(value, ['type', 'authorId', 'authorName', 'originalUrl', 'linkedDate', 'modificationNotes', 'finalUrl', 'additionalOriginals', 'additionalFinals']) ||
        !sourceTypes.includes(value.type) || !text(value.authorId) || !text(value.authorName) ||
        !text(value.originalUrl) || !text(value.linkedDate, 10) || !text(value.modificationNotes, 8000) || !text(value.finalUrl)) return false;
    if (value.additionalOriginals !== undefined && (!Array.isArray(value.additionalOriginals) || value.additionalOriginals.length > 19 ||
        !value.additionalOriginals.every(item => keys(item, ['url', 'linkedDate']) && text(item.url) && text(item.linkedDate, 10)))) return false;
    if (value.additionalFinals !== undefined && (!Array.isArray(value.additionalFinals) || value.additionalFinals.length > 19 ||
        !value.additionalFinals.every(item => text(item)))) return false;
    if (value.authorId && !UUID.test(value.authorId)) return false;
    if (draft) return true;
    const originals = [{ url: value.originalUrl, linkedDate: value.linkedDate }, ...(value.additionalOriginals || [])];
    const finals = [value.finalUrl, ...(value.additionalFinals || [])];
    if (originals.some(item => /[\r\n|]/.test(item.url) || !url(item.url) || !date(item.linkedDate)) ||
        finals.some(item => /[\r\n|]/.test(item) || !url(item))) return false;
    for (const finalUrl of finals.filter(Boolean)) {
      const parsed = new URL(finalUrl);
      if (!['drive.google.com', 'docs.google.com'].includes(parsed.hostname.toLowerCase())) return false;
    }
    if (Boolean(value.originalUrl) !== Boolean(value.linkedDate) ||
        (value.additionalOriginals || []).some(item => !item.url || !item.linkedDate) ||
        (value.additionalFinals || []).some(item => !item)) return false;
    if (new Set(originals.map(item => item.url).filter(Boolean)).size !== originals.filter(item => item.url).length ||
        new Set(finals.filter(Boolean)).size !== finals.filter(Boolean).length) return false;
    if (value.type === 'Own' && (!value.authorId || !value.authorName.trim())) return false;
    if (['TKI', 'NZQA'].includes(value.type) && !originals.some(item => item.url)) return false;
    return true;
  }
  function emptyContent() {
    return { ...Object.fromEntries(detailGroups.flatMap(([, fields]) => fields.map(([key]) => [key, '']))),
      status: 'Active', currency: 'NZD', standards: [], classCodes: [], critiques: [],
      ...Object.fromEntries(fileGroups.map(([key]) => [key, []])) };
  }
  function validateDraft(content) {
    const fields = detailGroups.flatMap(([, definitions]) => definitions);
    if (!keys(content, [...fields.map(([key]) => key), 'origin', 'supplierId', 'standards', 'classCodes', 'critiques', ...fileGroups.map(([key]) => key)]) ||
        !validOrigin(content.origin, true) ||
        (content.supplierId !== undefined && (typeof content.supplierId !== 'string' || content.supplierId && !UUID.test(content.supplierId))) ||
        !fields.every(([key, , type]) => text(content[key], type === 'area' ? 8000 : 500)) ||
        !validClassCodes(content.classCodes) ||
        !Array.isArray(content.standards) || content.standards.length > 30 ||
        !content.standards.every(item => keys(item, ['number', 'version', 'title', 'subject', 'credits', 'level']) &&
          ['number', 'version'].every(key => text(item[key])) &&
          ['title', 'subject', 'credits', 'level'].every(key => item[key] === undefined || text(item[key]))) ||
        !fileGroups.every(([key, , maximum]) => Array.isArray(content[key]) && content[key].length <= maximum && content[key].every(validFile)) ||
        !Array.isArray(content.critiques) || content.critiques.length > 50 ||
        !content.critiques.every(item => keys(item, ['id', 'name', 'school', 'position', 'positionAutofillDisabled', 'checks', 'date', 'outcome', 'changes', 'evidence']) &&
          text(item.id) && UUID.test(item.id) && ['name', 'school', 'date', 'outcome'].every(key => text(item[key])) &&
          (item.position === undefined || text(item.position)) &&
          (item.positionAutofillDisabled === undefined || typeof item.positionAutofillDisabled === 'boolean') &&
          (item.checks === undefined || validChecks(item.checks)) &&
          text(item.changes, 8000) && (item.evidence === null || validFile(item.evidence))) ||
        JSON.stringify(content).length > 100000) return 'This draft contains invalid or too much data.';
    return '';
  }
  function validate(content) {
    const fields = detailGroups.flatMap(([, fields]) => fields);
    if (!keys(content, [...fields.map(([key]) => key), 'origin', 'supplierId', 'standards', 'classCodes', 'critiques', ...fileGroups.map(([key]) => key)]) ||
        !validOrigin(content.origin) ||
        (content.supplierId !== undefined && (typeof content.supplierId !== 'string' || content.supplierId && !UUID.test(content.supplierId)))) return 'Invalid library record.';
    if (content.classCodes !== undefined && !validClassCodes(content.classCodes)) return 'Choose up to 100 unique class codes (maximum 80 characters each).';
    for (const [key, label, type] of fields) {
      const value = content[key];
      if (!text(value, type === 'area' ? 8000 : 500)) return 'Enter a valid ' + label + '.';
      if (Array.isArray(type) && !type.includes(value) || type === 'url' && !url(value) ||
          type === 'date' && !date(value) || type === 'money' && value && !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return 'Enter a valid ' + label + '.';
    }
    if (!content.title.trim() || (content.origin?.type || 'Commercial') === 'Commercial' && !content.supplier.trim()) return 'Assessment Brief Title and, for commercial assessments, supplier are required.';
    if (!/^[A-Z]{3}$/.test(content.currency)) return 'Use a three-letter currency such as NZD.';
    if (!Array.isArray(content.standards) || !content.standards.length || content.standards.length > 30 ||
        !content.standards.every(item => keys(item, ['number', 'version', 'title', 'subject', 'credits', 'level']) && text(item.number) && /^\d{4,8}$/.test(item.number) &&
          text(item.version) && /^\d{1,3}$/.test(item.version) &&
          ['title', 'subject'].every(key => item[key] === undefined || text(item[key])) &&
          (item.credits === undefined || text(item.credits, 3) && /^\d{0,3}$/.test(item.credits)) &&
          (item.level === undefined || text(item.level, 2) && /^(?:[1-9]|10)?$/.test(item.level))) ||
        new Set(content.standards.map(item => item.number + ':' + item.version)).size !== content.standards.length) return 'Add unique standard numbers with their NZQA versions, whole-number Credits and Level 1-10 (or not recorded).';
    for (const [key, label, maximum] of fileGroups) {
      const files = content[key];
      if (!Array.isArray(files) || files.length > maximum || !files.every(validFile) ||
          new Set(files.map(file => file.id)).size !== files.length) return 'Choose valid files for ' + label + '.';
      if (key === 'resourceFolder' && files.some(file => file.mimeType !== 'application/vnd.google-apps.folder')) return 'Choose a Google Drive resource folder.';
      if (key === 'purchaseZip' && files.some(file => !/\.zip$/i.test(file.name))) return 'Choose the original ZIP file.';
      if (!['resourceFolder', 'purchaseZip'].includes(key) && files.some(file => file.mimeType === 'application/vnd.google-apps.folder')) return 'Choose individual files for ' + label + '.';
    }
    if (!Array.isArray(content.critiques) || content.critiques.length > 50 || !content.critiques.every(item =>
      keys(item, ['id', 'name', 'school', 'position', 'positionAutofillDisabled', 'checks', 'date', 'outcome', 'changes', 'evidence']) && text(item.id) && UUID.test(item.id) &&
      text(item.name) && text(item.school) && (item.position === undefined || text(item.position)) &&
      (item.positionAutofillDisabled === undefined || typeof item.positionAutofillDisabled === 'boolean') &&
      (item.checks === undefined || validChecks(item.checks)) &&
      date(item.date) && ['Not critiqued', 'Changes required', 'Approved', 'Superseded'].includes(item.outcome) &&
      text(item.changes, 8000) && (item.evidence === null || validFile(item.evidence)) &&
      (item.outcome !== 'Approved' || item.name.trim() && item.school.trim() && item.date)) ||
      new Set(content.critiques.map(item => item.id)).size !== content.critiques.length) return 'Enter valid critique details; approved critiques need a name, school and date.';
    if (JSON.stringify(content).length > 100000) return 'The library record exceeds 100,000 characters. Shorten notes or link a supporting file.';
    return '';
  }
  function critiqueBasis(content) {
    const origin = content.origin;
    return JSON.stringify([content.edition, content.standards.map(({ number, version }) => ({ number, version })), content.assessmentFiles, content.topicBriefFiles,
      origin && origin.type !== 'Commercial' ? [origin.type, origin.originalUrl, origin.finalUrl,
        (origin.additionalOriginals || []).map(item => item.url), origin.additionalFinals || []] : 'Commercial']);
  }
  function snapshot(entry, number, version, critiqueId = '') {
    const content = entry.content;
    if (validate(content) || !UUID.test(entry.id) || !Number.isInteger(entry.revision) || entry.revision < 1) throw new Error('The library entry is invalid.');
    if (content.status !== 'Active') throw new Error('This resource edition is superseded. Choose an active edition.');
    if (!content.standards.some(item => item.number === number && item.version === version)) throw new Error('This resource does not match the assessment standard and version.');
    if (content.licenceExpiry && content.licenceExpiry < new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
      throw new Error('This resource licence has expired. Review its permitted use before applying it.');
    }
    const critique = critiqueId ? content.critiques.find(item => item.id === critiqueId && item.outcome === 'Approved') : null;
    if (critiqueId && !critique) throw new Error('Choose an approved critique for this edition.');
    const checks = Object.fromEntries(Object.entries(critique?.checks || {}).filter(([, answer]) => answer));
    const origin = content.origin, type = origin?.type || 'Commercial';
    const originals = origin && ['TKI', 'NZQA'].includes(type)
      ? [{ url: origin.originalUrl, linkedDate: origin.linkedDate }, ...(origin.additionalOriginals || [])].filter(item => item.url) : [];
    const finals = origin && ['TKI', 'NZQA'].includes(type)
      ? [origin.finalUrl, ...(origin.additionalFinals || [])].filter(Boolean) : [];
    const originLinks = ['TKI', 'NZQA'].includes(type) ? [
      ...finals.map(link => 'Final assessment | ' + link),
      ...originals.flatMap(item => ['Original assessment | ' + item.url, 'Date linked: ' + item.linkedDate]),
      ...(origin.modificationNotes ? ['Modification notes: ' + origin.modificationNotes] : [])
    ] : [];
    const assessmentLinks = content.assessmentFiles.map(fileLine);
    if (originals.length) assessmentLinks.unshift(...(finals.length ? finals : originals.map(item => item.url))
      .map(link => 'Assessment Instructions & Schedule | ' + link));
    const selected = { resourceId: entry.id, revision: entry.revision, title: content.title, edition: content.edition,
      standardNumber: number, version, sourceTypes: type,
      source: (content.assessmentFiles.length ? content.assessmentFiles.map(fileLine) : assessmentLinks).join('\n'),
      sourceProvenance: [(type === 'Commercial' ? content.supplier : type === 'Own' ? 'Own - ' + origin.authorName : type) + ' - ' + content.title +
        (content.edition ? ' (edition ' + content.edition + ')' : ''), ...originLinks,
        ...content.assessmentFiles.map(file => 'Assessment Instructions & Schedule | ' + driveUrl(file))].join('\n'),
      assessmentInstructionsLink: assessmentLinks.join('\n'),
      topicBriefLink: content.topicBriefFiles.map(fileLine).join('\n'),
      critiqueId: critique?.id || '', critiqueName: critique?.name || '', critiqueSchool: critique?.school || '', critiqueDate: critique?.date || '',
      previousCritiqueLink: critique?.evidence ? driveUrl(critique.evidence) : '',
      ...(content.classCodes?.length ? { classCodes: [...content.classCodes] } : {}),
      ...(Object.keys(checks).length ? { critiqueChecks: checks } : {}) };
    if (!validSnapshot(selected) || !documentResources(selected.assessmentInstructionsLink) || !documentResources(selected.topicBriefLink)) {
      throw new Error('The source or assessment links are too long to apply to moderation. Shorten them and retry.');
    }
    return selected;
  }
  function validSnapshot(value) {
    const fields = ['resourceId', 'revision', 'title', 'edition', 'standardNumber', 'version', 'sourceTypes', 'source',
      'assessmentInstructionsLink', 'topicBriefLink', 'critiqueId', 'critiqueName', 'critiqueSchool', 'critiqueDate', 'previousCritiqueLink'];
    return keys(value, [...fields, 'critiqueChecks', 'classCodes', 'sourceProvenance']) && fields.every(key => Object.hasOwn(value, key)) &&
      (value.sourceProvenance === undefined || text(value.sourceProvenance, 8000)) &&
      (value.classCodes === undefined || validClassCodes(value.classCodes)) &&
      (value.critiqueChecks === undefined || Boolean(value.critiqueId) && validChecks(value.critiqueChecks)) &&
      UUID.test(value.resourceId) &&
      Number.isInteger(value.revision) && value.revision > 0 && /^\d{4,8}$/.test(value.standardNumber) && /^\d{1,3}$/.test(value.version) &&
      fields.filter(key => key !== 'revision').every(key => text(value[key], ['source', 'assessmentInstructionsLink', 'topicBriefLink'].includes(key) ? 8000 : 500)) &&
      sourceTypes.includes(value.sourceTypes) && (!value.critiqueId || UUID.test(value.critiqueId)) &&
      date(value.critiqueDate) && url(value.previousCritiqueLink);
  }
  function moderationSource(selected) {
    if (!validSnapshot(selected)) throw new Error('Invalid library snapshot. No fields were changed.');
    if (documentResources(selected.source)) return selected.source;
    const instructions = documentResources(selected.assessmentInstructionsLink);
    if (!instructions) throw new Error('The saved library assessment links are invalid. No fields were changed.');
    const sourceLinks = selected.source.split('\n').flatMap(line => {
      if (!line.startsWith('Assessment Instructions & Schedule | ')) return [];
      const resource = documentResources(line);
      return resource?.length === 1 ? resource : [];
    });
    const resources = sourceLinks.length ? sourceLinks.map(source =>
      instructions.find(item => item.url === source.url && item.name !== 'Assessment Instructions & Schedule') ||
      instructions.find(item => item.url === source.url) || source) : instructions;
    return resources.map(item => item.name + ' | ' + item.url).join('\n');
  }
  function fillMissing(internal, schedule, selected, includeInternal = true) {
    if (!validSnapshot(selected)) throw new Error('Invalid library snapshot. No fields were changed.');
    const nextInternal = { ...internal }, nextSchedule = { ...schedule };
    if (includeInternal) {
      const types = (nextInternal.sourceTypes || '').split(', ').filter(Boolean);
      if (!types.includes(selected.sourceTypes)) types.push(selected.sourceTypes);
      nextInternal.sourceTypes = types.join(', ');
    }
    if (includeInternal && !(nextInternal.source || '').trim()) nextInternal.source = moderationSource(selected);
    if (includeInternal) for (const key of ['critiqueName', 'critiqueSchool', 'critiqueDate', 'previousCritiqueLink']) {
      if (!(nextInternal[key] || '').trim() && selected[key]) nextInternal[key] = selected[key];
    }
    if (includeInternal) for (const [key, answer] of Object.entries(selected.critiqueChecks || {})) {
      if (!(nextInternal[key] || '').trim() && answer) nextInternal[key] = answer;
    }
    for (const key of ['assessmentInstructionsLink', 'topicBriefLink']) {
      if (!(nextSchedule[key] || '').trim() && selected[key]) nextSchedule[key] = selected[key];
    }
    if ([nextInternal, nextSchedule].some(value => JSON.stringify(value).length > 20000)) throw new Error('The combined form exceeds its limit. No library content was applied.');
    return { internal: nextInternal, schedule: nextSchedule };
  }
  const schema = { UUID, sourceTypes, fileGroups, detailGroups, critiqueChecks, yesNo, validFile, validClassCodes, driveUrl, emptyContent, validate, validateDraft, critiqueBasis, snapshot, validSnapshot, moderationSource, fillMissing };
  if (typeof module === 'object' && module.exports) module.exports = schema;
  root.assessmentLibrarySchema = schema;
})(typeof globalThis === 'object' ? globalThis : this);
