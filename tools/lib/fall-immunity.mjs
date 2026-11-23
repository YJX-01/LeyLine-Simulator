import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, novice, number } from './roster-audit-settings.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/talents/';
const weaponPath = 'tools/data/sources/catalog/genshin-db/weapons.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const names = { iansan: '伊安珊', varesa: '瓦雷莎' };
export const fallImmunityIds = Object.keys(names);
const clause = '/passives/2';
const field = clause + '/buffs/0/modifiers/0';
const fall = 'attribute.fallDamageReduction';
const incoming = 'attribute.incomingDamageReduction';
const enemy = 'target.ordinaryDamageReduction';
const enemyReduction = 0.15;
const owner = 'actor', peer = 'peer';
const flag = value => value === null ? fact(null) : bool(value);
const probes = [
  ['符合全部条件', {}, 1],
  ['离开纳塔燃素区', { area: false }, 0],
  ['飞跃中受到普通攻击', { fallDamage: false }, 0],
  ['坠落来自另一种移动', { ownLeap: false }, 0],
  ['来源是另一角色的飞跃', { ownLeap: false, otherLeap: true }, 0],
  ['本人未在场', { onField: false }, 0],
  ['场上队友坠落', { recipient: peer, onField: false }, 0],
  ['本人在场状态未知时，队友仍不获免伤', { recipient: peer, onField: null }, 0],
  ['纳塔燃素区未知', { area: null }, null],
  ['来伤类别未知', { fallDamage: null }, null],
  ['飞跃来源未知', { ownLeap: null }, null],
  ['本人是否在场未知', { onField: null }, null],
  ['本次未记录飞跃，上一事件已记录', { ownLeap: undefined }, null],
  ['普通来伤时无需飞跃来源', { fallDamage: false, ownLeap: null }, 0],
  ['本人主动下落攻击', { fallDamage: false, outgoingPlunge: true }, 0],
];
const bindings = Object.fromEntries([fall, incoming, enemy].map(id => [id, {
  ...id === enemy ? { kind: 'enemy' } : { kind: 'attribute', actor: { role: 'recipient' } },
  key: { namespace: 'builtin', id, revision: '1' },
  at: { kind: 'current', phase: 'same' },
}]));

