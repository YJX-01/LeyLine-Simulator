import { createHash } from 'node:crypto';
import { validateMonaTransformativeReviews } from './mona-transformative-audit.mjs';
import { amplificationFingerprint } from './source-fingerprint.mjs';
import { readFileSync } from 'node:fs';
import { buildInventory, buildEvidence } from './audit-page-data.mjs';
import { readContentSource } from './content-source.mjs';

// --- mona-behavior-scope.mjs ---
// Source ownership and audit scope are independent of the display grouping.
const damage = /造成.{0,20}伤害|伤害(?:值|量|倍率)|额外.{0,16}(?:攻击|一击|附伤)|连续.{0,10}(?:剑击|射击)|(?:普通攻击|下落攻击|重击|斩击|水弹)伤害/;
const buff = /(?:提升|提高|增加|降低|获得|加成|强化|削减).{0,12}(?:攻击力|防御力|生命值上限|伤害|暴击|精通|抗性|攻速|攻击速度)|(?:伤害|攻击力|防御力|生命值上限|暴击率|精通|抗性|攻击速度).{0,6}(?:提升|提高|增加|降低|加成)|元素附魔/;
const boundaryRules = [
  ['stacks', /叠[加层]|层数|最多.{0,4}层|[Ss]tacks?/],
  ['refresh', /刷新|重新计时|重新计算持续时间|refresh/i],
  ['expiry', /持续.{0,6}秒|到期|结束时|duration|expir/i],
  ['off-field', /后台|退场|离场|off.?field|on.?field/i],
  ['recipient', /队友|队伍中.{0,12}角色|其他角色|受益者|当前场上角色|recipient/i],
  ['team', /队伍中.{0,15}(?:名|元素类型)|队伍.{0,5}组成|teamElements/],
  ['events', /每.{0,6}秒.{0,8}触发|每隔|概率|连续.{0,6}(?:次|段)|额外.{0,8}(?:一击|攻击)|触发顺序/],
];

function sourceText(item) {
  const c = item.clause;
  return [c?.text, c?.name, c?.scope, ...(c?.missing ?? []), item.description,
    ...(item.occurrences ?? []).map(o => o.label)].filter(Boolean).join(' ');
}

export function sourceScope(item, category) {
  const parent = (reason, owner) => ({ role: 'parent', reason, owner });
  const excluded = reason => ({ role: 'excluded', reason });
  const pending = reason => ({ role: 'pending', reason, categories: ['unknown'] });
  const included = (...categories) => ({ role: 'behavior', categories });
  if (item.bindingId) return parent('正式定义的证据条款', item.bindingId);
  if (item.kind === 'open') return pending(item.reason ?? '条件分支尚待核对');
  if (item.kind === 'input') return parent('角色或装备的配置字段', item.source?.path + '#' + item.source?.pointer?.split('/').slice(0, 2).join('/'));
  if (item.kind === 'action') return parent('动作引用的技能菜单', item.source?.path + '#' + item.source?.pointer);
  if (item.kind === 'entry-point') return parent('公共计算入口', item.source?.path);
  if (item.output === 'healing' || item.output === 'shield') return excluded(item.output === 'healing' ? '此输出为治疗量' : '此输出为护盾吸收量');
  if (item.kind === 'skill' && category === 'unknown') return parent('菜单与条件分支分别登记', item.source?.path);
  if (item.kind === 'automatic-rule') {
    if (item.type === 'character') return pending('自动授予规则的条件和附伤分支待核对');
    return included('buff');
  }
  const c = item.clause;
  if (!c) return category === 'unknown' ? pending('来源未确定输出类型') : included(category);
  if (c.subject === 'equipment-audit') return parent('装备原文汇总，按独立条款核对', item.source);
  const text = sourceText(item);
  const categories = [];
  if (damage.test(text) || /\/hits\//.test(c.field)) categories.push('damage');
  if (buff.test(text) || /\/buffs(?:\/|$)/.test(c.field)) categories.push('buff');
  if (categories.length) return included(...categories);
  if (c.subject === 'pending-branch') return pending(c.scope ?? '待核对条件分支');
  if (category !== 'unknown') return included(category);
  if (/^(?:普通攻击|重击|下落攻击)[。\s]*$/.test(text.trim())) return parent('天赋段落标题', item.source);
  if (c.status === 'non-numeric' && /特产|合成|烹饪|外观|摆设|派遣|钓鱼/.test(text)) return excluded('探索、制作或外观条款');
  if (/^(?:治疗量|护盾吸收量|治疗效果|基础治疗量)(?:\s*\{[^}]+\})*$/.test(text.trim())
    || /^(?:\{[^}]+\}\s*)+(?:治疗量|护盾吸收量)$/.test(text.trim())) return excluded('独立治疗或护盾数值');
  return pending(c.needed ?? c.scope ?? '需核实原文是否产生伤害或增益');
}

/** Menus own their fields; distinctly declared conditional outputs still need review. */
export function conditionalBranches(item) {
  const snapshot = item.binding?.definition?.snapshot;
  if (snapshot && (item.subject === 'hit' || item.subject === 'equipment-hit')) {
    const source = snapshot.sourceKind === 'capture-only' ? '明确捕获点'
      : snapshot.sourceKind === 'action-or-capture' ? '有效施放或明确捕获点' : '关联记录';
    return [{ key:'source',category:'damage',facet:'snapshot',condition:snapshot.sourceSkillId + ' · ' + source },
      ...[...new Set(snapshot.attributes)].map(stat => ({key:'attribute.' + stat,category:'damage',facet:'snapshot',condition:'按捕获时刻读取 ' + stat}))];
  }
  if (item.kind === 'automatic-rule' && item.modeled?.length) {
    return item.modeled.map(grant => ({ key: grant, category: 'buff', facet: 'trigger', condition: grant }));
  }
  if (item.kind !== 'input') return [];
  const { name, options } = item.value ?? {};
  if (!name || !Array.isArray(options)) return [];
  return options.flatMap((option, index) => {
    const text = String(option);
    const category = /伤害加成|精通|攻击力|暴击|抗性|防御力|增伤/.test(text) ? 'buff'
      : /伤害|扩散|超导|蒸发|融化|感电|绽放|附伤/.test(text) ? 'damage' : null;
    return category ? [{ key: name + '=' + index, category, facet: 'condition', condition: name + ' = ' + index + ' (' + text + ')' }] : [];
  });
}

