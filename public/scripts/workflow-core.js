const { createApp, ref, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick } = Vue;

const PROTOTYPE_BUILD = '636-workflow-test-clean-display';

const WF_ZOOM_MIN = 0.25;
const WF_ZOOM_MAX = 2;
const WF_ZOOM_STEP = 1.25;

const NODE_ORDER = ['scene', 'input', 'image', 'ocr', 'master', 'verify', 'hitl', 'output'];

const WF_NODE_GAP = 72;

const MODULE_PAGE_META = {
  'fixed-doc': {
    title: '帳票タイプ設定',
    subtitle: '帳票タイプごとの OCR テンプレート・抽出フィールド',
  },
  'data-mapping-config': {
    title: 'データマッピング設定',
    subtitle: '全案件共通の標準フィールド・OCR フィールド対応・競合処理を管理',
  },
  'master-match-config': {
    title: 'マスタデータ設定',
    subtitle: 'マスタデータ・列・インポート・ベクトル化状態を管理',
  },
  'ai-verify-config': {
    title: 'AI検証設定',
    subtitle: '必須フィールド・必要書類・テキスト・データ・署名押印を業務シーン単位で管理',
  },
  'case-workflow': {
    title: '案件シーン設定',
    subtitleConfigure: '設定モード：Workflow 固定・ノード内パラメータのみ変更',
    subtitleEdit: '編集モード：ノード追加・削除・接続を自由に変更',
    templateNote: '開始ノード（入力）から 前処理 → OCR → 外部API → AI検証 → 出力 の順を推奨。編集モードで N キーまたはツールバー + でノード追加。',
    connectHint: '出力ポートをドラッグして任意ノードへ接続します。上流への回流も可能です。ノード前後または接続線上の + でノードを追加・挿入できます。',
    flowKey: 'case',
  },
};

/** Inspector セクションタイトル横 ? ツールチップ用（本文は編集欄に表示しない） */
const INSPECTOR_HINTS = {
  edgeEdit: '接続線をクリックで選択（ハイライト）。Backspace / Delete で削除できます。出力ポートをドラッグして再接続できます。',
  connect: '出力ポートをドラッグして任意ノードの入力ポートへ接続します。上流ノードへの回流も可能です。接続線上の + で途中にノードを挿入できます。',
  scene: '業務シーン作成時、またはステップ1で関連帳票・案件集約・帳票間関連を設定します。',
  inputSetting: '画面上アップロードまたは APIアップロードでファイルを受け付けます。APIアップロードを有効にした場合はエンドポイント URL を指定します。',
  inputLimits: 'ファイル形式・最大ファイルサイズ（上限 20MB・それ以下のみ）を指定します。',
  preprocess: 'OCR 前に画像補正、画像回転、画像整列を実行します。\n\n・画像補正：歪み・傾きの補正。対象帳票未指定時は全帳票タイプが対象。\n・画像回転：スキャン方向の自動補正。対象帳票未指定時は全帳票タイプが対象。\n・画像整列：同一帳票タイプ内の画像を整列。',
  fraudDetect: '帳票画像の改ざん・偽造リスクを判定します。PS 加工痕跡、AI 生成画像、テンプレート特徴不一致などを統合検知し、帳票タイプごとに実行有無を切り替えます。',
  ocrSetting: '抽出フィールド・Prompt・信頼度閾値などの詳細は帳票 template またはシステムモデル設定で管理します。',
  ocrExtract: 'Step1で関連付けた帳票タイプを参照します。帳票タイプごとにOCR抽出の実行有無を選択し、抽出項目は「帳票タイプ設定」で編集します。',
  qrRead: 'QR 解析ルールは帳票タイプ設定 Step2（QR読取）で編集。OCR 抽出設定から帳票タイプ設定へ移動できます。',
  piiMask: 'マスク対象フィールドは帳票タイプ設定 Step2（AI読取設定）で編集。帳票タイプごとに実行有無を切替。',
  dataMapping: 'データマッピング設定で定義したルールをこの Workflow で呼び出します。ルールの確認・編集はデータマッピング設定から行います。',
  dataMappingRules: '入力フィールド、標準フィールド、変換ルールを定義します。後続ノードは標準フィールド名で参照できます。',
  dataMappingStandard: '標準データモデルで利用する項目です。案件データセット、照合、検証、エクスポートの共通キーになります。',
  nodeOutput: '後続ノード・IF/ELSE 条件で使える出力変数です。{ノード変数名.項目} 形式で指定します。',
  nodeOutputPreprocess: '処理状態と処理結果を出力します。状態は実行の成否、結果は業務上の通過/要確認です。',
  nodeOutputOcr: '処理状態と処理結果を出力します。状態は実行の成否、結果は業務上の通過/要確認です。',
  nodeOutputVerify: '処理状態と処理結果を出力します。状態は実行の成否、結果は業務上の通過/要確認です。',
  nodeOutputStart: '案件 ID（caseId）とファイル一覧（files[]）のみ。帳票タイプは条件ノードで Step1 から直接選択。',
  nodeOutputEnd: '終了ノードは出力変数なし。設定項目なし。',
  nodeOutputHitl: '人工確認の処理状態（hitlStatus）のみ。分岐は画布三出口で直接接続。',
  nodeOutputQrRead: 'QR 読取の処理状態（qrReadStatus）のみ。解析結果は OCR フィールドへ反映し、要確認は OCR と同様 HITL へ進みます。',
  nodeOutputFraudDetect: '処理状態（fraudDetectStatus）と処理結果（fraudDetectResult）を出力します。\n\n・処理状態：ノード実行の成否（processing / success / failed）。対象外帳票は success。\n・処理結果：業務結論（passed / reviewRequired）。不正疑い検知時は reviewRequired となり、条件分岐または人工確認へ進めます。リスク閾値はシステム固定（70）。',
  nodeOutputPiiMask: '個人情報マスクの処理状態（piiMaskStatus）のみ。マスク結果はファイル／フィールド内容へ反映します。',
  dataMappingOutput: '処理状態と標準変数を出力します。標準フィールドは条件選択時に葉項目として参照します。',
  externalApiIo: '前工程から自動連携される入力です。',
  knowledgeSelect: 'ナレッジデータソースを選択します。+ ボタンから新規作成（文書アップロード / Web Site API）ができます。',
  knowledgeRetrieval: 'Vector Search の類似度・Top N・参照文字数上限を設定します（Dify Knowledge Retrieval 相当）。',
  knowledgeOutput: '検索結果として後続ノードへ渡される出力変数です。',
  externalApiConfig: '検索パラメータを設定します。',
  externalApiOutput: '検索結果として後続ノードへ渡される出力変数です。',
  masterKnowledge: '照合に使用する内部マスタ辞書を選択します。辞書の項目定義は辞書設定で管理します。',
  masterApi: 'リトライ回数・キャッシュ TTL・例外時の動作を指定します。',
  masterRules: '登録済み照合ルールの一覧です。下のフォームから追加・編集できます。',
  masterRuleAdd: '帳票タイプ・照合元 OCR 項目・照合先・出力フィールドを指定してルールを追加します。',
  aiVerify: 'AI検証設定で定義した検証ルールを参照します。検証項目ごとに実行有無を選択し、検証ルールは「AI検証設定」で編集します。',
  completeness: '必須・任意帳票の収集状態と、帳票ごとの必須項目を検証します。帳票タイプは業務シーン設定で登録し、ここで必須/任意と必須項目を指定します。',
  textVerify: '自然言語で記述し、AI補助で実行式を生成します。入力欄の下にプレビューが表示されます。',
  dataVerify: '帳票間の整合性と業務ロジックを自然言語で記述し、AI補助で実行式をプレビュー表示します。',
  seal: '署名・印鑑が存在するかを検出します。帳票タイプごとに検出目標と類似度閾値を設定できます。閾値未満は不備として扱います。',
  hitlGate: '案件単位の人工確認タスクを生成します。「完了」は後続ノードに接続し、「補件」は上流ノードに戻るよう接続します。「案件中止」は画面上にのみ表示され、ノードには接続できません。',
  hitlContext: '前処理・OCR 抽出・AI 検証の要確認分岐に接続すると、確認対象が自動判定されます。条件分岐を挟んだ接続にも対応します。',
  decision: 'IF / ELIF / ELSE を変数・演算子で自由に設定します。上流ノードの出力変数を選択して分岐条件を組み立てます。',
  decisionContext: '案件就緒・検証結果・処理完了など、分岐の業務意味を選びます。変更時は既定条件で上書きされます。',
  decisionElseLabel: '接続線ラベルや実行ログに表示される名称です。',
  decisionOutputVar: '分岐名は後続ノードの条件式で参照できます。',
  fraud_detect: '帳票画像の改ざん・偽造リスクを判定します。帳票タイプごとに実行有無を切り替えます。',
  startTriggers: 'システム固定入口。設定項目はありません。',
  endTriggers: 'Workflow の終点。設定項目・出力変数はありません。',
  startTriggerSchedule: 'スケジュール起動は現在バージョンでは未対応です。',
  code: '入力変数を追加し、参照する上流ノードの変数を選択します。入力変数はJavaScript内で参照し、処理結果はreturnで返します。戻り値は本ノードの実行結果として扱い、後続ノードから参照できる出力変数には登録しません。',
  codeInput: '入力変数は条件ノードと同じ変数選択器から選択します。開始ノードの caseId / files[] も選択できます。',
  codePython: 'JavaScript の関数本文として記述します。入力変数は inputs.変数名 または inputs["変数名"] で参照します。',
  codeOutput: 'ノードの出力変数には処理状態の codeStatus のみ表示します。スクリプトの戻り値は出力変数には表示されません。',
  hitlLegacy: '前処理・OCR抽出・外部API連携・AI検証・出力の各ノードで HITL が発生した場合の復核ロールを設定します。',
  output: '自動エクスポート設定です。命名規則・ファイル形式・出力フィールドを指定します。',
  outputFields: 'OCR 抽出フィールドの出力有無と順序を設定します。',
  outputNaming: '貴社命名規則の詳細（チューリッヒ様提供予定）に合わせてテンプレートを調整します。',
  outputExport: '文字エンコーディング・Excel 出力形式などエクスポートファイルの設定です。',
  outputApi: 'エクスポート完了後、抽出結果を外部 API へ送信します。',
  caseLinkDocs: '主帳票を1件選択し、その他の帳票を関連帳票として扱います。',
  caseLinkAggregate: '主帳票と関連帳票の紐付けを管理します。',
  docFieldLinks: '任意の帳票間でフィールド関連を設定します。主帳票を介さない副帳票同士の関連も可能です。',
  docFieldNetwork: '主帳票を中央に配置し、主帳票のフィールドから関連帳票へ矢印を表示します。',
  sceneMatching: 'マッチング優先度を指定します。',
  sceneMatchingDefaults: '既定動作：補件ファイルは既存案件に紐付け、マスタなしファイルは保留プールへ送ります（本画面では変更できません）。',
};

const CASE_WORKFLOW_TEMPLATE_VERSION = 31;
const CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION = 27;
const WF_LAYOUT_PAD = { x: 72, y: 132 };
const WF_BRANCH_LANE_GAP = 108;
const WF_LAYOUT_MIN_EDGE_GAP = 112;
const STRAIGHT_CASE_WORKFLOW_NODE_IDS = [
  'wf-start', 'wf-pp', 'wf-d-pre', 'wf-oc', 'wf-d-ocr',
  'wf-map', 'wf-ai', 'wf-d-final', 'wf-hu-pre', 'wf-hu-ocr', 'wf-hu-final', 'wf-end',
];

const DEFAULT_CASE_WORKFLOW_TEMPLATE_NODE_IDS = [
  'wf-pp', 'wf-d-pre', 'wf-oc', 'wf-d-ocr',
  'wf-map', 'wf-ai', 'wf-d-final', 'wf-hu-pre', 'wf-hu-ocr', 'wf-hu-final',
];

const PREVIOUS_CASE_WORKFLOW_TEMPLATE_NODE_IDS = [
  'wf-intake', 'wf-d-quality', 'wf-d-ocr', 'wf-logic', 'wf-auto', 'wf-d-audit',
  'wf-hu-quality', 'wf-hu-audit', 'wf-hu-prelim',
];

const PREVIOUS_V6_CASE_WORKFLOW_TEMPLATE_NODE_IDS = [
  'wf-pp', 'wf-hu-pre', 'wf-oc', 'wf-hu-ocr', 'wf-map', 'wf-ai',
  'wf-d-final', 'wf-n-ok', 'wf-hu-final',
];

const LEGACY_CASE_WORKFLOW_TEMPLATE_NODE_IDS = [
  'wf-pp', 'wf-oc', 'wf-hu-oc', 'wf-d-ready', 'wf-wait', 'wf-n-def',
  'wf-mcp', 'wf-ms', 'wf-ai', 'wf-d-verify', 'wf-hu-verify',
  'wf-d-done', 'wf-n-supp', 'wf-out',
];

/** 主処理チェーンの推奨順序（Dify Start → 処理ノード） */
const WORKFLOW_MAIN_CHAIN_ORDER = [
  { type: 'preprocess', label: '前処理', step: 1 },
  { type: 'fraud_detect', label: '画像不正検知', step: 2 },
  { type: 'ocr', label: 'OCR抽出', step: 3 },
  { type: 'data_mapping', label: 'データマッピング', step: 4 },
  { type: 'ai_verify', label: 'AI検証', step: 5 },
];

const WORKFLOW_MAIN_CHAIN_TYPE_ORDER = Object.fromEntries(
  WORKFLOW_MAIN_CHAIN_ORDER.map((item, idx) => [item.type, idx]),
);

/** 処理ノード（制御・ナレッジ以外） */
const WORKFLOW_PROCESSING_NODE_TYPES = new Set([
  'preprocess', 'fraud_detect', 'ocr', 'ai_verify', 'data_mapping', 'pii_mask', 'code',
]);

/** ノード出力変数の既定名（IF/ELSE で {varName}.result として参照） */
const WORKFLOW_NODE_DEFAULT_VAR = {
  preprocess: 'preprocess',
  fraud_detect: 'fraud_detect',
  ocr: 'ocr',
  data_mapping: 'data_mapping',
  ai_verify: 'verify',
  pii_mask: 'pii_mask',
  code: 'code',
};

function getWorkflowNodeDefaultVarName(type) {
  return WORKFLOW_NODE_DEFAULT_VAR[type] || type;
}

function slugifyWorkflowVarName(id) {
  if (!id) return '';
  let slug = String(id).trim().replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (slug && /^\d/.test(slug)) slug = `n_${slug}`;
  return slug;
}

function autoGenerateWorkflowNodeVarName(node, workflow = null) {
  if (!node) return '';
  const fromId = slugifyWorkflowVarName(node.id);
  if (fromId) return fromId;
  const base = getWorkflowNodeDefaultVarName(node.type);
  if (!workflow?.nodes?.length) return base;
  const sameType = workflow.nodes.filter((n) => n.type === node.type);
  if (sameType.length <= 1) return base;
  const idx = sameType.findIndex((n) => n.id === node.id);
  return idx > 0 ? `${base}_${idx + 1}` : base;
}

function ensureWorkflowNodeVarName(node, workflow = null) {
  if (!node || !WORKFLOW_PROCESSING_NODE_TYPES.has(node.type)) return node;
  return { ...node, varName: autoGenerateWorkflowNodeVarName(node, workflow) };
}

function getWorkflowNodeVarName(node, workflow = null) {
  return autoGenerateWorkflowNodeVarName(node, workflow);
}

function isWorkflowProcessingNode(node) {
  return node && WORKFLOW_PROCESSING_NODE_TYPES.has(node.type);
}

/** 案件フロー：ノードライブラリ分组 */
const CASE_FLOW_NODE_GROUPS = [
  {
    category: '業務 Agent',
    nodes: [
      { type: 'preprocess', label: '前処理' },
      { type: 'fraud_detect', label: '画像不正検知' },
      { type: 'ocr', label: 'OCR抽出' },
      { type: 'data_mapping', label: 'データマッピング' },
      { type: 'ai_verify', label: 'AI検証' },
      { type: 'pii_mask', label: '個人情報マスク' },
    ],
  },
  {
    category: '制御 Node',
    nodes: [
      { type: 'decision', label: '条件判断' },
      { type: 'hitl_gate', label: '人工確認', defaultHitlContext: 'ocr' },
    ],
  },
  {
    category: '拡張 Node',
    nodes: [
      { type: 'code', label: 'カスタム関数' },
    ],
  },
  {
    category: '端点',
    nodes: [
      { type: 'end', label: '終了' },
    ],
  },
];

const CASE_FLOW_NODES = CASE_FLOW_NODE_GROUPS.flatMap((g) => g.nodes.map((n) => ({ ...n, category: g.category })));

const FLOW_NODE_OPTIONS = {
  case: CASE_FLOW_NODES,
};

const REMOVED_WORKFLOW_NODE_TYPES = new Set([
  'doc_classify', 'doc_process_rules', 'doc_effect_test', 'doc_store', 'doc_subflow',
  'supplement_upload', 'case_pool_update', 'verify_rerun', 'status_update',
  'case_link', 'scene_aggregate', 'scene_completeness',
  'input', 'output', 'qr_read', 'master_match', 'mcp',
  'notify',
]);

const WORKFLOW_INSPECTOR_MAP = {
  start: 'start',
  end: 'end',
  preprocess: 'image',
  fraud_detect: 'fraud_detect',
  ocr: 'ocr',
  ai_verify: 'ai_verify',
  data_mapping: 'data_mapping',
  pii_mask: 'pii_mask',
  decision: 'decision',
  hitl_gate: 'hitl_gate',
  code: 'code',
};

const CASE_WORKFLOW_START_TRIGGERS = [
  {
    id: 'e1',
    eventId: 'E1',
    caseStatus: '待機中 / 処理中',
    label: '案件集約完了で起動',
    detail: 'ファイルが本案へ帰属し書類が揃ったとき、Workflow を起動または続行',
    actionLabel: '起動',
  },
  {
    id: 'e2',
    eventId: 'E2',
    caseStatus: '補件',
    label: '補件ファイル帰属で続行',
    detail: '補件がアップロードされ本案へ帰属したとき、既存インスタンスを続行',
    actionLabel: '続行',
  },
  {
    id: 'e3',
    eventId: 'E3',
    caseStatus: '処理中止',
    label: '再実行で新規起動',
    detail: '処理中止の案件で再実行したとき、集約は変えず新規インスタンスを起動',
    actionLabel: '再実行',
  },
];

/** @deprecated v626 以前の e2/e3/e4 ID を新 3 件体系へ正規化 */
const CASE_WORKFLOW_LEGACY_TRIGGER_ID_REMAP = {
  e2: 'e1',
  e3: 'e2',
  e4: 'e3',
};

const CASE_WORKFLOW_START_TRIGGER_IDS = new Set(
  CASE_WORKFLOW_START_TRIGGERS.map((trigger) => trigger.id),
);

const CASE_WORKFLOW_LEGACY_TRIGGER_ID_MAP = {
  initial_upload: 'e1',
  cross_batch_upload: 'e1',
  auto_supplement_bind: 'e2',
  manual_supplement_link: 'e2',
  new_case_start: 'e1',
  resume: 'e2',
  reexecute: 'e3',
};

const CASE_WORKFLOW_LEGACY_ROUTING_EVENT_TO_TRIGGER_IDS = {
  CASE_AGGREGATED: ['e1'],
  SUPPLEMENT_LINKED: ['e2'],
};

/** @deprecated migrated to acceptedTriggers */
const CASE_WORKFLOW_LEGACY_STATUS_TO_TRIGGER_IDS = {
  AWAITING_SUPPLEMENT: ['e2'],
  SUPPLEMENT_RECEIVED: ['e2'],
  SUPPLEMENT: ['e2'],
  NEW: ['e1'],
  NEW_CASE: ['e1'],
};

function normalizeStartTriggerId(id) {
  const raw = String(id || '').trim();
  const mapped = CASE_WORKFLOW_LEGACY_TRIGGER_ID_MAP[raw] || raw;
  const remapped = CASE_WORKFLOW_LEGACY_TRIGGER_ID_REMAP[mapped] || mapped;
  return CASE_WORKFLOW_START_TRIGGER_IDS.has(remapped) ? remapped : '';
}

const CASE_WORKFLOW_END_OUTCOMES = [
  {
    id: 'o1',
    caseStatus: '処理完了',
    finalResult: '正常完了',
    detail: '主路径或检证 success；hasOpenItems=false',
  },
  {
    id: 'o2',
    caseStatus: '補件',
    finalResult: '補件待ち',
    detail: 'verifyStatus=reviewRequired（欠件等は missingDocuments / missingFields で待办明细）',
  },
  {
    id: 'o3',
    caseStatus: '異常対応 / 処理中止',
    finalResult: '異常 / 中止',
    detail: 'verifyStatus=failed・他ノード failed、またはユーザー中止',
  },
];

/** 公開時判定（Workflow 全体；終了ノード面板不展示，见 hint / PRD） */
const WORKFLOW_END_PUBLISH_RULES = [
  {
    id: 'p1',
    label: '画布结构',
    rule: '全分支须到达終了、无环、終了可达',
    severity: 'error',
    detail: '分支悬空・循环・終了不可达不可发布',
  },
  {
    id: 'p2',
    label: '分支语义',
    rule: '補件待ち 仅由必要書類/必須項目触发；异常分支未接人工確認 → 警告',
    severity: 'mixed',
    detail: 'OCR低信頼等 alone 不可提案 補件',
  },
];

/** @deprecated 示例值；终了检视面板改用 CASE_WORKFLOW_END_OUTCOMES */
const WORKFLOW_END_OUTCOMES = [
  { key: 'caseStatus', label: '案件状態', value: '処理完了', hint: '案件状態机への提案値' },
  { key: 'finalResult', label: '最終処理結果', value: '正常完了', hint: '正常完了 / 補件待ち / 異常 / 中止' },
  { key: 'hasOpenItems', label: '未完了事項あり', value: 'いいえ', hint: '未完了事項の有無' },
];

const START_SUPPLEMENT_REPLAY_MODES = [
  { value: 'restart_to_verify', label: '前処理からAI検証まで再実行' },
  { value: 'verify_only', label: 'AI検証のみ再実行' },
];

const START_DUPLICATE_POLICIES = [
  { value: 'ignore_running', label: '処理中は起動しない' },
  { value: 'queue', label: '順番に実行' },
];

const WORKFLOW_SCHEDULE_MODES = [
  { value: 'fixed', label: '固定時刻' },
  { value: 'interval', label: '定期間隔' },
];

const WORKFLOW_INTERVAL_UNITS = [
  { value: 'minutes', label: '分' },
  { value: 'hours', label: '時間' },
  { value: 'days', label: '日' },
];

function getDefaultStartTriggerConfig() {
  return {
    acceptedTriggers: [...CASE_WORKFLOW_START_TRIGGER_IDS],
    supplementReplayMode: 'restart_to_verify',
    duplicatePolicy: 'ignore_running',
    schedule: null,
  };
}

function migrateAcceptedTriggersFromRaw(raw) {
  if (Array.isArray(raw?.acceptedTriggers)) {
    return [...new Set(raw.acceptedTriggers
      .map((id) => normalizeStartTriggerId(CASE_WORKFLOW_LEGACY_TRIGGER_ID_MAP[id] || id))
      .filter(Boolean))];
  }
  const legacyStatuses = Array.isArray(raw?.caseStatuses) ? raw.caseStatuses : [];
  const legacyEvents = Array.isArray(raw?.caseEvents) ? raw.caseEvents : [];
  const merged = [
    ...legacyEvents.flatMap((event) => CASE_WORKFLOW_LEGACY_ROUTING_EVENT_TO_TRIGGER_IDS[event] || []),
    ...legacyStatuses.flatMap((status) => CASE_WORKFLOW_LEGACY_STATUS_TO_TRIGGER_IDS[status] || []),
  ];
  return [...new Set(merged.map((id) => normalizeStartTriggerId(id)).filter(Boolean))];
}

function normalizeStartTriggerConfig(raw) {
  if (!raw || typeof raw !== 'object') return getDefaultStartTriggerConfig();
  const acceptedTriggers = migrateAcceptedTriggersFromRaw(raw);
  let schedule = null;
  if (raw.schedule && typeof raw.schedule === 'object') {
    const mode = raw.schedule.mode === 'interval' ? 'interval' : 'fixed';
    schedule = {
      mode,
      fixedTime: String(raw.schedule.fixedTime || '09:00').slice(0, 5),
      runOnWeekdays: raw.schedule.runOnWeekdays !== false,
      intervalValue: Math.max(1, Number(raw.schedule.intervalValue) || 30),
      intervalUnit: WORKFLOW_INTERVAL_UNITS.some((u) => u.value === raw.schedule.intervalUnit)
        ? raw.schedule.intervalUnit
        : 'minutes',
    };
  }
  const cfg = { acceptedTriggers, schedule };
  cfg.supplementReplayMode = START_SUPPLEMENT_REPLAY_MODES.some((m) => m.value === raw.supplementReplayMode)
    ? raw.supplementReplayMode
    : 'restart_to_verify';
  cfg.duplicatePolicy = START_DUPLICATE_POLICIES.some((p) => p.value === raw.duplicatePolicy)
    ? raw.duplicatePolicy
    : 'ignore_running';
  if (!cfg.acceptedTriggers.length && !cfg.schedule) {
    cfg.acceptedTriggers = [...CASE_WORKFLOW_START_TRIGGER_IDS];
  }
  return cfg;
}

function migrateLegacyStartTriggers(triggers) {
  const cfg = {
    acceptedTriggers: [],
    supplementReplayMode: 'restart_to_verify',
    duplicatePolicy: 'ignore_running',
    schedule: null,
  };
  if (!Array.isArray(triggers) || !triggers.length) return getDefaultStartTriggerConfig();
  triggers.forEach((t) => {
    if (t.enabled === false) return;
    if (t.type === 'intake') {
      if (!cfg.acceptedTriggers.includes('e1')) cfg.acceptedTriggers.push('e1');
    }
    if (t.type === 'case_status' && t.caseStatus) {
      const mapped = CASE_WORKFLOW_LEGACY_STATUS_TO_TRIGGER_IDS[t.caseStatus] || [];
      mapped.forEach((id) => {
        if (!cfg.acceptedTriggers.includes(id)) cfg.acceptedTriggers.push(id);
      });
    }
    if (t.type === 'schedule') {
      cfg.schedule = {
        mode: t.scheduleMode === 'interval' ? 'interval' : 'fixed',
        fixedTime: String(t.fixedTime || '09:00').slice(0, 5),
        runOnWeekdays: t.runOnWeekdays !== false,
        intervalValue: Math.max(1, Number(t.intervalValue) || 30),
        intervalUnit: t.intervalUnit || 'minutes',
      };
    }
  });
  if (!cfg.acceptedTriggers.length && !cfg.schedule) {
    cfg.acceptedTriggers = [...CASE_WORKFLOW_START_TRIGGER_IDS];
  }
  return normalizeStartTriggerConfig(cfg);
}

function normalizeStartNode(node) {
  if (!node || node.type !== 'start') return node;
  let triggerConfig;
  if (node.triggerConfig && typeof node.triggerConfig === 'object') {
    triggerConfig = normalizeStartTriggerConfig(node.triggerConfig);
  } else if (Array.isArray(node.triggers)) {
    triggerConfig = migrateLegacyStartTriggers(node.triggers);
  } else {
    triggerConfig = getDefaultStartTriggerConfig();
  }
  const { triggers, ...rest } = node;
  return { ...rest, isStart: true, triggerConfig };
}

function getCaseWorkflowEventLabel(event) {
  const mappedId = CASE_WORKFLOW_LEGACY_TRIGGER_ID_MAP[event] || event;
  return CASE_WORKFLOW_START_TRIGGERS.find((trigger) =>
    trigger.actionLabel === event
    || trigger.label === event
    || trigger.eventId === event
    || trigger.id === mappedId)?.label || event;
}

function formatScheduleSummary(schedule) {
  if (!schedule) return null;
  const weekdayNote = schedule.runOnWeekdays === false ? '' : '・平日';
  if (schedule.mode === 'interval') {
    const unit = WORKFLOW_INTERVAL_UNITS.find((u) => u.value === schedule.intervalUnit)?.label || '';
    return `${schedule.intervalValue}${unit}毎${weekdayNote}`;
  }
  return schedule.runOnWeekdays === false
    ? `毎日 ${schedule.fixedTime}`
    : `平日 ${schedule.fixedTime}`;
}

function isStartCaseEventEnabled(node) {
  return normalizeStartTriggerConfig(node?.triggerConfig).acceptedTriggers.length > 0;
}

function normalizeEndNode(node) {
  if (!node || node.type !== 'end') return node;
  const { caseStatus, namingConfig, ...rest } = node;
  return {
    ...rest,
    isEnd: true,
  };
}

const WORKFLOW_NODE_META = {
  start: {
    icon: '▶',
    title: '開始',
    desc: '集約完了による初回起動・既存案件への帰属、補件ファイル帰属後の続行、処理中止後の再実行',
    tasks: [],
    accent: '#16a34a',
  },
  end: {
    icon: '■',
    title: '終了',
    desc: 'この分岐を終了します',
    tasks: [],
    accent: '#667085',
  },
  preprocess: {
    icon: 'PP',
    title: '前処理',
    desc: '画像補正・回転・画像整列',
    tasks: ['画像補正', '画像回転', '画像整列'],
    input: 'Physical Files',
    output: 'Logical Document Set',
    accent: '#006afa',
  },
  fraud_detect: {
    icon: 'FD',
    title: '画像不正検知',
    desc: '帳票画像の改ざん・偽造リスクを判定',
    tasks: ['改ざん検知', '偽造判定'],
    input: 'Logical Document',
    output: 'Fraud Risk',
    accent: '#d92d20',
  },
  ocr: {
    icon: 'OC',
    title: 'OCR抽出',
    desc: 'OCR / LLM-OCR・フィールド抽出',
    tasks: ['OCR実行', 'フィールド抽出'],
    input: 'Logical Document',
    output: 'Extracted Fields',
    accent: '#08b5d7',
  },
  data_mapping: {
    icon: 'MAP',
    title: 'データマッピング',
    desc: '異構造フィールドを標準項目へ変換',
    tasks: ['標準フィールド', '競合検出'],
    input: 'Case · OCR Fields',
    output: 'Standard Fields',
    accent: '#1f398b',
  },
  ai_verify: {
    icon: 'AI',
    title: 'AI検証',
    desc: '必須フィールド・必要書類・各種検証',
    tasks: ['必須フィールド', '必要書類', 'テキスト検証', 'データ検証', '標準データ整合性', '署名・印鑑検証'],
    input: 'Case Data Pool',
    output: 'Validation Result',
    accent: '#01a46d',
  },
  pii_mask: {
    icon: 'PI',
    title: '個人情報マスク',
    desc: '帳票タイプ Step2 のマスク対象に基づき PII を検出・脱敏',
    tasks: ['PII検出', 'マスキング'],
    input: 'Document + OCR Fields',
    output: 'Masked Files',
    accent: '#e04f16',
  },
  decision: {
    icon: 'IF',
    title: '条件判断',
    desc: 'IF / ELIF / ELSE・変数で分岐',
    tasks: [],
    input: 'Node Result',
    output: 'Branch',
    accent: '#f79009',
  },
  hitl_gate: {
    icon: '人',
    title: '人工確認',
    desc: '完了・補件・案件中止',
    tasks: [],
    input: 'Process Result',
    output: 'Confirmed',
    accent: '#ff898b',
  },
  notify: {
    icon: 'NT',
    title: '通知',
    desc: 'システム通知送信',
    tasks: [],
    input: 'Case Event',
    output: 'Notified',
    accent: '#d92d20',
  },
  code: {
    icon: 'fx',
    title: 'カスタム関数',
    desc: 'JavaScript・ファイル名生成',
    tasks: [],
    input: 'Upstream Variables',
    output: 'Result',
    accent: '#6236ff',
  },
};

