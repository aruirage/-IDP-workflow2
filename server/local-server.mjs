import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { handleAggregateRuleRequest } from './aggregate-api.mjs';

const root = new URL('../public/', import.meta.url).pathname;
const envFile = new URL('../.env.local', import.meta.url);
const port = Number(process.env.PORT || 4175);
const host = process.env.HOST || '127.0.0.1';

async function loadLocalEnv() {
  const text = await readFile(envFile, 'utf8').catch(() => '');
  text.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('リクエストサイズが上限を超えています');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

await loadLocalEnv();

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/aggregate-rules') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method Not Allowed' });
      const result = await handleAggregateRuleRequest(await readJson(request));
      return sendJson(response, 200, result);
    }
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const filePath = normalize(join(root, requested));
    if (!filePath.startsWith(normalize(root))) return sendJson(response, 403, { error: 'Forbidden' });
    const body = await readFile(filePath).catch(async () => readFile(join(root, 'index.html')));
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    sendJson(response, 500, { error: error?.message || 'AI関連ルールの生成に失敗しました' });
  }
}).listen(port, host, () => {
  console.log(`Preview server: http://${host}:${port}`);
});
