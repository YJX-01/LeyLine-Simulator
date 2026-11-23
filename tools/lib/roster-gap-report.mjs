const cell = value => String(value ?? '').replaceAll('|', '｜').replaceAll('\n', ' ');
const code = value => '`' + cell(value) + '`';

export function rosterGapReport(result, entities) {
  const { summary: n, characterClauses, equipment, scenes, publicGaps, uncovered } = result;
  const names = new Map([...entities.characters, ...entities.weapons, ...entities.sets].map(entity => [entity.id, entity.identity?.name ?? entity.name]));
  const subjects = { 'character-clause': '被动与命座原文', 'talent-description': '技能说明原文', 'equipment-clause': '武器与套装原文', modifier: '修饰项' };
  const lines = ['# 正式目录计算验收缺口', '',
    '## 当次条件下的计算器覆盖', '',
    `角色与形态的正式命中有 ${n.calculatorSelectableHits}/${n.calculatorCharacterHits} 项可从菜单选中。装备追加命中有 ${n.calculatorSelectableEquipmentHits}/${n.calculatorEquipmentHits} 项可按武器或套装件数选择，其中 ${n.calculatorEquipmentHitComparisons} 项取得了与独立算式一致的正值。数值、解锁条件和输入保存在 JSON 的 calculator.hits 与 calculator.equipmentHits。`,
    '', `在满足授予与受益门槛的配装中，计算器列出了 ${n.calculatorListedBuffModifiers}/${n.calculatorBuffModifiers} 个角色与装备修饰项。其中 ${n.calculatorProvenBuffModifiers} 项已有明确对应到该修饰项的独立数值对照，${n.calculatorPendingBuffModifiers} 项待对照。当次条件专项共验算 ${n.singleHitAuditCases} 个用例，${n.singleHitAuditFailures} 个不符。按原文指针去重后，${n.singleHitProvenFields} 个字段通过所属专项的验算。`,
    '', '### 计算器授予、受益与输入', '',
    ...(result.calculator.failures.length ? result.calculator.failures.map(row => `- ${code(row.entity)} ${code(row.field)} ${cell(row.issue)}`) : ['所有已登记项通过入口检查。']),
    '', `有 ${n.calculatorHitComparisons} 个可选择的角色命中在所列条件下得到了与独立算式一致的伤害。统计包括附魔、分段、额外交互及捕获等已登记分支。同一命中在多个条件下的用例保存在对应字段内。`,
    '', `场景仍有 ${n.currentSceneClausesPending} 个原文字段需要核对终值、受益对象或影响范围，详见 JSON 的 currentSceneGaps。填写 ElementLevelCo 后，${n.sceneDamageVerified} 项真实伤害可核验终值，另有 ${n.sceneBaseVerified ?? 0} 项可核验应用防御和抗性前的基础量。`,
    '', `直接回能首批 ${n.verifiedEnergyClauses} 个授予字段经过 ${n.currentEnergyCases} 个对照，返还、清除及特殊触发的后续批次在各自的 rows 中记录独立读数。被动和命座治疗首批 ${n.confirmedPassiveHealingClauses} 个原文字段经过 ${n.confirmedPassiveHealingScenarios} 个对照。`,
    '', '### 原文与数值的对应关系', '',
    `各行按子句或修饰项统计。仍有 ${result.currentClauseInventory.summary.unresolvedProse} 条原文子句需要确认其与计算结果的对应关系，其中 ${result.currentClauseInventory.summary.unresolvedProseWithMeasuredParts} 条已能指向经过数值对照的原文片段。JSON 的 currentClauseInventory.rows 保留原文、候选命中或增益、证据及待核字段。`, '',
    '| 核对对象 | 当前数值有证据 | 已绑定待对照 | 待绑定 | 缺依据 | 待核实归属 | 纯时序 | 非数值 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(subjects).map(([key, title]) => {
      const counts = result.currentClauseInventory.summary.bySubject[key] ?? {};
      return '| ' + [title, ...['available', 'bound-unverified', 'needs-binding', 'needs-evidence', 'needs-review', 'timeline-only', 'non-numeric'].map(status => counts[status] ?? 0)].join(' | ') + ' |';
    }),
    '', '### 有具体归属的剩余条款', '',
    '| 实体 | 字段 | 待实现或待提供的输入 |', '| --- | --- | --- |',
    ...result.entityFieldGaps.map(row => `| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.reason)} |`),
    ...result.triggerHitEvidence.filter(row => row.openQuestion).map(row => `| ${code(row.entity)} | ${code(row.field)} | ${cell(row.openQuestion)} ${cell(row.sources.join('、'))} |`),
    '', '### 当次场景结果仍需的证据', '',
    '| 场景 | 原文字段 | 可核对的部分 | 所需证据 |', '| --- | --- | --- | --- |',
    ...result.currentSceneGaps.map(row => `| ${code(row.entity)} | ${code(row.field)} | ${cell(row.verifiedSubtotal?.scope ?? row.evidence?.established?.join(' ') ?? row.text)} | ${cell([row.issue, ...(row.missingFields ?? [])].filter(Boolean).join(' '))} |`),
    '', '## 全目录独立计算与机制记录', '',
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
  lines.push('', '## 技能治疗与护盾', '', `登记了 ${n.talents} 个技能的 ${n.talentDetails} 条详情。治疗量字段有 ${n.verifiedTalentHeals}/${n.healingDetails} 个通过独立验算，共 ${n.talentHealingScenarios} 个用例，包含受益者、站场和两方治疗加成。已确认的护盾及其初始吸收量、上限有 ${n.verifiedShieldAbsorptionDetails}/${n.shieldDetails} 个字段通过 ${n.shieldAbsorptionCases} 个用例。待补基础数值验收的字段有 ${n.recoveryDetailsPending} 个。`,
    '', '| 实体 | 正式字段 | 条款 | 本地算式 |', '| --- | --- | --- |');
  for (const row of result.recoveryGaps) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name)} | ${code(row.template)} |`);
  lines.push('', '## 公共战斗条款', '', `满辉按七种触发元素和队伍变化核验了 ${n.gleamCases} 个用例。已核对的共鸣与满辉条款有 ${result.publicChecks.length} 项，尚有 ${publicGaps.length} 项待核对。`);
  if (publicGaps.length) lines.push('', '| 实体 | 字段 | 本地数值 | 尚缺工作 |', '| --- | --- | --- | --- |');
  for (const row of publicGaps) lines.push(`| ${code(row.entity)} | ${code(row.field)} | ${code(JSON.stringify(row.localValue))} | ${cell(row.reason)} |`);
  lines.push('', '## 场景与持续时间', '', `固定场景资料中的 ${n.sceneDamageEvidenceRows} 条独立冲击已有倍率证据。计算器支持其中 ${n.sceneDamageVerified} 条对敌人造成真实伤害的冲击，通过 ${n.sceneDamageChecks} 个数值与边界对照。单击读取显式 ElementLevelCo。每个场景的 evidence 保留了等级归属仍需核实的源字段。`,
    '', '| 实体 | 本地字段 | 本地说明 | 尚缺工作 |', '| --- | --- | --- | --- |');
  for (const row of scenes.gaps) lines.push(`| ${code(row.entity)} | ${code(row.field)} | ${cell(row.text)} | ${cell(row.issue ?? row.diagnostics?.join('，'))} |`);
  lines.push('', '## 角色被动和命座', '', `对 ${n.passiveClauses} 个被动和 ${n.constellationClauses} 个命座逐项登记。已核对 ${n.pureTalentLevelClauses} 条纯加级条款，${n.noncombatClauses} 条属于生活用途，埃洛伊有 ${n.inactiveConstellations} 个未开放的命座。下表保留尚待逐条件核对的条款原文、授予位置和当前实现。`, '',
    '| 实体 | 正式字段 | 名称 | 登记效果 | 待完整核验的条款 |', '| --- | --- | --- | --- | --- |');
  for (const row of characterClauses.rows.filter(r => r.status === '战斗贡献待逐条件验收')) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.name)} | ${cell(row.grantIds.join('、'))} | ${cell(row.text)} |`);
  lines.push('', '## 装备未闭合条款', '', '武器按精炼一展示原文。JSON 报告逐一保留各合法精炼档的原文、白值、装备授予与实际贡献，并保留每个套装件数门槛两侧的结果。', '',
    '| 实体 | 正式字段 | 已登记效果 | 待完整核验的条款 |', '| --- | --- | --- | --- |');
  for (const row of equipment.gaps.filter(r => r.kind === 'set' || r.refinement === 1)) lines.push(`| ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} | ${cell(row.grants?.join('、'))} | ${cell(row.description)} ${cell(row.reason)} |`);
  lines.push('', '## 实体全机制独立核验', '', '下列实体至少有一项机制或适用情形待验证。每个命中的倍率、实际结果、排除条件和已采用证据范围可在同次生成的 JSON 中按实体和字段查找。', '',
    '| 类型 | 实体 | 核验字段 |', '| --- | --- | --- |');
  for (const row of uncovered.filter(r => ['character','weapon','set'].includes(r.kind))) lines.push(`| ${({ character: '角色', weapon: '武器', set: '套装' })[row.kind]} | ${cell(names.get(row.entity))} ${code(row.entity)} | ${code(row.field)} |`);
  return lines.join('\n') + '\n';
}
