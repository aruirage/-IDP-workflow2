function getInputChannelLabel(channelId) {
  return INPUT_CHANNELS.find((ch) => ch.id === channelId)?.label || channelId;
}

function normalizeImageConfig(image, documents, legacy = {}) {
  const allowedTypes = (documents || []).map((d) => d.type);
  const piiEligibleTypes = filterDocTypesWithMaskEnabled(allowedTypes);
  const legacyFraud = legacy.fraudDetect || {};
  const legacyPii = legacy.piiMask || {};
  const fraudDetect = image?.fraudDetect !== undefined
    ? image.fraudDetect !== false
    : (legacyFraud.enabledTypes ? legacyFraud.enabledTypes.length !== 0 : true);
  const piiDetect = image?.piiDetect !== undefined
    ? image.piiDetect !== false
    : (legacyPii.enabledTypes ? legacyPii.enabledTypes.length !== 0 : true);
  const fraudDocTypesRaw = image?.fraudDetectDocTypes?.length
    ? image.fraudDetectDocTypes
    : (legacyFraud.enabledTypes?.length ? legacyFraud.enabledTypes : []);
  const piiDocTypesRaw = image?.piiDetectDocTypes?.length
    ? image.piiDetectDocTypes
    : (legacyPii.enabledTypes?.length ? legacyPii.enabledTypes : []);
  const rotate = image?.rotate !== false;
  const perspective = image?.perspective !== false;
  const sortEnabled = image?.sort !== undefined
    ? image.sort !== false
    : (image?.classify !== undefined ? image.classify !== false : true);
  const sortDocTypesRaw = (image?.sortDocTypes?.length ? image.sortDocTypes : null)
    ?? image?.classifyDocTypes
    ?? [];
  return {
    fraudDetect,
    fraudDetectDocTypes: defaultImageDocTypes(fraudDetect, fraudDocTypesRaw, allowedTypes),
    piiDetect,
    piiDetectDocTypes: defaultImageDocTypes(piiDetect, piiDocTypesRaw, piiEligibleTypes),
    rotate,
    rotateDocTypes: defaultImageDocTypes(rotate, image?.rotateDocTypes, allowedTypes),
    perspective,
    perspectiveDocTypes: defaultImageDocTypes(perspective, image?.perspectiveDocTypes, allowedTypes),
    sort: sortEnabled,
    sortDocTypes: defaultImageDocTypes(sortEnabled, sortDocTypesRaw, allowedTypes),
    io: { ...NODE_IO_DEFAULTS.preprocess, ...(image?.io || {}) },
  };
}

function syncOcrExtractTypesOnForm(formData) {
  if (!formData.processing) return;
  if (!formData.processing.ocrExtract) {
    formData.processing.ocrExtract = cloneJson(WORKFLOW_DEFAULTS.ocrExtract);
  }
  if (!Array.isArray(formData.processing.ocrExtract.enabledTypes)) formData.processing.ocrExtract.enabledTypes = [];
  if (!formData.processing.ocrExtract.mergeByType || typeof formData.processing.ocrExtract.mergeByType !== 'object') {
    formData.processing.ocrExtract.mergeByType = {};
  }
  if (typeof formData.processing.ocrExtract.mergeSameType !== 'boolean') formData.processing.ocrExtract.mergeSameType = false;
  if (formData.processing.ocrExtract.confidenceThreshold == null) formData.processing.ocrExtract.confidenceThreshold = WORKFLOW_DEFAULTS.ocrExtract.confidenceThreshold;
  if (typeof formData.processing.ocrExtract.llmOcrEnabled !== 'boolean') formData.processing.ocrExtract.llmOcrEnabled = WORKFLOW_DEFAULTS.ocrExtract.llmOcrEnabled;
  const types = (formData.scene?.documents || []).map((d) => d.type);
  let enabled = formData.processing.ocrExtract.enabledTypes || [];
  if (!enabled.length && types.length) {
    formData.processing.ocrExtract.enabledTypes = [...types];
    return;
  }
  enabled = enabled.filter((t) => types.includes(t));
  types.forEach((t) => {
    if (!enabled.includes(t)) enabled.push(t);
  });
  formData.processing.ocrExtract.enabledTypes = enabled;
}

function syncFraudDetectTypesOnForm(formData) {
  if (!formData.processing) return;
  if (!formData.processing.fraudDetect) {
    formData.processing.fraudDetect = normalizeFraudDetectConfig(cloneJson(WORKFLOW_DEFAULTS.fraudDetect));
  }
  formData.processing.fraudDetect = normalizeFraudDetectConfig(
    formData.processing.fraudDetect,
    formData.scene?.documents || [],
  );
  if (!Array.isArray(formData.processing.fraudDetect.enabledTypes)) {
    formData.processing.fraudDetect.enabledTypes = [];
  }
  const types = (formData.scene?.documents || []).map((d) => d.type);
  let enabled = formData.processing.fraudDetect.enabledTypes || [];
  if (!enabled.length && types.length) {
    formData.processing.fraudDetect.enabledTypes = [...types];
    return;
  }
  enabled = enabled.filter((t) => types.includes(t));
  types.forEach((t) => {
    if (!enabled.includes(t)) enabled.push(t);
  });
  formData.processing.fraudDetect.enabledTypes = enabled;
}

function processingBlock() {
  const block = {
    input: cloneJson(WORKFLOW_DEFAULTS.input),
    image: normalizeImageConfig(cloneJson(WORKFLOW_DEFAULTS.image)),
    hitl: normalizeHitlConfig(cloneJson(WORKFLOW_DEFAULTS.hitl)),
    ocrExtract: cloneJson(WORKFLOW_DEFAULTS.ocrExtract),
    fraudDetect: normalizeFraudDetectConfig(cloneJson(WORKFLOW_DEFAULTS.fraudDetect)),
    externalApi: normalizeExternalApiConfig(cloneJson(KNOWLEDGE_RETRIEVAL_DEFAULTS)),
  };
  const allowed = new Set(INPUT_CHANNELS.map((ch) => ch.id));
  block.input.channels = (block.input.channels || []).filter((id) => allowed.has(id));
  return block;
}

function outputBlock(fields, pii = ['氏名', '生年月日']) {
  return {
    ...cloneJson(OUTPUT_DEFAULTS),
    fields,
    docFields: [],
    pii,
  };
}

function buildOutputDocFields(documents, legacyFields = [], existingDocFields = []) {
  const legacyEnabled = new Set(
    (legacyFields || [])
      .filter((f) => f.checked)
      .map((f) => f.name)
  );
  const existingMap = Object.fromEntries((existingDocFields || []).map((d) => [d.docType, d]));
  return (documents || []).map((doc) => {
    const schema = getDocSchema(doc.type);
    const existing = existingMap[doc.type];
    const fields = mergeSchemaItemOrder(schema.fields || [], existing?.fields, (name, existingField) => ({
      name,
      checked: existingField?.checked ?? legacyEnabled.has(name) ?? true,
    }));
    const schemaTables = schema.tables || {};
    const schemaTableNames = Object.keys(schemaTables).filter((name) => !OUTPUT_DEFERRED_TABLES.has(name));
    const existingTableOrder = (existing?.tables || [])
      .map((t) => t.name)
      .filter((name) => schemaTableNames.includes(name));
    const tableNames = [
      ...existingTableOrder,
      ...schemaTableNames.filter((name) => !existingTableOrder.includes(name)),
    ];
    const existingTableMap = Object.fromEntries((existing?.tables || []).map((t) => [t.name, t]));
    const tables = tableNames.map((tableName) => {
      const existingTable = existingTableMap[tableName];
      const tableChecked = existingTable?.checked ?? true;
      const columnNames = schemaTables[tableName] || [];
      return {
        name: tableName,
        checked: tableChecked,
        columns: mergeSchemaItemOrder(columnNames, existingTable?.columns, (colName, existingCol) => ({
          name: colName,
          checked: existingCol?.checked ?? tableChecked,
        })),
      };
    });
    const docEntry = {
      docType: doc.type,
      fields,
      tables,
    };
    docEntry.itemOrder = normalizeItemOrder(
      existing?.itemOrder,
      buildDefaultItemOrder(fields, tables)
    );
    applyItemOrderToDoc(docEntry);
    return docEntry;
  });
}

function buildDefaultItemOrder(fields, tables) {
  const order = [];
  (fields || []).forEach((f) => order.push(`field:${f.name}`));
  (tables || []).forEach((table) => {
    (table.columns || []).forEach((col) => {
      order.push(`column:${table.name}:${col.name}`);
    });
  });
  return order;
}

function normalizeItemOrder(existingOrder, defaultOrder) {
  if (!existingOrder?.length) return [...defaultOrder];
  const defaultSet = new Set(defaultOrder);
  const merged = existingOrder.filter((k) => defaultSet.has(k));
  defaultOrder.forEach((k) => {
    if (!merged.includes(k)) merged.push(k);
  });
  return merged;
}

function applyItemOrderToDoc(doc) {
  if (!doc?.itemOrder?.length) return;
  const fieldMap = Object.fromEntries((doc.fields || []).map((f) => [f.name, f]));
  const colMaps = {};
  (doc.tables || []).forEach((table) => {
    colMaps[table.name] = Object.fromEntries((table.columns || []).map((c) => [c.name, c]));
  });
  const newFields = [];
  const newColOrder = {};
  doc.itemOrder.forEach((key) => {
    if (key.startsWith('field:')) {
      const field = fieldMap[key.slice(6)];
      if (field) newFields.push(field);
      return;
    }
    if (key.startsWith('column:')) {
      const rest = key.slice(7);
      const sep = rest.indexOf(':');
      if (sep < 0) return;
      const tableName = rest.slice(0, sep);
      const colName = rest.slice(sep + 1);
      if (!newColOrder[tableName]) newColOrder[tableName] = [];
      const col = colMaps[tableName]?.[colName];
      if (col) newColOrder[tableName].push(col);
    }
  });
  if (newFields.length) doc.fields = newFields;
  (doc.tables || []).forEach((table) => {
    if (newColOrder[table.name]?.length) table.columns = newColOrder[table.name];
  });
}

function buildOutputExportRows(doc) {
  if (!doc) return [];
  const fieldMap = Object.fromEntries((doc.fields || []).map((f) => [f.name, f]));
  const columnMap = {};
  (doc.tables || []).forEach((table) => {
    (table.columns || []).forEach((col) => {
      columnMap[`column:${table.name}:${col.name}`] = { col, table };
    });
  });
  const order = doc.itemOrder?.length
    ? doc.itemOrder
    : buildDefaultItemOrder(doc.fields, doc.tables);
  return order.map((key) => {
    if (key.startsWith('field:')) {
      const name = key.slice(6);
      const ref = fieldMap[name];
      if (!ref) return null;
      return {
        key,
        kind: 'field',
        label: name,
        ref,
      };
    }
    if (key.startsWith('column:')) {
      const entry = columnMap[key];
      if (!entry) return null;
      const { col, table } = entry;
      return {
        key,
        kind: 'column',
        label: formatTableColumnLabel(table.name, col.name),
        ref: col,
        tableRef: table,
      };
    }
    return null;
  }).filter(Boolean);
}

