const classifyText = (text) => {
  if (!text || /治疗|护盾|healing|shield/i.test(text)) return 'unknown';
  if (/伤害|damage/i.test(text)) return /提高|提升|增加|加成|降低|减免|bonus|increase|reduction/i.test(text) ? 'buff' : 'damage';
  if (/增益|攻击力|暴击|精通|抗性|防御力|buff/i.test(text)) return 'buff';
  return 'unknown';
};

const categoryFor = (side, row, parent) => {
  const text = row.scope?.label ?? row.clause?.name ?? row.clause?.text ?? row.label ?? row.occurrences?.[0]?.label ?? parent?.occurrences?.[0]?.label ?? '';
  if (row.scope?.kind === 'healing' || row.output === 'healing' || row.output === 'shield' || row.result?.is_heal || row.result?.is_shield) return 'unknown';
  if (side === 'mona' && row.kind === 'output-branch') return row.output === 'damage' ? 'damage' : 'unknown';
  if (side === 'mona') {
    if (['reaction-field', 'equipment-event'].includes(row.kind)) return 'damage';
    if (['buff', 'effect', 'set-threshold', 'set-stat-effect'].includes(row.kind)) return 'buff';
    return row.kind === 'skill' ? classifyText(text) : 'unknown';
  }
  if (['hit', 'equipment-hit'].includes(row.subject) || row.subject?.startsWith('reaction-')) return 'damage';
  if (row.subject === 'modifier') return 'buff';
  if (row.subject === 'clause') {
    if (row.clause?.subject === 'modifier') return 'buff';
    if (row.clause?.subject === 'hit') return classifyText(text);
    return classifyText(text);
  }
  return 'unknown';
};

const compact = (value) => typeof value === 'string' ? value : JSON.stringify(value);
const describeFeatures = (row, rows) => {
  const binding = row.binding ?? {};
  const buff = binding.buff ?? {};
  const modifier = binding.modifier ?? {};
  const definition = binding.definition ?? {};
  const clause = rows.find((item) => item.clause)?.clause ?? row.clause ?? {};
  const features = {
    output: row.output ?? row.scope?.kind,
    element: row.element ?? binding.element ?? definition.element,
    family: binding.family ?? definition.family,
    category: binding.category ?? definition.category,
    stat: modifier.target ?? row.effect?.attribute ?? row.attribute ?? clause.target,
    value: modifier.value ?? row.effect?.value,
    base: definition.base,
    snapshot: definition.snapshot,
    parameters: binding.parameters ?? clause.parameters,
    description: row.description ?? clause.text,
    trigger: buff.trigger ?? definition.trigger,
    condition: modifier.condition ?? buff.condition ?? row.when ?? definition.when,
    recipient: buff.sourceRecipient && (modifier.recipient ?? buff.recipient) === 'team'
      ? {role:'team',source:buff.sourceRecipient,excludeOwner:buff.excludeOwner ?? false}
      : modifier.recipient ?? buff.recipient ?? clause.recipient,
    appliesTo: buff.appliesTo,
    stacking: buff.stacking,
    lifetime: buff.lifetime ?? buff.duration ?? definition.duration,
    scope: clause.scope,
    needed: clause.needed,
    variables: row.variables,
    inputs: clause.inputs ?? row.evidence?.inputs ?? row.config,
    pieces: binding.pieces ?? row.pieces,
    branches: rows.filter((item) => item.kind === 'output-branch').map((item) => ({
      id: item.id, branch: item.branch, output: item.output, element: item.element,
      scenario: item.scenario?.id, constellation: item.scenario?.constellation,
    })),
  };
  const labels = { output: '输出', element: '元素', family: '伤害族', category: '动作类别', stat: '属性', value: '数值', base: '基础倍率', snapshot: '属性捕获', parameters: '参数', description: '说明', trigger: '触发', condition: '条件', recipient: '作用对象', appliesTo: '适用范围', stacking: '叠层', lifetime: '持续', variables: '变量', inputs: '输入', pieces: '件数', scope: '范围', needed: '所需条件' };
  const featureText = Object.entries(labels).filter(([key]) => features[key] != null)
    .map(([key, label]) => `${label}：${compact(features[key])}`).join('；');
  return { features, featureText: featureText.length > 160 ? `${featureText.slice(0, 159)}…` : featureText };
};

const monaGroup = (row, ids) => {
  if (row.kind === 'open' && ids.has(row.parentId)) return row.parentId;
  // Observations of the same output under different configurations are variants.
  if (row.kind === 'output-branch') return [row.parentId, row.branch, row.output, row.element].join(':');
  return row.id;
};

const leylineGroup = (row, ids) => {
  if (row.subject === 'clause' && row.bindingId && ids.has(row.bindingId)) return row.bindingId;
  return row.id;
};

/** Build an inspectable inventory from the report's source records. */
export function buildInventory(report) {
  const result = [];
  for (const side of ['mona', 'leyline']) {
    const records = Array.isArray(report?.[side]) ? report[side] : [];
    const ids = new Set(records.map((row) => row.id));
    const byId = new Map(records.map((row) => [row.id, row]));
    const observedParents = new Set(records.filter((row) => row.kind === 'output-branch').map((row) => row.parentId));
    const groups = new Map();
    for (const row of records) {
      const key = side === 'mona' ? monaGroup(row, ids) : leylineGroup(row, ids);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const [id, rows] of groups) {
      const primary = rows.find((row) => row.id === id) ?? rows[0];
      const binding = primary.binding ?? {};
      const parent = byId.get(primary.parentId);
      const category = side === 'mona' && primary.kind === 'skill' && observedParents.has(primary.id)
        ? 'unknown' : rows.map((row) => categoryFor(side, row, parent)).find((value) => value !== 'unknown') ?? 'unknown';
      const entity = primary.identity?.entity ?? primary.entity ?? parent?.identity?.entity ?? primary.character ?? primary.owner ?? primary.key ?? '';
      const baseName = primary.label ?? binding.name ?? binding.definition?.name ?? primary.occurrences?.[0]?.label
        ?? parent?.occurrences?.[0]?.label ?? binding.buffId ?? binding.identity?.id ?? primary.clause?.name ?? primary.clause?.text ?? primary.key ?? primary.id;
      const name = primary.kind === 'output-branch'
        ? `${baseName}（${[primary.branch, primary.element].filter(Boolean).join(' / ')}）` : baseName;
      const entityName = primary.characterLabel ?? parent?.characterLabel ?? entity;
      const mechanism = [binding.family, binding.definition?.family, primary.branch, primary.effect?.attribute,
        binding.modifier?.target, primary.clause?.subject, primary.subject, primary.kind]
        .find(value => typeof value === 'string' && value.length) ?? 'unknown';
      const { features, featureText } = describeFeatures(primary, rows);
      result.push({
        id, side, category, name, entity, entityName, mechanism,
        sourceIds: rows.map((row) => row.id), features, featureText,
        implementation: primary.binding || primary.effect ? String(primary.source?.path ?? primary.source ?? '') : '',
        sourcePath: typeof primary.source === 'string' ? primary.source : [primary.source?.path, primary.source?.pointer].filter(Boolean).join('#'),
        source: rows,
      });
    }
  }
  return result;
}
