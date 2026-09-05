import net from 'node:net';
const [mode, ...args] = process.argv.slice(2);
if (mode === 'ports') {
  const servers = [];
  try {
    if (new Set(args).size !== args.length) throw Error('Application ports must be different.');
    for (const raw of args) {
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error(`Invalid port: ${raw}`);
      const server = net.createServer();
      await new Promise((resolve, reject) => {
        server.once('error', () => reject(Error(`Port ${port} is in use. Set JIC_WEB_PORT / JIC_ADAPTER_PORT / JIC_BACKEND_PORT to unused ports.`)));
        server.listen(port, '127.0.0.1', resolve);
      });
      servers.push(server);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { for (const server of servers) server.close(); }
} else if (mode === 'ready') {
  const [url, platform] = args;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
      const data = await response.json();
      if (response.ok && data.adapter === 'jic-local-adapter' && data.platform === platform
          && (data.backendHealth === 'ready' || data.hardware?.supported === false)) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) { console.error('Local service startup failed. Inspect adapter/web logs.'); process.exitCode = 1; }
} else { console.error('Usage: launcher-check.mjs ports <ports...> | ready <url> <platform>'); process.exitCode = 2; }