function getWorkflowNodeAccent(type) {
  return WORKFLOW_NODE_META[type]?.accent || '#175cd3';
}

function getWorkflowNodeAccentStyle(type) {
  return { '--wf-node-accent': getWorkflowNodeAccent(type) };
}

const WORKFLOW_FLOW_PREVIEW_ACCENT_TYPES = new Set(['decision', 'hitl_gate']);

function getWorkflowFlowPreviewNodeStyle(type) {
  if (!WORKFLOW_FLOW_PREVIEW_ACCENT_TYPES.has(type)) return null;
  return getWorkflowNodeAccentStyle(type);
}

const DATA_MAPPING_STANDARD_FIELDS = [
  { value: 'claimNo', label: 'Claim Number', dataType: 'string', category: 'claim' },
  { value: 'policyNo', label: 'Policy Number', dataType: 'string', category: 'contract' },
  { value: 'contractorName', label: 'Contractor Name', dataType: 'string', category: 'customer' },
  { value: 'insuredName', label: 'Insured Name', dataType: 'string', category: 'customer' },
  { value: 'insuredBirthDate', label: 'Insured Birth Date', dataType: 'string', category: 'customer' },
  { value: 'claimType', label: 'Claim Type', dataType: 'string', category: 'claim' },
  { value: 'admissionDate', label: 'Admission Date', dataType: 'string', category: 'medical' },
  { value: 'dischargeDate', label: 'Discharge Date', dataType: 'string', category: 'medical' },
  { value: 'claimAmount', label: 'Claim Amount', dataType: 'string', category: 'claim' },
  { value: 'medicalInstitutionName', label: 'Medical Institution Name', dataType: 'string', category: 'medical' },
  { value: 'diagnosisName', label: 'Diagnosis Name', dataType: 'string', category: 'medical' },
];

const DATA_MAPPING_FIELD_CATEGORIES = [
  { value: 'customer', label: '顧客情報' },
  { value: 'contract', label: '契約情報' },
  { value: 'claim', label: '請求情報' },
  { value: 'medical', label: '医療情報' },
  { value: 'document', label: '書類情報' },
  { value: 'other', label: 'その他' },
];

const DATA_MAPPING_TRANSFORM_RULES = [
  { value: 'as_is', label: 'そのまま' },
  { value: 'trim', label: '空白除去' },
  { value: 'date_normalize', label: '日付正規化' },
  { value: 'amount_normalize', label: '金額正規化' },
  { value: 'kana_normalize', label: 'カナ正規化' },
  { value: 'master_code', label: 'コード変換' },
];

const DATA_MAPPING_DATA_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
];

const DATA_MAPPING_CONFLICT_COMPARE_MODES = [
  { value: 'exact', label: '完全一致' },
  { value: 'normalized', label: '正規化後一致' },
];

const DATA_MAPPING_OUTPUT_MODES = [
  { value: 'unified', label: '統一フィールド構造' },
  { value: 'per_document', label: '帳票別結果も保持' },
];

const DATA_MAPPING_EXECUTION_SCOPES = [
  { value: 'case', label: '案件単位' },
  { value: 'doc_type', label: '帳票タイプ単位' },
];

const HITL_WAIT_MINUTES = 30;

const AI_VERIFY_MODULE_OPTIONS = [
  { key: 'required_fields', label: '必須フィールド' },
  { key: 'required_documents', label: '必要書類' },
  { key: 'text', label: 'テキスト検証' },
  { key: 'data', label: 'データ検証' },
  { key: 'mapping_conflict', label: '標準データ整合性' },
  { key: 'signature_seal', label: '署名・印鑑検証' },
];

/** @deprecated 旧四態。処理ノードは processRunStatus + processRunResult に分離済み。 */
const WORKFLOW_PROCESS_RUN_STATUS = 'processing（処理中）/ success（成功・スキップ含む）/ failed（失敗）';
const WORKFLOW_PROCESS_RUN_RESULT = 'passed（通過）/ reviewRequired（要確認）';

const WORKFLOW_OUTPUT_VALUE_SPECS = {
  nodeStatus: WORKFLOW_PROCESS_RUN_STATUS,
  processResult: WORKFLOW_PROCESS_RUN_RESULT,
  caseStatus: '待機中 / 処理中 / 人工確認 / 補件 / 異常対応 / 処理中止 / 処理完了 / 出力済',
  finalResult: '正常完了 / 補件待ち / 異常 / 中止',
  boolean: 'true / false',
  runtimeCount: '実行時に書き込む非負整数。固定上限なし',
  runtimeString: '実行時に書き込む文字列。固定値なし',
  runtimeDateTime: '実行時に書き込む ISO 8601 日時',
  resultFileStatus: '対象外 / 待機 / 生成中 / 完了 / 失敗',
  codeStatus: WORKFLOW_PROCESS_RUN_STATUS,
  dynamicObjectKeys: 'キー集合は実行時に生成。固定列挙なし',
  dynamicArrayItems: '要素構造は実行時結果で決まる',
  fileEntryStatus: 'Processed / Processing / Pending / Failed',
};

const WORKFLOW_STEP1_CASE_FIELDS = [
  { id: 'case.caseId', label: '案件ID', scope: '案件', type: 'String', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeString, description: 'Step1 の案件一意識別子' },
];

/** 账票类型不再由节点输出；条件节点直接从 Step1 选择 OCR 字段 */
const WORKFLOW_DOCTYPE_OUTPUT_NODES = new Set();

/** @deprecated 已从节点输出移除；条件 picker 仍用 Step1 模板 */
const WORKFLOW_STEP1_DOCTYPE_DEF = [
  { id: 'docTypes[]', label: '帳票タイプ一覧', scope: '帳票タイプ', type: 'Array', valueSpec: 'Step1 登録帳票タイプ ID の配列', description: 'Step1 关联账票类型列表/定义；不含各字段值' },
];

/** 条件节点级联 L1：Step1 账票模板 OCR 字段分组 */
const STEP1_DOCTYPE_FIELD_CASCADER_GROUP = '帳票フィールド';

/** 消费路径（PRD 6.02.10）：condition / todo / runtime */
const WORKFLOW_VAR_CONSUMPTION = {
  CONDITION: 'condition',
  TODO: 'todo',
  NOTIFY: 'notify',
  TODO_NOTIFY: 'todo_notify',
  RUNTIME: 'runtime',
};

/** 消费路径 → 出力変数面板 / tooltip 文案（PRD 6.02.10） */
const WORKFLOW_VAR_CONSUMPTION_LABELS = {
  [WORKFLOW_VAR_CONSUMPTION.CONDITION]: '条件',
  [WORKFLOW_VAR_CONSUMPTION.TODO]: '待办',
  [WORKFLOW_VAR_CONSUMPTION.NOTIFY]: '通知',
  [WORKFLOW_VAR_CONSUMPTION.TODO_NOTIFY]: '待办',
  [WORKFLOW_VAR_CONSUMPTION.RUNTIME]: '运行时',
};

function formatWorkflowVarConsumptionLabels(paths = []) {
  const list = Array.isArray(paths) ? paths : [];
  const labels = list
    .map((path) => WORKFLOW_VAR_CONSUMPTION_LABELS[path] || path)
    .filter(Boolean);
  return labels.length ? labels.join(' / ') : '';
}

/** 案件级变量键 → 消费路径（出力変数面板列全量；条件选择器按路径过滤） */
const WORKFLOW_VAR_CONSUMPTION_PATHS_BY_ID = {
  'case.caseId': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.preprocessStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.preprocessResult': [WORKFLOW_VAR_CONSUMPTION.CONDITION],
  'case.ocrStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.ocrResult': [WORKFLOW_VAR_CONSUMPTION.CONDITION],
  'case.fraudDetectStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.fraudDetectResult': [WORKFLOW_VAR_CONSUMPTION.CONDITION],
  'case.mappingStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.verifyStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.verifyResult': [WORKFLOW_VAR_CONSUMPTION.CONDITION],
  'case.hitlStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.codeStatus': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'case.latencyMs': [WORKFLOW_VAR_CONSUMPTION.RUNTIME],
  'files[]': [WORKFLOW_VAR_CONSUMPTION.TODO],
};

/** 节点输出目录中排除的键（改由 Step1 / 二级选择器提供；files[] 为数组不可直接比较） */
const DECISION_CATALOG_SKIP_IDS = new Set([
  'case.caseId',
  'case.standardFields',
  'docTypes[]',
  'files[]',
]);

/** 只作为级联分组或系统传递的容器对象；条件 picker 不直接展示 */
const WORKFLOW_CATALOG_CONTAINER_SKIP_IDS = new Set([
  'case.standardFields',
  'docTypes[]',
]);

function getWorkflowVarConsumptionPaths(item) {
  if (!item) return [];
  if (item.consumptionPaths?.length) return item.consumptionPaths;
  const key = item.localId || item.id || '';
  if (WORKFLOW_VAR_CONSUMPTION_PATHS_BY_ID[key]) {
    return WORKFLOW_VAR_CONSUMPTION_PATHS_BY_ID[key];
  }
  if (item.pickerGroup === 'step1_doc' || item.pickerGroup === 'standard_field') {
    return [WORKFLOW_VAR_CONSUMPTION.CONDITION];
  }
  return [];
}

function isDecisionCatalogTemporalDataType(dataType = '') {
  const type = normalizeDecisionDataType(dataType);
  return type === 'date' || type === 'datetime';
}

function isWorkflowVarForCatalog(item, catalogMode) {
  const paths = getWorkflowVarConsumptionPaths(item);
  if (catalogMode === 'condition') return paths.includes(WORKFLOW_VAR_CONSUMPTION.CONDITION);
  if (catalogMode === 'notify') {
    // 通知挿入は通知向けのみ。条件専用ステータスは入れない（自由度を抑える）
    return paths.includes(WORKFLOW_VAR_CONSUMPTION.NOTIFY)
      || paths.includes(WORKFLOW_VAR_CONSUMPTION.TODO_NOTIFY);
  }
  return true;
}

function isDecisionCatalogFileScopeVar(item) {
  if (!item) return false;
  if (item.scope === 'ファイル') return true;
  const id = String(item.id || '');
  return id === 'files[]' || id.startsWith('files[].');
}

/** files[] 数组元素字段定义（供 PRD / 文档；配置端出力変数面板不逐条展示） */
const WORKFLOW_FILE_ENTRY_FIELD_SCHEMA = [
  { id: 'files[].id', label: 'ファイルID', scope: 'ファイル', type: 'String', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeString, description: 'ファイル一意識別子' },
  { id: 'files[].name', label: 'ファイル名', scope: 'ファイル', type: 'String', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeString, description: '元ファイル名' },
  { id: 'files[].type', label: 'ファイルタイプ', scope: 'ファイル', type: 'String', valueSpec: 'pdf / jpg / png / tiff 等', description: 'MIME または拡張子種別' },
  { id: 'files[].extension', label: '拡張子', scope: 'ファイル', type: 'String', valueSpec: '.pdf / .jpg 等', description: 'ファイル拡張子' },
  { id: 'files[].url', label: 'ファイルURL', scope: 'ファイル', type: 'String', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeString, description: '本ノード時点のストレージ参照 URL（前処理後は変わる場合あり）' },
  { id: 'files[].size', label: 'ファイルサイズ', scope: 'ファイル', type: 'Number', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeCount, description: 'バイト単位のファイルサイズ' },
  { id: 'files[].caseId', label: '案件ID', scope: 'ファイル', type: 'String', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeString, description: '所属案件 ID' },
  { id: 'files[].classificationResult', label: '分類結果', scope: 'ファイル', type: 'String', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeString, description: '帳票タイプ分類ラベル' },
  { id: 'files[].status', label: 'ファイル状態', scope: 'ファイル', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.fileEntryStatus, description: '本ノード時点のファイル処理状態' },
  { id: 'files[].uploadedAt', label: 'アップロード日時', scope: 'ファイル', type: 'DateTime', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeDateTime, description: 'アップロード日時' },
  { id: 'files[].updatedAt', label: '更新日時', scope: 'ファイル', type: 'DateTime', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.runtimeDateTime, description: '本ノード処理後の最終更新日時' },
];

const WORKFLOW_FILE_NODE_EXTRA_SCHEMA = {
  ocr: [
    { id: 'files[].ocrFields', label: 'OCRフィールド', scope: 'ファイル', type: 'Object', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.dynamicObjectKeys, description: 'ファイル単位の OCR 抽出結果' },
  ],
  ai_verify: [
    { id: 'files[].failedRules', label: '失敗ルール', scope: 'ファイル', type: 'Array', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.dynamicArrayItems, description: 'ファイル単位で違反した検証ルール' },
  ],
  hitl_gate: [
    { id: 'files[].manualEdits', label: '修正摘要', scope: 'ファイル', type: 'Array', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.dynamicArrayItems, description: 'ファイル単位の人工修正摘要' },
  ],
};

/** @deprecated 兼容旧引用；元素结构见 WORKFLOW_FILE_ENTRY_FIELD_SCHEMA */
const WORKFLOW_FILE_BASE_FIELDS = [
  { id: 'files[]', label: 'ファイル一覧', scope: 'ファイル', type: 'Array', valueSpec: '本ノード処理後の全ファイル配列', description: '本ノード実行後の案件内全ファイル（状態・URL 等を含む）' },
  ...WORKFLOW_FILE_ENTRY_FIELD_SCHEMA,
];

const WORKFLOW_FILE_NODE_EXTRA_FIELDS = WORKFLOW_FILE_NODE_EXTRA_SCHEMA;

const WORKFLOW_FILE_ARRAY_OUTPUT_NOTES = {
  start: '各元素含 classificationResult 等基础字段；仅开始节点输出 files[]',
};

const WORKFLOW_FILES_ARRAY_TOOLTIP_EXAMPLE = [
  {
    id: 'file_001',
    name: '領収書.pdf',
    classificationResult: '領収書',
    status: 'Processed',
  },
];

function buildWorkflowFilesArrayExample(nodeType = '') {
  const base = {
    id: 'file_001',
    name: '領収書.pdf',
    type: 'pdf',
    extension: '.pdf',
    url: 's3://bucket/case/file_001.pdf',
    size: 245760,
    caseId: 'CASE-2026-0001',
    classificationResult: '領収書',
    status: 'Processed',
    uploadedAt: '2026-07-14T10:00:00+09:00',
    updatedAt: '2026-07-14T10:01:00+09:00',
  };
  if (nodeType === 'ocr' || nodeType === 'data_mapping') {
    base.ocrFields = { 氏名: '山田太郎', 請求金額: '12800' };
  }
  if (nodeType === 'ai_verify') {
    base.failedRules = [{ ruleId: 'c2', message: '請求金額が診療明細合計と不一致' }];
  }
  if (nodeType === 'hitl_gate') {
    base.manualEdits = [{ field: '氏名', before: '山田', after: '山田太郎' }];
  }
  return [base];
}

const WORKFLOW_FILES_ARRAY_EXAMPLE = buildWorkflowFilesArrayExample('start');

function workflowNodeFileOutputFields(nodeType) {
  const note = WORKFLOW_FILE_ARRAY_OUTPUT_NOTES[nodeType];
  return [{
    id: 'files[]',
    label: 'ファイル一覧',
    scope: 'ファイル',
    type: 'Array',
    valueSpec: '本ノード処理後の全ファイル配列',
    description: note
      ? `案件内全ファイル配列。${note}`
      : '本ノード実行後の案件内全ファイル（状態・URL 等を含む）',
    example: buildWorkflowFilesArrayExample(nodeType),
  }];
}

/** 出力変数パネル（i 详情）用 Array 示例；非 Array 返回空串 */
function getWorkflowOutputVarExample(item) {
  if (!item) return '';
  if (item.example != null) {
    return typeof item.example === 'string'
      ? item.example
      : JSON.stringify(item.example, null, 2);
  }
  const id = String(item.localId || item.id || item.name || '');
  const bare = id.includes('.') ? id.split('.').pop() : id;
  const type = String(item.type || item.dataType || '');
  const isArray = /Array/i.test(type) || bare.endsWith('[]') || bare.includes('[]');
  if (!isArray) return '';

  if (bare === 'files[]' || bare === 'files') {
    return JSON.stringify(WORKFLOW_FILES_ARRAY_TOOLTIP_EXAMPLE, null, 2);
  }
  return JSON.stringify([{ id: 'item_1', value: 'example' }], null, 2);
}