export function auditFallImmunity(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peerCharacter = characters.get('noelle'), peerWeapon = weapons.get('serpentspine');
  const weaponSource = read(weaponPath).serpentspine.metadata.r1.description;
  const peerIncoming = -Number(weaponSource.match(/([\d.]+)%受到的伤害/)?.[1]) / 100;
  if (!Number.isFinite(peerIncoming)) throw new Error('螭骨剑固定资料缺少精一受到的伤害修正。');
  const starter = character => weapons.get(novice[character?.identity.weaponType]);

  for (const entity of fallImmunityIds) {
    const character = characters.get(entity);
    if (!starter(character) || !peerCharacter || !peerWeapon) continue;
    const path = sourceRoot + entity + '.json', anchor = 'passive3';
    const sources = [path + '#' + anchor];
    const source = read(path)[anchor].description;
    const name = names[entity];
    const sentence = '在纳塔存在燃素机制的区域时，' + name + '利用地形差进行飞跃时，不会承受坠落伤害。';
    if (!source.includes(sentence)) throw new Error(entity + ' 的固定资料缺少地形飞跃免伤条款。');
    const prepared = engine.prepareStructuredBuilds([
      { id: owner, build: auditBuild(character, starter(character)) },
      { id: peer, build: auditBuild(peerCharacter, peerWeapon) },
    ]);
    if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
    const { team } = prepared, first = rows.length;
    const effect = entity + '.a3.terrain-leap-immunity';
    const declaration = character.metadata.passives[2]?.buffs?.[0];
    const declaredAtField = declaration?.id === effect && declaration.modifiers[0]?.target === fall;
    const ownLeapKey = entity + '.terrainLeapCausedFall';
    const otherLeapKey = fallImmunityIds.find(id => id !== entity) + '.terrainLeapCausedFall';
    const talent = character.talents[0], hit = talent.hits.find(hit => hit.category === 'plunge');

    for (const [label, overrides, fallExpected] of probes) {
      const probe = { recipient: owner, onField: true, area: true, fallDamage: true, ownLeap: true,
        otherLeap: false, outgoingPlunge: false, ...overrides, label };
      const { recipient } = probe;
      const { setup, request } = auditHit(character, talent, hit);
      const current = setup.events.find(event => event.id === request.frame.eventId);
      const eventFacts = { incomingFallDamage: flag(probe.fallDamage), [otherLeapKey]: bool(probe.otherLeap) };
      if (probe.ownLeap !== undefined) eventFacts[ownLeapKey] = flag(probe.ownLeap);
      setup.team.facts.natlanPhlogistonArea = flag(probe.area);
      setup.targets[0].inputs.ordinaryDamageReduction = number('scalar', enemyReduction);
      setup.events = [
        { id: 'previous', kind: 'state-change', actorId: owner, targetIds: [], timeMs: 0, order: 0, sourceEventIds: [],
          facts: { incomingFallDamage: bool(true), [ownLeapKey]: bool(true) } },
        probe.outgoingPlunge ? { ...current, facts: eventFacts }
          : { id: current.id, kind: 'state-change', actorId: recipient, targetIds: [], timeMs: current.timeMs, order: current.order,
              sourceEventIds: [], facts: eventFacts },
      ];
      const context = engine.createStructuredCombatContext(team, setup);
      const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, captures: {},
        hit: probe.outgoingPlunge
          ? { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin, element: hit.element, reactionId: null }
          : null,
        factOverrides: [{ subject: { kind: 'actor', id: owner }, facts: { onField: flag(probe.onField) } },
          { subject: { kind: 'actor', id: peer }, facts: {
              onField: bool(recipient === peer), 'serpentspine.waveLayers': number('count', 1),
            } }],
      };
      const result = engine.evaluateCombatBindings(team.program, context, bindings, frame);
      const contribution = result.trace.find(node => node.kind === 'effect' && node.definition.id === effect
        && node.context?.eventId === current.id && node.context.actorId === owner && node.context.recipientId === owner);
      for (const [output, expected] of [[fall, fallExpected], [incoming, recipient === peer ? peerIncoming : 0], [enemy, enemyReduction]]) {
        const datum = result.outputs[output], status = datum?.state ?? 'missing';
        const expectedStatus = expected === null ? 'unknown' : 'known';
        const value = status === 'known' && datum.value.kind === 'quantity' && datum.value.unit === 'scalar' ? datum.value.value : null;
        const correctEffect = output !== fall || (expected === 0 ? !contribution : contribution?.state === expectedStatus);
        const matches = declaredAtField && correctEffect && status === expectedStatus && value === expected;
        rows.push({ entity, clause, field, output, effect, probe,
          sources: output === incoming && recipient === peer ? [...sources, weaponPath + '#serpentspine/metadata/r1'] : sources,
          expected, expectedStatus, value, status,
          ...matches ? {} : { issue: '飞跃坠落免伤、来伤方向或受益人不符', diagnostics: result.diagnostics } });
      }
    }

    if (rows.slice(first).every(row => !row.issue)) {
      verified.add(entity + field);
      const remaining = '仍需识别地形飞跃和坠落来源，以及记录夜魂传递、燃素消耗和持续状态。';
      resolved.push({ entity, field: clause, resolved: '给定纳塔燃素区、本角色站场及其地形飞跃造成的本次坠落伤害时，核验自身全额坠落伤害减免。', remaining });
      gaps.push({ entity, field: clause, kind: '历史与特殊交互', sources, needed: remaining, reason: remaining });
    }
  }
  return { rows, verified, resolved, gaps, summary: { fallImmunityCases: rows.length,
    fallImmunityMismatches: rows.filter(row => row.issue).length, verifiedFallImmunity: verified.size } };
}
