const NODES = [
  { id: 'scene', label: 'シーン', tier: 'a' },
  { id: 'input', label: '入力', tier: 'c' },
  { id: 'image', label: '前処理', tier: 'c' },
  { id: 'ocr', label: 'OCR抽出', tier: 'c' },
  { id: 'master', label: 'Master', tier: 'a' },
  { id: 'verify', label: 'AI検証', tier: 'a' },
  { id: 'hitl', label: 'HITL', tier: 'b' },
  { id: 'output', label: '出力', tier: 'a' },
];

const SCENES = [
  { id: '2064639102406844416', name: '保険金請求（理赔）' },
  { id: '2064639102406844417', name: '新契約申込（新保申请）' },
  { id: '2064639102406844418', name: '保全変更（保全变更）' },
];

const MAX_DOCS = 30;

function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

const CASE_MATCHING_PRIORITY_OPTIONS = [
  { value: 'primary_first', label: '主キー優先' },
  { value: 'secondary_first', label: '副キー優先' },
  { value: 'strict', label: '全キー一致' },
];
const CASE_MASTERLESS_OPTIONS = [
  { value: 'new_case', label: '新規案件を作成' },
  { value: 'hold', label: '保留プールへ' },
  { value: 'reject', label: '受付拒否' },
];
const CASE_SUPPLEMENT_OPTIONS = [
  { value: 'link_existing', label: '既存案件に紐付け' },
  { value: 'new_supplement', label: '補件案件として新規' },
];

/** 業務シーン：マッチング関連の固定既定値 */
const SCENE_MATCHING_DEFAULTS = {
  masterlessPolicy: 'hold',
  supplementPolicy: 'link_existing',
};

const WORKFLOW_DEFAULTS = {
  input: {
    channels: ['画面上アップロード'],
    apiEndpoint: '',
    allowedFormats: ['PDF', 'PNG', 'JPG', 'TIFF'],
    maxFileSizeMb: 20,
  },
  image: {
    rotate: true,
    rotateDocTypes: [],
    perspective: true,
    perspectiveDocTypes: [],
    sort: true,
    sortDocTypes: [],
    io: cloneJson(NODE_IO_DEFAULTS.preprocess),
  },
  hitl: {
    role: 'operator',
    useSpecificRoles: false,
    imageRole: 'operator',
    ocrRole: 'operator',
    masterRole: 'operator',
    verifyRole: 'operation_admin',
    exportRole: 'operator',
  },
  ocrExtract: {
    enabledTypes: [],
    mergeByType: {},
    mergeSameType: false,
    confidenceThreshold: 85,
    llmOcrEnabled: true,
  },
  fraudDetect: {
    enabledTypes: [],
  },
};

/** @deprecated 旧 UI 互換 */
const FRAUD_DETECT_METHOD_OPTIONS = [
  { value: 'image_tamper', label: '画像改ざん検知', desc: 'PS痕跡・再圧縮・異常エッジを検出' },
];

function normalizeFraudDetectConfig(fraudDetect, allowedTypes = []) {
  const raw = fraudDetect || {};
  const allowed = Array.isArray(allowedTypes)
    ? allowedTypes.map((item) => (typeof item === 'string' ? item : item?.type)).filter(Boolean)
    : [];
  let enabledTypes = Array.isArray(raw.enabledTypes) ? raw.enabledTypes.filter(Boolean) : [];

  if (!enabledTypes.length) {
    const legacyUnion = new Set();
    [
      ['psTamper', 'psTamperDocTypes'],
      ['aiGenerated', 'aiGeneratedDocTypes'],
      ['templateFeature', 'templateFeatureDocTypes'],
    ].forEach(([switchKey, docTypesKey]) => {
      if (raw[switchKey] === true) {
        const types = Array.isArray(raw[docTypesKey]) && raw[docTypesKey].length
          ? raw[docTypesKey]
          : allowed;
        types.forEach((type) => legacyUnion.add(type));
      }
    });
    const legacyCategories = Array.isArray(raw.detectCategories) ? raw.detectCategories : [];
    if (legacyCategories.length && !legacyUnion.size) {
      allowed.forEach((type) => legacyUnion.add(type));
    }
    const legacyDocTypes = Array.isArray(raw.targetDocTypes) ? raw.targetDocTypes.filter(Boolean) : [];
    if (legacyDocTypes.length && !legacyUnion.size) {
      legacyDocTypes.forEach((type) => legacyUnion.add(type));
    }
    enabledTypes = [...legacyUnion];
  }

  return {
    enabledTypes: filterImageDocTypes(enabledTypes, allowed),
  };
}

const INPUT_CHANNELS = [
  { id: '画面上アップロード', label: '画面上アップロード', desc: '管理画面からファイル・フォルダを直接アップロード' },
  {
    id: 'APIアップロード', label: 'APIアップロード', desc: '外部システムから API で案件・書類を受付',
    configKey: 'apiEndpoint', configLabel: 'API エンドポイント', configPlaceholder: 'https://api.example.com/v1/intake',
  },
];

const OUTPUT_NAMING_DEFAULTS = {
  prefixMode: 'doc_type',
  prefixCustom: '',
  serialDigits: 6,
  includeDate: true,
  dateFormat: 'yyyyMMdd',
  separator: '_',
  caseFilePattern: '{帳票タイプ}_{連番6桁}_{yyyyMMdd}',
  docFilePattern: '{帳票タイプ}_{連番6桁}_{yyyyMMdd}',
  usePerDocFilePattern: true,
  apiObjectKey: '{案件番号}/{帳票タイプ}/{yyyyMMdd}',
  apiPayloadName: '{帳票タイプ}_{連番6桁}_{yyyyMMdd}',
  excelSheetPattern: '{帳票タイプ}',
};

const OUTPUT_NAMING_PREFIX_MODES = [
  { value: 'doc_type', label: '帳票タイプ（固定）' },
  { value: 'custom', label: '固定文字列' },
];

const OUTPUT_NAMING_SERIAL_DIGIT_OPTIONS = [4, 5, 6, 8];

const OUTPUT_EXPORT_VALUE_SOURCES = [
  { value: 'ocr', label: 'OCR原値' },
  { value: 'standard', label: '標準フィールド' },
  { value: 'master_return', label: 'マスタ返却列' },
];

const OUTPUT_TARGET_DEFAULT = '基幹システム';
const OUTPUT_TIMING_LABEL = '案件 Workflow 完了後';
const OUTPUT_DELIVERY_OPTIONS = [
  { value: 'api', label: 'API', desc: '基幹システムが能動的に照会（ポーリング）' },
  { value: 'shared_folder', label: '共有フォルダ', desc: 'リモート共有フォルダへ配置' },
];
const OUTPUT_VERIFY_REPORT_FIELDS = [
  { id: 'verifyResult', label: '検証結果' },
  { id: 'missingDocsList', label: '不足書類一覧' },
  { id: 'missingFieldsList', label: '不足項目一覧' },
  { id: 'textViolationCount', label: 'テキスト違反件数' },
  { id: 'dataViolationCount', label: 'データ違反件数' },
  { id: 'sealViolationCount', label: '署名押印違反件数' },
];

const OUTPUT_NAMING_TOKENS = [
  { token: '{案件ID}', label: '案件ID', example: 'CASE-2026-001234' },
  { token: '{案件番号}', label: '案件番号', example: 'A20260617001' },
  { token: '{証券番号}', label: '証券番号', example: 'POL-88991234' },
  { token: '{業務シーン}', label: '業務シーン名', example: '医療保険通院給付' },
  { token: '{帳票タイプ}', label: '帳票タイプ', example: '診断書' },
  { token: '{連番6桁}', label: '連番（6桁）', example: '000001' },
  { token: '{yyyyMMdd}', label: '処理日', example: '20260617' },
  { token: '{HHmmss}', label: '処理時刻', example: '143025' },
  { token: '{タイムスタンプ}', label: '日時連結', example: '20260617_143025' },
];

const END_NAMING_TOKENS = [
  ...OUTPUT_NAMING_TOKENS,
  { token: '{処理結果}', label: '処理結果', example: 'PASS' },
  { token: '{給付種別}', label: '給付種別', example: '通院給付' },
  { token: '{請求種別}', label: '請求種別', example: '保険金請求' },
];

const OUTPUT_DEFAULTS = {
  conflictResolution: '最新値を優先',
  format: 'API',
  fileFormat: 'CSV',
  deliveryMethod: 'api',
  outputTarget: OUTPUT_TARGET_DEFAULT,
  encoding: 'UTF-8',
  sheetExportMode: '帳票別Sheetで出力',
  fileNamePattern: '{帳票タイプ}_{連番6桁}_{yyyyMMdd}',
  naming: cloneJson(OUTPUT_NAMING_DEFAULTS),
  maskingLevel: '部分マスキング',
  apiExportEnabled: true,
  apiExportEndpoint: 'https://core.example.com/api/v1/idp/export',
  sharedFolderPath: '\\\\fileserver\\idp\\export',
  includeVerifyReport: true,
  exportReviewRequired: false,
  exportReviewRole: 'case_owner',
  templateLocked: true,
  exportStandardFieldIds: [],
  exportStandardFieldIdsInitialized: false,
  exportStandardFieldOrderByDoc: {},
  exportFieldModeByDoc: {},
  masterMatchExports: [],
  masterFields: [],
};

const SCENE_AGGREGATE_DEFAULTS = {
  mainDocTypes: [],
  aggregateDocType: '',
  primaryKey: '',
  secondaryKeys: [],
};

const OUTPUT_CONFLICT_RESOLUTIONS = ['最新値を優先', '先入力を優先', '空欄のみ補完'];
const OUTPUT_MASKING_LEVELS = ['なし', '部分マスキング', '全面マスキング'];
const OUTPUT_FORMATS = ['CSV', 'JSON', 'EXCEL'];
const OUTPUT_ENCODINGS = ['UTF-8', 'Shift_JIS'];
const OUTPUT_SHEET_EXPORT_MODE_OPTIONS = [
  { value: '帳票別Sheetで出力', label: '1ファイルにまとめる' },
  { value: '帳票別ファイルで出力', label: '帳票タイプごとに別ファイル' },
];

/** 旧設定値の互換マップ */
const OUTPUT_SHEET_EXPORT_MODE_LEGACY = {
  '単一Sheetで出力': '帳票別Sheetで出力',
  '書類別Sheetで出力': '帳票別Sheetで出力',
  '帳票別Sheet + 帳票別ファイルで出力': '帳票別ファイルで出力',
};

function normalizeSheetExportMode(mode) {
  return OUTPUT_SHEET_EXPORT_MODE_LEGACY[mode] || mode;
}
const HITL_ROLE_OPTIONS = [
  { value: 'case_owner', label: '担当者', hint: '案件に割り当てられた担当者へタスクを割り当て' },
  { value: 'operator', label: '操作員', hint: '通常の確認・修正作業を担当' },
  { value: 'operation_admin', label: '操作管理者', hint: '運用管理・例外確認を担当' },
];
const HITL_GATE_ROLE_OPTIONS = HITL_ROLE_OPTIONS.filter((item) => item.value !== 'case_owner');

const DOC_TYPE_REGISTRY = [
  { id: '保険請求書', category: 'claim', icon: '請', fields: ['証券番号', '被保険者氏名', '請求日（記入日）', '受取人（請求者）フリガナ', '受取人（請求者）氏名', '携帯電話番号', '登録住所', '送付先指定欄', '親権者または後見人 氏名', '親権者または後見人 フリガナ', '口座名義人 フリガナ', '口座名義人 氏名', '金融機関名', '支店名', '預金種目', '口座番号', '通帳記号（5ケタ）', '通帳番号（8ケタ以下）', '請求番号'] },
  { id: '診断書', category: 'medical', icon: '診', fields: ['患者氏名', '被保険者氏名', '性別', 'カルテ番号', '生年月日', '傷病名', 'ICD10コード', '発病又は受傷年月日', '主たる手術等', '入院年月日', '退院年月日', '手術年月日', '診断名', '通院日数', '発行日', '医療機関名', '診療科', '医師名'] },
  { id: '診療明細書', category: 'receipt', icon: '明', fields: ['患者番号', '患者氏名', '診療科', '発行日', '明細管理番号', '収納管理番号', '保険', '区分', '入院科等', '医療機関名'] },
  { id: '調剤明細書', category: 'receipt', icon: '調', fields: ['発行日', '患者番号', '患者氏名', '診療科', '保険種別', '本人・家族', '外来・入院', '担当者名', '保険証記号番号', '今回請求額', '前回残額', '合計請求額', '領収金額', '医療機関名', '医療機関住所', '医療機関電話番号', '医療機関番号', '薬局名'] },
  { id: '抗がん剤・ホルモン剤治療給付金請求書', category: 'claim', icon: '抗', fields: ['証券番号', '被保険者（治療した方）', '請求日（記入日）', '受取人（請求者）氏名', '抗がん剤・ホルモン剤治療を行った傷病名', '次回以降ご請求方法', '請求番号'] },
  { id: '事故状況報告書', category: 'report', icon: '事', fields: ['被保険者名', '記入日', '受傷日', '受傷場所', '受傷状況', '飲酒', '労災保険の適用', '警察への届出', '事故時の状況', '請求番号'] },
  { id: '法定相続人代表者選任書', category: 'inheritance', icon: '相', fields: ['証券番号', '被保険者', '記入日', '法定相続人代表者 住所', '法定相続人代表者 氏名', '法定相続人代表者 生年月日', '法定相続人代表者 印鑑', '請求番号'] },
  { id: '代理署名・押印念書', category: 'authorization', icon: '代', fields: ['証券番号', '給付金等受取人', '記入日（西暦）', 'フリガナ（姓）', 'フリガナ（名）', '氏名（自署・姓）', '氏名（自署・名）', '代理者 新郵便番号', '代理者 都道府県', '代理者 市区町村', '代理者 町名・番地', '日中連絡先', '理由', '請求番号'] },
  { id: '印鑑登録証明書', category: 'certificate', icon: '印', fields: ['登録印影', '氏名', '旧氏', '生年月日', '住所', '証明年月日', '証明発行者', '証明文'] },
  { id: '住民票', category: 'certificate', icon: '住', fields: ['件名', '作成', '世帯主', '個人番号', '住民コード', '氏名', '旧氏の氏名及び仮名', '生年月日', '性別', '続柄', '転入前住所', '住民異動の種類', '転入年月日', '住民となった日', '届出日', '本人確認'] },
  { id: '領収書', category: 'receipt', icon: '領', fields: ['患者氏名', '患者番号', '領収日', '診療期間', '領収金額', '医療機関名'] },
  { id: '入院証明書', category: 'medical', icon: '入', fields: ['患者氏名', '生年月日', '入院年月日', '退院年月日', '傷病名', '医療機関名', '医師名'] },
  { id: '手術証明書', category: 'medical', icon: '手', fields: ['患者氏名', '生年月日', '手術年月日', '手術名', '医療機関名', '医師名'] },
  { id: '通院証明書', category: 'medical', icon: '通', fields: ['患者氏名', '生年月日', '通院期間', '通院日数', '傷病名', '医療機関名'] },
  { id: '死亡診断書', category: 'medical', icon: '死', fields: ['氏名', '生年月日', '死亡年月日時分', '死亡場所', '死因', '医療機関名', '医師名'] },
  { id: '戸籍謄本', category: 'certificate', icon: '戸', fields: ['本籍', '筆頭者氏名', '氏名', '生年月日', '続柄', '発行年月日'] },
  { id: '本人確認書類', category: 'certificate', icon: '本', fields: ['氏名', '生年月日', '住所', '有効期限', '書類番号'] },
  { id: '委任状', category: 'authorization', icon: '委', fields: ['委任者氏名', '受任者氏名', '委任内容', '作成年月日', '住所'] },
  { id: '同意書', category: 'authorization', icon: '同', fields: ['同意者氏名', '対象者氏名', '同意内容', '同意年月日'] },
  { id: '休業証明書', category: 'report', icon: '休', fields: ['氏名', '勤務先名', '休業期間', '休業理由', '証明年月日'] },
  { id: '人間ドック', category: 'medical', icon: '健', fields: ['受診者氏名', '生年月日', '性別', '受診日', '身長', '体重', 'BMI', '腹囲', '総合判定', '医療機関名'] },
];