function readsTeam(expression) {
  if (!expression || typeof expression !== 'object') return false;
  if (['teamCount', 'teamRegion', 'teamStat'].some(key => Object.hasOwn(expression, key))
    || ['team-count', 'team-region', 'team-attribute'].includes(expression.kind)) return true;
  return Object.values(expression).some(readsTeam);
}

export function declaredFacets(item, category) {
  if (category === 'unknown') return ['scope'];
  const b = item.binding ?? {}, def = b.definition ?? {}, grant = b.buff ?? {};
  const facets = new Set([category === 'damage' ? 'formula' : 'attribute']);
  if (item.kind === 'reaction-field' || item.subject?.startsWith('reaction-')) return [...facets];
  if (category === 'damage') {
    if (item.element || b.element || def.elementBy || def.element) facets.add('element');
    if (b.hitId || item.kind === 'output-branch') facets.add('hit');
    if (def.base) facets.add('scaling');
    if (b.parameters?.length) facets.add('curve');
    if (item.branch && item.branch !== 'normal') facets.add('reaction');
    if (def.coordinated || def.accumulate || def.confirmedProc || item.kind === 'equipment-event' || item.value?.parts > 1) facets.add('events');
  }
  if (grant.trigger || def.confirmedProc || item.kind === 'automatic-rule' || item.kind === 'equipment-event') facets.add('trigger');
  if (b.unlock || def.when || item.when || item.effect?.when || grant.condition || grant.windowFact || grant.trigger?.afterOwnerSkill
    || b.modifier?.condition || item.pieces || b.pieces) facets.add('condition');
  if (grant.trigger?.cooldownMs || def.confirmedProc?.cooldownMs) facets.add('cooldown');
  if ([b.modifier?.value, b.modifier?.condition, grant.condition, def.when].some(readsTeam)) facets.add('team');
  if (grant.recipient || grant.excludeOwner || b.modifier?.recipient) facets.add('recipient');
  if (grant.stacking) {
    if (grant.stacking.policy !== 'replace') facets.add('stacks');
    if (grant.stacking.policy === 'replace' || grant.stacking.refresh || grant.stacking.refreshAll) facets.add('refresh');
  }
  if (grant.duration || grant.lifetime?.durationMs) facets.add('expiry');
  if (b.categoryStacks?.length) {
    for (const facet of ['trigger','stacks','refresh','expiry']) facets.add(facet);
  }
  const text = sourceText(item) + ' ' + JSON.stringify([grant.condition, grant.trigger, b.modifier?.condition, item.when, item.effect, item.config?.map(c => c.name)]);
  for (const [facet, pattern] of boundaryRules) if (pattern.test(text)) facets.add(facet);
  return [...facets];
}

export function semanticId(item, groupId) {
  const b = item.binding;
  if (item.kind === 'input') return ['mona', 'input', item.ownerType, item.owner, item.field, item.value.name].join(':');
  if (b?.hitId) return [item.kind, item.entity, 'hit', b.hitId].join(':');
  if (b?.modifier) {
    // Modifier indices are JSON pointers, and can shift when an unrelated stat is added.
    const shape = m => JSON.stringify(m, (key, value) => {
      if (typeof value === 'number') return '#';
      if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));
      return value;
    });
    const signature = shape(b.modifier);
    const digest = createHash('sha256').update(signature).digest('hex').slice(0, 16);
    const index = Number(item.field?.split('/').at(-1) ?? 0);
    const ordinal = (b.buff?.modifiers ?? []).slice(0, index).filter(mod => shape(mod) === signature).length;
    return [item.kind, item.entity, b.buffId, b.modifier.target, digest, ordinal].join(':');
  }
  if (b?.identity?.id) return [item.kind, item.entity, item.subject, b.identity.id].join(':');
  return item.kind === 'output-branch' ? groupId : item.id;
}

