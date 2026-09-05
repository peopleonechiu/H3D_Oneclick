import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

export async function modelFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\')
      || relative.split('/').some(p => !p || p === '.' || p === '..' || p.includes(':'))) throw Error('Unsafe model path');
  const resolved = path.resolve(root);
  let target = resolved;
  for (const part of relative.split('/')) {
    target = path.join(target, part);
    if ((await lstat(target).catch(() => null))?.isSymbolicLink()) throw Error('Model symlinks are not allowed');
  }
  return target;
}

export async function verifyFile(filename, file) {
  try {
    const info = await stat(filename);
    if (!info.isFile() || info.size !== file.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    return hash.digest('hex') === file.sha256;
  } catch { return false; }
}

export function checkManifest(manifest) {
  if (!manifest || !/^[\w-]+\/[\w.-]+$/.test(manifest.repository) || !/^[a-f0-9]{40}$/.test(manifest.revision)
      || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('Invalid pinned model manifest');
  const names = new Set();
  for (const file of manifest.files) {
    if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)
        || names.has(file.path)) throw Error('Invalid model file metadata');
    names.add(file.path);
  }
}

export async function verifyModel(root, manifest) {
  checkManifest(manifest);
  for (const file of manifest.files) {
    if (!await verifyFile(await modelFile(root, file.path), file)) throw Error(`Model checksum/size mismatch: ${file.path}`);
  }
}

export async function downloadModel(manifest, target, { signal, fetchImpl = fetch, progress = () => {} } = {}) {
  checkManifest(manifest);
  try {
    await verifyModel(target, manifest);
    signal?.throwIfAborted();
    return;
  } catch (error) { if (signal?.aborted) throw error; }
  const staging = `${target}.partial`;
  await mkdir(staging, { recursive: true });
  if ((await lstat(staging)).isSymbolicLink()) throw Error('Staging cannot be a symlink');
  let completeBytes = 0;
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
  for (const file of manifest.files) {
    signal?.throwIfAborted();
    const final = await modelFile(staging, file.path);
    await mkdir(path.dirname(final), { recursive: true });
    if (await verifyFile(final, file)) { completeBytes += file.size; progress(completeBytes, totalBytes); continue; }
    const partial = await modelFile(staging, `${file.path}.partial`);
    const info = await stat(partial).catch(() => null);
    let offset = info?.size && info.size < file.size ? info.size : 0;
    const url = `https://huggingface.co/${manifest.repository}/resolve/${manifest.revision}/${file.path}`;
    const response = await fetchImpl(url, { signal, headers: offset ? { Range: `bytes=${offset}-` } : {} });
    if (!response.ok || !response.body) throw Error(`Download HTTP ${response.status}: ${file.path}`);
    if (response.status === 206) {
      if (response.headers.get('content-range') !== `bytes ${offset}-${file.size - 1}/${file.size}`) throw Error('Invalid download range');
    } else { offset = 0; }
    let received = offset;
    const input = Readable.fromWeb(response.body);
    input.on('data', chunk => {
      received += chunk.length;
      if (received > file.size) input.destroy(Error('Download exceeds expected size'));
      progress(completeBytes + received, totalBytes);
    });
    await pipeline(input, createWriteStream(partial, { flags: offset ? 'a' : 'w' }), { signal });
    if (!await verifyFile(partial, file)) throw Error(`Downloaded checksum mismatch: ${file.path}`);
    await rename(partial, final);
    completeBytes += file.size;
    progress(completeBytes, totalBytes);
  }
  await verifyModel(staging, manifest);
  signal?.throwIfAborted();
  let backup = null;
  if (await lstat(target).catch(() => null)) {
    backup = `${target}.backup-${Date.now()}`;
    await rename(target, backup);
  }
  try { await rename(staging, target); }
  catch (error) { if (backup) await rename(backup, target); throw error; }
  if (backup) console.log(`Previous model preserved at ${backup}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const controller = new AbortController();
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => controller.abort());
  try {
    const [manifestPath, target] = process.argv.slice(2);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    let last = 0;
    await downloadModel(manifest, path.resolve(target), { signal: controller.signal, progress(bytes, total) {
      if (Date.now() - last > 500 || bytes === total) {
        console.log(`JIC_TOTAL_BYTES=${total}\nJIC_DOWNLOADED_BYTES=${bytes}`); last = Date.now();
      }
    } });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
