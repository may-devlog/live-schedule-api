import http from 'node:http';
import https from 'node:https';

// '::' でIPv4/IPv6の両方を待ち受ける（macOSではlocalhostがIPv6(::1)に解決されることがあり、
// IPv4のみのバインドだとSafari等からの接続が失敗するため）
const host = '::';
const port = Number(process.env.PUBLIC_PROXY_PORT || 3002);
const upstream = new URL(process.env.PUBLIC_API_UPSTREAM || 'https://api.genbgt.com');

const isAllowedPath = (pathname) =>
  pathname.startsWith('/share/') || pathname.startsWith('/public/');

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== 'GET' || !isAllowedPath(requestUrl.pathname)) {
    response.writeHead(405, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'This local proxy only allows public GET requests.' }));
    return;
  }

  const target = new URL(`${requestUrl.pathname}${requestUrl.search}`, upstream);
  const proxyRequest = https.request(target, { method: 'GET', headers: { Accept: 'application/json' } }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 502, {
      'Content-Type': proxyResponse.headers['content-type'] || 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    proxyResponse.pipe(response);
  });

  proxyRequest.on('error', () => {
    response.writeHead(502, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Failed to reach the public API.' }));
  });
  proxyRequest.end();
});

server.listen(port, host, () => {
  console.log(`Read-only public API proxy: http://localhost:${port}`);
  console.log(`Upstream: ${upstream.origin}`);
});
