import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const [platform, rawRoot] = process.argv.slice(2);
const root = rawRoot ? path.resolve(rawRoot) : "";

if (!["macos", "windows"].includes(platform) || !root) {
  console.error("Usage: node packaging/verify-payload.mjs <macos|windows> <payload-dir>");
  process.exit(2);
}

const failures = [];
const warnings = [];

async function exists(relativePath, kind = "file") {
  const target = path.join(root, relativePath);
  try {
    const info = await stat(target);
    if (kind === "directory" && !info.isDirectory()) throw new Error("not a directory");
    if (kind === "file" && !info.isFile()) throw new Error("not a file");
    return true;
  } catch {
    failures.push(`${relativePath} (${kind} missing)`);
    return false;
  }
}

async function nonEmptyDirectory(relativePath) {
  const target = path.join(root, relativePath);
  try {
    const info = await stat(target);
    if (!info.isDirectory()) throw new Error("not a directory");
    if ((await readdir(target)).length === 0) throw new Error("empty directory");
    return true;
  } catch (error) {
    failures.push(`${relativePath} (directory missing or empty: ${error.message})`);
    return false;
  }
}

async function executable(relativePath) {
  const target = path.join(root, relativePath);
  if (!(await exists(relativePath))) return false;
  try {
    await access(target, constants.X_OK);
    return true;
  } catch {
    failures.push(`${relativePath} (not executable)`);
    return false;
  }
}

async function hasFileWithExtension(relativePath, extension) {
  const target = path.join(root, relativePath);
  try {
    const entries = await readdir(target, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))) return true;
    failures.push(`${relativePath} (no ${extension} files found)`);
    return false;
  } catch {
    failures.push(`${relativePath} (directory missing)`);
    return false;
  }
}

async function directoryBytes(target) {
  try {
    const info = await stat(target);
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) return 0;
    let total = 0;
    for (const entry of await readdir(target, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      total += await directoryBytes(path.join(target, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

if (platform === "macos") {
  await executable("runtime/mlx-serve");
  await exists("runtime/node/bin/node");
  await exists("runtime/lib/mlx.metallib");
  await nonEmptyDirectory("runtime/lib");
  await exists("runtime/LICENSE");
  await exists("runtime/LICENSE-APACHE-2.0");
  await exists("runtime/NOTICE");
  await exists("adapter/src/server.mjs");
  await exists("adapter/src/backend-process.mjs");
  await exists("adapter/package.json");
  await exists("adapter/node_modules/busboy/package.json");
  await exists("web/server.mjs");
  await exists("web/dist/index.html");
  await exists("packaging/macos/launch.command");
} else {
  await exists("runtime/node/node.exe");
  await exists("runtime/python/python.exe");
  await exists("runtime/backend/server.py");
  await exists("runtime/backend/download_model.py");
  await exists("runtime/backend/vendor/Hunyuan3D-2.1/LICENSE");
  await exists("runtime/backend/vendor/Hunyuan3D-2.1/Notice.txt");
  await nonEmptyDirectory("runtime/backend/vendor/Hunyuan3D-2.1/hy3dshape");
  await nonEmptyDirectory("runtime/backend/vendor/Hunyuan3D-2.1/hy3dpaint");
  await nonEmptyDirectory("runtime/backend/vendor/Hunyuan3D-2.1");
  await nonEmptyDirectory("runtime/cuda-dll");
  await hasFileWithExtension("runtime/cuda-dll", ".dll");
  await exists("runtime/python/Lib/site-packages/torch/__init__.py");
  await exists("runtime/python/Lib/site-packages/huggingface_hub/__init__.py");
  await exists("runtime/python/Lib/site-packages/PIL/__init__.py");
  await exists("adapter/src/server.mjs");
  await exists("adapter/src/backend-process.mjs");
  await exists("adapter/package.json");
  await exists("adapter/node_modules/busboy/package.json");
  await exists("web/server.mjs");
  await exists("web/dist/index.html");
  await exists("packaging/windows/Launch.ps1");

  if (!(await exists("runtime/models/dinov2-giant", "directory"))) {
    warnings.push("runtime/models/dinov2-giant is absent; PBR texture capability will remain disabled.");
  }
}

if (failures.length > 0) {
  console.error(`Payload verification failed for ${platform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const bytes = await directoryBytes(root);
console.log(`Payload verified: ${platform} (${(bytes / 1024 ** 3).toFixed(2)} GiB)`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
