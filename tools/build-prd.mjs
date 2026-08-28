import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MD_PATH = path.join(ROOT, 'PRD.zh-CN.md');
const OUT_DIR = path.join(ROOT, 'prd-public');
const OUT_PATH = path.join(OUT_DIR, 'index.html');
const HEADERS_PATH = path.join(ROOT, 'tools', '_headers');

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/&lt;(ins|mark|del) class=&quot;(change-(?:added|modified|deleted))&quot;&gt;/g, '<$1 class="$2">');
  out = out.replace(/&lt;\/(ins|mark|del)&gt;/g, '</$1>');
  return out;
}

function chapterId(title) {
  const match = title.match(/第\s*(\d+)\s*章/);
  return match ? `chapter-${match[1]}` : null;
}

function sectionId(title) {
  const match = title.match(/^6\.(\d+)\s+/);
  return match ? `sec-6-${match[1].padStart(2, '0')}` : null;
}

function sectionNumber(title) {
  const match = title.match(/^6\.(\d+)\s+(.+)$/);
  if (!match) return null;
  return {
    id: `sec-6-${match[1].padStart(2, '0')}`,
    num: String(Number(match[1])),
    label: match[2].trim(),
    full: title.trim(),
  };
}

function parseMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const chapters = [];
  const sections = [];
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const title = line.replace(/^#+\s*/, '').trim();
      const block = { type: 'heading', level, title };
      if (level === 2) {
        block.id = chapterId(title);
        chapters.push({ id: block.id, title });
      }
      if (level === 3) {
        const sec = sectionNumber(title);
        if (sec) {
          block.id = sec.id;
          sections.push(sec);
        }
      }
      blocks.push(block);
      i += 1;
      continue;
    }

    if (/^---\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (/^\|.+\|$/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'table', rows: tableLines });
      continue;
    }

    if (/^(\d+\.\s+|\-\s+|\*\s+)/.test(line)) {
      const items = [];
      const ordered = /^\d+\.\s+/.test(line);
      while (i < lines.length && /^(\d+\.\s+|\-\s+|\*\s+)/.test(lines[i])) {
        const raw = lines[i].replace(/^(\d+\.\s+|\-\s+|\*\s+)/, '');
        const nested = [];
        i += 1;
        while (i < lines.length && /^\s{2,}(\-\s+|\*\s+)/.test(lines[i])) {
          nested.push(lines[i].replace(/^\s{2,}(\-\s+|\*\s+)/, ''));
          i += 1;
        }
        items.push({ text: raw, nested });
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^#{1,4}\s/.test(lines[i]) && !/^\|.+\|$/.test(lines[i]) && !/^---\s*$/.test(lines[i]) && !/^(\d+\.\s+|\-\s+|\*\s+)/.test(lines[i]) && !lines[i].startsWith('```')) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', text: para.join('\n') });
  }

  return { blocks, chapters, sections };
}

function renderTable(rows, sections) {
  const bodyRows = rows.filter((row) => !/^\|[\s\-:|]+\|$/.test(row));
  if (!bodyRows.length) return '';

  const parsed = bodyRows.map((row) =>
    row
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim()),
  );

  const [head, ...rest] = parsed;
  const sectionByName = new Map(sections.map((sec) => [sec.label, sec]));

  const renderCell = (cell, colIndex) => {
    const sec = sectionByName.get(cell);
    if (colIndex === 1 && sec) {
      return `<a href="#${sec.id}" class="fn-link">${escapeHtml(cell)}</a>`;
    }
    return inlineMarkdown(cell);
  };

  const thead = `<thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rest
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td>${renderCell(cell, index)}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody>`;

  return `<table>${thead}${tbody}</table>`;
}

