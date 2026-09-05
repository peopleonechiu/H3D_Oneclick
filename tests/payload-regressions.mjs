import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const payload = await mkdtemp(path.join(os.tmpdir(), 'h3d-payload-test-'));
const files = ['runtime/node/node.exe', 'runtime/python/python.exe', 'runtime/backend/server.py',
  'runtime/backend/download_model.py', 'runtime/backend/runtime_probe.py', 'runtime/backend/local_paint.py',
  'runtime/backend/vendor/Hunyuan3D-2.1/LICENSE', 'runtime/backend/vendor/Hunyuan3D-2.1/Notice.txt',
  'runtime/backend/vendor/Hunyuan3D-2.1/hy3dshape/placeholder', 'runtime/backend/vendor/Hunyuan3D-2.1/hy3dpaint/placeholder',
  'runtime/cuda-dll/runtime.dll', 'runtime/python/Lib/site-packages/torch/__init__.py',
  'runtime/python/Lib/site-packages/huggingface_hub/__init__.py', 'runtime/python/Lib/site-packages/PIL/__init__.py',
  'adapter/src/server.mjs', 'adapter/src/backend-process.mjs', 'adapter/src/local-access.mjs', 'adapter/src/glb.mjs',
  'adapter/src/model-files.mjs', 'adapter/src/launcher-check.mjs', 'packaging/models/windows.json', 'runtime/models/rembg/u2net.onnx',
  'adapter/package.json', 'adapter/node_modules/busboy/package.json', 'web/server.mjs', 'web/dist/index.html',
  'packaging/windows/Launch.ps1', 'packaging/windows/runtime-spec.json', 'packaging/versions.json'];
function verify(...flags) { return spawnSync(process.execPath, [path.join(root, 'packaging/verify-payload.mjs'), 'windows', payload, ...flags], { encoding: 'utf8' }); }
try {
  for (const name of files) { const f = path.join(payload, name); await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, ''); }
  await mkdir(path.join(payload, 'runtime/models/dinov2-giant'), { recursive: true });
  const empty = verify('--structure-only');
  assert.notEqual(empty.status, 0, 'zero-byte runtime must fail verification');
  console.log('PASS reject zero-byte Windows runtime');
  for (const name of files) await writeFile(path.join(payload, name), 'fixture');
  await writeFile(path.join(payload, 'packaging/models/windows.json'), await readFile(path.join(root, 'packaging/models/windows.json')));
  const pe = Buffer.alloc(256); pe.write('MZ'); pe.writeUInt32LE(128, 60); pe.write('PE\0\0', 128); pe.writeUInt16LE(0x8664, 132);
  for (const name of ['runtime/node/node.exe', 'runtime/python/python.exe', 'runtime/cuda-dll/runtime.dll']) await writeFile(path.join(payload, name), pe);
  await rm(path.join(payload, 'runtime/models/dinov2-giant'), { recursive: true });
  const optional = verify('--structure-only');
  assert.equal(optional.status, 0, optional.stderr);
  assert.match(optional.stdout, /structure/i);
  assert.match(optional.stderr, /PBR.*disabled/);
  console.log('PASS optional DINO does not block shape-only structural check');
  if (process.platform !== 'win32') {
    const native = verify();
    assert.notEqual(native.status, 0, 'non-Windows cannot approve executable Windows payload');
    assert.match(native.stderr, /Windows/);
    console.log('PASS native Windows verification cannot be bypassed on another OS');
  }
} finally { await rm(payload, { recursive: true, force: true }); }
