import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('initializes the workflow canvas with only the fixed start node', async () => {
  const sceneConfig = await readFile(new URL('../scripts/scene-config.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.doesNotMatch(sceneConfig, /case: buildDefaultCaseWorkflow\(\)/);
  assert.equal((sceneConfig.match(/case: buildMinimalCaseWorkflow\(\)/g) || []).length, 2);
  assert.match(main, /initialForm\.workflows\.case = buildDefaultCaseWorkflow\(\)/);
  assert.doesNotMatch(main, /initialForm\.workflows\.case = buildMinimalCaseWorkflow\(\)/);
});

test('keeps new drafts minimal and restores accidentally cleared published workflows', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');

  assert.match(workflowCore, /if \(isMinimalPlaceholderCaseWorkflow\(workflow\)\) return false;/);
  assert.match(workflowCore, /if \(isDefaultCaseWorkflowTemplate\(workflow\)\) return true;/);
  assert.match(workflowCore, /function shouldRestorePublishedWorkflow\(form\)/);
  assert.match(workflowCore, /form\?\.scene\?\.publishStatus === 'published'/);
  assert.match(workflowCore, /if \(shouldRestorePublishedWorkflow\(form\)\) \{\s*form\.workflows\.case = buildDefaultCaseWorkflow\(\);/s);
  assert.doesNotMatch(workflowCore, /shouldMigrateCaseWorkflowToDefault\(form\.workflows\.case\)\) \{\s*form\.workflows\.case = buildMinimalCaseWorkflow\(\);/s);
});

test('labels the built-in workflow test fixture as mock data', async () => {
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(mockData, /label: 'Mock テストデータ'/);
  assert.match(mockData, /Mock の集約済み案件データ/);
  assert.match(index, />Mock データ</);
  assert.doesNotMatch(index, />ファイル固定</);
});

test('routes workflow edges with the supplied obstacle-aware reference algorithm', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(main, /function getWorkflowReferenceBezierControls\(start, end\)/);
  assert.match(main, /function workflowReferenceSegmentIntersectsRect\(segment, rect\)/);
  assert.match(main, /function getWorkflowReferenceSegmentConflictPenalty\(first, second\)/);
  assert.match(main, /function getWorkflowReferenceRouteScore\(points, routedSegments\)/);
  assert.match(main, /function buildWorkflowReferenceRoundedPath\(points\)/);
  assert.match(main, /function canUseWorkflowReferenceDirectCurve\(start, end, obstacles, sourceNodeId, targetNodeId\)/);
  assert.match(main, /function buildWorkflowReferenceRoutedPath\(draft, obstacles, routedSegments, edgeIndex\)/);
  assert.match(main, /\.filter\(\(points\) => isWorkflowReferenceRouteClear\(points, obstacles\)\)/);
  assert.match(main, /routedSegments\.push\(\.\.\.routed\.segments\.slice\(2, -2\)\)/);
});

test('uses horizontal main-chain layout after adding custom nodes', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');

  assert.match(workflowCore, /function hasOnlyCanonicalDefaultCaseWorkflowNodes\(workflow\)/);
  assert.match(workflowCore, /nodes\.length !== STRAIGHT_CASE_WORKFLOW_NODE_IDS\.length/);
  assert.match(workflowCore, /if \(!hasOnlyCanonicalDefaultCaseWorkflowNodes\(workflow\)\) return false;/);
  assert.match(workflowCore, /function layoutWorkflowByStage\(workflow, sizes\)/);
  assert.match(workflowCore, /edge\.branch !== 'request_supplement'/);
  assert.match(workflowCore, /const mainNodes = rankNodes\.filter\(\(node\) => !isHitlGateNode\(node\)\);/);
  assert.match(workflowCore, /const hitlNodes = rankNodes\.filter\(\(node\) => isHitlGateNode\(node\)\);/);
  assert.match(workflowCore, /node\.y = branchY \+ index \* \(sizes\.get\(node\.id\)\.h \+ 32\);/);
  assert.match(workflowCore, /if \(layoutWorkflowByStage\(workflow, sizes\)\) return workflow;/);
});

test('uses current document names and a distinct test-input error step', async () => {
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');
  const sampleStart = mockData.indexOf('const WORKFLOW_TEST_SAMPLES =');
  const sampleEnd = mockData.indexOf('const WORKFLOW_TEST_START_EVENT_IDS', sampleStart);
  const sampleSource = mockData.slice(sampleStart, sampleEnd);

  assert.match(sampleSource, /name: '保険請求書_p1-2\.pdf'/);
  assert.match(sampleSource, /docType: '保険請求書'/);
  assert.doesNotMatch(sampleSource, /docType: '保険金請求書'/);
  assert.match(mockData, /const errorId = first\?\.nodeId \|\| 'gate';/);
  assert.match(mockData, /'テスト入力チェック'/);
});

