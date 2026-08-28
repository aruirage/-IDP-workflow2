import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outPath = '/Users/mac/Desktop/AIPM/Projects/NeosAI/IDP/業務シーン設定ーUATテスト.xlsx';

const rows = [
  [2, 'AI前処理', 'Agent', '批量执行图像校正、图像旋转、图像分割、图像排序的功能。', 'Step2でAI前処理ノードを追加し、画像回転・画像補正・画像整列をONにする。設定後に保存・設定チェック・公開まで行い、公開済み業務シーンでAI前処理が反映されることを確認する。'],
  [3, 'OCR抽出', 'Agent', '使用 LLM-OCR 技术自动判断票据类型，基于最合适的模板高精度提取所需的项目数据。', 'Step2でOCR抽出ノードを追加し、Step1で追加した帳票タイプごとにOCR抽出のON/OFFを設定する。保存後に設定チェック・公開を行い、公開済み業務シーンでONにした帳票のみOCR抽出対象になることを確認する。'],
  [4, '数据映射', 'Node', '按照标准数据映射规则，将案件中的多元异构字段映射为标准字段。', 'Step2でデータマッピングノードを追加し、「データマッピング設定」で定義した全局ルールを参照することを確認する。保存・設定チェック・公開後、OCR結果が標準フィールドへ変換されることを確認する。'],
  [5, 'AI检证', 'Agent', '基于案件数据、提取结果、外部对照结果以及业务规则执行 AI 检证。', 'Step2でAI検証ノードを追加し、「AI検証設定」で定義した6つの検証モジュール（必須フィールド、必要書類、テキスト検証、データ検証、標準データ整合性、署名・印鑑検証）を設定する。保存・設定チェック・公开後、公開済み業務シーンで設定した検証処理が反映されることを確認する。'],
  [6, '主数据匹配', 'Agent', '1. 调用系统内部的主数据数据库，对 OCR 提取的项目（医院代码、疾病名等）进行标准化转换。2. 支持多维度数据联合检索，提升匹配精度。', '主データ照合設定メニューで照合対象、検索キー、標準化ルールを設定できることを確認する。公開済み業務シーンの処理結果で、OCR抽出値が主データに照合され、標準値へ変換されることを確認する。'],
  [7, '人工确认', 'Node', '针对可能的低度值判断的案件，生成人工确认任务（HITL）。包括 OCR 结果确认、AI 检证确认、导出确认。', 'Step2で人工確認ノードを追加し、完成・補件・案件中止の分岐を設定する。OCR抽出後、AI検証後、出力前の人工確認タスクがそれぞれ正しく発生し、補件時に分岐先へ回流できることを確認する。'],
  [8, '消息通知', 'Node', '当单据不齐全、必填项缺失、触发人工确认规则时，自动触发站内信通知；消息内容、主题、接收人等可配置。', 'Step3で通知ルールを設定し、対象イベント、通知対象者、件名、内容を入力する。Step2/Step4で公開後、対象イベント発生時に通知が送信されることを確認する。'],
  [9, '条件判断', 'Node', '基于节点的执行结果、状态数据或业务规则，对工作流的条件分支、待机、回流等进行动态控制。', 'Step2で条件判断ノードを追加し、変数・演算子・値を設定する。OCR抽出後やAI検証後の分岐、人工確認への遷移、Else分岐が正しく設定できることを確認する。'],
  [10, '自定义函数', 'Node', '通过直接编写、执行原生 Python 代码，可自由灵活地实现自定义数据处理逻辑、外部 API 对接。', 'Step2でカスタム関数ノードを追加し、入力変数とJavaScriptを設定する。保存・設定チェック・公開後、ワークフロー内でカスタム処理が実行されることを確認する。'],
  [11, '工作流平台', '工作流平台', '1. 支持画布 UI、节点拖拽的交互方式管理案件工作流；2. 支持按照案件场景维度进行工作流管理；3. 上述节点的出入参支持灵活配置，可配置粒度到票据具体字段维度。', 'Step2で開始ノードと終了ノードを必ず配置し、AI前処理→OCR抽出→条件判断→人工確認→データマッピング→AI検証→条件判断→人工確認の既定経路を満たすように接続する。設定チェック成功後のみ公開できることを確認する。'],
  [13, '输出处理', '业务设置', '支持自定义数据模板和输出方式，可灵活导出案件处理结果和预处理后的文件。', 'Step4で出力対象帳票とフィールド、表示順を設定する。保存・公开後、設定した帳票・フィールド順で出力されることを確認する。'],
  [15, '案件场景设定', '业务设置', '定义案件场景，管理案件的主文件、关联附加规则、案件工作流。', 'Step1〜Step4を順に設定し、Step1の関連チェックとStep2の設定チェックを通過した後に公開できることを確認する。公開後、実案件処理で各設定が反映されることを確認する。'],
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('UATテスト用例');

sheet.showGridLines = false;
sheet.getRange('A1:E1').values = [[ '序号', '功能名称', '功能类型', '功能定义', '测试用例' ]];
sheet.getRange('A2:E16').values = rows;

sheet.getRange('A1:E16').format = {
  font: { name: 'Noto Sans JP', size: 10, color: '#111827' },
  wrapText: true,
  verticalAlignment: 'top',
};
sheet.getRange('A1:E1').format = {
  fill: '#DDEBF7',
  font: { name: 'Noto Sans JP', size: 10, bold: true, color: '#111827' },
  horizontalAlignment: 'center',
  verticalAlignment: 'middle',
  wrapText: true,
};
sheet.getRange('A1:E16').format.borders = { preset: 'all', style: 'thin', color: '#000000' };

sheet.getRange('A:A').format.columnWidthPx = 60;
sheet.getRange('B:B').format.columnWidthPx = 150;
sheet.getRange('C:C').format.columnWidthPx = 90;
sheet.getRange('D:D').format.columnWidthPx = 430;
sheet.getRange('E:E').format.columnWidthPx = 560;
sheet.getRange('A1:E16').format.rowHeightPx = 54;
sheet.getRange('D2:E16').format.rowHeightPx = 72;
sheet.freezePanes.freezeRows(1);

const preview = await workbook.render({ sheetName: 'UATテスト用例', autoCrop: 'all', scale: 1, format: 'png' });
await fs.writeFile('/tmp/uat-excel-preview.png', new Uint8Array(await preview.arrayBuffer()));

const out = await SpreadsheetFile.exportXlsx(workbook);
await out.save(outPath);
console.log(outPath);