const WORKFLOW_NODE_OUTPUT_VAR_DEFS = {
  start: [
    ...WORKFLOW_STEP1_CASE_FIELDS,
    ...workflowNodeFileOutputFields('start'),
  ],
  end: [],
  preprocess: [
    { id: 'case.preprocessStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '本ノードの実行進捗。対象ファイルなし、または設定 OFF の場合も success とし、skip は別値として出力しない。業務上通過したかは「処理結果」を見る。' },
    { id: 'case.preprocessResult', label: '処理結果', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.processResult, description: '業務結論。通過は主フローへ進み、要確認は人工確認へ進む。' },
  ],
  ocr: [
    { id: 'case.ocrStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '本ノードの実行進捗。対象ファイルなし、または設定 OFF の場合も success とし、skip は別値として出力しない。業務上通過したかは「処理結果」を見る。' },
    { id: 'case.ocrResult', label: '処理結果', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.processResult, description: '業務結論。通過は主フローへ進み、要確認（低信頼など）は人工確認へ進む。' },
  ],
  fraud_detect: [
    { id: 'case.fraudDetectStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '本ノードの実行進捗。対象帳票 OFF または検知対象外の場合も success とし、skip は別値として出力しない。業務上通過したかは「処理結果」を見る。' },
    { id: 'case.fraudDetectResult', label: '処理結果', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.processResult, description: '業務結論。通過は主フローへ進み、不正疑い検知（固定閾値 70 超）時は reviewRequired で人工確認へ進む。' },
  ],
  pii_mask: [
    { id: 'case.piiMaskStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '本ノードの実行進捗。マスク対象なしまたは OFF の場合も success。Agent 実行失敗は failed。' },
  ],
  data_mapping: [
    { id: 'case.mappingStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '本ノードの実行進捗。対象ルールなし、または設定 OFF の場合も success とし、skip は別値として出力しない。' },
    { id: 'case.standardFields', label: '標準変数', scope: '案件', type: 'Object', valueSpec: '標準フィールド名をキー、マッピング後の値を値とするオブジェクト', description: 'データマッピングで生成した標準変数。' },
  ],
  decision: [],
  ai_verify: [
    { id: 'case.verifyStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '本ノードの実行進捗。ON の検証モジュールなし、または設定 OFF の場合も success とし、skip は別値として出力しない。業務上通過したかは「処理結果」を見る。' },
    { id: 'case.verifyResult', label: '処理結果', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.processResult, description: '業務結論。通過は主フローへ進み、要確認（不足書類など）は人工確認または補件へ進む。' },
  ],
  hitl_gate: [
    { id: 'case.hitlStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.nodeStatus, description: '人工確認の処理状態。待機中または提出中は processing、提出と書き戻し成功は success、作成・提出・書き戻し・ルーティング失敗は failed。' },
  ],
  code: [
    { id: 'case.codeStatus', label: '処理状態', scope: '案件', type: 'Enum', valueSpec: WORKFLOW_OUTPUT_VALUE_SPECS.codeStatus, description: 'JavaScript の処理状態。実行中 processing、正常終了 success、異常/タイムアウト/戻り値不正 failed。' },
  ],
};

const WORKFLOW_NODE_OUTPUT_HINT_KEYS = {
  start: 'nodeOutputStart',
  end: 'nodeOutputEnd',
  preprocess: 'nodeOutputPreprocess',
  ocr: 'nodeOutputOcr',
  data_mapping: 'dataMappingOutput',
  ai_verify: 'nodeOutputVerify',
  hitl_gate: 'nodeOutputHitl',
  fraud_detect: 'nodeOutputFraudDetect',
  pii_mask: 'nodeOutputPiiMask',
  code: 'codeOutput',
};

function getCodeNodeOutputVarDefs(node) {
  return WORKFLOW_NODE_OUTPUT_VAR_DEFS.code || [];
}

function formatWorkflowOutputVarToken(node, workflow, varId) {
  return `{${getWorkflowNodeVarName(node, workflow)}.${varId}}`;
}

function getWorkflowNodeOutputVarItems(node, workflow = null) {
  if (!node?.type) return [];
  const defs = node.type === 'code'
    ? getCodeNodeOutputVarDefs(node)
    : WORKFLOW_NODE_OUTPUT_VAR_DEFS[node.type];
  if (!defs?.length) return [];
  const visibleDefs = defs.filter((item) => !item.optional);
  return visibleDefs.map((item) => {
    const consumptionPaths = getWorkflowVarConsumptionPaths(item);
    return {
      ...item,
      localId: item.id,
      path: `${getWorkflowNodeVarName(node, workflow)}.${item.id}`,
      token: formatWorkflowOutputVarToken(node, workflow, item.id),
      consumptionPaths,
      consumptionPathLabel: formatWorkflowVarConsumptionLabels(consumptionPaths),
    };
  });
}

function appendNodeOutputVarCatalog(node, workflow, options, catalogMode = 'condition') {
  if (!node?.type) return;
  const items = getWorkflowNodeOutputVarItems(node, workflow);
  if (!items.length) return;
  const meta = getWorkflowNodeMeta(node.type);
  const title = meta.title;
  items.forEach((item) => {
    if (WORKFLOW_CATALOG_CONTAINER_SKIP_IDS.has(item.id)) return;
    if (catalogMode === 'condition' && DECISION_CATALOG_SKIP_IDS.has(item.id)) return;
    if (!isWorkflowVarForCatalog(item, catalogMode)) return;
    if (isDecisionCatalogTemporalDataType(item.type)) return;
    if (catalogMode === 'condition' && normalizeDecisionDataType(item.type) === 'array') return;
    if (catalogMode === 'condition' && isDecisionCatalogFileScopeVar(item)) return;
    appendDecisionVarOption(options, {
      value: `${getWorkflowNodeVarName(node, workflow)}.${item.id}`,
      label: item.label,
      displayName: String(item.id || '').split('.').pop() || item.id,
      group: title,
      scope: item.scope || '案件',
      dataType: item.type || '',
      valueSpec: item.valueSpec || '',
      description: item.description || item.label,
      nodeType: node.type,
      nodeId: node.id,
      varName: getWorkflowNodeVarName(node, workflow),
      pickerGroup: 'node',
      localId: item.id,
      consumptionPaths: getWorkflowVarConsumptionPaths(item),
    });
  });
}

function appendDocTypeFieldTemplateCatalog(docTypes, getDocSchemaFn, options, getDocLabelFn = null) {
  if (!Array.isArray(docTypes) || !docTypes.length) return;
  const schemaFn = typeof getDocSchemaFn === 'function' ? getDocSchemaFn : () => ({ fields: [] });
  const labelFn = typeof getDocLabelFn === 'function' ? getDocLabelFn : (type) => type;
  docTypes.forEach((docType) => {
    const docTypeLabel = labelFn(docType) || docType;
    const fields = schemaFn(docType)?.fields || [];
    fields.forEach((field) => {
      appendDecisionVarOption(options, {
        value: `docTypes.${docType}.${field}`,
        label: `${docTypeLabel} · ${field}`,
        displayName: field,
        group: STEP1_DOCTYPE_FIELD_CASCADER_GROUP,
        scope: 'Document Type',
        dataType: 'String',
        description: 'Condition field selection, not a node output variable. Runtime value comes from files[].classificationResult + files[].ocrFields.',
        nodeType: 'step1_template',
        nodeId: 'step1',
        varName: '',
        pickerGroup: 'step1_doc',
        pickerDocType: docType,
        pickerDocTypeLabel: docTypeLabel,
        pickerField: field,
      });
    });
  });
}

function appendDataMappingStandardFieldCatalog(node, workflow, options) {
  if (!node || node.type !== 'data_mapping') return;
  const varName = getWorkflowNodeVarName(node, workflow);
  const meta = getWorkflowNodeMeta(node.type);
  DATA_MAPPING_STANDARD_FIELDS.forEach((field) => {
    appendDecisionVarOption(options, {
      value: `${varName}.case.standardFields.${field.value}`,
      label: field.label,
      displayName: field.label,
      group: meta.title,
      scope: '案件',
      dataType: 'String',
      description: 'Data mapping standard field.',
      nodeType: node.type,
      nodeId: node.id,
      varName,
      pickerGroup: 'standard_field',
      pickerStandardFieldId: field.value,
      pickerStandardFieldLabel: field.label,
      consumptionPaths: [WORKFLOW_VAR_CONSUMPTION.CONDITION],
    });
  });
}

function buildDecisionVariableCascaderTree(options) {
  const nodeMap = new Map();
  const step1DocMap = new Map();

  (options || []).forEach((opt) => {
    if (opt.pickerGroup === 'step1_doc') {
      const docType = opt.pickerDocType || '';
      const docTypeLabel = opt.pickerDocTypeLabel || docType;
      if (!docTypeLabel) return;
      if (!step1DocMap.has(docType)) {
        step1DocMap.set(docType, { id: `step1:${docType}`, text: docTypeLabel, title: docTypeLabel, items: [] });
      }
      step1DocMap.get(docType).items.push({
        id: opt.value,
        text: opt.pickerField || opt.displayName,
        title: opt.pickerField || opt.displayName,
        scope: opt.scope,
        dataType: opt.dataType,
      });
      return;
    }

    const nodeKey = opt.nodeId || opt.group || 'unknown';
    const nodeText = opt.group || getWorkflowNodeMeta(opt.nodeType)?.title || '上流ノード';
    if (!nodeMap.has(nodeKey)) {
      nodeMap.set(nodeKey, {
        id: `node:${nodeKey}`,
        text: nodeText,
        title: nodeText,
        items: [],
      });
    }
    const nodeEntry = nodeMap.get(nodeKey);

    if (opt.pickerGroup === 'standard_field') {
      const bucketId = `std-fields:${nodeKey}`;
      let bucket = nodeEntry.items.find((item) => item.id === bucketId);
      if (!bucket) {
        bucket = {
          id: bucketId,
          text: '標準フィールド',
          title: '標準フィールド',
          items: [],
        };
        nodeEntry.items.push(bucket);
      }
      bucket.items.push({
        id: opt.value,
        text: opt.pickerStandardFieldId || opt.pickerStandardFieldLabel || opt.displayName,
        title: opt.pickerStandardFieldLabel || opt.displayName,
        scope: opt.scope,
        dataType: opt.dataType,
      });
      return;
    }

    const varKey = String(opt.displayName || opt.localId || '').trim()
      || String(opt.value || '').split('.').pop()
      || opt.value;
    nodeEntry.items.push({
      id: opt.value,
      text: varKey,
      title: opt.description ? `${varKey}\n${opt.description}` : varKey,
      scope: opt.scope,
      dataType: opt.dataType,
    });
  });

  const tree = [];
  if (step1DocMap.size) {
    tree.push({
      id: 'group:step1',
      text: STEP1_DOCTYPE_FIELD_CASCADER_GROUP,
      title: STEP1_DOCTYPE_FIELD_CASCADER_GROUP,
      items: [...step1DocMap.values()],
    });
  }
  nodeMap.forEach((group) => tree.push(group));
  return tree;
}

/** 客户 workshop 确认清单（只读参考） */
const WORKFLOW_WORKSHOP_CHECKLIST = [
  { id: 'k1', topic: 'マスタ照合', question: '必須の知识源：内部文档库 / 行业标准 API / Web Search / 客户自建 MCP Search？' },
  { id: 'k2', topic: 'マスタ照合', question: '照合输出：仅返回候选参考文本，还是写回 OCR 字段的标准化值？' },
  { id: 'k3', topic: 'マスタ照合', question: '低置信度时：自动 HITL 还是条件判断？' },
  { id: 'k4', topic: 'マスタ照合', question: '是否允许多知识源同时检索再合并（multi-knowledge）？' },
  { id: 'b1', topic: '边界', question: '内部辞書（form.master.mappings）→ マスタ照合；外部知识 → マスタ照合 — 是否认可？' },
];

function getWorkflowNodeIo(node) {
  const meta = getWorkflowNodeMeta(node?.type);
  return { input: meta.input || '', output: meta.output || '' };
}

function guessDataMappingSourceForStandard(standardFieldId) {
  const guesses = {
    claimNo: 'case.claimNo',
    policyNo: '保険金請求書.証券番号',
    contractorName: '保険金請求書.ご契約者氏名',
    insuredName: '保険金請求書.被保険者氏名',
    insuredBirthDate: '保険金請求書.被保険者生年月日',
    claimType: '保険金請求書.請求区分',
    admissionDate: '保険金請求書.入院日',
    dischargeDate: '保険金請求書.退院日',
    claimAmount: '保険金請求書.請求金額',
    medicalInstitutionName: '診断書.医療機関名',
    diagnosisName: '診断書.診断名',
  };
  return guesses[standardFieldId] || '';
}

function defaultDataMappingSourcesForStandard(standardFieldId) {
  const sources = {
    claimNo: ['case.claimNo', '保険金請求書.請求番号'],
    policyNo: ['保険金請求書.証券番号', '診断書.証券番号', '領収書・診療明細書.証券番号'],
    contractorName: ['保険金請求書.ご契約者氏名'],
    insuredName: ['保険金請求書.被保険者氏名', '診断書.患者氏名', '領収書・診療明細書.氏名'],
    insuredBirthDate: ['保険金請求書.被保険者生年月日', '診断書.患者生年月日'],
    claimType: ['保険金請求書.請求区分', '保険金請求書.給付金種類'],
    admissionDate: ['診断書.入院日', '入院診断書.入院日'],
    dischargeDate: ['診断書.退院日', '入院証明書.退院日'],
    claimAmount: ['保険金請求書.請求金額', '領収書・診療明細書.金額', '領収書・診療明細書.合計金額'],
    medicalInstitutionName: ['診断書.医療機関名', '領収書・診療明細書.医療機関名'],
    diagnosisName: ['診断書.診断名', '診断書.傷病名'],
  };
  return sources[standardFieldId] || [guessDataMappingSourceForStandard(standardFieldId)].filter(Boolean);
}

function defaultDataMappingRuleText(standardFieldId) {
  const rules = {
    claimNo: '案件番号は {{case.claimNo}} を優先して保持する。{{保険金請求書.請求番号}} がある場合は同一の請求参照番号として扱い、正規表現: /\\s+/g -> "" で空白を除去して比較する。',
    policyNo: '{{保険金請求書.証券番号}}、{{診断書.証券番号}}、{{領収書・診療明細書.証券番号}} を同一の証券番号として扱う。競合検出前に正規表現: /[\\s　-]/g -> "" で空白とハイフンを除去する。',
    contractorName: '{{保険金請求書.ご契約者氏名}} を契約者氏名として保持する。全角・半角を正規化し、正規表現: /[\\s　]+/g -> "" で余分な空白を除去する。欠損時も他帳票の氏名では補完しない。',
    insuredName: '{{保険金請求書.被保険者氏名}}、{{診断書.患者氏名}}、{{領収書・診療明細書.氏名}} を同一の被保険者氏名として扱う。競合検出前に正規表現: /[\\s　]+/g -> "" で空白を除去する。',
    insuredBirthDate: '{{保険金請求書.被保険者生年月日}} と {{診断書.患者生年月日}} を同一の生年月日として扱う。正規表現: /(明治|大正|昭和|平成|令和)?\\s*([0-9０-９]{1,4})[年\\/.-]([0-9０-９]{1,2})[月\\/.-]([0-9０-９]{1,2})日?/ で年月日を抽出し、yyyy-MM-dd に正規化する。',
    claimType: '{{保険金請求書.請求区分}} と {{保険金請求書.給付金種類}} を請求区分候補として扱う。正規表現: /(入院|通院|手術|死亡|診断|給付金)/g で区分を抽出し、複数値はカンマ区切りで保持する。',
    admissionDate: '{{診断書.入院日}} と {{入院診断書.入院日}} を入院日として扱う。正規表現: /(入院日|入院開始日)?[:：]?\\s*(.+)/ でラベル後の日付を抽出し、ファイル別の値は sourceFields に保持する。',
    dischargeDate: '{{診断書.退院日}} と {{入院証明書.退院日}} を退院日として扱う。正規表現: /(退院日|退院予定日)?[:：]?\\s*(.+)/ でラベル後の日付を抽出する。値がない場合は空値のまま保持する。',
    claimAmount: '{{保険金請求書.請求金額}}、{{領収書・診療明細書.金額}}、{{領収書・診療明細書.合計金額}} を請求金額の候補として扱う。正規表現: /[^0-9０-９.-]/g -> "" で通貨表記を除去し、Number に変換して複数の領収書・明細は合計する。',
    medicalInstitutionName: '{{診断書.医療機関名}} と {{領収書・診療明細書.医療機関名}} を医療機関名として扱う。正規表現: /[\\r\\n\\t]+/g -> " " で改行を空白に置換し、正規化後の値をマスタ照合へ渡す。',
    diagnosisName: '{{診断書.診断名}} と {{診断書.傷病名}} を傷病名・診断名として扱う。正規表現: /[\\r\\n]+/g -> "、" で改行を読点に置換し、ファイル別に異なる値は単一値へ強制統合せず sourceFields に保持する。',
  };
  return rules[standardFieldId] || '選択した OCR フィールドを標準変数の入力元として使用する。正規化が必要な場合は、抽出条件または置換ルールを /pattern/flags -> "replacement" の形式で記述する。';
}

function defaultDataMappingRules() {
  return DATA_MAPPING_STANDARD_FIELDS.map((field) => ({
    id: newRuleId('map'),
    sourceFieldIds: defaultDataMappingSourcesForStandard(field.value),
    standardFieldId: field.value,
    standardLabel: field.label,
    dataType: field.dataType,
    valueGenerationRule: defaultDataMappingRuleText(field.value),
    structuredRulePreview: '',
    conflictCheckEnabled: ['policyNo', 'insuredName', 'insuredBirthDate', 'claimAmount'].includes(field.value),
    conflictCompareMode: 'normalized',
  }));
}

function normalizeDataMappingRule(rule) {
  const fallbackStandard = DATA_MAPPING_STANDARD_FIELDS[0];
  const rawStandardFieldId = String(rule?.standardFieldId || '').trim();
  const standard = DATA_MAPPING_STANDARD_FIELDS.find((f) => f.value === rawStandardFieldId);
  const standardFieldId = rawStandardFieldId || fallbackStandard?.value || '';
  const sourceFieldIds = Array.isArray(rule?.sourceFieldIds)
    ? rule.sourceFieldIds
    : [rule?.sourceFieldId].filter(Boolean);
  const dataType = DATA_MAPPING_DATA_TYPES.some((t) => t.value === rule?.dataType)
    ? rule.dataType
    : (standard?.dataType || fallbackStandard?.dataType || 'string');
  const legacyTransform = DATA_MAPPING_TRANSFORM_RULES.find((r) => r.value === rule?.transformRule);
  const rawValueGenerationRule = rule?.valueGenerationRule
    || rule?.normalizationRule
    || (legacyTransform && legacyTransform.value !== 'as_is' ? legacyTransform.label : '');
  const legacyShortRules = new Set([
    'Use {{case.claimNo}} as the case reference. If {{保険金請求書.請求番号}} is present, treat it as the same claim reference after removing spaces with /\\s+/g -> "".',
    'Treat {{保険金請求書.証券番号}}, {{診断書.証券番号}}, and {{領収書・診療明細書.証券番号}} as the same policy number. Remove spaces and hyphens with /[\\s　-]/g -> "" before conflict checking.',
    'Use {{保険金請求書.ご契約者氏名}} as contractorName. Normalize full-width/half-width characters and remove extra spaces with /[\\s　]+/g -> ""; do not fill missing values from other document names.',
    'Treat {{保険金請求書.被保険者氏名}}, {{診断書.患者氏名}}, and {{領収書・診療明細書.氏名}} as the same insured person name. Remove spaces with /[\\s　]+/g -> "" before conflict checking.',
    'Treat {{保険金請求書.被保険者生年月日}} and {{診断書.患者生年月日}} as the same birth date. Extract date parts with /(明治|大正|昭和|平成|令和)?\\s*([0-9０-９]{1,4})[年\\/.-]([0-9０-９]{1,2})[月\\/.-]([0-9０-９]{1,2})日?/ and normalize to yyyy-MM-dd.',
    'Use {{保険金請求書.請求区分}} and {{保険金請求書.給付金種類}} as claim type candidates. Extract categories with /(入院|通院|手術|死亡|診断|給付金)/g and keep multiple values as a comma-separated list.',
    'Use {{診断書.入院日}} and {{入院診断書.入院日}} as admission date values. Extract the date after optional labels using /(入院日|入院開始日)?[:：]?\\s*(.+)/ and keep file-level values in sourceFields.',
    'Use {{診断書.退院日}} and {{入院証明書.退院日}} as discharge date values. Extract the date after optional labels using /(退院日|退院予定日)?[:：]?\\s*(.+)/; keep blank if no value is present.',
    'Use {{保険金請求書.請求金額}}, {{領収書・診療明細書.金額}}, and {{領収書・診療明細書.合計金額}} as claim amount sources. Remove currency text with /[^0-9０-９.-]/g -> "", convert to Number, and sum multiple receipt/detail files.',
    'Use {{診断書.医療機関名}} and {{領収書・診療明細書.医療機関名}} as medical institution name sources. Replace line breaks with spaces using /[\\r\\n\\t]+/g -> " " and pass the normalized value to Master照合.',
    'Use {{診断書.診断名}} and {{診断書.傷病名}} as diagnosis name sources. Replace line breaks with "、" using /[\\r\\n]+/g -> "、"; keep different file-level diagnoses as sourceFields rather than forcing one value.',
    'Use the selected OCR fields as the source for this standard variable. Add extraction or replacement rules in the form /pattern/flags -> "replacement" when normalization is required.',
    '空白除去',
    '日付正規化',
    '金額正規化',
    'カナ正規化',
    'コード変換',
    '前後の空白を除去する。',
    '西暦 yyyy-MM-dd 形式に正規化する。',
    '通貨記号・カンマを除去し、数値に変換する。',
    '案件番号または請求書の請求番号を標準変数 claimNo として保持する。複数値がある場合は同一番号か確認し、不一致は競合として出力する。',
    '証券番号はハイフン・空白・全半角の差を除去して同一形式に正規化する。複数帳票で値が異なる場合は自動補正せず、競合として出力する。',
    '契約者氏名は前後の空白、姓名間の余分なスペース、全半角差を除去して保持する。欠損していても他帳票の氏名では補完しない。',
    '保険金請求書の被保険者氏名、診断書の患者氏名、領収書の氏名を同一人物の氏名候補として扱う。空白・全半角を正規化した上で比較し、不一致は競合として出力する。',
    '生年月日は和暦・西暦・年月日表記を yyyy-MM-dd に統一する。請求書と診断書で日付が異なる場合は競合として出力する。',
    '請求区分または給付金種類の表記を標準変数 claimType に保持する。複数区分が記載される場合はカンマ区切りのリストとして保持し、Master照合によるコード化は行わない。',
    '入院日は和暦・西暦・年月日表記を yyyy-MM-dd に統一する。同一帳票種別が複数ファイルある場合は各ファイルの入院日を sourceFields に保持する。',
    '退院日は和暦・西暦・年月日表記を yyyy-MM-dd に統一する。退院日が未記載の場合は空値のまま保持し、他帳票から自動補完しない。',
    '複数の領収書・診療明細書の金額は「円」「税込」「,」などを除去して数値化する。明細金額が複数ある場合は合計値を claimAmount とし、各ファイル別の金額は sourceFields に保持する。',
    '医療機関名は前後空白、改行、全半角差を除去して保持する。略称・別名の近似照合や正式名称への変換はここでは行わず、Master照合に渡す。',
    '傷病名・診断名は複数行の場合、改行を「、」に置換して保持する。複数ファイルで異なる傷病名がある場合はリストとして保持し、競合ではなく確認対象として sourceFields に残す。',
    '案件番号または請求書の請求番号を claimNo として保持する。\n正規表現: /^[A-Z]{2,5}-?\\d{4}-?\\d{4,8}$/ で番号形式を確認し、空白は /\\s+/g -> "" で除去する。複数値がある場合は同一番号か確認し、不一致は競合として出力する。',
    '証券番号はハイフン・空白・全半角差を除去して同一形式に正規化する。\n正規表現: /[\\s　-]/g -> "" を適用し、複数帳票で値が異なる場合は自動補正せず競合として出力する。',
    '契約者氏名は前後の空白、姓名間の余分なスペース、全半角差を除去して保持する。\n正規表現: /^[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー\\s　]+$/u で氏名候補を確認し、/[\\s　]+/g -> "" で比較用値を作成する。欠損していても他帳票の氏名では補完しない。',
    '保険金請求書の被保険者氏名、診断書の患者氏名、領収書の氏名を同一人物の氏名候補として扱う。\n正規表現: /[\\s　]+/g -> "" で空白を除去し、全半角正規化後に比較する。不一致は競合として出力する。',
    '生年月日は和暦・西暦・年月日表記を yyyy-MM-dd に統一する。\n正規表現: /(明治|大正|昭和|平成|令和)?\\s*([0-9０-９]{1,4})[年\\/.-]([0-9０-９]{1,2})[月\\/.-]([0-9０-９]{1,2})日?/ で年月日を抽出する。請求書と診断書で日付が異なる場合は競合として出力する。',
    '請求区分または給付金種類の表記を claimType に保持する。\n正規表現: /(入院|通院|手術|死亡|診断|給付金)/g で区分候補を抽出し、複数区分はカンマ区切りリストとして保持する。Master照合によるコード化は行わない。',
    '入院日は和暦・西暦・年月日表記を yyyy-MM-dd に統一する。\n正規表現: /(入院日|入院開始日)?[:：]?\\s*(.+)/ で日付候補を抽出し、同一帳票種別が複数ファイルある場合は各ファイルの入院日を sourceFields に保持する。',
    '退院日は和暦・西暦・年月日表記を yyyy-MM-dd に統一する。\n正規表現: /(退院日|退院予定日)?[:：]?\\s*(.+)/ で日付候補を抽出する。退院日が未記載の場合は空値のまま保持し、他帳票から自動補完しない。',
    '複数の領収書・診療明細書の金額は数値化して合計する。\n正規表現: /[^0-9０-９.-]/g -> "" で「円」「税込」「,」などを除去し、全角数字を半角化して Number に変換する。明細金額が複数ある場合は合計値を claimAmount とし、各ファイル別の金額は sourceFields に保持する。',
    '医療機関名は前後空白、改行、全半角差を除去して保持する。\n正規表現: /[\\r\\n\\t]+/g -> " "、/^\\s+|\\s+$/g -> "" を適用する。略称・別名の近似照合や正式名称への変換はここでは行わず、Master照合に渡す。',
    '傷病名・診断名は複数行の場合、改行を「、」に置換して保持する。\n正規表現: /[\\r\\n]+/g -> "、"、/\\s{2,}/g -> " " を適用する。複数ファイルで異なる傷病名がある場合はリストとして保持し、競合ではなく確認対象として sourceFields に残す。',
  ]);
  const valueGenerationRule = legacyShortRules.has(rawValueGenerationRule)
    ? defaultDataMappingRuleText(standard?.value)
    : rawValueGenerationRule;
  return {
    id: rule?.id || newRuleId('map'),
    sourceFieldIds: sourceFieldIds.length ? sourceFieldIds : defaultDataMappingSourcesForStandard(standardFieldId),
    standardFieldId,
    standardLabel: rule?.standardLabel || standard?.label || standardFieldId,
    dataType,
    valueGenerationRule,
    structuredRulePreview: rule?.structuredRulePreview || '',
    conflictCheckEnabled: rule?.conflictCheckEnabled === true,
    conflictCompareMode: DATA_MAPPING_CONFLICT_COMPARE_MODES.some((m) => m.value === rule?.conflictCompareMode)
      ? rule.conflictCompareMode
      : 'normalized',
  };
}

function normalizeDataMappingNode(node, workflow = null) {
  const base = ensureWorkflowNodeVarName({
    ...node,
    type: 'data_mapping',
    label: node?.label && node.label !== 'MCP' ? node.label : 'データマッピング',
  }, workflow);
  const rules = Array.isArray(base.mappingRules) && base.mappingRules.length
    ? base.mappingRules
    : defaultDataMappingRules();
  return {
    ...base,
    configRef: base.configRef || 'current_scene',
    targetDocTypes: Array.isArray(base.targetDocTypes) ? base.targetDocTypes.filter(Boolean) : [],
    executionScope: DATA_MAPPING_EXECUTION_SCOPES.some((opt) => opt.value === base.executionScope)
      ? base.executionScope
      : 'case',
    outputMode: DATA_MAPPING_OUTPUT_MODES.some((opt) => opt.value === base.outputMode)
      ? base.outputMode
      : 'unified',
    mappingMode: base.mappingMode || 'field_to_standard',
    mappingRules: rules.map(normalizeDataMappingRule),
  };
}

function normalizeHitlWaitConfig(node) {
  if (!node || !isHitlGateNode(node)) return node;
  return {
    ...node,
    hitlWaitEnabled: node.hitlWaitEnabled === true,
    hitlWaitMinutes: HITL_WAIT_MINUTES,
  };
}

function isHitlVerificationContext(node) {
  return isHitlGateNode(node) && inferHitlContext(node) === 'verification';
}

function normalizeAiVerifyNode(node, workflow = null) {
  const base = ensureWorkflowNodeVarName({
    ...node,
    type: 'ai_verify',
    label: node?.label || 'AI検証',
  }, workflow);
  const moduleEnabled = {};
  const legacyModuleEnabled = base.moduleEnabled || {};
  AI_VERIFY_MODULE_OPTIONS.forEach((opt) => {
    let enabled = legacyModuleEnabled[opt.key];
    if (enabled == null && (opt.key === 'required_fields' || opt.key === 'required_documents')) {
      enabled = legacyModuleEnabled.completeness;
    }
    if (enabled == null && opt.key === 'signature_seal') {
      enabled = legacyModuleEnabled.seal;
    }
    moduleEnabled[opt.key] = enabled !== false;
  });
  return {
    ...base,
    configRef: base.configRef || 'current_scene',
    targetDocTypes: Array.isArray(base.targetDocTypes) ? base.targetDocTypes.filter(Boolean) : [],
    moduleEnabled,
  };
}

function countNotifyTemplateVarRefs(subject = '', body = '') {
  const matches = String(`${subject}\n${body}`).match(/\{\{[^}]+\}\}/g);
  return matches ? new Set(matches).size : 0;
}

const WORKFLOW_NODE_SIZE = {
  default: { w: 205, h: 44 },
  decision: { w: 240, h: 56 },
  terminal: { w: 107, h: 44 },
};

function isWorkflowTerminalNode(node) {
  return node?.type === 'start' || node?.type === 'end';
}

function wfBezierControls(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const curve = Math.max(28, Math.min(120, dx * 0.45, dx * 0.35 + dy * 0.08));
  return {
    c1x: x1 + curve,
    c1y: y1,
    c2x: x2 - curve,
    c2y: y2,
  };
}

function wfBezierPath(x1, y1, x2, y2) {
  const { c1x, c1y, c2x, c2y } = wfBezierControls(x1, y1, x2, y2);
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

function wfBezierPoint(x1, y1, x2, y2, t = 0.5) {
  const { c1x, c1y, c2x, c2y } = wfBezierControls(x1, y1, x2, y2);
  const u = 1 - t;
  return {
    x: u * u * u * x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2,
    y: u * u * u * y1 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y2,
  };
}

/** @deprecated use wfBezierPath */
function wfStraightPath(x1, y1, x2, y2) {
  return wfBezierPath(x1, y1, x2, y2);
}

const INSPECTOR_HEAD_HINT_KEYS = {
  start: 'startTriggers',
  end: 'endTriggers',
  image: 'preprocess',
  ocr: 'ocrExtract',
  fraud_detect: 'fraudDetect',
  pii_mask: 'piiMask',
  data_mapping: 'dataMapping',
  ai_verify: 'aiVerify',
  decision: 'decision',
  hitl_gate: 'hitlGate',
  notify: 'notify',
  code: 'code',
  edge: 'edgeEdit',
  scene: 'scene',
  overview: null,
};

const PREPROCESS_SETTING_ITEMS = [
  {
    key: 'rotate',
    label: '画像回転',
    switchKey: 'rotate',
    detailType: 'rotate',
    docTypesKey: 'rotateDocTypes',
  },
  {
    key: 'perspective',
    label: '画像補正',
    switchKey: 'perspective',
    detailType: 'perspective',
    docTypesKey: 'perspectiveDocTypes',
  },
  {
    key: 'sort',
    label: '画像整列',
    switchKey: 'sort',
    detailType: 'sort',
    docTypesKey: 'sortDocTypes',
  },
];

/** 画布节点摘要：统一分隔符与未配置占位 */
const WORKFLOW_CANVAS_SUMMARY_SEP = ' · ';
const WORKFLOW_CANVAS_SUMMARY_EMPTY = '未設定';
const WORKFLOW_CANVAS_SUMMARY_LINE_H = 22;

const PREPROCESS_CANVAS_SHORT_LABELS = {
  rotate: '回転',
  perspective: '補正',
  sort: '整列',
};

const FRAUD_DETECT_RISK_THRESHOLD = 70;

const AI_VERIFY_CANVAS_SHORT_LABELS = {
  required_fields: '必須項目',
  required_documents: '必要書類',
  text: 'テキスト',
  data: 'データ',
  mapping_conflict: '整合性',
  signature_seal: '署名',
};

function joinWorkflowCanvasSummary(...parts) {
  return parts
    .filter((part) => part != null && String(part).trim())
    .join(WORKFLOW_CANVAS_SUMMARY_SEP);
}

function buildPreprocessCanvasSummaryChips(imageConfig = {}) {
  return PREPROCESS_SETTING_ITEMS
    .filter((item) => imageConfig[item.switchKey])
    .map((item) => {
      const types = imageConfig[item.docTypesKey];
      const count = Array.isArray(types) && types.length ? types.length : 0;
      const short = PREPROCESS_CANVAS_SHORT_LABELS[item.key] || item.label;
      return count > 0 ? `${short} ${count}件` : item.label;
    });
}

function buildFraudDetectCanvasSummaryChips(fraudConfig = {}) {
  const enabledTypes = Array.isArray(fraudConfig.enabledTypes) ? fraudConfig.enabledTypes.filter(Boolean) : [];
  return enabledTypes;
}

function buildAiVerifyCanvasSummaryChips(node, getModuleRuleCount) {
  const countFn = typeof getModuleRuleCount === 'function' ? getModuleRuleCount : () => 0;
  return AI_VERIFY_MODULE_OPTIONS
    .filter((opt) => node?.moduleEnabled?.[opt.key] !== false)
    .map((opt) => {
      const count = countFn(opt.key) || 0;
      const short = AI_VERIFY_CANVAS_SHORT_LABELS[opt.key] || opt.label;
      return count > 0 ? `${short} ${count}件` : short;
    });
}

function splitWorkflowCanvasSummaryParts(summary) {
  if (!summary) return [];
  return String(summary)
    .split(WORKFLOW_CANVAS_SUMMARY_SEP)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getWorkflowNodeReuseSummaryPrefix(node) {
  if (!node?.reuseReview) return '';
  const statusLabel = node.reuseStatus === 'ready' ? 'コピー済' : '要確認';
  const sourceName = node.reuseSourceSceneName || node.reuseReview?.sourceSceneName || '';
  const clipped = truncateWorkflowPreview(sourceName, 10);
  return clipped ? `${statusLabel}: ${clipped}` : statusLabel;
}

const HITL_GATE_CANVAS_ROLE_FALLBACK = '操作員';

function formatHitlGateCanvasRoleLabel(role) {
  const raw = String(role || '').trim();
  if (!raw) return HITL_GATE_CANVAS_ROLE_FALLBACK;
  const gateRole = normalizeHitlGateRole(raw);
  const options = typeof HITL_GATE_ROLE_OPTIONS !== 'undefined'
    ? HITL_GATE_ROLE_OPTIONS
    : (typeof HITL_ROLE_OPTIONS !== 'undefined' ? HITL_ROLE_OPTIONS : []);
  const match = options.find((item) => item.value === gateRole);
  return match?.label || gateRole;
}

function buildHitlGateCanvasSummary(node, workflow = null) {
  const targetLabel = getHitlGatePreset(node, workflow)?.label || '人工確認';
  const roleLabel = formatHitlGateCanvasRoleLabel(node?.role);
  return joinWorkflowCanvasSummary(targetLabel, roleLabel);
}

/** 画布节点单行摘要（统一 ` · ` 分隔；未配置 `未設定`） */
function buildWorkflowNodeCanvasSummary(node, ctx = {}) {
  if (!node || isWorkflowTerminalNode(node)) return '';
  const reusePrefix = getWorkflowNodeReuseSummaryPrefix(node);
  const workflow = typeof ctx.getWf === 'function' ? ctx.getWf() : null;
  const verifyConfig = ctx.verify || null;
  const sceneContext = ctx.sceneContext || null;

  switch (node.type) {
    case 'preprocess': {
      const chips = buildPreprocessCanvasSummaryChips(ctx.image || {});
      if (!chips.length) {
        return reusePrefix
          ? joinWorkflowCanvasSummary(reusePrefix, WORKFLOW_CANVAS_SUMMARY_EMPTY)
          : WORKFLOW_CANVAS_SUMMARY_EMPTY;
      }
      return joinWorkflowCanvasSummary(reusePrefix, `${chips.length}件有効`, ...chips.slice(0, 2));
    }
    case 'ocr': {
      const stats = ctx.ocrStats || { total: 0, enabled: 0, enabledLabels: [] };
      const enabledLabels = Array.isArray(stats.enabledLabels) ? stats.enabledLabels : [];
      if (!stats.enabled) {
        return reusePrefix
          ? joinWorkflowCanvasSummary(reusePrefix, WORKFLOW_CANVAS_SUMMARY_EMPTY)
          : WORKFLOW_CANVAS_SUMMARY_EMPTY;
      }
      return joinWorkflowCanvasSummary(
        reusePrefix,
        `${stats.enabled}件有効`,
        ...enabledLabels.slice(0, 2),
      );
    }
    case 'fraud_detect': {
      const stats = ctx.fraudDetectStats || { total: 0, enabled: 0, enabledLabels: [] };
      const enabledLabels = Array.isArray(stats.enabledLabels) ? stats.enabledLabels : [];
      if (!stats.enabled) {
        return reusePrefix
          ? joinWorkflowCanvasSummary(reusePrefix, WORKFLOW_CANVAS_SUMMARY_EMPTY)
          : WORKFLOW_CANVAS_SUMMARY_EMPTY;
      }
      return joinWorkflowCanvasSummary(
        reusePrefix,
        `${stats.enabled}件有効`,
        ...enabledLabels.slice(0, 2),
      );
    }
    case 'data_mapping': {
      const ruleCount = Number(ctx.dataMappingRuleCount) || 0;
      return joinWorkflowCanvasSummary(reusePrefix, ruleCount ? `ルール ${ruleCount}件` : '設定参照');
    }
    case 'ai_verify': {
      const chips = buildAiVerifyCanvasSummaryChips(node, ctx.getAiVerifyModuleRuleCount);
      if (!chips.length) {
        return reusePrefix
          ? joinWorkflowCanvasSummary(reusePrefix, WORKFLOW_CANVAS_SUMMARY_EMPTY)
          : WORKFLOW_CANVAS_SUMMARY_EMPTY;
      }
      return joinWorkflowCanvasSummary(reusePrefix, `${chips.length}件有効`, ...chips.slice(0, 2));
    }
    case 'decision': {
      const opts = workflow && node?.id
        ? getDecisionVariableOptions(workflow, node.id, verifyConfig, sceneContext)
        : [];
      const preview = getDecisionNodeCanvasSummary(node, opts);
      return joinWorkflowCanvasSummary(reusePrefix, preview || WORKFLOW_CANVAS_SUMMARY_EMPTY);
    }
    case 'hitl_gate':
    case 'confirm':
    case 'ocr_confirm':
    case 'verify_confirm':
      return joinWorkflowCanvasSummary(reusePrefix, buildHitlGateCanvasSummary(node, workflow));
    case 'notify': {
      const normalized = normalizeNotifyNode(node, workflow);
      const ch = NOTIFY_CHANNELS.find((c) => c.value === normalized.channel);
      const channelLabel = ch?.label || WORKFLOW_CANVAS_SUMMARY_EMPTY;
      const varCount = countNotifyTemplateVarRefs(normalized.subject, normalized.body);
      const parts = [channelLabel];
      if (varCount > 0) parts.push(`${varCount}項目`);
      return joinWorkflowCanvasSummary(reusePrefix, ...parts);
    }
    case 'code': {
      const normalized = normalizeCodeNode(node, workflow);
      const inCount = normalized.inputs?.length || 0;
      const parts = [];
      if (inCount) parts.push(`入力 ${inCount}件`);
      const summary = joinWorkflowCanvasSummary(reusePrefix, ...parts);
      return summary || (reusePrefix
        ? joinWorkflowCanvasSummary(reusePrefix, WORKFLOW_CANVAS_SUMMARY_EMPTY)
        : WORKFLOW_CANVAS_SUMMARY_EMPTY);
    }
    default:
      return reusePrefix || '';
  }
}

const NODE_IO_DEFAULTS = {
  preprocess: {
    inputType: 'Document',
    maxFileSizeMb: 100,
    inputFormats: ['PDF', 'JPG', 'PNG', 'TIFF'],
    outputType: 'Processed Document',
    outputFormat: 'PDF',
  },
  input: {
    inputType: 'Document',
    maxFileSizeMb: 100,
    inputFormats: ['PDF', 'JPG', 'PNG', 'TIFF'],
    outputType: 'Document',
    outputFormat: 'Document',
  },
  ocr: {
    inputType: 'Processed Document',
    maxFileSizeMb: 100,
    inputFormats: ['PDF', 'JPG', 'PNG', 'TIFF'],
    outputType: 'Extracted Fields',
    outputFormat: 'JSON',
  },
  output: {
    inputType: 'Final Data',
    maxFileSizeMb: 100,
    inputFormats: ['JSON'],
    outputType: 'Export',
    outputFormat: 'JSON',
  },
};

const INPUT_FORMAT_OPTIONS = ['フォルダ', 'ZIP', 'PDF', 'PNG', 'JPG', 'TIFF'];
const INPUT_MAX_FILE_SIZE_MB = 20;

const INPUT_CHANNEL_MIGRATE = {
  アップロード: '画面上アップロード',
  API連携: 'APIアップロード',
};
const INPUT_FORMAT_MIGRATE = {
  JPEG: 'JPG',
};

function getWorkflowNodeMeta(type) {
  return WORKFLOW_NODE_META[type] || WORKFLOW_NODE_META.preprocess;
}

function getWorkflowNodePickerSummary(type) {
  return getWorkflowNodeMeta(type).desc || '';
}

const WORKFLOW_NODE_PICKER_DESCRIPTIONS = {
  preprocess: '画像回転、画像補正、画像整列などの前処理を実行します。',
  fraud_detect: '帳票画像の改ざん・偽造リスクを判定します。帳票タイプごとに実行有無を切り替えます。',
  ocr: '帳票タイプごとに OCR テンプレートを実行し、抽出項目を出力します。',
  data_mapping: 'OCR 抽出項目を標準項目へ変換します。',
  ai_verify: '必須フィールド、必要書類、テキスト検証、データ検証、標準データ整合性、署名・印鑑検証を実行します。',
  pii_mask: '帳票タイプ Step2 でマスク ON のフィールドを Agent が検出し、脱敏ファイルを出力します。',
  decision: '条件式と入力値に基づいて後続処理を分岐します。',
  hitl_gate: '人工確認タスクを作成し、担当者の処理を待ちます。',
  code: '入力変数を参照し、JavaScript を実行します。',
  end: 'Workflow の実行を終了します。',
};

function getWorkflowNodePickerDescription(type) {
  return WORKFLOW_NODE_PICKER_DESCRIPTIONS[type] || getWorkflowNodePickerSummary(type);
}

const WORKFLOW_NODE_ICON_SVG = {
  start: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5.5 14 10l-7 4.5v-9Z" fill="currentColor"/></svg>',
  end: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="8" height="8" rx="1.8" fill="currentColor"/></svg>',
  preprocess: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5h6l2.5 2.5v10.5h-9V3.5Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><path d="M12 3.5V6h2.5M7.5 9h5M7.5 12h3.5" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
  fraud_detect: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.8 16.2 5.3v4.7c0 3.4-2.2 5.8-6.2 7.2-4-1.4-6.2-3.8-6.2-7.2V5.3L10 2.8Z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M10 7.2v3.3M10 12.8h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  ocr: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 8h6M7 11h4M4 2.8V6M16 2.8V6M4 14v3.2M16 14v3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  data_mapping: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h4M12 5h4M4 15h4M12 15h4M8 5c2.2 0 2.8 2 4 5 1.2 3 1.8 5 4 5M8 15c2.2 0 2.8-2 4-5 1.2-3 1.8-5 4-5" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  ai_verify: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.45"/><circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.45"/><path d="m12.6 14.2 1.2 1.2 2.4-2.7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pii_mask: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 9.5h12v6.5H4V9.5Z" fill="none" stroke="currentColor" stroke-width="1.35"/><path d="M7 9.5V7.8a3 3 0 1 1 6 0V9.5" fill="none" stroke="currentColor" stroke-width="1.35"/><path d="M8 12.5h4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
  decision: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m7 12.5 2.2-2.2 1.8 1.8 2.5-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hitl_gate: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.8 16c.7-2.6 2.5-4 5.2-4s4.5 1.4 5.2 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  notify: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8.5a4 4 0 1 1 8 0c0 4 1.6 4.4 1.6 5.6H4.4C4.4 12.9 6 12.5 6 8.5Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><path d="M8.4 16a1.8 1.8 0 0 0 3.2 0" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"/></svg>',
  code: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.2 6-3.5 4 3.5 4M12.8 6l3.5 4-3.5 4M11 4.8 9 15.2" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function getWorkflowNodeIconSvg(type) {
  return WORKFLOW_NODE_ICON_SVG[type] || WORKFLOW_NODE_ICON_SVG.preprocess;
}

const DECISION_CONDITION_TYPES = [
  {
    value: 'case_ready',
    label: '案件就绪判断',
    defaultLabel: '案件就绪？',
    yesRule: '必要資料が揃い、案件データの整合性 OK',
    noRule: '資料不足・不備あり（補件または差し戻し）',
  },
  {
    value: 'deficiency_hitl',
    label: '不備時の人工確認',
    defaultLabel: '不備要確認？',
    yesRule: '必須帳票欠落・完全性 NG（要審査）',
    noRule: '完全性 OK（次工程へ）',
  },
  {
    value: 'preprocess_hitl',
    label: '前処理結果の要確認',
    defaultLabel: '前処理確認必要？',
    yesRule: '分類/補正の要確認',
    noRule: '前処理 PASS（自動確定）',
  },
  {
    value: 'ocr_hitl',
    label: 'OCR抽出結果の要確認',
    defaultLabel: 'OCR確認必要？',
    yesRule: '要確認フィールドあり、または信頼度が閾値未満',
    noRule: '全フィールドが自動確定可能',
  },
  {
    value: 'verify_hitl',
    label: 'AI検証結果の要確認',
    defaultLabel: 'AI検証確認必要？',
    yesRule: '検証ルール違反・Master未一致',
    noRule: '検証 PASS（自動確定）',
  },
  {
    value: 'verify_pass',
    label: 'AI検証通過判断',
    defaultLabel: 'AI検証通過？',
    yesRule: '検証ルール ALL PASS',
    noRule: '検証 NG または要確認あり',
  },
  {
    value: 'notify_required',
    label: '不備通知必要',
    defaultLabel: '不備通知必要？',
    yesRule: '不備あり・補件または差し戻し通知が必要',
    noRule: '通知不要（次工程へ）',
  },
  {
    value: 'custom',
    label: 'カスタム',
    defaultLabel: '条件分岐',
    yesRule: '',
    noRule: '上記 YES 条件に該当しない場合',
  },
];

const JUDGMENT_CONTEXT_OPTIONS = [
  { value: 'case_readiness', label: '案件就緒判断' },
  { value: 'verification_result', label: '検証結果判断' },
  { value: 'processing_completion', label: '処理完了判断' },
  { value: 'custom', label: 'カスタム' },
];

const JUDGMENT_ELSE_LABELS = {
  case_readiness: '未就緒（不備あり）',
  verification_result: '要確認',
  processing_completion: '補件依頼',
  custom: 'ELSE',
};

const HITL_CONTEXT_OPTIONS = [
  { value: 'preprocess', label: '前処理確認' },
  { value: 'ocr', label: 'OCR結果確認' },
  { value: 'verification', label: 'AI検証確認' },
];

const HITL_PRESET_OPTIONS = HITL_CONTEXT_OPTIONS;

const HITL_ACTION_OPTIONS = [
  { value: 'approve', label: '完了' },
  { value: 'request_supplement', label: '補件' },
  { value: 'reject', label: '案件中止' },
];

const HITL_DEFAULT_ACTIONS = HITL_ACTION_OPTIONS.map((o) => o.value);

const HITL_LEGACY_ACTION_MAP = {
  request_fix: 'approve',
  pass: 'approve',
  supplement: 'request_supplement',
  exception: 'reject',
};

const HITL_CONTEXT_DEFAULT_ROLE = {
  preprocess: 'operator',
  ocr: 'operator',
  verification: 'operation_admin',
};

const HITL_ROLE_LEGACY_MAP = {
  '案件担当者': 'case_owner',
  '担当者': 'case_owner',
  '入力オペレータ': 'operator',
  '医療審査': 'operator',
  '給付審査': 'operation_admin',
  '管理者': 'operation_admin',
  'その他ロール': 'operation_admin',
};

function normalizeHitlRole(role, fallback = 'operator') {
  const raw = String(role || '').trim();
  return HITL_ROLE_LEGACY_MAP[raw] || raw || fallback;
}

function normalizeHitlGateRole(role, fallback = 'operator') {
  const normalized = normalizeHitlRole(role, fallback);
  return normalized === 'case_owner' ? 'operator' : normalized;
}

const HITL_LEGACY_CONTEXT_MAP = {
  preprocess_hitl: 'preprocess',
  ocr_hitl: 'ocr',
  verify_hitl: 'verification',
  deficiency_hitl: 'deficiency',
  custom: 'custom',
};

const NOTIFY_CHANNELS = [
  { value: 'system', label: 'システム通知' },
  { value: 'email', label: 'メール' },
];

const NOTIFY_RECIPIENT_OPTIONS = [
  { value: 'operator', label: '操作員' },
  { value: 'operation_admin', label: '操作管理者' },
];

const NOTIFY_TEMPLATE_VAR_REFS = {
  caseNo: { nodeType: 'start', varId: 'case.caseNo', legacyLabel: '案件番号' },
  caseStatus: {
    nodeType: 'end',
    varId: 'case.caseStatus',
    legacyLabel: '案件状態',
  },
  finalResult: { nodeType: 'end', varId: 'case.finalResult', legacyLabel: '最終処理結果' },
  missingDocuments: { nodeType: 'ai_verify', varId: 'case.missingDocuments', legacyLabel: '不足書類一覧' },
  missingFields: { nodeType: 'ai_verify', varId: 'case.missingFields', legacyLabel: '不足項目一覧' },
  codeStatus: {
    nodeType: 'code',
    varId: 'case.codeStatus',
    legacyLabel: '処理状態',
    fallbackNodeTypes: ['preprocess'],
    fallbackVarId: 'case.preprocessStatus',
  },
};

const NOTIFY_TEMPLATES = [
  {
    value: 'deficiency',
    label: '不備通知',
    defaultSubject: '【不備通知】案件番号：{{caseNo}}',
    defaultBody: '案件番号：{{caseNo}}\n不足書類または不足項目があります。追加資料をアップロードしてください。\n不足書類：{{missingDocuments}}\n不足項目：{{missingFields}}',
    varRefs: ['caseNo', 'missingDocuments', 'missingFields'],
  },
  {
    value: 'completed',
    label: '処理完了通知',
    defaultSubject: '【処理完了】案件番号：{{caseNo}}',
    defaultBody: '案件番号：{{caseNo}}\n処理が完了しました。\n案件状態：{{caseStatus}}\n最終処理結果：{{finalResult}}',
    varRefs: ['caseNo', 'caseStatus', 'finalResult'],
  },
  {
    value: 'exception',
    label: '異常通知',
    defaultSubject: '【異常通知】案件番号：{{caseNo}}',
    defaultBody: '案件番号：{{caseNo}}\n処理中に異常が発生しました。確認してください。\n案件状態：{{caseStatus}}\n処理状態：{{codeStatus}}',
    varRefs: ['caseNo', 'caseStatus', 'codeStatus'],
  },
];

const NOTIFY_TEMPLATE_LEGACY_MAP = {
  supplement: 'deficiency',
  deficiency: 'deficiency',
  custom: 'completed',
  approval: 'completed',
  completed: 'completed',
  exception: 'exception',
};

function migrateNotifyTemplate(value) {
  const raw = String(value || '').trim();
  if (NOTIFY_TEMPLATES.some((t) => t.value === raw)) return raw;
  return NOTIFY_TEMPLATE_LEGACY_MAP[raw] || 'deficiency';
}

function getNotifyTemplateVarRefKeys(templateValue) {
  const tpl = NOTIFY_TEMPLATES.find((t) => t.value === migrateNotifyTemplate(templateValue));
  return tpl?.varRefs ? [...tpl.varRefs] : [];
}

function resolveNotifyTemplateNode(workflow, notifyNodeId, ref) {
  if (!ref || !workflow?.nodes?.length) return null;
  const upstream = resolveUpstreamNodesByType(workflow, notifyNodeId, ref.nodeType);
  if (upstream.length) return upstream[0];
  if (ref.nodeType === 'start') return workflow.nodes.find((n) => n.type === 'start') || null;
  if (Array.isArray(ref.fallbackNodeTypes)) {
    for (const nodeType of ref.fallbackNodeTypes) {
      const fallbackUpstream = resolveUpstreamNodesByType(workflow, notifyNodeId, nodeType);
      if (fallbackUpstream.length) return fallbackUpstream[0];
    }
  }
  return null;
}

function resolveNotifyTemplateVarToken(workflow, notifyNodeId, refKey) {
  const ref = NOTIFY_TEMPLATE_VAR_REFS[refKey];
  if (!ref) return '';
  if (!workflow || !notifyNodeId) return '';
  const options = getNotifyVariableOptions(workflow, notifyNodeId);
  const node = resolveNotifyTemplateNode(workflow, notifyNodeId, ref);
  if (node) {
    const token = formatWorkflowOutputVarToken(node, workflow, ref.varId);
    const value = token.replace(/^\{|\}$/g, '');
    if (options.some((item) => item.value === value)) return token;
  }
  if (ref.fallbackNodeTypes?.length && ref.fallbackVarId) {
    for (const nodeType of ref.fallbackNodeTypes) {
      const fallbackNode = resolveNotifyTemplateNode(workflow, notifyNodeId, { ...ref, nodeType, fallbackNodeTypes: [] });
      if (!fallbackNode) continue;
      const token = formatWorkflowOutputVarToken(fallbackNode, workflow, ref.fallbackVarId);
      const value = token.replace(/^\{|\}$/g, '');
      if (options.some((item) => item.value === value)) return token;
    }
  }
  return '';
}

function buildNotifyTemplateFieldText(templateValue, field, workflow = null, notifyNodeId = '') {
  const tpl = NOTIFY_TEMPLATES.find((t) => t.value === migrateNotifyTemplate(templateValue));
  if (!tpl) return '';
  const raw = field === 'subject' ? tpl.defaultSubject : tpl.defaultBody;
  return String(raw || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (
    resolveNotifyTemplateVarToken(workflow, notifyNodeId, key) || `{{${key}}}`
  ));
}

function getNotifyTemplateDefaults(templateValue, workflow = null, notifyNodeId = '') {
  return {
    subject: buildNotifyTemplateFieldText(templateValue, 'subject', workflow, notifyNodeId),
    body: buildNotifyTemplateFieldText(templateValue, 'body', workflow, notifyNodeId),
  };
}

function migrateNotifyLegacyTokens(text, templateValue, workflow = null, notifyNodeId = '') {
  let result = String(text || '');
  getNotifyTemplateVarRefKeys(templateValue).forEach((key) => {
    const ref = NOTIFY_TEMPLATE_VAR_REFS[key];
    if (!ref?.legacyLabel) return;
    const token = resolveNotifyTemplateVarToken(workflow, notifyNodeId, key);
    if (!token) return;
    result = result.split(`[${ref.legacyLabel}]`).join(token);
  });
  return result;
}

function getNotifyTemplateRecommendedVars(templateValue, workflow = null, notifyNodeId = '') {
  const options = workflow && notifyNodeId
    ? getNotifyVariableOptions(workflow, notifyNodeId)
    : [];
  return getNotifyTemplateVarRefKeys(templateValue).map((key) => {
    const ref = NOTIFY_TEMPLATE_VAR_REFS[key];
    const token = resolveNotifyTemplateVarToken(workflow, notifyNodeId, key);
    const value = token.replace(/^\{|\}$/g, '');
    const opt = options.find((item) => item.value === value);
    if (!opt) return null;
    return {
      key,
      value,
      label: opt?.label || ref?.legacyLabel || key,
      token,
      group: opt?.group || '',
    };
  }).filter((item) => item?.token);
}

/** @deprecated use getNotifyTemplateRecommendedVars */
function getNotifyTemplateAllowedVars(templateValue, workflow = null, notifyNodeId = '') {
  return getNotifyTemplateRecommendedVars(templateValue, workflow, notifyNodeId)
    .map((item) => item.label);
}

function formatNotifyVariableToken(varPath) {
  const path = String(varPath || '').trim();
  if (!path) return '';
  return path.startsWith('{') ? path : `{${path}}`;
}

function insertNotifyVariableText(text, varPath) {
  const token = formatNotifyVariableToken(varPath);
  if (!token) return String(text || '');
  const current = String(text || '');
  if (!current) return token;
  const needsSpace = !current.endsWith('\n') && !current.endsWith(' ') && !current.endsWith('{');
  return needsSpace ? `${current} ${token}` : `${current}${token}`;
}

function getNotifyVariableOptions(workflow, nodeId, verifyConfig = null, sceneContext = null) {
  return buildNotifyVariableCatalog(workflow, nodeId, verifyConfig, sceneContext);
}

function getNotifyRecipientsLabel(channel) {
  if (channel === 'email') return 'メール宛先';
  return '通知先';
}

function getNotifyRecipientsPlaceholder(channel) {
  if (channel === 'email') return 'メール宛先を選択';
  return '通知先を選択';
}

function parseNotifyChannelSelection(channels) {
  const allowed = new Set(NOTIFY_CHANNELS.map((item) => item.value));
  const list = Array.isArray(channels) ? channels.filter((value) => allowed.has(value)) : [];
  return list.filter((value, index, arr) => arr.indexOf(value) === index);
}

function normalizeNotifyChannels(channels) {
  const list = parseNotifyChannelSelection(channels);
  return list.length ? list : ['system'];
}

function formatNotifyChannelsDisplay(channels) {
  return normalizeNotifyChannels(channels)
    .map((value) => NOTIFY_CHANNELS.find((item) => item.value === value)?.label || value)
    .join(' / ');
}

function parseNotifySystemRecipients(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/[;,;、/／|]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    if (NOTIFY_RECIPIENT_OPTIONS.some((opt) => opt.value === part)) return part;
    const byLabel = NOTIFY_RECIPIENT_OPTIONS.find((opt) => opt.label === part);
    if (byLabel) return byLabel.value;
    if (part.includes('操作管理')) return 'operation_admin';
    if (part.includes('操作員')) return 'operator';
    if (part.includes('その他')) return 'other_role';
    return null;
  }).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);
}

function serializeNotifySystemRecipients(values) {
  const list = Array.isArray(values) ? values : [];
  return list
    .map((v) => String(v || '').trim())
    .filter((v) => NOTIFY_RECIPIENT_OPTIONS.some((opt) => opt.value === v))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(',');
}

const NOTIFY_EMAIL_RECIPIENT_SPLIT_RE = /[,;，；、/\n|｜]/;

const NOTIFY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseNotifyEmailRecipients(value) {
  if (Array.isArray(value)) {
    return value
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .filter((part, index, arr) => arr.indexOf(part) === index);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(NOTIFY_EMAIL_RECIPIENT_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index, arr) => arr.indexOf(part) === index);
}

function serializeNotifyEmailRecipients(values) {
  return parseNotifyEmailRecipients(values).join(',');
}

function normalizeNotifyEmailRecipients(value) {
  return serializeNotifyEmailRecipients(parseNotifyEmailRecipients(value));
}

function formatNotifyEmailRecipientsDisplay(value) {
  const list = parseNotifyEmailRecipients(value);
  return list.length ? list.join('、') : '';
}

function validateNotifyEmailRecipients(value) {
  const list = parseNotifyEmailRecipients(value);
  if (!list.length) {
    return { ok: false, message: 'メール宛先を入力してください' };
  }
  const invalid = list.filter((email) => !NOTIFY_EMAIL_PATTERN.test(email));
  if (invalid.length) {
    return {
      ok: false,
      message: `メールアドレスの形式が正しくありません: ${invalid.join(', ')}`,
    };
  }
  return { ok: true, message: '' };
}

function normalizeNotifyRecipients(recipients, channel) {
  if (channel === 'email') {
    return normalizeNotifyEmailRecipients(recipients);
  }
  return serializeNotifySystemRecipients(parseNotifySystemRecipients(recipients));
}

function formatNotifyRecipientsDisplay(recipients, channel) {
  if (channel === 'email') {
    return formatNotifyEmailRecipientsDisplay(recipients);
  }
  const raw = String(recipients || '').trim();
  if (!raw) return '';
  const labels = parseNotifySystemRecipients(raw)
    .map((value) => NOTIFY_RECIPIENT_OPTIONS.find((opt) => opt.value === value)?.label)
    .filter(Boolean);
  return labels.length ? labels.join(' / ') : raw;
}

function validateNotifyRecipients(channel, value) {
  const v = String(value || '').trim();
  if (!v) return { ok: true, message: '' };
  if (channel === 'email') {
    return validateNotifyEmailRecipients(v);
  }
  const parsed = parseNotifySystemRecipients(v);
  if (!parsed.length) {
    return { ok: false, message: '通知先を選択してください' };
  }
  return { ok: true, message: '' };
}

function inferJudgmentContext(node) {
  return 'custom';
}

const HITL_UPSTREAM_TYPE_TO_CONTEXT = {
  preprocess: 'preprocess',
  ocr: 'ocr',
  ai_verify: 'verification',
};

function collectHitlUpstreamSources(workflow, hitlNodeId) {
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
    if (node.type === 'hitl_gate') {
      (wf.edges || []).filter((edge) => edge.to === id).forEach((edge) => queue.push(edge.from));
      continue;
    }
    sources.push(node);
  }
  return sources;
}

function inferHitlContextFromDecision(decisionNode) {
  const raw = decisionNode?.judgmentContext || decisionNode?.conditionType;
  const map = {
    preprocess_hitl: 'preprocess',
    ocr_hitl: 'ocr',
    verify_hitl: 'verification',
    ocr_low_confidence: 'ocr',
    deficiency_hitl: 'verification',
  };
  return map[raw] || '';
}

function inferHitlContext(node, workflow = null) {
  if (workflow && node?.id) {
    const nodeMap = Object.fromEntries((workflow.nodes || []).map((n) => [n.id, n]));
    const directFromIds = (workflow.edges || [])
      .filter((edge) => edge.to === node.id)
      .map((edge) => edge.from);
    const sources = collectHitlUpstreamSources(workflow, node.id);
    const priority = ['preprocess', 'ocr', 'ai_verify'];
    for (let i = 0; i < priority.length; i += 1) {
      const type = priority[i];
      if (sources.some((source) => source.type === type)) {
        return HITL_UPSTREAM_TYPE_TO_CONTEXT[type];
      }
    }
    for (let i = 0; i < directFromIds.length; i += 1) {
      const direct = nodeMap[directFromIds[i]];
      if (direct?.type === 'decision') {
        const hinted = inferHitlContextFromDecision(direct);
        if (hinted) return hinted;
      }
    }
  }
  if (node?.hitlContext && HITL_CONTEXT_OPTIONS.some((o) => o.value === node.hitlContext)) {
    return node.hitlContext;
  }
  const legacy = node?.conditionType;
  if (legacy && HITL_LEGACY_CONTEXT_MAP[legacy]) return HITL_LEGACY_CONTEXT_MAP[legacy];
  if (node?.type === 'ocr_confirm') return 'ocr';
  if (node?.type === 'verify_confirm' || node?.type === 'confirm') return 'verification';
  return 'verification';
}

function getHitlContextMeta(hitlContext) {
  return HITL_CONTEXT_OPTIONS.find((o) => o.value === hitlContext) || HITL_CONTEXT_OPTIONS[0];
}

function resolveUpstreamNodesByType(workflow, nodeId, nodeType) {
  const nodeMap = Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n]));
  return getDecisionUpstreamNodeIds(workflow, nodeId)
    .map((id) => nodeMap[id])
    .filter((n) => n?.type === nodeType);
}

function judgmentCond(variable, value = '1') {
  return createDecisionCondition({ variable, operator: 'is', value });
}

function buildJudgmentCasesFromContext(judgmentContext, workflow, nodeId, verifyConfig = null) {
  const vCfg = verifyConfig || {};
  if (judgmentContext === 'case_readiness') {
    const ifConditions = [];
    resolveUpstreamNodesByType(workflow, nodeId, 'preprocess').forEach((n) => {
      ifConditions.push(judgmentCond(`${getWorkflowNodeVarName(n, workflow)}.case.preprocessResult`, 'passed'));
    });
    if (!ifConditions.length) ifConditions.push(judgmentCond('preprocess.case.preprocessResult', 'passed'));
    resolveUpstreamNodesByType(workflow, nodeId, 'ocr').forEach((n) => {
      ifConditions.push(judgmentCond(`${getWorkflowNodeVarName(n, workflow)}.case.ocrResult`, 'passed'));
    });
    if (!resolveUpstreamNodesByType(workflow, nodeId, 'ocr').length) ifConditions.push(judgmentCond('ocr.case.ocrResult', 'passed'));
    return [createDecisionCase('if', { id: 'if', label: '就緒完了', conditions: ifConditions })];
  }
  if (judgmentContext === 'verification_result') {
    const verifyNodes = resolveUpstreamNodesByType(workflow, nodeId, 'ai_verify');
    const vn = verifyNodes.length
      ? getWorkflowNodeVarName(verifyNodes[verifyNodes.length - 1], workflow)
      : 'verify';
    const ifConditions = [];
    ifConditions.push(judgmentCond(`${vn}.case.verifyResult`, 'passed'));
    return [createDecisionCase('if', { id: 'if', label: '自動パス', conditions: ifConditions })];
  }
  if (judgmentContext === 'processing_completion') {
    const ifConditions = [];
    resolveUpstreamNodesByType(workflow, nodeId, 'ai_verify').forEach((n) => {
      ifConditions.push(judgmentCond(`${getWorkflowNodeVarName(n, workflow)}.case.verifyResult`, 'passed'));
    });
    if (!resolveUpstreamNodesByType(workflow, nodeId, 'ai_verify').length) {
      ifConditions.push(judgmentCond('verify.case.verifyResult', 'passed'));
    }
    return [createDecisionCase('if', { id: 'if', label: '承認・完結', conditions: ifConditions })];
  }
  return [createDecisionCase('if', { id: 'if', label: 'IF', conditions: [judgmentCond('')] })];
}

const HITL_GATE_PRESET_VALUES = ['preprocess_hitl', 'ocr_hitl', 'verify_hitl', 'deficiency_hitl', 'custom'];
const CONDITION_NODE_PRESET_VALUES = JUDGMENT_CONTEXT_OPTIONS.map((o) => o.value);

/** 控制类 Gateway 判断类型 */
const GATEWAY_JUDGMENT_TYPES = [
  { value: 'branch', label: '条件分岐', desc: 'YES/NO で次ノードを切り替え' },
  { value: 'wait', label: '待機', desc: '条件成立またはタイムアウトまで待機' },
  { value: 'pass', label: 'パススルー', desc: '評価のみ記録し常に次工程へ' },
  { value: 'return', label: '差し戻し', desc: '条件成立時に指定ノードへ戻す' },
];

const GATEWAY_CONDITION_LOGIC = [
  { value: 'and', label: 'AND（すべて満たす）' },
  { value: 'or', label: 'OR（いずれか満たす）' },
];

const GATEWAY_TIMEOUT_STRATEGIES = [
  { value: 'continue', label: 'タイムアウト後も次工程へ' },
  { value: 'hitl', label: 'タイムアウト後 HITL へ' },
  { value: 'fail', label: 'タイムアウトで案件エラー' },
];

const GATEWAY_RERUN_POLICIES = [
  { value: 'none', label: '再実行なし（次工程へ）' },
  { value: 'upstream', label: '直前ノードから再実行' },
  { value: 'return_node', label: '指定ノードから再実行' },
];

const GATEWAY_THRESHOLD_PRESETS = new Set(['ocr_hitl', 'preprocess_hitl']);

const HITL_GATE_PRESETS = HITL_CONTEXT_OPTIONS;
const CONDITION_NODE_PRESETS = JUDGMENT_CONTEXT_OPTIONS;

function getGatewayTypeMeta(gatewayType) {
  return GATEWAY_JUDGMENT_TYPES.find((t) => t.value === gatewayType) || GATEWAY_JUDGMENT_TYPES[0];
}

function decisionUsesThreshold(node) {
  return node?.type === 'decision' && GATEWAY_THRESHOLD_PRESETS.has(node.conditionType);
}

function getDecisionDefaultThreshold(node) {
  if (node?.conditionType === 'ocr_hitl') return 80;
  if (node?.conditionType === 'preprocess_hitl') return 200;
  return null;
}

function inferHitlGateConditionType(node) {
  if (node?.conditionType && HITL_GATE_PRESET_VALUES.includes(node.conditionType)) return node.conditionType;
  if (node?.type === 'ocr_confirm') return 'ocr_hitl';
  if (node?.type === 'verify_confirm') return 'verify_hitl';
  if (node?.type === 'confirm') return 'verify_hitl';
  return 'verify_hitl';
}

function getHitlGateDefaultRole(hitlContext) {
  return HITL_CONTEXT_DEFAULT_ROLE[hitlContext] || 'operator';
}

function isHitlGateNode(node) {
  return node?.type === 'hitl_gate'
    || ['ocr_confirm', 'verify_confirm', 'confirm'].includes(node?.type);
}

function getHitlGatePreset(node, workflow = null) {
  if (!node) return null;
  const hitlContext = inferHitlContext(node, workflow);
  return getHitlContextMeta(hitlContext);
}

function normalizeHitlGateActionValue(action) {
  const raw = String(action || '').trim();
  if (HITL_ACTION_OPTIONS.some((o) => o.value === raw)) return raw;
  return HITL_LEGACY_ACTION_MAP[raw] || '';
}

function normalizeHitlGateActions(actions) {
  const list = Array.isArray(actions)
    ? actions.map(normalizeHitlGateActionValue).filter(Boolean)
    : [];
  const unique = HITL_DEFAULT_ACTIONS.filter((value) => list.includes(value));
  return unique.length === HITL_DEFAULT_ACTIONS.length ? unique : [...HITL_DEFAULT_ACTIONS];
}

function getHitlGateActionLabel(action) {
  return HITL_ACTION_OPTIONS.find((o) => o.value === action)?.label || action || '';
}

function getHitlGateBranchEdgeLabel(branch, node = null) {
  return getHitlGateActionLabel(normalizeHitlGateActionValue(branch));
}

const HITL_GATE_LAYOUT = {
  minW: 280,
  headerH: 56,
  // 画布已去掉节点摘要行，出口「+」须按 header + branches 对齐，不再预留 summary 高度
  summaryH: 0,
  bodyPadTop: 0,
  bodyPadBottom: 22,
  rowGap: 8,
  rowH: 40,
  labelCharW: 8,
  summaryCharW: 7,
};

function getHitlGateNodeLayoutMetrics(node, canvasSummary = '') {
  const actions = normalizeHitlGateActions(node?.actions);
  const { minW, headerH, summaryH, bodyPadTop, bodyPadBottom, rowGap, rowH, labelCharW, summaryCharW } = HITL_GATE_LAYOUT;
  let maxLabelLen = 0;
  actions.forEach((action) => {
    maxLabelLen = Math.max(maxLabelLen, getHitlGateActionLabel(action).length);
  });
  const summaryLen = String(canvasSummary || '').length;
  // 摘要不在卡片内展示；高度计算始终不计入 summaryH，仅宽度可参考文案长度
  const effectiveSummaryH = 0;
  const cardW = Math.max(
    minW,
    56 + maxLabelLen * labelCharW,
    summaryLen ? 76 + summaryLen * summaryCharW : 0,
  );
  const branchesH = actions.length * rowH + Math.max(0, actions.length - 1) * rowGap;
  const shellH = headerH + effectiveSummaryH + bodyPadTop + branchesH + bodyPadBottom;
  const branchStartY = headerH + effectiveSummaryH + bodyPadTop;
  const rows = actions.map((action, index) => {
    const yCenter = Math.round(
      branchStartY + index * (rowH + rowGap) + rowH / 2,
    );
    return {
      key: action,
      index,
      label: getHitlGateActionLabel(action),
      yCenter,
      rowH,
      ratio: yCenter / shellH,
    };
  });
  return {
    w: cardW,
    h: shellH,
    cardW,
    cardH: shellH,
    headerH,
    branchStartY,
    branchLaneW: 0,
    branchGapW: 0,
    branchesH,
    rows,
  };
}

function getHitlGateNodeBranches(node) {
  return getHitlGateNodeLayoutMetrics(node).rows.map((row) => ({
    key: row.key,
    index: row.index,
    label: row.label,
    ratio: row.ratio,
    yCenter: row.yCenter,
  }));
}

function getHitlGateBranchIndex(node, branchKey) {
  const branches = getHitlGateNodeBranches(node);
  const match = branches.find((b) => b.key === branchKey);
  return match?.index ?? branches.findIndex((b) => b.key === branchKey);
}

/** 已接下游连线的出口 action 键（去重） */
function getHitlGateConnectedBranchKeys(workflow, nodeId) {
  return [...new Set(
    (workflow?.edges || [])
      .filter((e) => e.from === nodeId && e.branch && !e.visualHidden)
      .map((e) => normalizeHitlGateActionValue(e.branch))
      .filter(Boolean),
  )];
}

/** 运行时/待办仅提供已接线的 action；配置期若尚未接线则仍展示全部出口供连接 */
function getHitlGateEnabledActions(workflow, node) {
  if (!node?.id) return [...HITL_DEFAULT_ACTIONS];
  const connected = getHitlGateConnectedBranchKeys(workflow, node.id);
  return connected.length ? connected : [...HITL_DEFAULT_ACTIONS];
}

function isHitlGateBranchNode(node) {
  return isHitlGateNode(node);
}

function normalizeHitlGateNode(node, workflow = null) {
  if (!isHitlGateNode(node)) return node;
  const hitlContext = inferHitlContext(node, workflow);
  return normalizeHitlWaitConfig({
    ...node,
    type: 'hitl_gate',
    hitlContext,
    label: node.label || '人工確認',
    role: normalizeHitlGateRole(node.role, getHitlGateDefaultRole(hitlContext)),
    actions: normalizeHitlGateActions(node.actions),
    description: node.description || '',
  });
}

function normalizeNotifyNode(node, workflow = null) {
  if (node?.type !== 'notify') return node;
  const template = migrateNotifyTemplate(node.template);
  const defaults = getNotifyTemplateDefaults(template, workflow, node.id);
  const channel = NOTIFY_CHANNELS.some((item) => item.value === node.channel) ? node.channel : 'system';
  const { supplementEventEnabled, ...rest } = node;
  const subjectRaw = node.subject != null && String(node.subject).trim() !== ''
    ? node.subject
    : defaults.subject;
  const bodyRaw = node.body != null && String(node.body).trim() !== ''
    ? node.body
    : defaults.body;
  return {
    ...rest,
    type: 'notify',
    label: node.label || '通知',
    template,
    channel,
    recipients: normalizeNotifyRecipients(node.recipients, channel),
    subject: migrateNotifyLegacyTokens(subjectRaw, template, workflow, node.id),
    body: migrateNotifyLegacyTokens(bodyRaw, template, workflow, node.id),
  };
}

const CODE_PARAM_DATA_TYPES = [
  { value: 'string', label: 'string' },
  { value: 'int', label: 'int' },
  { value: 'dict', label: 'dict' },
  { value: 'array', label: 'array' },
  { value: 'float', label: 'float' },
];

/** 自定义函数入参默认 source：开始节点 files[] JSON */
const CODE_UPSTREAM_FILES_JSON = '__upstream_files_json__';

const CODE_PARAM_SOURCES = [
  { value: 'upstream_files_json', label: 'start.files[]' },
  { value: 'reference', label: '参照変数' },
];

/** @deprecated use CODE_PARAM_DATA_TYPES */
const CODE_OUTPUT_TYPES = CODE_PARAM_DATA_TYPES;

function migrateCodeDataType(value) {
  const legacy = {
    number: 'float',
    object: 'dict',
    boolean: 'string',
    String: 'string',
    Number: 'float',
    Object: 'dict',
    Array: 'array',
    文字列: 'string',
    整数: 'int',
    浮動小数: 'float',
    辞書: 'dict',
    配列: 'array',
  };
  const mapped = legacy[value] || String(value || '').toLowerCase();
  return CODE_PARAM_DATA_TYPES.some((t) => t.value === mapped) ? mapped : 'string';
}

function getCodeParamDataTypeLabel(value) {
  return CODE_PARAM_DATA_TYPES.find((t) => t.value === value)?.label || value || 'string';
}

function getCodeParamSourceLabel(value) {
  return CODE_PARAM_SOURCES.find((s) => s.value === value)?.label || 'start.files[]';
}

function isCodeUpstreamFilesJsonSource(variable) {
  return !variable || variable === CODE_UPSTREAM_FILES_JSON;
}

const DEFAULT_CODE_PYTHON = `function main(inputs) {
  const files = Array.isArray(inputs.files) ? inputs.files : [];

  // 確認済みの帳票タイプ ID とファイルコード。
  const documentCodeMap = {
    "2080100341838004224": "HA21-002", // 保険金請求書
    "2080101367659905024": "HE06-001", // 診断書
    "2080103253066661888": "HM01-001", // 診療明細書
    "2079754599596376064": "HE02-001" // 入院・通院・手術状況報告書
  };

  const safe = (value, fallback) => {
    const result = String(value == null ? "" : value)
      .trim()
      .replace(/[\\\\/:*?"<>|\\s]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return result || fallback;
  };

  const now = new Date();
  const timestamp = [
    String(now.getFullYear()).slice(-2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");

  // 現在の設定名 claimno と、将来の claimNo の両方に対応する。
  const claimNo = safe(
    inputs.claimNo || inputs.claimno,
    "NO-CLAIM"
  );
  const requestNo = safe(inputs.requestNo, "NO-REQUEST");

  const branchCounts = {};

  const renamedFiles = files.map((file) => {
    const caseFileId =
      file.caseFileId != null ? file.caseFileId : file.id;

    const documentTypeId = String(file.documentTypeId || "UNKNOWN");

    // コード未設定時は帳票タイプ ID を使用し、ノードの実行失敗を防ぐ。
    const documentCode =
      documentCodeMap[documentTypeId] ||
      "DOC-" + safe(documentTypeId, "UNKNOWN").slice(-8);

    branchCounts[documentCode] =
      (branchCounts[documentCode] || 0) + 1;

    const branchNo = String(
      branchCounts[documentCode]
    ).padStart(2, "0");

    const originalFileName = String(file.fileName || "");
    const extensionIndex = originalFileName.lastIndexOf(".");
    const extension =
      extensionIndex >= 0
        ? originalFileName.slice(extensionIndex)
        : ".pdf";

    return {
      caseFileId: caseFileId,
      fileId: caseFileId,
      aiFileId: file.aiFileId,
      documentTypeId: documentTypeId,
      originalFileName: originalFileName,
      fileName: [
        timestamp,
        claimNo,
        requestNo,
        documentCode,
        branchNo
      ].join("_") + extension
    };
  });

  return {
    files: renamedFiles,
    renamedFileCount: renamedFiles.length
  };
}
`;

let codeParamIdSequence = 0;

function newCodeParamId(prefix) {
  codeParamIdSequence += 1;
  return `${newRuleId(prefix)}_${codeParamIdSequence.toString(36)}`;
}

function createCodeInputRow(index = 0) {
  return {
    id: newCodeParamId('cin'),
    name: `input_${index + 1}`,
    dataType: 'dict',
    source: 'upstream_files_json',
    variable: CODE_UPSTREAM_FILES_JSON,
  };
}

function createDefaultCodeInputRows() {
  return [
    {
      id: newCodeParamId('cin'),
      name: 'files',
      dataType: 'array',
      source: 'upstream_files_json',
      variable: CODE_UPSTREAM_FILES_JSON,
    },
    {
      id: newCodeParamId('cin'),
      name: 'claimno',
      dataType: 'string',
      source: 'reference',
      variable: 'docTypes.保険請求書.証券番号',
    },
    {
      id: newCodeParamId('cin'),
      name: 'requestNo',
      dataType: 'string',
      source: 'reference',
      variable: 'docTypes.保険請求書.請求番号',
    },
  ];
}

function createCodeOutputRow() {
  return { id: newCodeParamId('cout'), name: 'result', dataType: 'dict' };
}

function createCodeParamDialogDraft(mode = 'input') {
  if (mode === 'output') {
    return { id: '', name: '', dataType: 'string' };
  }
  return {
    id: '',
    name: '',
    dataType: 'dict',
    source: 'upstream_files_json',
    variable: CODE_UPSTREAM_FILES_JSON,
  };
}

function normalizeCodeInputRow(row, index = 0) {
  const variable = row?.variable || CODE_UPSTREAM_FILES_JSON;
  const filesJson = isCodeUpstreamFilesJsonSource(variable)
    || row?.source === 'upstream_files_json';
  return {
    id: row?.id || newCodeParamId('cin'),
    name: (row?.name || '').trim() || `input_${index + 1}`,
    dataType: migrateCodeDataType(row?.dataType || row?.type || (filesJson ? 'dict' : 'string')),
    source: filesJson ? 'upstream_files_json' : 'reference',
    variable: filesJson ? CODE_UPSTREAM_FILES_JSON : variable,
  };
}

function normalizeCodeOutputRow(row, index = 0) {
  const dataType = migrateCodeDataType(row?.dataType || row?.type || 'dict');
  return {
    id: row?.id || newCodeParamId('cout'),
    name: (row?.name || '').trim() || (index === 0 ? 'result' : `output_${index + 1}`),
    dataType,
  };
}

function ensureUniqueCodeParamIds(rows, prefix) {
  const usedIds = new Set();
  return rows.map((row) => {
    const id = row.id && !usedIds.has(row.id) ? row.id : newCodeParamId(prefix);
    usedIds.add(id);
    return id === row.id ? row : { ...row, id };
  });
}

function isLegacyDefaultCodeScript(code) {
  const source = String(code || '');
  const legacyExcelTemplate = source.includes('// Excel の命名例:')
    && source.includes('timestamp_seq_setNo_claimNo_requestNo_docId_branch_ocrFlag.pdf');
  const chineseCommentTemplate = source.includes('// 已确认的账票类型 ID 与文件代码。')
    && source.includes('"2080100341838004224": "HA21-002"')
    && source.includes('renamedFileCount: renamedFiles.length');
  return legacyExcelTemplate || chineseCommentTemplate;
}

function localizeDefaultCodeScriptComments(code) {
  return String(code || '')
    .replace(/\/\/\s*已确认的账票类型\s*ID\s*与文件代码。?/g, '// 確認済みの帳票タイプ ID とファイルコード。')
    .replace(/\/\/\s*当前配置保存的是\s*claimno，兼容后续改成\s*claimNo\s*的情况。?/g, '// 現在の設定名 claimno と、将来の claimNo の両方に対応する。')
    .replace(/\/\/\s*未配置代码时使用稳定的账票类型\s*ID，避免节点执行失败。?/g, '// コード未設定時は帳票タイプ ID を使用し、ノードの実行失敗を防ぐ。');
}

function normalizeCodeNode(node, workflow = null) {
  if (node?.type !== 'code') return node;
  const migrateLegacyDefault = isLegacyDefaultCodeScript(node.pythonCode);
  const normalizedInputs = Array.isArray(node.inputs) && (node.inputs.length || !migrateLegacyDefault)
    ? node.inputs.map((row, index) => normalizeCodeInputRow(row, index))
    : createDefaultCodeInputRows();
  const inputs = ensureUniqueCodeParamIds(normalizedInputs, 'cin');
  const outputParams = [];
  const withVar = ensureWorkflowNodeVarName({
    ...node,
    type: 'code',
    label: node.label || 'カスタム関数',
    pythonCode: !migrateLegacyDefault && node.pythonCode != null && String(node.pythonCode).trim() !== ''
      ? localizeDefaultCodeScriptComments(node.pythonCode)
      : DEFAULT_CODE_PYTHON,
    inputs,
    outputParams,
    returnContent: false,
  }, workflow);
  return withVar;
}

function buildCodeSourceVariableOptions(workflow, nodeId, sceneContext = null) {
  const options = [];

  const startNode = getWorkflowStartNode(workflow);
  if (startNode) {
    getWorkflowNodeOutputVarItems(startNode, workflow).forEach((item) => {
      const localId = String(item.localId || item.id || '').split('.').pop() || item.id;
      appendDecisionVarOption(options, {
        group: '開始ノード',
        nodeType: 'start',
        nodeId: startNode.id,
        varName: getWorkflowNodeVarName(startNode, workflow),
        localId,
        scope: item.scope || '案件',
        dataType: item.type || '',
        description: item.description || item.label,
        value: item.id === 'files[]' ? CODE_UPSTREAM_FILES_JSON : item.path,
        label: localId,
        displayName: localId,
        hint: item.token || `{${item.path}}`,
        consumptionPaths: item.consumptionPaths || [],
        consumptionPathLabel: item.consumptionPathLabel || '',
        pickerGroup: 'node',
      });
    });
  }

  buildDecisionVariableCatalog(workflow, nodeId, null, sceneContext).forEach((item) => {
    appendDecisionVarOption(options, {
      ...item,
      label: item.label,
      displayName: item.displayName,
      consumptionPaths: [WORKFLOW_VAR_CONSUMPTION.TODO],
      consumptionPathLabel: formatWorkflowVarConsumptionLabels([WORKFLOW_VAR_CONSUMPTION.TODO]),
    });
  });
  return options;
}

function buildCodeVariableOptions(workflow, nodeId, sceneContext = null) {
  return buildCodeSourceVariableOptions(workflow, nodeId, sceneContext);
}

function formatCodeInputVariableToken(variable) {
  if (isCodeUpstreamFilesJsonSource(variable)) return 'start.files[]';
  if (!variable) return '—';
  return variable.includes('.') && !variable.startsWith('{') ? `{${variable}}` : variable;
}

function formatCodeInputRowDisplay(row) {
  if (!row) return '—';
  if (row.source === 'upstream_files_json' || isCodeUpstreamFilesJsonSource(row.variable)) {
    return 'start.files[]';
  }
  return formatCodeInputVariableToken(row.variable);
}

function migrateHitlDecisionsInWorkflow(workflow) {
  if (!workflow?.nodes?.length) return;
  workflow.nodes.forEach((node, idx) => {
    if (node.type !== 'decision') return;
    if (!HITL_GATE_PRESET_VALUES.includes(node.conditionType)) return;
    if (node.conditionType === 'custom') return;
    const outEdges = (workflow.edges || []).filter((e) => e.from === node.id);
    const elseEdge = outEdges.find((e) => e.branch === 'else') || outEdges.find((e) => !e.branch);
    const elseTarget = elseEdge?.to;
    workflow.nodes[idx] = normalizeHitlGateNode({ ...node, type: 'hitl_gate' });
    workflow.edges = (workflow.edges || []).filter((e) => e.from !== node.id);
    if (elseTarget) {
      workflow.edges.push({
        from: node.id,
        to: elseTarget,
        branch: 'approve',
        label: getHitlGateBranchEdgeLabel('approve'),
      });
    }
  });
}

const HITL_RESULT_DECISION_BRANCH_MAP = {
  if: 'approve',
  'elif-edit': 'approve',
  'elif-deficiency': 'request_supplement',
  else: 'reject',
};

function migrateHitlResultDecisionNodes(workflow) {
  if (!workflow?.nodes?.length) return;
  const resultNode = (workflow.nodes || []).find((n) =>
    n.id === 'wf-d-hitl-result' && n.type === 'decision');
  if (!resultNode) return;

  const hitlFinal = (workflow.nodes || []).find((n) => n.id === 'wf-hu-final' && isHitlGateNode(n));
  if (!hitlFinal) return;

  const resultEdges = (workflow.edges || []).filter((e) => e.from === resultNode.id);
  workflow.edges = (workflow.edges || []).filter((e) =>
    e.from !== resultNode.id && e.to !== resultNode.id);
  workflow.nodes = workflow.nodes.filter((n) => n.id !== resultNode.id);

  resultEdges.forEach((edge) => {
    const action = HITL_RESULT_DECISION_BRANCH_MAP[edge.branch] || normalizeHitlGateActionValue(edge.branch);
    if (!action) return;
    if (workflow.edges.some((e) => e.from === hitlFinal.id && e.branch === action)) return;
    workflow.edges.push({
      from: hitlFinal.id,
      to: edge.to,
      branch: action,
      label: getHitlGateBranchEdgeLabel(action, hitlFinal),
    });
  });
}

function migrateHitlGateMainEdges(workflow) {
  if (!workflow?.nodes?.length) return;
  (workflow.nodes || []).filter(isHitlGateNode).forEach((hitl) => {
    const outEdges = (workflow.edges || []).filter((e) => e.from === hitl.id);
    const mainEdges = outEdges.filter((e) => !e.branch);
    if (mainEdges.length !== 1) return;
    const target = mainEdges[0].to;
    workflow.edges = workflow.edges.filter((e) => !(e.from === hitl.id && !e.branch));
    if (workflow.edges.some((e) => e.from === hitl.id && e.branch === 'approve')) return;
    workflow.edges.push({
      from: hitl.id,
      to: target,
      branch: 'approve',
      label: getHitlGateBranchEdgeLabel('approve', hitl),
    });
  });
}

function migrateHitlGateEdges(workflow) {
  const nodeMap = Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n]));
  (workflow?.edges || []).forEach((edge) => {
    const from = nodeMap[edge.from];
    if (!isHitlGateNode(from) || !edge.branch) return;
    const action = normalizeHitlGateActionValue(edge.branch);
    if (action) edge.branch = action;
    edge.label = getHitlGateBranchEdgeLabel(edge.branch, from);
  });
}

