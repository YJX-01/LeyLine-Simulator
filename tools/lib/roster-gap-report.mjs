const cell = value => String(value ?? '').replaceAll('|', '｜').replaceAll('\n', ' ');
const code = value => '`' + cell(value) + '`';

export function rosterGapReport(result, entities) {
  const { summary: n, characterClauses, equipment, scenes, publicGaps, uncovered } = result;
  const names = new Map([...entities.characters, ...entities.weapons, ...entities.sets].map(entity => [entity.id, entity.identity?.name ?? entity.name]));
  const lines = ['# 正式目录计算验收缺口', '',
    `核对了 ${n.characters} 个角色及形态、${n.weapons} 把武器和 ${n.sets} 套圣遗物。全机制独立核验已闭合的数量分别为 ${n.completeCharacters}、${n.completeWeapons}、${n.completeSets}。`,
    '', `已登记的 ${n.evaluated} 个角色命中中，${n.numeric} 个取得数值，${n.compared} 个有独立算式对照，${n.mismatches} 个基础数值不符。全目录判定还包括尚未进入菜单或没有完整贡献的条款。`,
    '', `武器共核对 ${n.weaponRefinementsEvaluated} 个合法精炼档，其中 ${n.weaponTextComparisons} 项固定数值贡献逐一匹配对应精炼档的属性原文。套装共核对 ${n.setThresholdsEvaluated} 个件数门槛。另有 ${n.setConditionScenarios} 个套装用例覆盖武器类别、队伍元素、受伤、护盾接触、冻结和目标减抗。海染砗磲另验了 ${n.setHealingScenarios} 种双治疗角色的生成冷却、归属与伤害。`,
    '', `本地收录 ${n.publicSceneSourceClauses} 条场景条款，${n.completePublicSceneClauses} 条通过当前全条款验收。已执行 ${n.publicSceneDefinitions} 个正式场景中的 ${n.publicSceneContributions} 项贡献，尚有 ${n.publicSceneSourceGaps} 条存在缺口。共鸣评估 ${n.publicResonanceScenarios} 种设定，角色祝赐评估 ${n.blessingScenarios} 种适用条件和 ${n.blessingCapScenarios} 个属性边界。`, '',
    `另有 ${n.castTimingCases} 个施放与冷却用例、${n.characterBuffCases} 个角色增益用例、${n.manekinCases} 个奇偶形态用例、${n.equipmentContextCases} 个装备条件用例、${n.weaponTriggerScenarios} 个武器资源触发用例、${n.publicSceneTriggerCases} 个场地事件用例和 ${n.publicSceneReactionCases} 个场地反应筛选用例。附着减时逐项核对了 ${n.auraDurationCases} 个条件，雷共鸣产球与拾取核对了 ${n.resonanceParticleCases} 个条件。套装门槛已闭合 ${n.completeSetThresholds}/${n.setThresholdsEvaluated}。`, '',
    '## 缺少本地依据的字段', '',
    '| 实体 | 字段 | 缺少的依据 |', '| --- | --- | --- |',
    ...result.gaps.filter(r=>r.classification==='缺少本地依据').map(r=>`| ${code(r.entity)} | ${(r.missingFields??[r.field]).map(code).join('、')} | ${cell(r.issue)} |`),
    ...result.interpretations.map(r=>`| ${code(r.entity)} | ${r.fields.map(code).join('、')} | ${cell(r.reason)} |`),
    ...result.lifecycleGaps.filter(r=>r.classification==='缺少本地依据' || !r.classification && r.area==='timing').map(r=>`| ${code(r.entity)} | ${(r.fields??[r.field]).map(code).join('、')} | ${cell(r.reason)} |`),
    ...scenes.gaps.filter(r=>r.missingFields?.length).map(r=>`| ${code(r.entity)} | ${r.missingFields.map(code).join('、')} | ${cell(r.issue)} |`),
    '', '## 求值与独立期望不符的用例', '',
    ...result.auditFailures.filter(r=>r.classification!=='缺少本地依据').map(r=>`- ${code(r.entity)} ${code(r.field??'/buffs')} ${cell(r.issue)}`),
    ...result.auditFailures.some(r=>r.classification!=='缺少本地依据') ? [] : ['已运行的这些用例全部符合预期。'],
    '', '## 伤害字段', '',
    '| 实体 | 正式字段 | 名称或命中 | 参数或问题 |', '| --- | --- | --- | --- |'];
  for (const row of result.gaps) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name ?? row.hit)} | ${cell((row.parameters ?? []).join('、'))} ${cell([row.classification, row.issue, row.missingFields?.join('、')].filter(Boolean).join(' · '))} |`);
  for (const row of result.interpretations) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${row.fields.map(code).join('、')} | 逐手倍率 | ${cell(row.reason)} |`);
  lines.push('', '## 单击条件与时间轴触发', '', '| 实体 | 正式字段 | 未决行为 |', '| --- | --- | --- |');
  for (const row of result.lifecycleGaps) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code((row.document ?? '') + row.field)} | ${cell(row.missing.join('、'))}。 ${cell(row.reason)} |`);
  lines.push('', '## 技能中的加成、减伤与计数', '', '下表列出已有具体数值且尚未全部绑定到命中或增益的技能条款。', '',
    '| 实体 | 正式字段 | 条款 | 待绑定参数 |', '| --- | --- | --- | --- |');
  for (const row of result.contextualDetails.filter(r => r.kind === '属性或机制贡献' && r.missingContributionParameters.length)) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name)} | ${cell(row.missingContributionParameters.join('、'))} |`);
  lines.push('', '## 技能治疗与护盾', '', `已逐项登记 ${n.talents} 个技能的 ${n.talentDetails} 条详情，其中有 ${n.healingDetails} 个治疗量字段、${n.shieldDetails} 个护盾吸收量字段。对已记录的一次治疗及其受益者，${n.verifiedTalentHeals} 项基础治疗通过 ${n.talentHealingScenarios} 个场景验算，含受益者、站场和两方治疗加成的交换对照。芭芭拉的爆发治疗还用于验证海染泡沫的输入与结算。技能的完整触发、时序和实际生命变化仍须按角色核对。下表列出缺少基础数值验收的 ${n.recoveryDetailsPending} 项。`,
    '', '| 实体 | 正式字段 | 条款 | 本地算式 |', '| --- | --- | --- |');
  for (const row of result.recoveryGaps) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name)} | ${code(row.template)} |`);
  lines.push('', '## 公共战斗条款', '', `满辉按七种触发元素和队伍变化核验了 ${n.gleamCases} 个用例。已核对的共鸣与满辉条款有 ${result.publicChecks.length} 项，尚有 ${publicGaps.length} 项待核对。`);
  if (publicGaps.length) lines.push('', '| 实体 | 字段 | 本地数值 | 尚缺工作 |', '| --- | --- | --- | --- |');
  for (const row of publicGaps) lines.push(`| ${code(row.entity)} | ${code(row.field)} | ${code(JSON.stringify(row.localValue))} | ${cell(row.reason)} |`);
  lines.push('', '## 场景与持续时间', '', '| 实体 | 本地字段 | 本地说明 | 尚缺工作 |', '| --- | --- | --- | --- |');
  for (const row of scenes.gaps) lines.push(`| ${code(row.entity)} | ${code(row.field)} | ${cell(row.text)} | ${cell(row.issue ?? row.diagnostics?.join('，'))} |`);
  lines.push('', '## 角色被动和命座', '', `对 ${n.passiveClauses} 个被动和 ${n.constellationClauses} 个命座逐项登记。已核对 ${n.pureTalentLevelClauses} 条纯加级条款，${n.noncombatClauses} 条属于生活用途，埃洛伊有 ${n.inactiveConstellations} 个未开放的命座。下表保留尚待逐条件核对的条款原文、授予位置和当前实现。`, '',
    '| 实体 | 正式字段 | 名称 | 登记效果 | 待完整核验的条款 |', '| --- | --- | --- | --- | --- |');
  for (const row of characterClauses.rows.filter(r => r.status === '战斗贡献待逐条件验收')) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name)} | ${cell(row.grantIds.join('、'))} | ${cell(row.text)} |`);
  lines.push('', '## 装备未闭合条款', '', '武器按精炼一展示原文。JSON 报告逐一保留各合法精炼档的原文、白值、装备授予与实际贡献，并保留每个套装件数门槛两侧的结果。', '',
    '| 实体 | 正式字段 | 已登记效果 | 待完整核验的条款 |', '| --- | --- | --- | --- |');
  for (const row of equipment.gaps.filter(r => r.kind === 'set' || r.refinement === 1)) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.grants?.join('、'))} | ${cell(row.description)} |`);
  lines.push('', '## 实体全机制独立核验', '', '下列实体至少有一项机制或适用情形待验证。每个命中的倍率、实际结果、排除条件和已采用证据范围可在同次生成的 JSON 中按实体和字段查找。', '',
    '| 类型 | 实体 | 核验字段 |', '| --- | --- | --- |');
  for (const row of uncovered.filter(r => ['character','weapon','set'].includes(r.kind))) lines.push(`| ${({ character: '角色', weapon: '武器', set: '套装' })[row.kind]} | ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} |`);
  return lines.join('\n') + '\n';
}
