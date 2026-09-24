import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));

function startServer(port = 0) {
  const child = spawn(process.execPath, [serverPath, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve({ code, stderr })));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', () => {
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) resolve({ url: match[0], port: Number(match[1]) });
    });
    exited.then(({ code }) => reject(new Error(`server exited with ${code}: ${stderr}`)));
  });
  // A server expected to fail is never awaited as ready; don't let that surface as an unhandled rejection.
  ready.catch(() => {});
  return { child, ready, exited };
}

test('server serves only the app files, with security headers', async (t) => {
  const server = startServer();
  t.after(() => server.child.kill());
  const { url } = await server.ready;

  const home = await fetch(`${url}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /^text\/html/);
  assert.match(home.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');

  for (const path of ['/src/app.js', '/src/core.js', '/src/samples.js', '/src/worker.js', '/src/styles.css']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200, path);
  }
  for (const path of ['/package.json', '/server.mjs', '/src/../package.json', '/fixtures/streambird-v1.txt']) {
    assert.equal((await fetch(`${url}${path}`)).status, 404, path);
  }
  assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400);
  const post = await fetch(`${url}/`, { method: 'POST', body: 'x' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('server explains when its port is already in use', async (t) => {
  const first = startServer();
  t.after(() => first.child.kill());
  const { port } = await first.ready;
  const second = startServer(port);
  t.after(() => second.child.kill());
  const { code, stderr } = await second.exited;
  assert.equal(code, 1);
  assert.match(stderr, new RegExp(`Port ${port} is already in use`));
  assert.match(stderr, /npm start -- --port/);
  assert.doesNotMatch(stderr, /at .*node:/);
});