function sanitizeHitlGateEdges(workflow) {
  if (!workflow?.edges?.length) return;
  const nodeMap = Object.fromEntries((workflow.nodes || []).map((n) => [n.id, n]));
  workflow.edges = workflow.edges.filter((edge) => {
    const from = nodeMap[edge.from];
    const to = nodeMap[edge.to];
    if (!isHitlGateNode(from)) return true;
    if (!edge.branch) return false;
    if (!normalizeHitlGateActions(from.actions).includes(edge.branch)) return false;
    if (edge.branch === 'reject') return false;
    if (edge.branch === 'request_supplement') {
      return !!to && workflowCanReach(workflow, to.id, from.id, edge);
    }
    return true;
  });
  const seen = new Set();
  workflow.edges = workflow.edges.filter((edge) => {
    const from = nodeMap[edge.from];
    if (!isHitlGateNode(from) || !edge.branch) return true;
    const key = `${edge.from}|${edge.branch}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  migrateHitlGateEdges(workflow);
}

const DECISION_RESULT_VALUES = [
  { value: '1', label: '1（命中）' },
  { value: '0', label: '0（违反）' },
];

const DECISION_OPERATORS = [
  { value: 'is', label: '=', types: ['all'], placeholder: 'Enter value' },
  { value: 'is_not', label: '≠', types: ['all'], placeholder: 'Enter value' },
  { value: 'is_empty', label: 'is empty', types: ['all'], requiresValue: false },
  { value: 'is_not_empty', label: 'is not empty', types: ['all'], requiresValue: false },
  { value: 'is_true', label: 'true', types: ['boolean'], requiresValue: false },
  { value: 'is_false', label: 'false', types: ['boolean'], requiresValue: false },
  { value: 'greater_than', label: '>', types: ['number', 'date', 'datetime'], placeholder: 'Enter comparison value' },
  { value: 'greater_than_or_equal', label: '≥', types: ['number', 'date', 'datetime'], placeholder: 'Enter comparison value' },
  { value: 'less_than', label: '<', types: ['number', 'date', 'datetime'], placeholder: 'Enter comparison value' },
  { value: 'less_than_or_equal', label: '≤', types: ['number', 'date', 'datetime'], placeholder: 'Enter comparison value' },
  { value: 'between', label: 'between', types: ['number', 'date', 'datetime'], placeholder: 'Start value, end value' },
  { value: 'not_between', label: 'not between', types: ['number', 'date', 'datetime'], placeholder: 'Start value, end value' },
  { value: 'contains', label: 'contains', types: ['string', 'enum', 'array'], placeholder: 'Value to include' },
  { value: 'not_contains', label: 'not contains', types: ['string', 'enum', 'array'], placeholder: 'Value to exclude' },
  { value: 'starts_with', label: 'starts with', types: ['string'], placeholder: 'Prefix text' },
  { value: 'ends_with', label: 'ends with', types: ['string'], placeholder: 'Suffix text' },
  { value: 'matches_regex', label: 'matches regex', types: ['string'], placeholder: 'Regular expression' },
  { value: 'not_matches_regex', label: 'does not match regex', types: ['string'], placeholder: 'Regular expression' },
  { value: 'text_length_equals', label: 'length =', types: ['string'], placeholder: 'Character count' },
  { value: 'text_length_greater_than', label: 'length >', types: ['string'], placeholder: 'Character count' },
  { value: 'text_length_greater_than_or_equal', label: 'length ≥', types: ['string'], placeholder: 'Character count' },
  { value: 'text_length_less_than', label: 'length <', types: ['string'], placeholder: 'Character count' },
  { value: 'text_length_less_than_or_equal', label: 'length ≤', types: ['string'], placeholder: 'Character count' },
  { value: 'in', label: 'in', types: ['string', 'enum', 'number', 'date', 'datetime'], placeholder: 'Value 1, value 2, ...' },
  { value: 'not_in', label: 'not in', types: ['string', 'enum', 'number', 'date', 'datetime'], placeholder: 'Value 1, value 2, ...' },
  { value: 'within_last_days', label: 'within last N days', types: ['date', 'datetime'], placeholder: 'Days' },
  { value: 'older_than_days', label: 'older than N days', types: ['date', 'datetime'], placeholder: 'Days' },
  { value: 'length_equals', label: 'length =', types: ['array'], placeholder: 'Item count' },
  { value: 'length_greater_than', label: 'length >', types: ['array'], placeholder: 'Item count' },
  { value: 'length_greater_than_or_equal', label: 'length ≥', types: ['array'], placeholder: 'Item count' },
  { value: 'length_less_than', label: 'length <', types: ['array'], placeholder: 'Item count' },
  { value: 'length_less_than_or_equal', label: 'length ≤', types: ['array'], placeholder: 'Item count' },
  { value: 'contains_any', label: 'contains any', types: ['array'], placeholder: 'Value 1, value 2, ...' },
  { value: 'contains_all', label: 'contains all', types: ['array'], placeholder: 'Value 1, value 2, ...' },
  { value: 'has_key', label: 'has key', types: ['object'], placeholder: 'Key name' },
  { value: 'not_has_key', label: 'does not have key', types: ['object'], placeholder: 'Key name' },
  { value: 'json_path_exists', label: 'path exists', types: ['object'], placeholder: 'e.g. result.status' },
  { value: 'json_path_not_exists', label: 'path does not exist', types: ['object'], placeholder: 'e.g. result.status' },
  { value: 'json_path_equals', label: 'path value =', types: ['object'], placeholder: 'e.g. result.status = success' },
  { value: 'json_path_not_equals', label: 'path value ≠', types: ['object'], placeholder: 'e.g. result.status = failed' },
  { value: 'json_path_contains', label: 'path value contains', types: ['object'], placeholder: 'e.g. messages[] = issue' },
  { value: 'file_name_contains', label: 'file name contains', types: ['file'], placeholder: 'File name' },
  { value: 'file_name_not_contains', label: 'file name does not contain', types: ['file'], placeholder: 'File name' },
  { value: 'file_extension_is', label: 'extension =', types: ['file'], placeholder: 'pdf' },
  { value: 'file_extension_in', label: 'extension in', types: ['file'], placeholder: 'pdf, jpg, png' },
  { value: 'file_size_greater_than', label: 'size >', types: ['file'], placeholder: 'MB' },
  { value: 'file_size_less_than_or_equal', label: 'size ≤', types: ['file'], placeholder: 'MB' },
  { value: 'file_page_count_greater_than', label: 'page count >', types: ['file'], placeholder: 'Page count' },
  { value: 'file_page_count_less_than_or_equal', label: 'page count ≤', types: ['file'], placeholder: 'Page count' },
];

const DECISION_VALUELESS_OPERATORS = new Set(
  DECISION_OPERATORS.filter((op) => op.requiresValue === false).map((op) => op.value),
);
const DECISION_OPERATOR_VALUES = new Set(DECISION_OPERATORS.map((op) => op.value));
const DECISION_DEFAULT_OPERATOR_BY_TYPE = {
  boolean: 'is_true',
  number: 'is',
  date: 'is',
  datetime: 'is',
  string: 'is',
  enum: 'is',
  array: 'length_greater_than',
  object: 'is_not_empty',
  file: 'is_not_empty',
};

function normalizeDecisionDataType(dataType) {
  const raw = String(dataType || '').trim().toLowerCase();
  if (!raw) return 'string';
  if (['string', 'text', 'varchar', 'char'].includes(raw)) return 'string';
  if (['enum', 'select', 'status'].includes(raw)) return 'enum';
  if (['number', 'numeric', 'integer', 'int', 'float', 'double', 'decimal'].includes(raw)) return 'number';
  if (['boolean', 'bool'].includes(raw)) return 'boolean';
  if (['array', 'list'].includes(raw)) return 'array';
  if (['object', 'dict', 'json', 'map'].includes(raw)) return 'object';
  if (['file', 'document', 'image', 'pdf'].includes(raw)) return 'file';
  if (['date'].includes(raw)) return 'date';
  if (['datetime', 'timestamp', 'time'].includes(raw)) return 'datetime';
  return raw;
}

function isDecisionOperatorAvailableForType(operator, dataType = '') {
  const op = typeof operator === 'string'
    ? DECISION_OPERATORS.find((item) => item.value === operator)
    : operator;
  if (!op) return false;
  if (!String(dataType || '').trim()) return op.types?.includes('all');
  const type = normalizeDecisionDataType(dataType);
  return op.types?.includes('all') || op.types?.includes(type);
}

/** 条件节点禁用运算符（PRD 6.02.10.1 收敛版；多值用 AND/OR 组合多行） */
const DECISION_OPERATORS_EXCLUDED_FROM_CONDITION = new Set([
  'in',
  'not_in',
  'contains_any',
  'contains_all',
  'starts_with',
  'ends_with',
  'matches_regex',
  'not_matches_regex',
  'text_length_equals',
  'text_length_greater_than',
  'text_length_greater_than_or_equal',
  'text_length_less_than',
  'text_length_less_than_or_equal',
  'between',
  'not_between',
  'not_has_key',
  'json_path_exists',
  'json_path_not_exists',
  'json_path_equals',
  'json_path_not_equals',
  'json_path_contains',
  'file_name_contains',
  'file_name_not_contains',
  'file_extension_is',
  'file_extension_in',
  'file_size_greater_than',
  'file_size_less_than_or_equal',
  'file_page_count_greater_than',
  'file_page_count_less_than_or_equal',
  'within_last_days',
  'older_than_days',
]);

function getDecisionOperatorsForType(dataType = '', variableOption = null) {
  if (!String(dataType || '').trim()) {
    return DECISION_OPERATORS
      .filter((op) => op.types?.includes('all'))
      .filter((op) => !DECISION_OPERATORS_EXCLUDED_FROM_CONDITION.has(op.value));
  }
  const type = normalizeDecisionDataType(dataType);
  let options = DECISION_OPERATORS.filter((op) => isDecisionOperatorAvailableForType(op, type));
  options = options.filter((op) => !DECISION_OPERATORS_EXCLUDED_FROM_CONDITION.has(op.value));

  if (type === 'enum') {
    options = options.filter((op) => ['is', 'is_not'].includes(op.value));
  } else if (type === 'boolean') {
    options = options.filter((op) => ['is_true', 'is_false'].includes(op.value));
  } else if (type === 'string') {
    options = options.filter((op) => ['is', 'is_not', 'contains', 'not_contains', 'is_empty', 'is_not_empty'].includes(op.value));
  } else if (type === 'array') {
    options = [];
  } else if (type === 'object') {
    options = options.filter((op) => ['is_empty', 'is_not_empty'].includes(op.value));
  } else if (type === 'file') {
    options = [];
  } else if (type === 'date' || type === 'datetime') {
    options = [];
  }

  if (['array', 'file', 'date', 'datetime'].includes(type)) return [];

  return options.length
    ? options
    : DECISION_OPERATORS
      .filter((op) => op.types?.includes('all'))
      .filter((op) => !DECISION_OPERATORS_EXCLUDED_FROM_CONDITION.has(op.value));
}

function getDecisionDefaultOperator(dataType = '', variableOption = null) {
  if (!String(dataType || '').trim()) return 'is';
  const type = normalizeDecisionDataType(dataType);
  const preferred = DECISION_DEFAULT_OPERATOR_BY_TYPE[type] || 'is';
  return isDecisionOperatorAvailableForType(preferred, type)
    ? preferred
    : getDecisionOperatorsForType(dataType, variableOption)[0]?.value || 'is';
}

function normalizeDecisionOperatorForType(value, dataType = '', variableOption = null) {
  const raw = normalizeDecisionOperator(value);
  const available = getDecisionOperatorsForType(dataType, variableOption);
  if (available.some((op) => op.value === raw)) return raw;
  return getDecisionDefaultOperator(dataType, variableOption);
}

function normalizeDecisionOperator(value) {
  const raw = String(value || '').trim();
  if (DECISION_OPERATOR_VALUES.has(raw)) return raw;
  return 'is';
}

function getDecisionUpstreamNodeIds(workflow, nodeId) {
  const edges = workflow?.edges || [];
  const visited = new Set();
  const queue = [nodeId];
  const upstream = [];
  while (queue.length) {
    const current = queue.shift();
    edges.filter((e) => e.to === current).forEach((edge) => {
      if (visited.has(edge.from)) return;
      visited.add(edge.from);
      upstream.push(edge.from);
      queue.push(edge.from);
    });
  }
  return upstream;
}

function appendDecisionVarOption(options, spec) {
  const localId = spec.localId || String(spec.value || '').split('.').pop() || '';
  const consumptionPaths = spec.consumptionPaths?.length
    ? spec.consumptionPaths
    : getWorkflowVarConsumptionPaths({ ...spec, localId: spec.localId || localId });
  options.push({
    group: spec.group || 'Variables',
    nodeType: spec.nodeType || '',
    nodeId: spec.nodeId || '',
    varName: spec.varName || '',
    localId,
    scope: spec.scope || '',
    dataType: spec.dataType || spec.type || '',
    valueSpec: spec.valueSpec || '',
    description: spec.description || '',
    value: spec.value,
    label: spec.label,
    displayName: spec.displayName || localId || spec.value,
    hint: spec.hint || `{${spec.value}}`,
    pickerGroup: spec.pickerGroup || '',
    pickerDocType: spec.pickerDocType || '',
    pickerDocTypeLabel: spec.pickerDocTypeLabel || spec.pickerDocType || '',
    pickerField: spec.pickerField || '',
    pickerStandardFieldId: spec.pickerStandardFieldId || '',
    pickerStandardFieldLabel: spec.pickerStandardFieldLabel || '',
    consumptionPaths,
    consumptionPathLabel: formatWorkflowVarConsumptionLabels(consumptionPaths),
  });
}

function buildDecisionVariableCatalog(workflow, nodeId, verifyConfig = null, sceneContext = null) {
  const nodeMap = Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n]));
  const options = [];
  getDecisionUpstreamNodeIds(workflow, nodeId).forEach((id) => {
    const n = nodeMap[id];
    if (!n || n.type === 'decision') return;
    appendNodeOutputVarCatalog(n, workflow, options, 'condition');
    if (n.type === 'data_mapping') appendDataMappingStandardFieldCatalog(n, workflow, options);
  });
  const docTypes = sceneContext?.docTypes || [];
  const getDocSchemaFn = sceneContext?.getDocSchema;
  const getDocLabelFn = sceneContext?.getDocLabel;
  if (docTypes.length) {
    appendDocTypeFieldTemplateCatalog(docTypes, getDocSchemaFn, options, getDocLabelFn);
  }
  return options;
}

function dedupeNotifyVarOptions(options = []) {
  const seen = new Set();
  return options.filter((opt) => {
    const key = opt?.value || '';
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildNotifyVariableCatalog(workflow, nodeId, verifyConfig = null, sceneContext = null) {
  const nodeMap = Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n]));
  const options = [];
  getDecisionUpstreamNodeIds(workflow, nodeId).forEach((id) => {
    const n = nodeMap[id];
    if (!n || n.type === 'decision') return;
    appendNodeOutputVarCatalog(n, workflow, options, 'notify');
    // 通知は標準フィールドツリーを出さない（テンプレ差し込み用途に絞る）
  });
  // 通知は Step1 OCR フィールド cascade も出さない
  return dedupeNotifyVarOptions(options);
}

function getDecisionVariableOptionGroups(options) {
  const groups = [];
  const map = new Map();
  (options || []).forEach((opt) => {
    const key = opt.nodeId || opt.group || 'その他';
    if (!map.has(key)) {
      map.set(key, []);
      groups.push({
        id: key,
        label: opt.group || 'その他',
        nodeType: opt.nodeType || '',
        varName: opt.varName || '',
        options: map.get(key),
      });
    }
    map.get(key).push(opt);
  });
  return groups;
}

function isDecisionStatusVariable(value) {
  return /Status$/i.test(String(value || '').replace(/^\{|\}$/g, '').trim());
}

function getDecisionVariableOptions(workflow, nodeId, verifyConfig = null, sceneContext = null) {
  return buildDecisionVariableCatalog(workflow, nodeId, verifyConfig, sceneContext)
    .filter((option) => !isDecisionStatusVariable(option.value));
}

function getDecisionVariableLabel(value, options = []) {
  return options.find((o) => o.value === value)?.label || value || 'Variable';
}

function getDecisionVariableSecondaryLabel(option) {
  if (!option) return '';
  return String(option.displayName || option.localId || option.value || '').trim();
}

function formatDecisionVariableDisplay(value, options = []) {
  if (!value) return '';
  const opt = (options || []).find((o) => o.value === value);
  if (!opt) return String(value).trim();
  if (opt.pickerGroup === 'standard_field') {
    const fieldKey = opt.pickerStandardFieldId || opt.displayName || opt.label;
    const nodePart = opt.group || '';
    return [nodePart, '標準フィールド', fieldKey].filter(Boolean).join(' › ');
  }
  if (opt.pickerGroup === 'step1_doc') {
    return [
      opt.group || STEP1_DOCTYPE_FIELD_CASCADER_GROUP,
      opt.pickerDocTypeLabel || opt.pickerDocType,
      opt.pickerField || opt.displayName,
    ].filter(Boolean).join(' › ');
  }
  const nodePart = opt.group || '';
  const secondary = getDecisionVariableSecondaryLabel(opt);
  if (nodePart && secondary) return `${nodePart} › ${secondary}`;
  return secondary || String(value).trim();
}

function formatDecisionVariableCanvasDisplay(value, options = []) {
  if (!value) return '';
  const opt = (options || []).find((o) => o.value === value);
  if (!opt) return String(value).trim();
  return getDecisionVariableSecondaryLabel(opt) || String(value).trim();
}

function decisionUsesValueField(operator) {
  return !DECISION_VALUELESS_OPERATORS.has(operator);
}

function decisionUsesResultValue(operator) {
  return operator === 'is' || operator === 'is_not';
}

const DECISION_PRESET_VARIABLE = {
  case_ready: 'case.readiness',
  deficiency_hitl: 'case.completeness',
  preprocess_hitl: 'preprocess.status',
  ocr_hitl: 'ocr.confidence',
  verify_hitl: 'verify.status',
  verify_pass: 'verify.status',
  notify_required: 'case.deficiency',
  custom: 'custom',
};

/** プリセット YES 条件に対応する実行式（エンジン判定） */
const DECISION_PRESET_EXPRESSION = {
  case_ready: '{{case.readiness}} = OK',
  deficiency_hitl: '{{case.completeness}} = NG',
  preprocess_hitl: '{{preprocess.status}} = REVIEW_REQUIRED',
  ocr_hitl: 'ANY({{ocr.fields.confidence}}) < {{ocr.threshold}}',
  verify_hitl: '{{verify.status}} = NG OR {{master.match}} = UNMATCHED',
  verify_pass: '{{verify.status}} = PASS',
  notify_required: '{{case.has_deficiency}} = true',
};

function compileWorkflowYesExpression(yesRule, conditionType, docTypes = [], node = null) {
  const rule = (yesRule || '').trim();
  if (!rule && !conditionType) return '';
  if (/\{\{[^}]+\}\}/.test(rule)) return rule;
  const fromNatural = compileNaturalToExpression(rule, docTypes);
  if (fromNatural) return fromNatural;
  if (conditionType === 'ocr_hitl') {
    const threshold = node?.threshold ?? getDecisionDefaultThreshold({ conditionType: 'ocr_hitl' });
    return `ANY({{ocr.fields.confidence}}) < ${threshold}`;
  }
  if (conditionType === 'preprocess_hitl') {
    const minDpi = node?.threshold ?? getDecisionDefaultThreshold({ conditionType: 'preprocess_hitl' });
    return `{{preprocess.min_dpi}} < ${minDpi}`;
  }
  return DECISION_PRESET_EXPRESSION[conditionType] || '';
}

function syncWorkflowYesExpression(node, docTypes = []) {
  if (!node) return;
  const conditionType = node.conditionType
    || (node.type === 'decision' ? inferDecisionConditionType(node) : inferHitlGateConditionType(node));
  node.yesExpression = compileWorkflowYesExpression(node.yesRule, conditionType, docTypes, node);
  if (node.type === 'decision' && node.cases?.[0]?.conditions?.[0]) {
    node.cases[0].conditions[0].value = node.yesRule || '';
    node.cases[0].conditions[0].expression = node.yesExpression || '';
    node.cases[0].conditions[0].logic = node.conditionLogic || 'and';
  }
}

function getWorkflowYesExpression(node) {
  if (!node) return '';
  if (node.yesExpression?.trim()) return node.yesExpression.trim();
  const conditionType = node.conditionType
    || (node.type === 'decision' ? inferDecisionConditionType(node) : inferHitlGateConditionType(node));
  return DECISION_PRESET_EXPRESSION[conditionType] || '';
}

function createDecisionCondition(overrides = {}) {
  return {
    id: newRuleId('dc'),
    variable: '',
    operator: 'is',
    value: '',
    preset: '',
    ...overrides,
  };
}

function createDecisionCase(kind = 'if', overrides = {}) {
  return {
    id: kind === 'if' ? 'if' : newRuleId('elif'),
    kind,
    logic: 'and',
    conditions: [createDecisionCondition()],
    ...overrides,
  };
}

function normalizeDecisionCondition(condition) {
  const c = condition || {};
  return {
    id: c.id || newRuleId('dc'),
    variable: c.variable || '',
    operator: normalizeDecisionOperator(c.operator),
    value: c.value ?? '',
    preset: c.preset || '',
  };
}

function migrateDecisionVariableScope(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  return raw
    .replace(/\.documents\[\]\.documentCandidates$/g, '.case.fileCandidateCount')
    .replace(/\.documents\[\]\.classificationWarnings$/g, '.case.classificationWarnings')
    .replace(/\.documents\[\]\.classificationConfidence$/g, '.files[].classificationConfidence')
    .replace(/\.documents\[\]\.ocrFields/g, '.files[].ocrFields')
    .replace(/\.files\[\]\.ocrFields/g, '.files[].ocrFields')
    .replace(/\.case\.ocrFields\./g, 'docTypes.')
    .replace(/\.case\.ocrFields$/g, 'docTypes')
    .replace(/^[a-zA-Z0-9_]+\.docTypes\./, 'docTypes.')
    .replace(/\.documents\[\]\.standardFields/g, '.files[].standardFields')
    .replace(/\.documents\[\]\.masterMatchResults/g, '.files[].masterMatchResults')
    .replace(/\.documents\[\]\.validationResults/g, '.files[].validationResults')
    .replace(/\.documents\[\]\.manualEdits/g, '.files[].manualEdits')
    .replace(/\.fields\[\]\.sourceOcrFields$/g, '.docTypes')
    .replace(/\.fields\[\]\.masterCandidates$/g, '.files[].masterMatchResults')
    .replace(/\.rules\[\]\.validationResults$/g, '.files[].validationResults')
    .replace(/\.case\.standardFields\.([^.]+)\.(value|sourceFields|confidence)$/g, '.case.standardFields.$1');
}

function normalizeDecisionCase(decisionCase, index) {
  const kind = decisionCase?.kind || (index === 0 ? 'if' : 'elif');
  const conditions = decisionCase?.conditions?.length
    ? decisionCase.conditions.map(normalizeDecisionCondition)
    : [createDecisionCondition()];
  return {
    id: decisionCase?.id || (kind === 'if' ? 'if' : newRuleId('elif')),
    kind,
    label: decisionCase?.label || '',
    logic: decisionCase?.logic === 'or' ? 'or' : 'and',
    conditions,
  };
}

const DECISION_PRESET_UPSTREAM_TYPES = {
  case_ready: ['scene_completeness', 'scene_aggregate', 'case_link'],
  ocr_hitl: ['ocr'],
  verify_pass: ['ai_verify'],
  verify_hitl: ['ai_verify'],
  fraud_detect: ['fraud_detect'],
  preprocess_hitl: ['preprocess'],
  deficiency_hitl: ['scene_completeness'],
  notify_required: ['scene_completeness'],
  custom: [],
};

/** プリセット IF 条件の期待値：命中=1 / 违反=0 */
const DECISION_PRESET_IF_RESULT = {
  case_ready: '1',
  ocr_hitl: '1',
  verify_pass: '1',
  verify_hitl: '1',
  fraud_detect: '1',
  preprocess_hitl: '1',
  deficiency_hitl: '1',
  notify_required: '1',
  custom: '1',
};

function syncDecisionVariablesInWorkflow(workflow) {
  if (!workflow?.nodes?.length) return;
  workflow.nodes.filter((n) => n.type === 'decision').forEach((node) => {
    const options = getDecisionVariableOptions(workflow, node.id);
    if (!options.length) return;
    const optionValues = new Set(options.map((o) => o.value));
    const isAllowedVariable = (value) => optionValues.has(value)
      || options.some((o) => o.pickerGroup === 'step1_doc' && String(value || '').startsWith('docTypes.'))
      || options.some((o) => o.pickerGroup === 'standard_field' && String(value || '').startsWith(`${o.varName}.case.standardFields.`));
    (node.cases || []).forEach((c) => {
      (c.conditions || []).forEach((cond) => {
        cond.variable = migrateDecisionVariableScope(cond.variable);
        if (isDecisionStatusVariable(cond.variable)) return;
        if (!cond.variable || !isAllowedVariable(cond.variable)) {
          const preset = cond.preset || node.conditionType;
          const resolved = resolveDecisionPresetVariable(workflow, node.id, preset);
          cond.variable = resolved && isAllowedVariable(resolved) ? resolved : options[0].value;
        }
        const baseOption = options.find((o) => o.value === cond.variable)
          || options.find((o) => String(o.value || '').includes('ocrFields') && String(cond.variable || '').startsWith(`${o.value}.`));
        const dataType = String(cond.variable || '').includes('.ocrFields.') ? 'String' : (baseOption?.dataType || '');
        cond.operator = normalizeDecisionOperatorForType(cond.operator, dataType);
        if (!decisionUsesValueField(cond.operator)) {
          cond.value = '';
        } else if (cond.value === '' || cond.value == null) {
          cond.value = inferDecisionConditionValue(cond, c);
        } else {
          cond.value = migrateDecisionConditionValue(cond);
        }
      });
    });
  });
}

function inferDecisionConditionValue(condition, decisionCase = null) {
  const variable = String(condition?.variable || '');
  const branchText = `${decisionCase?.label || ''} ${decisionCase?.id || ''}`;
  if (/(preprocess|ocr|mapping|verify)Status$/.test(variable)) {
    if (branchText.includes('異常')) return 'failed';
    return 'success';
  }
  if (/(preprocess|ocr|mapping|verify)Result$/.test(variable)) {
    if (branchText.includes('補件') || branchText.includes('不足') || branchText.includes('確認')) return 'reviewRequired';
    return 'passed';
  }
  if (/ReviewRequired$/.test(variable)) return branchText.includes('確認') ? 'true' : 'false';
  return '';
}

function migrateDecisionConditionValue(condition) {
  if (!condition) return '';
  const variable = String(condition.variable || '');
  let value = condition.value ?? '';
  if (/(preprocess|ocr|mapping|verify)Status$/.test(variable)) {
    if (value === 'passed' || value === 'reviewRequired' || value === 'skipped') return 'success';
    if (value === 'missing') return 'failed';
  }
  if (/(preprocess|ocr|mapping|verify)Result$/.test(variable)) {
    if (value === 'success') return 'passed';
    if (value === 'missing') return 'reviewRequired';
  }
  return value;
}

function resolveDecisionPresetVariable(workflow, nodeId, presetValue) {
  const options = getDecisionVariableOptions(workflow, nodeId);
  const types = DECISION_PRESET_UPSTREAM_TYPES[presetValue] || [];
  for (const nodeType of types) {
    const match = options.find((o) => o.nodeType === nodeType);
    if (match) return match.value;
  }
  return options[0]?.value || '';
}

function buildDecisionCasesFromPreset(presetValue, workflow, nodeId, verifyConfig = null) {
  const judgmentContext = JUDGMENT_CONTEXT_OPTIONS.some((o) => o.value === presetValue)
    ? presetValue
    : inferJudgmentContext({ judgmentContext: presetValue, conditionType: presetValue });
  if (judgmentContext === 'custom') {
    return [createDecisionCase('if', { id: 'if', label: 'IF' })];
  }
  return buildJudgmentCasesFromContext(judgmentContext, workflow, nodeId, verifyConfig);
}

function inferDecisionConditionType(node) {
  return inferJudgmentContext(node);
}

function buildDecisionCasesFromLegacy(node, preset, workflow = null, verifyConfig = null) {
  if (Array.isArray(node?.cases) && node.cases.length) {
    return node.cases.map((c, i) => normalizeDecisionCase(c, i));
  }
  return [createDecisionCase('if', { id: 'if', label: 'IF' })];
}

function normalizeDecisionNode(node, workflow = null, verifyConfig = null) {
  if (node?.type !== 'decision') return node;
  let cases = buildDecisionCasesFromLegacy(node, null, workflow, verifyConfig);
  if (workflow && node.id) {
    const options = buildDecisionVariableCatalog(workflow, node.id, verifyConfig);
    const optionValues = new Set(options.map((o) => o.value));
    const optionMap = Object.fromEntries(options.map((o) => [o.value, o]));
    const resolveDecisionConditionVariable = (rawValue) => {
      const migrated = migrateDecisionVariableScope(rawValue);
      if (migrated && optionValues.has(migrated)) return migrated;
      const ocrBase = options.find((o) => String(o.value || '').includes('ocrFields') && String(migrated || '').startsWith(`${o.value}.`));
      if (ocrBase) return migrated;
      return options.find((o) => o.nodeType && migrated?.startsWith(o.varName))?.value || options[0]?.value || migrated;
    };
    const resolveDecisionConditionDataType = (variable) => {
      if (String(variable || '').includes('.ocrFields.')) return 'String';
      const ocrBase = options.find((o) => String(o.value || '').includes('ocrFields') && String(variable || '').startsWith(`${o.value}.`));
      return optionMap[variable]?.dataType || ocrBase?.dataType || '';
    };
    cases = cases.map((c) => ({
      ...c,
      conditions: c.conditions.map((cond) => {
        const variable = resolveDecisionConditionVariable(cond.variable);
        const dataType = resolveDecisionConditionDataType(variable);
        const operator = normalizeDecisionOperatorForType(cond.operator, dataType);
        return {
          ...cond,
          variable,
          operator,
          value: decisionUsesValueField(operator) && (cond.value === '' || cond.value == null)
            ? inferDecisionConditionValue({ ...cond, variable, operator }, c)
            : migrateDecisionConditionValue({ ...cond, variable, operator }),
        };
      }),
    }));
  }
  return {
    ...node,
    label: getWorkflowNodeMeta('decision').title,
    description: node.description || '',
    judgmentContext: 'custom',
    conditionType: 'custom',
    gatewayType: 'branch',
    conditionLogic: node.conditionLogic || 'and',
    waitCondition: '',
    timeoutMinutes: 0,
    timeoutStrategy: 'continue',
    returnTargetId: '',
    rerunPolicy: 'none',
    rerunTargetId: '',
    cases,
    elseLabel: node.elseLabel || 'ELSE',
    elseDescription: node.elseDescription || node.elseLabel || '条件に該当しない場合',
    outputVar: 'branch_name',
  };
}

function getDecisionPreset(node) {
  if (!node || node.type !== 'decision') return null;
  const judgmentContext = inferJudgmentContext(node);
  return JUDGMENT_CONTEXT_OPTIONS.find((o) => o.value === judgmentContext)
    || JUDGMENT_CONTEXT_OPTIONS[0];
}

function getDecisionYesExpression(node, docTypes = []) {
  if (!node || node.type !== 'decision') return '';
  if (node.yesExpression) return node.yesExpression;
  const preset = getDecisionPreset(node);
  if (preset && preset.value !== 'custom') {
    return compileWorkflowYesExpression('', preset.value, docTypes, node);
  }
  return (node.yesRule || '').trim();
}

function getDecisionConditionDisplay(node, docTypes = [], variableOptions = []) {
  const firstCase = node?.cases?.[0];
  if (firstCase) return decisionConditionPreview(firstCase, variableOptions);
  return '条件未設定';
}

function decisionConditionPreview(decisionCase, variableOptions = []) {
  const conditions = decisionCase?.conditions || [];
  if (!conditions.length) return 'Condition NOT setup';
  const parts = conditions.map((c) => {
    const opt = (variableOptions || []).find((o) => o.value === c.variable);
    const variable = opt?.label
      || formatDecisionVariableCanvasDisplay(c.variable, variableOptions)
      || formatDecisionVariableDisplay(c.variable, variableOptions)
      || '—';
    const operator = DECISION_OPERATORS.find((o) => o.value === c.operator)?.label || c.operator;
    if (!decisionUsesValueField(c.operator)) return `${variable} ${operator}`;
    const value = c.value ? c.value : '…';
    return `${variable} ${operator} ${value}`;
  });
  return parts.join(` ${decisionCase?.logic === 'or' ? 'OR' : 'AND'} `);
}

function getDecisionCaseCanvasPreview(node, decisionCase) {
  if (!decisionCase?.conditions?.some((c) => c.variable)) return '条件未設定';
  if (decisionCase.label) return decisionCase.label;
  return decisionConditionPreview(decisionCase);
}

function getDecisionNodeCanvasPreview(node, variableOptions = []) {
  const cases = node?.cases || [];
  if (!cases.length) return '条件未設定';
  const parts = cases.map((decisionCase, i) => {
    if (decisionCase.label) return decisionCase.label;
    const preview = decisionConditionPreview(decisionCase, variableOptions);
    if (preview && preview !== '条件未設定') return preview;
    return i === 0 ? 'IF' : 'ELIF';
  });
  return parts.filter(Boolean).join(WORKFLOW_CANVAS_SUMMARY_SEP);
}

/** 画布单行摘要：首条条件 + 其余分支计数 */
function getDecisionNodeCanvasSummary(node, variableOptions = []) {
  const cases = node?.cases || [];
  if (!cases.length) return WORKFLOW_CANVAS_SUMMARY_EMPTY;
  const firstCase = cases[0];
  const caseLabel = String(firstCase.label || '').trim();
  let head = caseLabel || decisionConditionPreview(firstCase, variableOptions);
  if (!head || head === '条件未設定') head = 'IF';
  if (cases.length > 1) return joinWorkflowCanvasSummary(head, `他 ${cases.length - 1}件`);
  if (caseLabel) {
    const condCount = (firstCase.conditions || []).filter((c) => c?.variable).length;
    if (condCount > 0) return joinWorkflowCanvasSummary(head, `${condCount}件の条件`);
  }
  return head;
}

function getDecisionElseCanvasPreview(node) {
  return node?.elseLabel || 'ELSE';
}

function getDecisionYesRule(node) {
  if (!node || node.type !== 'decision') return '';
  if (node.yesRule != null && String(node.yesRule).trim() !== '') return node.yesRule;
  return getDecisionPreset(node)?.yesRule || '';
}

function getDecisionNoRule(node) {
  if (!node || node.type !== 'decision') return '';
  if (node.noRule != null && String(node.noRule).trim() !== '') return node.noRule;
  return node.elseDescription || getDecisionPreset(node)?.noRule || '条件に該当しない場合';
}

function getDecisionElseDisplayText(node) {
  return node?.elseLabel || node?.elseDescription || '条件に該当しない場合';
}

function getDecisionCaseDisplayText(node, decisionCase, caseIdx, workflow = null) {
  if (!decisionCase) return '条件未設定';
  const options = workflow && node?.id ? getDecisionVariableOptions(workflow, node.id) : [];
  return decisionConditionPreview(decisionCase, options);
}

function getDecisionIfCondition(node) {
  return node?.cases?.[0]?.conditions?.[0] || null;
}

function getDecisionElseConditionPreview(node, workflow = null) {
  const cond = getDecisionIfCondition(node);
  if (!cond?.variable) return '{変数} is 0';
  const varLabel = cond.variable.includes('.') ? `{${cond.variable}}` : cond.variable;
  if (cond.operator === 'is' && String(cond.value) === '1') return `${varLabel} is 0`;
  if (cond.operator === 'is' && String(cond.value) === '0') return `${varLabel} is 1`;
  return `${varLabel} ≠ ${cond.value || '1'}`;
}

function formatDecisionConditionToken(variable) {
  if (!variable) return '—';
  return variable.includes('.') && !variable.startsWith('{') ? `{${variable}}` : variable;
}

function truncateWorkflowPreview(text, maxLen = 42) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length <= maxLen ? value : `${value.slice(0, maxLen)}…`;
}

function getNotifyNodeSubject(node) {
  if (!node || node.type !== 'notify') return '';
  const normalized = normalizeNotifyNode(node);
  return normalized.subject || '';
}

function getNotifyNodeBodyPreview(node, maxLen = 56) {
  if (!node || node.type !== 'notify') return '';
  const normalized = normalizeNotifyNode(node);
  return truncateWorkflowPreview(String(normalized.body || '').replace(/\n/g, ' '), maxLen);
}

function getNotifyNodeBodyText(node) {
  if (!node || node.type !== 'notify') return '';
  return normalizeNotifyNode(node).body || '';
}

function getHitlGateYesRule(node) {
  if (!node || !isHitlGateNode(node)) return '';
  if (node.yesRule != null && String(node.yesRule).trim() !== '') return node.yesRule;
  return getHitlGatePreset(node)?.yesRule || '';
}

function getHitlGateNoRule(node) {
  if (!node || !isHitlGateNode(node)) return '';
  if (node.noRule != null && String(node.noRule).trim() !== '') return node.noRule;
  return getHitlGatePreset(node)?.noRule || '';
}

const DECISION_NODE_LAYOUT = {
  w: 320,
  minW: 320,
  maxW: 420,
  headerH: 56,
  bodyPadTop: 0,
  bodyPadBottom: 20,
  rowGap: 8,
  rowBaseH: 44,
  condLineH: 18,
  elseRowH: 44,
  charW: 6.2,
};

function estimateDecisionConditionTextLines(text, contentWidth = 220) {
  const normalized = String(text || '').trim();
  if (!normalized) return 1;
  const charW = DECISION_NODE_LAYOUT.charW;
  const charsPerLine = Math.max(14, Math.floor(contentWidth / charW));
  return Math.ceil(normalized.length / charsPerLine);
}

function formatDecisionConditionCanvasLine(item) {
  if (!item || item.empty) return '条件未設定';
  const parts = [];
  if (item.variable) parts.push(item.variable);
  if (item.operatorLabel) parts.push(item.operatorLabel);
  if (item.needsValue) parts.push(item.value || '…');
  return parts.length ? parts.join(' ') : '条件未設定';
}

function getDecisionNodeLayoutMetrics(node, variableOptions = []) {
  const { minW, maxW, headerH, bodyPadTop, bodyPadBottom, rowGap, rowBaseH, condLineH, elseRowH, charW } = DECISION_NODE_LAYOUT;
  const cases = node?.cases?.length ? node.cases : [createDecisionCase('if')];
  let maxTextLen = 0;
  let y = headerH + bodyPadTop;
  const rows = [];
  let nodeW = minW;

  cases.forEach((c, i) => {
    const items = getDecisionConditionCanvasItems(c, variableOptions);
    let condLineCount = 0;
    items.forEach((item) => {
      const line = formatDecisionConditionCanvasLine(item);
      maxTextLen = Math.max(maxTextLen, line.length);
      condLineCount += estimateDecisionConditionTextLines(line, minW - 72);
    });
    condLineCount = Math.max(1, condLineCount);
    const rowH = Math.max(rowBaseH, condLineCount * condLineH + 10);
    rows.push({
      key: c.id,
      label: c.kind === 'if' || i === 0 ? 'IF' : 'ELIF',
      caseLabel: `CASE ${i + 1}`,
      yCenter: y + rowH / 2,
      rowH,
      ratio: 0,
    });
    y += rowH + rowGap;
  });

  nodeW = Math.min(maxW, Math.max(minW, 72 + maxTextLen * charW));

  rows.push({
    key: 'else',
    label: 'ELSE',
    caseLabel: 'ELSE',
    yCenter: y + elseRowH / 2,
    rowH: elseRowH,
    ratio: 0,
  });
  y += elseRowH + bodyPadBottom;

  const height = Math.max(96, y);
  rows.forEach((row) => {
    row.ratio = row.yCenter / height;
  });

  return { w: Math.round(nodeW), h: height, rows };
}

function getDecisionNodeBranches(node) {
  const metrics = getDecisionNodeLayoutMetrics(node);
  return metrics.rows.map((row) => ({
    key: row.key,
    label: row.label,
    caseLabel: row.caseLabel,
    ratio: row.ratio,
    yCenter: row.yCenter,
  }));
}

function getDecisionConditionCanvasItems(decisionCase, variableOptions = []) {
  const conditions = decisionCase?.conditions || [];
  if (!conditions.length) {
    return [{ id: 'empty', variable: '', operatorLabel: '', value: '', needsValue: false, empty: true }];
  }
  return conditions.map((c) => ({
    id: c.id,
    variable: formatDecisionVariableCanvasDisplay(c.variable, variableOptions),
    rawVariable: c.variable || '',
    operatorLabel: DECISION_OPERATORS.find((o) => o.value === c.operator)?.label || c.operator || '',
    value: c.value || '',
    needsValue: decisionUsesValueField(c.operator),
    empty: !c.variable,
  }));
}

function getDecisionOperatorLabel(operator) {
  return DECISION_OPERATORS.find((o) => o.value === operator)?.label || operator || '';
}

function getDecisionBranchEdgeLabel(branch, node) {
  if (branch === 'else') return node?.elseLabel || 'ELSE';
  const cases = node?.cases || [];
  const match = cases.find((c) => c.id === branch);
  if (match?.label) return match.label;
  const idx = cases.findIndex((c) => c.id === branch);
  if (idx === 0) return 'IF';
  if (idx > 0) return 'ELIF';
  if (branch === 'if') return 'IF';
  return String(branch || '').toUpperCase();
}

function migrateDecisionEdges(workflow) {
  const nodeMap = Object.fromEntries((workflow?.nodes || []).map((n) => [n.id, n]));
  (workflow?.edges || []).forEach((edge) => {
    if (edge.branch === 'yes') edge.branch = 'if';
    else if (edge.branch === 'no') edge.branch = 'else';
    const from = nodeMap[edge.from];
    if (from?.type === 'decision' && edge.branch) {
      edge.label = getDecisionBranchEdgeLabel(edge.branch, from);
    }
  });
}

/** 条件分岐：無 branch 出力・余分な分岐を除去し IF/ELSE のみに統一 */
function sanitizeDecisionEdges(workflow) {
  if (!workflow?.edges?.length) return;
  const nodeMap = Object.fromEntries((workflow.nodes || []).map((n) => [n.id, n]));

  workflow.edges = workflow.edges.filter((edge) => {
    const from = nodeMap[edge.from];
    if (from?.type !== 'decision') return true;
    if (!edge.branch) return false;
    return edge.branch === 'else' || (from.cases || []).some((c) => c.id === edge.branch);
  });

  const seen = new Set();
  workflow.edges = workflow.edges.filter((edge) => {
    const from = nodeMap[edge.from];
    if (from?.type !== 'decision' || !edge.branch) return true;
    const key = `${edge.from}|${edge.branch}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  workflow.edges.forEach((edge) => {
    const from = nodeMap[edge.from];
    if (from?.type === 'decision' && edge.branch) {
      edge.label = getDecisionBranchEdgeLabel(edge.branch, from);
    }
  });
}

/** 旧挿入ロジック（IF→次ノード）を ELSE→次ノード に移行 */
function migrateDecisionFlowEdges(workflow) {
  if (!workflow?.nodes?.length) return;
  (workflow.nodes || []).forEach((node) => {
    if (node.type !== 'decision') return;
    const preset = getDecisionPreset(node);
    if (preset?.value === 'custom') return;
    const out = (workflow.edges || []).filter((e) => e.from === node.id);
    const ifEdge = out.find((e) => e.branch === 'if');
    const elseEdge = out.find((e) => e.branch === 'else');
    if (ifEdge && !elseEdge) {
      workflow.edges.push({
        from: node.id,
        to: ifEdge.to,
        branch: 'else',
        label: 'ELSE',
      });
      workflow.edges = workflow.edges.filter((e) => e !== ifEdge);
    }
  });
}

function ensureDecisionElseContinuesFlow(workflow, nodeId, fallbackTargetId) {
  if (!workflow || !nodeId || !fallbackTargetId) return;
  const node = workflow.nodes.find((n) => n.id === nodeId);
  if (!node || node.type !== 'decision') return;
  const hasElse = workflow.edges.some((e) => e.from === nodeId && e.branch === 'else');
  if (hasElse) return;
  workflow.edges.push({
    from: nodeId,
    to: fallbackTargetId,
    branch: 'else',
    label: 'ELSE',
  });
}

function buildMinimalCaseWorkflow() {
  const start = normalizeStartNode({
    id: 'wf-start',
    type: 'start',
    label: getWorkflowNodeMeta('start').title,
    x: WF_LAYOUT_PAD.x,
    y: WF_LAYOUT_PAD.y,
    isStart: true,
  });
  const wf = {
    nodes: [start],
    edges: [],
    startNodeId: start.id,
    layoutVersion: 12,
    templateVersion: CASE_WORKFLOW_TEMPLATE_VERSION,
    isTemplate: true,
    topologyCustomized: false,
  };
  layoutWorkflowGraph(wf);
  return wf;
}

function buildDefaultCaseWorkflow() {
  const nodes = [];
  const edges = [];
  const wf = { nodes, edges };
  const cond = (variable, operator, value = '') => createDecisionCondition({ variable, operator, value });

  function place(spec) {
    const {
      id, type, label, judgmentContext, hitlContext, role, template, isStart,
    } = spec;
    let node;
    if (type === 'hitl_gate') {
      node = normalizeHitlGateNode({
        id,
        type,
        label: label || '人工確認',
        x: 0,
        y: 0,
        hitlContext: hitlContext || 'ocr',
        role: role || getHitlGateDefaultRole(hitlContext || 'ocr'),
      });
    } else if (type === 'notify') {
      node = normalizeNotifyNode({
        id,
        type,
        label: label || '通知',
        x: 0,
        y: 0,
        template: template || 'deficiency',
      }, wf);
    } else if (type === 'decision') {
      node = normalizeDecisionNode({
        id,
        type,
        label: label || '条件判断',
        x: 0,
        y: 0,
        judgmentContext: judgmentContext || 'custom',
      }, wf);
    } else if (type === 'data_mapping') {
      node = normalizeDataMappingNode({
        id,
        type,
        label: label || 'データマッピング',
        x: 0,
        y: 0,
        ...(isStart ? { isStart: true } : {}),
      }, wf);
    } else if (type === 'start' || type === 'end') {
      node = type === 'start'
        ? normalizeStartNode({
          id,
          type,
          label: label || getWorkflowNodeMeta(type).title,
          x: 0,
          y: 0,
          isStart: true,
        })
        : normalizeEndNode({
          id,
          type,
          label: label || getWorkflowNodeMeta(type).title,
          x: 0,
          y: 0,
          isEnd: true,
        });
    } else {
      node = ensureWorkflowNodeVarName({
        id,
        type,
        label: label || getWorkflowNodeMeta(type).title,
        x: 0,
        y: 0,
        ...(isStart ? { isStart: true } : {}),
      }, wf);
    }
    nodes.push(node);
    return node;
  }

  place({ id: 'wf-start', type: 'start', label: '開始' });
  place({ id: 'wf-pp', type: 'preprocess', label: '前処理' });
  place({ id: 'wf-d-pre', type: 'decision', label: '条件判断', judgmentContext: 'custom' });
  place({ id: 'wf-oc', type: 'ocr', label: 'OCR抽出' });
  place({ id: 'wf-d-ocr', type: 'decision', label: '条件判断', judgmentContext: 'custom' });
  place({ id: 'wf-map', type: 'data_mapping', label: 'データマッピング' });
  place({ id: 'wf-ai', type: 'ai_verify', label: 'AI検証' });
  place({ id: 'wf-d-final', type: 'decision', label: '条件判断', judgmentContext: 'custom' });
  place({
    id: 'wf-hu-pre',
    type: 'hitl_gate',
    label: '前処理人工確認',
    hitlContext: 'preprocess',
    role: 'operator',
  });
  place({
    id: 'wf-hu-ocr',
    type: 'hitl_gate',
    label: 'OCR人工確認',
    hitlContext: 'ocr',
    role: 'operator',
  });
  place({
    id: 'wf-hu-final',
    type: 'hitl_gate',
    label: 'AI検証人工確認',
    hitlContext: 'verification',
    role: 'operation_admin',
  });
  place({ id: 'wf-end', type: 'end', label: '終了' });

  const ppVar = getWorkflowNodeVarName(nodes.find((n) => n.id === 'wf-pp'), wf);
  const ocrVar = getWorkflowNodeVarName(nodes.find((n) => n.id === 'wf-oc'), wf);
  const aiVar = getWorkflowNodeVarName(nodes.find((n) => n.id === 'wf-ai'), wf);
  const dPre = nodes.find((n) => n.id === 'wf-d-pre');
  Object.assign(dPre, {
    judgmentContext: 'custom',
    cases: [
      createDecisionCase('if', {
        id: 'if',
        label: '通過',
        logic: 'and',
        conditions: [
          cond(`${ppVar}.case.preprocessResult`, 'is', 'passed'),
        ],
      }),
    ],
    elseLabel: '人工確認',
  });

  const dOcr = nodes.find((n) => n.id === 'wf-d-ocr');
  Object.assign(dOcr, {
    judgmentContext: 'custom',
    cases: [
      createDecisionCase('if', {
        id: 'if',
        label: '通過',
        logic: 'and',
        conditions: [
          cond(`${ocrVar}.case.ocrResult`, 'is', 'passed'),
        ],
      }),
    ],
    elseLabel: '人工確認',
  });

  const dFinal = nodes.find((n) => n.id === 'wf-d-final');
  Object.assign(dFinal, {
    judgmentContext: 'custom',
    cases: [
      createDecisionCase('if', {
        id: 'if',
        label: '通過',
        logic: 'and',
        conditions: [
          cond(`${aiVar}.case.verifyResult`, 'is', 'passed'),
        ],
      }),
    ],
    elseLabel: '人工確認',
  });

  edges.push(
    { from: 'wf-start', to: 'wf-pp' },
    { from: 'wf-pp', to: 'wf-d-pre' },
    { from: 'wf-d-pre', to: 'wf-oc', branch: 'if', label: '通過' },
    { from: 'wf-d-pre', to: 'wf-hu-pre', branch: 'else', label: '人工確認' },
    { from: 'wf-oc', to: 'wf-d-ocr' },
    { from: 'wf-d-ocr', to: 'wf-map', branch: 'if', label: '通過' },
    { from: 'wf-d-ocr', to: 'wf-hu-ocr', branch: 'else', label: '人工確認' },
    { from: 'wf-map', to: 'wf-ai' },
    { from: 'wf-ai', to: 'wf-d-final' },
    { from: 'wf-d-final', to: 'wf-end', branch: 'if', label: '通過' },
    { from: 'wf-d-final', to: 'wf-end', branch: 'elif-error', label: '異常' },
    { from: 'wf-d-final', to: 'wf-hu-final', branch: 'else', label: '人工確認' },
    { from: 'wf-hu-pre', to: 'wf-oc', branch: 'approve', label: '完了' },
    { from: 'wf-hu-pre', to: 'wf-pp', branch: 'request_supplement', label: '補件' },
    { from: 'wf-hu-ocr', to: 'wf-map', branch: 'approve', label: '完了' },
    { from: 'wf-hu-ocr', to: 'wf-oc', branch: 'request_supplement', label: '補件' },
    { from: 'wf-hu-final', to: 'wf-end', branch: 'approve', label: '完了' },
    { from: 'wf-hu-final', to: 'wf-ai', branch: 'request_supplement', label: '補件' },
  );

  wf.nodes = wf.nodes.map((n) => {
    if (n.type === 'start') return normalizeStartNode(n);
    if (n.type === 'end') return normalizeEndNode(n);
    if (n.type === 'decision') return normalizeDecisionNode(n, wf);
    if (n.type === 'notify') return normalizeNotifyNode(n, wf);
    if (n.type === 'code') return normalizeCodeNode(n, wf);
    if (n.type === 'data_mapping') return normalizeDataMappingNode(n, wf);
    if (n.type === 'ai_verify') return normalizeAiVerifyNode(n, wf);
    if (isHitlGateNode(n)) return normalizeHitlGateNode(n);
    return n;
  });
  migrateDecisionEdges(wf);
  sanitizeDecisionEdges(wf);
  migrateHitlGateEdges(wf);
  sanitizeHitlGateEdges(wf);
  ensureWorkflowStartNode(wf);
  applyDefaultCaseWorkflowStaticLayout(wf);

  return {
    nodes: wf.nodes,
    edges: wf.edges,
    isTemplate: true,
    templateVersion: CASE_WORKFLOW_TEMPLATE_VERSION,
    startNodeId: wf.startNodeId,
  };
}

function applyDefaultCaseWorkflowStaticLayout(workflow) {
  if (!workflow?.nodes?.length) return workflow;
  const byId = Object.fromEntries(workflow.nodes.map((node) => [node.id, node]));
  const rowY = 132;
  const branchY = 372;
  const positions = {
    'wf-start': { x: 72, y: rowY + 12 },
    'wf-pp': { x: 220, y: rowY },
    'wf-d-pre': { x: 520, y: rowY },
    'wf-oc': { x: 1050, y: rowY },
    'wf-d-ocr': { x: 1330, y: rowY },
    'wf-map': { x: 1860, y: rowY },
    'wf-ai': { x: 2140, y: rowY },
    'wf-d-final': { x: 2420, y: rowY },
    'wf-end': { x: 3100, y: rowY + 6 },
  };
  Object.entries(positions).forEach(([id, pos]) => {
    if (!byId[id]) return;
    byId[id].x = pos.x;
    byId[id].y = pos.y;
  });

  [
    ['wf-hu-pre', 'wf-d-pre', 'wf-oc'],
    ['wf-hu-ocr', 'wf-d-ocr', 'wf-map'],
    ['wf-hu-final', 'wf-d-final', 'wf-end'],
  ].forEach(([hitlId, fromId, toId]) => {
    const hitl = byId[hitlId];
    const from = byId[fromId];
    const to = byId[toId];
    if (!hitl || !from || !to) return;
    const fromSize = getWorkflowNodeLayoutSize(from);
    const hitlSize = getWorkflowNodeLayoutSize(hitl);
    const fromRight = from.x + fromSize.w;
    const toLeft = to.x;
    hitl.x = Math.round((fromRight + toLeft) / 2 - hitlSize.w / 2);
    if (hitl.x < fromRight + 24) hitl.x = fromRight + 24;
    if (hitl.x + hitlSize.w > toLeft - 24) hitl.x = toLeft - hitlSize.w - 24;
    hitl.y = branchY;
  });

  workflow.layoutVersion = CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION;
  return workflow;
}

function workflowHasTemplateNodeIds(workflow, templateIds) {
  const nodes = workflow?.nodes || [];
  if (!nodes.length) return false;
  const ids = new Set(nodes.map((n) => n.id));
  return templateIds.every((id) => ids.has(id));
}

function isLegacyCaseWorkflowTemplate(workflow) {
  return workflowHasTemplateNodeIds(workflow, LEGACY_CASE_WORKFLOW_TEMPLATE_NODE_IDS);
}

function hasCanonicalDefaultCaseWorkflowNodes(workflow) {
  return workflowHasTemplateNodeIds(workflow, STRAIGHT_CASE_WORKFLOW_NODE_IDS);
}

function hasOnlyCanonicalDefaultCaseWorkflowNodes(workflow) {
  const nodes = workflow?.nodes || [];
  if (nodes.length !== STRAIGHT_CASE_WORKFLOW_NODE_IDS.length) return false;
  const canonicalIds = new Set(STRAIGHT_CASE_WORKFLOW_NODE_IDS);
  return nodes.every((node) => canonicalIds.has(node.id));
}

function isDefaultCaseWorkflowTemplate(workflow) {
  if (workflow?.topologyCustomized) return false;
  return hasCanonicalDefaultCaseWorkflowNodes(workflow)
    && workflow?.templateVersion === CASE_WORKFLOW_TEMPLATE_VERSION;
}

function isPreviousV6CaseWorkflowTemplate(workflow) {
  return workflowHasTemplateNodeIds(workflow, PREVIOUS_V6_CASE_WORKFLOW_TEMPLATE_NODE_IDS)
    && !workflowHasTemplateNodeIds(workflow, ['wf-d-pre', 'wf-d-ocr', 'wf-d-hitl-result']);
}

function isMinimalPlaceholderCaseWorkflow(workflow) {
  const nodes = workflow?.nodes || [];
  if (!nodes.length) return true;
  return nodes.length === 1 && nodes[0]?.type === 'start';
}

function markWorkflowTopologyEdited(workflow) {
  if (!workflow) return;
  workflow.isTemplate = false;
  workflow.topologyCustomized = true;
}

function shouldMigrateCaseWorkflowToDefault(workflow) {
  if (!workflow?.nodes?.length) return true;
  if (workflow.topologyCustomized) return false;
  if (isDefaultCaseWorkflowTemplate(workflow)) return true;
  if (isMinimalPlaceholderCaseWorkflow(workflow)) return false;
  if (hasCanonicalDefaultCaseWorkflowNodes(workflow)) {
    return !workflow.templateVersion || workflow.templateVersion < CASE_WORKFLOW_TEMPLATE_VERSION;
  }
  if (isLegacyCaseWorkflowTemplate(workflow)) return true;
  if (isPreviousV6CaseWorkflowTemplate(workflow)) return true;
  if (!workflow.templateVersion || workflow.templateVersion < CASE_WORKFLOW_TEMPLATE_VERSION) return true;
  if (workflow.isTemplate) return true;
  const matchedDefaultIds = DEFAULT_CASE_WORKFLOW_TEMPLATE_NODE_IDS
    .filter((id) => (workflow.nodes || []).some((node) => node.id === id));
  if (workflow.isTemplate
    && matchedDefaultIds.length > 0
    && matchedDefaultIds.length < DEFAULT_CASE_WORKFLOW_TEMPLATE_NODE_IDS.length) {
    return true;
  }
  if (workflow.isTemplate
    && workflowHasTemplateNodeIds(workflow, DEFAULT_CASE_WORKFLOW_TEMPLATE_NODE_IDS)
    && !hasCanonicalDefaultCaseWorkflowNodes(workflow)) {
    return true;
  }
  return false;
}

function shouldRestorePublishedWorkflow(form) {
  return form?.scene?.publishStatus === 'published'
    && isMinimalPlaceholderCaseWorkflow(form?.workflows?.case);
}

function getWorkflowGraphEntryNode(workflow) {
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  const mainIn = new Set(edges.filter((e) => !e.branch).map((e) => e.to));
  return nodes.find((n) => n.type !== 'start' && !mainIn.has(n.id))
    || nodes.find((n) => n.type === 'preprocess')
    || nodes.find((n) => n.id === 'wf-pp')
    || nodes[0]
    || null;
}

function findLegacyWorkflowOutputNode(workflow) {
  return (workflow?.nodes || []).find((n) =>
    n.id === 'wf-out'
    || n.type === 'output'
  ) || null;
}

function ensureFormWorkflows(form, { force = false } = {}) {
  if (!form.workflows?.case && form.workflow) {
    form.workflows = {
      case: normalizeWorkflow(form.workflow, 'case'),
    };
    delete form.workflow;
    if (shouldMigrateCaseWorkflowToDefault(form.workflows.case)) {
      form.workflows.case = buildDefaultCaseWorkflow();
    }
    return;
  }
  if (form.workflows?.case) {
    if (shouldRestorePublishedWorkflow(form)) {
      form.workflows.case = buildDefaultCaseWorkflow();
      return;
    }
    if (!force) {
      if (shouldMigrateCaseWorkflowToDefault(form.workflows.case)) {
        form.workflows.case = buildDefaultCaseWorkflow();
      } else if (needsCanonicalCaseWorkflowLayout(form.workflows.case)) {
        applyCanonicalCaseWorkflowLayout(form.workflows.case);
      }
      return;
    }
    if (shouldMigrateCaseWorkflowToDefault(form.workflows.case)) {
      form.workflows.case = buildDefaultCaseWorkflow();
      return;
    }
    form.workflows.case = normalizeWorkflow(form.workflows.case, 'case');
    return;
  }
  form.workflows = { case: buildMinimalCaseWorkflow() };
}

function migrateQrReadNodesToFraudDetect(workflow) {
  if (!workflow?.nodes?.length) return;
  workflow.nodes.forEach((node) => {
    if (node.type !== 'qr_read') return;
    node.type = 'fraud_detect';
    if (!node.label || node.label === 'QR読取' || node.label === '不正検知') node.label = '画像不正検知';
  });
}

function migrateRemoveLegacyIoNodes(workflow) {
  if (!workflow?.nodes?.length) return;
  migrateQrReadNodesToFraudDetect(workflow);
  const removedTypes = new Set(['input', 'output', 'qr_read']);
  const removeIds = new Set(workflow.nodes.filter((n) => removedTypes.has(n.type)).map((n) => n.id));
  if (!removeIds.size) return;
  const inputNode = workflow.nodes.find((n) => n.type === 'input');
  const inputWasStart = inputNode?.isStart || workflow.startNodeId === inputNode?.id;

  removeIds.forEach((nodeId) => {
    const inMain = workflow.edges.filter((e) => e.to === nodeId && !e.branch);
    const outMain = workflow.edges.filter((e) => e.from === nodeId && !e.branch);
    const inBranch = workflow.edges.filter((e) => e.to === nodeId && e.branch);
    const outBranch = workflow.edges.filter((e) => e.from === nodeId && e.branch);
    inMain.forEach((ie) => {
      outMain.forEach((oe) => {
        if (!workflow.edges.some((e) => !e.branch && e.from === ie.from && e.to === oe.to)) {
          workflow.edges.push({ from: ie.from, to: oe.to });
        }
      });
    });
    inBranch.forEach((ie) => {
      outMain.forEach((oe) => {
        if (!workflow.edges.some((e) => e.from === ie.from && e.to === oe.to && e.branch === ie.branch)) {
          workflow.edges.push({ from: ie.from, to: oe.to, branch: ie.branch, label: ie.label });
        }
      });
    });
    inMain.forEach((ie) => {
      outBranch.forEach((oe) => {
        if (!workflow.edges.some((e) => e.from === ie.from && e.to === oe.to && e.branch === oe.branch)) {
          workflow.edges.push({ from: ie.from, to: oe.to, branch: oe.branch, label: oe.label });
        }
      });
    });
  });

  workflow.nodes = workflow.nodes.filter((n) => !removeIds.has(n.id));
  workflow.edges = workflow.edges.filter((e) => !removeIds.has(e.from) && !removeIds.has(e.to));

  workflow.nodes.forEach((n) => {
    if (n.type === 'decision' && n.conditionType === 'fraud_detect') n.conditionType = 'custom';
    if (isHitlGateNode(n) && n.conditionType === 'fraud_detect') n.conditionType = 'custom';
  });

  if (inputWasStart) {
    const pp = workflow.nodes.find((n) => n.type === 'preprocess');
    if (pp) {
      workflow.nodes.forEach((n) => { if (n.isStart) n.isStart = false; });
      pp.isStart = false;
      workflow.startNodeId = null;
    }
  }
}

function createTerminalWorkflowNode(type, id, x, y) {
  const base = {
    id,
    type,
    label: getWorkflowNodeMeta(type).title,
    x,
    y,
  };
  if (type === 'start') {
    return normalizeStartNode({ ...base, isStart: true });
  }
  if (type === 'end') {
    return normalizeEndNode({ ...base, isEnd: true });
  }
  return { ...base, isEnd: true };
}

function migrateEnsureTerminalNodes(workflow) {
  if (!workflow?.nodes?.length) return;
  const termW = WORKFLOW_NODE_SIZE.terminal.w;
  const gap = WF_NODE_GAP;

  let startNode = workflow.nodes.find((n) => n.type === 'start');
  if (!startNode) {
    const entry = getWorkflowGraphEntryNode(workflow);
    const startId = workflow.nodes.some((n) => n.id === 'wf-start') ? `wf-start-${Date.now()}` : 'wf-start';
    startNode = createTerminalWorkflowNode(
      'start',
      startId,
      Math.max(8, (entry?.x ?? 40) - termW - gap),
      entry?.y ?? 200,
    );
    workflow.nodes.push(startNode);
    if (entry && entry.type !== 'start' && !workflow.edges.some((e) => e.from === startNode.id && e.to === entry.id)) {
      workflow.edges.push({ from: startNode.id, to: entry.id });
    }
  }

  workflow.nodes.forEach((n) => {
    if (n.type === 'start') Object.assign(n, normalizeStartNode(n));
    else if (n.type === 'end') Object.assign(n, normalizeEndNode(n));
    else if (n.isStart) delete n.isStart;
  });

  let endNode = workflow.nodes.find((n) => n.type === 'end');
  const legacyOut = findLegacyWorkflowOutputNode(workflow);
  if (!endNode && legacyOut) {
    const endId = workflow.nodes.some((n) => n.id === 'wf-end') ? `wf-end-${Date.now()}` : 'wf-end';
    endNode = createTerminalWorkflowNode('end', endId, legacyOut.x, legacyOut.y);
    workflow.edges.forEach((e) => {
      if (e.from === legacyOut.id) e.from = endId;
      if (e.to === legacyOut.id) e.to = endId;
    });
    const idx = workflow.nodes.findIndex((n) => n.id === legacyOut.id);
    if (idx >= 0) workflow.nodes[idx] = endNode;
    else workflow.nodes.push(endNode);
  }

  if (!endNode) {
    const doneDecision = workflow.nodes.find((n) => n.id === 'wf-d-done')
      || workflow.nodes.find((n) => n.type === 'decision' && /完了|完結/.test(n.label || ''));
    const approveEdge = workflow.edges.find((e) =>
      e.from === doneDecision?.id && (e.branch === 'if' || /承認|完結/.test(e.label || '')),
    );
    if (approveEdge) {
      const prevTarget = workflow.nodes.find((n) => n.id === approveEdge.to);
      const endId = workflow.nodes.some((n) => n.id === 'wf-end') ? `wf-end-${Date.now()}` : 'wf-end';
      endNode = createTerminalWorkflowNode(
        'end',
        endId,
        prevTarget?.x ?? ((doneDecision?.x || 0) + WORKFLOW_NODE_SIZE.decision.w + gap),
        prevTarget?.y ?? doneDecision?.y ?? 200,
      );
      if (prevTarget && prevTarget.type !== 'end') {
        workflow.edges.forEach((e) => {
          if (e.from === prevTarget.id) e.from = endId;
          if (e.to === prevTarget.id) e.to = endId;
        });
        const idx = workflow.nodes.findIndex((n) => n.id === prevTarget.id);
        if (idx >= 0) workflow.nodes[idx] = endNode;
        else workflow.nodes.push(endNode);
      } else {
        workflow.nodes.push(endNode);
        approveEdge.to = endId;
      }
    }
  }

  if (!endNode && isStraightCaseWorkflowLayoutTarget(workflow)) {
    const anchor = workflow.nodes.find((n) => n.id === 'wf-hu-final')
      || workflow.nodes.find((n) => n.id === 'wf-d-final')
      || workflow.nodes.find((n) => n.id === 'wf-ai');
    const endId = workflow.nodes.some((n) => n.id === 'wf-end') ? `wf-end-${Date.now()}` : 'wf-end';
    endNode = createTerminalWorkflowNode(
      'end',
      endId,
      (anchor?.x || WF_LAYOUT_PAD.x) + 280,
      anchor?.y ?? WF_LAYOUT_PAD.y,
    );
    workflow.nodes.push(endNode);
  }

  workflow.nodes.forEach((n) => {
    if (n.type === 'end') Object.assign(n, normalizeEndNode(n));
  });
}

function migrateRemoveCaseLinkNodes(workflow) {
  if (!workflow?.nodes?.length) return;
  const removedTypes = new Set(['case_link', 'scene_aggregate', 'scene_completeness']);
  const removeIds = new Set(workflow.nodes.filter((n) => removedTypes.has(n.type)).map((n) => n.id));
  if (!removeIds.size) return;
  removeIds.forEach((nodeId) => {
    const inMain = workflow.edges.filter((e) => e.to === nodeId && !e.branch);
    const outMain = workflow.edges.filter((e) => e.from === nodeId && !e.branch);
    inMain.forEach((ie) => {
      outMain.forEach((oe) => {
        if (!workflow.edges.some((e) => !e.branch && e.from === ie.from && e.to === oe.to)) {
          workflow.edges.push({ from: ie.from, to: oe.to });
        }
      });
    });
  });
  workflow.nodes = workflow.nodes.filter((n) => !removeIds.has(n.id));
  workflow.edges = workflow.edges.filter((e) => !removeIds.has(e.from) && !removeIds.has(e.to));
}

const DEPRECATED_WORKFLOW_NODE_REMOVE_TYPES = new Set(['master_match', 'mcp', 'notify']);

function migrateRemoveDeprecatedWorkflowNodes(workflow) {
  if (!workflow?.nodes?.length) return;
  const removeIds = new Set(
    workflow.nodes.filter((n) => DEPRECATED_WORKFLOW_NODE_REMOVE_TYPES.has(n.type)).map((n) => n.id),
  );
  if (!removeIds.size) return;
  removeIds.forEach((nodeId) => {
    const inMain = workflow.edges.filter((e) => e.to === nodeId && !e.branch);
    const outMain = workflow.edges.filter((e) => e.from === nodeId && !e.branch);
    const inBranch = workflow.edges.filter((e) => e.to === nodeId && e.branch);
    inMain.forEach((ie) => {
      outMain.forEach((oe) => {
        if (!workflow.edges.some((e) => !e.branch && e.from === ie.from && e.to === oe.to)) {
          workflow.edges.push({ from: ie.from, to: oe.to });
        }
      });
    });
    inBranch.forEach((ie) => {
      outMain.forEach((oe) => {
        if (!workflow.edges.some((e) => e.from === ie.from && e.to === oe.to && e.branch === ie.branch)) {
          workflow.edges.push({ from: ie.from, to: oe.to, branch: ie.branch, label: ie.label });
        }
      });
    });
  });
  workflow.nodes = workflow.nodes.filter((n) => !removeIds.has(n.id));
  workflow.edges = workflow.edges.filter((e) => !removeIds.has(e.from) && !removeIds.has(e.to));
}

/** @deprecated use migrateRemoveDeprecatedWorkflowNodes */
function migrateRemoveMasterMatchNodes(workflow) {
  migrateRemoveDeprecatedWorkflowNodes(workflow);
}

function migrateDefaultHumanBufferFlags(workflow) {
  if (!workflow?.nodes?.length || !hasCanonicalDefaultCaseWorkflowNodes(workflow)) return;
  workflow.nodes.forEach((node) => {
    if ((node.id === 'wf-pp' && node.type === 'preprocess')
      || (node.id === 'wf-oc' && node.type === 'ocr')) {
      delete node.hitlWaitEnabled;
    }
    if (isHitlGateNode(node) && (node.id === 'wf-hu-pre' || node.id === 'wf-hu-ocr')) {
      delete node.hitlWaitEnabled;
    }
  });
}

/** @deprecated */
function migrateDefaultHitlWaitFlags(workflow) {
  migrateDefaultHumanBufferFlags(workflow);
}

function normalizeWorkflow(workflow, flowKey = 'case') {
  const w = cloneJson(workflow || {});
  if (!Array.isArray(w.nodes) || !w.nodes.length) {
    return {
      nodes: [],
      edges: [],
      startNodeId: '',
      layoutVersion: 12,
      templateVersion: CASE_WORKFLOW_TEMPLATE_VERSION,
      isTemplate: false,
      topologyCustomized: true,
    };
  }
  if (!Array.isArray(w.edges)) w.edges = [];
  migrateRemoveLegacyIoNodes(w);
  migrateRemoveCaseLinkNodes(w);
  migrateRemoveDeprecatedWorkflowNodes(w);
  migrateDefaultHitlWaitFlags(w);
  if (w.nodes.some((n) => REMOVED_WORKFLOW_NODE_TYPES.has(n.type))) {
    w.nodes = w.nodes.filter((n) => !REMOVED_WORKFLOW_NODE_TYPES.has(n.type));
    const ids = new Set(w.nodes.map((n) => n.id));
    w.edges = w.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }
  migrateHitlDecisionsInWorkflow(w);
  migrateHitlResultDecisionNodes(w);
  migrateHitlGateMainEdges(w);
  w.nodes = w.nodes.map((n) => {
    if (n.type === 'start') return normalizeStartNode(n);
    if (n.type === 'end') return normalizeEndNode(n);
    if (isHitlGateNode(n)) return normalizeHitlGateNode(n);
    if (n.type === 'decision') return normalizeDecisionNode(n, w);
    if (n.type === 'notify') return normalizeNotifyNode(n, w);
    if (n.type === 'code') return normalizeCodeNode(n, w);
    if (n.type === 'data_mapping') return normalizeDataMappingNode(n, w);
    if (n.type === 'ai_verify') return normalizeAiVerifyNode(n, w);
    if (isWorkflowProcessingNode(n)) return ensureWorkflowNodeVarName(n, w);
    return n;
  });
  syncDecisionVariablesInWorkflow(w);
  migrateDecisionEdges(w);
  migrateDecisionFlowEdges(w);
  sanitizeDecisionEdges(w);
  migrateHitlGateEdges(w);
  sanitizeHitlGateEdges(w);
  migrateEnsureTerminalNodes(w);
  ensureWorkflowStartNode(w);
  applyWorkflowEdgeRoutes(w);
  layoutWorkflowGraph(w);
  return w;
}

function getWorkflowStartNode(workflow) {
  const nodes = workflow?.nodes || [];
  if (!nodes.length) return null;
  return nodes.find((n) => n.type === 'start')
    || nodes.find((n) => n.isStart)
    || nodes.find((n) => n.id === workflow?.startNodeId && n.type === 'start')
    || null;
}

function ensureWorkflowStartNode(workflow) {
  if (!workflow?.nodes?.length) return;
  const start = getWorkflowStartNode(workflow);
  workflow.nodes.forEach((n) => {
    if (n.isStart && n.id !== start?.id) n.isStart = false;
  });
  if (start) {
    start.isStart = true;
    workflow.startNodeId = start.id;
  } else {
    workflow.startNodeId = '';
  }
}

function getWorkflowMainChainOrderLabel(type) {
  const item = WORKFLOW_MAIN_CHAIN_ORDER.find((o) => o.type === type);
  return item ? `Step ${item.step} · ${item.label}` : '';
}

function getWorkflowMainChainIds(workflow) {
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  if (!nodes.length) return [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const start = getWorkflowStartNode(workflow) || nodes[0];
  const chain = [];
  let cur = start;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur.id);
    const next = edges.find((e) => e.from === cur.id && !e.branch);
    cur = next ? nodeMap[next.to] : null;
  }
  return chain;
}

function getWorkflowNodeOrder(workflow, nodeId) {
  const chain = getWorkflowMainChainIds(workflow);
  const idx = chain.indexOf(nodeId);
  return idx >= 0 ? idx + 1 : null;
}

function workflowEdgeKey(edge) {
  return `${edge.from}|${edge.to}|${edge.branch || ''}`;
}

function workflowCanReach(workflow, fromId, toId, excludeEdge = null) {
  if (!fromId || !toId || fromId === toId) return false;
  const excludeKey = excludeEdge ? workflowEdgeKey(excludeEdge) : '';
  const edges = (workflow?.edges || []).filter((e) => !excludeKey || workflowEdgeKey(e) !== excludeKey);
  const visited = new Set();
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    if (id === toId) return true;
    if (!id || visited.has(id)) continue;
    visited.add(id);
    edges.filter((e) => e.from === id).forEach((e) => queue.push(e.to));
  }
  return false;
}

