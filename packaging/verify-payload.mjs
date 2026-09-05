import { access, readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import path from "node:path";
import { checkManifest } from "../adapter/src/model-files.mjs";

const [platform, rawRoot] = process.argv.slice(2);
const root = rawRoot ? path.resolve(rawRoot) : "";
const structureOnly = process.argv.includes("--structure-only");

if (!["macos", "windows"].includes(platform) || !root) {
  console.error("Usage: node packaging/verify-payload.mjs <macos|windows> <payload-dir>");
  process.exit(2);
}

const failures = [];
const warnings = [];
await exists("adapter/src/local-access.mjs");
await exists("adapter/src/model-files.mjs");
await exists("adapter/src/glb.mjs");
await exists("adapter/src/launcher-check.mjs");
await exists(`packaging/models/${platform}.json`);
try { checkManifest(JSON.parse(await readFile(path.join(root, `packaging/models/${platform}.json`), "utf8"))); }
catch (error) { failures.push(`Invalid packaged model manifest: ${error.message}`); }

async function exists(relativePath, kind = "file") {
  const target = path.join(root, relativePath);
  try {
    const info = await stat(target);
    if (kind === "directory" && !info.isDirectory()) throw new Error("not a directory");
    if (kind === "file" && !info.isFile()) throw new Error("not a file");
    if (kind === "file" && info.size === 0) throw new Error("empty file");
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
    const matches = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension));
    if (matches.length) {
      for (const entry of matches) await exists(path.join(relativePath, entry.name));
      return true;
    }
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
  await exists("runtime/backend/runtime_probe.py");
  await exists("runtime/backend/local_paint.py");
  await exists("runtime/models/rembg/u2net.onnx");
  await exists("packaging/windows/runtime-spec.json");
  await exists("packaging/versions.json");
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

  const dino = await stat(path.join(root, "runtime/models/dinov2-giant")).catch(() => null);
  if (!dino?.isDirectory()) {
    warnings.push("runtime/models/dinov2-giant is absent; PBR texture capability will remain disabled.");
  }
  for (const filename of ["runtime/node/node.exe", "runtime/python/python.exe"]) {
    try {
      const bytes = await readFile(path.join(root, filename));
      const offset = bytes.length >= 64 ? bytes.readUInt32LE(60) : -1;
      if (bytes.toString("ascii", 0, 2) !== "MZ" || offset < 0 || offset + 6 > bytes.length
          || bytes.readUInt32LE(offset) !== 0x4550 || bytes.readUInt16LE(offset + 4) !== 0x8664) {
        throw new Error("not a Windows x64 PE executable");
      }
    } catch (error) { failures.push(`${filename}: ${error.message}`); }
  }
  if (!structureOnly && failures.length === 0) {
    if (process.platform !== "win32") {
      failures.push("Windows native runtime verification must run on Windows; --structure-only is not release approval.");
    } else {
      const versions = JSON.parse((await readFile(path.join(root, "packaging/versions.json"), "utf8")).replace(/^\uFEFF/, ""));
      const env = { ...process.env, PYTHONNOUSERSITE: "1", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1" };
      delete env.PYTHONHOME; delete env.PYTHONPATH;
      env.PATH = `${path.join(root, "runtime/python")};${path.join(root, "runtime/cuda-dll")};${env.SystemRoot}\\System32`;
      const node = spawnSync(path.join(root, "runtime/node/node.exe"), ["-p", "JSON.stringify([process.platform,process.arch,process.version])"], { env, encoding: "utf8", timeout: 30000 });
      if (node.status !== 0 || node.stdout.trim() !== JSON.stringify(["win32", "x64", versions.node.version])) failures.push("Bundled Node version/architecture smoke failed");
      const python = spawnSync(path.join(root, "runtime/python/python.exe"), ["-I", path.join(root, "runtime/backend/runtime_probe.py"), "--root", root], { cwd: root, env, encoding: "utf8", timeout: 180000 });
      if (python.status !== 0) failures.push(`Private Python/import smoke failed: ${python.error?.message || python.stderr || python.stdout}`);
      else console.log(python.stdout.trim());
    }
  }
}

if (failures.length > 0) {
  console.error(`Payload verification failed for ${platform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const bytes = await directoryBytes(root);
console.log(`Payload ${structureOnly || platform === "macos" ? "structure checked (not GPU/release approval)" : "runtime smoke verified (GPU validation still required)"}: ${platform} (${(bytes / 1024 ** 3).toFixed(2)} GiB)`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