// --- mona-difference-attribution.mjs ---
const amplificationCases = new Map([
  ['amplification-batch:Citlali:0:melt',{mona:'mona:branch:Citlali:0:c0:default:melt',leyline:'character:citlali:hit:/talents/0/hits/0',entity:'citlali',weapon:'apprenticesnotes',reaction:'melt',aura:'pyro',element:'cryo',index:0}],
  ['amplification-batch:Citlali:1:melt',{mona:'mona:branch:Citlali:1:c0:default:melt',leyline:'character:citlali:hit:/talents/0/hits/1',entity:'citlali',weapon:'apprenticesnotes',reaction:'melt',aura:'pyro',element:'cryo',index:1}],
  ['amplification-batch:Xiangling:12:vaporize',{mona:'mona:branch:Xiangling:12:c0:default:vaporize',leyline:'character:xiangling:hit:/talents/1/hits/0',entity:'xiangling',weapon:'beginnersprotector',reaction:'vaporize',aura:'hydro',element:'pyro',index:12}],
]);
const close=(a,b)=>Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b));
function scopedDuplicateMenu(link) {
  const definitions={
    'ordinary-duplicate-menu:Citlali:10':{name:'Citlali',id:'citlali',weapon:'apprenticesnotes',index:10,target:'character:citlali:hit:/talents/2/hits/1',hits:['citlali.burst.param1','citlali.burst.param2'],ratios:[5.376,1.344],source:'.references/mona-community/mona_core/src/character/characters/cryo/citlali.rs'},
    'ordinary-duplicate-menu:KaedeharaKazuha:6':{name:'KaedeharaKazuha',id:'kaedeharakazuha',weapon:'dullblade',index:6,target:'character:kaedeharakazuha:hit:/talents/0/hits/7',hits:['kaedeharakazuha.normal.param7','kaedeharakazuha.normal.param8'],ratios:[.43,.74648],source:'.references/mona-community/mona_core/src/character/characters/anemo/kaedehara_kazuha.rs'},
  };
  const rule=definitions[link.id],proof=link.scopedDuplicateMenuProof,row=proof?.row;
  if(!rule || !row || link.mona?.length!==2 || !link.mona.includes(`mona:skill:${rule.name}:${rule.index}`)
    || !link.mona.includes(`mona:branch:${rule.name}:${rule.index}:c0:default:normal`) || link.leyline?.length!==1
    || link.leyline[0].id!==rule.target || link.leyline[0].revision!=='3' || row.spec?.id!==rule.id
    || row.spec.source!==rule.source || JSON.stringify(row.spec.hits)!==JSON.stringify(rule.hits))return false;
  try {
    if(proof.provenance?.mona!=='589ac6919057709924c0c20d5a9d673fe9b0be1a'
      || JSON.stringify(proof.provenance)!==JSON.stringify(amplificationFingerprint(rule.id,rule.weapon)))return false;
    for(const path of [rule.source,'tools/lib/mona-ordinary-wrong-arms.mjs','tools/lib/mona-calculation-probes.mjs','tools/lib/roster-audit-settings.mjs',
      'src/web/src/domain/real-project.ts','src/web/src/domain/workbench-project.ts',
      'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json']) {
      if(proof.dependencies?.[path]!==createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex'))return false;
    }
  } catch { return false; }
  const input=row.mona?.input,aligned=row.mona?.alignedInput,actor=row.project?.candidate?.actors?.[0];
  if(input?.character?.name!==rule.name || input.character.level!==1 || input.character.constellation!==0 || input.skill?.index!==rule.index
    || input.weapon?.level!==1 || input.weapon.refine!==1 || input.artifacts?.length!==0 || input.enemy!==null || input.buffs?.length!==0
    || actor?.build?.character?.id!==rule.id || actor.build.level!==1 || actor.build.ascension!==0 || actor.build.constellation!==0
    || row.project?.enemy?.level!==90 || !close(row.project.enemy.resistances[rule.id==='citlali'?'cryo':'physical'],.1)
    || aligned?.buffs?.length!==1 || !close(aligned.buffs[0]?.config?.ATKFixed?.value,row.mona.correction)
    || Math.abs(row.mona.correction)>1 || !close(row.mona.nativeAttack+row.mona.correction,row.mona.attack)
    || Math.abs(row.mona.ratio-rule.ratios[0])>.00005) return false;
  if(rule.id==='kaedeharakazuha' && (input.skill.config?.KaedeharaKazuha?.after_e_or_q!==false
    || row.events.some(id=>!row.project.timeline.find(event=>event.id===id)?.damage?.facts?.some(fact=>fact.subject.kind==='actor'
      && fact.subject.id===actor.id && fact.values?.['kaedeharakazuha.crimsonMomijiInfusion']?.value?.value===false)))) return false;
  const factor=101/291*.9;
  return rule.hits.every((hit,i)=>row.project.timeline.some(event=>event.id===row.events[i] && event.damage?.hit.hitId===hit)
    && close(row.ratios[i],rule.ratios[i]) && close(row.expected[i],row.mona.attack*rule.ratios[i]*factor)
    && close(row.actual[i],row.expected[i])) && close(row.mona.damage,row.mona.attack*row.mona.ratio*factor);
}
function scopedAmplificationBatch(link, cache) {
  if (!link.id.startsWith('amplification-batch:')) return false;
  try {
    if (!cache.batch) {
      const proof = JSON.parse(readFileSync(new URL('../../artifacts/amplification-shared-review.json', import.meta.url), 'utf8'));
      for (const path of ['artifacts/amplification-shared-review.mjs', 'tools/lib/mona-amplification-batch.mjs', 'artifacts/mona-difference-batch.json']) {
        const data = readFileSync(new URL('../../' + path, import.meta.url));
        if (proof.sourceSha256?.[path] !== createHash('sha256').update(data).digest('hex')) return false;
      }
      cache.batch = { proof, prior: JSON.parse(readFileSync(new URL('../../artifacts/mona-difference-batch.json', import.meta.url), 'utf8')), fingerprints: new Map() };
    }
    const { proof, prior, fingerprints } = cache.batch;
    if (proof.baseline?.mona !== '589ac6919057709924c0c20d5a9d673fe9b0be1a'
      || prior.baselines?.mona !== proof.baseline.mona) return false;
    const mapping = proof.mappings?.find(row => row.id === link.id);
    if (!mapping || mapping.disposition !== 'different' || JSON.stringify(mapping.mona) !== JSON.stringify(link.mona)
      || JSON.stringify(mapping.leyline) !== JSON.stringify(link.leyline) || link.mona?.length !== 1 || link.leyline?.length !== 1) return false;
    const target = link.leyline[0].id, match = /^character:([^:]+):hit:\/talents\/(\d+)\/hits\/(\d+)$/.exec(target);
    const row = proof.rows?.find(item => item.id === link.mona[0] && item.leyline === target);
    if (!match || !row || row.status !== 'different' || row.cases?.length !== 3 || link.leyline[0].revision !== '3') return false;
    const [,,talentIndex,hitIndex] = match, entity = match[1], origin = proof.provenance?.[entity];
    if (!origin || origin.fingerprint?.mona !== proof.baseline.mona) return false;
    const fingerprintKey = entity + '/' + origin.weapon;
    if (!fingerprints.has(fingerprintKey)) fingerprints.set(fingerprintKey, amplificationFingerprint(entity, origin.weapon));
    if (JSON.stringify(fingerprints.get(fingerprintKey)) !== JSON.stringify(origin.fingerprint)) return false;
    const branch = prior.mona.find(item => item.id === row.id), parent = branch?.parentId;
    const ordinary = prior.links.find(item => item.disposition === 'matched' && item.id.startsWith('ordinary-batch:')
      && item.mona?.includes(parent) && item.leyline?.length === 1 && item.leyline[0].id === target && item.leyline[0].revision === '3');
    const anchored = prior.leyline.find(item => item.id === target);
    if (!ordinary || !anchored || branch?.scenario?.id !== 'default' || branch.scenario.constellation !== 0
      || branch.branch !== row.reaction || branch.parentId !== parent || row.element !== anchored.binding?.element
      || anchored.source !== `src/game-data/data/characters/${entity}.json#/talents/${talentIndex}/hits/${hitIndex}`) return false;
    const direction = { pyro: { melt: [2,'cryo'], vaporize: [1.5,'hydro'] }, hydro: { vaporize: [2,'pyro'] }, cryo: { melt: [1.5,'pyro'] } };
    const config = direction[row.element]?.[row.reaction];
    if (!config || row.aura !== config[1]) return false;
    return row.cases.every((item, index) => {
      const m = item.mona, y = item.leyline;
      return item.level === [1,6,10][index] && m?.otherBonus === 0 && m.em > 0 && y?.em > 0
        && close(m.expected, m.normal * config[0] * (1 + (25/9) * m.em / (1400 + m.em)))
        && close(y.expected, y.normal * config[0] * (1 + 2.78 * y.em / (1400 + y.em)))
        && close(m.actual, m.expected) && close(y.actual, y.expected);
    });
  } catch { return false; }
}
/** Classify the existing difference mappings without treating an untested event sequence as resolved. */
export function classifyMonaDifferences(links, wrongArmRows = [], transformative, leylineRows = []) {
  const cache = {};
  const verifiedReactions = new Set(validateMonaTransformativeReviews(links, transformative ?? { rows: [] }, leylineRows)
    .reviews.map(review => review.id));
  return links.filter(link => link.disposition === 'different').map(link => {
    const id = link.id;
    let cause = 'unclassified', status = 'open', batchProof = false;
    if (verifiedReactions.has(id)) {
      cause = 'reaction-coefficient-version';
      status = 'attributed';
    } else if (scopedDuplicateMenu(link)) {
      cause = 'duplicate-menu-binding';
      status = 'attributed-scoped';
    } else if ((batchProof = scopedAmplificationBatch(link, cache))) {
      cause = 'amplification-coefficient-and-talent-precision';
      status = 'attributed-scoped';
    } else if (/^spec-(?:buff|hit|set4pc):/.test(id) && Array.isArray(link.sources) && link.sources.length && Array.isArray(link.comparisons) && link.comparisons.length) {
      cause = 'spec-verified-semantic-difference';
      status = 'attributed';
    } else if (id.startsWith('ordinary-wrong-arm:')) {
      const row = wrongArmRows.find(item => item.status === 'different' && link.mona?.includes(item.mona)
        && link.leyline?.some(ref => ref.id === item.leyline));
      if (row?.arm?.path && link.sources?.includes(row.arm.path + ':' + row.arm.line)
        && row.ratios?.length === 15 && row.cases?.length === 3 && row.ratios.every((item, index) => item.level === index + 1 &&
        [item.mona, item.rust, item.official].every(Number.isFinite)
        && Math.abs(item.mona - item.rust) <= .000001 && Math.abs(item.mona - item.official) > .001)
        && row.cases.every((item, index) => item.level === [1, 6, 10][index] && Number.isFinite(item.actual) && Number.isFinite(item.expected)
          && Math.abs(item.actual - item.expected) <= Math.max(.000001, Math.abs(item.expected) * .000001))) {
        cause = 'talent-parameter-branch';
        status = 'attributed';
      }
    }
    return { id, cause, status, ...(status === 'attributed-scoped' ? {
      scope: batchProof ? 'independent-natural-panels-only' : 'level-one-single-hit-only',
      proof: batchProof ? 'artifacts/amplification-shared-review.json' : 'live:duplicateMenus',
    } : {}), evidence: Array.isArray(link.sources) ? [...link.sources] : [],
      explanation: link.explanation ?? '', comparisons: Array.isArray(link.comparisons) ? link.comparisons : [] };
  });
}

// --- mona-behavior-ledger.mjs ---
const reviewedNormalCurves = new Map([
  ['character:kaeya:hit:/talents/0/hits/0', 'Kaeya'],
  ['character:amber:hit:/talents/0/hits/0', 'Amber'],
]);
const curveSource = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json';
export function reviewedNormalCurve(record, target) {
  const name = reviewedNormalCurves.get(target.id);
  if (!name || record.leyline !== target.id || record.mona !== `mona:branch:${name}:0:c${record.constellation}:default:normal`
    || ![0, 6].includes(record.constellation) || record.status !== 'matched' || !observedAttackScaling(target, record)) return false;
  const values = readContentSource(curveSource)[name.toLowerCase()].combat1.param1;
  return Array.from({ length: 11 }, (_, i) => i + 1).every(rank => {
    const cases = record.cases.filter(sample => sample.effectiveTalentLevel === rank);
    return cases.length === 2 && new Set(cases.map(sample => sample.rollId)).size === 2 && cases.every(sample => {
      const team = rank === 11;
      const term = sample.coefficientEvidence?.terms?.[0];
      return sample.level === 90 && sample.ascension === 6 && sample.constellation === record.constellation
        && sample.talentLevel === (team ? 10 : rank) && sample.talentBonuses?.normal === 0
        && sample.monaInput?.character?.skill1 === rank - 1 && sample.leylineBuild?.talentLevel === (team ? 10 : rank)
        && (team ? sample.teamSupport?.id === 'tartaglia' && sample.leylineBuild?.teammate?.id === 'tartaglia'
          && sample.leylineBuild?.teammate?.build?.character?.id === 'tartaglia' && sample.teamSupport?.monaTeamMode === 'effective-rank-only'
          && sample.teamSupport?.source === 'src/game-data/data/characters/tartaglia.json#/passives/2' : !sample.teamSupport)
        && term?.parameter === 'param1' && term.source === `${curveSource}#/${name.toLowerCase()}/combat1/param1/${rank - 1}`
        && compare(term.value, values[rank - 1], 1e-12)
        && compare(sample.coefficientEvidence.monaCoefficient, term.value, .00005 + Number.EPSILON)
        && compare(sample.coefficientEvidence.independentDamage, sample.leyline, sample.tolerance)
        && compare(sample.mona, sample.leyline, sample.tolerance) && !sample.requiredInputs?.length;
    });
  });
}

export const facetNames = {
  formula: '单次伤害公式', element: '元素', scaling: '缩放属性', curve: '等级倍率', hit: '命中段',
  reaction: '反应分支', attribute: '属性变化', condition: '启用与禁用', trigger: '触发器',
  events: '次数与事件顺序', snapshot: '属性捕获', recipient: '受益对象', 'off-field': '站场与后台',
  team: '队伍限制', stacks: '叠层上限', refresh: '刷新', expiry: '到期', cooldown: '触发冷却', scope: '条件分支归属',
};
export const gapNames = {
  scope: '待判定范围', mapping: '对应关系待确认', binding: '正式绑定待定位', implementation: '缺正式实现',
  unverified: '缺本行为运行证据', failed: '运行失败', comparison: '缺同输入对照', difference: '差异待归因',
  absent: '上期来源或绑定消失',
};
const keyOf = ref => typeof ref === 'string' ? ref : ref.id;
const compare = (a, b, tolerance) => [a, b, tolerance].every(Number.isFinite) && tolerance >= 0 && Math.abs(a - b) <= tolerance;
function observedAttackScaling(item, record) {
  const terms = item.binding?.definition?.base;
  if (record.status !== 'matched' || !terms?.length || !terms.every(term => term.stat === 'attack' && term.parameter)
    || !record.cases?.length) return false;
  const panels = new Map();
  for (const sample of record.cases) {
    const evidence = sample.coefficientEvidence;
    if (!evidence || evidence.terms?.length !== terms.length || !terms.every((term, index) =>
      evidence.terms[index].parameter === term.parameter && evidence.terms[index].source && Number.isFinite(evidence.terms[index].value))
      || !compare(evidence.terms.reduce((sum, term) => sum + term.value, 0), evidence.coefficient, 1e-12)
      || !compare(evidence.monaCoefficient, evidence.coefficient, .00005 * terms.length + Number.EPSILON * Math.max(1, Math.abs(evidence.coefficient)))
      || !compare(evidence.independentDamage, sample.leyline, sample.tolerance)
      || !compare(evidence.independentDamage, sample.mona, sample.tolerance)
      || !compare(sample.effectiveAttack?.mona, sample.effectiveAttack?.leyline, 1e-7) || sample.requiredInputs?.length) return false;
    const key = JSON.stringify([sample.level, sample.ascension, sample.talentLevel, sample.constellation, sample.element, sample.target]);
    if (!panels.has(key)) panels.set(key, []);
    panels.get(key).push(sample);
  }
  return [...panels.values()].some(group => group.some(sample => {
    const first = group[0], attackChange = sample.effectiveAttack.mona - first.effectiveAttack.mona;
    const expectedChange = sample.coefficientEvidence.independentDamage - first.coefficientEvidence.independentDamage;
    return attackChange !== 0 && expectedChange * attackChange > 0
      && compare(sample.mona - first.mona, expectedChange, sample.tolerance + first.tolerance)
      && compare(sample.leyline - first.leyline, expectedChange, sample.tolerance + first.tolerance);
  }));
}
const reactionCases = (report, links, item) => {
  const keys = new Set(links.flatMap(link => link.mona ?? []).filter(id => id.startsWith('mona:reaction:')).map(id => id.slice(14)));
  if (item.kind === 'reaction-field') keys.add(item.key);
  return (report.transformative?.rows ?? []).filter(r => keys.has(r.key) || (item.source && r.provenance?.coefficient === item.source));
};

/** Only credit a specific claim for which the indicated execution produced readings. */
function evidenceForFacet(item, facet, side, evidence, report, links, sourceIds, attribution) {
  const { details } = evidence;
  const proof = { local: false, bilateral: false, failed: false, difference: false };
  if (facet === 'formula' && (item.kind === 'reaction-field' || item.binding?.identity?.id?.endsWith('.coefficient'))) {
    const cases = reactionCases(report, links, item);
    if (cases.length) {
      proof.local = cases.every(row => Number.isFinite(row[side]));
      proof.failed = !proof.local;
      proof.difference = cases.some(row => !compare(row.mona, row.leyline, row.tolerance ?? Math.max(1e-5, Math.abs(row.independent) * 1e-6))
        && !links.some(link => link.id === 'transformative-' + row.key && attribution.get(link.id)?.status === 'attributed'));
      proof.bilateral = proof.local && !proof.difference && cases.every(row => compare(row.leyline, row.independent, row.tolerance ?? Math.max(1e-5, Math.abs(row.independent) * 1e-6)));
      return proof;
    }
  }
  if (side === 'mona' && item.kind === 'output-branch' && ['formula', 'element', 'hit', 'reaction'].includes(facet)) {
    proof.local = details.branches.length > 0 && details.branches.every(row => Number.isFinite(row.result?.non_critical) && row.result.non_critical !== 0);
  }
  if (side === 'leyline' && (facet === 'formula' || facet === 'hit') && item.subject?.endsWith('hit')) {
    const c = item.evidence?.comparison;
    proof.local = item.evidence?.status === 'available' && item.evidence.refs?.length > 0
      && compare(c?.value, c?.expected, Math.max(1e-8, Math.abs(c?.expected) * 1e-6));
    proof.failed = Number.isFinite(c?.value) && Number.isFinite(c?.expected) && !proof.local;
  }
  if (facet === 'attribute' || facet === 'condition') {
    proof.local = side === 'mona' && details.probes.some(p => p.behaviorEvidence?.some(e =>
      e.side === side && e.source && e.recipient && Number.isFinite(e.enabled) && Object.hasOwn(e, 'before')
      && e.before === e.disabled && e.enabled !== e.disabled && e.disabledProbeId));
    proof.failed = evidence.run === '执行失败';
  }
  const matchedCommonInputs = new Set();
  const curveMatches = new Set();
  for (const { batch, record } of details.batches) {
    if (facet === 'curve' && ['commonInputs', 'commonInputsC6'].includes(batch)) {
      const target = report.leyline.find(row => row.id === record.leyline);
      if (target && reviewedNormalCurve(record, target)) {
        curveMatches.add(record.constellation);
        matchedCommonInputs.add(record.mona);
      }
    }
    if (facet === 'scaling' && ['commonInputs', 'commonInputsC6'].includes(batch) && record.leyline === item.id && observedAttackScaling(item, record)) {
      proof.local = true;
      matchedCommonInputs.add(item.id);
    }
    if (['commonInputs', 'commonInputsC6'].includes(batch) && ['formula', 'hit', 'element'].includes(facet)) {
      const matched = record.status === 'matched' && record.cases?.length >= 3 && record.cases.every(c =>
        c.element && !c.requiredInputs?.length && compare(c.mona, c.leyline, c.tolerance)
        && compare(c.effectiveAttack?.mona, c.effectiveAttack?.leyline, 1e-7));
      // Each sample exercises one observed configuration. The talent curve and
      // other branches need their own evidence.
      proof.local ||= Boolean(matched);
      if (matched) matchedCommonInputs.add(record[side]);
      proof.difference ||= record.cases.some(c => Number.isFinite(c.mona) && Number.isFinite(c.leyline) && !compare(c.mona, c.leyline, c.tolerance));
    }
    const observation = record.behaviorEvidence;
    if (observation?.source && observation.recipient && observation.attribute
      && [record.effectId, record.targetId, ...(record.extraTargetIds ?? [])].includes(item.id)) {
      const validates = (reading, expected) => reading?.disabledCondition && compare(reading.before, reading.disabled, 1e-7)
        && Number.isFinite(expected) && expected !== 0 && compare(reading.enabled - reading.before, expected, 1e-7);
      const monaValid = validates(observation.mona, record.monaExpected), leylineValid = validates(observation.leyline, record.amount);
      const valid = side === 'mona' ? monaValid : leylineValid;
      if (facet === 'attribute' || facet === 'condition') {
        proof.local ||= Boolean(valid);
        proof.failed ||= !valid;
        // For ATK/DEF percentages Mona returns panel points. Only convert when the
        // same recipient's run recorded the actual base used to scale those points.
        const scale = observation.monaBaseStat;
        const scaled = ['attackPercent', 'defensePercent', 'hpPercent'].includes(record.stat) && Number.isFinite(scale) && scale > 0
          && compare(record.amount * scale, record.monaExpected, 1e-6);
        const normalizedMona = Number.isFinite(record.monaDeltaNormalized) ? record.monaDeltaNormalized
          : scaled ? record.monaDelta / scale : record.monaDelta;
        if (scaled || Number.isFinite(record.monaDeltaNormalized) || Number.isFinite(record.amount) && record.monaExpected === record.amount) {
          const same = compare(normalizedMona, record.leylineDelta, 1e-6);
          proof.bilateral ||= Boolean(monaValid && leylineValid && (record.status === 'matched' && same || record.status === 'different'));
          proof.difference ||= !same && record.status !== 'different';
        }
      }
      if (facet === 'off-field' && observation.boundary) {
        const b = observation.boundary;
        const mona = compare(b.monaEnabled, b.monaBefore, 1e-7);
        const leyline = compare(b.leyline, record.leylineBefore, 1e-7);
        proof.local ||= Boolean(valid && (side === 'mona' ? mona : leyline));
        proof.bilateral ||= Boolean(monaValid && leylineValid && mona && leyline && record.status === 'matched');
        proof.difference ||= mona !== leyline;
      }
    }
  }
  if (facet === 'curve') {
    const complete = side === 'leyline' ? curveMatches.has(0) && curveMatches.has(6)
      : curveMatches.size > 0 && sourceIds.length > 0 && sourceIds.every(id => matchedCommonInputs.has(id));
    proof.local ||= complete;
    proof.bilateral ||= complete;
  }
  proof.bilateral ||= sourceIds.every(id => matchedCommonInputs.has(id));
  return proof;
}

function implementationFor(item, side, links, formal) {
  const bindings = side === 'leyline' ? [item] : links.flatMap(link => (link.leyline ?? []).map(ref => formal.get(keyOf(ref))).filter(Boolean));
  const implemented = bindings.some(({ binding }) => {
    if (!binding?.hitId) return Boolean(binding);
    // assembleCharacter uses an ordinary output by default. The support profile
    // certifies a query scope separately from the authored damage invocation.
    const definition = binding.definition;
    if (!definition?.base) return false;
    const family = binding.family ?? definition.family ?? 'ordinary';
    return typeof family === 'string' ? family !== 'unresolved'
      : Object.values(family.cases).some(value => value !== 'unresolved');
  });
  if (implemented) return 'bound';
  if (bindings.some(row => row.binding?.hitId) || links.some(link => link.disposition === 'mona-only')) return 'implementation';
  return 'binding';
}

export function buildBehaviorLedger(report, inventory = buildInventory(report), evidenceFor = buildEvidence(report)) {
  const behaviors = [], assignments = new Map(), seen = new Set(), product = {};
  const formal = new Map(report.leyline.map(item => [item.id, item]));
  const menus = new Map(report.mona.filter(item => item.kind === 'skill').map(item => [item.character.toLowerCase() + ':' + item.index, item.id]));
  const attribution = new Map(classifyMonaDifferences(report.links, report.batches?.ordinarySourceDifferences, report.transformative, report.leyline).map(item => [item.id, item]));
  const ownerCounts = {};
  for (const row of inventory) {
    const grouped = new Map();
    for (const item of row.source) {
      const scope = sourceScope(item, row.category);
      if (item.kind === 'action') scope.owner = menus.get(item.key.split('.')[0] + ':' + item.value?.index) ?? scope.owner;
      if (assignments.has(item.id)) throw new Error('来源编号重复 ' + item.id);
      assignments.set(item.id, scope);
      if (row.side === 'leyline' && item.binding && scope.role === 'behavior') {
        const bound = implementationFor(item, row.side, [], formal) === 'bound';
        const { modifiers, ...grant } = item.binding.buff ?? {};
        const definition = item.binding.modifier ? { grant, modifier: item.binding.modifier,
          ...(item.binding.categoryStacks && { categoryStacks: item.binding.categoryStacks.map(entry => entry.rule) }) } :
          item.binding.definition ?? item.binding;
        const signature = createHash('sha256').update(JSON.stringify(definition)).digest('hex');
        product[semanticId(item, row.id)] = { bound, signature, rowId: row.id, source: row.sourcePath, name: row.name, run: false };
      }
      const countKey = row.side + '/' + scope.role;
      ownerCounts[countKey] = (ownerCounts[countKey] ?? 0) + 1;
      for (const branch of conditionalBranches(item)) {
        const id = [semanticId(item, row.id), branch.category, branch.facet, branch.key].join('|');
        grouped.set(id, { item, facet: branch.facet, category: branch.category, sourceIds: [item.id], condition: branch.condition });
      }
      // Equivalent observations of one branch share a behavior, but their mappings
      // and run evidence are checked across every observed configuration below.
      for (const category of scope.categories ?? []) {
        const identity = semanticId(item, row.id);
        const facets = declaredFacets(item, category);
        for (const facet of facets) {
          const id = [identity, category, facet].join('|');
          if (!grouped.has(id)) grouped.set(id, { item, facet, category, sourceIds: [] });
          grouped.get(id).sourceIds.push(item.id);
        }
      }
    }
    const scopes = new Map();
    for (const [id, { item, facet, category, sourceIds, condition }] of grouped) {
      if (seen.has(id)) throw new Error('行为编号重复 ' + id);
      seen.add(id);
      const gaps = [];
      if (facet === 'scope') {
        gaps.push('scope');
        if (item.id.startsWith('mona:open:probe:')) gaps.push('failed');
      }
      else {
        const scopeKey = sourceIds.join('\n');
        let evidence = scopes.get(scopeKey);
        if (!evidence) {
          evidence = evidenceFor({ ...row, sourceIds });
          scopes.set(scopeKey, evidence);
        }
        const links = evidence.links;
        const linked = new Set(links.flatMap(link => link[row.side].map(keyOf)));
        if (sourceIds.some(source => !linked.has(source))) gaps.push('mapping');
        const proof = evidenceForFacet(item, facet, row.side, evidence, report, links, sourceIds, attribution);
        const binding = implementationFor(item, row.side, links, formal);
        if (binding !== 'bound') gaps.push(binding);
        const formalItem = row.side === 'leyline' && product[semanticId(item, row.id)];
        if (formalItem?.bound && proof.local && !proof.failed && (facet === 'formula' || facet === 'attribute')) {
          formalItem.run = true;
        }
        const exclusive = links.length && links.every(link => link.disposition === row.side + '-only' && link.sources?.length && link.explanation);
        if (proof.failed) gaps.push('failed');
        else if (!proof.local) gaps.push('unverified');
        if (proof.difference || links.some(link => link.disposition === 'different' && attribution.get(link.id)?.status !== 'attributed')) gaps.push('difference');
        if (!proof.bilateral && !exclusive) gaps.push('comparison');
      }
      behaviors.push({ id, rowId: row.id, side: row.side, category, facet, gaps, source: row.sourcePath,
        ...(condition ? { reason: condition } : {}),
        ...(sourceIds.length === 1 && sourceIds[0] === row.id ? {} : { sourceIds }),
        ...(facet === 'scope' ? { reason: assignments.get(item.id).reason } : {}) });
    }
  }
  const total = report.mona.length + report.leyline.length;
  if (assignments.size !== total) throw new Error('来源归属不完整');
  const versions = { mona: report.provenance?.mona ?? report.baselines?.mona, leyline: report.provenance?.leyline ?? null,
    worktree: report.provenance?.worktree ?? null };
  return { schema: 1, versions, behaviors, product, ownerCounts, assignments, attribution, issues: report.gaps?.issues ?? [],
    sourceReady: Boolean(versions.mona && versions.leyline && report.mona.length && report.leyline.length) };
}

// A rewritten value expression changes the hash, even if the same buff still modifies
// exactly one copy of the same attribute. Multiple modifiers of that attribute remain distinct.
function uniqueModifierIds(ids) {
  const byTarget = new Map();
  for (const id of ids) {
    const match = /^([^:]+:[^:]+:[^:]+:attribute\.[^:]+):[0-9a-f]{16}:\d+$/.exec(id);
    if (match) byTarget.set(match[1], byTarget.has(match[1]) ? null : id);
  }
  return byTarget;
}

/** Carry a missing declaration forward until it returns or its scope is explicitly resolved. */
export function reconcileBehaviors(current, previous = null) {
  if (previous && (current.schema !== previous.schema || current.versions.mona !== previous.versions.mona)) {
    throw new Error('行为台账的版本或 Mona 来源不同，无法计算本批变化');
  }
  const old = new Map(previous?.behaviors.map(item => [item.id, item]));
  const aliases = new Map();
  if (previous?.product) {
    const priorIds = new Set(Object.keys(previous.product));
    for (const behavior of previous.behaviors) {
      if (behavior.side === 'leyline' && behavior.category === 'buff') priorIds.add(behavior.id.split('|', 1)[0]);
    }
    const priorTargets = uniqueModifierIds(priorIds);
    for (const [target, id] of uniqueModifierIds(Object.keys(current.product))) {
      const prior = priorTargets.get(target);
      if (id && prior && id !== prior) aliases.set(id, prior);
    }
  }
  const product = Object.fromEntries(Object.entries(current.product).map(([id, value]) => [aliases.get(id) ?? id, value]));
  const now = new Map(current.behaviors.map(item => {
    const separator = item.id.indexOf('|');
    const prior = aliases.get(item.id.slice(0, separator));
    const id = prior ? prior + item.id.slice(separator) : item.id;
    return [id, prior ? { ...item, id } : item];
  }));
  for (const [id, item] of old) {
    if (now.has(id)) continue;
    const owners = (item.sourceIds ?? [item.rowId]).map(id => current.assignments.get(id));
    const resolvedScope = owners.length && owners.every(scope => scope?.role === 'excluded' ||
      item.facet === 'scope' && scope?.role === 'behavior');
    now.set(id, { ...item, gaps: resolvedScope ? [] : [...new Set([...item.gaps, 'absent'])],
      ...(resolvedScope ? { reason: owners.map(s => s.reason ?? '已确定来源范围').join('、') } : {}) });
  }
  const emptyCounts = () => Object.fromEntries(['mona', 'leyline'].flatMap(side => ['damage', 'buff', 'unknown'].map(category =>
    [side + '/' + category, { total: 0, opening: 0, discovered: 0, reopened: 0, closed: 0, ending: 0 }])));
  const totals = emptyCounts();
  const batches = new Map();
  for (const item of now.values()) {
    const key = item.side + '/' + item.category;
    if (!batches.has(item.facet)) batches.set(item.facet, { facet: item.facet, behaviors: 0, rows: new Set(), blockers: {}, totals: emptyCounts() });
    const batch = batches.get(item.facet);
    const prior = old.get(item.id);
    const wasOpen = prior?.gaps.length > 0, open = item.gaps.length > 0;
    const transition = open ? (!prior ? 'discovered' : wasOpen ? 'pending' : 'reopened') : wasOpen ? 'closed' : 'verified';
    now.set(item.id, { ...item, transition });
    for (const stats of [totals[key], batch.totals[key]]) {
      stats.total++;
      if (wasOpen) stats.opening++;
      if (open) stats.ending++;
      if (['discovered', 'closed', 'reopened'].includes(transition)) stats[transition]++;
    }
    if (open) {
      batch.behaviors++;
      batch.rows.add(item.rowId);
      for (const gap of item.gaps) batch.blockers[gap] = (batch.blockers[gap] ?? 0) + 1;
    }
  }
  for (const stats of [totals, ...[...batches.values()].map(b => b.totals)].flatMap(Object.values)) {
    if (stats.ending !== stats.opening + stats.discovered + stats.reopened - stats.closed) throw new Error('行为缺口收支不符');
  }
  const productChanges = previous?.product ? Object.entries(product).filter(([key, b]) => b.bound && b.run &&
    (!previous.product[key] || (previous.product[key].signature && previous.product[key].signature !== b.signature)))
    .map(([key, b]) => ({ id: key, rowId: b.rowId, source: b.source, name: b.name })) : [];
  return { schema: current.schema, versions: current.versions, behaviors: [...now.values()], ownerCounts: current.ownerCounts,
    product, productChanges,
    baseline: previous?.versions ?? null, totals, batches: [...batches.values()].map(b => ({ ...b, rows: b.rows.size })),
    complete: current.sourceReady && current.behaviors.length > 0 && !current.issues.length && [...now.values()].every(item => !item.gaps.length) };
}
