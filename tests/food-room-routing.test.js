const test = require('node:test');
const assert = require('node:assert');
const foodRoomRouter = require('../src/modules/foodRoom');

function getRouteHandler(pathName) {
  const route = foodRoomRouter.stack.find((entry) => entry.route && entry.route.path === pathName);
  assert.ok(route, `Expected route for ${pathName} to exist`);
  return route.route.stack[0].handle;
}

test('Food Room public route redirects straight to the legacy homepage', async () => {
  let redirectedTo = null;
  const res = {
    redirect(url) {
      redirectedTo = url;
    }
  };

  await getRouteHandler('/')({}, res);

  assert.strictEqual(redirectedTo, '/food-room/index.html');
});
