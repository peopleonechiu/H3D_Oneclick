// Host validation prevents DNS rebinding; Origin/Fetch Metadata prevent
// browser requests from unrelated sites. Loopback is the native default.
export function allowLocalRequest(req, res, port, extraOrigins = '') {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  for (const host of (process.env.ALLOWED_HOSTS || '').split(',').filter(Boolean)) hosts.add(host.trim());
  const origins = new Set([...hosts].map(host => `http://${host}`));
  for (const origin of extraOrigins.split(',').filter(Boolean)) origins.add(origin.trim());
  const origin = req.headers.origin;
  if (!hosts.has(req.headers.host) || (origin !== undefined && !origins.has(origin))
      || req.headers['sec-fetch-site'] === 'cross-site') {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden origin or host.');
    return false;
  }
  if (origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  return true;
}