const INITIAL_SCENE_DOCUMENT_TYPES = [
  '保険請求書',
  '診断書',
  '診療明細書',
  '調剤明細書',
  '抗がん剤・ホルモン剤治療給付金請求書',
  '事故状況報告書',
  '法定相続人代表者選任書',
  '代理署名・押印念書',
  '印鑑登録証明書',
  '住民票',
  '人間ドック',
];

const EXTRACT_FIELDS = DOC_TYPE_REGISTRY.map(({ id, fields }) => ({ type: id, fields }));

const DOC_TYPE_MAP = Object.fromEntries(DOC_TYPE_REGISTRY.map((d) => [d.id, d]));

/** 手動エクスポート画面と同一のフィールド名（帳票タイプ設定から連携） */
const DOC_FIELD_SCHEMA = {
  ...Object.fromEntries(DOC_TYPE_REGISTRY.map(({ id, fields }) => [id, { fields, tables: {} }])),
  人間ドック: {
    fields: ['受診者氏名', '生年月日', '性別', '受診日', '身長', '体重', 'BMI', '腹囲', '総合判定', '医療機関名'],
    tables: {
      '検査項目': ['項目名', '結果', '単位', '基準値', '判定'],
      '血液検査': ['項目名', '結果', '単位', '判定'],
      '尿検査': ['項目名', '結果', '判定'],
    },
  },
  診療明細書: { fields: DOC_TYPE_MAP['診療明細書'].fields, tables: { 診療明細: ['区分'] } },
  調剤明細書: { fields: DOC_TYPE_MAP['調剤明細書'].fields, tables: { 診療明細: ['項目'] } },
};

/** 出力設定では一旦非表示にするテーブル（後日対応） */
const OUTPUT_DEFERRED_TABLES = new Set(['明細テーブル']);

function getDocExportLabel(docType) {
  return DOC_FIELD_SCHEMA[docType]?.exportLabel || docType;
}

/** 旧開発用帳票 ID → 現行 ID */
const LEGACY_DOC_TYPE_IDS = {
  保険金請求書: '保険請求書',
  '保険金・給付金請求書': '保険請求書',
  請求書_多表格: '保険請求書',
  請求書: '保険請求書',
  '領収書・診療明細書': '診療明細書',
};

function migrateDocTypeId(type) {
  return LEGACY_DOC_TYPE_IDS[type] || type;
}

/** 画面表示用の帳票名（内部 ID ではなく日本語ラベル） */
function getDocDisplayLabel(docType) {
  const id = migrateDocTypeId(docType);
  return getDocExportLabel(id);
}

/** ルール文などに含まれる内部帳票 ID を表示名に置換 */
function replaceDocTypeIdsInText(text) {
  if (!text) return text;
  let result = String(text);
  const ids = [
    ...DOC_TYPE_REGISTRY.map((d) => d.id),
    ...Object.keys(DOC_FIELD_SCHEMA),
    '請求書_多表格',
  ];
  [...new Set(ids)].sort((a, b) => b.length - a.length).forEach((id) => {
    const label = getDocDisplayLabel(id);
    if (label && label !== id) result = result.split(id).join(label);
  });
  return result;
}

const MASTER_MATCH_EXPORT_FIELD_SAMPLES = [
  { id: 'export-master-field:icd10', label: 'ICD-10コード', sample: 'K35.80' },
  { id: 'export-master-field:std_disease', label: '標準傷病名', sample: '急性虫垂炎' },
  { id: 'export-master-field:inst_code', label: '機関コード', sample: '1310123456' },
  { id: 'export-master-field:std_inst', label: '標準医療機関名', sample: '慶應大学病院' },
];

const EXPORT_FIELD_SAMPLE_VALUES = {
  証券番号: '02468135-008-002',
  ご契約者氏名: '高橋 誠',
  'ご契約者氏名（カナ）': 'タカハシマコト',
  被保険者氏名: '高橋 真由美',
  患者氏名: '高橋 真由美',
  被保険者生年月日: '1992-07-18',
  患者生年月日: '1992-07-18',
  請求区分: '入院給付金',
  給付金種類: '入院給付金',
  入院日: '2025-09-08',
  退院日: '2025-09-14',
  入院日数: '7',
  請求金額: '420,000',
  振込先金融機関名: 'みずほ銀行',
  合計金額: '128,400',
  医療機関名: '慶應大学病院',
  傷病名: '急性虫垂炎',
  診断名: '急性虫垂炎',
  発行日: '2025-09-15',
  金額: '128,400',
  診療日: '2025-09-12',
  氏名: '高橋 真由美',
  明細合計: '128,400',
  項目名: '入院基本料',
  数量: '1',
  単価: '42,000',
};

function getExportFieldSampleValue(docType, fieldLabel) {
  const name = String(fieldLabel || '').split('.').pop();
  return EXPORT_FIELD_SAMPLE_VALUES[name]
    || EXPORT_FIELD_SAMPLE_VALUES[fieldLabel]
    || `${getDocExportLabel(docType)} 抽出値`;
}

function getMasterMatchOutputFieldSample(outputFieldLabel) {
  const label = String(outputFieldLabel || '').trim();
  if (!label) return '—';
  const matched = MASTER_MATCH_EXPORT_FIELD_SAMPLES.find((item) => item.label === label);
  return matched?.sample || `${label}（照合値）`;
}

function formatExportMatchValue(outputFields) {
  const fields = Array.isArray(outputFields) ? outputFields.filter(Boolean) : [];
  if (!fields.length) return '—';
  return fields.map((field) => getMasterMatchOutputFieldSample(field)).join(' / ');
}

function findMasterMatchRuleForExport(ctx, matchRules) {
  const { docType, standardFieldId, fieldName, sourceFieldIds } = ctx || {};
  const rules = matchRules || [];

  if (standardFieldId) {
    const direct = rules.find((rule) => rule.inputKind === 'standard' && rule.standardFieldId === standardFieldId);
    if (direct) return direct;
  }

  if (fieldName && docType) {
    const targetDoc = migrateDocTypeId(docType);
    const ocr = rules.find((rule) => {
      if (rule.inputKind === 'standard') return false;
      return migrateDocTypeId(rule.docType || '') === targetDoc && rule.field === fieldName;
    });
    if (ocr) return ocr;
  }

  for (const sourceId of (sourceFieldIds || [])) {
    const text = String(sourceId || '');
    const dot = text.indexOf('.');
    if (dot < 0) continue;
    const srcDoc = migrateDocTypeId(text.slice(0, dot));
    const srcField = text.slice(dot + 1);
    const linked = rules.find((rule) => {
      if (rule.inputKind === 'standard') return false;
      return migrateDocTypeId(rule.docType || '') === srcDoc && rule.field === srcField;
    });
    if (linked) return linked;
  }

  return null;
}

function getExportExtractValueFromMappingRule(rule, docType) {
  const sources = (rule?.sourceFieldIds || []).filter(Boolean);
  if (!sources.length) return '—';
  const docKey = docType || '';
  const forDoc = sources.find((sourceId) => {
    const text = String(sourceId || '');
    return text.startsWith(`${docKey}.`) || text.includes(`${docKey}・`);
  });
  const sourceId = forDoc || sources.find((item) => item.includes('.')) || sources[0];
  const dot = String(sourceId).indexOf('.');
  if (dot < 0) return getExportFieldSampleValue(docKey, sourceId);
  return getExportFieldSampleValue(sourceId.slice(0, dot), sourceId.slice(dot + 1));
}

function resolveExportMatchValue(ctx, matchRules) {
  const rule = findMasterMatchRuleForExport(ctx, matchRules);
  if (!rule) return '—';
  const outputFields = Array.isArray(rule.outputFields) && rule.outputFields.length
    ? rule.outputFields
    : resolveMasterRuleOutputFields(rule);
  return formatExportMatchValue(outputFields);
}

function buildMasterMatchPreviewNodes() {
  return MASTER_MATCH_EXPORT_FIELD_SAMPLES.map((item) => ({
    id: item.id,
    kind: 'master_field',
    scope: 'master_match',
    label: item.label,
  }));
}

/** 出力設定：左ナビ用（OCR 抽出 → 帳票タイプ / 標準フィールド） */
function buildExportPreviewTree(docFields) {
  const docs = docFields || [];
  return {
    id: 'export-root',
    kind: 'root',
    label: 'エクスポート対象',
    children: [
      {
        id: 'export-folder:ocr',
        kind: 'folder',
        label: 'OCR抽出',
        outputMode: 'ocr',
        children: docs.map((doc) => ({
          id: `export-ocr-doc:${doc.docType}`,
          kind: 'doctype',
          scope: 'doctype',
          outputMode: 'ocr',
          docType: doc.docType,
          label: getDocExportLabel(doc.docType),
        })),
      },
      {
        id: 'export-folder:standard',
        kind: 'folder',
        label: '標準フィールド',
        outputMode: 'standard',
        children: [],
      },
    ],
  };
}

function buildExportOcrFieldRows(docType, docFieldsEntry, matchRules = []) {
  const schema = getDocSchema(docType);
  const schemaFields = schema.fields || [];
  const schemaTables = schema.tables || {};
  const schemaTableNames = Object.keys(schemaTables).filter((name) => !OUTPUT_DEFERRED_TABLES.has(name));
  if (!schemaFields.length && !schemaTableNames.length) return [];
  const existing = docFieldsEntry?.fields || [];
  const existingMap = Object.fromEntries(existing.map((field) => [field.name, field]));
  const existingTableMap = Object.fromEntries((docFieldsEntry?.tables || []).map((table) => [table.name, table]));
  const rowsByOrderKey = {};

  schemaFields.forEach((name) => {
    const ctx = { docType, fieldName: name };
    rowsByOrderKey[`field:${name}`] = {
      key: `ocr:${docType}:${name}`,
      orderKey: `field:${name}`,
      kind: 'field',
      fieldName: name,
      label: name,
      checked: existingMap[name]?.checked !== false,
      extractValue: getExportFieldSampleValue(docType, name),
      matchValue: resolveExportMatchValue(ctx, matchRules),
    };
  });

  schemaTableNames.forEach((tableName) => {
    const schemaColumns = schemaTables[tableName] || [];
    const existingTable = existingTableMap[tableName];
    const existingColumnMap = Object.fromEntries((existingTable?.columns || []).map((column) => [column.name, column]));
    schemaColumns.forEach((columnName) => {
      const ctx = { docType, fieldName: columnName };
      rowsByOrderKey[`column:${tableName}:${columnName}`] = {
        key: `ocr:${docType}:${tableName}:${columnName}`,
        orderKey: `column:${tableName}:${columnName}`,
        kind: 'column',
        tableName,
        columnName,
        fieldName: columnName,
        label: formatTableColumnLabel(tableName, columnName),
        checked: existingColumnMap[columnName]?.checked ?? existingTable?.checked ?? true,
        extractValue: getExportFieldSampleValue(docType, columnName),
        matchValue: resolveExportMatchValue(ctx, matchRules),
      };
    });
  });

  const defaultOrder = [
    ...schemaFields.map((name) => `field:${name}`),
    ...schemaTableNames.flatMap((tableName) =>
      (schemaTables[tableName] || []).map((columnName) => `column:${tableName}:${columnName}`)),
  ];
  const savedOrder = docFieldsEntry?.itemOrder?.length ? docFieldsEntry.itemOrder : defaultOrder;
  const orderedKeys = [
    ...savedOrder.filter((key) => rowsByOrderKey[key]),
    ...defaultOrder.filter((key) => !savedOrder.includes(key)),
  ];
  return orderedKeys.map((key) => rowsByOrderKey[key]).filter(Boolean);
}

/** プレビュー用：Workflow 完了時に自動出力される対象一覧 */
function buildExportAutoTargetLabels(docFields, includeVerifyReport = true) {
  const docs = docFields || [];
  const labels = [
    '検証済み OCR 抽出結果',
    ...docs.map((doc) => getDocExportLabel(doc.docType)),
    'マスタ照合結果',
    '前処理後案件ファイル',
  ];
  if (includeVerifyReport) labels.push('検証結果レポート');
  return labels;
}

function buildStructuredNamingPattern(naming) {
  const cfg = { ...cloneJson(OUTPUT_NAMING_DEFAULTS), ...(naming || {}) };
  const sep = cfg.separator || '_';
  const parts = [];
  if (cfg.prefixMode === 'custom' && cfg.prefixCustom) {
    parts.push(cfg.prefixCustom);
  } else {
    parts.push('{帳票タイプ}');
  }
  const digits = Math.min(8, Math.max(4, Number(cfg.serialDigits) || 6));
  parts.push(`{連番${digits}桁}`);
  if (cfg.includeDate !== false) {
    parts.push(`{${cfg.dateFormat || 'yyyyMMdd'}}`);
  }
  return parts.join(sep);
}

function syncOutputNamingPatterns(naming) {
  const next = { ...cloneJson(OUTPUT_NAMING_DEFAULTS), ...(naming || {}) };
  const pattern = buildStructuredNamingPattern(next);
  next.docFilePattern = pattern;
  next.caseFilePattern = pattern;
  next.apiPayloadName = pattern;
  next.serialDigits = Math.min(8, Math.max(4, Number(next.serialDigits) || 6));
  next.prefixMode = next.prefixMode === 'custom' ? 'custom' : 'doc_type';
  next.includeDate = next.includeDate !== false;
  next.dateFormat = next.dateFormat || 'yyyyMMdd';
  next.separator = next.separator || '_';
  return next;
}

function formatMasterMatchOutputFieldsSummary(outputFields) {
  const fields = Array.isArray(outputFields) ? outputFields.filter(Boolean) : [];
  if (!fields.length) return '返却列未設定';
  return fields.join(' / ');
}

function buildMasterMatchExportRows(rules, exportConfigs = []) {
  const cfgMap = Object.fromEntries((exportConfigs || []).map((item) => [item.ruleId, item]));
  return (rules || []).map((rule) => {
    const cfg = cfgMap[rule.id] || {};
    const ruleOutputFields = Array.isArray(rule.outputFields) ? [...rule.outputFields] : [];
    return {
      ruleId: rule.id,
      name: rule.name || '照合ルール',
      inputSummary: summarizeMasterMatchRuleInput(rule),
      masterRefSummary: summarizeMasterMatchRuleMasterRef(rule),
      enabled: cfg.enabled !== false,
      valueSource: OUTPUT_EXPORT_VALUE_SOURCES.some((opt) => opt.value === cfg.valueSource)
        ? cfg.valueSource
        : 'master_return',
      ruleOutputFields,
      outputFieldsSummary: formatMasterMatchOutputFieldsSummary(ruleOutputFields),
    };
  });
}

function summarizeMasterMatchRuleInput(rule) {
  if (!rule) return '—';
  if (rule.inputKind === 'standard') {
    const meta = DATA_MAPPING_STANDARD_FIELDS.find((f) => f.value === rule.standardFieldId);
    return `標準: ${meta?.label || rule.standardFieldId || '—'}`;
  }
  const doc = rule.docType ? getDocDisplayLabel(rule.docType) : '—';
  return `${doc} · ${rule.field || '—'}`;
}

function summarizeMasterMatchRuleMasterRef(rule) {
  if (!rule) return '—';
  const src = typeof getMasterSystemSource === 'function'
    ? getMasterSystemSource(rule.masterSourceId)
    : null;
  const masterLabel = src?.label || rule.masterSourceId || '—';
  return `${masterLabel} · ${rule.lookupField || '—'}`;
}

