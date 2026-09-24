import { cp, mkdir, rm, access, readFile, writeFile } from 'node:fs/promises';

// エディタが index.html に注入する data-page-node-id は、属性値の中（=> や length > 0 の
// 「>」の直後）にも挿入されるため、そのままだと Vue のテンプレート式が壊れて
// 「Invalid left-hand side in assignment」でアプリが起動しなくなる。
// 配信物（public/）には必ず除去してから書き出す。
const stripPageNodeIds = (text) => text.replace(/ data-page-node-id="[^"]*"/g, '');

const files = [
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

await writeFile('public/index.html', stripPageNodeIds(await readFile('index.html', 'utf8')));

for (const file of scriptFiles) {
  await cp(`scripts/${file}`, `public/scripts/${file}`);
}

try {
  await access('assets');
  await cp('assets', 'public/assets', { recursive: true });
} catch {
}
await cp('tools/_headers', 'public/_headers');
