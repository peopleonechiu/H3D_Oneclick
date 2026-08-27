import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:8787";
const MODEL_ID = "hunyuan3d-2-1-8bit";

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const data = await response.json();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function waitForModel() {
  await fetch(`${BASE_URL}/api/models/${MODEL_ID}/download`, { method: "POST" });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const state = await getJson(`/api/models/${MODEL_ID}/download`);
    if (state.state === "ready") return state;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error("model did not become ready within 15 seconds");
}

async function collectSse(response) {
  assert.equal(response.ok, true, `SSE returned ${response.status}`);
  assert.ok(response.body, "SSE response has no body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      const line = block.split(/\r?\n/).find((item) => item.startsWith("data:"));
      if (line) events.push(JSON.parse(line.slice(5).trim()));
    }
    if (done) break;
  }
  return events;
}

const health = await getJson("/api/health");
assert.equal(health.status, "ok");
if (health.modelState === "missing") {
  const startDownload = await fetch(`${BASE_URL}/api/models/${MODEL_ID}/download`, { method: "POST" });
  assert.equal(startDownload.status, 202);
  const cancelledDownload = await fetch(`${BASE_URL}/api/models/${MODEL_ID}/cancel-download`, { method: "POST" });
  assert.equal(cancelledDownload.status, 200);
  assert.equal((await cancelledDownload.json()).state, "cancelled");
}

const model = await waitForModel();
assert.equal(model.state, "ready");

const capabilities = await getJson("/api/capabilities");
assert.equal(capabilities.modelState, "ready");
assert.equal(capabilities.capabilities.shape, true);
assert.equal(capabilities.capabilities.stream, true);

const form = new FormData();
form.append("photo", new Blob([Buffer.from("mock-photo")], { type: "image/png" }), "sample.png");
form.append("qualityPreset", "fast");
form.append("steps", "6");
form.append("guidance", "5");
form.append("meshResolution", "128");
form.append("texture", "true");

const createResponse = await fetch(`${BASE_URL}/api/jobs`, { method: "POST", body: form });
const created = await createResponse.json();
assert.equal(createResponse.status, 202, JSON.stringify(created));
assert.ok(created.jobId);

const events = await collectSse(await fetch(`${BASE_URL}/api/jobs/${created.jobId}/events`));
assert.ok(events.some((event) => event.type === "progress"), "no progress event");
const complete = events.find((event) => event.type === "complete");
assert.ok(complete?.artifact, "no complete artifact event");
assert.equal(complete.artifact.format, "glb");
assert.equal("path" in complete.artifact, false, "absolute artifact path leaked to client");

const artifactResponse = await fetch(`${BASE_URL}${complete.artifact.downloadUrl}`);
assert.equal(artifactResponse.status, 200);
const artifact = new Uint8Array(await artifactResponse.arrayBuffer());
assert.deepEqual(Array.from(artifact.slice(0, 4)), [0x67, 0x6c, 0x54, 0x46], "artifact is not GLB");

const outputs = await getJson("/api/outputs");
const historyItem = outputs.data.find((item) => item.artifactId === complete.artifact.artifactId);
assert.ok(historyItem);
assert.equal("path" in historyItem, false, "absolute history path leaked to client");

const outputMetadata = await getJson(`/api/outputs/${complete.artifact.artifactId}`);
assert.equal(outputMetadata.artifactId, complete.artifact.artifactId);
assert.equal("path" in outputMetadata, false, "absolute metadata path leaked to client");

const jobArtifactResponse = await fetch(`${BASE_URL}/api/jobs/${created.jobId}/artifact`);
assert.equal(jobArtifactResponse.status, 200);
assert.deepEqual(Array.from(new Uint8Array(await jobArtifactResponse.arrayBuffer()).slice(0, 4)), [0x67, 0x6c, 0x54, 0x46]);

console.log("PASS: health → model download → capabilities → multipart job → SSE → GLB → history");
