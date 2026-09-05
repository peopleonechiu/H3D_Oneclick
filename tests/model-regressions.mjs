import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { downloadModel, verifyModel } from '../adapter/src/model-files.mjs';
import { validateGlb } from '../adapter/src/glb.mjs';

const work = await mkdtemp(path.join(os.tmpdir(), 'h3d-model-test-'));
const data = Buffer.from('verified fixture model');
const manifest = { repository: 'owner/model', revision: 'a'.repeat(40), files: [
  { path: 'weights.bin', size: data.length, sha256: createHash('sha256').update(data).digest('hex') },
] };
try {
  const target = path.join(work, 'model');
  await mkdir(target); await writeFile(path.join(target, 'old.bin'), 'previous model');
  await assert.rejects(downloadModel(manifest, target, { fetchImpl: async () => new Response(Buffer.alloc(data.length)) }), /checksum/);
  assert.equal(await readFile(path.join(target, 'old.bin'), 'utf8'), 'previous model');
  console.log('PASS corrupt download preserves previous model');
  await writeFile(`${target}.partial/weights.bin.partial`, data.subarray(0, 5));
  await downloadModel(manifest, target, { fetchImpl: async (url, options) => {
    assert.match(url, /\/resolve\/a{40}\/weights.bin$/);
    assert.equal(options.headers.Range, 'bytes=5-');
    return new Response(data.subarray(5), { status: 206, headers: { 'content-range': `bytes 5-${data.length - 1}/${data.length}` } });
  } });
  await verifyModel(target, manifest);
  assert.ok((await readdir(work)).some(name => name.startsWith('model.backup-')));
  console.log('PASS pinned range resume and recoverable model replacement');
  await downloadModel(manifest, target, { fetchImpl: async () => { throw Error('must not access network'); } });
  console.log('PASS missing ready marker can recover verified model without downloading');
  await assert.rejects(verifyModel(target, { ...manifest, files: [{ ...manifest.files[0], path: '../outside' }] }), /Unsafe/);
  console.log('PASS manifest path traversal rejected');
  assert.throws(() => validateGlb(Buffer.from('glTF')), /invalid/);
  const glb = Buffer.alloc(28); glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(100, 8);
  assert.throws(() => validateGlb(glb), /invalid/);
  console.log('PASS truncated and wrong-length GLB rejected');
} finally { await rm(work, { recursive: true, force: true }); }