function renderList(list) {
  const tag = list.ordered ? 'ol' : 'ul';
  const items = list.items
    .map((item) => {
      const nested = item.nested.length
        ? `<ul>${item.nested.map((n) => `<li>${inlineMarkdown(n)}</li>`).join('')}</ul>`
        : '';
      return `<li>${inlineMarkdown(item.text)}${nested}</li>`;
    })
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

function renderBlocks(blocks, sections, hasChapter5) {
  const html = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.level === 1) {
        html.push(`<h1>${inlineMarkdown(block.title)}</h1>`);
        continue;
      }
      if (block.level === 2) {
        html.push(`<h2 id="${block.id}" class="chapter-heading">${inlineMarkdown(block.title)}</h2>`);
        continue;
      }
      if (block.level === 3) {
        if (block.id && hasChapter5) {
          html.push(`<p class="back-to-list"><a href="#chapter-5">← 返回功能清单</a></p>`);
        }
        const idAttr = block.id ? ` id="${block.id}"` : '';
        html.push(`<h3${idAttr} class="section-heading">${inlineMarkdown(block.title)}</h3>`);
        continue;
      }
      html.push(`<h4 class="subsection-heading">${inlineMarkdown(block.title)}</h4>`);
      continue;
    }

    if (block.type === 'p') {
      html.push(`<p>${inlineMarkdown(block.text)}</p>`);
      continue;
    }

    if (block.type === 'list') {
      html.push(renderList(block));
      continue;
    }

    if (block.type === 'table') {
      html.push(renderTable(block.rows, sections));
      continue;
    }

    if (block.type === 'hr') {
      html.push('<hr />');
      continue;
    }

    if (block.type === 'code') {
      if (block.lang === 'mermaid') {
        html.push(`<div class="mermaid">${escapeHtml(block.code)}</div>`);
      } else {
        html.push(`<pre><code>${escapeHtml(block.code)}</code></pre>`);
      }
    }
  }

  return html.join('\n');
}

function renderSidebar(chapters, sections) {
  const chapterList = chapters
    .map((chapter) => `<li><a href="#${chapter.id}" class="toc-chapter">${escapeHtml(chapter.title)}</a></li>`)
    .join('\n');

  const fnList = sections
    .map(
      (sec) =>
        `<li><a href="#${sec.id}" class="toc-fn"><span class="toc-fn-num">${sec.num}</span>${escapeHtml(sec.label)}</a></li>`,
    )
    .join('\n');

  const secList = sections
    .map((sec) => `<li><a href="#${sec.id}" class="toc-sec">${escapeHtml(sec.full)}</a></li>`)
    .join('\n');

  const groups = [
  `<div class="sidebar__group">
        <div class="sidebar__label">章节</div>
        <ul class="sidebar__list">${chapterList}</ul>
      </div>`,
  ];

  if (sections.length) {
    groups.push(`<div class="sidebar__group">
        <div class="sidebar__label">功能清单快链</div>
        <ul class="sidebar__list sidebar__list--fn">${fnList}</ul>
      </div>`);
    groups.push(`<div class="sidebar__group">
        <div class="sidebar__label">第 6 章小节</div>
        <ul class="sidebar__list sidebar__list--sec">${secList}</ul>
      </div>`);
  }

  return groups.join('\n');
}

