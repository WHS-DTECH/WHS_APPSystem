const { common, documents, documentResources } = require('./public/moderation-schema');
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DRIVE_ID = /^[\w-]{10,200}$/;
const fields = [...common.map(([key]) => key), 'standardType', 'folderId', 'folderName', 'folderLinks', 'standardFolder', 'driveDocuments', 'parentRecord', ...Object.keys(documents)];
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
  if (content.standardType !== undefined && !['', 'Unit', 'Achievement'].includes(content.standardType)) return false;
  if (content.parentRecord && !UUID.test(content.parentRecord)) return false;
  if (content.folderId && !DRIVE_ID.test(content.folderId)) return false;
  if (content.folderName?.length > 500) return false;
  if (content.folderLinks) {
    let links;
    try { links = JSON.parse(content.folderLinks); } catch { return false; }
    const validId = value => typeof value === 'string' && DRIVE_ID.test(value);
    if (!links || typeof links !== 'object' || Array.isArray(links) ||
        Object.keys(links).sort().join(',') !== 'levels,root' || !validId(links.root) ||
        !links.levels || typeof links.levels !== 'object' || Object.keys(links.levels).sort().join(',') !== '1,2,3' ||
        !Object.values(links.levels).every(level => level && typeof level === 'object' &&
          Object.keys(level).sort().join(',') === 'id,standards' && validId(level.id) && Array.isArray(level.standards) &&
          level.standards.every(folder => folder && typeof folder === 'object' &&
            Object.keys(folder).sort().join(',') === 'id,name' && validId(folder.id) &&
            typeof folder.name === 'string' && /^\d{4,8}$/.test(folder.name)))) return false;
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
    if (!validValues(flat, [...definition.groups.flatMap(([, entries]) => entries), ['notes', 'Supporting notes', 'area'], ['resources', 'Resources', 'area']])) return false;
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
module.exports = { fields, validModeration, UUID, DRIVE_ID };