function isWorkflowBackflowEdge(workflow, fromId, toId, excludeEdge = null) {
  return workflowCanReach(workflow, toId, fromId, excludeEdge);
}

function getWorkflowCycleNodeIds(workflow) {
  const nodeIds = (workflow?.nodes || []).map((n) => n.id);
  const edges = workflow?.edges || [];
  if (!nodeIds.length || !edges.length) return new Set();
  const adj = Object.fromEntries(nodeIds.map((id) => [id, []]));
  edges.forEach((edge) => {
    if (adj[edge.from]) adj[edge.from].push(edge.to);
  });
  const index = {};
  const lowlink = {};
  const onStack = new Set();
  const stack = [];
  const cycleNodes = new Set();
  let seq = 0;

  function strongConnect(v) {
    index[v] = seq;
    lowlink[v] = seq;
    seq += 1;
    stack.push(v);
    onStack.add(v);
    (adj[v] || []).forEach((w) => {
      if (index[w] === undefined) {
        strongConnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack.has(w)) {
        lowlink[v] = Math.min(lowlink[v], index[w]);
      }
    });
    if (lowlink[v] === index[v]) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) comp.forEach((id) => cycleNodes.add(id));
    }
  }

  nodeIds.forEach((id) => {
    if (index[id] === undefined) strongConnect(id);
  });
  return cycleNodes;
}

