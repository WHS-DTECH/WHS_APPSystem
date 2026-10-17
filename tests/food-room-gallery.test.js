const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'food-room', 'display_recipe_book.js'), 'utf8');

function element() {
  return {
    textContent: '', innerHTML: '', style: {}, children: [], handlers: {},
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, callback) { this.handlers[name] = callback; }
  };
}

async function gallery(recipeResponses, bookingsResponse = { bookings: [] }) {
  const elements = Object.fromEntries([
    'recipeCardList', 'recipeCountBadge', 'recipeFilterEmpty',
    'weeklyRecipeBox', 'weeklyRecipeList', 'weeklyRecipeEmpty'
  ].map((id) => [id, element()]));
  const errors = [];
  const document = {
    visibilityState: 'visible',
    getElementById: (id) => elements[id] || null,
    createElement: element,
    addEventListener(name, callback) {
      if (name === 'DOMContentLoaded') callback();
    }
  };
  vm.runInNewContext(script, {
    document,
    window: { requestIdleCallback: (callback) => callback() },
    console: { error: (...args) => errors.push(args) },
    URL, Date, Map, Set,
    fetch: async (url) => {
      let payload;
      if (url.includes('/auth/me')) payload = { authenticated: false };
      else if (url.includes('/bookings/')) payload = bookingsResponse;
      else payload = recipeResponses.shift();
      if (payload instanceof Error) throw payload;
      return {
        ok: typeof payload !== 'number',
        status: typeof payload === 'number' ? payload : 200,
        json: async () => {
          if (payload === 'invalid-json') throw new SyntaxError('Invalid JSON');
          return payload;
        }
      };
    }
  });
  await new Promise(setImmediate);
  return { elements, errors };
}

test('gallery reports HTTP, network, JSON and response-shape errors instead of endless loading', async () => {
  for (const response of [502, new Error('Network unavailable'), 'invalid-json', { error: 'Unavailable' }]) {
    const { elements, errors } = await gallery([response]);
    assert.equal(elements.recipeCountBadge.textContent, 'Recipes unavailable');
    assert.equal(elements.recipeFilterEmpty.role, 'alert');
    assert.match(elements.recipeFilterEmpty.textContent, /could not be loaded/);
    assert.equal(elements.recipeFilterEmpty.children[0].textContent, 'Retry');
    assert.equal(errors.length, 1);
  }
});

test('gallery retry recovers and a genuinely empty catalogue is not a loading error', async () => {
  const { elements } = await gallery([502, []]);
  elements.recipeFilterEmpty.children[0].handlers.click();
  await new Promise(setImmediate);
  assert.equal(elements.recipeCountBadge.textContent, '0 recipes in the student showcase');
  assert.equal(elements.recipeFilterEmpty.textContent, 'No recipes are available yet.');
  assert.equal(elements.recipeFilterEmpty.style.display, '');
});

test('weekly booking failures remain visible without failing the recipe catalogue', async () => {
  for (const response of [502, 401, { error: 'Unavailable' }]) {
    const { elements, errors } = await gallery([[{ id: 1, name: 'Original recipe' }]], response);
    assert.equal(elements.recipeCountBadge.textContent, '1 recipes in the student showcase');
    assert.equal(elements.recipeCardList.children.length, 1);
    assert.match(elements.recipeCardList.children[0].innerHTML, /Original recipe/);
    assert.match(elements.weeklyRecipeEmpty.textContent, /could not be loaded/);
    assert.equal(elements.weeklyRecipeEmpty.style.display, '');
    assert.equal(errors.length, 1);
  }
});