function buildExportStandardFieldRows(docType, mappingNode, selectedIds = [], matchRules = []) {
  const rules = (mappingNode?.mappingRules || []).filter((rule) => rule.standardFieldId);
  const selectedSet = new Set(selectedIds || []);
  const useAllWhenEmpty = !selectedSet.size;
  return rules
    .filter((rule) => {
      if (!docType) return true;
      return (rule.sourceFieldIds || []).some((sourceId) => {
        const text = String(sourceId || '');
        return text.startsWith(`${docType}.`) || text.includes(`${docType}・`) || text.includes(docType);
      });
    })
    .map((rule) => {
      const meta = DATA_MAPPING_STANDARD_FIELDS.find((f) => f.value === rule.standardFieldId);
      const ctx = {
        docType,
        standardFieldId: rule.standardFieldId,
        sourceFieldIds: rule.sourceFieldIds,
      };
      return {
        key: rule.id,
        standardFieldId: rule.standardFieldId,
        standardLabel: meta?.label || rule.standardLabel || rule.standardFieldId,
        sourceSummary: formatDataMappingRuleSourceSummary(rule),
        extractValue: getExportExtractValueFromMappingRule(rule, docType),
        matchValue: resolveExportMatchValue(ctx, matchRules),
        checked: useAllWhenEmpty ? true : selectedSet.has(rule.standardFieldId),
        dataType: meta?.dataType || rule.dataType || 'string',
      };
    });
}

function formatDataMappingRuleSourceSummary(rule) {
  const sources = (rule?.sourceFieldIds || []).filter(Boolean);
  if (!sources.length) return '—';
  if (sources.length <= 2) return sources.join(' · ');
  return `${sources.slice(0, 2).join(' · ')} 他 ${sources.length - 2} 件`;
}

function getSharedFieldsAcrossDocs(docTypes) {
  const types = (docTypes || []).filter(Boolean);
  if (!types.length) return [];
  const fieldSets = types.map((t) => new Set(getDocSchema(t).fields || []));
  const shared = [...fieldSets[0]].filter((f) => fieldSets.every((set) => set.has(f)));
  if (shared.length) return shared;
  return getDocSchema(types[0]).fields || [];
}

function computeSceneLinkStats(documents, mainDocTypes, docFieldLinks) {
  const docTypes = (documents || []).map((d) => d.type);
  const mainSet = new Set((mainDocTypes || []).filter((t) => docTypes.includes(t)));
  const adj = Object.fromEntries(docTypes.map((t) => [t, new Set()]));
  (docFieldLinks || []).forEach((link) => {
    if (!adj[link.sourceDocType] || !adj[link.targetDocType]) return;
    if (link.sourceDocType === link.targetDocType) return;
    adj[link.sourceDocType].add(link.targetDocType);
    adj[link.targetDocType].add(link.sourceDocType);
  });
  const reachable = new Set(mainSet);
  const queue = [...mainSet];
  while (queue.length) {
    const cur = queue.shift();
    adj[cur]?.forEach((next) => {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    });
  }
  const nonMainDocs = docTypes.filter((t) => !mainSet.has(t));
  const linkedCount = nonMainDocs.filter((t) => reachable.has(t)).length;
  const noRelationDocs = docTypes.filter((t) => !adj[t]?.size);
  const unlinkedDocs = nonMainDocs.filter((t) => !reachable.has(t));
  return {
    mainDocCount: mainSet.size,
    linkedCount,
    noRelationCount: noRelationDocs.length,
    noRelationDocs,
    unlinkedCount: unlinkedDocs.length,
    unlinkedDocs,
    total: docTypes.length,
  };
}

const WF_NET_LAYOUT = {
  PAD: 16,
  SAT_W: 172,
  MAIN_W: 204,
  COL_GAP: 64,
  NODE_GAP: 22,
  HEADER_H: 46,
  FIELD_H: 26,
  FIELD_GAP: 2,
  NODE_PAD: 8,
};

function buildNetEdgePath(x1, y1, x2, y2) {
  const bend = Math.max(28, Math.abs(x2 - x1) * 0.45);
  const direction = x2 >= x1 ? 1 : -1;
  return `M ${x1} ${y1} C ${x1 + direction * bend} ${y1}, ${x2 - direction * bend} ${y2}, ${x2} ${y2}`;
}