function workflowHasCycle(workflow) {
  return getWorkflowCycleNodeIds(workflow).size > 0;
}

function isValidWorkflowConnect(from, to, branch) {
  if (!from || !to || from.id === to.id) return false;
  if (from.type === 'end') return false;
  if (from.type === 'decision' && !branch) return false;
  if (isHitlGateNode(from) && !branch) return false;
  if (isHitlGateNode(from) && branch && !normalizeHitlGateActions(from.actions).includes(branch)) return false;
  if (isHitlGateNode(from) && branch === 'reject') return false;
  if (isHitlGateNode(from) && branch === 'request_supplement') {
    const workflow = arguments[3] || null;
    if (!workflow) return false;
    return workflowCanReach(workflow, to.id, from.id);
  }
  return true;
}

function normalizeWorkflowEdgeRoute(workflow, edge) {
  if (!edge || !workflow) return edge;
  if (edge.route === 'top') delete edge.route;
  return edge;
}

function applyWorkflowEdgeRoutes(workflow) {
  (workflow?.edges || []).forEach((edge) => normalizeWorkflowEdgeRoute(workflow, edge));
}

function swapAdjacentMainChainEdges(wf, firstId, secondId) {
  const inEdge = wf.edges.find((e) => e.to === firstId && !e.branch);
  const midEdge = wf.edges.find((e) => e.from === firstId && e.to === secondId && !e.branch);
  const outEdge = wf.edges.find((e) => e.from === secondId && !e.branch);
  if (!midEdge) return false;
  const prevId = inEdge?.from;
  const nextId = outEdge?.to;
  wf.edges = wf.edges.filter((e) => e !== inEdge && e !== midEdge && e !== outEdge);
  if (prevId) wf.edges.push({ from: prevId, to: secondId });
  wf.edges.push({ from: secondId, to: firstId });
  if (nextId) wf.edges.push({ from: firstId, to: nextId });
  return true;
}

