const fs = require('fs/promises');
const path = require('path');
const { parseDocument } = require('htmlparser2');

const SOURCE = path.join(__dirname, '..', 'dtech-hub', 'learning-pathways');

function descendants(node, predicate) {
  return (node.children || []).flatMap(child => [
    ...(predicate(child) ? [child] : []), ...descendants(child, predicate)
  ]);
}
function text(node) {
  return node.type === 'text' ? node.data : (node.children || []).map(text).join('');
}

async function loadTeachingContent() {
  const [catalogue, html] = await Promise.all([
    fs.readFile(path.join(SOURCE, 'library.json'), 'utf8'),
    fs.readFile(path.join(SOURCE, 'lesson-binary-piano.html'), 'utf8')
  ]);
  const cards = JSON.parse(catalogue);
  const unit = cards.find(card => card.id === 'binary-and-data' && card.cardType === 'unit');
  const lesson = cards.find(card => card.id === 'lesson-binary-piano' && card.unit === unit?.id);
  if (!unit || !lesson || !unit.href || !lesson.href) throw new Error('The existing Binary Piano teaching content is unavailable.');
  const document = parseDocument(html);
  const preparation = descendants(document, node => node.name === 'section' && node.attribs?.['aria-labelledby'] === 'teacher-preparation')[0];
  if (!preparation) throw new Error('The existing Binary Piano preparation section is unavailable.');
  const resources = descendants(preparation, node => node.name === 'a').map(node => {
    const url = new URL(node.attribs.href);
    if (url.protocol !== 'https:') throw new Error('The Binary Piano resource link is invalid.');
    return { name: text(node).trim(), url: url.href };
  });
  return {
    unit: { id: unit.id, title: unit.title, url: '/dtech-hub' + unit.href },
    lesson: { id: lesson.id, title: lesson.title, url: '/dtech-hub' + lesson.href },
    preparation: descendants(preparation, node => node.name === 'li').map(node => text(node).trim()),
    resources
  };
}

module.exports = { loadTeachingContent };
