const cell = value => String(value ?? '').replaceAll('|', '｜').replaceAll('\n', ' ');
const code = value => '`' + cell(value) + '`';

function modifierMatrixReport({ rows, unsampled, failures }) {
  const names = {
    'gladiator-normal': '角斗士件数与普攻武器限制', 'gladiator-exclusion': '角斗士对其余伤害段的排除',
    'ordinary-profiles': '五类直伤与通用套装组合', 'ordinary-equivalent-sets': '同文两件套在各类伤害上的对照',
    'ordinary-weapons': '武器被动、副属性与套装叠加', 'ordinary-party': '班尼特领域与持有者套装叠加',
    'attack-times-bonus': '攻击与增伤相乘', 'additive-bonuses': '两项增伤相加',
    'crit-selection': '暴击模式和上限', 'crit-and-resistance': '五类命中的暴击和抗性',
    'resistance-and-recipient': '减抗来源与套装受益人', 'party-attack': '领域施放者与攻击加成受益人',
  };
  const lines = ['## 单次直伤与加成', '', '| 规则 | 数值通过 | 数值不符 | 缺输入或结果 | 缺独立期望 |',
    '| --- | ---: | ---: | ---: | ---: |'];
  for (const [rule, label] of Object.entries(names)) {
    const group = rows.filter(row => row.rule === rule);
    const count = (...states) => group.filter(row => states.includes(row.status)).length;
    lines.push('| ' + [label, count('passed'), count('mismatch'), count('missing-input', 'missing-result'), count('missing-evidence')].join(' | ') + ' |');
  }
  const general = rows.filter(r => r.rule === 'ordinary-profiles');
  lines.push('', '通用矩阵覆盖 ' + new Set(general.map(r => r.recipient)).size + ' 个角色与形态、' + new Set(general.map(r => r.hit)).size
    + ' 个命中，各自核验 ' + new Set(general.map(r => r.conditions.profile)).size + ' 种配装。另有 ' + unsampled.filter(r => r.rule === 'ordinary-profiles').length
    + ' 个命中未纳入通用矩阵，具体原因见 JSON 的 singleHitModifiers.unsampled。', '');
  lines.push('| 伤害类型 | 独立命中数 | 单套装对照次数 | 双套装对照次数 | 武器对照次数 | 队友领域对照次数 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [category, label] of Object.entries({ normal: '普攻', charged: '重击', plunge: '下落', skill: '战技', burst: '爆发' })) {
    const hits = general.filter(r => r.category === category);
    const singles = hits.filter(r => r.conditions.profile !== 'baseline' && !r.conditions.profile.includes('+'));
    const pairs = hits.filter(r => r.conditions.profile.includes('+'));
    const count = rule => rows.filter(r => r.category === category && r.rule === rule).length;
    lines.push('| ' + [label, new Set(hits.map(r => r.hit)).size, singles.length, pairs.length, count('ordinary-weapons'), count('ordinary-party')].join(' | ') + ' |');
  }
  for (const row of failures) lines.push('- ' + [names[row.rule] ?? row.reason, row.recipient, row.hit ?? row.category,
    JSON.stringify(row.conditions ?? {}), row.status ?? '缺样本', '期望 ' + (row.expected ?? '—'), '实际 ' + (row.actual ?? '—')].map(cell).join(' · '));
  return lines;
}

