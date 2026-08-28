import { cp, mkdir, rm, access } from 'node:fs/promises';

const files = [
  'index.html',
  'style.css',
  'main.js',
  'logo-CWaP-1CB.png',
  'default-workflow-v9.svg',
];

const scriptFiles = [
  'workflow-core.js',
  'mock-data.js',
  'scene-config.js',
];

await rm('public', { recursive: true, force: true });
await mkdir('public/scripts', { recursive: true });
await mkdir('public/assets', { recursive: true });

for (const file of files) {
  await cp(file, `public/${file}`);
}

for (const file of scriptFiles) {
  await cp(`scripts/${file}`, `public/scripts/${file}`);
}

try {
  await access('assets');
  await cp('assets', 'public/assets', { recursive: true });
} catch {
}
await cp('tools/_headers', 'public/_headers');
