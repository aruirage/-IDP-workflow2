import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const sourcePath = "/Users/mac/Desktop/AIPM/Projects/NeosAI/IDP/業務シーン設定ーUATテスト.md";
const outputPath = "/Users/mac/Desktop/AIPM/Projects/NeosAI/IDP/業務シーン設定ーUATテスト.xlsx";

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim().replace(/<br\s*\/?>/gi, "\n"));
}

function isSeparatorRow(cells) {
  return cells && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));
}

function extractTables(lines) {
  const tables = [];
  let currentStep = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const stepMatch = line.match(/^###\s+(.+)$/);
    if (stepMatch) currentStep = stepMatch[1].trim();
    const row = splitMarkdownTableRow(line);
    if (!row) continue;
    const rows = [];
    while (i < lines.length) {
      const cells = splitMarkdownTableRow(lines[i]);
      if (!cells) break;
      if (!isSeparatorRow(cells)) rows.push(cells);
      i += 1;
    }
    tables.push({ step: currentStep, rows });
  }
  return tables;
}

function sectionBetween(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return "";
  const bodyStart = start + startHeading.length;
  const end = endHeading ? markdown.indexOf(endHeading, bodyStart) : -1;
  return markdown.slice(bodyStart, end >= 0 ? end : undefined).trim();
}

function applySheetBaseStyle(sheet, usedRangeA1) {
  sheet.showGridLines = false;
  const used = sheet.getRange(usedRangeA1);
  used.format = {
    font: { name: "Noto Sans JP", size: 10, color: "#111827" },
    wrapText: true,
    verticalAlignment: "top",
  };
}

function styleTable(sheet, startRow, startCol, rowCount, colCount) {
  const header = sheet.getRangeByIndexes(startRow, startCol, 1, colCount);
  header.format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF", size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "middle",
    wrapText: true,
  };
  const body = sheet.getRangeByIndexes(startRow + 1, startCol, Math.max(rowCount - 1, 1), colCount);
  body.format = {
    fill: "#FFFFFF",
    font: { color: "#111827", size: 10 },
    wrapText: true,
    verticalAlignment: "top",
  };
  sheet.getRangeByIndexes(startRow, startCol, rowCount, colCount).format.borders = {
    preset: "all",
    style: "thin",
    color: "#D1D5DB",
  };
}

function writeTitle(sheet, title, subtitle = "") {
  sheet.getRange("A1:F1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1").format = {
    fill: "#0F172A",
    font: { bold: true, color: "#FFFFFF", size: 15 },
    verticalAlignment: "middle",
  };
  sheet.getRange("A1").format.rowHeightPx = 34;
  if (subtitle) {
    sheet.getRange("A2:F2").merge();
    sheet.getRange("A2").values = [[subtitle]];
    sheet.getRange("A2").format = {
      fill: "#EAF2F8",
      font: { color: "#334155", size: 10 },
      wrapText: true,
      verticalAlignment: "top",
    };
    sheet.getRange("A2").format.rowHeightPx = 42;
  }
}

function normalizeRows(rows, width) {
  return rows.map((row) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push("");
    return next;
  });
}

const markdown = await fs.readFile(sourcePath, "utf8");
const lines = markdown.split(/\r?\n/);
const tables = extractTables(lines);

const workbook = Workbook.create();

const premiseText = sectionBetween(markdown, "## 1. 共通前提", "## 2. 設定画面編")
  .split(/\n{2,}/)
  .map((line) => line.replace(/\n/g, " ").trim())
  .filter(Boolean);
const premise = workbook.worksheets.add("共通前提");
writeTitle(premise, "業務シーン設定 UAT テストケース", "共通前提");
premise.getRange("A4:B4").values = [["No.", "前提内容"]];
const premiseRows = premiseText.map((text, idx) => [idx + 1, text]);
premise.getRangeByIndexes(4, 0, premiseRows.length, 2).values = premiseRows;
styleTable(premise, 3, 0, premiseRows.length + 1, 2);
premise.getRange("A:A").format.columnWidthPx = 56;
premise.getRange("B:B").format.columnWidthPx = 760;
premise.getRange(`A5:B${4 + premiseRows.length}`).format.rowHeightPx = 52;
premise.freezePanes.freezeRows(4);
applySheetBaseStyle(premise, `A1:B${4 + premiseRows.length}`);

const setting = workbook.worksheets.add("設定画面編");
writeTitle(setting, "設定画面編", "案件シーン設定から Step1〜Step4 の順に、設定・保存・チェック・公開まで確認する。");
let cursor = 4;
for (const table of tables.slice(0, -1)) {
  if (!table.step || !table.rows.length) continue;
  setting.getRangeByIndexes(cursor - 1, 0, 1, 6).merge();
  setting.getRangeByIndexes(cursor - 1, 0, 1, 1).values = [[table.step]];
  setting.getRangeByIndexes(cursor - 1, 0, 1, 6).format = {
    fill: "#DBEAFE",
    font: { bold: true, color: "#1E3A8A", size: 11 },
  };
  const width = Math.max(...table.rows.map((r) => r.length));
  const rows = normalizeRows(table.rows, width);
  setting.getRangeByIndexes(cursor, 0, rows.length, width).values = rows;
  styleTable(setting, cursor, 0, rows.length, width);
  cursor += rows.length + 2;
}
setting.freezePanes.freezeRows(3);
setting.getRange("A:A").format.columnWidthPx = 48;
setting.getRange("B:B").format.columnWidthPx = 170;
setting.getRange("C:C").format.columnWidthPx = 245;
setting.getRange("D:D").format.columnWidthPx = 245;
setting.getRange("E:E").format.columnWidthPx = 390;
setting.getRange("F:F").format.columnWidthPx = 340;
setting.getRange(`A1:F${cursor}`).format.rowHeightPx = 66;
setting.getRange("A1:F3").format.rowHeightPx = 34;
applySheetBaseStyle(setting, `A1:F${cursor}`);

const runtime = workbook.worksheets.add("実処理編");
writeTitle(runtime, "実処理編", "公開済み業務シーンを使って、実案件処理が設定通りに動作することを確認する。");
const runtimeTable = tables[tables.length - 1];
const runtimeWidth = Math.max(...runtimeTable.rows.map((r) => r.length));
const runtimeRows = normalizeRows(runtimeTable.rows, runtimeWidth);
runtime.getRangeByIndexes(3, 0, runtimeRows.length, runtimeWidth).values = runtimeRows;
styleTable(runtime, 3, 0, runtimeRows.length, runtimeWidth);
runtime.freezePanes.freezeRows(4);
runtime.getRange("A:A").format.columnWidthPx = 48;
runtime.getRange("B:B").format.columnWidthPx = 230;
runtime.getRange("C:C").format.columnWidthPx = 170;
runtime.getRange("D:D").format.columnWidthPx = 170;
runtime.getRange("E:E").format.columnWidthPx = 410;
runtime.getRange("F:F").format.columnWidthPx = 360;
runtime.getRange(`A1:F${runtimeRows.length + 4}`).format.rowHeightPx = 64;
runtime.getRange("A1:F3").format.rowHeightPx = 34;
applySheetBaseStyle(runtime, `A1:F${runtimeRows.length + 4}`);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of ["共通前提", "設定画面編", "実処理編"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(
    path.join("/tmp", `uat-${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
