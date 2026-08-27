import assert from "node:assert/strict";
import process from "node:process";

process.env.BACKEND_COMMAND = process.execPath;
process.env.BACKEND_ARGS_JSON = JSON.stringify(["-e", "setInterval(() => {}, 1000)"]);

const { startManagedBackend, stopManagedBackend } = await import("../adapter/src/backend-process.mjs");
const child = startManagedBackend();
assert.ok(child?.pid, "managed backend did not spawn");

await new Promise((resolve) => setTimeout(resolve, 80));
assert.equal(child.exitCode, null, "managed backend exited unexpectedly");
stopManagedBackend();

console.log("PASS: managed backend process seam");
