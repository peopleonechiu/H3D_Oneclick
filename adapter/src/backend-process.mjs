import { spawn } from "node:child_process";

let child = null;

function parseJsonObject(raw, fallback) {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
  } catch (error) {
    console.error("[adapter] invalid BACKEND_ENV_JSON; using inherited environment", error);
    return fallback;
  }
}

function parseArgs(raw) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      throw new Error("expected a JSON string array");
    }
    return value;
  } catch (error) {
    throw new Error(`invalid BACKEND_ARGS_JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Start a platform backend only when the packaged launcher supplies an
 * absolute command. Docker leaves BACKEND_COMMAND unset and runs a separate
 * service instead. Keeping this here makes the Local Adapter identical in
 * both modes without putting Python, CUDA, or MLX setup into the web app.
 */
export function startManagedBackend() {
  const command = process.env.BACKEND_COMMAND?.trim();
  if (!command) return null;
  if (child) return child;

  let args;
  try {
    args = parseArgs(process.env.BACKEND_ARGS_JSON);
  } catch (error) {
    console.error(`[adapter] ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  const cwd = process.env.BACKEND_WORKDIR?.trim() || undefined;
  const extraEnv = parseJsonObject(process.env.BACKEND_ENV_JSON, {});
  child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));
  child.on("error", (error) => {
    console.error("[adapter] managed backend failed to start", error);
  });
  child.on("exit", (code, signal) => {
    console.log(`[adapter] managed backend exited code=${code ?? "null"} signal=${signal ?? "none"}`);
    child = null;
  });
  console.log(`[adapter] managed backend started: ${command} ${args.join(" ")}`);
  return child;
}

export async function terminateChild(target) {
  if (!target || target.exitCode !== null || target.signalCode !== null) return;
  const exited = new Promise(resolve => target.once("exit", resolve));
  target.kill();
  let timer;
  await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  clearTimeout(timer);
  if (target.exitCode === null && target.signalCode === null) {
    target.kill("SIGKILL");
    await exited;
  }
}

export async function stopManagedBackend() {
  const target = child;
  await terminateChild(target);
  if (child === target) child = null;
}
