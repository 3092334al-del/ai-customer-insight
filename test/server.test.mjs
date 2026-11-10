import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('сервер отдаёт страницу и не выпускает за пределы dist/', async () => {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /legal\.html/, 'ссылка на правовую информацию');
    assert.equal((await fetch(`${base}/legal.html`)).status, 200);
    assert.notEqual((await fetch(`${base}/%2e%2e/server.js`)).status, 200);
  } finally {
    server.close();
  }
});
