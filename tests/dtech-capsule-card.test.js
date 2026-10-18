const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { prefixText } = require('../src/modules/dtechHub');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'dtech-hub', 'script.js'), 'utf8');

test('only the Commenting and Debugging Training card becomes a burgundy capsule with a direct course link', async () => {
  const start = source.indexOf('async function loadSharedProjects()');
  const end = source.indexOf('\nfunction ', start);
  const records = [
    { id: 'capsule-fixture', name: 'Commenting and Debugging Training', activity_category: 'Activity', image_url: '/original.png' },
    { id: 'other', name: 'Another activity', activity_category: 'Activity', image_url: '/other.png' },
    { id: 'similar', name: 'Another Commenting and Debugging Training', activity_category: 'Activity' }
  ];
  const context = vm.createContext({
    fetch: async () => ({ ok: true, json: async () => records }),
    slugify: (value) => value,
    isGeneratedUploadedActivityImageUrl: () => false,
    inferSourceTypeFromRecord: () => 'activity',
    getDefaultCardColorForCategory: () => 'amber',
    collectTaskTopicsFromActivityRecord: () => [],
    normalizeStandardDetailsRows: () => [],
    textToIcon: () => 'P',
    colorToPalette: () => 'original-amber'
  });
  vm.runInContext(prefixText(source.slice(start, end)), context);
  const cards = await vm.runInContext('loadSharedProjects()', context);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].sourceType, 'capsule');
  assert.equal(cards[0].activityCategory, 'Capsule');
  assert.equal(cards[0].href, '/dtech-hub/class-training/capsules/programming-documentation');
  assert.match(cards[0].visual.palette, /#5c0e2a/);
  assert.equal(cards[0].imageUrl, null);
  for (const card of cards.slice(1)) {
    assert.equal(card.sourceType, 'activity');
    assert.equal(card.activityCategory, 'Activity');
    assert.equal(card.visual.palette, 'original-amber');
    assert.match(card.href, /custom-activity.html/);
  }
  assert.equal(cards[1].imageUrl, '/other.png');
  assert.equal(records[0].activity_category, 'Activity', 'legacy stored category is not modified');
  assert.match(source, /sourceType === "capsule"\s*\? "CAPSULE"/);
  assert.match(source, /key: "capsule", label: "Capsules"/);
  assert.match(source, /state.content === "Capsules" && project.sourceType === "capsule"/);
});
