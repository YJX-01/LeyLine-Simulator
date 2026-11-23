import { auditBuild, auditHit } from './roster-audit-settings.mjs';

const ref = id => ({ id, namespace: 'builtin', revision: '1' });
const explicit = value => ({ value, provenance: 'explicit', sourceRefs: [] });
const flag = value => explicit({ kind: 'boolean', value });
const quantity = (unit, value) => explicit({ kind: 'quantity', unit, value });
const elements = ['anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'];

export function auditCurrentScene(definition, source, entities, engine) {
  if (!source || !definition?.facts || !definition.id.startsWith('scene.field.')) return;
  const { text, entity, field } = source;
  const sourcePercent = match => Number(text.match(match)?.[1] + 'e-2');
  const rows = [];
  const members = [
    { id: 'actor', build: auditBuild(entities.characters.find(character => character.id === 'kaeya'), entities.weapons.find(weapon => weapon.id === 'dullblade')) },
    { id: 'peer', build: auditBuild(entities.characters.find(character => character.id === 'lisa'), entities.weapons.find(weapon => weapon.id === 'apprenticesnotes')) },
  ];
  const startMs = 100, endMs = 25000;
  const prepared = engine.prepareStructuredBuilds(members, [], [{ definition, startMs, endMs }]);
  if (!prepared.ok) return { rows, gaps: [{ entity, field, diagnostics: prepared.diagnostics, issue: '场景当次条件无法编译' }] };
  const character = members[0].build.character, talent = character.talents[0];
  function read(target, expected, input, { recipient = 'actor', category = 'skill', timeMs = startMs, onField = true } = {}) {
    const { setup, request } = auditHit(character, talent, talent.hits[0]);
    setup.events[0].timeMs = timeMs;
    const owner = { kind: 'actor', id: recipient };
    const facts = input.subject.kind === 'actor' && input.subject.id === recipient
      ? [{ subject: owner, facts: { ...input.facts, onField: flag(onField) } }]
      : [input, { subject: owner, facts: { onField: flag(onField) } }];
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, factOverrides: facts,
      hit: { skillId: talent.id, hitId: talent.hits[0].id, category, element: 'cryo', family: 'ordinary', origin: 'talent', reactionId: null } };
    const context = engine.createStructuredCombatContext(prepared.team, setup);
    const binding = { ...target.startsWith('target.') ? { kind: 'enemy' } : { kind: 'attribute', actor: { role: 'recipient' } },
      key: ref(target), at: { kind: 'current', phase: 'same' } };
    const result = engine.evaluateCombatBindings(prepared.team.program, context, { result: binding }, frame).outputs.result;
    const value = result?.state === 'known' ? result.value.value : null;
    rows.push({ entity, field, recipient, target, category, timeMs, onField, input: input.facts, expected, value,
      ...Number.isFinite(value) && Math.abs(value - expected) <= 1e-9 ? {} : { issue: '场景当次属性贡献与来源算式不符' } });
  }
  if (text.startsWith('敌人处于原激化状态下时')) {
    const amount = sourcePercent(/所有元素抗性降低(\d+)%/);
    for (const element of [...elements, 'physical']) for (const active of [true, false]) for (const timeMs of [99, 100, 24999, 25000]) {
      const input = { subject: { kind: 'target', id: 'enemy' }, facts: { [entity + '.quickenShredActive']: flag(active) } };
      read('target.resistance.' + element, 0.1 - (active && element !== 'physical' && timeMs >= startMs && timeMs < endMs ? amount : 0), input, { timeMs });
    }
  } else if (text.startsWith('队伍中所有角色的元素精通提高')) {
    const amount = sourcePercent(/元素精通总和的(\d+)%/);
    for (const recipient of ['actor', 'peer']) for (const timeMs of [99, 100, 20099, 20100, 25000]) {
      // Explicit sampled totals exercise a refresh boundary. The queue supplies the current snapshot.
      const mastery = timeMs < 20100 ? 200 : 300;
      const input = { subject: { kind: 'team' }, facts: { [entity + '.masterySumAtRefresh']: quantity('elementalMastery', mastery) } };
      read('attribute.elementalMastery', timeMs >= startMs && timeMs < endMs ? mastery * amount : 0, input, { recipient, timeMs });
    }
  } else {
    const clause = text.startsWith('当前场上角色的普通攻击或重击命中敌人后') ? { target: 'attribute.damageBonus', categories: ['charged', 'skill'], onField: true }
      : text.startsWith('角色的当前生命值提升或降低时') ? { target: 'attribute.damageBonus', categories: ['normal', 'charged', 'plunge'], onField: true }
      : text.startsWith('造成元素伤害后的10秒内') ? { target: 'attribute.damageBonus', team: true }
      : text.includes('「晶体赋能」状态') ? { target: 'attribute.attackPercent', team: true, onField: true }
      : text.includes('将获得10%水元素伤害加成') ? { target: 'attribute.hydroBonus', team: true }
      : undefined;
    if (!clause) return;
    const amount = sourcePercent(/(?:提高|提升|将获得)(\d+)%/);
    const limit = Number(text.match(/至多叠加(\d+)[层次]/)?.[1]);
    for (const recipient of ['actor', 'peer']) for (const category of ['normal', 'charged', 'plunge', 'skill', 'burst']) {
      for (const [timeMs, layers, onField] of [[99,1,true], [100,0,true], [100,1,true], [100,limit,true], [101,1,false], [25000,limit,true]]) {
        const subject = clause.team ? { kind: 'team' } : { kind: 'actor', id: recipient };
        const input = { subject, facts: { [entity + '.activeLayers']: quantity('count', layers) } };
        const active = timeMs >= startMs && timeMs < endMs && (!clause.categories || clause.categories.includes(category)) && (!clause.onField || onField);
        read(clause.target, active ? amount * layers : 0, input, { recipient, category, timeMs, onField });
      }
    }
  }
  return { rows, gaps: rows.filter(row => row.issue) };
}