test('hides the uncompiled Vue template until mount', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(index, /\[v-cloak\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(index, /<div id="app" v-cloak>/);
});

test('always opens the prototype in Japanese', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(main, /localStorage\.setItem\('neosai-idp-ui-language', 'ja'\);/);
  assert.match(main, /const uiLanguage = ref\('ja'\);/);
  assert.doesNotMatch(main, /ref\(localStorage\.getItem\('neosai-idp-ui-language'\)/);
});

test('uses a compact required badge for the scene name', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(index, /業務シーン名<span class="field-required">必須<\/span>/);
  assert.doesNotMatch(index, /field-required">（必須）/);
  assert.match(style, /\.field-required\s*\{[^}]*background:\s*#fff1f3;[^}]*color:\s*#e54861;/s);
});

test('shows Japanese output names and focused value tooltips', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(index, /workflow-output-var-name[\s\S]*item\.displayName[\s\S]*aria-label="取値範囲"[\s\S]*workflow-output-var-type/);
  assert.match(main, /displayName: getWorkflowOutputDisplayName\(item\)/);
  assert.match(main, /item\?\.valueSpec \? `取値範囲：\$\{t\(item\.valueSpec\)\}`/);
  assert.doesNotMatch(main, /`変数名：\$\{name\}`/);
  assert.match(main, /return `\$\{base\}\\n\\n例：\\n\$\{example\}`/);
  assert.match(workflowCore, /id: 'case\.standardFields', label: '標準変数', scope: '案件', type: 'Object'/);
  assert.doesNotMatch(workflowCore, /WORKFLOW_STANDARD_FIELDS_OBJECT_EXAMPLE/);
  assert.match(style, /\.workflow-output-var-item\s*\{[^}]*justify-content:\s*space-between;/s);
  assert.match(style, /\.workflow-output-var-type\s*\{[^}]*margin-left:\s*auto;/s);
});

test('keeps data mapping output limited to status and standard variables', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const dataMappingOutputStart = workflowCore.indexOf('  data_mapping: [');
  const dataMappingOutputEnd = workflowCore.indexOf('  decision: [],', dataMappingOutputStart);
  const dataMappingOutput = workflowCore.slice(dataMappingOutputStart, dataMappingOutputEnd);

  assert.match(dataMappingOutput, /case\.mappingStatus/);
  assert.match(dataMappingOutput, /case\.standardFields/);
  assert.doesNotMatch(dataMappingOutput, /case\.mappingResult/);
  assert.doesNotMatch(main, /value: 'mappingResult'/);
});

test('removes match-result columns from Step4 export tables', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(index, /照合結果（サンプル）/);
  assert.doesNotMatch(index, /class="col-match"/);
  assert.doesNotMatch(index, /row\.matchValue/);
});

test('centers the workflow setup step track independently from actions', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(index, /class="wf-setup-stepper-track"/);
  assert.match(index, /class="wf-setup-stepper-actions"/);
  assert.match(style, /\.wf-setup-stepper\s*\{[^}]*justify-content:\s*center;/s);
  assert.match(style, /\.wf-setup-stepper-actions\s*\{[^}]*position:\s*absolute;[^}]*right:\s*20px;/s);
  assert.ok(index.indexOf('class="wf-version-history-btn"') < index.indexOf('class="wf-setup-fullscreen-btn"'));
  assert.match(style, /\.wf-version-history-btn\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;[^}]*border:\s*1px solid #d0d5dd;/s);
  assert.match(style, /\.wf-setup-fullscreen-btn\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;[^}]*border:\s*none;/s);
});

test('excludes custom functions from Step2 configuration checks', async () => {
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');

  assert.doesNotMatch(mockData, /JavaScript を入力してください/);
  assert.doesNotMatch(mockData, /関数入力「\$\{raw\}」が上流から到達できません/);
  assert.match(mockData, /case 'code':\s*return '';/);
});