const STYLES = `
    :root {
      --sidebar-w: 280px;
      --bg: #f5f7fa;
      --paper: #fff;
      --border: #e4e7ec;
      --text: #101828;
      --muted: #667085;
      --primary: #2563eb;
      --primary-soft: #eff4ff;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: 'Noto Sans SC', 'Noto Sans JP', sans-serif;
      font-size: 15px;
      line-height: 1.65;
      color: var(--text);
      background: var(--bg);
    }
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      width: var(--sidebar-w);
      height: 100vh;
      overflow: auto;
      padding: 20px 16px 32px;
      background: #0f172a;
      color: #e2e8f0;
      border-right: 1px solid #1e293b;
    }
    .sidebar__brand {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      margin-bottom: 20px;
      color: #fff;
    }
    .sidebar__group + .sidebar__group { margin-top: 18px; }
    .sidebar__label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .sidebar__list { list-style: none; margin: 0; padding: 0; }
    .sidebar__list li + li { margin-top: 4px; }
    .sidebar a {
      color: #cbd5e1;
      text-decoration: none;
      font-size: 13px;
      line-height: 1.45;
      display: block;
      padding: 6px 8px;
      border-radius: 6px;
    }
    .sidebar a:hover { background: #1e293b; color: #fff; }
    .toc-chapter { font-weight: 500; }
    .toc-fn-num {
      display: inline-block;
      min-width: 1.6em;
      color: #64748b;
      font-variant-numeric: tabular-nums;
    }
    .toc-sec { font-size: 12px; padding-left: 12px; }
    .main {
      margin-left: var(--sidebar-w);
      flex: 1;
      min-width: 0;
      padding: 28px 40px 80px;
    }
    .main__meta {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 16px;
    }
    .paper {
      max-width: 1080px;
      margin: 0 auto;
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 40px 48px 56px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06);
    }
    .paper > h1 {
      margin: 0 0 28px;
      font-size: 28px;
      line-height: 1.3;
      border-bottom: 2px solid var(--border);
      padding-bottom: 16px;
    }
    .chapter-heading {
      margin: 40px 0 20px;
      padding-top: 8px;
      font-size: 22px;
      border-top: 3px solid var(--primary);
    }
    .paper > h2:first-of-type,
    .chapter-heading:first-of-type { margin-top: 0; border-top: none; padding-top: 0; }
    .section-heading {
      margin: 28px 0 12px;
      font-size: 18px;
      color: #1d2939;
    }
    .subsection-heading {
      margin: 22px 0 10px;
      font-size: 15px;
      color: #344054;
    }
    .back-to-list {
      margin: 0 0 8px;
      font-size: 13px;
    }
    .back-to-list a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
    }
    .back-to-list a:hover { text-decoration: underline; }
    .paper p { margin: 0 0 12px; }
    .paper ul, .paper ol { margin: 0 0 14px; padding-left: 1.4em; }
    .paper li { margin: 4px 0; }
    .paper table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px;
      font-size: 14px;
    }
    .paper th, .paper td {
      border: 1px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .paper th { background: #f9fafb; font-weight: 600; }
    .paper a.fn-link { color: var(--primary); font-weight: 500; text-decoration: none; }
    .paper a.fn-link:hover { text-decoration: underline; }
    .change-added {
      color: #175cd3;
      background: #eff8ff;
      text-decoration: none;
      border-radius: 3px;
      padding: 0 2px;
    }
    .change-modified {
      color: #b54708;
      background: #fffaeb;
      border-radius: 3px;
      padding: 0 2px;
    }
    .change-deleted {
      color: #b42318;
      background: #fef3f2;
      text-decoration: line-through;
      border-radius: 3px;
      padding: 0 2px;
    }
    .paper code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
      background: #f2f4f7;
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    .paper pre {
      background: #0f172a;
      color: #e2e8f0;
      padding: 14px 16px;
      border-radius: 8px;
      overflow: auto;
      font-size: 13px;
      line-height: 1.5;
    }
    .paper pre code { background: none; padding: 0; color: inherit; }
    .mermaid {
      margin: 16px 0 24px;
      padding: 16px;
      background: #fafbfc;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: auto;
    }
    .paper hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 28px 0;
    }
    @media (max-width: 900px) {
      .sidebar { position: static; width: 100%; height: auto; }
      .main { margin-left: 0; padding: 16px; }
      .layout { flex-direction: column; }
    }
    @media print {
      .sidebar { display: none; }
      .main { margin-left: 0; padding: 0; }
      .paper { box-shadow: none; border: none; }
    }
`;

function buildHtml(md) {
  const { blocks, chapters, sections } = parseMarkdown(md);
  const hasChapter5 = chapters.some((chapter) => chapter.id === 'chapter-5');
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const content = renderBlocks(blocks, sections, hasChapter5);
  const sidebar = renderSidebar(chapters, sections);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NeosAI IDP — PRD 评审稿</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500&display=swap" rel="stylesheet" />
  <style>${STYLES}
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar__brand">PRD 评审稿</div>
      ${sidebar}
    </aside>
    <main class="main">
      <div class="main__meta">由 PRD.zh-CN.md 生成 · ${generatedAt}</div>
      <article class="paper">
${content}
      </article>
    </main>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      securityLevel: 'loose',
      flowchart: { htmlLabels: true, curve: 'basis' }
    });
  </script>
</body>
</html>
`;
}

const md = await readFile(MD_PATH, 'utf8');
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_PATH, buildHtml(md), 'utf8');
await copyFile(HEADERS_PATH, path.join(OUT_DIR, '_headers'));
console.log(`PRD site written to ${OUT_PATH}`);
