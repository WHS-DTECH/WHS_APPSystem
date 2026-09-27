const test = require('node:test');
const assert = require('node:assert');
const sewingHubRouter = require('../src/modules/sewingHub');

function getRouteHandler(pathName) {
  const route = sewingHubRouter.stack.find((entry) => entry.route && entry.route.path === pathName);
  assert.ok(route, `Expected route for ${pathName} to exist`);
  return route.route.stack[0].handle;
}

test('Sewing Hub public route redirects straight to the legacy/public landing page', async () => {
  let redirectedTo = null;
  const req = { user: null };
  const res = {
    redirect(url) {
      redirectedTo = url;
    },
    render() {
      throw new Error('render should not be called for the public route');
    }
  };

  await getRouteHandler('/')(req, res);

  assert.strictEqual(redirectedTo, '/sewing-hub/index.html');
});
