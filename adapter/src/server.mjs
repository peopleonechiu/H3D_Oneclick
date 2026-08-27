import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import Busboy from "busboy";
import { startManagedBackend, stopManagedBackend } from "./backend-process.mjs";

const PORT = Number(process.env.PORT || 8787);
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:11234").replace(/\/$/, "");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const OUTPUT_DIR = path.join(DATA_DIR, "outputs");
const MODEL_STATE_FILE = path.join(DATA_DIR, "model-state.json");
const MODEL_ID = "hunyuan3d-2-1-8bit";
const BACKEND_MODEL_TARGET = process.env.BACKEND_MODEL_TARGET?.trim() || MODEL_ID;
const BACKEND_REQUEST_MODEL = process.env.BACKEND_REQUEST_MODEL?.trim() || BACKEND_MODEL_TARGET;
const BACKEND_PROTOCOL = process.env.BACKEND_PROTOCOL?.trim() || "mlx-native";
const MODEL_DISPLAY_NAME = process.env.MODEL_DISPLAY_NAME?.trim()
  || (BACKEND_PROTOCOL === "official-hunyuan" ? "Hunyuan3D 2.1 (CUDA)" : "Hunyuan3D 2.1 (8-bit)");
const MODEL_EXPECTED_PATH = process.env.MODEL_EXPECTED_PATH?.trim() || "";
const MODEL_PROGRESS_PATH = process.env.MODEL_PROGRESS_PATH?.trim() || MODEL_EXPECTED_PATH;
const MODEL_MANIFEST_PATH = process.env.MODEL_MANIFEST_PATH?.trim() || "";
const configuredModelBytes = process.env.MODEL_TOTAL_BYTES === undefined
  ? 8_100_000_000
  : Number(process.env.MODEL_TOTAL_BYTES);
const MODEL_BYTES = Number.isFinite(configuredModelBytes) && configuredModelBytes > 0
  ? configuredModelBytes
  : 0;
