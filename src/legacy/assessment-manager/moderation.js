const { common, documents, documentResources } = require('./public/moderation-schema');
const { validSnapshot } = require('./public/resource-library-schema');
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DRIVE_ID = /^[\w-]{10,200}$/;
const fields = [...common.map(([key]) => key), 'resourceLibrary', 'resourceLibraryId', 'courseLibraryInitialized', 'standardType', 'folderId', 'folderName', 'folderTopics', 'folderLinks', 'topic', 'standardFolder', 'driveDocuments', 'parentRecord', ...Object.keys(documents)];
function validTopicName(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 80 &&
    value !== '.' && value !== '..' && !/[\/\\\u0000-\u001f\u007f]/.test(value);
}
function validReferenceUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function validValues(values, definitions) {
  return values && typeof values === 'object' && !Array.isArray(values) &&
    Object.entries(values).every(([key, value]) => {
      const field = definitions.find(([id]) => id === key);
      return field && typeof value === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) &&
        value.length <= (['area', 'drive'].includes(field[2]) ? 8000 : 500) &&
        (!Array.isArray(field[2]) || field[2].includes(value)) &&
        (field[2] !== 'url' || validReferenceUrl(value)) &&
        (field[2] !== 'drive' || Boolean(documentResources(value))) &&
        (field[2] !== 'uuid' || !value || UUID.test(value)) &&
        (!field[2]?.checks || !value || value.split(', ').every((item, i, all) => field[2].checks.includes(item) && all.indexOf(item) === i)) &&
        (field[2] !== 'date' || !value || /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
    });
}
function validModeration(content) {
  if (content.resourceLibraryId !== undefined && (typeof content.resourceLibraryId !== 'string' ||
      content.resourceLibraryId && !UUID.test(content.resourceLibraryId))) return false;
  if (content.courseLibraryInitialized !== undefined && (typeof content.courseLibraryInitialized !== 'string' ||
      content.courseLibraryInitialized && !UUID.test(content.courseLibraryInitialized))) return false;
  if (content.resourceLibrary) {
    let snapshot;
    try { snapshot = JSON.parse(content.resourceLibrary); } catch { return false; }
    if (!validSnapshot(snapshot) || content.resourceLibraryId && snapshot.resourceId.toLowerCase() !== content.resourceLibraryId.toLowerCase()) return false;
  }
  if (content.standardType !== undefined && !['', 'Unit', 'Achievement'].includes(content.standardType)) return false;
  if (content.parentRecord && !UUID.test(content.parentRecord)) return false;
  if (content.folderId && !DRIVE_ID.test(content.folderId)) return false;
  if (content.folderName?.length > 500) return false;
  if (content.topic !== undefined && content.topic !== '' && !validTopicName(content.topic)) return false;
  if (content.folderTopics !== undefined) {
    let topics;
    try { topics = JSON.parse(content.folderTopics); } catch { return false; }
    if (!Array.isArray(topics) || topics.length > 30 || !topics.every(validTopicName) ||
        new Set(topics.map(topic => topic.toLocaleLowerCase('en-NZ'))).size !== topics.length) return false;
  }
  if (content.folderLinks) {
    let links;
    try { links = JSON.parse(content.folderLinks); } catch { return false; }
    const validId = value => typeof value === 'string' && DRIVE_ID.test(value);
    const validLevels = levels => levels && typeof levels === 'object' && !Array.isArray(levels) &&
      Object.keys(levels).sort().join(',') === '1,2,3' &&
      Object.values(levels).every(level => level && typeof level === 'object' &&
        Object.keys(level).sort().join(',') === 'id,standards' && validId(level.id) && Array.isArray(level.standards) &&
        level.standards.every(folder => folder && typeof folder === 'object' &&
          Object.keys(folder).sort().join(',') === 'id,name' && validId(folder.id) &&
          typeof folder.name === 'string' && /^\d{4,8}$/.test(folder.name)));
    const validTopicStandards = standards => Array.isArray(standards) && standards.length <= 500 &&
      standards.every(folder => folder && typeof folder === 'object' && !Array.isArray(folder) &&
        Object.keys(folder).sort().join(',') === 'id,level,number' && validId(folder.id) &&
        ['1', '2', '3'].includes(folder.level) && typeof folder.number === 'string' && /^\d{4,8}$/.test(folder.number));
    if (!links || typeof links !== 'object' || Array.isArray(links) || !validId(links.root)) return false;
    if (Object.keys(links).sort().join(',') === 'levels,root') {
      if (!validLevels(links.levels)) return false;
    } else if (Object.keys(links).sort().join(',') === 'root,topics,year') {
      if (!links.year || typeof links.year !== 'object' || Array.isArray(links.year) ||
          Object.keys(links.year).sort().join(',') !== 'id,name' || !validId(links.year.id) ||
          typeof links.year.name !== 'string' || !/^\d{4}$/.test(links.year.name) ||
          !Array.isArray(links.topics) || links.topics.length > 30 ||
          !links.topics.every(topic => topic && typeof topic === 'object' && !Array.isArray(topic) &&
            validId(topic.id) && validTopicName(topic.name) &&
            (Object.keys(topic).sort().join(',') === 'id,levels,name' ? validLevels(topic.levels)
              : Object.keys(topic).sort().join(',') === 'id,name,standards' && validTopicStandards(topic.standards))) ||
          new Set(links.topics.map(topic => topic.name.toLocaleLowerCase('en-NZ'))).size !== links.topics.length) return false;
    } else return false;
  }
  if (content.standardFolder) {
    let folder;
    try { folder = JSON.parse(content.standardFolder); } catch { return false; }
    if (!folder || typeof folder !== 'object' || Array.isArray(folder) ||
        Object.keys(folder).length !== 4 || !['id', 'root', 'level', 'number'].every(key => typeof folder[key] === 'string') ||
        !DRIVE_ID.test(folder.id) || !DRIVE_ID.test(folder.root) ||
        !['1', '2', '3'].includes(folder.level) || !/^\d{4,8}$/.test(folder.number)) return false;
  }
  if (!validValues(Object.fromEntries(common.filter(([key]) => content[key] !== undefined).map(([key]) => [key, content[key]])), common)) return false;
  if (content.standardNumber && !/^\d{4,8}$/.test(content.standardNumber)) return false;
  for (const [key, definition] of Object.entries(documents)) {
    if (content[key] === undefined) continue;
    let value;
    try { value = JSON.parse(content[key]); } catch { return false; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const rows = definition.rows;
    const flat = { ...value };
    if (rows) delete flat[rows.key];
    if (!validValues(flat, [...definition.groups.flatMap(([, entries]) => entries), ...(definition.metadata || []), ['notes', 'Supporting notes', 'area'], ['resources', 'Resources', 'area']])) return false;
    if (key === 'internal' && value.consentBsasStandard && !/^\d{4,8}$/.test(value.consentBsasStandard)) return false;
    if (key === 'internal' && ['A', 'B', 'C', 'D'].some(letter =>
      value['randomInitials' + letter] && !/^\p{L}{1,10}$/u.test(value['randomInitials' + letter]))) return false;
    if (rows && value[rows.key] !== undefined && (!Array.isArray(value[rows.key]) || value[rows.key].length > 50 ||
        !value[rows.key].every(row => validValues(row, [...rows.fields, ...(rows.metadata || [])])))) return false;
  }
  if (content.driveDocuments !== undefined) {
    let links;
    try { links = JSON.parse(content.driveDocuments); } catch { return false; }
    if (!links || typeof links !== 'object' || Array.isArray(links) ||
        !Object.entries(links).every(([key, item]) => Object.hasOwn(documents, key) &&
          item && typeof item === 'object' && !Array.isArray(item) &&
          Object.keys(item).every(field => ['id', 'name', 'mimeType', 'modifiedTime', 'pdf'].includes(field)) &&
          typeof item.id === 'string' && DRIVE_ID.test(item.id) &&
          typeof item.name === 'string' && item.name.length <= 500 &&
          ['application/vnd.google-apps.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(item.mimeType) &&
          (item.modifiedTime === undefined || typeof item.modifiedTime === 'string' && item.modifiedTime.length <= 100) &&
          (item.pdf === undefined || ['schedule', 'feedback'].includes(key) &&
            item.pdf && typeof item.pdf === 'object' && !Array.isArray(item.pdf) &&
            Object.keys(item.pdf).every(field => ['id', 'name', 'mimeType', 'modifiedTime'].includes(field)) &&
            typeof item.pdf.id === 'string' && DRIVE_ID.test(item.pdf.id) &&
            typeof item.pdf.name === 'string' && item.pdf.name.length <= 500 &&
            item.pdf.mimeType === 'application/pdf' &&
            (item.pdf.modifiedTime === undefined || typeof item.pdf.modifiedTime === 'string' && item.pdf.modifiedTime.length <= 100)))) return false;
  }
  return true;
}
module.exports = { fields, validModeration, validTopicName, UUID, DRIVE_ID };