function buildNetSameColumnEdgePath(sourceNode, targetNode, sourceY, targetY) {
  const isLeftColumn = sourceNode.side === 'left';
  const sourceX = isLeftColumn ? sourceNode.left + sourceNode.width : sourceNode.left;
  const targetX = isLeftColumn ? targetNode.left + targetNode.width : targetNode.left;
  const edgeX = isLeftColumn
    ? Math.max(sourceX, targetX) + 24
    : Math.min(sourceX, targetX) - 24;
  const controlOffset = Math.max(18, Math.abs(edgeX - sourceX) * 0.7);
  const direction = isLeftColumn ? 1 : -1;
  return `M ${sourceX} ${sourceY} C ${sourceX + direction * controlOffset} ${sourceY}, ${edgeX} ${sourceY}, ${edgeX} ${(sourceY + targetY) / 2} C ${edgeX} ${targetY}, ${targetX + direction * controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

function partitionRelatedDocTypes(relatedTypes, mainType, links) {
  const relatedSet = new Set(relatedTypes);
  const adjacency = Object.fromEntries(relatedTypes.map((type) => [type, new Set()]));
  (links || []).forEach((link) => {
    if (link.sourceDocType === mainType || link.targetDocType === mainType) return;
    if (!relatedSet.has(link.sourceDocType) || !relatedSet.has(link.targetDocType)) return;
    adjacency[link.sourceDocType].add(link.targetDocType);
    adjacency[link.targetDocType].add(link.sourceDocType);
  });

  const components = [];
  const visited = new Set();
  relatedTypes.forEach((type) => {
    if (visited.has(type)) return;
    const component = [];
    const queue = [type];
    visited.add(type);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      adjacency[current].forEach((next) => {
        if (visited.has(next)) return;
        visited.add(next);
        queue.push(next);
      });
    }
    components.push(component);
  });

  components.sort((a, b) => b.length - a.length || relatedTypes.indexOf(a[0]) - relatedTypes.indexOf(b[0]));
  let leftTypes = [];
  let rightTypes = [];
  components.forEach((component) => {
    if (leftTypes.length <= rightTypes.length) leftTypes = leftTypes.concat(component);
    else rightTypes = rightTypes.concat(component);
  });

  const sideOf = (type) => leftTypes.includes(type) ? 'left' : 'right';
  const crossingCount = (links || []).filter((link) =>
    relatedSet.has(link.sourceDocType)
      && relatedSet.has(link.targetDocType)
      && sideOf(link.sourceDocType) !== sideOf(link.targetDocType)
  ).length;
  return { leftTypes, rightTypes, crossingCount };
}

function buildNetBusEdgePath(x1, y1, x2, y2, side) {
  const dir = side === 'left' ? -1 : 1;
  const gap = Math.abs(x2 - x1);
  const branch = Math.min(28, Math.max(16, gap * 0.28));
  const trunkX = x1 + dir * Math.max(branch, gap * 0.5);
  const startX = x1 + dir * branch;
  const endX = x2 - dir * branch;
  const c1 = x1 + dir * Math.max(10, branch * 0.62);
  const c2 = trunkX - dir * Math.max(8, branch * 0.34);
  const c3 = trunkX + dir * Math.max(8, branch * 0.34);
  const c4 = x2 - dir * Math.max(10, branch * 0.62);

  return [
    `M ${x1} ${y1}`,
    `C ${c1} ${y1}, ${c2} ${y1}, ${startX} ${y1}`,
    `L ${trunkX} ${y1}`,
    `L ${trunkX} ${y2}`,
    `L ${endX} ${y2}`,
    `C ${c3} ${y2}, ${c4} ${y2}, ${x2} ${y2}`,
  ].join(' ');
}

function buildSceneSetupNetworkLayout(docs, mainDocType, links, getLabel, getFields, mainKey = '', expandedDocs = {}) {
  if (!docs.length) {
    return { width: 720, height: 320, nodes: [], edges: [] };
  }

  const mainType = mainDocType || docs[0]?.type;
  const related = docs.filter((d) => d.type !== mainType);
  const relatedTypes = related.map((d) => d.type);
  const { leftTypes, rightTypes } = partitionRelatedDocTypes(relatedTypes, mainType, links);
  const L = WF_NET_LAYOUT;
  const linkedFieldMap = {};

  function markLinked(docType, field) {
    if (!docType || !field) return;
    if (!linkedFieldMap[docType]) linkedFieldMap[docType] = new Set();
    linkedFieldMap[docType].add(field);
  }

  (links || []).forEach((link) => {
    markLinked(link.sourceDocType, link.sourceField);
    markLinked(link.targetDocType, link.targetField);
  });

  function nodeHeight(fieldCount) {
    return L.HEADER_H + fieldCount * (L.FIELD_H + L.FIELD_GAP) + L.NODE_PAD * 2;
  }

  function buildNodeMeta(docType, side) {
    const fields = getFields(docType) || [];
    const linkedFields = linkedFieldMap[docType] ? [...linkedFieldMap[docType]] : [];
    const visibleFields = expandedDocs?.[docType] ? fields : linkedFields;
    return {
      id: docType,
      docType,
      label: getLabel(docType),
      fields,
      side,
      isHub: docType === mainType,
      width: docType === mainType ? L.MAIN_W : L.SAT_W,
      height: nodeHeight(visibleFields.length),
      linkedFields,
      visibleFields,
      isExpanded: Boolean(expandedDocs?.[docType]),
      isUnlinked: false,
    };
  }

  const mainMeta = buildNodeMeta(mainType, 'center');
  mainMeta.mainKey = mainKey || '';
  const leftMetas = leftTypes.map((t) => buildNodeMeta(t, 'left'));
  const rightMetas = rightTypes.map((t) => buildNodeMeta(t, 'right'));

  const leftX = L.PAD;
  const mainX = L.PAD + L.SAT_W + L.COL_GAP;
  const rightX = mainX + L.MAIN_W + L.COL_GAP;

  let leftY = L.PAD;
  leftMetas.forEach((n) => {
    n.left = leftX;
    n.top = leftY;
    leftY += n.height + L.NODE_GAP;
  });

  let rightY = L.PAD;
  rightMetas.forEach((n) => {
    n.left = rightX;
    n.top = rightY;
    rightY += n.height + L.NODE_GAP;
  });

  mainMeta.left = mainX;
  mainMeta.top = L.PAD;

  const allNodes = [...leftMetas, mainMeta, ...rightMetas];
  const canvasH = Math.max(leftY, rightY, mainMeta.top + mainMeta.height) + L.PAD;
  const canvasW = rightX + L.SAT_W + L.PAD + 32;
  const nodeMap = Object.fromEntries(allNodes.map((n) => [n.id, n]));
  function fieldY(node, field) {
    const idx = node.visibleFields.indexOf(field);
    if (idx < 0) return null;
    return node.top + L.NODE_PAD + L.HEADER_H + idx * (L.FIELD_H + L.FIELD_GAP) + L.FIELD_H / 2;
  }

  const edges = (links || []).map((link, index) => {
    let satType;
    let satField;
    let mainField;
    if (link.sourceDocType === mainType) {
      mainField = link.sourceField;
      satType = link.targetDocType;
      satField = link.targetField;
    } else if (link.targetDocType === mainType) {
      mainField = link.targetField;
      satType = link.sourceDocType;
      satField = link.sourceField;
    } else {
      const srcNode = nodeMap[link.sourceDocType];
      const tgtNode = nodeMap[link.targetDocType];
      if (!srcNode || !tgtNode) return null;
      const srcY = fieldY(srcNode, link.sourceField);
      const tgtY = fieldY(tgtNode, link.targetField);
      if (srcY == null || tgtY == null) return null;
      let x1;
      let y1;
      let x2;
      let y2;
      if (srcNode.side === 'left' && tgtNode.side === 'right') {
        x1 = srcNode.left + srcNode.width;
        y1 = srcY;
        x2 = tgtNode.left;
        y2 = tgtY;
      } else if (srcNode.side === 'right' && tgtNode.side === 'left') {
        x1 = srcNode.left;
        y1 = srcY;
        x2 = tgtNode.left + tgtNode.width;
        y2 = tgtY;
      } else if (srcNode.side === tgtNode.side) {
        return {
          id: link.id || `edge-${index}`,
          path: buildNetSameColumnEdgePath(srcNode, tgtNode, srcY, tgtY),
          label: `${link.sourceField} → ${link.targetField}`,
          sourceDocType: link.sourceDocType,
          sourceField: link.sourceField,
          targetDocType: link.targetDocType,
          targetField: link.targetField,
        };
      } else {
        return null;
      }
      const side = srcNode.side === 'left' || tgtNode.side === 'left' ? 'left' : 'right';
      return {
        id: link.id || `edge-${index}`,
        path: buildNetEdgePath(x1, y1, x2, y2),
        label: `${link.sourceField} → ${link.targetField}`,
        sourceDocType: link.sourceDocType,
        sourceField: link.sourceField,
        targetDocType: link.targetDocType,
        targetField: link.targetField,
      };
    }

    const satNode = nodeMap[satType];
    if (!satNode) return null;
    const satY = fieldY(satNode, satField);
    const mainYPos = fieldY(mainMeta, mainField);
    if (satY == null || mainYPos == null) return null;

    let x1;
    let y1;
    let x2;
    let y2;
    // 主帳票を起点に、関連帳票のフィールドへ矢印を向ける
    if (satNode.side === 'left') {
      x1 = mainMeta.left;
      y1 = mainYPos;
      x2 = satNode.left + satNode.width;
      y2 = satY;
    } else {
      x1 = mainMeta.left + mainMeta.width;
      y1 = mainYPos;
      x2 = satNode.left;
      y2 = satY;
    }

    return {
      id: link.id || `edge-${index}`,
      path: buildNetEdgePath(x1, y1, x2, y2),
      label: `${mainField} → ${satField}`,
      sourceDocType: link.sourceDocType,
      sourceField: link.sourceField,
      targetDocType: link.targetDocType,
      targetField: link.targetField,
    };
  }).filter(Boolean);

  allNodes.forEach((n) => {
    if (!n.isHub) {
      n.isUnlinked = !(links || []).some(
        (l) => l.sourceDocType === n.docType || l.targetDocType === n.docType,
      );
    }
  });

  return { width: canvasW, height: canvasH, nodes: allNodes, edges };
}

function getSceneLinkValidationError(documents, mainDocType, docFieldLinks, getDocDisplayLabel) {
  if (!documents?.length) return '関連帳票を1件以上追加してください';
  if (!mainDocType) return '主帳票を1件選択してください';
  if (documents.length <= 1) return '';
  const stats = computeSceneLinkStats(
    documents,
    [mainDocType],
    docFieldLinks,
  );
  if (stats.noRelationCount > 0 || stats.unlinkedCount > 0) {
    const labels = stats.unlinkedDocs.map((docType) => getDocDisplayLabel(docType));
    return `関連関係が設定されていない帳票があります：${labels.join('、')}`;
  }
  return '';
}

function getSceneMainDocTypes(scene) {
  if (Array.isArray(scene?.mainDocTypes) && scene.mainDocTypes.length) {
    return [scene.mainDocTypes[0]];
  }
  if (scene?.aggregateDocType) return [scene.aggregateDocType];
  return [];
}

function getSceneMainDocType(scene) {
  return getSceneMainDocTypes(scene)[0] || '';
}

function normalizeSceneAggregate(scene, documents, legacyOutput) {
  const docTypes = (documents || []).map((d) => d.type);
  let mainDocType = '';
  if (Array.isArray(scene?.mainDocTypes) && scene.mainDocTypes.length) {
    mainDocType = scene.mainDocTypes[0];
  } else if (scene?.aggregateDocType) {
    mainDocType = scene.aggregateDocType;
  } else if (legacyOutput?.aggregateDocType) {
    mainDocType = legacyOutput.aggregateDocType;
  }
  if (!docTypes.includes(mainDocType)) mainDocType = '';
  if (!mainDocType && docTypes.length) mainDocType = docTypes[0];
  return {
    mainDocTypes: mainDocType ? [mainDocType] : [],
    aggregateDocType: mainDocType,
    primaryKey: (getDocSchema(mainDocType).fields || []).includes(scene?.primaryKey) ? scene.primaryKey : '',
    secondaryKeys: [],
  };
}

function applySceneAggregate(scene, documents, legacyOutput) {
  const agg = normalizeSceneAggregate(scene, documents, legacyOutput);
  scene.mainDocTypes = agg.mainDocTypes;
  scene.aggregateDocType = agg.aggregateDocType;
  scene.primaryKey = agg.primaryKey;
  scene.secondaryKeys = [];
  scene.masterlessPolicy = SCENE_MATCHING_DEFAULTS.masterlessPolicy;
  delete scene.groupRules;
  scene.supplementPolicy = SCENE_MATCHING_DEFAULTS.supplementPolicy;
  delete scene.matchingPriority;
  delete scene.aggregateCompareStrategy;
  delete scene.aggregateMatchPolicy;
  delete scene.aggregateRuleSettings;
}

function normalizeDocFieldLinks(links, documents) {
  const docTypes = new Set((documents || []).map((d) => d.type));
  const excludedFieldPattern = /(住所|所在地|発行日|記入日|請求日|証明年月日|作成日|届出日)/;
  const localIdentifierFieldPattern = /(患者番号|カルテ番号|明細管理番号|収納管理番号|医療機関番号)/;
  const institutionFieldPattern = /(医療機関|診療機関|病院|薬局)/;
  const getCoreFieldType = (field) => {
    const value = String(field || '');
    if (/請求番号/.test(value)) return 'case-id';
    if (/(個人番号|住民コード)/.test(value)) return 'person-id';
    if (!/生年月日/.test(value) && /(氏名|被保険者|患者名|受取人|世帯主)/.test(value)) return 'person-name';
    return '';
  };
  const normalized = (links || []).filter((link) => {
    if (!link?.sourceDocType || !link?.targetDocType) return false;
    if (!docTypes.has(link.sourceDocType) || !docTypes.has(link.targetDocType)) return false;
    const sourceFields = getDocSchema(link.sourceDocType).fields || [];
    const targetFields = getDocSchema(link.targetDocType).fields || [];
    if (!sourceFields.includes(link.sourceField) || !targetFields.includes(link.targetField)) return false;
    return !excludedFieldPattern.test(link.sourceField)
      && !excludedFieldPattern.test(link.targetField)
      && !localIdentifierFieldPattern.test(link.sourceField)
      && !localIdentifierFieldPattern.test(link.targetField);
  }).map((link, index) => ({
    id: link.id || `link-${index}-${Date.now()}`,
    sourceDocType: link.sourceDocType,
    sourceField: link.sourceField,
    targetDocType: link.targetDocType,
    targetField: link.targetField,
    conditionGroupId: link.conditionGroupId || `group-${link.sourceDocType}-${link.targetDocType}-1`,
    groupOperator: 'or',
    confidence: link.confidence,
    reason: link.reason,
  }));
  const coreGroups = new Set(normalized.filter((link) => {
    const sourceType = getCoreFieldType(link.sourceField);
    return sourceType && sourceType === getCoreFieldType(link.targetField);
  }).map((link) => `${link.sourceDocType}|${link.targetDocType}|${link.conditionGroupId}`));
  return normalized.filter((link) => {
    const usesInstitution = institutionFieldPattern.test(link.sourceField)
      || institutionFieldPattern.test(link.targetField);
    if (!usesInstitution) return true;
    return coreGroups.has(`${link.sourceDocType}|${link.targetDocType}|${link.conditionGroupId}`);
  });
}

const AI_DOC_FIELD_LINK_PROMPT_TEMPLATE = `# 任务
你是案件集约关系推荐AI。
根据业务场景、主账票、主键、关联账票和各账票字段，推荐账票间字段关联关系。

# 推荐规则
- 优先推荐「主账票 → 关联账票」。
- 左侧 sourceDocType 优先为主账票，右侧 targetDocType 优先为关联账票。
- sourceField 必须属于 sourceDocType；targetField 必须属于 targetDocType。
- 如果关联账票无法与主账票可靠关联，才允许推荐「关联账票 → 关联账票」。
- 每个关联账票至少尝试接入关系网络。
- 禁止推荐未选择账票、自身关系和不存在字段。
- 每 2 个账票之间的关联关系不允许重复；已输出 A → B，则禁止 B → A。

# 字段优先级
优先：主键同语义字段、同名字段、强语义等价字段（氏名、被保険者氏名、患者氏名）、可组合判断同一对象的字段（氏名 + 生年月日）。
忽略：单独的金额、单独的日期、单独的医院名、单独的诊断名、地址等弱区分字段。

# 输入
<scene_name>{scene_name}</scene_name>
<main_document>{main_document}</main_document>
<related_documents>{related_documents}</related_documents>
<existing_relations>{existing_relations}</existing_relations>

# 输出
严格输出 JSON：
{"relations":[{"sourceDocType":"","sourceField":"","targetDocType":"","targetField":"","confidence":0,"reason":""}],"warnings":[{"docType":"","message":""}]}

要求：仅输出 JSON；日语；字段名和账票名必须从输入中原样复制；禁止解释；禁止输出 Schema 外字段。`;

const AI_FIELD_EQUIVALENCE_GROUPS = [
  ['氏名', '被保険者氏名', '患者氏名', '請求者氏名', '契約者氏名', 'ご契約者氏名'],
  ['氏名（カナ）', '被保険者氏名（カナ）', 'ご契約者氏名（カナ）'],
  ['生年月日', '被保険者生年月日', '患者生年月日'],
  ['証券番号', '契約番号', '保険証券番号'],
  ['請求番号', '請求No', '請求ID', '案件番号'],
];

const AI_WEAK_RELATION_FIELD_PATTERNS = [
  /金額$/,
  /合計/,
  /日$/,
  /日付/,
  /医療機関名/,
  /病院名/,
  /診断名/,
  /傷病名/,
  /住所/,
];

function buildAiDocFieldLinkPromptInput({ sceneName, documents, mainDocType, mainKey, existingRelations }) {
  const docTypes = (documents || []).map((doc) => doc.type).filter(Boolean);
  const mainDocument = {
    docType: mainDocType || docTypes[0] || '',
    mainKey: mainKey || '',
    fields: getDocSchema(mainDocType || docTypes[0])?.fields || [],
  };
  const relatedDocuments = docTypes
    .filter((docType) => docType !== mainDocument.docType)
    .map((docType) => ({
      docType,
      fields: getDocSchema(docType)?.fields || [],
    }));
  return {
    prompt: AI_DOC_FIELD_LINK_PROMPT_TEMPLATE,
    input: {
      scene_name: sceneName || '',
      main_document: mainDocument,
      related_documents: relatedDocuments,
      existing_relations: normalizeDocFieldLinks(existingRelations, documents),
    },
  };
}

function getFieldEquivalenceGroup(field) {
  return AI_FIELD_EQUIVALENCE_GROUPS.find((group) => group.includes(field)) || null;
}

function areFieldsSemanticallyEquivalent(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const group = getFieldEquivalenceGroup(a);
  return !!group && group.includes(b);
}

function isWeakRelationField(field) {
  return AI_WEAK_RELATION_FIELD_PATTERNS.some((pattern) => pattern.test(field || ''));
}

function unorderedDocPairKey(a, b) {
  return [a, b].sort().join('|');
}

function findRecommendedFieldPair(sourceFields, targetFields, mainKey) {
  const targetSet = new Set(targetFields);
  if (mainKey && sourceFields.includes(mainKey)) {
    const exactTarget = targetFields.find((field) => field === mainKey);
    if (exactTarget && !isWeakRelationField(exactTarget)) {
      return { sourceField: mainKey, targetField: exactTarget, confidence: 0.95, reason: '主キーと同名フィールド' };
    }
    const equivalentTarget = targetFields.find((field) => areFieldsSemanticallyEquivalent(mainKey, field) && !isWeakRelationField(field));
    if (equivalentTarget) {
      return { sourceField: mainKey, targetField: equivalentTarget, confidence: 0.9, reason: '主キーと同じ意味のフィールド' };
    }
  }
  const sameName = sourceFields.find((field) => targetSet.has(field) && !isWeakRelationField(field));
  if (sameName) {
    return { sourceField: sameName, targetField: sameName, confidence: 0.86, reason: '同名フィールド' };
  }
  for (const sourceField of sourceFields) {
    if (isWeakRelationField(sourceField)) continue;
    const targetField = targetFields.find((field) => areFieldsSemanticallyEquivalent(sourceField, field) && !isWeakRelationField(field));
    if (targetField) {
      return { sourceField, targetField, confidence: 0.78, reason: '同じ意味のフィールド' };
    }
  }
  return null;
}

function recommendDocFieldLinksByAiRules({ sceneName, documents, mainDocType, mainKey, existingRelations }) {
  const docTypes = (documents || []).map((doc) => doc.type).filter(Boolean);
  const mainType = docTypes.includes(mainDocType) ? mainDocType : docTypes[0];
  const relatedTypes = docTypes.filter((docType) => docType !== mainType);
  const result = {
    ...buildAiDocFieldLinkPromptInput({ sceneName, documents, mainDocType: mainType, mainKey, existingRelations }),
    relations: [],
    warnings: [],
  };
  if (!mainType || relatedTypes.length < 1) return result;

  const seenPairs = new Set();
  const addRelation = (sourceDocType, targetDocType, fieldPair) => {
    if (!sourceDocType || !targetDocType || sourceDocType === targetDocType || !fieldPair) return false;
    const unorderedKey = unorderedDocPairKey(sourceDocType, targetDocType);
    if (seenPairs.has(unorderedKey)) return false;
    seenPairs.add(unorderedKey);
    result.relations.push({
      id: `link-ai-${Date.now()}-${result.relations.length}`,
      sourceDocType,
      sourceField: fieldPair.sourceField,
      targetDocType,
      targetField: fieldPair.targetField,
      conditionGroupId: `group-${sourceDocType}-${targetDocType}-1`,
      groupOperator: 'or',
      confidence: fieldPair.confidence,
      reason: fieldPair.reason,
    });
    return true;
  };

  const connected = new Set([mainType]);
  const unresolved = [];
  const mainFields = getDocSchema(mainType).fields || [];
  relatedTypes.forEach((targetDocType) => {
    const targetFields = getDocSchema(targetDocType).fields || [];
    const pair = findRecommendedFieldPair(mainFields, targetFields, mainKey);
    if (addRelation(mainType, targetDocType, pair)) {
      connected.add(targetDocType);
    } else {
      unresolved.push(targetDocType);
    }
  });

  unresolved.forEach((targetDocType) => {
    const targetFields = getDocSchema(targetDocType).fields || [];
    const sourceDocType = [...connected].find((candidateDocType) => {
      if (candidateDocType === targetDocType || seenPairs.has(unorderedDocPairKey(candidateDocType, targetDocType))) return false;
      const sourceFields = getDocSchema(candidateDocType).fields || [];
      return !!findRecommendedFieldPair(sourceFields, targetFields, '');
    });
    if (sourceDocType) {
      const sourceFields = getDocSchema(sourceDocType).fields || [];
      const pair = findRecommendedFieldPair(sourceFields, targetFields, '');
      if (addRelation(sourceDocType, targetDocType, pair)) {
        connected.add(targetDocType);
        return;
      }
    }
    result.warnings.push({
      docType: targetDocType,
      message: '信頼できる関連フィールドを推薦できませんでした。手動で設定してください。',
    });
  });

  result.relations = normalizeDocFieldLinks(result.relations, documents);
  return result;
}

function buildDefaultDocFieldLinks(documents, mainDocTypes) {
  const docTypes = (documents || []).map((d) => d.type);
  if (docTypes.length < 2) return [];
  const hubs = (Array.isArray(mainDocTypes) ? mainDocTypes : [mainDocTypes])
    .filter((t) => docTypes.includes(t));
  const hubList = hubs.length ? hubs : [docTypes[0]];
  const links = [];
  const seen = new Set();
  hubList.forEach((hub) => {
    const hubFields = getDocSchema(hub).fields || [];
    docTypes.forEach((other) => {
      if (other === hub) return;
      const otherFieldSet = new Set(getDocSchema(other).fields || []);
      hubFields.forEach((field) => {
        if (!otherFieldSet.has(field)) return;
        const key = `${hub}|${field}|${other}`;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({
          id: `link-${hub}-${other}-${field}`,
          sourceDocType: hub,
          sourceField: field,
          targetDocType: other,
          targetField: field,
          conditionGroupId: `group-${hub}-${other}-1`,
          groupOperator: 'or',
        });
      });
    });
  });
  return links;
}

function applySceneDocFieldLinks(scene, documents) {
  scene.docFieldLinks = normalizeDocFieldLinks(scene.docFieldLinks, documents);
}

function normalizeOutputConfig(output, documents, masterMappings, knowledgeSource) {
  const base = { ...cloneJson(OUTPUT_DEFAULTS), ...(output || {}) };
  delete base.useDefault;
  delete base.aggregateDocType;
  delete base.primaryKey;
  delete base.secondaryKeys;
  delete base.granularity;
  base.naming = normalizeOutputNaming(base);
  base.fileNamePattern = base.naming.caseFilePattern;
  const builtDocs = buildOutputDocFields(documents, output?.fields || [], output?.docFields || []);
  base.docFields = attachDictFieldsToDocFields(
    builtDocs,
    masterMappings,
    knowledgeSource,
    output?.masterFields || []
  );
  delete base.masterFields;
  base.apiExportEnabled = base.deliveryMethod === 'api' || base.apiExportEnabled === true;
  base.apiExportEndpoint = String(base.apiExportEndpoint || OUTPUT_DEFAULTS.apiExportEndpoint);
  base.sharedFolderPath = String(base.sharedFolderPath || OUTPUT_DEFAULTS.sharedFolderPath);
  base.deliveryMethod = base.deliveryMethod === 'shared_folder' ? 'shared_folder' : 'api';
  base.format = base.deliveryMethod === 'shared_folder' ? '共有フォルダ' : 'API';
  base.fileFormat = OUTPUT_FORMATS.includes(base.fileFormat) ? base.fileFormat : (OUTPUT_FORMATS.includes(base.format) ? base.format : OUTPUT_DEFAULTS.fileFormat);
  base.outputTarget = base.outputTarget || OUTPUT_TARGET_DEFAULT;
  base.exportReviewRequired = base.exportReviewRequired === true;
  base.exportReviewRole = base.exportReviewRole || OUTPUT_DEFAULTS.exportReviewRole || 'case_owner';
  base.exportStandardFieldIds = Array.isArray(base.exportStandardFieldIds) ? base.exportStandardFieldIds : [];
  base.exportStandardFieldOrderByDoc = (base.exportStandardFieldOrderByDoc && typeof base.exportStandardFieldOrderByDoc === 'object')
    ? base.exportStandardFieldOrderByDoc
    : {};
  base.exportFieldModeByDoc = (base.exportFieldModeByDoc && typeof base.exportFieldModeByDoc === 'object')
    ? base.exportFieldModeByDoc
    : {};
  base.masterMatchExports = Array.isArray(base.masterMatchExports) ? base.masterMatchExports : [];
  base.templateLocked = base.templateLocked !== false;
  base.includeVerifyReport = base.includeVerifyReport !== false;
  base.sheetExportMode = normalizeSheetExportMode(base.sheetExportMode);
  if (!OUTPUT_SHEET_EXPORT_MODE_OPTIONS.some((o) => o.value === base.sheetExportMode)) {
    base.sheetExportMode = OUTPUT_DEFAULTS.sheetExportMode;
  }
  return base;
}

const DEFICIENCY_ACTION = '自動差し戻し通知';

function normalizeDeficiencyAction() {
  return DEFICIENCY_ACTION;
}

const SCENE_TEMPLATES = {
  invoice_multi: {
    scene: {
      name: '保険金請求（理赔）',
      businessType: '保険金請求',
      description: '',
      deficiencyAction: DEFICIENCY_ACTION,
      replenishmentDays: 7,
      escalationDays: 14,
      groupRules: {},
      documents: [
        { type: '保険金請求書', submission: '必須', group: '' },
        { type: '診断書', submission: '必須', group: '' },
        { type: '診療明細書', submission: '任意', group: '' },
      ],
    },
    processing: processingBlock(),
    master: masterBlock([
      buildMasterRule('m1', '診断書', '傷病名', '傷病名称', ['ICD-10コード', '標準傷病名']),
      buildMasterRule('m2', '診断書', '医療機関名', '医療機関名', ['機関コード', '標準医療機関名']),
    ], {
      knowledgeSource: { type: 'dict', dictionaryId: 'icd10' },
    }),
    verify: {
      textEnabled: true,
      dataEnabled: true,
      completenessEnabled: true,
      sealEnabled: true,
      text: [
        buildTextRule(
          't1',
          '{{保険金請求書.備考}} は正規表現 /^(?!.*不備).*$/s に一致すること',
          DEFAULT_VERIFY_ACTION,
          '保険金請求書の備考に「不備」が含まれないこと'
        ),
      ],
      dataRules: [
        buildDataExpressionRule('c1', '{{保険金請求書.被保険者氏名}} = {{診断書.被保険者氏名}}'),
        buildDataExpressionRule('c2', '{{保険金請求書.請求金額}} = {{診療明細書.合計金額}}', '¥100'),
        buildDataExpressionRule('c3', '{{保険金請求書.被保険者氏名}} = {{診断書.被保険者氏名}} = {{診療明細書.被保険者氏名}}'),
        buildDataExpressionRule('c4', '{{保険金請求書.医療機関名}} = {{診断書.医療機関名}} = {{診療明細書.医療機関名}}'),
      ],
      seal: sealFromDocs(['保険金請求書'], '署名'),
    },
    output: outputBlock([
      { name: '案件ID', checked: true },
      { name: '顧客氏名', checked: true },
      { name: '帳票種別', checked: true },
      { name: '請求金額', checked: true },
      { name: '検証結果', checked: true },
      { name: '証券番号', checked: false },
    ]),
  },
  application: {
    scene: {
      name: '医療保険（入院給付）請求',
      businessType: '医療保険（入院給付）',
      description: '入院給付金請求案件。診断書・領収書・入院証明書等を処理する。',
      deficiencyAction: DEFICIENCY_ACTION,
      replenishmentDays: 7,
      escalationDays: 14,
      groupRules: {},
      documents: [
        { type: '申込書', submission: '必須', group: '' },
        { type: '診断書', submission: '必須', group: '' },
        { type: '領収書', submission: '任意', group: '' },
        { type: '入院証明書', submission: '任意', group: '' },
        { type: '入院診断書', submission: '任意', group: '' },
        { type: '告知書', submission: '任意', group: '' },
        { type: '処方箋', submission: '任意', group: '' },
      ],
    },
    processing: processingBlock(),
    verify: {
      sealEnabled: true,
      dataRules: [
        buildDataRule('c1', '診断書・申込書・領収書の氏名は一致すること', '—', 'HITL審査'),
        buildDataRule('c2', '診断書と申込書の生年月日は一致すること', '—', 'HITL審査'),
        buildDataRule('c3', '領収書明細の金額合計は申込書の請求金額と一致すること', '¥100', 'HITL審査'),
        buildDataRule('c4', '診療明細書明細行の金額合計は申込書の請求金額以下であること', '¥100', 'HITL審査'),
        buildDataRule('c5', '診断書の発行日は申込書の申請日以前であること', '—', 'HITL審査'),
        buildDataRule('c6', '診断日 ≤ 申請日 ≤ 本日', '—', DEFAULT_VERIFY_ACTION),
        buildDataRule('c7', '申込書の請求金額は契約給付上限以下であること', '—', DEFAULT_VERIFY_ACTION),
        buildDataRule('c8', '商品コード IN [M01, M02] → 退院証明必須', '—', DEFAULT_VERIFY_ACTION),
      ],
      seal: sealFromDocs(['診断書', '申込書'], '両方', { threshold: 85 }),
    },
    output: outputBlock([
      { name: '案件ID', checked: true },
      { name: '顧客氏名', checked: true },
      { name: '帳票種別', checked: true },
      { name: '請求金額', checked: true },
      { name: '検証結果', checked: true },
      { name: '証券番号', checked: false },
    ]),
  },
  invoice_simple: {
    scene: {
      name: '保険金請求（標準）',
      businessType: '保険金請求',
      description: '標準請求書シーン。請求書と診断書の整合を検証する。',
      deficiencyAction: DEFICIENCY_ACTION,
      replenishmentDays: 7,
      escalationDays: 14,
      groupRules: {},
      documents: [
        { type: '請求書', submission: '必須', group: '' },
        { type: '診断書', submission: '必須', group: '' },
        { type: '領収書', submission: '任意', group: '' },
      ],
    },
    processing: processingBlock(),
    verify: {
      sealEnabled: true,
      dataRules: [
        buildDataRule('c1', '請求書と診断書の氏名は一致すること', '—', 'HITL審査'),
      ],
      seal: sealFromDocs(['請求書'], '署名'),
    },
    output: outputBlock([
      { name: '案件ID', checked: true },
      { name: '顧客氏名', checked: true },
      { name: '帳票種別', checked: true },
      { name: '請求金額', checked: true },
      { name: '検証結果', checked: true },
    ]),
  },
  notice: {
    scene: {
      name: '新契約申込（新保申请）',
      businessType: '新契約申込',
      description: '新契約申込書と告知書の受領・完全性チェック用シーン。',
      deficiencyAction: DEFICIENCY_ACTION,
      replenishmentDays: 14,
      escalationDays: 21,
      groupRules: {},
      documents: [
        { type: '告知書', submission: '必須', group: '' },
        { type: '申込書', submission: '任意', group: '' },
      ],
    },
    processing: processingBlock(),
    verify: {
      sealEnabled: true,
      dataRules: [
        buildDataRule('c1', '告知項目がすべて記載されていること', '—', 'HITL審査'),
      ],
      seal: sealFromDocs(['告知書'], '署名'),
    },
    output: outputBlock([
      { name: '案件ID', checked: true },
      { name: '顧客氏名', checked: true },
      { name: '帳票種別', checked: true },
      { name: '検証結果', checked: true },
    ], ['氏名']),
  },
  insurance_general: {
    scene: {
      name: '保全変更（保全变更）',
      businessType: '保全（契約変更）',
      description: '契約内容変更・受取人変更などの保全書類を処理する。',
      deficiencyAction: DEFICIENCY_ACTION,
      replenishmentDays: 7,
      escalationDays: 14,
      groupRules: {},
      documents: [
        { type: '保険金・給付金請求書', submission: '必須', group: '' },
        { type: '診断書', submission: '必須', group: '' },
        { type: '領収書', submission: '任意', group: '' },
        { type: '診療明細書', submission: '任意', group: '' },
      ],
    },
    processing: processingBlock(),
    verify: {
      sealEnabled: true,
      dataRules: [
        buildDataRule('c1', '保険金・給付金請求書と診断書の氏名は一致すること', '—', 'HITL審査'),
        buildDataRule('c2', '保険金・給付金請求書の申請金額は領収書の金額合計と一致すること', '¥100', 'HITL審査'),
        buildDataRule('c3', '診断日 ≤ 申請日 ≤ 本日', '—', '記録のみ'),
      ],
      seal: sealFromDocs(['保険金・給付金請求書'], '署名'),
    },
    output: outputBlock([
      { name: '案件ID', checked: true },
      { name: '顧客氏名', checked: true },
      { name: '帳票種別', checked: true },
      { name: '申請金額', checked: true },
      { name: '検証結果', checked: true },
      { name: '証券番号', checked: true },
    ]),
  },
};

const AGGREGATE_RULE_DATA_VERSION = 'ten-documents-clean-links-v2';

function normalizeSceneDocuments(documents) {
  const seen = new Set();
  return (documents || []).map((doc) => {
    const type = migrateDocTypeId(doc.type);
    if (!DOC_TYPE_MAP[type] || seen.has(type)) return null;
    seen.add(type);
    const fieldOptions = getDocFieldOptions(type);
    const existingRequired = Array.isArray(doc.requiredFields)
      ? doc.requiredFields.filter((field) => fieldOptions.includes(field))
      : getDefaultRequiredFieldsForDocType(type);
    return {
      ...doc,
      type,
      submission: doc.submission === '代替可' ? '任意' : (doc.submission || '必須'),
      requiredFields: existingRequired,
      group: '',
      linkField: doc.linkField || '',
    };
  }).filter(Boolean);
}

function ensureInitialSceneDocuments(documents) {
  const normalized = normalizeSceneDocuments(documents);
  const byType = new Map(normalized.map((doc) => [doc.type, doc]));
  return INITIAL_SCENE_DOCUMENT_TYPES.map((type, index) => byType.get(type) || {
    type,
    submission: index < 2 ? '必須' : '任意',
    requiredFields: getDefaultRequiredFieldsForDocType(type),
    group: '',
    linkField: '',
  });
}

function migrateInitialAggregateRules(scene) {
  if (scene.aggregateRuleDataVersion === AGGREGATE_RULE_DATA_VERSION) return;
  scene.docFieldLinks = [];
  scene.aggregateRuleDataVersion = AGGREGATE_RULE_DATA_VERSION;
}

const SCENE_FILE_SPLIT_DEFAULT = {
  enabled: true,
  rules: ['page_continuity'],
  ruleText: 'ページ連続性と共通タイトルを利用して、アップロードされたPDF・画像・ZIPを案件候補ごとに分割する。',
};

const SCENE_FILE_SPLIT_RULE_VALUES = new Set([
  'page_continuity',
  'doc_title',
  'separator_page',
  'folder_layer',
  'file_name',
  'barcode',
]);

const SCENE_FILE_SPLIT_RULE_LEGACY_MAP = {
  file_stream_key: 'page_continuity',
  main_doc_key: 'doc_title',
  period_key: 'page_continuity',
  same_type_multi: 'page_continuity',
};

const SCENE_FILE_SPLIT_RULE_TEXT_MAP = {
  page_continuity: 'ページ連続性を利用して、連続するページを同一案件候補として扱う。',
  doc_title: '共通タイトルや帳票見出しを利用して、同一案件候補の境界を判定する。',
  separator_page: '区切りページを検出した位置でファイルを分割する。',
  folder_layer: 'フォルダ階層を案件候補のまとまりとして扱う。',
  file_name: 'ファイル名に含まれる案件番号・顧客名・日付などを利用して案件候補を分割する。',
  barcode: 'バーコード / QR コードの値を利用して案件候補を分割する。',
};

function normalizeSceneFileSplit(fileSplit) {
  const rawRules = Array.isArray(fileSplit?.rules) ? fileSplit.rules : SCENE_FILE_SPLIT_DEFAULT.rules;
  const normalizedRules = rawRules.map((item) => SCENE_FILE_SPLIT_RULE_LEGACY_MAP[item] || item);
  const rule = rawRules.find((item) => SCENE_FILE_SPLIT_RULE_VALUES.has(item))
    || normalizedRules.find((item) => SCENE_FILE_SPLIT_RULE_VALUES.has(item))
    || SCENE_FILE_SPLIT_DEFAULT.rules[0];
  const ruleText = String(fileSplit?.ruleText || '').trim()
    || SCENE_FILE_SPLIT_RULE_TEXT_MAP[rule]
    || SCENE_FILE_SPLIT_DEFAULT.ruleText;
  return {
    enabled: fileSplit?.enabled !== false,
    rules: [rule],
    ruleText,
  };
}

function sceneForm(sceneOrId) {
  const routeKey = SCENE_ROUTE[sceneOrId]
    || SCENE_ROUTE[SCENES.find((s) => s.id === sceneOrId || s.name === sceneOrId)?.id]
    || 'application';
  const data = cloneJson(SCENE_TEMPLATES[routeKey]);
  if (data.scene.deficiencyAction === '外部システムへイベント送信') {
    data.scene.deficiencyAction = DEFICIENCY_ACTION;
  }
  data.scene.deficiencyAction = normalizeDeficiencyAction();
  delete data.scene.notificationEmail;
  data.scene.documents = ensureInitialSceneDocuments(data.scene.documents);
  migrateInitialAggregateRules(data.scene);
  delete data.scene.fileSplit;
  applySceneAggregate(data.scene, data.scene.documents, data.output);
  applySceneDocFieldLinks(data.scene, data.scene.documents);
  data.processing.image = normalizeImageConfig(data.processing?.image, data.scene.documents, {
    fraudDetect: data.processing?.fraudDetect,
    piiMask: data.processing?.piiMask,
  });
  data.processing.hitl = normalizeHitlConfig(data.processing?.hitl);
  data.master = normalizeMasterConfig(data.master, data.verify);
  data.verify = normalizeVerifyConfig(data.verify);
  data.output = normalizeOutputConfig(data.output, data.scene.documents, data.master.mappings, data.master.knowledgeSource);
  syncOcrExtractTypesOnForm(data);
  data.workflows = {
    case: buildMinimalCaseWorkflow(),
  };
  data.workflowTestCase = typeof cloneWorkflowTestCaseDefault === 'function'
    ? cloneWorkflowTestCaseDefault()
    : null;
  data.workflowTestStatus = 'untested';
  data.outputConfigStatus = 'unsaved';
  return data;
}

function sceneFormByScene(scene) {
  const routeKey = SCENE_ROUTE[scene.id] || 'application';
  const data = cloneJson(SCENE_TEMPLATES[routeKey]);
  data.scene.name = scene.name;
  if (scene.description != null) data.scene.description = scene.description;
  if (data.scene.deficiencyAction === '外部システムへイベント送信') {
    data.scene.deficiencyAction = DEFICIENCY_ACTION;
  }
  data.scene.deficiencyAction = normalizeDeficiencyAction();
  delete data.scene.notificationEmail;
  data.scene.documents = ensureInitialSceneDocuments(data.scene.documents);
  migrateInitialAggregateRules(data.scene);
  delete data.scene.fileSplit;
  applySceneAggregate(data.scene, data.scene.documents, data.output);
  applySceneDocFieldLinks(data.scene, data.scene.documents);
  data.processing.image = normalizeImageConfig(data.processing?.image, data.scene.documents, {
    fraudDetect: data.processing?.fraudDetect,
    piiMask: data.processing?.piiMask,
  });
  data.processing.hitl = normalizeHitlConfig(data.processing?.hitl);
  data.master = normalizeMasterConfig(data.master, data.verify);
  data.verify = normalizeVerifyConfig(data.verify);
  data.output = normalizeOutputConfig(data.output, data.scene.documents, data.master.mappings, data.master.knowledgeSource);
  syncOcrExtractTypesOnForm(data);
  data.workflows = {
    case: buildMinimalCaseWorkflow(),
  };
  data.workflowTestCase = typeof cloneWorkflowTestCaseDefault === 'function'
    ? cloneWorkflowTestCaseDefault()
    : null;
  data.workflowTestStatus = 'untested';
  data.outputConfigStatus = 'unsaved';
  return data;
}

function normalizeLoadedForm(form) {
  if (!form) return null;
  form.scene = form.scene || {};
  form.scene.documents = ensureInitialSceneDocuments(form.scene.documents || []);
  migrateInitialAggregateRules(form.scene);
  if (form.scene.deficiencyAction === '外部システムへイベント送信') {
    form.scene.deficiencyAction = DEFICIENCY_ACTION;
  }
  form.scene.deficiencyAction = normalizeDeficiencyAction();
  delete form.scene.notificationEmail;
  delete form.scene.fileSplit;
  applySceneAggregate(form.scene, form.scene.documents, form.output);
  applySceneDocFieldLinks(form.scene, form.scene.documents);
  form.processing = form.processing || {};
  form.processing.input = normalizeInputConfig(form.processing.input);
  form.processing.ocrExtract = { ...cloneJson(WORKFLOW_DEFAULTS.ocrExtract), ...(form.processing.ocrExtract || {}) };
  form.processing.fraudDetect = normalizeFraudDetectConfig(form.processing.fraudDetect, form.scene.documents);
  if (Array.isArray(form.processing.qrRead?.enabledTypes) && form.processing.qrRead.enabledTypes.length) {
    const legacyTypes = [...form.processing.qrRead.enabledTypes];
    if (!form.processing.fraudDetect.enabledTypes?.length) {
      form.processing.fraudDetect.enabledTypes = legacyTypes;
    }
  }
  delete form.processing.qrRead;
  if (form.processing.rag && !form.processing.externalApi) {
    form.processing.externalApi = form.processing.rag;
    delete form.processing.rag;
  }
  form.processing.externalApi = normalizeExternalApiConfig(form.processing.externalApi);
  delete form.processing.rag;
  form.knowledgeSources = (form.knowledgeSources || []).map(normalizeKnowledgeSourceItem);
  form.processing.image = normalizeImageConfig(form.processing?.image, form.scene.documents, {
    fraudDetect: form.processing?.fraudDetect,
    piiMask: form.processing?.piiMask,
  });
  form.processing.hitl = normalizeHitlConfig(form.processing?.hitl);
  form.master = normalizeMasterConfig(form.master, form.verify);
  form.verify = normalizeVerifyConfig(form.verify);
  form.output = normalizeOutputConfig(form.output, form.scene.documents, form.master.mappings, form.master.knowledgeSource);
  syncOcrExtractTypesOnForm(form);
  syncFraudDetectTypesOnForm(form);
  ensureFormWorkflows(form, { force: true });
  if (typeof normalizeWorkflowTestCase === 'function') {
    form.workflowTestCase = normalizeWorkflowTestCase(form.workflowTestCase);
  }
  form.workflowTestStatus = ['untested', 'success', 'failed'].includes(form.workflowTestStatus)
    ? form.workflowTestStatus
    : 'untested';
  // 取消场景「要確認」状态；旧数据 pending_review 回退为 draft
  if (form.scene) {
    if (form.scene.publishStatus === 'pending_review') form.scene.publishStatus = 'draft';
    if (!['draft', 'ready', 'published'].includes(form.scene.publishStatus)) {
      form.scene.publishStatus = 'draft';
    }
  }
  if (!Array.isArray(form.publishedVersions)) form.publishedVersions = [];
  if (!Array.isArray(form.publishHistory)) form.publishHistory = [];
  if (form.publishedVersions.length > 1) {
    form.publishedVersions = [form.publishedVersions[form.publishedVersions.length - 1]];
  }
  if (form.scene?.publishStatus === 'published' && !form.publishedVersions.length) {
    const snapshot = form.publishedSnapshot
      ? createPublishedSnapshot(form.publishedSnapshot)
      : createPublishedSnapshot(form);
    form.publishedVersions = [{
      id: 'v1',
      publishedAt: form.scene.publishedAt || new Date().toISOString(),
      snapshot,
    }];
  }
  delete form.publishedSnapshot;
  if (!['unsaved', 'valid', 'invalid'].includes(form.outputConfigStatus)) {
    form.outputConfigStatus = form.outputTestStatus === 'success'
      ? 'valid'
      : (form.outputTestStatus === 'failed' ? 'invalid' : 'unsaved');
  }
  delete form.outputTestStatus;
  return form;
}


const SUBSTITUTE_GROUPS = ['A', 'B', 'C', 'D', 'E'];

const BUSINESS_TYPES = [
  '保険金請求',
  '医療保険（入院給付）',
  '医療保険（通院給付）',
  'がん保険',
  '死亡保険',
  '特約・附加給付',
  '保全（契約変更）',
  '保全（受取人変更）',
  '保全（解約）',
];

const AMOUNT_FIELD_PATTERN = /金額|合計|単価|点数|料金|申請額/;

function isAmountFieldName(name) {
  return AMOUNT_FIELD_PATTERN.test(name || '');
}

function parseDescriptionFieldRefs(text) {
  const refs = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m = re.exec(text || '');
  while (m) {
    const parts = m[1].split('.');
    if (parts.length >= 2) {
      refs.push({ doc: parts[0], field: parts[parts.length - 1], path: m[1] });
    }
    m = re.exec(text || '');
  }
  return refs;
}

function descriptionHasAmountFields(text) {
  const refs = parseDescriptionFieldRefs(text);
  if (refs.some((r) => isAmountFieldName(r.field))) return true;
  return /金額|合計|申請額|請求金額/.test(text || '');
}

const AMOUNT_TOLERANCE_OPTIONS = [
  { value: '¥100', label: '¥100（既定）' },
  { value: '¥500', label: '¥500' },
  { value: '¥1000', label: '¥1,000' },
  { value: '完全一致', label: '完全一致（誤差なし）' },
];

function newRuleId(prefix) {
  return `${prefix}_${Date.now().toString(36)}`;
}

const SEAL_DETECTION_TARGETS = [
  { value: '印鑑', label: '印鑑' },
  { value: '署名', label: '署名' },
  { value: '両方', label: '両方' },
];

const DATA_EXPRESSION_PLACEHOLDER =
  '検証ロジックを記述してください。例：{{保険金請求書.請求金額}} = {{診療明細書.合計金額}}';
const TEXT_EXPRESSION_PLACEHOLDER =
  '検証ロジックを記述してください。例：{{保険金請求書.備考}} に「xxxxxx」が含まれないこと';
const DATA_NATURAL_PLACEHOLDER = DATA_EXPRESSION_PLACEHOLDER;
const TEXT_NATURAL_PLACEHOLDER = TEXT_EXPRESSION_PLACEHOLDER;
const TEXT_CONDITION_GUIDE =
  '実行式を直接入力します。AI補助は表現の最適化のみ行います。';
const DATA_CONDITION_GUIDE =
  '実行式を直接入力します。AI補助は表現の最適化のみ行います。';

function optimizeRuleExpression(expression) {
  let s = (expression || '').trim();
  if (!s) return s;
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*([=≤≥<>≠!]+)\s*/g, ' $1 ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function resolveTextDraftExpression(draft, docTypes, picker = {}) {
  if (draft.compiled?.trim()) return draft.compiled.trim();
  const input = (draft.input || '').trim();
  if (!input) return '';
  const auto = compileNaturalToTextRule(input, docTypes, picker);
  return isCompiledRuleResult(auto, input) ? auto : '';
}

function resolveDataDraftExpression(draft, docTypes) {
  if (draft.compiled?.trim()) return draft.compiled.trim();
  const input = (draft.input || '').trim();
  if (!input) return '';
  const auto = compileNaturalToExpression(input, docTypes);
  return isCompiledRuleResult(auto, input) ? auto : '';
}

const OP_NATURAL = {
  '<': 'より前',
  '≤': '以前',
  '<=': '以前',
  '>': 'より後',
  '≥': '以降',
  '>=': '以降',
  '=': 'と一致',
  '==': 'と一致',
  '≠': 'と不一致',
  '!=': 'と不一致',
};

function formatFieldToken(doc, field) {
  return `{{${doc}.${field}}}`;
}

function formatTableColumnToken(docType, tableName, columnName) {
  return `{{${docType}.${tableName}.${columnName}}}`;
}

function formatTableColumnLabel(tableName, columnName) {
  return `${tableName}.${columnName}`;
}

function mergeSchemaItemOrder(schemaNames, existingItems, mapItem) {
  const existingMap = Object.fromEntries((existingItems || []).map((item) => [item.name, item]));
  const keptOrder = (existingItems || []).map((item) => item.name).filter((name) => schemaNames.includes(name));
  const appended = schemaNames.filter((name) => !keptOrder.includes(name));
  return [...keptOrder, ...appended].map((name) => mapItem(name, existingMap[name]));
}

function formatRefPlaceholder(path) {
  return `{{${path}}}`;
}

function parseCrossRuleParts(text) {
  const parts = [];
  if (!text) return parts;
  const re = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let m = re.exec(text);
  while (m) {
    if (m.index > lastIndex) {
      const between = text.slice(lastIndex, m.index).trim();
      if (between) parts.push({ type: 'op', text: between });
    }
    parts.push({ type: 'field', path: m[1] });
    lastIndex = m.index + m[0].length;
    m = re.exec(text);
  }
  const tail = text.slice(lastIndex).trim();
  if (tail) parts.push({ type: 'op', text: tail });
  return parts;
}

function formatRefDisplay(path) {
  const parts = path.split('.');
  if (parts.length >= 2) {
    return `${parts[0]} · ${parts.slice(1).join('.')}`;
  }
  return path;
}

function findNextPhraseStart(text, from, phrases) {
  let min = -1;
  phrases.forEach((ph) => {
    const idx = text.indexOf(ph.text, from);
    if (idx !== -1 && (min === -1 || idx < min)) min = idx;
  });
  return min;
}

function mergeAdjacentTextParts(parts) {
  const out = [];
  parts.forEach((p) => {
    if (p.type === 'text' && out.length && out[out.length - 1].type === 'text') {
      out[out.length - 1].text += p.text;
    } else {
      out.push({ ...p });
    }
  });
  return out;
}

function parseNaturalRuleHighlights(text, docTypes) {
  const phrases = [];
  const seen = new Set();
  const fieldSuffixes = new Set();
  docTypes.forEach((doc) => {
    if (!seen.has(doc)) {
      phrases.push({ type: 'doc', text: doc });
      seen.add(doc);
    }
    getDocSchema(doc).fields.forEach((field) => {
      const phrase = `${doc}の${field}`;
      if (!seen.has(phrase)) {
        phrases.push({ type: 'field', text: phrase });
        seen.add(phrase);
      }
      const suffix = `の${field}`;
      if (!fieldSuffixes.has(suffix)) {
        phrases.push({ type: 'field', text: suffix });
        fieldSuffixes.add(suffix);
      }
    });
  });
  phrases.sort((a, b) => b.text.length - a.text.length);

  const parts = [];
  let i = 0;
  while (i < text.length) {
    let matched = null;
    for (const ph of phrases) {
      if (text.startsWith(ph.text, i)) {
        matched = ph;
        break;
      }
    }
    if (matched) {
      parts.push({ type: matched.type, text: matched.text });
      i += matched.text.length;
    } else {
      const next = findNextPhraseStart(text, i + 1, phrases);
      const end = next === -1 ? text.length : next;
      parts.push({ type: 'text', text: text.slice(i, end) });
      i = end;
    }
  }
  return mergeAdjacentTextParts(parts);
}

function parseRuleHighlightParts(text, docTypes = []) {
  if (!text) return [];
  if (/\{\{[^}]+\}\}/.test(text)) {
    return parseCrossRuleParts(text).map((p) =>
      p.type === 'field'
        ? { type: 'token', text: formatRefDisplay(p.path) }
        : { type: 'text', text: p.text }
    );
  }
  if (!docTypes.length) return [{ type: 'text', text }];
  return parseNaturalRuleHighlights(text, docTypes);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildContainRegex(word) {
  return `/.*${escapeRegex(word)}.*/s`;
}

function buildNotContainRegex(word) {
  return `/^(?!.*${escapeRegex(word)}).*$/s`;
}

function buildTextRegexRule(token, word, contain = false) {
  const pattern = contain ? buildContainRegex(word) : buildNotContainRegex(word);
  return `${token} は正規表現 ${pattern} に一致すること`;
}

function compileNaturalToTextRule(text, docTypes, picker = {}) {
  const t = (text || '').trim();
  if (!t) return '';
  if (/は正規表現\s+\//.test(t)) return t;

  const tryPickerAmount = () => {
    if (!picker.doc || !picker.field) return '';
    const token = formatFieldToken(picker.doc, picker.field);
    const cmp = t.match(/([≤≥<>＝=]+)\s*([\d,，]+)\s*(円|元|人民币)?\s*$/u);
    if (cmp) {
      const op = cmp[1].replace('＝', '=');
      return `${token} ${op} ${cmp[2].replace(/[,，]/g, '')}`;
    }
    return '';
  };

  const tryPickerContain = () => {
    if (!picker.doc || !picker.field) return '';
    const token = formatFieldToken(picker.doc, picker.field);
    const fieldEsc = escapeRegex(picker.field);
    const fieldPatterns = [
      new RegExp(`^${fieldEsc}に\\s*[「『"']([^」』""']+)[」』""']\\s*(?:が)?含まれない`, 'u'),
      new RegExp(`^${fieldEsc}に(.+?)(?:が|を)含まれない`, 'u'),
      new RegExp(`^${fieldEsc}に(.+?)を含まない`, 'u'),
      new RegExp(`^${fieldEsc}.*(?:不含|不包含)(.+)$`, 'u'),
      new RegExp(`^${fieldEsc}に(.+?)(?:が|を)含ま(?:れる|む)`, 'u'),
    ];
    for (const re of fieldPatterns) {
      const m = t.match(re);
      if (m) {
        const word = m[1].trim();
        const contain = /含ま(?:れる|む)|包含/.test(t) && !/含まれない|含まない|不含|不包含/.test(t);
        return buildTextRegexRule(token, word, contain);
      }
    }
    const shortPatterns = [
      { re: /^[「『"']([^」』""']+)[」』""']\s*(?:が)?含まれない/u, contain: false },
      { re: /^(.+?)(?:が|を)含まれない/u, contain: false },
      { re: /^(.+?)(?:を)?含まないこと?$/u, contain: false },
      { re: /^(?:不含|不包含)\s*(.+)$/u, contain: false },
      { re: /^[「『"']([^」』""']+)[」』""']\s*(?:が)?含ま(?:れる|む)/u, contain: true },
      { re: /^(.+?)(?:が|を)含むこと?$/u, contain: true },
    ];
    for (const { re, contain } of shortPatterns) {
      const m = t.match(re);
      if (m) return buildTextRegexRule(token, m[1].trim(), contain);
    }
    return '';
  };

  const pickerAmount = tryPickerAmount();
  if (pickerAmount) return pickerAmount;
  const pickerContain = tryPickerContain();
  if (pickerContain) return pickerContain;

  const tokenAmount = t.match(/^(\{\{[^}]+\}\})\s*(?:要|は)?\s*([≤≥<>＝=]+)\s*([\d,，]+)\s*(円|元|人民币)?$/u);
  if (tokenAmount) {
    const num = tokenAmount[3].replace(/[,，]/g, '');
    const op = tokenAmount[2].replace('＝', '=');
    return `${tokenAmount[1]} ${op} ${num}`;
  }

  const tokenNotContain = t.match(
    /^(\{\{[^}]+\}\})\s*に\s*[「『"']([^」』""']+)[」』""']\s*が\s*含まれないこと$/u
  );
  if (tokenNotContain) {
    return buildTextRegexRule(tokenNotContain[1], tokenNotContain[2], false);
  }

  const tokenContain = t.match(
    /^(\{\{[^}]+\}\})\s*に\s*[「『"']([^」』""']+)[」』""']\s*が\s*含ま(?:れる|む)こと$/u
  );
  if (tokenContain) {
    return buildTextRegexRule(tokenContain[1], tokenContain[2], true);
  }

  const sortedDocs = [...docTypes].sort((a, b) => b.length - a.length);
  for (const doc of sortedDocs) {
    const docEsc = escapeRegex(doc);
    const amountBelow = new RegExp(`^${docEsc}の(.+?)は([\\d,，]+)(?:円|元)?以下であること$`, 'u');
    const mBelow = t.match(amountBelow);
    if (mBelow) {
      const num = mBelow[2].replace(/[,，]/g, '');
      return `${formatFieldToken(doc, mBelow[1].trim())} ≤ ${num}`;
    }
    const amountAbove = new RegExp(`^${docEsc}の(.+?)は([\\d,，]+)(?:円|元)?以上であること$`, 'u');
    const mAbove = t.match(amountAbove);
    if (mAbove) {
      const num = mAbove[2].replace(/[,，]/g, '');
      return `${formatFieldToken(doc, mAbove[1].trim())} ≥ ${num}`;
    }
    const patterns = [
      {
        re: new RegExp(`^${docEsc}の(.+?)に\\s*[「『"']([^」』""']+)[」』""']\\s*が\\s*含まれないこと$`, 'u'),
        contain: false,
      },
      {
        re: new RegExp(`^${docEsc}の(.+?)に\\s*[「『"']([^」』""']+)[」』""']\\s*が\\s*含ま(?:れる|む)こと$`, 'u'),
        contain: true,
      },
      {
        re: new RegExp(`^${docEsc}の(.+?)に(.+?)が含まれないこと$`, 'u'),
        contain: false,
      },
      {
        re: new RegExp(`^${docEsc}の(.+?)に(.+?)を含まないこと$`, 'u'),
        contain: false,
      },
      {
        re: new RegExp(`^${docEsc}の(.+?)に(.+?)が含ま(?:れる|む)こと$`, 'u'),
        contain: true,
      },
      {
        re: new RegExp(`^${docEsc}の(.+?)に(.+?)を含むこと$`, 'u'),
        contain: true,
      },
    ];

    for (const { re, contain } of patterns) {
      const m = t.match(re);
      if (m) return buildTextRegexRule(formatFieldToken(doc, m[1].trim()), m[2].trim(), contain);
    }
  }

  return '';
}

function isCompiledRuleResult(compiled, input) {
  const c = (compiled || '').trim();
  const i = (input || '').trim();
  if (!c || c === i) return false;
  return /\{\{[^}]+\}\}/.test(c);
}

function ruleReadableText(text) {
  const t = (text || '').trim();
  if (!t) return '';
  if (!/\{\{/.test(t)) return replaceDocTypeIdsInText(t);

  const regexRule = t.match(/^(\{\{[^}]+\}\})\s*は正規表現\s+(\/[^/]+\/[gimsuy]*)\s*に一致すること$/u);
  if (regexRule) {
    const [, token, pattern] = regexRule;
    const label = labelFromToken(token);
    const inner = pattern.replace(/^\/(.+)\/[gimsuy]*$/s, '$1');
    const notContain = inner.match(/^\^\(\?!\.\*(.+)\)\.\*\$$/);
    if (notContain) {
      return `${label} に「${notContain[1].replace(/\\/g, '')}」が含まれないこと`;
    }
    const contain = inner.match(/^\.\*(.+)\.\*$/s);
    if (contain) {
      return `${label} に「${contain[1].replace(/\\/g, '')}」が含まれること`;
    }
    return `${label} は正規表現 ${pattern} に一致すること`;
  }

  const naturalContain = t.match(/^(\{\{[^}]+\}\})\s*に\s*[「『"']([^」』""']+)[」』""']\s*が\s*含まれないこと$/u);
  if (naturalContain) {
    return `${labelFromToken(naturalContain[1])} に「${naturalContain[2]}」が含まれないこと`;
  }

  const tokens = [...t.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
  const opsOnly = t.replace(/\{\{[^}]+\}\}/g, '').trim();
  if (tokens.length >= 2 && /^[=＝\s]+$/.test(opsOnly)) {
    const labels = tokens.map((path) => {
      const parts = path.split('.');
      const docLabel = getDocDisplayLabel(parts[0]);
      return parts.length > 1 ? `${docLabel}の${parts.slice(1).join('.')}` : docLabel;
    });
    if (labels.length === 2) return `${labels[0]}と${labels[1]}は一致すること`;
    return `${labels.join('、')}は一致すること`;
  }

  const compare = t.match(/^(\{\{[^}]+\}\}(?:\s*=\s*\{\{[^}]+\}\})*)\s*([≤≥<>＝=]+)\s*(.+)$/);
  if (compare) {
    const leftToken = compare[1].match(/\{\{([^}]+)\}\}/);
    if (leftToken) {
      const l = labelFromToken(`{{${leftToken[1]}}}`);
      const op = compare[2].replace('＝', '=');
      const rightRaw = compare[3].trim();
      const r = /^\{\{/.test(rightRaw) ? labelFromToken(rightRaw) : rightRaw.replace(/(円|日元|元)$/u, '').trim();
      const amountSuffix = /^\d/.test(r) || /^¥/.test(r) ? '円' : '';
      const rLabel = /^\{\{/.test(rightRaw) ? r : `${Number(r.replace(/[,，]/g, '')).toLocaleString('ja-JP')}${amountSuffix}`;
      if (op === '=') return `${l}は${rLabel}と一致すること`;
      if (['≤', '<=', '<'].includes(op)) return `${l}は${rLabel}以下であること`;
      if (['≥', '>=', '>'].includes(op)) return `${l}は${rLabel}以上であること`;
      const phrase = OP_NATURAL[op];
      if (phrase) return `${l}は${rLabel}${phrase}であること`;
    }
  }

  return replaceDocTypeIdsInText(optimizeRuleDescription(t));
}

function compileNaturalToExpression(text, docTypes) {
  let t = (text || '').trim();
  if (!t) return '';
  if (/\{\{[^}]+\}\}/.test(t)) return t;

  const normalized = t
    .replace(/小于等于|不大於/g, '≤')
    .replace(/小于|未満/g, '≤')
    .replace(/大于等于/g, '≥')
    .replace(/大于/g, '>')
    .replace(/等于/g, '=');

  const phrases = [];
  docTypes.forEach((doc) => {
    getDocSchema(doc).fields.forEach((field) => {
      phrases.push({ doc, field, text: `${doc}の${field}` });
    });
    Object.entries(getDocSchema(doc).tables || {}).forEach(([table, cols]) => {
      cols.forEach((col) => {
        phrases.push({ doc, field: `${table}.${col}`, text: `${doc}の${table}.${col}` });
      });
    });
  });
  phrases.sort((a, b) => b.text.length - a.text.length);

  for (const { doc, field, text: phrase } of phrases) {
    const numRe = new RegExp(
      `^${escapeRegex(phrase)}\\s*([≤≥<>＝=]+)?\\s*([\\d,，]+)\\s*(円|日元|元)?`,
      'u'
    );
    const m = normalized.match(numRe);
    if (m) {
      const op = (m[1] || '≤').trim() || '≤';
      const num = m[2].replace(/[,，]/g, '');
      return `{{${doc}.${field}}} ${op} ${num}`;
    }
  }

  const crossEq = normalized.match(/^(.+?)の(.+?)は(.+?)の(.+?)と一致すること?$/u);
  if (crossEq && docTypes.includes(crossEq[1]) && docTypes.includes(crossEq[3])) {
    return `${formatFieldToken(crossEq[1], crossEq[2].trim())} = ${formatFieldToken(crossEq[3], crossEq[4].trim())}`;
  }

  const crossCmp = normalized.match(/^(.+?)の(.+?)は(.+?)の(.+?)(以下|以上)であること$/u);
  if (crossCmp && docTypes.includes(crossCmp[1]) && docTypes.includes(crossCmp[3])) {
    const op = crossCmp[5] === '以下' ? '≤' : '≥';
    return `${formatFieldToken(crossCmp[1], crossCmp[2].trim())} ${op} ${formatFieldToken(crossCmp[3], crossCmp[4].trim())}`;
  }

  const eqList = normalized.match(/^(.+?)の([^は]+)は一致すること?$/u);
  if (eqList) {
    const field = eqList[2].trim();
    const docs = eqList[1].split(/[、・,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const known = docs.filter((d) => docTypes.includes(d));
    if (known.length >= 2) {
      return known.map((d) => formatFieldToken(d, field)).join(' = ');
    }
  }

  const eqPair = normalized.match(/^(.+?)と(.+?)の([^は]+)は一致すること?$/u);
  if (eqPair && docTypes.includes(eqPair[1]) && docTypes.includes(eqPair[2])) {
    return `${formatFieldToken(eqPair[1], eqPair[3].trim())} = ${formatFieldToken(eqPair[2], eqPair[3].trim())}`;
  }

  const dateCmp = normalized.match(/^(.+?)の(.+?)は(.+?)の(.+?)(以前|以降|より前|より後)であること$/u);
  if (dateCmp) {
    const op = /以前|より前/.test(dateCmp[5]) ? '≤' : '≥';
    return `${formatFieldToken(dateCmp[1], dateCmp[2])} ${op} ${formatFieldToken(dateCmp[3], dateCmp[4])}`;
  }

  if (/偽造|不正|改ざん|フォージ|tamper|fraud/i.test(t)) {
    return '{{fraud.risk_score}} >= {{fraud.threshold}}';
  }
  if (/重複|再利用|同一画像/i.test(t)) {
    return '{{fraud.duplicate_score}} >= {{fraud.threshold}}';
  }
  if (/完全性.*NG|必須帳票.*欠落|資料.*不足/i.test(t)) {
    return '{{case.completeness}} = NG';
  }
  if (/前処理.*確認|画質.*NG|DPI/i.test(t)) {
    return '{{preprocess.status}} = REVIEW_REQUIRED';
  }
  if (/OCR.*確認|信頼度.*閾値|要確認フィールド/i.test(t)) {
    return 'ANY({{ocr.fields.confidence}}) < {{ocr.threshold}}';
  }
  if (/AI検証.*PASS|検証.*通過/i.test(t)) {
    return '{{verify.status}} = PASS';
  }
  if (/検証.*NG|Master.*未一致/i.test(t)) {
    return '{{verify.status}} = NG OR {{master.match}} = UNMATCHED';
  }
  if (/不備通知|補件.*通知/i.test(t)) {
    return '{{case.has_deficiency}} = true';
  }
  if (/必要資料.*揃|案件.*就绪|readiness/i.test(t)) {
    return '{{case.readiness}} = OK';
  }

  const regexRule = t.match(/^(.+?)は正規表現\s+\/(.+)\/([a-z]*)?\s*に一致(?:すること)?$/u);
  if (regexRule) {
    const fieldRef = regexRule[1].trim();
    for (const doc of docTypes) {
      for (const field of getDocSchema(doc).fields || []) {
        if (fieldRef === `${doc}の${field}` || fieldRef === field) {
          const flags = regexRule[3] || '';
          return `REGEX_MATCH({{${doc}.${field}}}, /${regexRule[2]}/${flags})`;
        }
      }
    }
    return `REGEX_MATCH(${fieldRef}, /${regexRule[2]}/${regexRule[3] || ''})`;
  }

  return '';
}

function validateExecutableRule(text) {
  const t = (text || '').trim();
  if (!t) return '条件を入力してください';
  if (!/\{\{[^}]+\}\}/.test(t)) {
    return '実行式に変換されていません。「AIで実行式を生成」するか、フィールドを挿入してください';
  }
  if (!parseDescriptionFieldRefs(t).length) {
    return '有効なフィールド参照（{{帳票.フィールド}}）を含めてください';
  }
  const remainder = t.replace(/\{\{[^}]+\}\}/g, ' ').trim();
  if (!/[=≤≥<>≠!]/.test(remainder)) {
    return 'フィールド挿入後、=、≤、≥ などの比較演算子を記述してください';
  }
  return '';
}

function validateTextRule(expression) {
  const t = (expression || '').trim();
  if (!t) return '実行式を入力してください';
  if (!/\{\{[^}]+\}\}/.test(t)) {
    return '実行式に {{帳票.フィールド}} 参照を含めてください';
  }
  return '';
}

function isTextRegexExpression(text) {
  return /は正規表現\s+\//.test((text || '').trim());
}

function labelFromToken(token) {
  const trimmed = token.trim();
  const m = trimmed.match(/^\{\{(.+)\}\}$/);
  if (!m) return replaceDocTypeIdsInText(trimmed);
  const parts = m[1].split('.');
  if (parts.length === 1) return getDocDisplayLabel(parts[0]);
  return `${getDocDisplayLabel(parts[0])}の${parts.slice(1).join('.')}`;
}

function optimizeRuleDescription(text) {
  const t = text.trim();
  if (!t) return '診断書の発行日は申込書の申請日以前であること';
  const compare = t.match(/^(.+?)\s*(<=|>=|≠|!=|≤|≥|<|>|=)\s*(.+)$/);
  if (compare) {
    const [, left, op, right] = compare;
    const l = labelFromToken(left);
    const r = labelFromToken(right);
    const phrase = OP_NATURAL[op];
    if (phrase) {
      if (['=', '==', '≠', '!='].includes(op)) {
        return `${l}は${r}${phrase}すること`;
      }
      return `${l}は${r}${phrase}であること`;
    }
  }
  if (t.includes('{{')) {
    return t.replace(/\{\{([^}]+)\}\}/g, (_, inner) => {
      const parts = inner.split('.');
      return parts.length > 1
        ? `${getDocDisplayLabel(parts[0])}の${parts.slice(1).join('.')}`
        : getDocDisplayLabel(inner);
    });
  }
  return replaceDocTypeIdsInText(t.replace(/と/g, ' かつ ').replace(/または/g, ' または '));
}

const STORAGE_KEY = 'kisoku-nintei-v3';

function loadStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveStorage(sceneId, formData) {
  try {
    const store = loadStorage() || {};
    store[sceneId] = JSON.parse(JSON.stringify(formData));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) { console.warn('localStorage save failed', e); }
}

function removeSceneFromStorage(sceneId) {
  try {
    const store = loadStorage() || {};
    delete store[sceneId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) { console.warn('localStorage remove failed', e); }
}

function loadSceneFromStorage(sceneId) {
  const store = loadStorage();
  if (!store || !store[sceneId]) return null;
  return store[sceneId];
}

function createPublishedSnapshot(formData) {
  const snapshot = cloneJson(formData);
  delete snapshot.publishedSnapshot;
  delete snapshot.publishedVersions;
  return snapshot;
}