function formatWorkflowHistoryTime(date = new Date()) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function measureWorkflowCanvasSummaryHeight(summary, contentWidth) {
  if (!summary) return 0;
  const CHAR_W = 7;
  const LINE_H = 18;
  const lines = Math.max(1, Math.ceil((String(summary).length * CHAR_W) / Math.max(contentWidth, 120)));
  return lines * LINE_H;
}

function measureWorkflowNodeBodyHeight(tasks, contentWidth) {
  if (!tasks?.length) return 0;
  if (tasks.length === 1) return 22;
  const GAP = 6;
  const MIN_TAG_W = 72;
  const CHAR_W = 15;
  const TAG_PAD = 20;
  const TAG_LINE_H = 28;
  let totalHeight = 0;
  let rowWidth = 0;
  let rowMaxHeight = 0;

  tasks.forEach((text) => {
    const str = String(text);
    const naturalW = Math.max(MIN_TAG_W, str.length * CHAR_W + TAG_PAD);
    const tagW = Math.min(contentWidth, naturalW);
    const lineCount = Math.max(1, Math.ceil((str.length * CHAR_W + TAG_PAD) / contentWidth));
    const tagH = lineCount * TAG_LINE_H;

    if (rowWidth > 0 && rowWidth + GAP + tagW > contentWidth) {
      totalHeight += rowMaxHeight + GAP;
      rowWidth = tagW;
      rowMaxHeight = tagH;
    } else {
      rowWidth += (rowWidth ? GAP : 0) + tagW;
      rowMaxHeight = Math.max(rowMaxHeight, tagH);
    }
  });

  return totalHeight + rowMaxHeight;
}

