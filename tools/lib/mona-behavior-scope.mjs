import { createHash } from 'node:crypto';

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
