import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, number } from './roster-audit-settings.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const sourcePath = (group, id) => sourceRoot + 'ChineseSimplified/' + group + '/' + id + '.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const ratesPath = sourceRoot + 'stats/talents.json';
const weaponsPath = 'tools/data/sources/catalog/genshin-db/weapons.json';
const percent = (text, pattern) => Number(text.match(pattern)?.[1] + 'e-2');
const ref = id => ({ namespace: 'builtin', id, revision: '1' });
const at = { kind: 'current', phase: 'same' };
const incoming = 'attribute.incomingDamageReduction';
const attack = 'target.attackReduction';
const ordinary = 'target.ordinaryDamageReduction';
const actor = id => ({ kind: 'actor', id });
const target = id => ({ kind: 'target', id });

/** Compares explicit current-hit settings with fixed source values. */
export function auditIncomingCurrentFacts(entities, engine) {
  const rows = [], verified = new Set();
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const peer = characters.get('kaeya');
  const starter = character => weapons.get(novice[character.identity.weaponType]);
  if (!peer || !starter(peer)) return { rows, verified, summary: { incomingCurrentCases: 0, incomingCurrentMismatches: 0, verifiedIncomingClauses: 0 } };

  function prepare(character, settings, weapon = starter(character)) {
    const build = { ...auditBuild(character, weapon), ...settings };
    const party = [{ id: 'actor', build }, { id: 'peer', build: auditBuild(peer, starter(peer)) }];
    const prepared = engine.prepareStructuredBuilds(party);
    if (!prepared.ok) throw new Error(character.id + ': ' + JSON.stringify(prepared.diagnostics));
    return { team: prepared.team, character };
  }

  function measure({ team, character }, { recipient = 'actor', factOverrides = [], targetId = 'enemy', hydroBonus }, ids) {
    const dealer = recipient === 'actor' ? character : peer;
    const talent = dealer.talents[0], hit = talent.hits[0];
    const { setup, request } = auditHit(dealer, talent, hit);
    setup.targets.push({ ...setup.targets[0], id: 'other' });
    setup.events[0].actorId = recipient;
    setup.events[0].targetIds = [targetId];
    const context = engine.createStructuredCombatContext(team, setup);
    if (hydroBonus !== undefined) context.actors.find(member => member.id === 'actor').inputs.hydroBonus = number('scalar', hydroBonus);
    const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null, targetId, factOverrides,
      hit: { skillId: talent.id, hitId: hit.id, category: hit.category, family: 'ordinary', origin: hit.origin, element: hit.element, reactionId: null } };
    const bindings = Object.fromEntries(ids.map(id => [id, { ...id.startsWith('target.') ? { kind: 'enemy' }
      : { kind: 'attribute', actor: { role: 'recipient' } }, key: ref(id), at }]));
    return engine.evaluateCombatBindings(team.program, context, bindings, frame);
  }

  function clause(entity, field, sources, run) {
    const start = rows.length;
    const check = (team, probe, expected, inputs) => {
      const result = measure(team, inputs, Object.keys(expected));
      for (const [attribute, wanted] of Object.entries(expected)) {
        const output = result.outputs[attribute];
        const value = output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
        const matches = Number.isFinite(value) && Number.isFinite(wanted) && Math.abs(value - wanted) < 1e-9;
        rows.push({ entity, field, sources, attribute, ...probe, expected: wanted, value,
          ...matches ? {} : { issue: '当次受击方向的属性与来源算式不符', diagnostics: result.diagnostics } });
      }
    };
    run(check);
    if (rows.length > start && rows.slice(start).every(row => !row.issue)) verified.add(entity + field);
  }

  for (const [id, sourceId, rank, key, shared] of [
    ['jean', 'jean', 6, 'jean.lionsFangActive', true],
    ['aether-anemo', 'traveleranemo', 4, 'aether-anemo.palmVortexActive', false],
    ['lumine-anemo', 'traveleranemo', 4, 'lumine-anemo.palmVortexActive', false],
  ]) {
    const character = characters.get(id);
    if (!character || !starter(character)) continue;
    const path = sourcePath('constellations', sourceId), entry = 'c' + rank;
    const reduction = percent(read(path)[entry].description, /受到的伤害降低(\d+)%/);
    clause(id, '/constellations/' + (rank - 1), [path + '#' + entry], check => {
      for (const constellation of [rank - 1, rank]) {
        const team = prepare(character, { constellation });
        for (const recipient of ['actor', 'peer']) for (const active of [false, true]) {
          const factOverrides = ['actor', 'peer'].map(memberId => ({ subject: actor(memberId), facts: {
            [key]: bool(shared ? (memberId === recipient) === active : memberId === 'actor' && active),
          } }));
          check(team, { constellation, recipient, active }, {
            [incoming]: constellation === rank && active && (shared || recipient === 'actor') ? reduction : 0, [ordinary]: 0,
          }, { recipient, factOverrides });
        }
      }
    });
  }

  const diona = characters.get('diona');
  if (diona && starter(diona)) {
    const path = sourcePath('talents', 'diona');
    const reduction = percent(read(path).passive2.description, /攻击力降低(\d+)%/);
    clause(diona.id, '/passives/1', [path + '#passive2'], check => {
      for (const ascension of [3, 4]) {
        const team = prepare(diona, { ascension, level: ascension === 3 ? 50 : 60 });
        for (const recipient of ['actor', 'peer']) for (const active of [false, true]) for (const targetId of ['enemy', 'other']) {
          const factOverrides = [{ subject: target('enemy'), facts: { 'diona.drunkardsFarceActive': bool(active) } },
            { subject: target('other'), facts: { 'diona.drunkardsFarceActive': bool(false) } }];
          check(team, { ascension, recipient, active, targetId }, { [attack]: ascension === 4 && active && targetId === 'enemy' ? reduction : 0,
            [ordinary]: 0 }, { recipient, targetId, factOverrides });
        }
      }
    });
  }

  const aloy = characters.get('aloy');
  if (aloy && starter(aloy)) {
    const path = sourcePath('talents', 'aloy'), source = read(path).combat2.attributes.labels;
    const parameter = source.find(label => label.startsWith('攻击力降低|'))?.match(/\{(param\d+):P\}/)?.[1];
    const reductions = read(ratesPath).aloy.combat2[parameter];
    clause(aloy.id, '/talents/1/details/2', [path + '#combat2', ratesPath + '#aloy/combat2/' + parameter], check => {
      for (const skill of [1, 10]) {
        const team = prepare(aloy, skill === 1 ? {} : { level: 80, ascension: 6, talents: { normal: 1, skill, burst: 1 } });
        for (const recipient of ['actor', 'peer']) for (const active of [false, true]) for (const targetId of ['enemy', 'other']) {
          const factOverrides = [{ subject: target('enemy'), facts: { 'aloy.frozenWildsAttackReduction': bool(active) } },
            { subject: target('other'), facts: { 'aloy.frozenWildsAttackReduction': bool(false) } }];
          check(team, { skill, recipient, active, targetId }, { [attack]: active && targetId === 'enemy' ? reductions?.[skill - 1] : 0,
            [ordinary]: 0 }, { recipient, targetId, factOverrides });
        }
      }
    });
  }

  const xingqiu = characters.get('xingqiu');
  if (xingqiu && starter(xingqiu)) {
    const path = sourcePath('talents', 'xingqiu'), source = read(path);
    const parameter = source.combat2.attributes.labels.find(label => label.startsWith('减伤比例|'))?.match(/\{(param\d+):P\}/)?.[1];
    const reductions = read(ratesPath).xingqiu.combat2[parameter];
    const rate = percent(source.combat2.description, /水元素伤害加成的(\d+)%将转换/);
    const cap = percent(source.combat2.description, /获得(\d+)%额外伤害减免/);
    const passive = percent(source.passive2.description, /获得(\d+)%水元素伤害加成/);
    const sources = [path + '#combat2', path + '#passive2', ratesPath + '#xingqiu/combat2/' + parameter];
    clause(xingqiu.id, '/talents/1/details/1', sources, check => {
      for (const [ascension, constellation, skill, talentLevel] of [[0, 0, 1, 1], [6, 4, 10, 10], [6, 5, 4, 7], [6, 5, 10, 13]]) {
        const team = prepare(xingqiu, { level: ascension === 0 ? 1 : 80, ascension, constellation, talents: { normal: 1, skill, burst: 1 } });
        const passiveBonus = ascension >= 4 ? passive : 0;
        const threshold = cap / rate - passiveBonus;
        // Probe the hydro attribute independently at both sides of the fixed conversion cap.
        for (const hydroBonus of [0, threshold - .01, threshold, threshold + .01]) for (const recipient of ['actor', 'peer']) {
          for (const [active, onField] of [[false, true], [true, false], [true, true]]) {
            const factOverrides = [{ subject: actor('actor'), facts: { 'xingqiu.rainSwordActive': bool(active), onField: bool(recipient === 'actor' ? onField : !onField) } },
              { subject: actor('peer'), facts: { onField: bool(recipient === 'peer' ? onField : !onField) } }];
            const expected = active && onField ? reductions?.[talentLevel - 1] + Math.min(cap, (hydroBonus + passiveBonus) * rate) : 0;
            check(team, { ascension, constellation, skill, talentLevel, recipient, hydroBonus, active, onField },
              { [incoming]: expected, [ordinary]: 0 }, { recipient, hydroBonus, factOverrides });
          }
        }
      }
    });
  }

  const noelle = characters.get('noelle'), serpent = weapons.get('serpentspine');
  if (noelle && serpent) {
    const source = read(weaponsPath).serpentspine.metadata;
    clause(serpent.id, '/buffs', [weaponsPath + '#serpentspine'], check => {
      for (let refinement = 1; refinement <= serpent.maxRefinement; refinement++) {
        const team = prepare(noelle, { refinement }, serpent), description = source['r' + refinement].description;
        const dealt = percent(description, /提升([\d.]+)%造成的伤害/);
        const received = percent(description, /造成的伤害，([\d.]+)%受到的伤害/);
        const cap = Number(description.match(/最多叠加(\d+)层/)?.[1]);
        for (const recipient of ['actor', 'peer']) for (const onField of [false, true]) for (const layers of [0, 1, cap - 1, cap]) {
          const factOverrides = [{ subject: actor('actor'), facts: { 'serpentspine.waveLayers': number('count', layers), onField: bool(onField) } },
            { subject: actor('peer'), facts: { onField: bool(!onField) } }];
          check(team, { refinement, recipient, layers, onField }, { [incoming]: recipient === 'actor' ? -received * layers : 0,
            'attribute.damageBonus': recipient === 'actor' ? dealt * layers : 0 }, { recipient, factOverrides });
        }
      }
    });
  }

  return { rows, verified, summary: { incomingCurrentCases: rows.length, incomingCurrentMismatches: rows.filter(row => row.issue).length,
    verifiedIncomingClauses: verified.size } };
}