export function rosterGapReport(result, entities) {
  const { summary: n, characterClauses, equipment, scenes, publicGaps, uncovered } = result;
  const names = new Map([...entities.characters, ...entities.weapons, ...entities.sets].map(entity => [entity.id, entity.identity?.name ?? entity.name]));
  const lines = ['# 正式目录计算验收缺口', '',
    ...modifierMatrixReport(result.singleHitModifiers), '',
    '## 当次条件下的计算器覆盖', '',
    `角色与形态的正式命中有 ${n.calculatorSelectableHits}/${n.calculatorCharacterHits} 项可从菜单选中。装备追加命中有 ${n.calculatorSelectableEquipmentHits}/${n.calculatorEquipmentHits} 项可按武器或套装件数选择。`,
    '', `在满足授予与受益门槛的配装中，计算器列出了 ${n.calculatorListedBuffModifiers}/${n.calculatorBuffModifiers} 个角色与装备修饰项。`,
    '', '### 计算器授予、受益与输入', '',
    ...(result.calculator.failures.length ? result.calculator.failures.map(row => `- ${code(row.entity)} ${code(row.field)} ${cell(row.issue)}`) : ['所有已登记项通过入口检查。']),
    '', `有 ${n.calculatorHitComparisons} 个可选择的角色命中在所列条件下得到了与独立算式一致的伤害。`,
    '', '## 全目录独立计算与机制记录', '',
    `核对了 ${n.characters} 个角色及形态、${n.weapons} 把武器和 ${n.sets} 套圣遗物。全机制独立核验已闭合的数量分别为 ${n.completeCharacters}、${n.completeWeapons}、${n.completeSets}。`,
    '', `已登记的 ${n.evaluated} 个角色命中中，${n.numeric} 个取得数值，${n.compared} 个有独立算式对照，${n.mismatches} 个基础数值不符。`,
    '', `武器共核对 ${n.weaponRefinementsEvaluated} 个合法精炼档，套装共核对 ${n.setThresholdsEvaluated} 个件数门槛，另含 ${n.setConditionScenarios} 个套装用例和 ${n.setHealingScenarios} 个海染砗磲窗口用例。`,
    '', `本地收录 ${n.publicSceneSourceClauses} 条场景条款，已执行 ${n.publicSceneDefinitions} 个正式场景中的 ${n.publicSceneContributions} 项贡献。共鸣评估 ${n.publicResonanceScenarios} 种设定，角色祝赐评估 ${n.blessingScenarios} 种适用条件和 ${n.blessingCapScenarios} 个属性边界。`,
    '', '## 求值与独立期望不符的用例', '',
    ...result.auditFailures.filter(r => r.classification !== '缺少本地依据').map(r => `- ${code(r.entity)} ${code(r.field ?? '/buffs')} ${cell(r.issue)}`),
    ...(result.auditFailures.some(r => r.classification !== '缺少本地依据') ? [] : ['已运行的这些用例全部符合预期。']),
    '', '## 伤害字段缺口', '',
    '| 实体 | 正式字段 | 名称或命中 | 参数或问题 |', '| --- | --- | --- | --- |'];
  for (const row of result.gaps) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name ?? row.hit)} | ${cell((row.parameters ?? []).join('、'))} ${cell([row.classification, row.issue, row.missingFields?.join('、')].filter(Boolean).join(' · '))} |`);
  lines.push('', '## 技能治疗验收', '', `登记了 ${n.talents} 个技能的 ${n.talentDetails} 条详情。治疗量字段有 ${n.verifiedTalentHeals}/${n.healingDetails} 个通过独立验算，共 ${n.talentHealingScenarios} 个用例。待补基础数值验收的字段有 ${n.recoveryDetailsPending} 个。`,
    '', '## 场景条款缺口', '', '| 实体 | 本地字段 | 本地说明 | 尚缺工作 |', '| --- | --- | --- | --- |');
  for (const row of scenes.gaps) lines.push(`| ${code(row.entity)} | ${code(row.field)} | ${cell(row.text)} | ${cell(row.issue ?? row.diagnostics?.join('，'))} |`);
  lines.push('', '## 角色被动和命座', '', `对 ${n.passiveClauses} 个被动和 ${n.constellationClauses} 个命座逐项登记。已核对 ${n.pureTalentLevelClauses} 条纯加级条款，${n.noncombatClauses} 条属于生活用途。`,
    '', '## 装备未闭合条款', '', '| 实体 | 正式字段 | 已登记效果 | 待完整核验的条款 |', '| --- | --- | --- | --- |');
  for (const row of equipment.gaps.filter(r => r.kind === 'set' || r.refinement === 1)) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.grants?.join('、'))} | ${cell(row.description)} ${cell(row.reason)} |`);
  lines.push('', '## 实体全机制独立核验', '', '| 类型 | 实体 | 核验字段 |', '| --- | --- | --- |');
  for (const row of uncovered.filter(r => ['character', 'weapon', 'set'].includes(r.kind))) lines.push(`| ${({ character: '角色', weapon: '武器', set: '套装' })[row.kind]} | ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} |`);
  return lines.join('\n') + '\n';
}