const MODEL_DOWNLOAD_COMMAND = process.env.MODEL_DOWNLOAD_COMMAND?.trim() || "";
const MODEL_DOWNLOAD_ARGS = parseJsonArray(process.env.MODEL_DOWNLOAD_ARGS_JSON);
const MODEL_DOWNLOAD_ENV = parseJsonObject(process.env.MODEL_DOWNLOAD_ENV_JSON, {});
const MODEL_DOWNLOAD_WORKDIR = process.env.MODEL_DOWNLOAD_WORKDIR?.trim() || undefined;
const OPEN_OUTPUT_FOLDER_COMMAND = process.env.OPEN_OUTPUT_FOLDER_COMMAND?.trim() || "";
const OPEN_OUTPUT_FOLDER_ARGS = parseJsonArray(process.env.OPEN_OUTPUT_FOLDER_ARGS_JSON, ["{outputDir}"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const jobs = new Map();
const downloads = new Map();
const downloadTimers = new Map();
const downloadProcesses = new Map();
let modelInstalled = false;

await mkdir(OUTPUT_DIR, { recursive: true });
try {
  const saved = JSON.parse(await readFile(MODEL_STATE_FILE, "utf8"));
  const savedReady = saved.modelId === MODEL_ID && saved.state === "ready";
  modelInstalled = savedReady && (!MODEL_EXPECTED_PATH || await modelPathReady());
} catch {
  // A model directory alone is not enough to declare a completed install:
  // interrupted downloads can leave config files behind. The downloader or
  // the mock state machine must write the ready marker first.
  modelInstalled = false;
}

function parseJsonObject(raw, fallback) {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch (error) {
    console.error(`[adapter] invalid JSON object: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

function parseJsonArray(raw, fallback = []) {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error("expected an array of strings");
    }
    return value;
  } catch (error) {
    console.error(`[adapter] invalid JSON array: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

async function modelPathReady() {
  if (!MODEL_EXPECTED_PATH) return false;
  try {
    const info = await stat(MODEL_EXPECTED_PATH);
    if (info.isFile()) return info.size > 0;
    if (!info.isDirectory()) return false;
    let hasManifest = false;
    let hasWeights = false;
    async function scan(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await scan(target);
          continue;
        }
        if (/^(config|model_index)\.(json|ya?ml)$/i.test(entry.name)) hasManifest = true;
        if (/\.(safetensors|bin|pt|pth|ckpt)$/i.test(entry.name)) hasWeights = true;
      }
    }
    await scan(MODEL_EXPECTED_PATH);
    return hasManifest && hasWeights;
  } catch {
    return false;
  }
}

async function modelPathBytes(target) {
  if (!target) return 0;
  try {
    const info = await stat(target);
    if (info.isFile()) return info.size;
    if (!info.isDirectory()) return 0;
    const entries = await readdir(target, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      total += await modelPathBytes(path.join(target, entry.name));
    }
    return total;
  } catch {
    return 0;
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function validateModelManifest() {
  if (!MODEL_MANIFEST_PATH) return { ok: true };
  if (!MODEL_EXPECTED_PATH) return { ok: false, message: "model manifest has no expected model path" };
  try {
    const manifest = JSON.parse(await readFile(MODEL_MANIFEST_PATH, "utf8"));
    if (manifest.modelId && manifest.modelId !== MODEL_ID) {
      return { ok: false, message: "model manifest id does not match the application" };
    }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      return { ok: false, message: "model manifest has no files" };
    }
    for (const file of manifest.files) {
      if (!file?.path || !file?.sha256) return { ok: false, message: "model manifest contains an invalid file entry" };
      const target = path.resolve(MODEL_EXPECTED_PATH, file.path);
      if (!target.startsWith(`${path.resolve(MODEL_EXPECTED_PATH)}${path.sep}`)) {
        return { ok: false, message: "model manifest contains an unsafe path" };
      }
      const info = await stat(target);
      if (!info.isFile() || (file.size !== undefined && Number(file.size) !== info.size)) {
        return { ok: false, message: `model file size mismatch: ${file.path}` };
      }
      const digest = await sha256File(target);
      if (digest.toLowerCase() !== String(file.sha256).toLowerCase()) {
        return { ok: false, message: `model checksum mismatch: ${file.path}` };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `model manifest validation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function setDownloadProgress(state, downloadedBytes) {
  state.downloadedBytes = Math.max(0, downloadedBytes);
  state.progress = state.totalBytes > 0
    ? Math.min(1, state.downloadedBytes / state.totalBytes)
    : null;
  state.indeterminate = state.totalBytes <= 0;
}

function backendIsHealthy(data) {
  const status = String(data?.status || "").toLowerCase();
  return (["ok", "healthy", "ready"].includes(status) || data?.modelReady === true)
    && data?.hardware?.supported !== false;
}

function localHardware() {
  const platform = process.env.PLATFORM || "";
  if (!platform || platform === "docker-mock") return null;
  const memoryBytes = os.totalmem();
  const architecture = os.arch();
  const nativeProbe = process.env.JIC_NATIVE_RUNTIME === "1";
  if (!nativeProbe && platform === "macos-arm64") {
    return {
      supported: true,
      accelerator: "Apple GPU / Metal",
      probeSkipped: true,
    };
  }
  return {
    supported: platform === "macos-arm64" ? architecture === "arm64" : true,
    architecture,
    memoryBytes,
    memoryGb: Number((memoryBytes / 1024 ** 3).toFixed(1)),
    accelerator: platform === "macos-arm64" ? "Apple GPU / Metal" : "NVIDIA CUDA",
  };
}

function memoryClass(hardware) {
  if (!hardware) return "unknown";
  if (hardware.probeSkipped) return "unknown";
  if (Number.isFinite(hardware.vramGb)) {
    if (hardware.vramGb >= 29) return "recommended";
    if (hardware.vramGb >= 10) return "supported";
    return "limited";
  }
  if (Number.isFinite(hardware.memoryGb)) {
    if (hardware.memoryGb >= 32) return "recommended";
    if (hardware.memoryGb >= 16) return "supported";
    return "limited";
  }
  return "unknown";
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(body);
}

function empty(res, status = 204) {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end();
}

function errorPayload(code, message, details = {}) {
  return { error: { code, message, details } };
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function backendFetch(endpoint, options = {}) {
  return fetch(`${BACKEND_URL}${endpoint}`, options);
}

async function backendHealth() {
  try {
    const response = await backendFetch("/health");
    const body = await response.text();
    let data;
    try { data = JSON.parse(body); } catch { data = { status: response.ok ? "ok" : "down", message: body.slice(0, 300) }; }
    return response.ok ? data : { status: "down", error: data };
  } catch (error) {
    return { status: "down", error: error instanceof Error ? error.message : String(error) };
  }
}

async function ensureBackendModel() {
  if (!modelInstalled) return false;
  try {
    const response = await backendFetch("/v1/load-model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: BACKEND_REQUEST_MODEL,
        path: BACKEND_MODEL_TARGET,
        default: true,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getCapabilities() {
  const backend = await backendHealth();
  const hardware = backend.hardware || localHardware();
  const backendReady = backendIsHealthy(backend) && hardware?.supported !== false;
  // `ready` means the model is installed and the backend process is healthy;
  // loading the weights is deferred until a job starts so the default
  // launch does not consume GPU/unified memory before the student generates.
  const modelReady = modelInstalled && backendReady;
  const backendCapabilities = backend.capabilities || {};
  const textureAvailable = backendCapabilities.texture === undefined
    ? process.env.PLATFORM === "docker-mock" && modelReady
    : modelReady && Boolean(backendCapabilities.texture);
  const modelState = modelReady
    ? "ready"
    : !modelInstalled
      ? "missing"
      : backendReady
        ? "loading"
        : "unavailable";
  return {
    platform: process.env.PLATFORM || "docker-mock",
    backend: process.env.BACKEND_KIND || "mock",
    adapter: "jic-local-adapter",
    backendHealth: backendReady ? "ready" : "unavailable",
    modelState,
    backendMessage: backend.message || backend.error?.message || null,
    protocol: BACKEND_PROTOCOL,
    capabilities: {
      shape: modelReady,
      texture: textureAvailable,
      formats: ["glb"],
      stream: backendReady,
      cancel: true,
    },
    qualityPresets: ["fast", "balanced", "fine"],
    memoryClass: backend.memoryClass || memoryClass(hardware),
    hardware,
  };
}

function currentDownload() {
  return downloads.get(MODEL_ID) || {
    modelId: MODEL_ID,
    state: modelInstalled ? "ready" : "missing",
    downloadedBytes: modelInstalled ? MODEL_BYTES : 0,
    totalBytes: MODEL_BYTES,
    progress: modelInstalled ? 1 : 0,
    indeterminate: MODEL_BYTES <= 0,
  };
}

async function markModelReady(state, revision = "external") {
  const validation = await validateModelManifest();
  if (!validation.ok) {
    state.state = "failed";
    state.error = validation.message;
    state.failedAt = new Date().toISOString();
    return false;
  }
  state.state = "ready";
  state.completedAt = new Date().toISOString();
  setDownloadProgress(state, state.totalBytes > 0 ? state.totalBytes : await modelPathBytes(MODEL_EXPECTED_PATH));
  modelInstalled = true;
  await writeJson(MODEL_STATE_FILE, {
    modelId: MODEL_ID,
    state: "ready",
    revision,
    installedAt: state.completedAt,
    expectedPath: MODEL_EXPECTED_PATH || null,
  });
  await backendFetch("/v1/models/rescan", { method: "POST" }).catch(() => {});
  await ensureBackendModel();
  return true;
}

function attachDownloadOutput(child, state) {
  const consume = (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[model-download] ${text}`);
    for (const line of text.split(/\r?\n/)) {
      const total = line.match(/JIC_TOTAL_BYTES=(\d+)/)?.[1];
      const downloaded = line.match(/JIC_DOWNLOADED_BYTES=(\d+)/)?.[1];
      if (total) {
        state.totalBytes = Number(total);
        state.indeterminate = false;
      }
      if (downloaded) setDownloadProgress(state, Number(downloaded));
    }
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
}

function startExternalModelDownload(state) {
  if (!MODEL_DOWNLOAD_COMMAND || MODEL_DOWNLOAD_ARGS.length === 0) return false;
  let child;
  try {
    child = spawn(MODEL_DOWNLOAD_COMMAND, MODEL_DOWNLOAD_ARGS, {
      cwd: MODEL_DOWNLOAD_WORKDIR,
      env: { ...process.env, ...MODEL_DOWNLOAD_ENV },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    state.state = "failed";
    state.error = error instanceof Error ? error.message : String(error);
    return true;
  }

  let finished = false;
  const poll = setInterval(async () => {
    const bytes = await modelPathBytes(MODEL_PROGRESS_PATH);
    if (bytes > state.downloadedBytes) setDownloadProgress(state, bytes);
  }, 750);
  downloadTimers.set(MODEL_ID, poll);
  downloadProcesses.set(MODEL_ID, child);
  attachDownloadOutput(child, state);

  const finish = async (code, errorMessage = "") => {
    if (finished) return;
    finished = true;
    clearInterval(poll);
    downloadTimers.delete(MODEL_ID);
    downloadProcesses.delete(MODEL_ID);
    const bytes = await modelPathBytes(MODEL_PROGRESS_PATH);
    if (bytes > state.downloadedBytes) setDownloadProgress(state, bytes);

    if (state.state === "cancelled") return;
    if (errorMessage || code !== 0) {
      state.state = "failed";
      state.error = errorMessage || `model downloader exited with code ${code}`;
      state.failedAt = new Date().toISOString();
      return;
    }
    if (MODEL_EXPECTED_PATH && !await modelPathReady()) {
      state.state = "failed";
      state.error = "model downloader completed without a valid model directory";
      state.failedAt = new Date().toISOString();
      return;
    }
    await markModelReady(state, "downloaded");
  };

  child.once("error", (error) => void finish(null, error instanceof Error ? error.message : String(error)));
  child.once("exit", (code) => void finish(code));
  return true;
}

function startMockModelDownload(state) {
  const timer = setInterval(async () => {
    setDownloadProgress(state, Math.min(MODEL_BYTES, state.downloadedBytes + 270_000_000));
    if (state.downloadedBytes < MODEL_BYTES) return;

    clearInterval(timer);
    downloadTimers.delete(MODEL_ID);
    await markModelReady(state, "mock-fixture");
  }, 180);
  downloadTimers.set(MODEL_ID, timer);
}

function startModelDownload() {
  const active = downloads.get(MODEL_ID);
  if (active?.state === "downloading") return active;
  if (modelInstalled) return currentDownload();

  const resumeFrom = active?.state === "cancelled" ? active.downloadedBytes : 0;

  const state = {
    modelId: MODEL_ID,
    state: "downloading",
    downloadedBytes: resumeFrom,
    totalBytes: MODEL_BYTES,
    progress: MODEL_BYTES > 0 ? resumeFrom / MODEL_BYTES : null,
    indeterminate: MODEL_BYTES <= 0,
    startedAt: new Date().toISOString(),
  };
  downloads.set(MODEL_ID, state);

  if (!startExternalModelDownload(state)) {
    if (process.env.PLATFORM === "docker-mock" || !MODEL_EXPECTED_PATH) {
      startMockModelDownload(state);
    } else {
      state.state = "failed";
      state.error = "model downloader is not configured";
      state.failedAt = new Date().toISOString();
    }
  }

  return state;
}

function cancelModelDownload() {
  const active = downloads.get(MODEL_ID);
  if (!active || active.state !== "downloading") return currentDownload();
  const timer = downloadTimers.get(MODEL_ID);
  if (timer) clearInterval(timer);
  downloadTimers.delete(MODEL_ID);
  const child = downloadProcesses.get(MODEL_ID);
  active.state = "cancelled";
  active.cancelledAt = new Date().toISOString();
  if (child && !child.killed) child.kill();
  return active;
}

function readBody(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("request too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: MAX_IMAGE_BYTES },
      });
    } catch (error) {
      reject(error);
      return;
    }

    const fields = {};
    const imageChunks = [];
    let imageSeen = false;
    let tooLarge = false;

    parser.on("field", (name, value) => {
      fields[name] = value;
    });
    parser.on("file", (name, file) => {
      if (name !== "photo") {
        file.resume();
        return;
      }
      imageSeen = true;
      file.on("data", (chunk) => imageChunks.push(chunk));
      file.on("limit", () => { tooLarge = true; });
    });
    parser.on("error", reject);
    parser.on("finish", () => {
      if (tooLarge) {
        reject(new Error("photo too large"));
        return;
      }
      resolve({ fields, image: imageSeen ? Buffer.concat(imageChunks) : null });
    });
    req.pipe(parser);
  });
}

async function parseJobRequest(req) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    const parsed = await parseMultipart(req);
    return { fields: parsed.fields, image: parsed.image };
  }

  const body = await readBody(req);
  const value = JSON.parse(body.toString("utf8"));
  const rawImage = typeof value.image === "string" ? value.image : "";
  const encoded = rawImage.includes(",") ? rawImage.slice(rawImage.indexOf(",") + 1) : rawImage;
  return {
    fields: value,
    image: encoded ? Buffer.from(encoded, "base64") : null,
  };
}

function numberField(fields, name, fallback, min, max) {
  const value = Number(fields[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function booleanField(fields, name, fallback = false) {
  if (fields[name] === undefined) return fallback;
  return fields[name] === true || fields[name] === "true" || fields[name] === "1";
}

function jobEvent(job, event) {
  const payload = { ...event, jobId: job.id };
  job.events.push(payload);
  job.lastEvent = payload;
  for (const client of job.clients) {
    if (!client.destroyed) client.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function qualityDefaults(preset) {
  switch (preset) {
    case "fast": return { steps: 15, resolution: 128 };
    case "fine": return { steps: 40, resolution: 384 };
    default: return { steps: 30, resolution: 256 };
  }
}

async function requestOfficialHunyuan(job, request) {
  jobEvent(job, {
    type: "progress",
    stage: "shape",
    step: 0,
    total: 0,
    indeterminate: true,
    message: "Generating shape",
  });
  const response = await backendFetch("/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image: request.image,
      remove_background: true,
      texture: request.texture,
      seed: request.seed ?? 42,
      octree_resolution: request.octree_resolution,
      num_inference_steps: Math.min(20, Math.max(1, request.steps)),
      guidance_scale: request.guidance_scale,
    }),
    signal: job.controller.signal,
  });

  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    const message = body.toString("utf8");
    throw new Error(`backend ${response.status}: ${message.slice(0, 300)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json") || body[0] === 0x7b) {
    let payload;
    try { payload = JSON.parse(body.toString("utf8")); } catch { payload = null; }
    if (payload?.data) return Buffer.from(payload.data, "base64");
    throw new Error(payload?.error?.message || "official backend returned no GLB");
  }
  if (request.texture) {
    jobEvent(job, {
      type: "progress",
      stage: "texture",
      step: 0,
      total: 0,
      indeterminate: true,
      message: "Painting PBR texture",
    });
  }
  return body;
}

async function releaseBackendModel() {
  try {
    await backendFetch("/v1/unload-model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: BACKEND_REQUEST_MODEL }),
    });
  } catch (error) {
    console.error(`[adapter] unable to unload backend model: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function streamBackend(job, request) {
  const controller = new AbortController();
  job.controller = controller;
  if (job.cancelRequested) controller.abort();

  if (BACKEND_PROTOCOL === "official-hunyuan") {
    return requestOfficialHunyuan(job, request);
  }

  const response = await backendFetch("/v1/3d/generations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, stream: true }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`backend ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.body) throw new Error("backend returned no stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      const event = JSON.parse(raw);
      if (event.type === "progress") {
        jobEvent(job, {
          type: "progress",
          stage: event.stage || "shape",
          step: event.step || 0,
          total: event.total || request.steps,
          indeterminate: Boolean(event.indeterminate),
          message: event.message || "Generating",
        });
      } else if (event.type === "complete") {
        complete = event;
      } else if (event.type === "error") {
        throw new Error(event.message || "backend generation failed");
      }
    }
    if (done) break;
  }
  if (!complete?.data) throw new Error("backend completed without GLB data");
  return Buffer.from(complete.data, "base64");
}

async function saveArtifact(job, glb) {
  if (!Buffer.isBuffer(glb) || glb.length < 4 || glb.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error("backend did not return a valid GLB");
  }
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(OUTPUT_DIR, day);
  await mkdir(dir, { recursive: true });
  const artifactId = job.id;
  const filename = `${artifactId}.glb`;
  const finalPath = path.join(dir, filename);
  const tempPath = `${finalPath}.partial`;
  await writeFile(tempPath, glb);
  await rename(tempPath, finalPath);
  const sha256 = createHash("sha256").update(glb).digest("hex");
  const metadata = {
    artifactId,
    filename,
    format: "glb",
    bytes: glb.length,
    sha256,
    path: finalPath,
    createdAt: new Date().toISOString(),
    job: {
      qualityPreset: job.request.qualityPreset,
      steps: job.request.steps,
      guidance: job.request.guidance,
      meshResolution: job.request.meshResolution,
      texture: job.request.texture,
    },
  };
  await writeJson(`${finalPath}.json`, metadata);
  return metadata;
}

function openOutputFolderNative() {
  let command = OPEN_OUTPUT_FOLDER_COMMAND;
  let args = OPEN_OUTPUT_FOLDER_ARGS;
  if (!command && process.platform === "darwin") {
    command = "open";
    args = [OUTPUT_DIR];
  } else if (!command && process.platform === "win32") {
    command = path.join(process.env.WINDIR || "C:\\Windows", "explorer.exe");
    args = [OUTPUT_DIR];
  }
  if (!command) return false;
  try {
    const resolvedArgs = args.map((arg) => arg.replaceAll("{outputDir}", OUTPUT_DIR));
    const child = spawn(command, resolvedArgs, { windowsHide: true, stdio: "ignore" });
    child.once("error", (error) => console.error(`[adapter] unable to open output folder: ${error.message}`));
    return true;
  } catch (error) {
    console.error(`[adapter] unable to open output folder: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function publicArtifact(artifact) {
  const { path: internalPath, ...safeArtifact } = artifact;
  void internalPath;
  return {
    ...safeArtifact,
    downloadUrl: `/api/outputs/${artifact.artifactId}/artifact`,
  };
}

async function runJob(job) {
  try {
    job.status = "loading";
    jobEvent(job, { type: "status", status: "loading", message: "Preparing local model" });
    const ready = await ensureBackendModel();
    if (!ready) throw new Error("model is not ready");
    if (job.cancelRequested) throw new DOMException("Generation cancelled", "AbortError");

    job.status = "generating";
    jobEvent(job, { type: "status", status: "generating", message: "Generating shape" });
    const glb = await streamBackend(job, {
      model: BACKEND_REQUEST_MODEL,
      image: job.image.toString("base64"),
      steps: job.request.steps,
      guidance_scale: job.request.guidance,
      octree_resolution: job.request.meshResolution,
      seed: job.request.seed ?? 42,
      texture: job.request.texture,
    });

    if (job.cancelRequested) {
      job.status = "cancelled";
      jobEvent(job, { type: "cancelled", status: "cancelled", message: "Generation cancelled" });
      return;
    }

    job.status = "saving";
    jobEvent(job, { type: "status", status: "saving", message: "Saving GLB" });
    job.artifact = await saveArtifact(job, glb);
    job.status = "completed";
    jobEvent(job, {
      type: "complete",
      status: "completed",
      artifact: publicArtifact(job.artifact),
    });
  } catch (error) {
    if (job.cancelRequested || error?.name === "AbortError") {
      job.status = "cancelled";
      jobEvent(job, { type: "cancelled", status: "cancelled", message: "Generation cancelled" });
      return;
    }
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    jobEvent(job, {
      type: "error",
      status: "failed",
      code: "GENERATION_FAILED",
      message: "Generation failed",
      details: { reason: job.error },
    });
  } finally {
    if (!job.request.keepModelLoaded) await releaseBackendModel();
    job.controller = null;
    for (const client of job.clients) {
      if (!client.destroyed) client.end();
    }
    job.clients.clear();
  }
}

async function listArtifacts() {
  const result = [];
  let days = [];
  try { days = await readdir(OUTPUT_DIR, { withFileTypes: true }); } catch { return result; }
  for (const day of days) {
    if (!day.isDirectory()) continue;
    const dir = path.join(OUTPUT_DIR, day.name);
    let files = [];
    try { files = await readdir(dir); } catch { continue; }
    for (const filename of files.filter((name) => name.endsWith(".glb"))) {
      const filePath = path.join(dir, filename);
      const metadataPath = `${filePath}.json`;
      try {
        const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
        result.push(metadata);
      } catch {
        const fileStat = await stat(filePath);
        result.push({
          artifactId: filename.replace(/\.glb$/, ""),
          filename,
          format: "glb",
          bytes: fileStat.size,
          path: filePath,
          createdAt: fileStat.mtime.toISOString(),
        });
      }
    }
  }
  return result.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function findArtifact(artifactId) {
  const artifacts = await listArtifacts();
  return artifacts.find((artifact) => artifact.artifactId === artifactId) || null;
}

async function createJob(req, res) {
  if (!modelInstalled) {
    json(res, 409, errorPayload("MODEL_MISSING", "Download the model before generating."));
    return;
  }

  let parsed;
  try {
    parsed = await parseJobRequest(req);
  } catch (error) {
    json(res, 400, errorPayload("INVALID_REQUEST", error instanceof Error ? error.message : "Invalid request"));
    return;
  }
  if (!parsed.image || parsed.image.length === 0) {
    json(res, 400, errorPayload("INVALID_IMAGE", "Choose a PNG or JPEG photo."));
    return;
  }
  if (parsed.image.length > MAX_IMAGE_BYTES) {
    json(res, 413, errorPayload("INVALID_IMAGE", "Photo is larger than 20 MB."));
    return;
  }

  const defaults = qualityDefaults(parsed.fields.qualityPreset);
  const request = {
    qualityPreset: ["fast", "balanced", "fine"].includes(parsed.fields.qualityPreset)
      ? parsed.fields.qualityPreset : "balanced",
    steps: Math.round(numberField(parsed.fields, "steps", defaults.steps, 1, 100)),
    guidance: numberField(parsed.fields, "guidance", 5, 0, 20),
    meshResolution: Math.round(numberField(parsed.fields, "meshResolution", defaults.resolution, 64, 512)),
    texture: booleanField(parsed.fields, "texture"),
    keepModelLoaded: booleanField(parsed.fields, "keepModelLoaded"),
    seed: parsed.fields.seed === "" || parsed.fields.seed == null ? null : Math.round(numberField(parsed.fields, "seed", 42, 0, 0x7fffffff)),
  };

  if (request.texture && !((await getCapabilities()).capabilities.texture)) {
    json(res, 409, errorPayload("TEXTURE_UNAVAILABLE", "PBR texture is not available."));
    return;
  }

  const job = {
    id: `job_${randomUUID()}`,
    status: "queued",
    request,
    image: parsed.image,
    events: [],
    clients: new Set(),
    createdAt: new Date().toISOString(),
    cancelRequested: false,
    controller: null,
  };
  jobs.set(job.id, job);
  jobEvent(job, { type: "status", status: "queued", message: "Job queued" });
  void runJob(job);
  json(res, 202, { jobId: job.id, status: job.status, request });
}

function jobSummary(job) {
  return {
    jobId: job.id,
    status: job.status,
    request: job.request,
    createdAt: job.createdAt,
    artifact: job.artifact ? publicArtifact(job.artifact) : null,
    error: job.error ? { code: "GENERATION_FAILED", message: job.error } : null,
    lastEvent: job.lastEvent || null,
  };
}

async function handle(req, res) {
  if (req.method === "OPTIONS") { empty(res); return; }
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (req.method === "GET" && url.pathname === "/api/health") {
    const capabilities = await getCapabilities();
    json(res, 200, { status: "ok", ...capabilities });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/capabilities") {
    json(res, 200, await getCapabilities());
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/models") {
    const capabilities = await getCapabilities();
    const download = currentDownload();
    const state = download.state === "downloading" ? "downloading" : capabilities.modelState;
    json(res, 200, {
      data: [{
        id: MODEL_ID,
        name: MODEL_DISPLAY_NAME,
        state,
        capabilities: capabilities.capabilities,
        totalBytes: download.totalBytes,
        download,
      }],
    });
    return;
  }
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "models" && parts[3] === "download") {
    if (parts[2] !== MODEL_ID) {
      json(res, 404, errorPayload("MODEL_NOT_FOUND", "Model not found."));
      return;
    }
    if (String(process.env.PLATFORM || "").toLowerCase().startsWith("windows")) {
      const capabilities = await getCapabilities();
      if (capabilities.backendHealth !== "ready" || capabilities.hardware?.supported !== true) {
        json(res, 412, errorPayload(
          "UNSUPPORTED_HARDWARE",
          capabilities.hardware?.reason || "A compatible NVIDIA CUDA GPU is required before downloading the Windows model.",
          { hardware: capabilities.hardware || null },
        ));
        return;
      }
    }
    json(res, 202, startModelDownload());
    return;
  }
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "models" && parts[3] === "cancel-download") {
    if (parts[2] !== MODEL_ID) {
      json(res, 404, errorPayload("MODEL_NOT_FOUND", "Model not found."));
      return;
    }
    json(res, 200, cancelModelDownload());
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "models" && parts[3] === "download") {
    json(res, 200, currentDownload());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/jobs") {
    await createJob(req, res);
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "jobs" && parts.length === 3) {
    const job = jobs.get(parts[2]);
    if (!job) { json(res, 404, errorPayload("JOB_NOT_FOUND", "Job not found.")); return; }
    json(res, 200, jobSummary(job));
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "jobs" && parts[3] === "events") {
    const job = jobs.get(parts[2]);
    if (!job) { json(res, 404, errorPayload("JOB_NOT_FOUND", "Job not found.")); return; }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    for (const event of job.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      res.end();
      return;
    }
    job.clients.add(res);
    req.on("close", () => job.clients.delete(res));
    return;
  }
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "jobs" && parts[3] === "cancel") {
    const job = jobs.get(parts[2]);
    if (!job) { json(res, 404, errorPayload("JOB_NOT_FOUND", "Job not found.")); return; }
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      json(res, 200, jobSummary(job));
      return;
    }
    job.cancelRequested = true;
    job.controller?.abort();
    json(res, 202, { jobId: job.id, status: "cancelling" });
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "outputs" && parts.length === 2) {
    json(res, 200, { data: (await listArtifacts()).map(publicArtifact) });
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "outputs" && parts.length === 3) {
    const artifact = await findArtifact(parts[2]);
    if (!artifact) { json(res, 404, errorPayload("ARTIFACT_NOT_FOUND", "Output not found.")); return; }
    json(res, 200, publicArtifact(artifact));
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "jobs" && parts[3] === "artifact") {
    const job = jobs.get(parts[2]);
    if (!job?.artifact) { json(res, 404, errorPayload("ARTIFACT_NOT_FOUND", "Output not found.")); return; }
    const content = await readFile(job.artifact.path);
    res.writeHead(200, {
      "content-type": "model/gltf-binary",
      "content-length": content.length,
      "content-disposition": `inline; filename="${job.artifact.filename}"`,
      "access-control-allow-origin": "*",
    });
    res.end(content);
    return;
  }
  if (req.method === "GET" && parts[0] === "api" && parts[1] === "outputs" && parts[3] === "artifact") {
    const artifact = await findArtifact(parts[2]);
    if (!artifact) { json(res, 404, errorPayload("ARTIFACT_NOT_FOUND", "Output not found.")); return; }
    const content = await readFile(artifact.path);
    res.writeHead(200, {
      "content-type": "model/gltf-binary",
      "content-length": content.length,
      "content-disposition": `inline; filename="${artifact.filename}"`,
      "access-control-allow-origin": "*",
    });
    res.end(content);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/system/open-output-folder") {
    const opened = openOutputFolderNative();
    json(res, 200, {
      ok: opened,
      opened,
      message: opened ? "Output folder opened." : "Folder opening is only available in the desktop package.",
    });
    return;
  }

  json(res, 404, errorPayload("NOT_FOUND", "Route not found."));
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("[adapter] request failed", error);
    if (!res.headersSent) json(res, 500, errorPayload("ADAPTER_ERROR", "Local adapter error."));
    else res.destroy();
  });
});

startManagedBackend();
process.once("SIGINT", () => {
  stopManagedBackend();
  server.close(() => process.exit(0));
});
process.once("SIGTERM", () => {
  stopManagedBackend();
  server.close(() => process.exit(0));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[adapter] listening on http://0.0.0.0:${PORT}`);
  console.log(`[adapter] backend ${BACKEND_URL}`);
  console.log(`[adapter] data ${DATA_DIR}`);
});