function syncMasterMatchExportConfig(exportConfigs, rules) {
  const prevMap = Object.fromEntries((exportConfigs || []).map((item) => [item.ruleId, item]));
  return (rules || []).map((rule) => {
    const prev = prevMap[rule.id] || {};
    return {
      ruleId: rule.id,
      enabled: prev.enabled !== false,
      valueSource: OUTPUT_EXPORT_VALUE_SOURCES.some((opt) => opt.value === prev.valueSource)
        ? prev.valueSource
        : 'master_return',
    };
  });
}

function buildExportPreviewFiles(docType, fileKind = 'processed') {
  const label = getDocExportLabel(docType);
  const sourceLabel = fileKind === 'original' ? '原本' : '処理後';
  const sourceKind = fileKind === 'original' ? 'original' : 'processed';
  const prefix = fileKind === 'original' ? 'original-file' : 'export-file';
  if (label.includes('診断書')) {
    return [
      { id: `${prefix}:${docType}:a`, kind: 'file', docType, label: '診断書_A.pdf', sourceLabel, sourceKind },
      { id: `${prefix}:${docType}:b`, kind: 'file', docType, label: '診断書_補足説明.pdf', sourceLabel, sourceKind },
    ];
  }
  if (label.includes('領収書') || label.includes('診療明細')) {
    return [
      { id: `${prefix}:${docType}:a`, kind: 'file', docType, label: '診療明細_慶應大学病院.pdf', sourceLabel, sourceKind },
      { id: `${prefix}:${docType}:b`, kind: 'file', docType, label: '領収書_入院費.pdf', sourceLabel, sourceKind },
    ];
  }
  return [
    { id: `${prefix}:${docType}:a`, kind: 'file', docType, label: '請求書_001.pdf', sourceLabel, sourceKind },
  ];
}

function collectExportPreviewNodes(node, list = []) {
  if (!node) return list;
  list.push(node);
  (node.children || []).forEach((child) => collectExportPreviewNodes(child, list));
  return list;
}

function flattenExportPreviewTree(node, expandedMap, depth = 0, rows = []) {
  if (!node) return rows;
  rows.push({ node, depth });
  if (node.children?.length && expandedMap[node.id] !== false) {
    node.children.forEach((child) => flattenExportPreviewTree(child, expandedMap, depth + 1, rows));
  }
  return rows;
}

function submissionDisplayLabel(submission) {
  return submission === '代替可' ? '任意' : submission;
}

function submissionTagType(submission) {
  return submission === '必須' ? 'danger' : 'info';
}

function getDocSchema(docType) {
  if (DOC_FIELD_SCHEMA[docType]) return DOC_FIELD_SCHEMA[docType];
  return { fields: DOC_TYPE_MAP[docType]?.fields || [], tables: {} };
}

function getDocFieldOptions(docType) {
  const schema = getDocSchema(migrateDocTypeId(docType));
  return [...new Set([...(schema.fields || [])].filter(Boolean))];
}

function getDefaultRequiredFieldsForDocType(docType) {
  return getDocFieldOptions(docType);
}

/** 帳票タイプ別 OCR ポリシー（帳票タイプ設定から連携・Workflow では読取専用） */
const OCR_PROFILES = {
  保険金請求書: { mode: 'ハイブリッド', regions: ['明細テーブル'] },
  申込書: { mode: 'LLM-OCR' },
  告知書: { mode: 'LLM-OCR' },
  診断書: { mode: 'ハイブリッド', regions: ['診断名・所見'] },
  入院診断書: { mode: 'ハイブリッド', regions: ['診断名・所見'] },
  E診断書: { mode: 'ハイブリッド', regions: ['診断名・所見'] },
  領収書: { mode: 'ハイブリッド', regions: ['金額・日付（手書き）'] },
  診療明細書: { mode: 'ハイブリッド', regions: ['明細行'] },
  処方箋: { mode: 'LLM-OCR' },
};

function getDocOcrProfile(docType) {
  return OCR_PROFILES[docType] || { mode: '標準 OCR', regions: [] };
}

function ocrModeTagType(mode) {
  if (mode === 'LLM-OCR') return 'primary';
  if (mode === 'ハイブリッド') return 'warning';
  return 'info';
}

const SCENE_ROUTE = {
  '2064639102406844416': 'invoice_multi',
  '2064639102406844417': 'notice',
  '2064639102406844418': 'insurance_general',
};

function buildDataRule(id, description, tolerance, action, expression = '') {
  const expr = (expression || '').trim();
  if (expr) {
    return buildDataExpressionRule(id, expr, tolerance, action);
  }
  return {
    id,
    mode: 'natural',
    description,
    natural: description,
    expression: '',
    tolerance: tolerance || '—',
    action: action || 'HITL審査',
    invalid: false,
  };
}

function buildDataExpressionRule(id, expression, tolerance = '—', action = DEFAULT_VERIFY_ACTION) {
  const expr = (expression || '').trim();
  return {
    id,
    mode: 'expression',
    expression: expr,
    text: expr,
    description: expr,
    natural: expr,
    label: expr,
    tolerance: tolerance || '—',
    action: action || DEFAULT_VERIFY_ACTION,
    invalid: false,
  };
}

const DEFAULT_VERIFY_ACTION = 'HITL審査';

const DEFAULT_SEAL = {
  rules: [],
};

