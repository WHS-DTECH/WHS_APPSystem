const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { Pool } = require('pg');

test('recipe summaries stay below 100KB for 130 image-heavy recipes and preserve original images', {
  skip: !process.env.FOOD_ROOM_TEST_DATABASE_URL
}, async () => {
  const schema = `food_gallery_test_${process.pid}`;
  const admin = new Pool({ connectionString: process.env.FOOD_ROOM_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
    connectionString: process.env.FOOD_ROOM_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`
  });
  let server;
  try {
    await pool.query(`
      CREATE TABLE recipes (id integer PRIMARY KEY, ft_images text, ft_primary_slot integer);
      CREATE TABLE recipe_display (
        id integer PRIMARY KEY, recipeid integer, name text, url text,
        image_url text, instructions text, description text, ingredients text
      );
    `);
    const primary = `data:image/png;base64,${Buffer.alloc(200000, 42).toString('base64')}`;
    const second = 'data:image/jpeg;base64,aGVsbG8=';
    const images = JSON.stringify([primary, second]);
    await pool.query(`INSERT INTO recipes (id, ft_images, ft_primary_slot)
      SELECT id, $1, 1 FROM generate_series(1, 130) id`, [images]);
    await pool.query(`INSERT INTO recipe_display (id, recipeid, name, image_url, instructions)
      SELECT id, id, 'Original recipe ' || id, $1, repeat('x', 10000)
      FROM generate_series(1, 130) id`, [primary]);

    const dbPath = require.resolve('../src/legacy/food-room/db');
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    const app = express();
    app.use('/food-room/api/recipes', require('../src/legacy/food-room/routes/recipes'));
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    const base = `http://127.0.0.1:${server.address().port}/food-room/api/recipes`;
    const summary = await fetch(`${base}/display-table?fields=summary`);
    assert.equal(summary.status, 200);
    const text = await summary.text();
    assert.ok(Buffer.byteLength(text) < 100000, `Summary was ${Buffer.byteLength(text)} bytes`);
    assert.ok(!text.includes('data:image'));
    const rows = JSON.parse(text);
    assert.equal(rows.length, 130);
    assert.equal(rows[0].name, 'Original recipe 130');
    assert.equal(rows[0].ft_images, '[]');
    assert.equal(rows[0].image_url, '/food-room/api/recipes/display-table/130/image.jpg');
    assert.ok(!('instructions' in rows[0]));

    const image = await fetch(new URL(rows[0].image_url, base));
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/png/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.alloc(200000, 42));
    await pool.query('UPDATE recipes SET ft_primary_slot = 2 WHERE id = 130');
    const starred = await fetch(`${base}/display-table/130/image.jpg`);
    assert.match(starred.headers.get('content-type'), /image\/jpeg/);
    assert.equal(await starred.text(), 'hello');

    await pool.query("UPDATE recipes SET ft_images = '[]' WHERE id = 130");
    const fallback = await fetch(`${base}/display-table/130/image.jpg`);
    assert.deepEqual(Buffer.from(await fallback.arrayBuffer()), Buffer.alloc(200000, 42));
    await pool.query("UPDATE recipe_display SET image_url = '/food-room/images/original.png' WHERE id = 130");
    const redirect = await fetch(`${base}/display-table/130/image.jpg`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/food-room/images/original.png');
    await pool.query("UPDATE recipe_display SET image_url = '' WHERE id = 130");
    assert.equal((await fetch(`${base}/display-table/130/image.jpg`)).status, 404);
    const noImage = await (await fetch(`${base}/display-table?fields=summary`)).json();
    assert.equal(noImage[0].image_url, '');
    assert.equal((await fetch(`${base}/display-table/999/image.jpg`)).status, 404);
    assert.equal((await fetch(`${base}/display-table/invalid/image.jpg`)).status, 400);

    await pool.query("UPDATE recipes SET submitted_channel = 'food_truck', moderation_status = 'pending' WHERE id = 1");
    const moderated = await (await fetch(`${base}/display-table?fields=summary&scope=food_truck`)).json();
    assert.equal(moderated.length, 0);
    await pool.query("UPDATE recipes SET moderation_status = 'approved' WHERE id = 1");
    assert.equal((await (await fetch(`${base}/display-table?fields=summary&scope=food_truck`)).json()).length, 1);
    const full = await (await fetch(`${base}/display-table`)).json();
    assert.equal(full.length, 130);
    assert.equal(full[1].instructions.length, 10000);
    assert.equal(full[1].ft_images, images);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
