#!/usr/bin/env node
/**
 * Build PRD HTML and push prd-public/ to idp-ph2-prd (Vercel static deploy).
 * Usage: node tools/deploy-prd-site.mjs
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PRD_PUBLIC = path.join(ROOT, 'prd-public');
const REPO_URL = 'git@github.com:aruirage/idp-ph2-prd.git';
const DEPLOY_DIR = path.join(ROOT, '.deploy-idp-ph2-prd');

const VERCEL_JSON = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  headers: [
    {
      source: '/',
      headers: [{ key: 'Cache-Control', value: 'no-cache' }],
    },
    {
      source: '/index.html',
      headers: [{ key: 'Cache-Control', value: 'no-cache' }],
    },
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
  ],
};

const README = `# NeosAI IDP Phase 2 PRD (static site)

Built from [workflow-ph2](https://github.com/aruirage/-IDP-workflow2) · source: \`PRD.zh-CN.md\`

- **Deploy**: Vercel static site — root \`index.html\`, no build step
- **Prototype**: [idp-workflow2.vercel.app](https://idp-workflow2.vercel.app/)

\`\`\`bash
npm run deploy:prd-site
\`\`\`
`;

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

run('npm run build:prd', ROOT);

await rm(DEPLOY_DIR, { recursive: true, force: true });
await mkdir(DEPLOY_DIR, { recursive: true });

try {
  run(`git clone ${REPO_URL} .`, DEPLOY_DIR);
} catch {
  run('git init -b main', DEPLOY_DIR);
  run(`git remote add origin ${REPO_URL}`, DEPLOY_DIR);
}

await cp(path.join(PRD_PUBLIC, 'index.html'), path.join(DEPLOY_DIR, 'index.html'));
await rm(path.join(DEPLOY_DIR, 'assets'), { recursive: true, force: true });
await cp(path.join(PRD_PUBLIC, 'assets'), path.join(DEPLOY_DIR, 'assets'), { recursive: true });
await writeFile(path.join(DEPLOY_DIR, 'vercel.json'), `${JSON.stringify(VERCEL_JSON, null, 2)}\n`);
await writeFile(path.join(DEPLOY_DIR, 'README.md'), README);

run('git add -A', DEPLOY_DIR);
const status = execSync('git status --porcelain', { cwd: DEPLOY_DIR, encoding: 'utf8' });
if (status.trim()) {
  run('git commit -m "Deploy PRD static site from workflow-ph2"', DEPLOY_DIR);
}
run('git push -u origin main', DEPLOY_DIR);

console.log(`Deployed to ${REPO_URL}`);