function getWorkflowNodeSize(node, taskCount = 0, tasks = [], canvasSummary = '') {
  if (node?.type === 'start' || node?.type === 'end') {
    return { ...WORKFLOW_NODE_SIZE.terminal };
  }

  if (node?.__collapsed) {
    return { w: WORKFLOW_NODE_SIZE.default.w, h: 64 };
  }

  if (node?.type === 'decision') {
    const metrics = getDecisionNodeLayoutMetrics(node);
    return { w: metrics.w, h: metrics.h };
  }

  if (isHitlGateNode(node)) {
    const metrics = getHitlGateNodeLayoutMetrics(node, canvasSummary);
    return { w: metrics.w, h: metrics.h };
  }

  const nodeW = WORKFLOW_NODE_SIZE.default.w;
  const tagTexts = tasks?.length ? tasks : (taskCount ? Array.from({ length: taskCount }, () => 'tag') : []);
  const HEADER_H = WORKFLOW_NODE_SIZE.default.h;
  const BODY_TOP_PAD = 0;
  const BODY_BOTTOM_PAD = 14;
  const contentWidth = (node?.type === 'case_link' || node?.type === 'scene_aggregate' || node?.type === 'scene_completeness' ? 240 : nodeW) - 28;

  if (node?.type === 'case_link' || node?.type === 'scene_aggregate' || node?.type === 'scene_completeness') {
    if (!tagTexts.length) return { w: 240, h: 76 };
    const bodyHeight = measureWorkflowNodeBodyHeight(tagTexts, contentWidth);
    const h = HEADER_H + BODY_TOP_PAD + bodyHeight + BODY_BOTTOM_PAD;
    return { w: 240, h: Math.max(76, h) };
  }

  // 画布业务节点只展示标题行（类型名），不再按摘要增高；端点取该高度中心
  return { w: nodeW, h: HEADER_H };
}

function estimateWorkflowNodeLayoutTasks(node) {
  if (!node || isWorkflowTerminalNode(node)) return [];
  if (node.type === 'decision' || isHitlGateNode(node)) return [];
  return ['summary'];
}

function getWorkflowNodeLayoutSize(node) {
  const tasks = estimateWorkflowNodeLayoutTasks(node);
  return getWorkflowNodeSize(node, tasks.length, tasks);
}

function pickWorkflowMainChainEdge(workflow, fromId) {
  const edges = (workflow.edges || []).filter((e) => e.from === fromId);
  if (!edges.length) return null;
  const from = (workflow.nodes || []).find((n) => n.id === fromId);
  if (from?.type === 'decision') {
    const nodeMap = Object.fromEntries((workflow.nodes || []).map((node) => [node.id, node]));
    const getForwardDepth = (nodeId, visited = new Set()) => {
      if (!nodeId || visited.has(nodeId)) return 0;
      const node = nodeMap[nodeId];
      if (!node || node.type === 'end') return 0;
      const nextVisited = new Set(visited);
      nextVisited.add(nodeId);
      const nextEdges = (workflow.edges || []).filter(
        (edge) => edge.from === nodeId && edge.branch !== 'request_supplement',
      );
      const nodeWeight = isHitlGateNode(node) ? 0 : 1;
      return nodeWeight + Math.max(0, ...nextEdges.map((edge) => getForwardDepth(edge.to, nextVisited)));
    };
    return [...edges].sort((first, second) => {
      const depthDiff = getForwardDepth(second.to) - getForwardDepth(first.to);
      if (depthDiff) return depthDiff;
      const priority = (edge) => edge.branch === 'if'
        ? 0
        : edge.branch && String(edge.branch).startsWith('elif')
          ? 1
          : !edge.branch ? 2 : 3;
      return priority(first) - priority(second);
    })[0];
  }
  if (isHitlGateNode(from)) {
    return edges.find((e) => e.branch === 'approve') || edges[0];
  }
  return edges.find((e) => !e.branch) || edges[0];
}

function buildWorkflowMainChain(workflow) {
  const nodes = workflow?.nodes || [];
  const start = getWorkflowStartNode(workflow);
  if (!start) return [];
  const chain = [];
  const seen = new Set();
  let cur = start;
  while (cur && !seen.has(cur.id)) {
    if (cur.type === 'end') break;
    seen.add(cur.id);
    chain.push(cur);
    const edge = pickWorkflowMainChainEdge(workflow, cur.id);
    const next = edge ? nodes.find((n) => n.id === edge.to) : null;
    if (!next || next.type === 'end') break;
    cur = next;
  }
  return chain;
}

function layoutWorkflowBranchChain(workflow, startNodeId, startX, laneY, sizes) {
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  let x = startX;
  let curId = startNodeId;
  const visited = new Set();
  while (curId && !visited.has(curId)) {
    visited.add(curId);
    const node = nodes.find((n) => n.id === curId);
    if (!node || node.type === 'end') break;
    const size = sizes.get(node.id);
    node.x = x;
    node.y = laneY;
    x += size.w + WF_NODE_GAP;
    const outEdges = edges.filter((e) => e.from === curId);
    const nextEdge = outEdges.find((e) => {
      const target = nodes.find((n) => n.id === e.to);
      return target && target.type !== 'end';
    });
    if (!nextEdge) break;
    curId = nextEdge.to;
  }
  return x;
}

function resolveWorkflowBranchOverlaps(branchNodes, sizes) {
  const sorted = [...branchNodes].sort((a, b) => a.y - b.y || a.x - b.x);
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const prevSize = sizes.get(prev.id);
    const curSize = sizes.get(cur.id);
    const overlapX = Math.abs(cur.x - prev.x) < Math.max(prevSize.w, curSize.w) * 0.72;
    const minY = prev.y + prevSize.h + 32;
    if (overlapX && cur.y < minY) cur.y = minY;
    if (overlapX && Math.abs(cur.y - prev.y) < 28) {
      cur.x = prev.x + prevSize.w + 40;
    }
  }
}

function disperseWorkflowNodesForSmoothEdges(workflow, sizes) {
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  if (!nodes.length || !edges.length) return;
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    edges.forEach((edge) => {
      const from = byId[edge.from];
      const to = byId[edge.to];
      if (!from || !to || from.type === 'end' || to.type === 'end') return;
      if (to.x <= from.x) return;
      if (from.y > to.y + 24) return;
      const fromSize = sizes.get(from.id) || getWorkflowNodeLayoutSize(from);
      const targetX = from.x + fromSize.w + WF_LAYOUT_MIN_EDGE_GAP;
      if (to.x >= targetX) return;
      const delta = targetX - to.x;
      const threshold = to.x - 1;
      nodes.forEach((node) => {
        if (node.id === from.id || node.type === 'end') return;
        if (node.x >= threshold) node.x += delta;
      });
      changed = true;
    });
    if (!changed) break;
  }
}

function isStraightCaseWorkflowLayoutTarget(workflow) {
  if (hasCanonicalDefaultCaseWorkflowNodes(workflow)) return true;
  const ids = new Set((workflow?.nodes || []).map((node) => node.id));
  const coreIds = [
    'wf-start', 'wf-pp', 'wf-d-pre', 'wf-hu-pre', 'wf-oc', 'wf-d-ocr', 'wf-hu-ocr',
    'wf-map', 'wf-ai', 'wf-d-final', 'wf-hu-final',
  ];
  if (!coreIds.every((id) => ids.has(id))) return false;
  return ['wf-n-ok', 'wf-n-supp', 'wf-n-error'].some((id) => ids.has(id));
}

function needsCanonicalCaseWorkflowLayout(workflow) {
  if (!isStraightCaseWorkflowLayoutTarget(workflow)) return false;
  if (!workflow.nodes.some((n) => n.type === 'end')) return true;
  return !workflow.layoutVersion || workflow.layoutVersion < CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION;
}

function ensureCanonicalCaseWorkflowEndNode(workflow) {
  if (!workflow?.nodes?.length || !isStraightCaseWorkflowLayoutTarget(workflow)) return null;
  let endNode = workflow.nodes.find((n) => n.type === 'end');
  if (!endNode) {
    const endId = workflow.nodes.some((n) => n.id === 'wf-end') ? `wf-end-${Date.now()}` : 'wf-end';
    endNode = createTerminalWorkflowNode('end', endId, WF_LAYOUT_PAD.x, WF_LAYOUT_PAD.y);
    workflow.nodes.push(endNode);
  }
  workflow.edges = workflow.edges || [];
  const endId = endNode.id;
  ['wf-n-ok', 'wf-n-supp', 'wf-n-error'].forEach((fromId) => {
    if (!workflow.nodes.some((n) => n.id === fromId)) return;
    if (!workflow.edges.some((e) => e.from === fromId && e.to === endId)) {
      workflow.edges.push({ from: fromId, to: endId });
    }
  });
  return endNode;
}

function applyCanonicalCaseWorkflowLayout(workflow) {
  if (!isStraightCaseWorkflowLayoutTarget(workflow)) return workflow;
  migrateEnsureTerminalNodes(workflow);
  ensureCanonicalCaseWorkflowEndNode(workflow);
  layoutWorkflowGraph(workflow);
  workflow.layoutVersion = CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION;
  return workflow;
}

function layoutStraightCaseWorkflow(workflow, sizes) {
  const nodes = workflow?.nodes || [];
  if (!isStraightCaseWorkflowLayoutTarget(workflow)) return false;
  if (!hasOnlyCanonicalDefaultCaseWorkflowNodes(workflow)) return false;
  ensureCanonicalCaseWorkflowEndNode(workflow);
  if (hasCanonicalDefaultCaseWorkflowNodes(workflow)) {
    applyDefaultCaseWorkflowStaticLayout(workflow);
    return true;
  }
  const byId = Object.fromEntries(workflow.nodes.map((node) => [node.id, node]));
  const mainIds = [
    'wf-start', 'wf-pp', 'wf-d-pre', 'wf-oc', 'wf-d-ocr',
    'wf-map', 'wf-ai', 'wf-d-final',
  ].filter((id) => byId[id]);
  const hitlAnchors = [
    ['wf-hu-pre', 'wf-d-pre', 'wf-oc'],
    ['wf-hu-ocr', 'wf-d-ocr', 'wf-map'],
    ['wf-hu-final', 'wf-d-final', 'wf-end'],
  ].filter(([hitlId, anchorId]) => byId[hitlId] && byId[anchorId]);
  const notifyIds = ['wf-n-ok', 'wf-n-supp', 'wf-n-error'].filter((id) => byId[id]);
  const stepGap = 112;
  const branchStepGap = 288;
  const notifyLaneGap = 28;
  const rowY = WF_LAYOUT_PAD.y;
  let x = WF_LAYOUT_PAD.x;
  let mainMaxH = 76;

  mainIds.forEach((id) => {
    const node = byId[id];
    const size = sizes.get(node.id) || getWorkflowNodeLayoutSize(node);
    node.x = x;
    node.y = rowY;
    mainMaxH = Math.max(mainMaxH, size.h);
    const hasHitlBypass = hitlAnchors.some(([, anchorId]) => anchorId === id);
    x += size.w + (hasHitlBypass ? branchStepGap : stepGap);
  });

  let lowerMaxBottom = rowY + mainMaxH;
  hitlAnchors.forEach(([hitlId, anchorId, joinId]) => {
    const hitl = byId[hitlId];
    const anchor = byId[anchorId];
    const join = byId[joinId];
    const anchorSize = sizes.get(anchor.id) || getWorkflowNodeLayoutSize(anchor);
    const hitlSize = sizes.get(hitl.id) || getWorkflowNodeLayoutSize(hitl);
    const joinLeft = join
      ? join.x
      : anchor.x + anchorSize.w + stepGap;
    const anchorRight = anchor.x + anchorSize.w;
    hitl.x = Math.round((anchorRight + joinLeft) / 2 - hitlSize.w / 2);
    if (hitl.x < anchorRight + 24) hitl.x = anchorRight + 24;
    hitl.y = rowY + mainMaxH + WF_BRANCH_LANE_GAP;
    lowerMaxBottom = Math.max(lowerMaxBottom, hitl.y + hitlSize.h);
  });

  const notifyColumnX = x + 8;
  const notifyNodes = notifyIds.map((id) => {
    const size = sizes.get(id) || getWorkflowNodeLayoutSize(byId[id]);
    return { id, size };
  });
  const stackHeight = notifyNodes.reduce(
    (total, item, index) => total + item.size.h + (index > 0 ? notifyLaneGap : 0),
    0,
  );
  let notifyY = rowY + Math.max(0, Math.round((mainMaxH - stackHeight) / 2));
  let maxNotifyRight = notifyColumnX;
  notifyNodes.forEach((item) => {
    const node = byId[item.id];
    node.x = notifyColumnX;
    node.y = notifyY;
    maxNotifyRight = Math.max(maxNotifyRight, node.x + item.size.w);
    notifyY += item.size.h + notifyLaneGap;
  });

  disperseWorkflowNodesForSmoothEdges(workflow, sizes);

  const endNode = workflow.nodes.find((n) => n.type === 'end');
  if (endNode) {
    const endSize = sizes.get(endNode.id) || getWorkflowNodeLayoutSize(endNode);
    let maxX = notifyNodes.length ? maxNotifyRight : WF_LAYOUT_PAD.x;
    workflow.nodes.forEach((node) => {
      if (node.type === 'end') return;
      const size = sizes.get(node.id) || getWorkflowNodeLayoutSize(node);
      maxX = Math.max(maxX, node.x + size.w);
    });
    endNode.x = maxX + stepGap;
    const flowHeight = Math.max(mainMaxH, lowerMaxBottom - rowY, stackHeight);
    endNode.y = rowY + Math.max(0, Math.round((flowHeight - endSize.h) / 2));
  }

  workflow.layoutVersion = CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION;
  return true;
}

function layoutWorkflowByStage(workflow, sizes) {
  const nodes = workflow?.nodes || [];
  const edges = (workflow?.edges || []).filter((edge) => edge.branch !== 'request_supplement');
  const start = getWorkflowStartNode(workflow);
  if (!start) return false;
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const rankById = new Map([[start.id, 0]]);

  function visit(nodeId, rank, path = new Set()) {
    if (path.has(nodeId)) return;
    const previousRank = rankById.get(nodeId);
    if (previousRank != null && previousRank > rank) return;
    rankById.set(nodeId, Math.max(previousRank ?? 0, rank));
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    edges
      .filter((edge) => edge.from === nodeId)
      .forEach((edge) => visit(edge.to, rank + 1, nextPath));
  }

  visit(start.id, 0);
  let fallbackRank = Math.max(0, ...rankById.values()) + 1;
  nodes.forEach((node) => {
    if (!rankById.has(node.id)) {
      rankById.set(node.id, fallbackRank);
      fallbackRank += 1;
    }
  });

  const ranks = [...new Set(rankById.values())].sort((first, second) => first - second);
  const xByRank = new Map();
  let x = WF_LAYOUT_PAD.x;
  ranks.forEach((rank) => {
    xByRank.set(rank, x);
    const rankNodes = nodes.filter((node) => rankById.get(node.id) === rank);
    const maxWidth = Math.max(...rankNodes.map((node) => sizes.get(node.id).w));
    x += maxWidth + WF_NODE_GAP;
  });

  const mainY = WF_LAYOUT_PAD.y;
  const branchY = mainY + 212;
  ranks.forEach((rank) => {
    const rankNodes = nodes.filter((node) => rankById.get(node.id) === rank);
    const mainNodes = rankNodes.filter((node) => !isHitlGateNode(node));
    const hitlNodes = rankNodes.filter((node) => isHitlGateNode(node));
    mainNodes.forEach((node, index) => {
      node.x = xByRank.get(rank);
      node.y = mainY + index * 112;
    });
    hitlNodes.forEach((node, index) => {
      node.x = xByRank.get(rank);
      node.y = branchY + index * (sizes.get(node.id).h + 32);
    });
  });

  workflow.layoutVersion = CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION;
  return true;
}

function layoutWorkflowGraph(workflow) {
  if (!workflow?.nodes?.length) return workflow;
  const nodes = workflow.nodes;
  const edges = workflow.edges || [];
  const sizes = new Map(nodes.map((n) => [n.id, getWorkflowNodeLayoutSize(n)]));
  if (layoutStraightCaseWorkflow(workflow, sizes)) return workflow;
  if (layoutWorkflowByStage(workflow, sizes)) return workflow;
  const mainChain = buildWorkflowMainChain(workflow);
  const mainIds = new Set(mainChain.map((n) => n.id));

  if (mainChain.length) {
    const maxMainH = Math.max(...mainChain.map((n) => sizes.get(n.id).h));
    let x = WF_LAYOUT_PAD.x;
    mainChain.forEach((node) => {
      const size = sizes.get(node.id);
      node.x = x;
      node.y = WF_LAYOUT_PAD.y + Math.round((maxMainH - size.h) / 2);
      x += size.w + WF_NODE_GAP;
    });
  }

  const branchNodes = nodes.filter((n) => !mainIds.has(n.id) && n.type !== 'end');
  const decisionNode = [...mainChain].reverse().find((n) => n.type === 'decision')
    || mainChain[mainChain.length - 1];
  const branchStartX = decisionNode
    ? decisionNode.x + sizes.get(decisionNode.id).w + WF_LAYOUT_MIN_EDGE_GAP
    : WF_LAYOUT_PAD.x;
  const elseLaneY = decisionNode
    ? decisionNode.y + sizes.get(decisionNode.id).h + WF_BRANCH_LANE_GAP
    : WF_LAYOUT_PAD.y + 180;

  branchNodes.forEach((node) => {
    const inEdges = edges.filter((e) => e.to === node.id);
    const fromDecision = inEdges.find((e) => e.from === decisionNode?.id && e.branch === 'else');
    if (fromDecision) {
      layoutWorkflowBranchChain(workflow, fromDecision.to, branchStartX, elseLaneY, sizes);
      return;
    }
    const sourceEdge = inEdges.find((e) => mainIds.has(e.from)) || inEdges[0];
    const source = sourceEdge ? nodes.find((n) => n.id === sourceEdge.from) : null;
    const size = sizes.get(node.id);
    if (source) {
      const srcSize = sizes.get(source.id);
      const branch = sourceEdge.branch;
      const isElse = branch === 'else';
      const isElif = branch && String(branch).startsWith('elif');
      if (isElif) {
        node.x = source.x + srcSize.w + WF_LAYOUT_MIN_EDGE_GAP;
        node.y = source.y + srcSize.h + WF_BRANCH_LANE_GAP;
      } else if (isElse) {
        node.x = source.x + srcSize.w + WF_LAYOUT_MIN_EDGE_GAP;
        node.y = source.y + srcSize.h + WF_BRANCH_LANE_GAP;
      } else {
        node.x = source.x + srcSize.w + WF_LAYOUT_MIN_EDGE_GAP;
        node.y = source.y + srcSize.h + WF_BRANCH_LANE_GAP;
      }
      return;
    }
    node.x = WF_LAYOUT_PAD.x;
    node.y = elseLaneY + 120;
  });

  resolveWorkflowBranchOverlaps(branchNodes, sizes);
  disperseWorkflowNodesForSmoothEdges(workflow, sizes);

  const endNode = nodes.find((n) => n.type === 'end');
  if (endNode) {
    let maxX = WF_LAYOUT_PAD.x;
    nodes.forEach((node) => {
      if (node.type === 'end') return;
      const size = sizes.get(node.id);
      maxX = Math.max(maxX, node.x + size.w);
    });
    const mainY = mainChain[0]?.y ?? WF_LAYOUT_PAD.y;
    const mainH = mainChain.length
      ? Math.max(...mainChain.map((n) => sizes.get(n.id).h))
      : sizes.get(endNode.id).h;
    endNode.x = maxX + WF_NODE_GAP;
    endNode.y = mainY + Math.round((mainH - sizes.get(endNode.id).h) / 2);
  }

  workflow.layoutVersion = CANONICAL_CASE_WORKFLOW_LAYOUT_VERSION;
  return workflow;
}

function sortWorkflowEndFlowNodes(nodes) {
  return [...nodes].sort((a, b) => {
    const ao = WORKFLOW_MAIN_CHAIN_TYPE_ORDER[a.type];
    const bo = WORKFLOW_MAIN_CHAIN_TYPE_ORDER[b.type];
    if (ao == null && bo == null) return (a.x || 0) - (b.x || 0);
    if (ao == null) return 1;
    if (bo == null) return -1;
    if (ao !== bo) return ao - bo;
    return (a.x || 0) - (b.x || 0);
  });
}

/** 同一親からの非分岐ファンアウト（実並列） */
function getWorkflowParallelFanOutChildren(workflow, parentId, endNodeId, nodeMap, cache = {}) {
  const edges = (workflow?.edges || []).filter((e) => e.from === parentId && !e.branch);
  const outs = edges.filter((e) => workflowEdgeLeadsToEnd(workflow, parentId, e.to, endNodeId, cache));
  if (outs.length <= 1) return null;
  const children = sortWorkflowEndFlowNodes(outs.map((e) => nodeMap[e.to]).filter(Boolean));
  const mergeIds = children.map((child) => {
    const next = (workflow?.edges || []).filter((e) => e.from === child.id && !e.branch);
    return next.length === 1 ? next[0].to : null;
  });
  if (!mergeIds[0] || !mergeIds.every((id) => id === mergeIds[0])) return null;
  return children;
}

function workflowEndFlowBranchPriority(branch) {
  if (branch === 'if' || branch === 'approve') return 0;
  if (!branch) return 1;
  if (branch && String(branch).startsWith('elif')) return 2;
  if (branch === 'request_supplement') return 2;
  if (branch === 'else' || branch === 'reject') return 3;
  return 4;
}

function workflowEdgeLeadsToEnd(workflow, fromId, toId, endNodeId, cache = {}) {
  const key = `${fromId}->${toId}:${endNodeId}`;
  if (cache[key] !== undefined) return cache[key];
  if (toId === endNodeId) {
    cache[key] = true;
    return true;
  }
  const edges = workflow?.edges || [];
  const visited = new Set();
  const queue = [toId];
  while (queue.length) {
    const id = queue.shift();
    if (id === endNodeId) {
      cache[key] = true;
      return true;
    }
    if (visited.has(id)) continue;
    visited.add(id);
    edges.filter((e) => e.from === id).forEach((e) => queue.push(e.to));
  }
  cache[key] = false;
  return false;
}

function pickWorkflowPathEdge(workflow, fromId, endNodeId, cache = {}) {
  const edges = (workflow?.edges || []).filter((e) => e.from === fromId);
  if (!edges.length) return null;
  const ranked = edges
    .filter((e) => workflowEdgeLeadsToEnd(workflow, e.from, e.to, endNodeId, cache))
    .sort((a, b) => {
      const prio = workflowEndFlowBranchPriority(a.branch) - workflowEndFlowBranchPriority(b.branch);
      if (prio !== 0) return prio;
      return String(a.label || '').localeCompare(String(b.label || ''), 'ja');
    });
  return ranked[0] || edges.find((e) => !e.branch) || edges[0];
}

function getWorkflowPathNodeIds(workflow, endNodeId) {
  const nodes = workflow?.nodes || [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const start = getWorkflowStartNode(workflow);
  if (!start || !endNodeId) return [];
  const ids = [];
  const seen = new Set();
  let cur = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    ids.push(cur.id);
    if (cur.id === endNodeId) break;
    const edge = pickWorkflowPathEdge(workflow, cur.id, endNodeId);
    if (!edge) break;
    cur = nodeMap[edge.to];
  }
  return ids;
}

function collectWorkflowForwardChain(workflow, startNodeId, stopBeforeId = null) {
  const nodes = workflow?.nodes || [];
  const edges = workflow?.edges || [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const chain = [];
  let cur = nodeMap[startNodeId];
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.type === 'end' || cur.id === stopBeforeId) break;
    chain.push(cur);
    const outs = edges.filter((e) => e.from === cur.id);
    if (outs.length !== 1) break;
    cur = nodeMap[outs[0].to];
  }
  return chain;
}

function getWorkflowEndFlowNodeRole(type) {
  if (type === 'start') return 'start';
  if (type === 'end') return 'end';
  if (type === 'decision') return 'condition';
  if (type === 'hitl_gate') return 'confirm';
  if (type === 'notify') return 'notify';
  return 'process';
}

function getWorkflowEndFlowNodeBadge(type) {
  if (type === 'decision') return '条件';
  if (type === 'hitl_gate') return '確認';
  return '';
}

function buildWorkflowEndFlowNodeItem(node, pathIds, endNodeId) {
  if (!node) return null;
  const state = node.id === endNodeId ? 'current' : 'configured';
  return {
    id: node.id,
    type: node.type,
    label: node.label || getWorkflowNodeMeta(node.type).title,
    role: getWorkflowEndFlowNodeRole(node.type),
    badge: getWorkflowEndFlowNodeBadge(node.type),
    state,
  };
}

function buildWorkflowEndFlowSummaryNotes(workflow, pathIds) {
  const notes = [];
  (workflow?.nodes || []).forEach((node) => {
    if (!pathIds.has(node.id) || !isHitlGateNode(node)) return;
    const preset = getHitlGatePreset(node);
    const title = preset?.label || node.label || '人工確認';
    notes.push(`${title}：必要（${node.label || title}へ）`);
  });
  return notes;
}

function buildWorkflowEndFlowPreview(workflow, endNodeId) {
  const nodes = workflow?.nodes || [];
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const endNode = nodeMap[endNodeId];
  if (!endNode || endNode.type !== 'end') {
    return { endLabel: '', summaryNotes: [], stages: [] };
  }
  const pathIds = new Set(getWorkflowPathNodeIds(workflow, endNodeId));
  const pathNodes = getWorkflowPathNodeIds(workflow, endNodeId)
    .map((id) => nodeMap[id])
    .filter(Boolean);
  const stages = [];
  let i = 0;
  while (i < pathNodes.length) {
    const node = pathNodes[i];
    if (node.type === 'end') {
      stages.push({
        id: `stage-end-${node.id}`,
        kind: 'single',
        node: buildWorkflowEndFlowNodeItem(node, pathIds, endNodeId),
      });
      i += 1;
      continue;
    }
    if (node.type === 'decision') {
      const outEdges = (workflow?.edges || []).filter((e) => e.from === node.id);
      const activeEdge = pickWorkflowPathEdge(workflow, node.id, endNodeId);
      const activeChainIds = new Set(
        collectWorkflowForwardChain(workflow, activeEdge?.to, endNodeId).map((n) => n.id),
      );
      const branches = outEdges.map((edge) => {
        const active = edge === activeEdge;
        const branchNodes = collectWorkflowForwardChain(workflow, edge.to, endNodeId)
          .map((n) => buildWorkflowEndFlowNodeItem(n, pathIds, endNodeId));
        return {
          id: `${node.id}-${edge.branch || edge.to}`,
          label: edge.label || getDecisionBranchEdgeLabel(edge.branch, node) || '分岐',
          active,
          nodes: branchNodes,
        };
      });
      stages.push({
        id: `stage-decision-${node.id}`,
        kind: 'decision',
        node: buildWorkflowEndFlowNodeItem(node, pathIds, endNodeId),
        branches,
      });
      while (i + 1 < pathNodes.length && activeChainIds.has(pathNodes[i + 1].id)) {
        i += 1;
      }
      i += 1;
      continue;
    }
    if (isHitlGateNode(node)) {
      const outEdges = (workflow?.edges || []).filter((e) => e.from === node.id && e.branch);
      const activeEdge = pickWorkflowPathEdge(workflow, node.id, endNodeId);
      const activeChainIds = new Set(
        collectWorkflowForwardChain(workflow, activeEdge?.to, endNodeId).map((n) => n.id),
      );
      const branches = outEdges.map((edge) => {
        const active = edge === activeEdge;
        const branchNodes = collectWorkflowForwardChain(workflow, edge.to, endNodeId)
          .map((n) => buildWorkflowEndFlowNodeItem(n, pathIds, endNodeId));
        return {
          id: `${node.id}-${edge.branch || edge.to}`,
          label: edge.label || getHitlGateBranchEdgeLabel(edge.branch, node) || '分岐',
          active,
          nodes: branchNodes,
        };
      });
      stages.push({
        id: `stage-hitl-${node.id}`,
        kind: 'decision',
        node: buildWorkflowEndFlowNodeItem(node, pathIds, endNodeId),
        branches,
      });
      while (i + 1 < pathNodes.length && activeChainIds.has(pathNodes[i + 1].id)) {
        i += 1;
      }
      i += 1;
      continue;
    }
    const fanOutChildren = getWorkflowParallelFanOutChildren(workflow, node.id, endNodeId, nodeMap);
    if (fanOutChildren?.length > 1) {
      stages.push({
        id: `stage-single-${node.id}`,
        kind: 'single',
        node: buildWorkflowEndFlowNodeItem(node, pathIds, endNodeId),
      });
      stages.push({
        id: `stage-row-${fanOutChildren.map((n) => n.id).join('-')}`,
        kind: 'row',
        nodes: fanOutChildren.map((n) => buildWorkflowEndFlowNodeItem(n, pathIds, endNodeId)),
      });
      const childIds = new Set(fanOutChildren.map((n) => n.id));
      i += 1;
      while (i < pathNodes.length && childIds.has(pathNodes[i].id)) i += 1;
      continue;
    }
    stages.push({
      id: `stage-single-${node.id}`,
      kind: 'single',
      node: buildWorkflowEndFlowNodeItem(node, pathIds, endNodeId),
    });
    i += 1;
  }
  return {
    endLabel: endNode.label || getWorkflowNodeMeta('end').title,
    summaryNotes: buildWorkflowEndFlowSummaryNotes(workflow, pathIds),
    stages,
  };
}
