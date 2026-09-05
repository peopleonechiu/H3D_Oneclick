// Run in the adapter Docker image, with the repository mounted at /source
// and adapter/src mounted at /app/src. No GPU or external network is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = process.env.TEST_ROOT || '/source';
const work = await fs.mkdtemp('/tmp/h3d-regression-');
const children = [];
const servers = [];
const pause = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
async function check(name, test) {
  try { await test(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack}`); }
}
function child(args, env = {}) {
  const c = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(c);
  c.output = '';
  c.stdout.on('data', v => c.output += v);
  c.stderr.on('data', v => c.output += v);
  return c;
}
async function start(args, env, url) {
  const c = child(args, env);
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(500) })).ok) return c; } catch {}
    if (c.exitCode !== null) throw Error(c.output);
    await pause(40);
  }
  throw Error(`Startup timeout: ${c.output}`);
}
try {
  const base = 'http://127.0.0.1:19878';
  await start([`${root}/mock-backend/src/server.mjs`], { PORT: '19234', MOCK_STEP_DELAY_MS: '10' }, 'http://127.0.0.1:19234/health');
  const adapter = await start(['/app/src/server.mjs'], {
    PORT: '19878', BACKEND_URL: 'http://127.0.0.1:19234', PLATFORM: 'docker-mock', DATA_DIR: path.join(work, 'data'),
  }, `${base}/api/health`);
  await check('existing public API contract', async () => {
    const c = child([`${root}/tests/contract.mjs`], { BASE_URL: base });
    assert.equal((await once(c, 'exit'))[0], 0, c.output);
  });
  await check('loopback binding', async () => assert.match(adapter.output, /listening on http:\/\/127\.0\.0\.1:/));
  await check('reject untrusted Origin including opaque null', async () => {
    for (const origin of ['https://untrusted.invalid', 'null']) {
      const res = await fetch(`${base}/api/outputs`, { headers: { Origin: origin } });
      assert.equal(res.status, 403);
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');
    }
  });
  await check('reject DNS rebinding Host', async () => {
    const status = await new Promise((resolve, reject) => {
      http.get(`${base}/api/health`, { headers: { Host: 'untrusted.invalid:19878' } }, res => {
        res.resume(); resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(status, 403);
  });
  await check('malformed upload returns 400 without killing adapter', async () => {
    const res = await fetch(`${base}/api/jobs`, {
      method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=probe' },
      body: '--probe\r\nContent-Disposition: form-data; name="photo"; filename="test.png"\r\nContent-Type: image/png\r\n\r\nfixture',
    });
    assert.equal(res.status, 400);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal(adapter.exitCode, null);
  });
  await check('one worker; cancel remains busy until computation finishes', async () => {
    const create = () => fetch(`${base}/api/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: Buffer.from('fixture').toString('base64'), steps: 100 }) });
    const first = await create(); assert.equal(first.status, 202);
    const job = await first.json();
    assert.equal((await create()).status, 409);
    assert.equal((await fetch(`${base}/api/jobs/${job.jobId}/cancel`, { method: 'POST' })).status, 202);
    assert.equal((await create()).status, 409);
    for (let i = 0; i < 150; i++) {
      const state = await (await fetch(`${base}/api/jobs/${job.jobId}`)).json();
      if (state.status === 'cancelled') { assert.equal(state.artifact, null); return; }
      await pause(40);
    }
    assert.fail('cancel never acknowledged');
  });
  await check('adapter shutdown terminates owned downloader', async () => {
    const pidFile = path.join(work, 'download.pid');
    const downloader = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
    const downloadAdapter = await start(['/app/src/server.mjs'], {
      PORT: '19879', BACKEND_URL: 'http://127.0.0.1:19234', PLATFORM: 'docker-mock', DATA_DIR: path.join(work, 'download-data'),
      MODEL_DOWNLOAD_COMMAND: process.execPath, MODEL_DOWNLOAD_ARGS_JSON: JSON.stringify(['-e', downloader]),
    }, 'http://127.0.0.1:19879/api/health');
    await fetch('http://127.0.0.1:19879/api/models/hunyuan3d-2-1-8bit/download', { method: 'POST' });
    let pid;
    for (let i = 0; i < 100; i++) { try { pid = Number(await fs.readFile(pidFile, 'utf8')); break; } catch {} await pause(30); }
    assert.ok(pid);
    downloadAdapter.kill(); await once(downloadAdapter, 'exit');
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  });

  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {}\n\n');
    setTimeout(() => res.destroy(), 80);
  });
  servers.push(upstream);
  upstream.listen(19235, '127.0.0.1'); await once(upstream, 'listening');
  const web = await start([`${root}/web/server.mjs`], {
    PORT: '19173', ADAPTER_URL: 'http://127.0.0.1:19235', DIST_DIR: `${root}/web`,
  }, 'http://127.0.0.1:19173/');
  await check('proxy disconnect does not kill Web server', async () => {
    try { await (await fetch('http://127.0.0.1:19173/api/jobs/test/events')).text(); } catch {}
    await pause(150);
    assert.equal(web.exitCode, null, web.output);
    assert.equal((await fetch('http://127.0.0.1:19173/')).status, 200);
  });
  await check('Web proxy rejects external Origin', async () => {
    assert.equal((await fetch('http://127.0.0.1:19173/api/health', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403);
  });
} finally {
  for (const server of servers) { server.closeAllConnections(); server.close(); }
  for (const c of children) {
    if (c.exitCode === null && c.signalCode === null) {
      c.kill();
      await Promise.race([once(c, 'exit'), pause(3000)]);
      if (c.exitCode === null && c.signalCode === null) c.kill('SIGKILL');
    }
  }
  await fs.rm(work, { recursive: true, force: true });
}
process.exitCode = failures ? 1 : 0;
