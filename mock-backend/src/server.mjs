import http from "node:http";

const PORT = Number(process.env.PORT || 11234);
const STEP_DELAY_MS = Number(process.env.MOCK_STEP_DELAY_MS || 120);
const MODEL_ID = "hunyuan3d-2-1-8bit";
let modelReady = false;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

function pad4(buffer, fill) {
  const size = (buffer.length + 3) & ~3;
  if (size === buffer.length) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(size - buffer.length, fill)]);
}

function makeMockGlb(textureRequested) {
  const binary = Buffer.alloc(42);
  const positions = [
    [-0.65, -0.45, 0],
    [0.65, -0.45, 0],
    [0, 0.72, 0],
  ];
  positions.forEach(([x, y, z], index) => {
    const offset = index * 12;
    binary.writeFloatLE(x, offset);
    binary.writeFloatLE(y, offset + 4);
    binary.writeFloatLE(z, offset + 8);
  });
  binary.writeUInt16LE(0, 36);
  binary.writeUInt16LE(1, 38);
  binary.writeUInt16LE(2, 40);

  const document = {
    asset: {
      version: "2.0",
      generator: "JIC_YZUIC_Hunyuan3D mock backend",
      extras: { mock: true, textureRequested },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: textureRequested ? [0.15, 0.52, 0.95, 1] : [0.55, 0.62, 0.72, 1],
        metallicFactor: textureRequested ? 0.25 : 0,
        roughnessFactor: textureRequested ? 0.32 : 0.8,
      },
    }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-0.65, -0.45, 0],
        max: [0.65, 0.72, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
  };

  const jsonChunk = pad4(Buffer.from(JSON.stringify(document), "utf8"), 0x20);
  const binaryChunk = pad4(binary, 0);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0); // glTF
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  let offset = 12;
  glb.writeUInt32LE(jsonChunk.length, offset);
  glb.writeUInt32LE(0x4e4f534a, offset + 4); // JSON
  jsonChunk.copy(glb, offset + 8);
  offset += 8 + jsonChunk.length;
  glb.writeUInt32LE(binaryChunk.length, offset);
  glb.writeUInt32LE(0x004e4942, offset + 4); // BIN\0
  binaryChunk.copy(glb, offset + 8);
  return glb;
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sse(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function generate(req, res) {
  if (!modelReady) {
    sendJson(res, 409, { error: { code: "MODEL_NOT_READY", message: "Mock model is not loaded." } });
    return;
  }
  let payload;
  try { payload = JSON.parse((await body(req)).toString("utf8")); } catch {
    sendJson(res, 400, { error: { code: "INVALID_JSON", message: "Invalid JSON." } });
    return;
  }
  if (typeof payload.image !== "string" || payload.image.length === 0) {
    sendJson(res, 400, { error: { code: "MISSING_IMAGE", message: "Missing image." } });
    return;
  }

  const steps = Math.max(1, Math.min(100, Number(payload.steps) || 30));
  const wantsTexture = payload.texture === true;
  if (payload.stream !== true) {
    const glb = makeMockGlb(wantsTexture);
    sendJson(res, 200, { format: "glb", data: glb.toString("base64") });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
  let closed = false;
  req.on("close", () => { closed = true; });
  for (let step = 1; step <= steps && !closed; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS));
    sse(res, {
      type: "progress",
      stage: wantsTexture && step > steps * 0.7 ? "texture" : "shape",
      step,
      total: steps,
      message: wantsTexture && step > steps * 0.7 ? "Painting PBR texture" : "Generating shape",
    });
  }
  if (!closed) {
    const glb = makeMockGlb(wantsTexture);
    sse(res, { type: "complete", format: "glb", data: glb.toString("base64") });
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", backend: "mock", modelReady });
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/models") {
    sendJson(res, 200, {
      data: [{ id: MODEL_ID, state: modelReady ? "ready" : "unloaded", capabilities: ["3d"] }],
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/load-model") {
    modelReady = true;
    sendJson(res, 200, { id: MODEL_ID, state: "ready" });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/unload-model") {
    modelReady = false;
    sendJson(res, 200, { id: MODEL_ID, state: "unloaded" });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/3d/generations") {
    await generate(req, res);
    return;
  }
  sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock-backend] listening on http://0.0.0.0:${PORT}`);
});
