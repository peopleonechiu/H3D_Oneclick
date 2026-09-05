// Real UI state functions with a minimal DOM; not browser/visual QA.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) {
    const classes = new Set();
    nodes.set(id, { textContent: '', innerHTML: '', style: {}, dataset: {}, disabled: false,
      classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)),
        contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) } });
  }
  return nodes.get(id);
};
let download = { state: 'downloading', progress: 0.5, downloadedBytes: 50, totalBytes: 100 };
let capabilities = { platform: 'windows-x64-cuda', backend: 'hunyuan3d-cuda', backendHealth: 'unavailable', modelState: 'missing',
  hardware: { supported: false, reason: 'No compatible NVIDIA CUDA device is available.' }, capabilities: { texture: false } };
let downloadReads = 0;
const timers = [];
const context = vm.createContext({ console, URL, THREE: {}, GLTFLoader: class {},
  document: { querySelector: node, getElementById: node, querySelectorAll: () => [], documentElement: {} },
  localStorage: { getItem: () => 'zh-Hant' }, navigator: { language: 'zh-TW' },
  setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
  fetch: async url => ({ ok: true, json: async () => {
    if (url === '/api/capabilities') return capabilities;
    if (url === '/api/models') return { data: [{ name: 'Hunyuan3D', state: download.state, download }] };
    if (url.endsWith('/download')) { downloadReads++; return download; }
    return {};
  } }),
});
let source = await readFile(new URL('../web/src/main.js', import.meta.url), 'utf8');
source = source.replace(/^import .*;\n/gm, '');
source = source.slice(0, source.lastIndexOf('\napplyLanguage();'));
vm.runInContext(`${source}\nglobalThis.ui = {refreshStatus, state, cancelGeneration};`, context);
await context.ui.refreshStatus();
assert.equal(node('platform-guide-message').textContent, '硬體不支援');
assert.equal(node('platform-guide-hardware').textContent, '找不到 NVIDIA GPU');
console.log('PASS unsupported GPU displays reason instead of checking forever');
for (let i = 0; i < 12; i++) await Promise.resolve();
assert.ok(downloadReads > 0);
assert.equal(node('download-percent').textContent, '50%');
assert.equal(node('cancel-download-button').classList.contains('hidden'), false);
console.log('PASS reopening UI resumes download progress and cancellation controls');
context.ui.state.currentJob = 'job-1'; context.ui.state.busy = true;
let closed = false; context.ui.state.eventSource = { close: () => { closed = true; } };
await context.ui.cancelGeneration();
assert.equal(closed, false); assert.equal(context.ui.state.busy, true);
console.log('PASS cancellation keeps job observation and busy state');