test('uses an executable file-renaming function as the custom node default', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const appMain = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const source = workflowCore.match(/const DEFAULT_CODE_PYTHON = `([\s\S]*?)`;\n/)?.[1] || '';
  const main = new Function(`${source}\nreturn main;`)();
  const result = main({
    claimno: 'CLM/001',
    requestNo: 'REQ:002',
    files: [
      { id: 'file-1', documentTypeId: '2080100341838004224', fileName: 'before.pdf' },
      { id: 'file-2', documentTypeId: '2080100341838004224', fileName: 'before.jpg' },
    ],
  });

  assert.equal(result.renamedFileCount, 2);
  assert.equal(result.files[0].fileId, 'file-1');
  assert.match(result.files[0].fileName, /^\d{12}_CLM_001_REQ_002_HA21-002_01\.pdf$/);
  assert.match(result.files[1].fileName, /^\d{12}_CLM_001_REQ_002_HA21-002_02\.jpg$/);
  assert.match(workflowCore, /name: 'files',[\s\S]*variable: CODE_UPSTREAM_FILES_JSON/);
  assert.match(workflowCore, /name: 'claimno',[\s\S]*variable: 'docTypes\.保険請求書\.証券番号'/);
  assert.match(workflowCore, /name: 'requestNo',[\s\S]*variable: 'docTypes\.保険請求書\.請求番号'/);
  assert.match(workflowCore, /: createDefaultCodeInputRows\(\);/);
  assert.match(workflowCore, /function isLegacyDefaultCodeScript\(code\)/);
  assert.match(workflowCore, /source\.includes\('\/\/ Excel の命名例:'\)/);
  assert.match(workflowCore, /source\.includes\('timestamp_seq_setNo_claimNo_requestNo_docId_branch_ocrFlag\.pdf'\)/);
  assert.match(workflowCore, /source\.includes\('\/\/ 已确认的账票类型 ID 与文件代码。'\)/);
  assert.match(workflowCore, /return legacyExcelTemplate \|\| chineseCommentTemplate;/);
  assert.match(workflowCore, /function localizeDefaultCodeScriptComments\(code\)/);
  assert.match(workflowCore, /未配置代码时使用稳定的账票类型\\s\*ID/);
  assert.match(workflowCore, /localizeDefaultCodeScriptComments\(node\.pythonCode\)/);
  assert.match(workflowCore, /const migrateLegacyDefault = isLegacyDefaultCodeScript\(node\.pythonCode\);/);
  assert.match(workflowCore, /Array\.isArray\(node\.inputs\) && \(node\.inputs\.length \|\| !migrateLegacyDefault\)/);
  assert.match(workflowCore, /pythonCode: !migrateLegacyDefault && node\.pythonCode/);
  assert.match(index, /:title="`入力変数 \$\{selectedCodeInputRows\.length\}`"/);
  assert.match(index, /class="inspector-panel-section code-node-inspector"/);
  assert.match(index, /formatCodeInputSourceLabel\(row\.variable\)/);
  assert.match(index, /v-model="selectedWorkflowCode"/);
  assert.doesNotMatch(index, /openCodeParamDialog\(row\)/);
  assert.match(appMain, /保険金請求書（変更禁止） \/ 証券番号/);
  assert.match(appMain, /保険金請求書（変更禁止） \/ 請求番号/);
  assert.match(appMain, /const selectedWorkflowCode = computed\(\{/);
  assert.match(appMain, /if \(localizedCode !== node\.pythonCode\) node\.pythonCode = localizedCode;/);
  assert.match(style, /\.code-param-list-item\s*\{[^}]*border-bottom:\s*1px solid #eaecf0;[^}]*background:\s*transparent;/s);
  assert.match(workflowCore, /function newCodeParamId\(prefix\)/);
  assert.match(workflowCore, /codeParamIdSequence \+= 1;/);
  assert.match(workflowCore, /function ensureUniqueCodeParamIds\(rows, prefix\)/);
  assert.match(workflowCore, /const inputs = ensureUniqueCodeParamIds\(normalizedInputs, 'cin'\);/);
  assert.match(index, /@click="removeCodeInputParam\(row\)"/);
  assert.match(appMain, /node\.inputs = node\.inputs\.filter\(\(candidate\) => candidate !== row\);/);
  assert.match(style, /\.code-node-inspector \.inspector-section-block:first-child \.inspector-section-block__head\s*\{[^}]*border-bottom:\s*none;/s);

  const legacyMarker = [
    '// Excel の命名例:',
    '// timestamp_seq_setNo_claimNo_requestNo_docId_branch_ocrFlag.pdf',
    'const files = inputs.files || [];',
  ].join('\n');
  assert.equal(
    legacyMarker.includes('// Excel の命名例:')
      && legacyMarker.includes('timestamp_seq_setNo_claimNo_requestNo_docId_branch_ocrFlag.pdf'),
    true,
  );
});

test('collapses relation preview and highlights curved field relations', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const sceneConfig = await readFile(new URL('../scripts/scene-config.js', import.meta.url), 'utf8');

  assert.match(main, /const sceneSetupNetworkExpandedDocs = reactive\(\{\}\)/);
  assert.match(main, /const sceneSetupNetworkSelectedFieldKey = ref\(''\)/);
  assert.match(main, /sceneSetupNetworkExpandedDocs/);
  assert.match(sceneConfig, /const visibleFields = expandedDocs\?\.\[docType\] \? fields : linkedFields/);
  assert.match(sceneConfig, /return `M \$\{x1\} \$\{y1\} C/);
  assert.match(sceneConfig, /function partitionRelatedDocTypes/);
  assert.match(sceneConfig, /components\.forEach\(\(component\) => \{[\s\S]*leftTypes\.length <= rightTypes\.length/);
  assert.match(sceneConfig, /crossingCount/);
  assert.match(sceneConfig, /function buildNetSameColumnEdgePath/);
  assert.match(sceneConfig, /path: buildNetSameColumnEdgePath\(srcNode, tgtNode, srcY, tgtY\)/);
  assert.match(sceneConfig, /const sourceX = isLeftColumn \? sourceNode\.left \+ sourceNode\.width : sourceNode\.left/);
  assert.match(sceneConfig, /const targetX = isLeftColumn \? targetNode\.left \+ targetNode\.width : targetNode\.left/);
  assert.match(sceneConfig, /const direction = isLeftColumn \? 1 : -1/);
  assert.match(index, /@click="toggleSceneSetupNetworkDoc\(node\.docType\)"/);
  assert.match(index, /@click="toggleSceneSetupNetworkField\(node\.docType, field\)"/);
  assert.match(index, /isSceneSetupNetworkEdgeActive\(edge\)/);
  assert.match(index, /isSceneSetupNetworkFieldActive\(node\.docType, field\)/);
  assert.match(index, /class="wf-network-zoom-toolbar"/);
  assert.match(index, /@click\.stop="zoomSceneSetupNetworkOut"/);
  assert.match(index, /@click\.stop="zoomSceneSetupNetworkIn"/);
  assert.match(index, /@click\.stop="fitSceneSetupNetwork"/);
  assert.match(main, /const sceneSetupNetworkZoom = ref\(null\)/);
  assert.match(main, /function fitSceneSetupNetwork\(\)/);
  assert.match(index, /v-for="field in node\.visibleFields"/);
  assert.match(index, /wf-network-doc-toggle[^>]*is-expanded/);
  assert.doesNotMatch(index, /marker-end="url\(#wf-net-arrow\)"/);
  assert.match(index, /class="wf-network-stat"/);
  const checkStart = main.indexOf('function checkSceneDocLinks()');
  const checkEnd = main.indexOf('function removeSceneSetupDoc', checkStart);
  const checkSource = main.slice(checkStart, checkEnd);
  assert.doesNotMatch(checkSource, /ElementPlus\.ElMessage\.warning\(err\)/);
});

test('uses one regular-weight settings shortcut label', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.equal((index.match(/class="inspector-settings-link"/g) || []).length, 3);
  assert.equal((index.match(/>設定ページへ →<\/el-button>/g) || []).length, 3);
  assert.match(style, /\.idp-inspector-body \.inspector-settings-link\.el-button\.is-link\s*\{[^}]*font-weight:\s*400;/s);
});

test('shows searchable node descriptions and colored icons in the node picker', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(index, /v-model="wfNodePicker\.search"[\s\S]*placeholder="検索ノード"/);
  assert.match(index, /class="wf-node-picker-icon"[\s\S]*getWorkflowNodeAccentStyle\(item\.type\)/);
  assert.match(index, /class="wf-node-picker-text"[\s\S]*class="wf-node-picker-summary"/);
  assert.match(index, /getWorkflowNodePickerDescription\(item\.type\)/);
  assert.doesNotMatch(index, /class="wf-node-picker-category"/);
  assert.match(index, /v-for="item in wfNodePickerAvailableNodes"/);
  assert.match(main, /search: ''/);
  assert.match(main, /getWorkflowNodePickerDescription\(item\.type\)/);
  assert.match(workflowCore, /const WORKFLOW_NODE_PICKER_DESCRIPTIONS =/);
  assert.match(workflowCore, /ai_verify: '必須フィールド、必要書類、テキスト検証、データ検証、標準データ整合性、署名・印鑑検証を実行します。'/);
  assert.match(style, /\.wf-node-picker-search/);
});

test('aligns OCR extraction switches to the row end', async () => {
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(style, /\.ocr-extract-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
  assert.match(style, /\.ocr-extract-row__toggle\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(style, /\.workflow-module-toggle-switch\.is-on\s*\{[^}]*background:\s*#667085;/s);
  assert.doesNotMatch(style, /\.workflow-module-toggle-switch\.is-on\s*\{[^}]*background:\s*#175cd3;/s);
});

test('does not render forward edges as backflow inside a cycle', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const edgePathsStart = main.indexOf('const workflowEdgePaths = computed');
  const edgePathsEnd = main.indexOf('const wfCanvasStageStyle', edgePathsStart);
  const edgePathsSource = main.slice(edgePathsStart, edgePathsEnd);

  assert.match(edgePathsSource, /const isBackflow = x2 < x1 - 24\s*\|\| edge\.branch === 'request_supplement';/);
  assert.doesNotMatch(edgePathsSource, /isWorkflowBackflowEdge\(getActiveWf\(\), edge\.from, edge\.to\)/);
});

test('keeps both notification insertion targets visible', async () => {
  const styles = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(styles, /\.notify-var-insert-target\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*width:\s*112px;[^}]*flex:\s*0 0 112px;/s);
  assert.match(styles, /\.notify-var-insert-target \.el-radio-button__inner\s*\{[^}]*width:\s*100%;/s);
  assert.equal((index.match(/<el-radio-button value="subject" :label="t\('件名'\)"><\/el-radio-button>/g) || []).length, 3);
  assert.equal((index.match(/<el-radio-button value="body" :label="t\('内容'\)"><\/el-radio-button>/g) || []).length, 3);
  assert.doesNotMatch(index, /<el-radio-button[^>]+\/>/);
});

test('uses type-aware condition value controls', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');

  assert.match(index, /v-if="decisionUsesFreeTextValue\(condition\)"/);
  assert.match(index, /v-else-if="decisionUsesValueSelect\(condition\)"/);
  assert.match(index, /v-for="opt in getDecisionValueOptions\(condition\)"/);
  assert.match(main, /return \['string', 'number'\]\.includes\(type\);/);
  assert.match(main, /return type === 'enum';/);
  assert.match(main, /return \{ value, label: value \};/);
  assert.match(workflowCore, /valueSpec: spec\.valueSpec \|\| ''/);
});

test('keeps status outputs but removes them from condition choices', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');

  assert.match(workflowCore, /case\.preprocessStatus[^\n]*WORKFLOW_OUTPUT_VALUE_SPECS\.nodeStatus/);
  assert.match(workflowCore, /function getDecisionVariableOptions[\s\S]*filter\(\(option\) => !isDecisionStatusVariable\(option\.value\)\)/);
  assert.match(workflowCore, /function buildCodeVariableOptions[\s\S]*buildCodeSourceVariableOptions/);
  assert.match(workflowCore, /if \(isDecisionStatusVariable\(cond\.variable\)\) return;/);
  assert.match(mockData, /typeof buildCodeVariableOptions === 'function'[\s\S]*buildCodeVariableOptions\(wf, node\.id, varSceneCtx\)/);
  assert.match(mockData, /status は条件に使用できません/);
  assert.doesNotMatch(workflowCore, /cond\(`\$\{(?:ppVar|ocrVar|aiVar)\}\.case\.(?:preprocess|ocr|verify)Status`/);
});

test('keeps only rotation, correction, and image alignment preprocessing', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const sceneConfig = await readFile(new URL('../scripts/scene-config.js', import.meta.url), 'utf8');
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');

  assert.match(workflowCore, /key: 'sort',[\s\S]*label: '画像整列'/);
  assert.doesNotMatch(workflowCore, /画像並び替え/);
  assert.doesNotMatch(workflowCore, /画像分割|画像組合|key: 'split'|key: 'combine'/);
  assert.doesNotMatch(mockData, /splitDocTypes|combineDocTypes/);
  assert.doesNotMatch(sceneConfig, /splitDocTypes|combineDocTypes/);
});

test('shows connected target names in decision branch rows', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(index, /getDecisionBranchTarget\(node\.id, 'else'\)/);
  assert.match(main, /if \(!edge\) return '未接続';/);
});

test('does not revalidate rules already enforced by configuration controls', async () => {
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');

  assert.doesNotMatch(mockData, /案件中止出口は接続できません/);
  assert.doesNotMatch(mockData, /補件出口は前述ノードへの回流接続のみ可能です/);
  assert.doesNotMatch(mockData, /審査ロールを選択してください/);
  assert.doesNotMatch(mockData, /データマッピングの上流に前処理\/OCR がありません/);
  assert.doesNotMatch(mockData, /AI検証の上流に OCR\/前処理結果がありません/);
});

test('keeps draft and published workflow history separate', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const sceneConfig = await readFile(new URL('../scripts/scene-config.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(sceneConfig, /function createPublishedSnapshot\(formData\)/);
  assert.match(sceneConfig, /delete snapshot\.publishedSnapshot;/);
  assert.match(sceneConfig, /delete snapshot\.publishedVersions;/);
  assert.match(sceneConfig, /form\.publishedVersions = \[\{/);
  assert.match(sceneConfig, /form\.publishedVersions = \[form\.publishedVersions\[form\.publishedVersions\.length - 1\]\];/);
  assert.match(main, /const workflowVersionView = ref\('draft'\);/);
  assert.match(main, /const selectedPublishedVersionId = ref\(''\);/);
  assert.match(main, /const latestPublishedVersion = computed/);
  assert.match(main, /form\.publishedVersions = \[publishedVersion\];/);
  assert.match(main, /function switchWorkflowVersionView\(versionId = ''\)/);
  assert.match(main, /const isWorkflowTopologyEditable = computed\(\(\) => workflowVersionView\.value === 'draft'\);/);
  assert.doesNotMatch(main, /showLatestPublishedVersionIfNeeded/);
  assert.match(main, /workflowVersionView\.value = 'published';/);
  assert.match(main, /function switchWorkflowVersionView\(versionId = ''\)[\s\S]*if \(!draftVersionBuffer\)[\s\S]*draftVersionBuffer\.scene\.publishStatus = 'draft';/);
  assert.match(index, /class="wf-version-history-btn" title="バージョン履歴"/);
  assert.match(index, /<el-icon class="wf-version-history-icon"><clock \/><\/el-icon>/);
  assert.match(index, /@element-plus\/icons-vue@2\.3\.1\/dist\/index\.iife\.min\.js/);
  assert.match(main, /app\.component\('Clock', ElementPlusIconsVue\.Clock\);/);
  assert.doesNotMatch(index, /<span>バージョン履歴<\/span>/);
  assert.match(index, />現在の下書き</);
  assert.doesNotMatch(index, /v-for="version in publishedVersionOptions"/);
  assert.match(index, /latestPublishedVersion/);
  assert.match(index, />適用中<\/span>/);
  assert.match(main, /function selectScene\(id, options = \{\}\)[\s\S]*workflowVersionView\.value = 'draft';/);
  assert.match(index, /:class="\{ 'is-applied-view': workflowVersionView === 'published' \}"/);
  assert.doesNotMatch(style, /適用中の設定（閲覧のみ）/);
  assert.match(index, /v-if="workflowVersionView === 'published'" class="wf-toolbar-right"[\s\S]*goToWorkflowSetupStep\(2, \{ readonlyNavigation: true \}\)[\s\S]*次へ/);
  assert.match(index, /goToWorkflowSetupStep\(3, \{ readonlyNavigation: true \}\)/);
  assert.match(index, /goToWorkflowSetupStep\(4, \{ readonlyNavigation: true \}\)/);
  assert.match(main, /if \(workflowVersionView\.value === 'published'\)[\s\S]*workflowSetupStep\.value = step;/);
  assert.match(index, /class="wf-setup-page" :inert="workflowVersionView === 'published'"/);
  assert.match(index, /class="idp-workspace"[\s\S]*:inert="workflowVersionView === 'published'"/);
  assert.match(index, /class="wf-notification-step-page" :inert="workflowVersionView === 'published'"/);
  assert.match(index, /class="wf-export-step-page" :inert="workflowVersionView === 'published'"/);
});

test('records scene publish history only after successful publication', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(index, /<el-dropdown-item command="history">変更履歴<\/el-dropdown-item>/);
  assert.match(index, /title="変更履歴"/);
  assert.match(index, /label="公開者"[\s\S]*label="公開日時"/);
  assert.match(main, /function openScenePublishHistory\(scene\)/);
  assert.match(main, /form\.publishHistory\.push\(\{[\s\S]*publishedBy:[\s\S]*publishedAt:/);
  assert.doesNotMatch(main, /function handleSave\(options = \{\}\)[\s\S]*publishHistory\.push/);
});

test('uses aligned delete icons and highlights the complete document-pair group', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(index, /class="case-link-doc-remove"[\s\S]*@click="removeSceneSetupDoc\(i\)"[\s\S]*>×<\/button>/);
  assert.match(index, /class="case-aggregate-pair-remove"[\s\S]*@click="removeSceneSetupAggregateGroup\(group\)"[\s\S]*>×<\/button>/);
  assert.match(index, /class="case-aggregate-pair-index">3\.\{\{ pairIndex \+ 1 \}\}<\/span>/);
  assert.match(index, /class="case-aggregate-detail-panel"[\s\S]*case-aggregate-condition-list/);
  assert.match(style, /\.case-aggregate-rule-card:has\(\.case-aggregate-pair-remove:hover\) \.case-aggregate-detail-panel/);
  assert.match(style, /\.case-link-doc-remove,[\s\S]*\.case-aggregate-pair-remove/);
  assert.doesNotMatch(style, /\.case-aggregate-condition-list::before/);
  assert.doesNotMatch(style, /\.case-aggregate-rule-card:has\(\.case-aggregate-pair-remove:hover\) \.case-aggregate-condition-group/);
  assert.match(style, /\.case-aggregate-pair-row[\s\S]*grid-template-columns: 18px minmax\(0, 1fr\) auto;[\s\S]*gap: 5px;/);
  assert.match(style, /\.case-aggregate-detail-panel[\s\S]*padding: 10px 11px 12px;/);
  assert.match(style, /\.case-aggregate-title-select,[\s\S]*\.case-aggregate-field-select[\s\S]*width: 100%;/);
  assert.match(style, /\.case-aggregate-group-remove,[\s\S]*\.case-aggregate-link-row \.wf-doc-link-remove[\s\S]*background: transparent;[\s\S]*color: #f04438;/);
  assert.match(style, /\.case-aggregate-link-row[\s\S]*width: calc\(100% - 8px\);[\s\S]*margin-left: 1px;/);
  assert.match(style, /\.case-aggregate-link-row \.wf-doc-link-remove[\s\S]*transform: translateX\(-3px\);/);
});

test('keeps related document rows neutral when hovering delete', async () => {
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.doesNotMatch(style, /\.case-link-doc-item:has\(\.case-link-doc-remove:hover\)/);
  assert.match(style, /\.case-link-doc-remove:hover,[\s\S]*background:\s*#fef3f2;/);
});

test('runs the Step2 configuration check before publishing from Step4', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(index, /class="wf-check-links-btn" @click="openWorkflowTestDialog">テスト/);
  assert.match(index, /<el-button type="primary" @click="publishWorkflowScene">公開<\/el-button>/);
  assert.match(index, /<el-button type="primary" @click="saveOutputConfigFromStep3">保存<\/el-button>/);
  assert.match(main, /function publishWorkflowScene\(\)[\s\S]*scenePublishStatusKey\.value !== 'ready'[\s\S]*checkWorkflowStep2Configuration\(\)[\s\S]*goToWorkflowSetupStep\(2\)[\s\S]*confirmPublishWorkflowScene\(\);/);
  assert.doesNotMatch(main, /function showWorkflowNotPublishableDialog\(\)/);
  assert.doesNotMatch(main, /function publishWorkflowScene\(\)[\s\S]{0,240}openWorkflowTestDialog/);
  assert.match(main, /function confirmPublishWorkflowScene\(\)[\s\S]*form\.scene\.publishStatus = 'published';/);
  assert.match(main, /workflowVersionView\.value = 'published';/);
  assert.match(main, /selectedPublishedVersionId\.value = publishedVersion\.id;/);
});

test('returns global Step3 and Step4 saves to draft before publishing', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  const markChangedSource = main.slice(
    main.indexOf('function markSceneConfigChanged()'),
    main.indexOf('function markScenePendingReview()'),
  );
  assert.match(markChangedSource, /\['published', 'pending_review', 'ready'\]\.includes\(form\.scene\.publishStatus\)/);
  assert.match(markChangedSource, /form\.scene\.publishStatus = 'draft';/);
  assert.doesNotMatch(markChangedSource, /scope === 'output'/);

  const notificationSaveSource = main.slice(
    main.indexOf('function saveWorkflowNotificationConfig(options = {})'),
    main.indexOf('function goToWorkflowStep4FromNotifications()'),
  );
  assert.match(notificationSaveSource, /validateWorkflowNotificationConfig\(\)/);
  assert.match(notificationSaveSource, /markScenePendingReview\(\);/);
  assert.ok(
    notificationSaveSource.indexOf('markScenePendingReview();')
      > notificationSaveSource.indexOf('if (err)'),
  );

  const outputSaveSource = main.slice(
    main.indexOf('function saveOutputConfigFromStep3()'),
    main.indexOf('function formatWorkflowTestDisplayText'),
  );
  assert.match(outputSaveSource, /handleSave\(\{ silent: true \}\)/);
  assert.doesNotMatch(outputSaveSource, /validateWorkflowStaticConfiguration/);

  const publishSource = main.slice(
    main.indexOf('function publishWorkflowScene()'),
    main.indexOf('function confirmPublishWorkflowScene()'),
  );
  assert.match(publishSource, /scenePublishStatusKey\.value !== 'ready'/);
  assert.match(publishSource, /checkWorkflowStep2Configuration\(\)/);
  assert.match(publishSource, /confirmPublishWorkflowScene\(\);/);
});

test('filters Step3 notification rules by subject or body and resets the query', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(main, /const workflowNotificationSearch = ref\(''\);/);
  assert.match(main, /const filteredWorkflowNotificationRuleRows = computed\([\s\S]*rule\.subject, rule\.body, rule\.emailRecipientDisplay/);
  assert.match(main, /function resetWorkflowNotificationSearch\(\)[\s\S]*workflowNotificationSearch\.value = '';/);
  assert.match(index, /v-model="workflowNotificationSearch"[\s\S]*placeholder="件名・内容で検索"/);
  assert.match(index, /@click="resetWorkflowNotificationSearch"[\s\S]*>リセット<\/el-button>/);
  assert.match(index, /workflow-notification-rule-list-head[\s\S]*通知ルール一覧[\s\S]*workflow-notification-rule-filter/);
  assert.doesNotMatch(index, /filteredWorkflowNotificationRuleRows\.length \}\}件/);
  assert.match(index, /v-for="rule in filteredWorkflowNotificationRuleRows"/);
});

test('supports email recipients with delimiter-separated addresses in Step3 notifications', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const core = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');

  assert.match(core, /function parseNotifyEmailRecipients/);
  assert.match(core, /function validateNotifyEmailRecipients/);
  assert.match(main, /emailRecipients: normalizeNotifyEmailRecipients\(rule\.emailRecipients\)/);
  assert.match(main, /validateNotifyEmailRecipients\(rule\.emailRecipients\)/);
  assert.match(index, /v-if="notificationRuleDraft\.channels\.includes\('email'\)"[\s\S]*メール宛先/);
  assert.match(index, /v-model="notificationRuleDraft\.emailRecipients"/);
  assert.match(index, /<th>メール宛先<\/th>/);
  assert.match(index, /rule\.emailRecipientDisplay/);
});

test('uses accent dots and keeps human review configuration role-only', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  const hitlStart = index.indexOf("inspectorPanel === 'hitl_gate'");
  const hitlEnd = index.indexOf('<!-- 開始ノード', hitlStart);
  const hitlPanel = index.slice(hitlStart, hitlEnd);
  assert.match(hitlPanel, /title="ゲート設定" desc="人工確認を担当するロールを指定します。"/);
  assert.match(hitlPanel, />担当ロール<\/label>/);
  assert.doesNotMatch(hitlPanel, /確認対象|selectedHitlGatePreset/);
  assert.match(style, /\.inspector-module-title::before\s*\{[^}]*width:\s*8px;[^}]*height:\s*8px;[^}]*border-radius:\s*50%;/s);
});

test('keeps manual labels pink and human review branch names neutral', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.equal((index.match(/class="wf-hitl-branch-name"/g) || []).length, 2);
  assert.match(style, /\.wf-hitl-branch-kind\s*\{[^}]*color:\s*#ff6674;/s);
  assert.match(style, /\.wf-node--hitl_gate \.wf-hitl-branch-name,[\s\S]*color:\s*#475467;/);
});

test('uses a rounded-square icon for human review nodes', async () => {
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(style, /\.wf-node--hitl_gate \.wf-node-icon\s*\{\s*border-radius:\s*6px;\s*\}/);
  assert.doesNotMatch(style, /\.wf-node--hitl_gate \.wf-node-icon\s*\{\s*border-radius:\s*50%;\s*\}/);
});

test('shows human review notification events as expressions', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(main, /value: 'approve', label: 'manualAction = approve'/);
  assert.match(main, /value: 'request_supplement', label: 'manualAction = request_supplement'/);
  assert.match(main, /value: 'reject', label: 'manualAction = reject'/);
});

test('keeps Step4 field columns equal and field lists scrollable', async () => {
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(style, /\.export-config--step \.export-field-table-wrap\s*\{[^}]*overflow-y:\s*auto;[^}]*max-height:\s*calc\(100vh - 320px\);/s);
  assert.match(style, /\.export-config--step \.export-field-table\s*\{[^}]*table-layout:\s*fixed;/s);
  assert.match(style, /\.export-config--step \.export-field-table \.col-name\s*\{\s*width:\s*46%;/);
  assert.match(style, /\.export-config--step \.export-field-table \.col-value\s*\{\s*width:\s*46%;/);
});

test('places workflow reset at the end of the canvas history toolbar', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const step2Start = index.indexOf('<template v-else-if="workflowSetupStep === 2">');
  const step2Workspace = index.indexOf('class="idp-workspace"', step2Start);
  const step2Toolbar = index.slice(step2Start, step2Workspace);
  const step2DraftToolbar = step2Toolbar.slice(
    step2Toolbar.indexOf('v-if="workflowVersionView === \'draft\'"'),
    step2Toolbar.indexOf('v-if="workflowVersionView === \'published\'"'),
  );
  const step2PublishedToolbar = step2Toolbar.slice(
    step2Toolbar.indexOf('v-if="workflowVersionView === \'published\'"'),
  );
  const historyToolbar = index.slice(
    index.indexOf('class="wf-canvas-floating-actions wf-canvas-history-actions"'),
    index.indexOf('class="wf-canvas-floating-actions wf-canvas-view-actions"'),
  );

  assert.doesNotMatch(step2Toolbar, /resetWorkflowCanvas/);
  assert.equal((step2DraftToolbar.match(/<el-button/g) || []).length, 4);
  assert.equal((step2PublishedToolbar.match(/<el-button/g) || []).length, 2);
  assert.match(historyToolbar, /title="リセット"[\s\S]*@click="resetWorkflowCanvas"/);
  assert.ok(historyToolbar.lastIndexOf('@click="resetWorkflowCanvas"') > historyToolbar.lastIndexOf('</el-popover>'));
  assert.match(main, /ElementPlus\.ElMessageBox\.confirm\('開始ノード以外のすべてのノードと接続を削除します。続行しますか？'/);
});

test('uses four ordered workflow canvas view controls', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const toolbarStart = index.indexOf('class="wf-canvas-floating-actions wf-canvas-view-actions"');
  const toolbarEnd = index.indexOf('v-if="wfNodePicker.visible"', toolbarStart);
  const toolbar = index.slice(toolbarStart, toolbarEnd);

  assert.equal((toolbar.match(/<button/g) || []).length, 4);
  assert.ok(toolbar.indexOf('title="ノードを追加"') < toolbar.indexOf('title="縮小"'));
  assert.ok(toolbar.indexOf('title="縮小"') < toolbar.indexOf('title="拡大"'));
  assert.ok(toolbar.indexOf('title="拡大"') < toolbar.indexOf('title="整列して全体表示"'));
  assert.doesNotMatch(toolbar, /wf-canvas-tool-divider/);
  assert.match(toolbar, /title="整列して全体表示"[\s\S]*@click="organizeWorkflowNodes"/);
});

test('deletes workflow nodes immediately without a confirmation dialog', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const removeHandler = main.match(/function confirmRemoveSelectedWorkflowNode\(\)[\s\S]*?\n    }\n\n    function onWfKeyDown/)?.[0] || '';

  assert.doesNotMatch(removeHandler, /ElMessageBox\.confirm/);
  assert.match(removeHandler, /開始ノードは削除できません/);
  assert.match(removeHandler, /removeWorkflowNode\(id\)/);
  assert.match(removeHandler, /ノードを削除しました/);
});

test('deletes edges from a red midpoint control without inline insertion', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(index, /class="wf-edge-delete-btn"[\s\S]*title="接続を削除"[\s\S]*@click\.stop="removeWorkflowEdge\(edge\.edge\)"[\s\S]*>×<\/button>/);
  assert.doesNotMatch(index, /openWfNodePickerOnEdge\(edge\.edge/);
  assert.match(main, /function removeWorkflowEdge\(edge\)[\s\S]*selectedWorkflowEdgeKey\.value = workflowEdgeKey\(edge\);[\s\S]*removeSelectedWorkflowEdge\(\)/);
  assert.match(style, /\.wf-edge-delete-btn\s*\{[^}]*border:\s*1px solid #fda29b;[^}]*color:\s*#f04438;/s);
});

test('offers a separate Step2 configuration check without blocking save or navigation', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.match(mockData, /function collectWorkflowTestDimensionErrors\(workflow, testCase, sceneContext = \{\}, options = \{\}\)/);
  assert.match(mockData, /if \(!options\.skipTestInput/);
  assert.match(main, /function validateWorkflowStaticConfiguration\(options = \{\}\)/);
  assert.match(main, /collectWorkflowTestDimensionErrors\([\s\S]*skipTestInput: true/);
  assert.match(main, /function checkWorkflowStep2Configuration\(\)[\s\S]*handleSave\(\{ silent: true \}\)[\s\S]*validateWorkflowStaticConfiguration\(\)[\s\S]*markWorkflowReadyAfterStaticValidation\(\)/);
  assert.match(main, /function saveWorkflowStep2\(\)/);
  assert.match(main, /function goToWorkflowStep3\(\)/);
  assert.match(index, /@click="goToWorkflowStep3">次へ<\/el-button>/);
  assert.match(index, /@click="saveWorkflowStep2">保存<\/el-button>/);
  assert.match(index, /type="warning"[\s\S]*class="wf-check-links-btn wf-toolbar-check-btn"[\s\S]*@click="checkWorkflowStep2Configuration"[\s\S]*設定チェック/);
  assert.match(main, /設定チェックが完了し、公開可能になりました。/);
  assert.doesNotMatch(main, /設定チェックが完了しました/);
  assert.match(style, /\.wf-toolbar-right\s*\{[^}]*position:\s*relative;/s);
  assert.match(style, /\.wf-toolbar-check-btn\s*\{[^}]*position:\s*absolute;[^}]*right:\s*calc\(100% \+ 8px\);/s);
  const saveStep2Source = main.slice(main.indexOf('function saveWorkflowStep2()'), main.indexOf('function goToWorkflowStep3()'));
  const nextStep2Source = main.slice(main.indexOf('function goToWorkflowStep3()'), main.indexOf('function checkWorkflowStep2Configuration()'));
  assert.doesNotMatch(saveStep2Source, /validateWorkflowStaticConfiguration/);
  assert.doesNotMatch(nextStep2Source, /validateWorkflowStaticConfiguration/);
  const checkStep2Source = main.slice(main.indexOf('function checkWorkflowStep2Configuration()'), main.indexOf('function markWorkflowReadyAfterStaticValidation()'));
  assert.match(checkStep2Source, /if \(!handleSave\(\{ silent: true \}\)\) return false;/);
});

test('requires human-review supplement exits to loop back to a prior node', async () => {
  const mockData = await readFile(new URL('../scripts/mock-data.js', import.meta.url), 'utf8');

  assert.match(mockData, /補件出口を前述ノードへ回流接続してください/);
  assert.match(mockData, /workflowCanReach\(wf, supplementEdge\.to, node\.id, supplementEdge\)/);
  assert.match(mockData, /normalizeHitlGateActionValue\(edge\.branch\) === 'request_supplement'/);
});

test('separates Step1 draft save from validated navigation', async () => {
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(index, /@click="proceedToWorkflowStep">次へ<\/el-button>[\s\S]*type="primary" @click="saveSceneSetupStep1">保存<\/el-button>/);
  assert.match(main, /function saveSceneSetupStep1\(\)[\s\S]*persistSceneSetupDraft\(\{ validate: false \}\)[\s\S]*下書きを保存しました/);
  assert.match(main, /function proceedToWorkflowStep\(\)[\s\S]*persistSceneSetupDraft\(\{ validate: true \}\)[\s\S]*workflowSetupStep\.value = 2/);
});

test('disables browser caching for local prototype previews', async () => {
  const server = await readFile(new URL('../server/local-server.mjs', import.meta.url), 'utf8');

  assert.match(server, /'Cache-Control': 'no-store'/);
});

test('labels the AI verification mapping module as standard data consistency', async () => {
  const workflowCore = await readFile(new URL('../scripts/workflow-core.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8');

  assert.match(workflowCore, /key: 'mapping_conflict', label: '標準データ整合性'/);
  assert.match(workflowCore, /mapping_conflict: '整合性'/);
  assert.match(main, /key === 'mapping_conflict'\) return count \? `\$\{count\} 件`/);
});

test('explains the publishable status beside every workflow status badge', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const style = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  assert.equal((index.match(/Step2の設定チェック完了後、ステータスが「公開可能」に更新され、公開できます。/g) || []).length, 4);
  assert.equal((index.match(/class="wf-publish-help"/g) || []).length, 4);
  assert.match(style, /\.wf-publish-help\s*\{[^}]*cursor:\s*help;/s);
});