function buildSealRule(docTypes, detectionTarget = '両方', threshold = 80) {
  const types = (Array.isArray(docTypes) ? docTypes : [docTypes]).filter(Boolean);
  return {
    id: `seal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    docTypes: types,
    detectionTarget,
    threshold,
  };
}

function sealFromDocs(docs, detectionTarget = '両方', extra = {}) {
  const threshold = extra.threshold ?? 80;
  const types = (docs || []).filter(Boolean);
  if (!types.length) return { rules: [] };
  return {
    rules: [buildSealRule(types, detectionTarget, threshold)],
  };
}

const MASTER_DICTIONARIES = [
  {
    id: 'icd10',
    label: 'ICD-10 傷病名辞書',
    lookupField: '傷病名称',
    codeField: 'ICD-10コード',
    nameField: '標準傷病名',
  },
  {
    id: 'medical_facility',
    label: '医療機関マスタ',
    lookupField: '医療機関名',
    codeField: '機関コード',
    nameField: '標準医療機関名',
  },
  {
    id: 'diagnosis_dept',
    label: '診療科分類辞書',
    lookupField: '診療科名',
    codeField: '診療科コード',
    nameField: '標準診療科名',
  },
  {
    id: 'drug_generic',
    label: '医薬品一般名辞書',
    lookupField: '医薬品名',
    codeField: 'YJコード',
    nameField: '一般名',
  },
];

function getMasterDictionary(dictionaryId) {
  return MASTER_DICTIONARIES.find((d) => d.id === dictionaryId) || null;
}

function getMasterDictionaryFieldValues(dict) {
  if (!dict) return [];
  return [...new Set([dict.lookupField, dict.codeField, dict.nameField].filter(Boolean))];
}

const MASTER_SYSTEM_SOURCES = [
  ...MASTER_DICTIONARIES.map((d) => ({
    id: `dict:${d.id}`,
    label: d.label,
    sourceType: 'dict',
    dictionaryId: d.id,
    sheets: [],
    columns: getMasterDictionaryFieldValues(d),
  })),
  {
    id: 'table:insurance_product',
    label: '保険商品マスタ（表）',
    sourceType: 'table',
    sheets: ['商品一覧', '特約一覧'],
    columns: ['商品コード', '商品名', '保険種類', '特約コード'],
  },
  {
    id: 'table:provider_network',
    label: '医療機関ネットワーク（表）',
    sourceType: 'table',
    sheets: ['医療機関一覧', 'ネットワーク契約'],
    columns: ['機関コード', '医療機関名', '都道府県', '契約区分'],
  },
];

function getMasterSourceSheetOptions(sourceId) {
  const src = getMasterSystemSource(sourceId);
  if (!src || src.sourceType === 'dict') return [];
  return (src.sheets || []).map((sheet) => ({ label: sheet, value: sheet }));
}

function getMasterSourceColumnOptions(sourceId) {
  const src = getMasterSystemSource(sourceId);
  if (!src) return [];
  if (src.sourceType === 'dict') {
    return getMasterDictFieldOptions(src.dictionaryId);
  }
  return (src.columns || []).map((col) => ({ label: col, value: col }));
}

function getMasterSourceOutputColumnOptions(sourceId, selected = []) {
  const picked = new Set(selected);
  return getMasterSourceColumnOptions(sourceId).filter((opt) => !picked.has(opt.value));
}

function masterSourceRequiresSheet(sourceId) {
  return getMasterSystemSource(sourceId)?.sourceType === 'table';
}

function getMasterSystemSource(sourceId) {
  return MASTER_SYSTEM_SOURCES.find((s) => s.id === sourceId) || null;
}

function getMasterSystemSourceLabel(sourceId) {
  return getMasterSystemSource(sourceId)?.label || sourceId || '';
}

function resolveMasterMatchKnowledgeSource(node) {
  const opt = getMasterSystemSource(node?.masterSourceId);
  if (opt?.sourceType === 'dict') {
    return normalizeKnowledgeSource({ type: 'dict', dictionaryId: opt.dictionaryId });
  }
  if (opt?.sourceType === 'table') {
    return normalizeKnowledgeSource({
      type: 'external_api',
      endpoint: opt.id,
      label: opt.label,
    });
  }
  return normalizeKnowledgeSource(node?.knowledgeSource);
}

function getMasterDictFieldOptions(dictionaryId) {
  const dict = getMasterDictionary(dictionaryId);
  if (!dict) return [];
  return [
    { label: `照合キー：${dict.lookupField}`, value: dict.lookupField },
    { label: `コード：${dict.codeField}`, value: dict.codeField },
    { label: `名称：${dict.nameField}`, value: dict.nameField },
  ];
}

const KNOWLEDGE_SOURCE_TYPES = [
  { value: 'document', label: 'General', desc: 'Upload local documents' },
  { value: 'website', label: 'Web Site', desc: 'Sync text data from a web site / Web Search API' },
];

const KNOWLEDGE_EMBEDDING_MODELS = [
  { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
  { value: 'bge-m3', label: 'bge-m3' },
];

const KNOWLEDGE_RETRIEVAL_MODES = [
  { value: 'vector', label: 'Vector Search' },
];

const KNOWLEDGE_OUTPUT_VARS = [
  { id: 'case.result', label: 'Tool 実行結果', scope: '案件', type: 'Object', token: '{case.result}' },
  { id: 'case.status', label: 'HTTP / 実行ステータス', scope: '案件', type: 'Enum', token: '{case.status}' },
  { id: 'case.latencyMs', label: 'レイテンシ (ms)', scope: '案件', type: 'Number', token: '{case.latencyMs}' },
];

const KNOWLEDGE_SOURCE_SEEDS = [
  {
    id: 'policy-guide',
    name: '約款・ガイドナレッジ',
    description: '約款・商品ガイドの参照用ナレッジ。詳細な説明は検索精度向上に有効です。',
    type: 'document',
    embeddingModel: 'text-embedding-3-small',
    fileCount: 24,
  },
  {
    id: 'product-faq',
    name: '商品FAQナレッジ',
    description: '商品に関する FAQ と回答集。',
    type: 'document',
    embeddingModel: 'text-embedding-3-small',
    fileCount: 18,
  },
  {
    id: 'claims-manual',
    name: '請求業務マニュアル',
    description: '請求業務の手順書・判定基準。',
    type: 'document',
    embeddingModel: 'text-embedding-3-small',
    fileCount: 12,
  },
  {
    id: 'regulatory-web',
    name: '規制情報 Web 参照',
    description: '外部 Web サイトから規制・通達情報を同期。',
    type: 'website',
    embeddingModel: 'text-embedding-3-small',
    webRootUrl: 'https://example.com/regulatory',
    selector: 'body',
    apiEndpoint: 'https://api.example.com/v1/web-search',
    apiKey: '',
  },
];

const KNOWLEDGE_RETRIEVAL_DEFAULTS = {
  selectedSourceIds: ['policy-guide'],
  retrievalMode: 'vector',
  scoreThreshold: 0.6,
  topK: 3,
  maxCharsPerRef: 5000,
  queryVariable: '{{ocr.fields}}',
};

const EXTERNAL_API_IO = {
  inputs: [
    { id: 'caseId', label: '案件ID', source: '{{case.id}}' },
    { id: 'customerId', label: '顧客ID', source: '{{case.customerId}}' },
    { id: 'policyNo', label: '証券番号', source: '{{case.policyNo}}' },
    { id: 'ocrFields', label: 'OCR抽出フィールド', source: '{{ocr.fields}}' },
  ],
  outputs: KNOWLEDGE_OUTPUT_VARS.map((o) => ({ id: o.id, label: o.label, token: o.token })),
};

/** @deprecated */
const EXTERNAL_API_CALL_MODES = [
  { value: 'knowledge', label: 'ナレッジ检索' },
];

function normalizeKnowledgeSourceItem(raw) {
  const base = {
    id: raw?.id || newRuleId('kb'),
    name: raw?.name || '',
    description: raw?.description || '',
    type: raw?.type === 'website' ? 'website' : 'document',
    embeddingModel: raw?.embeddingModel || KNOWLEDGE_EMBEDDING_MODELS[0].value,
    fileCount: raw?.fileCount || 0,
    webRootUrl: raw?.webRootUrl || '',
    selector: raw?.selector || 'body',
    apiEndpoint: raw?.apiEndpoint || '',
    apiKey: raw?.apiKey || '',
  };
  return base;
}

function getKnowledgeCatalog(allSources, id) {
  return (allSources || []).find((s) => s.id === id) || null;
}

function mergeKnowledgeCatalog(seeds, custom = []) {
  const map = new Map();
  [...(seeds || []), ...(custom || [])].forEach((s) => {
    map.set(s.id, normalizeKnowledgeSourceItem(s));
  });
  return [...map.values()];
}

function normalizeExternalApiConfig(cfg) {
  const raw = cloneJson(cfg || {});
  if (raw.knowledgeSource) {
    raw.selectedSourceIds = raw.knowledgeSource.knowledgeBaseId
      ? [raw.knowledgeSource.knowledgeBaseId]
      : raw.selectedSourceIds;
    raw.queryVariable = raw.knowledgeSource.queryTemplate || raw.queryCondition || raw.queryVariable;
    delete raw.knowledgeSource;
  }
  if (raw.knowledgeBaseId && !raw.selectedSourceIds?.length) {
    raw.selectedSourceIds = [raw.knowledgeBaseId];
  }
  if (raw.callMode === 'external_api' && !raw.selectedSourceIds?.length) {
    raw.selectedSourceIds = [];
  }
  const base = { ...cloneJson(KNOWLEDGE_RETRIEVAL_DEFAULTS), ...raw };
  base.selectedSourceIds = Array.isArray(base.selectedSourceIds) ? base.selectedSourceIds.filter(Boolean) : [];
  if (!base.selectedSourceIds.length && KNOWLEDGE_SOURCE_SEEDS[0]) {
    base.selectedSourceIds = [KNOWLEDGE_SOURCE_SEEDS[0].id];
  }
  base.scoreThreshold = base.scoreThreshold ?? 0.6;
  base.topK = base.topK ?? 3;
  base.maxCharsPerRef = base.maxCharsPerRef ?? 5000;
  base.queryVariable = base.queryVariable || '{{ocr.fields}}';
  delete base.callMode;
  delete base.apiEndpoint;
  delete base.authMethod;
  delete base.apiKey;
  delete base.requestMappings;
  delete base.responseMappings;
  delete base.knowledgeBaseId;
  return base;
}

function getExternalApiCallModeLabel(cfg) {
  const normalized = normalizeExternalApiConfig(cfg);
  const count = normalized.selectedSourceIds?.length || 0;
  return count ? `ナレッジ ${count} 件` : '未選択';
}

function getKnowledgeSourceTypeLabel(type) {
  return KNOWLEDGE_SOURCE_TYPES.find((t) => t.value === type)?.label || type;
}

/** @deprecated use normalizeExternalApiConfig */
function normalizeRagConfig(cfg) {
  return normalizeExternalApiConfig(cfg);
}

function getRagKnowledgeSourceLabel(source) {
  return getExternalApiCallModeLabel({ ...(source?.type ? { knowledgeSource: source } : {}), ...source });
}

const MASTER_KNOWLEDGE_SOURCE_TYPES = [
  { value: 'dict', label: '辞書' },
];

const MASTER_WEB_SEARCH_OUTPUT_FIELDS = [
  'タイトル',
  'URL',
  'スニペット',
  '要約',
  '検索結果一覧',
];

const MASTER_API_OUTPUT_FIELDS = [
  'コード',
  '名称',
  '標準名称',
  'マッチスコア',
  'レスポンス原文',
];

function normalizeKnowledgeSource(source) {
  if (!source?.type) {
    return createMasterPipelineTool('dict', { id: 'master-source', dictionaryId: 'icd10' });
  }
  const normalized = createMasterPipelineTool(source.type, { id: 'master-source', ...source });
  if (!normalized.apiEndpoint && normalized.endpoint) {
    normalized.apiEndpoint = normalized.endpoint;
  }
  return normalized;
}

function getMasterOutputFieldOptions(knowledgeSource) {
  const source = normalizeKnowledgeSource(knowledgeSource);
  if (source.type === 'dict') {
    return getMasterDictOutputFieldOptions(source);
  }
  if (source.type === 'web_search') {
    return MASTER_WEB_SEARCH_OUTPUT_FIELDS.map((f) => ({ label: f, value: f }));
  }
  if (source.type === 'external_api') {
    return MASTER_API_OUTPUT_FIELDS.map((f) => ({ label: f, value: f }));
  }
  return [];
}

function getMasterDictOutputFieldOptions(knowledgeSource) {
  const source = normalizeKnowledgeSource(knowledgeSource);
  if (source.type !== 'dict') return [];
  const dict = getMasterDictionary(source.dictionaryId);
  return getMasterDictionaryFieldValues(dict).map((f) => ({ label: f, value: f }));
}

function getKnowledgeSourceLabel(source) {
  const normalized = normalizeKnowledgeSource(source);
  if (normalized.type === 'dict') {
    return getMasterDictionary(normalized.dictionaryId)?.label || normalized.dictionaryId || '辞書';
  }
  return getMasterPipelineToolMeta(normalized.type).label;
}

function resolveMasterRuleOutputFields(rule, dict) {
  if (Array.isArray(rule?.outputFields) && rule.outputFields.length) {
    return rule.outputFields.filter(Boolean);
  }
  const fields = [];
  const code = rule?.outputCodeField || rule?.codeField || dict?.codeField;
  const name = rule?.outputNameField || rule?.nameField || dict?.nameField;
  if (code) fields.push(code);
  if (name && name !== code) fields.push(name);
  return fields;
}

const MASTER_PIPELINE_TOOLS = [
  { type: 'dict', label: '辞書照合', shortLabel: '辞書', desc: '内部マスタ辞書でコード化' },
  { type: 'web_search', label: 'Web検索', shortLabel: '検索', desc: '外部検索で候補を取得' },
  { type: 'web_crawl', label: 'Webクロール', shortLabel: 'クロール', desc: '許可ドメインから照合（Add-on）' },
  { type: 'external_api', label: '外部 API', shortLabel: 'API', desc: '外部マスタ API を参照' },
  { type: 'llm', label: 'LLM 補完', shortLabel: 'LLM', desc: '表記ゆれを意味マッチで補完' },
];

function getMasterPipelineToolMeta(type) {
  return MASTER_PIPELINE_TOOLS.find((t) => t.type === type) || { type, label: type, shortLabel: type, desc: '' };
}

function createMasterPipelineTool(type, overrides = {}) {
  const id = overrides.id || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const base = { id, type, enabled: overrides.enabled !== false };
  switch (type) {
    case 'dict': {
      const dict = getMasterDictionary(overrides.dictionaryId);
      return {
        ...base,
        dictionaryId: overrides.dictionaryId || 'icd10',
        dictLookupField: overrides.dictLookupField ?? dict?.lookupField ?? '',
        ...overrides,
        id,
      };
    }
    case 'web_search':
      return {
        ...base,
        apiEndpoint: overrides.apiEndpoint || overrides.endpoint || '',
        apiKey: overrides.apiKey || '',
        queryTemplate: overrides.queryTemplate || '{{OCR値}}',
        ...overrides,
        id,
      };
    case 'web_crawl':
      return { ...base, domains: overrides.domains || '', ...overrides, id };
    case 'external_api':
      return {
        ...base,
        apiEndpoint: overrides.apiEndpoint || overrides.endpoint || '',
        apiKey: overrides.apiKey || '',
        ...overrides,
        id,
      };
    case 'llm':
      return { ...base, ...overrides, id };
    default:
      return { ...base, ...overrides, id };
  }
}

function normalizeRulePipeline(rule) {
  if (Array.isArray(rule.pipeline) && rule.pipeline.length) {
    return rule.pipeline.map((tool) => {
      const normalized = createMasterPipelineTool(tool.type, tool);
      return { ...normalized, id: tool.id || normalized.id };
    });
  }
  if (rule.dictionaryId) {
    return [
      createMasterPipelineTool('dict', {
        id: `t-${rule.id || 'x'}-dict`,
        dictionaryId: rule.dictionaryId,
        dictLookupField: rule.dictLookupField,
      }),
    ];
  }
  return [createMasterPipelineTool('dict')];
}

function getDictToolFromRule(rule) {
  const pipeline = rule.pipeline || [];
  return pipeline.find((t) => t.type === 'dict' && t.enabled !== false)
    || pipeline.find((t) => t.type === 'dict');
}

function pipelineSummaryText(pipeline) {
  const labels = (pipeline || [])
    .filter((t) => t.enabled !== false)
    .map((t) => getMasterPipelineToolMeta(t.type).shortLabel);
  return labels.length ? labels.join(' → ') : '—';
}

function pipelineToolDetail(tool) {
  const meta = getMasterPipelineToolMeta(tool.type);
  switch (tool.type) {
    case 'dict': {
      const dict = getMasterDictionary(tool.dictionaryId);
      return dict?.label || tool.dictionaryId || meta.label;
    }
    case 'web_search':
      return tool.apiEndpoint || tool.queryTemplate || 'Web検索 API 未設定';
    case 'web_crawl':
      return tool.domains || 'ドメイン未設定';
    case 'external_api':
      return tool.apiEndpoint || tool.endpoint || 'API 未設定';
    case 'llm':
      return '表記ゆれ補完';
    default:
      return meta.label;
  }
}

function enrichMasterRule(rule, knowledgeSource) {
  const source = normalizeKnowledgeSource(knowledgeSource || rule?.knowledgeSource);
  const dict = source.type === 'dict' ? getMasterDictionary(source.dictionaryId) : null;
  const lookupField = source.type === 'dict'
    ? (rule?.lookupField || rule?.dictLookupField || dict?.lookupField || '')
    : '';
  const outputFields = resolveMasterRuleOutputFields(rule, dict);
  const outputCodeField = outputFields[0] || rule?.outputCodeField || rule?.codeField || dict?.codeField || '';
  const outputNameField = outputFields[1] || rule?.outputNameField || rule?.nameField || dict?.nameField || '';
  return {
    ...rule,
    lookupField,
    dictLookupField: lookupField,
    dictionaryId: source.type === 'dict' ? (source.dictionaryId || '') : '',
    dictionaryLabel: source.type === 'dict' ? (getMasterDictionary(source.dictionaryId)?.label || '') : '',
    outputFields,
    outputCodeField,
    outputNameField,
    codeField: outputCodeField,
    sourceType: source.type,
    sourceLabel: getKnowledgeSourceLabel(source),
  };
}

function buildMasterRule(id, docType, field, lookupField, outputFields = [], knowledgeSource) {
  const source = normalizeKnowledgeSource(knowledgeSource);
  const dict = source.type === 'dict' ? getMasterDictionary(source.dictionaryId) : null;
  const resolvedOutput = outputFields.length
    ? outputFields
    : [dict?.codeField, dict?.nameField].filter(Boolean);
  return enrichMasterRule({
    id,
    docType,
    field,
    lookupField,
    outputFields: resolvedOutput,
  }, source);
}

const MASTER_TOOL_TEMPLATES = [
  { id: 'dict_only', label: '内部辞書のみ', desc: '登録済みマスタ辞書で照合' },
  { id: 'dict_api', label: '辞書 + 外部 API', desc: '内部辞書の後、外部マスタ API を参照' },
  { id: 'full', label: 'フルツールチェーン', desc: '辞書・外部 API・Web クロール（Add-on）' },
];

const MASTER_TOOL_CHAIN_DEFAULTS = {
  internalDict: true,
  externalApi: false,
  externalApiEndpoint: '',
  webCrawl: false,
  crawlDomains: '',
  llmSemanticMatch: true,
};

function masterBlock(mappings = [], extra = {}) {
  const { knowledgeSource, ...rest } = extra;
  return {
    enabled: true,
    templateId: 'dict_api',
    onUnmatch: 'HITL',
    toolChain: { ...MASTER_TOOL_CHAIN_DEFAULTS },
    mappings,
    ...rest,
    knowledgeSource: normalizeKnowledgeSource(knowledgeSource),
  };
}

function normalizeMasterConfig(master, legacyVerify) {
  const m = cloneJson(master || {});
  if ((!m.mappings || !m.mappings.length) && legacyVerify?.master?.length) {
    m.mappings = cloneJson(legacyVerify.master);
  }
  m.enabled = true;
  if (!m.knowledgeSource) {
    const firstRule = m.mappings?.[0];
    const firstTool = firstRule?.pipeline?.[0];
    m.knowledgeSource = firstTool || { type: 'dict', dictionaryId: firstRule?.dictionaryId || 'icd10' };
  }
  m.knowledgeSource = normalizeKnowledgeSource(m.knowledgeSource);
  if (m.knowledgeSource.type !== 'dict') {
    m.knowledgeSource = normalizeKnowledgeSource({
      type: 'dict',
      dictionaryId: m.knowledgeSource.dictionaryId || 'icd10',
    });
  }
  m.mappings = (Array.isArray(m.mappings) ? m.mappings : []).map((rule) => {
    const cleaned = { ...rule, docType: migrateDocTypeId(rule.docType) };
    if (!cleaned.lookupField && cleaned.dictLookupField) cleaned.lookupField = cleaned.dictLookupField;
    if (!cleaned.lookupField) {
      const dictTool = getDictToolFromRule(cleaned);
      cleaned.lookupField = dictTool?.dictLookupField || cleaned.dictLookupField || '';
    }
    return enrichMasterRule(cleaned, m.knowledgeSource);
  });
  m.templateId = m.templateId || 'dict_api';
  m.onUnmatch = m.onUnmatch || 'HITL';
  m.toolChain = { ...MASTER_TOOL_CHAIN_DEFAULTS, ...(m.toolChain || {}) };
  if (m.templateId === 'dict_only') {
    m.toolChain.externalApi = false;
    m.toolChain.webCrawl = false;
  } else if (m.templateId === 'dict_api') {
    m.toolChain.externalApi = true;
    m.toolChain.webCrawl = false;
  } else if (m.templateId === 'full') {
    m.toolChain.externalApi = true;
    m.toolChain.webCrawl = true;
  }
  m.retryCount = m.retryCount != null ? m.retryCount : 3;
  m.cacheEnabled = m.cacheEnabled != null ? m.cacheEnabled : true;
  m.cacheTtlMinutes = m.cacheTtlMinutes != null ? m.cacheTtlMinutes : 60;
  return m;
}

function buildDocDictFields(docType, mappings, knowledgeSource, existing = [], legacyMasterFields = []) {
  const legacyMap = Object.fromEntries(
    (legacyMasterFields || []).map((f) => [f.ruleId, f])
  );
  const existingMap = Object.fromEntries(
    (existing || []).map((f) => [f.ruleId, f])
  );
  return (mappings || [])
    .filter((rule) => migrateDocTypeId(rule.docType) === docType)
    .map((rule) => {
      const enriched = enrichMasterRule(rule, knowledgeSource);
      const prev = existingMap[rule.id] || legacyMap[rule.id];
      const codeOn = prev?.exportCodeChecked !== false && prev?.checked !== false;
      const nameOn = prev?.exportNameChecked !== false && prev?.checked !== false;
      return {
        ruleId: rule.id,
        sourceField: rule.field,
        dictLabel: enriched.dictionaryLabel,
        dictLookupField: enriched.dictLookupField,
        codeField: enriched.outputCodeField,
        nameField: enriched.outputNameField,
        exportCodeChecked: prev ? codeOn : true,
        exportNameChecked: prev ? nameOn : true,
      };
    });
}

function attachDictFieldsToDocFields(docFields, masterMappings, knowledgeSource, legacyMasterFields = []) {
  return (docFields || []).map((doc) => ({
    ...doc,
    dictFields: buildDocDictFields(
      doc.docType,
      masterMappings,
      knowledgeSource,
      doc.dictFields,
      legacyMasterFields
    ),
  }));
}

function normalizeOutputNaming(output) {
  const legacy = output?.fileNamePattern || OUTPUT_DEFAULTS.fileNamePattern;
  const naming = syncOutputNamingPatterns({ ...cloneJson(OUTPUT_NAMING_DEFAULTS), ...(output?.naming || {}) });
  if (!output?.naming?.caseFilePattern && legacy && !output?.naming?.prefixMode) {
    naming.caseFilePattern = legacy;
    naming.docFilePattern = legacy;
  }
  return syncOutputNamingPatterns(naming);
}

function resolveNamingPattern(pattern, context = {}) {
  if (!pattern) return '';
  const samples = {
    '{案件ID}': 'CASE-2026-001234',
    '{案件番号}': 'A20260617001',
    '{証券番号}': 'POL-88991234',
    '{業務シーン}': (context.sceneName || '医療保険通院給付').replace(/\s+/g, ''),
    '{帳票タイプ}': context.docType || '診断書',
    '{連番4桁}': context.serialNo || '0001',
    '{連番5桁}': context.serialNo || '00001',
    '{連番6桁}': context.serialNo || '000001',
    '{連番8桁}': context.serialNo || '00000001',
    '{yyyyMMdd}': '20260617',
    '{HHmmss}': '143025',
    '{タイムスタンプ}': '20260617_143025',
    '{yyyyMMdd_HHmmss}': '20260617_143025',
    '{処理結果}': context.outcome || 'PASS',
    '{給付種別}': context.benefitType || '通院給付',
    '{請求種別}': context.claimType || '保険金請求',
  };
  let result = String(pattern);
  Object.entries(samples).forEach(([token, value]) => {
    result = result.split(token).join(value);
  });
  return result;
}

function buildTextRule(id, text, action = DEFAULT_VERIFY_ACTION, natural = '') {
  return {
    id,
    mode: 'natural',
    text,
    natural: natural || ruleReadableText(text),
    action,
  };
}

const DATA_RULE_EXPRESSION_MIGRATIONS = {
  '保険金請求書と診断書の被保険者氏名は一致すること': '{{保険金請求書.被保険者氏名}} = {{診断書.被保険者氏名}}',
  '保険金請求書の請求金額は診療明細書の金額合計と一致すること': '{{保険金請求書.請求金額}} = {{診療明細書.合計金額}}',
  '保険金請求書の請求金額は領収書・診療明細書の金額合計と一致すること': '{{保険金請求書.請求金額}} = {{診療明細書.合計金額}}',
  '保険金請求書、診断書、診療明細書の被保険者氏名は一致すること': '{{保険金請求書.被保険者氏名}} = {{診断書.被保険者氏名}} = {{診療明細書.被保険者氏名}}',
  '保険金請求書、診断书、領収書・診療明細書の被保険者氏名は一致すること': '{{保険金請求書.被保険者氏名}} = {{診断書.被保険者氏名}} = {{診療明細書.被保険者氏名}}',
  '保険金請求書、診断書、診療明細書の医療機関名は一致すること': '{{保険金請求書.医療機関名}} = {{診断書.医療機関名}} = {{診療明細書.医療機関名}}',
  '保険金請求書、診断书、領収書・診療明細書の医療機関名は一致すること': '{{保険金請求書.医療機関名}} = {{診断書.医療機関名}} = {{診療明細書.医療機関名}}',
};

function normalizeDataRule(rule) {
  const natural = rule.description || rule.natural || rule.text || rule.label || '';
  let expression = (rule.expression || '').trim();
  if (!expression && /\{\{[^}]+\}\}/.test(rule.text || '')) {
    expression = rule.text.trim();
  }
  if (!expression && DATA_RULE_EXPRESSION_MIGRATIONS[natural]) {
    expression = DATA_RULE_EXPRESSION_MIGRATIONS[natural];
  }
  const mode = expression ? 'expression' : (rule.mode || 'natural');
  return {
    ...rule,
    mode,
    description: mode === 'expression' ? expression : natural,
    natural: mode === 'expression' ? expression : natural,
    expression,
    text: expression || rule.text || '',
    label: mode === 'expression' ? expression : (rule.label || natural),
    tolerance: rule.tolerance || '—',
    action: rule.action || 'HITL審査',
    invalid: rule.invalid || false,
  };
}

function normalizeVerifyConfig(verify) {
  const v = cloneJson(verify || {});
  v.textEnabled = v.textEnabled !== false;
  v.dataEnabled = v.dataEnabled !== false;
  v.completenessEnabled = v.completenessEnabled !== false;
  v.sealEnabled = v.sealEnabled !== false;
  v.text = (Array.isArray(v.text) ? v.text : []).map((rule) => ({
    ...rule,
    action: DEFAULT_VERIFY_ACTION,
  }));
  const legacyRules = [
    ...(Array.isArray(v.dataRules) ? v.dataRules : []),
    ...(Array.isArray(v.crossDoc) ? v.crossDoc : []),
    ...(Array.isArray(v.business) ? v.business : []),
  ];
  v.dataRules = legacyRules.map((rule) => ({
    ...normalizeDataRule(rule),
    action: DEFAULT_VERIFY_ACTION,
  }));
  v.seal = (() => {
    const legacy = v.seal || {};
    if (Array.isArray(legacy.rules)) {
      return {
        rules: legacy.rules.map((rule) => {
          const docTypes = Array.isArray(rule.docTypes)
            ? rule.docTypes.map(migrateDocTypeId)
            : rule.docType
              ? [migrateDocTypeId(rule.docType)]
              : [];
          return {
            id: rule.id || `seal_${Date.now().toString(36)}`,
            docTypes,
            detectionTarget: rule.detectionTarget || '両方',
            threshold: Number.isFinite(rule.threshold) ? rule.threshold : 80,
          };
        }),
      };
    }
    const docs = (legacy.targetDocs || []).map(migrateDocTypeId);
    return sealFromDocs(docs, legacy.detectionTarget || '両方', {
      threshold: legacy.threshold ?? 80,
    });
  })();
  delete v.master;
  delete v.masterEnabled;
  const migrateRuleText = (s) =>
    s ? String(s).replaceAll('請求書_多表格', '保険金請求書') : s;
  v.text = v.text.map((rule) => ({
    ...rule,
    docType: rule.docType ? migrateDocTypeId(rule.docType) : rule.docType,
    natural: migrateRuleText(rule.natural),
    label: migrateRuleText(rule.label),
    text: migrateRuleText(rule.text),
  }));
  v.dataRules = v.dataRules.map((rule) => ({
    ...rule,
    natural: migrateRuleText(rule.natural),
    label: migrateRuleText(rule.label),
    description: migrateRuleText(rule.description),
    text: migrateRuleText(rule.text),
    expression: migrateRuleText(rule.expression),
  }));
  return v;
}

function normalizeHitlConfig(hitl) {
  const role = hitl?.role || WORKFLOW_DEFAULTS.hitl.role;
  return {
    role,
    useSpecificRoles: hitl?.useSpecificRoles === true,
    imageRole: hitl?.imageRole || role,
    ocrRole: hitl?.ocrRole || role,
    masterRole: hitl?.masterRole || role,
    verifyRole: hitl?.verifyRole || role,
    exportRole: hitl?.exportRole || role,
  };
}

function filterImageDocTypes(docTypes, allowedTypes) {
  const allowed = new Set(allowedTypes || []);
  return (docTypes || []).filter((t) => allowed.has(t));
}

function defaultImageDocTypes(enabled, docTypes, allowedTypes) {
  if (!enabled) return [];
  const filtered = filterImageDocTypes(docTypes, allowedTypes);
  if (filtered.length) return filtered;
  return allowedTypes?.length ? [...allowedTypes] : [];
}

function normalizeInputConfig(input) {
  const base = { ...cloneJson(WORKFLOW_DEFAULTS.input), ...(input || {}) };
  const size = Number(base.maxFileSizeMb);
  base.maxFileSizeMb = Number.isFinite(size)
    ? Math.min(INPUT_MAX_FILE_SIZE_MB, Math.max(1, Math.round(size)))
    : INPUT_MAX_FILE_SIZE_MB;
  const allowedChannelIds = new Set(INPUT_CHANNELS.map((ch) => ch.id));
  base.channels = (base.channels || [])
    .map((id) => INPUT_CHANNEL_MIGRATE[id] || id)
    .filter((id) => allowedChannelIds.has(id));
  if (!base.channels.length) base.channels = [...WORKFLOW_DEFAULTS.input.channels];
  const allowedFormatSet = new Set(INPUT_FORMAT_OPTIONS);
  base.allowedFormats = (base.allowedFormats || [])
    .map((fmt) => INPUT_FORMAT_MIGRATE[fmt] || fmt)
    .filter((fmt) => allowedFormatSet.has(fmt));
  if (!base.allowedFormats.length) base.allowedFormats = [...WORKFLOW_DEFAULTS.input.allowedFormats];
  delete base.receptionType;
  return base;
}

const WORKFLOW_TEST_SCOPE_NOTE = '案件集約は本テストの対象外。Mock の集約済み案件データを使用し、Workflow のみ検証します。';

/** 内置 Mock 数据：含文件归属与 OCR/标准字段初值，供 Workflow 测试执行消费 */
const WORKFLOW_TEST_SAMPLES = {
  normal: {
    id: 'normal',
    label: 'Mock テストデータ',
    fixtureName: 'surgery_claim_post_aggregate.zip',
    description: '集約済み案件を模した Mock データ。缺件・検証結果は Workflow 実行時（AI検証ノード）に判定します。',
    includes: [
      '案件集約完了 · 6 ファイル',
      '主帳票・関連帳票を含む標準構成',
    ],
    caseNo: 'REQ-2025-0018890',
    caseLabel: '高橋誠_手術請求',
    fileCount: 6,
    standardFields: {
      氏名: '高橋誠',
      請求金額: '245800',
      診療日: '2025-03-12',
      医療機関名: '中央総合病院',
      診断名: '胆石症',
    },
    files: [
      {
        id: 'f-claim',
        name: '保険請求書_p1-2.pdf',
        docType: '保険請求書',
        role: '主帳票',
        ocrFields: { 氏名: '高橋誠', 請求金額: '245800', 診療日: '2025-03-12', 医療機関名: '中央総合病院' },
      },
      {
        id: 'f-diag',
        name: '診断書_p3-4.pdf',
        docType: '診断書',
        role: '関連帳票',
        ocrFields: { 氏名: '高橋誠', 生年月日: '1982-06-18', 診断名: '胆石症', 発行日: '2025-03-14', 医療機関名: '中央総合病院' },
      },
      {
        id: 'f-meisai-1',
        name: '診療明細書_001.jpg',
        docType: '診療明細書',
        role: '関連帳票',
        ocrFields: { 氏名: '高橋誠', 診療日: '2025-03-12', 金額: '98000', 項目名: '入院基本料' },
      },
      {
        id: 'f-ryoshu-1',
        name: '領収書_p5-6.pdf',
        docType: '診療明細書',
        role: '関連帳票',
        ocrFields: { 氏名: '高橋誠', 診療日: '2025-03-12', 金額: '87500', 医療機関名: '中央総合病院' },
      },
      {
        id: 'f-ryoshu-2',
        name: '領収書_入院費.png',
        docType: '診療明細書',
        role: '関連帳票',
        ocrFields: { 氏名: '高橋誠', 診療日: '2025-03-13', 金額: '60300', 医療機関名: '中央総合病院' },
      },
      {
        id: 'f-note',
        name: '補足説明_p1-2.tiff',
        docType: 'その他',
        role: '参考資料',
        ocrFields: { メモ: '手術後の補足説明' },
      },
    ],
    scopeNote: WORKFLOW_TEST_SCOPE_NOTE,
  },
  custom: {
    id: 'custom',
    label: 'ユーザーアップロード',
    fixtureName: '',
    description: '第一期では未提供。内蔵の Mock テストデータのみ使用します。',
    includes: [],
    caseNo: '—',
    caseLabel: '—',
    fileCount: 0,
    standardFields: {},
    files: [],
    scopeNote: WORKFLOW_TEST_SCOPE_NOTE,
  },
};

const WORKFLOW_TEST_START_EVENT_IDS = new Set(['e1', 'e2', 'e3']);

function formatWorkflowTestUserMessage(message) {
  return String(message || '')
    .replace(/\bS\d+-\d+\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeWorkflowTestStartEvent(raw, fallback = 'e1') {
  const value = String(raw || '').trim().toLowerCase();
  const remapped = { e4: 'e3', e3: 'e2', e2: 'e1' }[value] || value;
  if (WORKFLOW_TEST_START_EVENT_IDS.has(remapped)) return remapped;
  const legacyMap = {
    新規起動: 'e1',
    起動: 'e1',
    続行: 'e2',
    再実行: 'e3',
    e1: 'e1',
    e2: 'e2',
    e3: 'e3',
    e4: 'e3',
  };
  const mapped = legacyMap[value] || legacyMap[String(raw || '').trim()];
  return mapped && WORKFLOW_TEST_START_EVENT_IDS.has(mapped) ? mapped : fallback;
}

function getWorkflowTestStartEventLabel(eventId) {
  const trigger = typeof CASE_WORKFLOW_START_TRIGGERS !== 'undefined'
    ? CASE_WORKFLOW_START_TRIGGERS.find((t) => t.id === eventId)
    : null;
  return trigger ? `${trigger.caseStatus} · ${trigger.label}` : eventId;
}

function cloneWorkflowTestCaseDefault() {
  const base = WORKFLOW_TEST_SAMPLES.normal;
  return {
    label: base.label,
    caseNo: base.caseNo,
    caseLabel: base.caseLabel,
    standardFields: { ...(base.standardFields || {}) },
    files: (base.files || []).map((f) => ({
      ...f,
      ocrFields: { ...(f.ocrFields || {}) },
    })),
    source: 'builtin',
    uploadFileName: '',
    savedAt: null,
  };
}

function normalizeWorkflowTestCase(raw) {
  const def = cloneWorkflowTestCaseDefault();
  return {
    label: raw?.label || def.label,
    caseNo: raw?.caseNo || def.caseNo,
    caseLabel: raw?.caseLabel || def.caseLabel,
    standardFields: { ...def.standardFields },
    files: def.files.map((f) => ({
      ...f,
      ocrFields: { ...(f.ocrFields || {}) },
    })),
    source: 'builtin',
    uploadFileName: '',
    savedAt: null,
  };
}

function validateWorkflowTestCase(testCase) {
  // 本期固定内置样例：normalize 后必然有文件与元数据；不对「样例是否存在」做用户侧门禁
  normalizeWorkflowTestCase(testCase);
  return '';
}

function getWorkflowTestSampleList() {
  return [WORKFLOW_TEST_SAMPLES.normal].filter(Boolean);
}

function buildWorkflowTestInputContext(testCase) {
  const tc = options.skipTestInput
    ? { files: [], standardFields: {} }
    : normalizeWorkflowTestCase(testCase);
  return {
    ...tc,
    fileCount: tc.files.length,
    description: '内蔵の集約済み案件スナップショットをテスト入力として使用します。',
    scopeNote: WORKFLOW_TEST_SCOPE_NOTE,
  };
}

/** 从内置样例解析条件左值（支持裸键 / docTypes.帳票.字段 / standardFields.字段） */
function resolveWorkflowTestSampleLeafValue(variablePath, testCase) {
  const tc = normalizeWorkflowTestCase(testCase);
  const raw = String(variablePath || '').trim();
  if (!raw) return undefined;
  const path = raw.replace(/^\{|\}$/g, '').replace(/^case\./, '');
  const bare = path.includes('.') ? path.split('.').pop() : path;

  if (path.startsWith('standardFields.') || path.startsWith('standardFields[')) {
    const key = path.replace(/^standardFields\.?/, '').replace(/^\["|"\]$/g, '');
    return tc.standardFields?.[key] ?? tc.standardFields?.[bare];
  }
  if (path.startsWith('docTypes.') || path.includes('.ocrFields')) {
    const parts = path.replace(/^docTypes\./, '').split('.');
    const docType = parts[0];
    const field = parts[parts.length - 1];
    const file = (tc.files || []).find((f) => f.docType === docType);
    return file?.ocrFields?.[field];
  }
  if (tc.standardFields && Object.prototype.hasOwnProperty.call(tc.standardFields, bare)) {
    return tc.standardFields[bare];
  }
  for (const file of tc.files || []) {
    if (file.ocrFields && Object.prototype.hasOwnProperty.call(file.ocrFields, bare)) {
      return file.ocrFields[bare];
    }
  }
  return undefined;
}

function evaluateWorkflowTestConditionOp(left, op, right) {
  const l = left == null ? '' : String(left);
  const r = right == null ? '' : String(right);
  const ln = Number(l);
  const rn = Number(r);
  const bothNum = l !== '' && r !== '' && Number.isFinite(ln) && Number.isFinite(rn);
  switch (op) {
    case '=':
    case '==':
    case 'eq':
      return bothNum ? ln === rn : l === r;
    case '!=':
    case 'ne':
      return bothNum ? ln !== rn : l !== r;
    case '>':
      return bothNum ? ln > rn : l > r;
    case '>=':
      return bothNum ? ln >= rn : l >= r;
    case '<':
      return bothNum ? ln < rn : l < r;
    case '<=':
      return bothNum ? ln <= rn : l <= r;
    case 'contains':
      return l.includes(r);
    case 'not_contains':
      return !l.includes(r);
    case 'empty':
      return !l;
    case 'not_empty':
      return !!l;
    default:
      return l === r;
  }
}

function evaluateWorkflowTestDecisionCase(decisionCase, testCase) {
  const conditions = decisionCase?.conditions || [];
  if (!conditions.length) return false;
  const logic = decisionCase.logic === 'or' ? 'or' : 'and';
  const results = conditions.map((cond) => {
    if (!cond?.variable) return false;
    const left = resolveWorkflowTestSampleLeafValue(cond.variable, testCase);
    return evaluateWorkflowTestConditionOp(left, cond.operator || cond.op || '=', cond.value);
  });
  return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
}

function pickWorkflowTestDecisionBranch(node, workflow, testCase) {
  const wf = workflow || { nodes: [], edges: [] };
  const outEdges = (wf.edges || []).filter((e) => e.from === node.id && !e.visualHidden);
  const cases = node.cases || [];
  for (let index = 0; index < cases.length; index += 1) {
    const decisionCase = cases[index];
    const branchKey = decisionCase.kind === 'if' || index === 0
      ? 'if'
      : (decisionCase.id || `elif_${index}`);
    if (!evaluateWorkflowTestDecisionCase(decisionCase, testCase)) continue;
    const edge = outEdges.find((item) => item.branch === branchKey || item.branch === decisionCase.id);
    if (edge) {
      return {
        branchKey,
        edge,
        label: decisionCase.label || (index === 0 ? 'IF' : `ELIF ${index}`),
        matched: true,
      };
    }
  }
  const elseEdge = outEdges.find((e) => e.branch === 'else');
  if (elseEdge) {
    return { branchKey: 'else', edge: elseEdge, label: 'ELSE', matched: false };
  }
  const first = outEdges[0];
  return first
    ? { branchKey: first.branch || 'main', edge: first, label: first.label || '分岐', matched: false }
    : null;
}

function getSceneDocumentTypeSet(sceneContext = {}) {
  const docs = sceneContext.documents || sceneContext?.scene?.documents || [];
  return new Set(docs.map((d) => d.type || d.docType || d.id).filter(Boolean));
}

/**
 * 按 PRD 维度收集门禁错误（用例→结构→连线→节点配置…）。前层有错时仍收集同层全部，供错误列表；调用方决定是否进入测试执行。
 */
function collectWorkflowTestDimensionErrors(workflow, testCase, sceneContext = {}, options = {}) {
  const wf = workflow || { nodes: [], edges: [] };
  const nodes = wf.nodes || [];
  const edges = (wf.edges || []).filter((e) => !e.visualHidden);
  const tc = normalizeWorkflowTestCase(testCase);
  const errors = [];
  const push = (ruleId, dimension, message, nodeId = '', hint = '') => {
    errors.push({
      ruleId,
      dimension,
      message: formatWorkflowTestUserMessage(message),
      nodeId,
      hint: formatWorkflowTestUserMessage(hint),
    });
  };

  // —— 用例：仅完整测试检查样例与 Step1 账票漂移；Step2 保存静态校验不读取样例 ——
  const step1Types = getSceneDocumentTypeSet(sceneContext);
  if (!options.skipTestInput && step1Types.size) {
    tc.files.forEach((f) => {
      if (f.role === '参考資料' || f.docType === 'その他') return;
      if (f.docType && !step1Types.has(f.docType)) {
        push('S2-03', 'テスト入力', `用例帳票「${f.docType}」が Step1 帳票集合にありません`, '', 'Step1 に帳票を戻すか用例を見直してください');
      }
    });
  }
  if (errors.some((e) => e.dimension === 'テスト入力')) return { errors, blockedDimension: 'テスト入力' };

  // —— 结构 S2-04～08 ——
  const starts = nodes.filter((n) => n.type === 'start');
  const ends = nodes.filter((n) => n.type === 'end');
  if (!ends.length) {
    push('S2-05', '構造', '終了ノードを1件以上配置してください');
  }
  const reachable = new Set(getWorkflowTestReachableNodeIds(wf));
  if (starts.length === 1 && ends.length && !ends.some((e) => reachable.has(e.id))) {
    push('S2-06', '構造', '開始ノードから終了ノードへ到達できません', starts[0].id);
  }
  // 每条从分支出口出发须能到结束
  nodes.filter((n) => n.type === 'decision' || n.type === 'hitl_gate').forEach((node) => {
    const outs = edges.filter((e) => e.from === node.id);
    outs.forEach((edge) => {
      const canEnd = typeof workflowEdgeLeadsToEnd === 'function'
        ? ends.some((end) => workflowEdgeLeadsToEnd(wf, edge.from, edge.to, end.id))
        : reachable.has(edge.to);
      if (!canEnd && outs.length) {
        // fallback: BFS from edge.to
        const seen = new Set();
        const q = [edge.to];
        let ok = false;
        while (q.length) {
          const id = q.shift();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          if (ends.some((e) => e.id === id)) { ok = true; break; }
          edges.filter((ed) => ed.from === id).forEach((ed) => q.push(ed.to));
        }
        if (!ok) {
          push('S2-06', '構造', `分岐「${edge.branch || edge.label || edge.to}」が終了ノードに到達できません`, node.id);
        }
      }
    });
  });
  nodes.forEach((node) => {
    if (node.type === 'start' || node.type === 'end') return;
    const hasIn = edges.some((e) => e.to === node.id);
    const hasOut = edges.some((e) => e.from === node.id);
    if (!hasIn && !hasOut) {
      push('S2-07', '構造', '接続のない孤立ノードがあります', node.id);
    } else if (!reachable.has(node.id)) {
      push('S2-07', '構造', '開始から到達できないノードがあります', node.id);
    }
  });
  if (typeof getWorkflowCycleNodeIds === 'function') {
    const cycles = getWorkflowCycleNodeIds(wf);
    if (cycles?.size) {
      let canTerminate = ends.some((e) => reachable.has(e.id));
      if (!canTerminate) {
        push('S2-08', '構造', '回流により終了ノードへ到達できない経路があります', [...cycles][0] || '');
      }
    }
  }
  if (errors.some((e) => e.dimension === '構造')) return { errors, blockedDimension: '構造' };

  // —— 连线 S2-09～12 ——
  const inboundMain = {};
  edges.forEach((edge) => {
    if (edge.branch) return;
    inboundMain[edge.to] = (inboundMain[edge.to] || 0) + 1;
  });
  Object.entries(inboundMain).forEach(([nodeId, count]) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.type === 'start') return;
    if (count > 1) {
      push('S2-09', '接続', '主入力は1本までです', nodeId);
    }
  });
  nodes.filter((n) => n.type === 'decision').forEach((node) => {
    const outs = edges.filter((e) => e.from === node.id);
    const seen = new Set();
    let elseCount = 0;
    outs.forEach((e) => {
      const key = e.branch || '';
      if (key === 'else') elseCount += 1;
      if (key && seen.has(key)) {
        push('S2-10', '接続', `条件出口「${key}」が重複しています`, node.id);
      }
      seen.add(key);
    });
    if (elseCount > 1) push('S2-10', '接続', 'ELSE 出口は1本までです', node.id);
  });
  nodes.filter((n) => n.type === 'hitl_gate').forEach((node) => {
    const outs = edges.filter((e) => e.from === node.id && e.branch);
    if (!outs.length) {
      push('S2-11', '接続', '人工確認出口を1本以上接続してください', node.id);
    }
    const seen = new Set();
    outs.forEach((e) => {
      if (seen.has(e.branch)) {
        push('S2-11', '接続', `人工確認出口「${e.branch}」が重複しています`, node.id);
      }
      seen.add(e.branch);
    });
  });
  edges.forEach((edge) => {
    if (!nodes.some((n) => n.id === edge.from) || !nodes.some((n) => n.id === edge.to)) {
      push('S2-12', '接続', '宙に浮いた接続があります（端点ノードが存在しません）');
    }
  });
  if (errors.some((e) => e.dimension === '接続')) return { errors, blockedDimension: '接続' };

  // —— 节点配置（对可达节点）——
  const { processing, documents } = getWorkflowTestSceneContext(sceneContext);
  reachable.forEach((id) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const step = { id: node.id, type: node.type };
    const cfg = validateWorkflowTestNodeConfig(wf, step, sceneContext);
    if (cfg) {
      const rule = ({
        preprocess: 'S2-13',
        ocr: 'S2-14',
        data_mapping: 'S2-15',
        ai_verify: 'S2-16',
        hitl_gate: 'S2-17',
        decision: 'S2-10',
      })[node.type] || 'S2-13';
      push(rule, 'ノード設定', cfg, node.id);
    }
    // S2-13 目标账票
    if (node.type === 'preprocess') {
      const targets = processing?.image?.targetDocTypes || processing?.targetDocTypes || [];
      if (Array.isArray(targets) && targets.length && step1Types.size) {
        targets.forEach((t) => {
          if (t && !step1Types.has(t)) {
            push('S2-13', 'ノード設定', `前処理対象帳票「${t}」が Step1 にありません`, node.id);
          }
        });
      }
    }
    if (node.type === 'ocr') {
      const enabled = processing?.ocrExtract?.enabledTypes || [];
      enabled.forEach((t) => {
        if (t && step1Types.size && !step1Types.has(t)) {
          push('S2-14', 'ノード設定', `OCR 対象帳票「${t}」が Step1 にありません`, node.id);
        }
      });
    }
    if (node.type === 'data_mapping') {
      const ref = node.configRef || node.mappingConfigId || 'current_scene';
      if (!ref) push('S2-15', 'ノード設定', 'データマッピング設定が未選択です', node.id);
    }
  });
  if (errors.some((e) => e.dimension === 'ノード設定')) return { errors, blockedDimension: 'ノード設定' };

  // —— 变量引用 / 字段选择 S2-20～25 ——
  const varSceneCtx = {
    docTypes: sceneContext.docTypes
      || (sceneContext.documents || []).map((d) => d.type || d.docType).filter(Boolean),
    getDocSchema: sceneContext.getDocSchema,
    getDocLabel: sceneContext.getDocLabel,
  };
  const isContainerVarPath = (raw) => {
    const path = String(raw || '').replace(/^\{|\}$/g, '').trim();
    if (!path) return true;
    if (/^(case\.)?standardFields$/i.test(path) || /\.standardFields$/i.test(path)) return true;
    if (/^docTypes\[\]$/i.test(path) || /docTypes\[\]$/i.test(path)) return true;
    if (/^files\[\]$/i.test(path)) return true;
    return false;
  };
  const isDisabledConditionType = (opt, raw) => {
    const path = String(raw || '');
    const type = String(opt?.dataType || opt?.type || '').toLowerCase();
    if (type === 'array' || type === 'date' || type === 'datetime') return true;
    if (/files\[\]/i.test(path)) return true;
    if (opt?.nodeType === 'end' || /\.end\b|case\.finalResult|case\.endedAt/i.test(path) && opt?.nodeType === 'end') {
      return opt?.nodeType === 'end';
    }
    return false;
  };
  nodes.filter((n) => n.type === 'decision' && reachable.has(n.id)).forEach((node) => {
    const options = typeof buildCodeVariableOptions === 'function'
      ? buildCodeVariableOptions(wf, node.id, varSceneCtx)
      : [];
    (node.cases || []).forEach((decisionCase) => {
      (decisionCase.conditions || []).forEach((cond) => {
        const raw = String(cond?.variable || '').trim();
        if (!raw) return;
        if (typeof isDecisionStatusVariable === 'function' && isDecisionStatusVariable(raw)) {
          push('S2-26', '変数参照', `条件変数「${raw}」の status は条件に使用できません`, node.id, 'result または帳票フィールドを選択してください');
          return;
        }
        if (isContainerVarPath(raw)) {
          push('S2-24', 'フィールド選択', `条件左値「${raw}」は容器です。葉項目を選んでください`, node.id);
          return;
        }
        const opt = options.find((o) => o.value === raw
          || o.value === raw.replace(/^\{|\}$/g, '')
          || String(o.localId || '') === raw);
        if (isDisabledConditionType(opt, raw)) {
          push('S2-25', 'フィールド選択', `条件左値「${raw}」は条件に使えない型です`, node.id);
          return;
        }
        if (options.length && !opt) {
          push('S2-20', '変数参照', `条件変数「${raw}」が上流から到達できません（改線・削除後の無効参照含む）`, node.id, '削除・改線後に参照が残っていないか確認してください');
        }
      });
    });
  });
  if (errors.some((e) => e.dimension === '変数参照')) return { errors, blockedDimension: '変数参照' };
  if (errors.some((e) => e.dimension === 'フィールド選択')) return { errors, blockedDimension: 'フィールド選択' };

  // —— 依赖：HITL 上游 ——
  validateWorkflowTestHitlContext(wf).forEach((issue) => {
    push('S2-28', '依存', issue.message, issue.nodeId);
  });
  if (errors.some((e) => e.dimension === '依存')) return { errors, blockedDimension: '依存' };

  return { errors, blockedDimension: '' };
}

/** 按内置测试样例执行 Workflow 路径；人工确认用测试场景的预设判断结果选择出口 */
function simulateWorkflowTestExecutionPath(workflow, testCase) {
  const wf = workflow || { nodes: [], edges: [] };
  const edges = (wf.edges || []).filter((e) => !e.visualHidden);
  const nodeMap = Object.fromEntries((wf.nodes || []).map((n) => [n.id, n]));
  const start = (typeof getWorkflowStartNode === 'function' ? getWorkflowStartNode(wf) : null)
    || (wf.nodes || []).find((n) => n.type === 'start');
  if (!start) {
    return {
      pathIds: [],
      branchHits: {},
      error: { ruleId: 'S2-29', nodeId: '', message: '実行順序を決定できません' },
    };
  }
  const pathIds = [];
  const branchHits = {};
  const visited = new Set();
  let current = start.id;
  let guard = 0;
  while (current && guard < 200) {
    guard += 1;
    if (visited.has(current)) {
      // 回流：允许再经过，但须能推进；防止无限环
      const outs = edges.filter((e) => e.from === current);
      const unvisitedOut = outs.find((e) => !visited.has(e.to));
      if (!unvisitedOut) {
        return {
          pathIds,
          branchHits,
          error: {
            ruleId: 'S2-08',
            nodeId: current,
            message: '回流により終了ノードへ到達できない経路があります',
          },
        };
      }
      pathIds.push(current);
      current = unvisitedOut.to;
      continue;
    }
    visited.add(current);
    pathIds.push(current);
    const node = nodeMap[current];
    if (!node) {
      return {
        pathIds,
        branchHits,
        error: { ruleId: 'S2-29', nodeId: current, message: '実行順序上のノードが存在しません' },
      };
    }
    if (node.type === 'end') {
      return { pathIds, branchHits, error: null };
    }

    let nextEdge = null;
    if (node.type === 'decision') {
      const picked = pickWorkflowTestDecisionBranch(node, wf, testCase);
      if (!picked?.edge) {
        return {
          pathIds,
          branchHits,
          error: {
            ruleId: 'S2-29',
            nodeId: node.id,
            message: '条件分岐の出口を決定できません',
          },
        };
      }
      branchHits[node.id] = picked;
      nextEdge = picked.edge;
    } else if (node.type === 'hitl_gate') {
      const outs = edges.filter((e) => e.from === node.id && e.branch);
      if (!outs.length) {
        return {
          pathIds,
          branchHits,
          error: {
            ruleId: 'S2-30',
            nodeId: node.id,
            message: '人工確認の出口が接続されていないため、テストを継続できません',
          },
        };
      }
      nextEdge = outs.find((e) => e.branch === 'approve')
        || outs.find((e) => e.branch === 'pass')
        || outs[0];
      branchHits[node.id] = {
        branchKey: nextEdge.branch,
        edge: nextEdge,
        label: nextEdge.label || nextEdge.branch,
        simulatedHuman: true,
      };
    } else {
      const mainOuts = edges.filter((e) => e.from === node.id && !e.branch);
      const anyOuts = mainOuts.length ? mainOuts : edges.filter((e) => e.from === node.id);
      nextEdge = anyOuts[0] || null;
    }

    if (!nextEdge) {
      return {
        pathIds,
        branchHits,
        error: {
          ruleId: 'S2-29',
          nodeId: node.id,
          message: '次のノードへ進む出口がありません',
        },
      };
    }
    current = nextEdge.to;
  }
  return {
    pathIds,
    branchHits,
    error: {
      ruleId: 'S2-32',
      nodeId: pathIds[pathIds.length - 1] || '',
      message: '終了ノードへ到達できませんでした',
    },
  };
}

function validateWorkflowTestNotifySimulation(node, workflow, sceneContext = {}) {
  const wf = workflow || { nodes: [], edges: [] };
  const normalized = typeof normalizeNotifyNode === 'function' ? normalizeNotifyNode(node, wf) : node;
  const text = `${normalized?.subject || node.subject || ''}\n${normalized?.body || node.body || node.message || ''}`;
  const tokens = [...text.matchAll(/\{\{?\s*([^{}\s]+)\s*\}?\}/g)].map((m) => m[1]);
  if (!tokens.length) return '';
  const varSceneCtx = {
    docTypes: sceneContext.docTypes
      || (sceneContext.documents || []).map((d) => d.type || d.docType).filter(Boolean),
    getDocSchema: sceneContext.getDocSchema,
    getDocLabel: sceneContext.getDocLabel,
  };
  const options = typeof getNotifyVariableOptions === 'function'
    ? getNotifyVariableOptions(wf, node.id, sceneContext.verify || null, varSceneCtx)
    : [];
  if (!options.length) return '';
  const allowed = new Set(options.map((o) => String(o.value || '').replace(/^\{|\}$/g, '')));
  for (const token of tokens) {
    const bare = String(token || '').replace(/^\{|\}$/g, '');
    const short = bare.includes('.') ? bare.split('.').pop() : bare;
    if (['caseNo', 'caseLabel', 'caseStatus', 'caseId', 'missingDocuments', 'missingFields', 'errorMessage', 'finalResult'].includes(short)) {
      continue;
    }
    if (allowed.has(bare) || [...allowed].some((v) => v.endsWith(`.${short}`) || v === short)) continue;
    return `通知テンプレート変数「${token}」を置換できません`;
  }
  return '';
}


function buildWorkflowTestDecisionDetail(step, workflow, testCase = null) {
  const wf = workflow || { nodes: [], edges: [] };
  const node = (wf.nodes || []).find((n) => n.id === step.id);
  if (!node) return null;
  const variableOptions = typeof getDecisionVariableOptions === 'function'
    ? getDecisionVariableOptions(wf, node.id)
    : [];
  const outEdges = (wf.edges || []).filter((edge) => edge.from === node.id && !edge.visualHidden);
  const picked = testCase ? pickWorkflowTestDecisionBranch(node, wf, testCase) : null;
  const rows = [
    {
      label: '評価結果',
      value: picked
        ? (picked.matched ? `成立 → ${picked.label}` : `ELSE / 非成立 → ${picked.label}`)
        : '未評価',
    },
  ];
  const issues = [];
  let hitBranch = '';

  (node.cases || []).forEach((decisionCase, index) => {
    const branchKey = decisionCase.kind === 'if' || index === 0
      ? 'if'
      : (decisionCase.id || `elif_${index}`);
    const edge = outEdges.find((item) => item.branch === branchKey || item.branch === decisionCase.id);
    const preview = typeof getDecisionCaseCanvasPreview === 'function'
      ? getDecisionCaseCanvasPreview(node, decisionCase)
      : (typeof decisionConditionPreview === 'function'
        ? decisionConditionPreview(decisionCase, variableOptions)
        : (decisionCase.label || '条件未設定'));
    const branchLabel = decisionCase.label || (index === 0 ? 'IF' : `ELIF ${index}`);
    const sampleHit = picked?.branchKey === branchKey;
    const condEval = testCase
      ? (evaluateWorkflowTestDecisionCase(decisionCase, testCase) ? '真' : '偽')
      : '—';
    rows.push({
      label: branchLabel,
      value: `${preview || '条件未設定'}（評価: ${condEval}${sampleHit ? ' · 命中' : ''}）`,
    });
    if (sampleHit && edge) {
      const target = (wf.nodes || []).find((item) => item.id === edge.to);
      hitBranch = `${branchLabel} → ${target?.label || edge.to}`;
    }
  });

  if (node.elseLabel || outEdges.some((edge) => edge.branch === 'else')) {
    const elseEdge = outEdges.find((edge) => edge.branch === 'else');
    const elseTarget = elseEdge
      ? (wf.nodes || []).find((item) => item.id === elseEdge.to)
      : null;
    rows.push({
      label: 'ELSE',
      value: node.elseLabel || '条件に該当しない場合',
    });
    if (picked?.branchKey === 'else' && elseEdge) {
      hitBranch = `ELSE → ${elseTarget?.label || elseEdge.to}`;
    }
  }

  rows.splice(1, 0, {
    label: '命中分岐',
    value: hitBranch || picked?.label || '—',
  });

  if ((node.cases || []).some((decisionCase) => !decisionCase.conditions?.some((c) => c.variable))) {
    issues.push('条件分岐ノードに設定未完了の条件式があります。公開前に IF/ELIF 条件を確認してください。');
  }

  return {
    title: step.label || '条件分岐結果',
    rows,
    issues,
  };
}

function appendWorkflowTestDetailIssues(detail, step) {
  if (!detail) return detail;
  const issues = (detail.issues || [])
    .map((issue) => formatWorkflowTestUserMessage(issue))
    .filter(Boolean);
  const reason = formatWorkflowTestUserMessage(step?.errorReason);
  if (reason && !issues.includes(reason)) {
    issues.push(reason);
  }
  return { ...detail, issues };
}

function buildWorkflowTestNodeDetail(step, testCase, workflow = null) {
  const type = step?.type || '';
  const input = buildWorkflowTestInputContext(testCase);
  const tc = normalizeWorkflowTestCase(testCase);
  const fileCount = input.fileCount || 0;
  const ocrFieldCount = (tc.files || []).reduce((sum, f) => sum + Object.keys(f.ocrFields || {}).length, 0);
  const standardFieldCount = Object.keys(tc.standardFields || {}).length;
  const docTypeSummary = (() => {
    const map = {};
    (tc.files || []).forEach((f) => {
      if (!f.docType) return;
      map[f.docType] = (map[f.docType] || 0) + Object.keys(f.ocrFields || {}).length;
    });
    return Object.entries(map).map(([k, v]) => `${k} ${v}`).join(' / ') || '—';
  })();
  if (type === 'start') {
    return appendWorkflowTestDetailIssues({
      title: '開始ノード',
      rows: [
        { label: 'テスト案件', value: input.caseLabel || '—' },
        { label: 'テスト状態', value: '案件集約完了' },
        { label: '案件番号', value: input.caseNo },
        { label: '案件名', value: input.caseLabel },
        { label: '紐付ファイル', value: `${input.fileCount} 件` },
      ],
      issues: [],
    }, step);
  }
  if (type === 'preprocess') {
    return appendWorkflowTestDetailIssues({
      title: '前処理結果',
      rows: [
        { label: '成功ファイル', value: `${fileCount} / ${fileCount}` },
        { label: '失敗ファイル', value: '0' },
        { label: '対象ファイル例', value: (tc.files || []).slice(0, 3).map((f) => f.name).join('、') || '—' },
      ],
      issues: [],
    }, step);
  }
  if (type === 'ocr') {
    return appendWorkflowTestDetailIssues({
      title: 'OCR 抽出結果',
      rows: [
        { label: '抽出フィールド', value: `${ocrFieldCount} 件（用例）` },
        { label: '低信頼フィールド', value: '0 件' },
        { label: '帳票タイプ別', value: docTypeSummary },
        { label: '例：氏名', value: tc.standardFields?.氏名 || tc.files?.[0]?.ocrFields?.氏名 || '—' },
      ],
      issues: [],
    }, step);
  }
  if (type === 'data_mapping') {
    const fieldPreview = Object.entries(tc.standardFields || {})
      .slice(0, 4)
      .map(([k, v]) => `${k}=${v}`)
      .join('、');
    return appendWorkflowTestDetailIssues({
      title: 'データマッピング結果',
      rows: [
        { label: '標準フィールド', value: `${standardFieldCount} 件（用例）` },
        { label: '競合フィールド', value: '0 件' },
        { label: '未マッピング', value: '0 件' },
        { label: '値プレビュー', value: fieldPreview || '—' },
      ],
      issues: [],
    }, step);
  }
  if (type === 'ai_verify') {
    return appendWorkflowTestDetailIssues({
      title: 'AI 検証結果',
      rows: [
        { label: '総合判定', value: step.status === 'error' ? '失敗' : '通過（用例スナップショット）' },
        { label: '標準フィールド', value: `${standardFieldCount} 件` },
        { label: 'OCR フィールド', value: `${ocrFieldCount} 件` },
        { label: '必要書類', value: `${fileCount} ファイル` },
        { label: 'マッピング競合', value: '0 件' },
      ],
      issues: [],
    }, step);
  }
  if (type === 'decision') {
    return appendWorkflowTestDetailIssues(buildWorkflowTestDecisionDetail(step, workflow, testCase), step);
  }
  if (type === 'hitl_gate') {
    const branch = step.branchLabel || getWorkflowTestHitlBranchLabel(workflow, step.id);
    return appendWorkflowTestDetailIssues({
      title: '人工確認（テスト確認）',
      rows: [
        { label: '確認対象', value: step.label || '人工確認' },
        { label: 'テスト挙動', value: 'テストシナリオの判断結果で出口を選択' },
        { label: '実行しない内容', value: '人工確認タスク作成、審査者待ち、通知送信' },
        { label: '選択出口', value: branch || '—' },
      ],
      issues: [],
    }, step);
  }
  if (type === 'end') {
    return appendWorkflowTestDetailIssues({
      title: '出力結果',
      rows: [
        { label: 'テスト案件', value: tc.caseNo },
        { label: '実行結果', value: step.status === 'error' ? '終了未到達または失敗' : 'Workflow 終了まで到達' },
        { label: '出力フィールド', value: `OCR ${ocrFieldCount} / 標準 ${standardFieldCount}` },
      ],
      issues: [],
    }, step);
  }
  return null;
}

function getWorkflowTestHitlBranchLabel(workflow, nodeId) {
  const wf = workflow || { edges: [] };
  const edges = (wf.edges || []).filter((edge) => edge.from === nodeId && edge.branch && !edge.visualHidden);
  if (!edges.length) return '';
  const branch = edges.find((edge) => edge.branch === 'approve') || edges[0];
  const label = branch.label || getHitlGateBranchEdgeLabel(branch.branch);
  return label ? `分岐: ${label}` : '';
}

function workflowTestStepResultText(step, testCase) {
  const label = step.label || '';
  const type = step.type || '';
  const input = buildWorkflowTestInputContext(testCase);
  const summaries = {
    start: '案件集約済みスナップショットから Workflow を開始しました',
    preprocess: '画像補正・回転・画像整列を完了しました',
    ocr: '用例の OCR フィールドを読み込みました',
    data_mapping: '用例の標準フィールドへマッピングしました',
    ai_verify: 'AI 検証をテスト実行しました',
    decision: '用例フィールドで条件分岐を評価しました',
    hitl_gate: '人工確認をテストシナリオで判定し、出口へ進みました',
    notify: '通知ノードは Step2 テスト対象外です（送信なし）',
    end: 'Workflow を終了しました',
    mcp: '外部連携を完了しました',
    code: 'コード実行を完了しました',
  };
  return summaries[type] || `${label} を完了しました`;
}

function getWorkflowTestSceneContext(sceneContext) {
  return {
    processing: sceneContext?.processing || {},
    documents: sceneContext?.documents || [],
    scene: sceneContext?.scene || null,
    verify: sceneContext?.verify || null,
    docTypes: sceneContext?.docTypes
      || (sceneContext?.documents || []).map((d) => d.type || d.docType).filter(Boolean),
    getDocSchema: sceneContext?.getDocSchema,
    getDocLabel: sceneContext?.getDocLabel,
  };
}

function isWorkflowTestPreprocessConfigured(processing) {
  const img = processing?.image || {};
  return !!(img.rotate || img.perspective || img.split || img.sort);
}

function isWorkflowTestOcrConfigured(processing, documents) {
  const docs = documents || [];
  return (processing?.ocrExtract?.enabledTypes || [])
    .filter((type) => docs.some((doc) => doc.type === type))
    .length > 0;
}

function collectWorkflowTestBranchIssues(workflow) {
  const wf = workflow || { nodes: [], edges: [] };
  const edges = (wf.edges || []).filter((edge) => !edge.visualHidden);
  const issues = {};
  const mark = (nodeId, message) => {
    if (!issues[nodeId]) issues[nodeId] = message;
  };

  (wf.nodes || []).forEach((node) => {
    if (node.type === 'decision') {
      (node.cases || []).forEach((decisionCase, index) => {
        const branchKey = decisionCase.kind === 'if' || index === 0
          ? 'if'
          : (decisionCase.id || `elif_${index}`);
        if (!edges.some((edge) => edge.from === node.id && edge.branch === branchKey)) {
          mark(node.id, '分岐が未接続です');
        }
      });
      const needsElse = !!(node.elseLabel || edges.some((edge) => edge.from === node.id && edge.branch === 'else'));
      if (needsElse && !edges.some((edge) => edge.from === node.id && edge.branch === 'else')) {
        mark(node.id, '分岐が未接続です');
      }
    }
    if (node.type === 'hitl_gate') {
      const connected = typeof getHitlGateConnectedBranchKeys === 'function'
        ? getHitlGateConnectedBranchKeys(wf, node.id)
        : (wf.edges || [])
          .filter((e) => e.from === node.id && e.branch && !e.visualHidden)
          .map((e) => e.branch);
      if (!connected.length) {
        mark(node.id, '分岐が未接続です');
      }
    }
  });
  return issues;
}

function analyzeWorkflowTestCanvas(workflow) {
  const wf = workflow || { nodes: [], edges: [] };
  const nodes = wf.nodes || [];
  const edges = (wf.edges || []).filter((edge) => !edge.visualHidden);
  const reachableIds = getWorkflowTestReachableNodeIds(wf);
  const reachable = new Set(reachableIds);
  const startNodes = nodes.filter((node) => node.type === 'start');
  const endNodes = nodes.filter((node) => node.type === 'end');
  const branchIssues = collectWorkflowTestBranchIssues(wf);
  const canvasHighlights = [];

  nodes.forEach((node) => {
    if (node.type === 'start' || node.type === 'end') return;
    const hasIn = edges.some((edge) => edge.to === node.id);
    const hasOut = edges.some((edge) => edge.from === node.id);
    if (!hasIn && !hasOut) {
      canvasHighlights.push({
        nodeId: node.id,
        kind: 'isolated',
        message: '接続のないノードがあります',
      });
      return;
    }
    if (!reachable.has(node.id)) {
      canvasHighlights.push({
        nodeId: node.id,
        kind: 'unreachable',
        message: '開始ノードから到達できません',
      });
    }
  });

  const timelineIssues = { ...branchIssues };
  if (startNodes.length > 1) {
    const primaryStart = typeof getWorkflowStartNode === 'function'
      ? getWorkflowStartNode(wf)
      : startNodes[0];
    if (primaryStart?.id) {
      timelineIssues[primaryStart.id] = '開始ノードが複数あります';
    }
  }

  return {
    canvasHighlights,
    timelineIssues,
    branchIssues,
    hasEndNode: endNodes.length > 0,
    multipleStartNodes: startNodes.length > 1,
  };
}

function validateWorkflowTestNodeConfig(workflow, step, sceneContext = {}) {
  const wf = workflow || { nodes: [], edges: [] };
  const node = (wf.nodes || []).find((item) => item.id === step.id);
  if (!node) return '';
  const { processing, documents } = getWorkflowTestSceneContext(sceneContext);

  switch (node.type) {
    case 'preprocess':
      if (!isWorkflowTestPreprocessConfigured(processing)) {
        return '前処理オプションを1件以上有効にしてください';
      }
      return '';
    case 'ocr':
      if (!isWorkflowTestOcrConfigured(processing, documents)) {
        return 'OCR 対象帳票を1件以上有効にしてください';
      }
      return '';
    case 'ai_verify': {
      if (typeof normalizeAiVerifyNode !== 'function' || typeof AI_VERIFY_MODULE_OPTIONS === 'undefined') {
        return '';
      }
      const normalized = normalizeAiVerifyNode(node, wf);
      const enabledCount = AI_VERIFY_MODULE_OPTIONS
        .filter((opt) => normalized.moduleEnabled?.[opt.key] !== false).length;
      if (!enabledCount) return '検証モジュールを1件以上有効にしてください';
      return '';
    }
    case 'decision': {
      const hasEmptyBranch = (node.cases || []).some((decisionCase) =>
        !(decisionCase.conditions || []).some((cond) => cond.variable));
      if (hasEmptyBranch) return '条件分岐ノードに設定未完了の条件式があります';
      return '';
    }
    case 'hitl_gate':
      return '';
    case 'code':
      return '';
    default:
      return '';
  }
}

function workflowTestStepErrorReason(step, workflow, sceneContext, canvasAnalysis) {
  const timelineIssue = canvasAnalysis?.timelineIssues?.[step.id];
  const configIssue = validateWorkflowTestNodeConfig(workflow, step, sceneContext);
  return timelineIssue || configIssue || '';
}

function getWorkflowTestReachableNodeIds(workflow) {
  const wf = workflow || { nodes: [], edges: [] };
  if (!wf.nodes?.length) return [];
  const nodeMap = Object.fromEntries(wf.nodes.map((node) => [node.id, node]));
  const start = (typeof getWorkflowStartNode === 'function' ? getWorkflowStartNode(wf) : null) || wf.nodes[0];
  const visited = new Set();
  const ids = [];
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id) || !nodeMap[id]) continue;
    visited.add(id);
    ids.push(id);
    (wf.edges || [])
      .filter((edge) => edge.from === id && !edge.visualHidden)
      .forEach((edge) => queue.push(edge.to));
  }
  return ids;
}

function buildWorkflowTestSteps(workflow, testCase, sceneContext = {}) {
  const wf = workflow || { nodes: [], edges: [] };
  const nodeMap = Object.fromEntries((wf.nodes || []).map((node) => [node.id, node]));
  const cycleNodeIds = typeof getWorkflowCycleNodeIds === 'function'
    ? getWorkflowCycleNodeIds(wf)
    : new Set();
  const gate = collectWorkflowTestDimensionErrors(wf, testCase, sceneContext);
  const makeStep = (id, overrides = {}) => {
    const node = nodeMap[id] || {};
    const base = {
      id,
      label: node.label || (typeof getWorkflowNodeMeta === 'function'
        ? getWorkflowNodeMeta(node.type).title
        : node.type),
      type: node.type || 'custom',
      status: 'pending',
      onCycle: cycleNodeIds.has(id),
      summary: '未実行',
      errorReason: '',
      needsHuman: false,
      ruleId: '',
      dimension: '',
      branchLabel: '',
    };
    return { ...base, ...overrides };
  };

  const formatGateError = (err) => {
    if (!err) return 'テスト前チェックに失敗しました';
    const hint = err.hint ? `（${err.hint}）` : '';
    return formatWorkflowTestUserMessage(`${err.message}${hint}`);
  };

  // 前层门禁失败：不进入测试执行；错误节点标失败，其余保持未実行
  if (gate.blockedDimension) {
    const first = gate.errors[0];
    const start = (typeof getWorkflowStartNode === 'function' ? getWorkflowStartNode(wf) : null)
      || (wf.nodes || []).find((n) => n.type === 'start');
    const steps = [];
    if (start && start.id !== first?.nodeId) {
      steps.push(makeStep(start.id, {
        status: 'success',
        summary: workflowTestStepResultText({ type: 'start', label: start.label }, testCase),
      }));
    }
    const errorId = first?.nodeId || 'gate';
    if (!nodeMap[errorId] && errorId === 'gate') {
      steps.push({
        id: 'gate',
        label: first?.dimension === 'テスト入力' ? 'テスト入力チェック' : 'テスト前チェック',
        type: 'custom',
        status: 'error',
        onCycle: false,
        summary: formatGateError(first),
        errorReason: formatGateError(first),
        needsHuman: false,
        ruleId: first?.ruleId || '',
        dimension: first?.dimension || gate.blockedDimension,
        branchLabel: '',
        dimensionErrors: gate.errors,
      });
    } else {
      steps.push(makeStep(errorId, {
        status: 'error',
        summary: formatGateError(first),
        errorReason: formatGateError(first),
        ruleId: first?.ruleId || '',
        dimension: first?.dimension || gate.blockedDimension,
        dimensionErrors: gate.errors,
      }));
    }
    return steps;
  }

  const sim = simulateWorkflowTestExecutionPath(wf, testCase);
  const pathIds = sim.pathIds || [];
  if (!pathIds.length) {
    return [makeStep((wf.nodes || [])[0]?.id || 'empty', {
      status: 'error',
      summary: formatWorkflowTestUserMessage(sim.error?.message || '実行順序を決定できません'),
      errorReason: formatWorkflowTestUserMessage(sim.error?.message || '実行順序を決定できません'),
      ruleId: sim.error?.ruleId || 'S2-29',
      dimension: 'テスト実行',
    })];
  }

  const steps = [];
  for (let i = 0; i < pathIds.length; i += 1) {
    const id = pathIds[i];
    const node = nodeMap[id];
    if (!node) continue;
    let status = 'success';
    let errorReason = '';
    let ruleId = '';
    let dimension = '';
    let branchLabel = '';

    if (sim.error && sim.error.nodeId === id) {
      status = 'error';
      errorReason = formatWorkflowTestUserMessage(sim.error.message);
      ruleId = sim.error.ruleId || 'S2-29';
      dimension = 'テスト実行';
    }

    if (!errorReason && node.type === 'hitl_gate') {
      const hit = sim.branchHits?.[id];
      branchLabel = hit?.label
        || getWorkflowTestHitlBranchLabel(wf, id)
        || (hit?.branchKey ? `分岐: ${hit.branchKey}` : '');
    }

    if (!errorReason && node.type === 'decision') {
      const hit = sim.branchHits?.[id];
      if (hit?.label) branchLabel = `命中: ${hit.label}`;
    }

    if (!errorReason && node.type === 'end' && sim.error && !sim.error.nodeId) {
      status = 'error';
      errorReason = formatWorkflowTestUserMessage(sim.error.message);
      ruleId = sim.error.ruleId || 'S2-32';
      dimension = 'テスト実行';
    }

    let summary = status === 'pending'
      ? '未実行'
      : workflowTestStepResultText({ id, type: node.type, label: node.label }, testCase);
    if (node.type === 'hitl_gate' && branchLabel) {
      summary = `${summary}（${branchLabel}）`;
    }
    if (node.type === 'decision' && branchLabel && status !== 'error') {
      summary = `${summary}（${branchLabel}）`;
    }
    if (cycleNodeIds.has(id) && status !== 'pending') {
      summary += '（環状パス上のノード）';
    }
    if (status === 'error') summary = errorReason;

    steps.push(makeStep(id, {
      status,
      summary,
      errorReason,
      ruleId,
      dimension,
      branchLabel,
      needsHuman: false,
    }));

    // テスト実行失败即停：后续路径节点不再列入成功；动画侧依赖 status=error 停止
    if (status === 'error') break;
  }

  // 若路径未到 end 且循环结束无显式 error，补终了失败
  const last = steps[steps.length - 1];
  if (last && last.type !== 'end' && last.status !== 'error') {
    const msg = sim.error
      ? formatWorkflowTestUserMessage(sim.error.message)
      : '終了ノードへ到達できませんでした';
    last.status = 'error';
    last.errorReason = msg;
    last.ruleId = sim.error?.ruleId || 'S2-32';
    last.dimension = 'テスト実行';
    last.summary = msg;
  }

  return steps;
}

/** 终了节点结构与到达要件（并入工作流测试；勿在测试外再挂一层门禁） */
function validateWorkflowEndRequirements(workflow) {
  const wf = workflow || { nodes: [], edges: [] };
  const edges = (wf.edges || []).filter((edge) => !edge.visualHidden);
  const endNodes = (wf.nodes || []).filter((node) => node.type === 'end');
  if (!endNodes.length) return '終了ノードを1件以上配置してください';
  const analysis = analyzeWorkflowTestCanvas(wf);
  const branchIssue = Object.values(analysis.branchIssues || {})[0];
  if (branchIssue) return `終了ノード到達要件を満たしていません：${branchIssue}`;
  const reachableIds = typeof getWorkflowTestReachableNodeIds === 'function'
    ? getWorkflowTestReachableNodeIds(wf)
    : [];
  const reachable = new Set(reachableIds);
  if (reachable.size && !endNodes.some((node) => reachable.has(node.id))) {
    return '開始ノードから終了ノードへ到達できません';
  }
  if (analysis.canvasHighlights.some((item) => item.kind === 'unreachable' || item.kind === 'isolated')) {
    return '終了ノード到達要件を満たしていません：未接続または到達不能なノードがあります';
  }
  return '';
}

function buildWorkflowTestSummary(steps, testCase, workflow, sceneContext = {}) {
  const list = steps || [];
  const wf = workflow || { nodes: [], edges: [] };
  const canvasAnalysis = analyzeWorkflowTestCanvas(wf);
  const passed = list.filter((step) => step.status === 'success').length;
  const errorStep = list.find((step) => step.status === 'error');
  const hasError = !!errorStep;
  const stoppedEarly = hasError && list.some((step) => step.status === 'pending');
  const endStep = [...list].reverse().find((step) => step.type === 'end');
  const reachedEnd = !!endStep && endStep.status === 'success';
  const dimensionErrors = errorStep?.dimensionErrors
    || (errorStep ? [{
      ruleId: errorStep.ruleId || '',
      dimension: errorStep.dimension || '',
      message: errorStep.errorReason || '',
      nodeId: errorStep.id,
    }] : []);
  let overallStatus = 'success';
  let overallLabel = '成功';
  // S2-33：以时间线结论为准（门禁错误已写入 error 步骤）；不再用画布次要高亮单独否决已测通路径
  if (hasError) {
    overallStatus = 'error';
    overallLabel = stoppedEarly ? '失敗（停止）' : '失敗';
  } else if (!reachedEnd) {
    overallStatus = 'error';
    overallLabel = '終了未到達';
  }
  const input = buildWorkflowTestInputContext(testCase);
  const structureMessages = [
    ...dimensionErrors.map((e) => formatWorkflowTestUserMessage(e.message)).filter(Boolean),
    ...canvasAnalysis.canvasHighlights.map((item) => formatWorkflowTestUserMessage(item.message)),
  ].filter(Boolean);
  const uniqueNotes = [...new Set(structureMessages.filter(Boolean))];
  const failHighlights = errorStep?.id
    ? [{ nodeId: errorStep.id, kind: 'test_error', message: errorStep.errorReason || '' }]
    : canvasAnalysis.canvasHighlights;
  return {
    overallStatus,
    overallLabel,
    durationSec: Math.max(1, Math.round(list.length * 0.4 * 10) / 10),
    passedCount: passed,
    totalCount: list.length,
    workflowNodeCount: list.length,
    inputFileCount: input.fileCount,
    reachedEnd,
    canvasHighlights: failHighlights,
    dimensionErrors,
    structureNote: uniqueNotes.length
      ? `エラー：${uniqueNotes.slice(0, 3).join('、')}`
      : '',
    endRequirementError: errorStep?.errorReason || '',
  };
}

function buildWorkflowTestArtifacts(testCase) {
  return {
    input: buildWorkflowTestInputContext(testCase),
  };
}

const WORKFLOW_TEST_HITL_CONTEXT_RULES = {
  preprocess: { label: '前処理確認', allowedTypes: ['preprocess'] },
  ocr: { label: 'OCR結果確認', allowedTypes: ['ocr'] },
  verification: { label: 'AI検証確認', allowedTypes: ['ai_verify'] },
};

function collectWorkflowTestHitlSourceTypes(workflow, hitlNodeId) {
  const wf = workflow || { nodes: [], edges: [] };
  const nodeMap = Object.fromEntries((wf.nodes || []).map((node) => [node.id, node]));
  const visited = new Set();
  const sources = [];
  const queue = (wf.edges || []).filter((edge) => edge.to === hitlNodeId).map((edge) => edge.from);
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = nodeMap[id];
    if (!node) continue;
    if (node.type === 'decision') {
      (wf.edges || []).filter((edge) => edge.to === id).forEach((edge) => queue.push(edge.from));
      continue;
    }
    sources.push(node);
  }
  return sources;
}

function validateWorkflowTestHitlContext(workflow) {
  const wf = workflow || { nodes: [], edges: [] };
  const hitlNodes = (wf.nodes || []).filter((node) => node.type === 'hitl_gate');
  const nodeMap = Object.fromEntries((wf.nodes || []).map((node) => [node.id, node]));
  const issues = [];
  const allowedTypes = ['preprocess', 'ocr', 'ai_verify'];
  hitlNodes.forEach((node) => {
    const sources = typeof collectHitlUpstreamSources === 'function'
      ? collectHitlUpstreamSources(wf, node.id)
      : collectWorkflowTestHitlSourceTypes(wf, node.id);
    const matched = sources.some((source) => allowedTypes.includes(source.type));
    if (!matched) {
      const sourceLabels = sources.length
        ? sources.map((source) => source.label || source.type).join('、')
        : '上流ノードなし';
      issues.push({
        nodeId: node.id,
        message: `${node.label || '人工確認'}：条件ノードを挟んだ直前上流が前処理・OCR・AI検証のいずれかになるよう接続してください。現在の上流は ${sourceLabels} です。`,
      });
    }
    const supplementEdge = (wf.edges || []).find((edge) => (
      edge.from === node.id
      && normalizeHitlGateActionValue(edge.branch) === 'request_supplement'
      && !edge.visualHidden
    ));
    if (!supplementEdge) {
      issues.push({
        nodeId: node.id,
        message: `${node.label || '人工確認'}：補件出口を前述ノードへ回流接続してください。`,
      });
    } else if (!workflowCanReach(wf, supplementEdge.to, node.id, supplementEdge)) {
      const target = nodeMap[supplementEdge.to];
      issues.push({
        nodeId: node.id,
        message: `${node.label || '人工確認'}：補件出口は前述ノードへ回流接続してください。現在の接続先は ${target?.label || supplementEdge.to} です。`,
      });
    }
  });
  return issues;
}

function buildWorkflowTestDiagnostics(workflow) {
  const wf = workflow || { nodes: [], edges: [] };
  const nodeLabels = (wf.nodes || []).map((node) => node.label || node.type);
  const hitlIssues = validateWorkflowTestHitlContext(wf);
  const canvasAnalysis = analyzeWorkflowTestCanvas(wf);
  const cycleNodeIds = typeof getWorkflowCycleNodeIds === 'function'
    ? getWorkflowCycleNodeIds(wf)
    : new Set();
  const structureLines = canvasAnalysis.canvasHighlights.map((item) => item.message);
  return {
    variableRefs: nodeLabels.length
      ? '未生成ノードまたは存在しない帳票タイプ・フィールドへの変数参照は検出されませんでした。'
      : 'Workflow ノードが未設定のため、変数参照チェックをスキップしました。',
    branchChecks: (() => {
      const parts = [];
      const branchIssueCount = Object.keys(canvasAnalysis.branchIssues).length;
      if (branchIssueCount) {
        parts.push(`未接続分岐を ${branchIssueCount} ノードで検出しました。`);
      } else if ((wf.edges || []).some((edge) => edge.branch)) {
        parts.push('IF/ELSE 分岐先・入力値・型不一致は検出されませんでした。');
      } else {
        parts.push('条件分岐ノードがないため、分岐チェックをスキップしました。');
      }
      if (cycleNodeIds.size) {
        parts.push(`環状パスを ${cycleNodeIds.size} ノードで検出しました（回流は許可・公開可）。`);
      }
      return parts.join('\n');
    })(),
    hitlContext: hitlIssues.length
      ? hitlIssues.map((issue) => issue.message).join('\n')
      : '人工確認ノードの上流接続に問題は検出されませんでした。',
    structureChecks: structureLines.length
      ? structureLines.join('\n')
      : '孤立ノード・不可達ノードは検出されませんでした。',
    hasError: hitlIssues.length > 0 || canvasAnalysis.canvasHighlights.length > 0
      || Object.keys(canvasAnalysis.branchIssues).length > 0,
  };
}
