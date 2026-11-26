import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { auditBuild } from './roster-evaluation.mjs';

const read = name => readContentSource(new URL('../data/sources/catalog/genshin-db/' + name + '.json', import.meta.url));
const textExcerpts = readContentSource(new URL('../data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/text-excerpts.json', import.meta.url));
const characters = read('characters');
const weapons = read('weapons');
const curves = read('character-curves');
const starters = { WEAPON_SWORD_ONE_HAND: 'dullblade', WEAPON_CATALYST: 'apprenticesnotes', WEAPON_CLAYMORE: 'wastergreatsword',
  WEAPON_BOW: 'huntersbow', WEAPON_POLE: 'beginnersprotector' };
const stats = { '生命值上限': 'hp', '攻击力': 'attack', '防御力': 'defense', '元素精通': 'elementalMastery' };
const remainingDetails = new Set(['arlecchino.burst.1', 'barbara.skill.0', 'clorinde.skill.3', 'jahoda.burst.3', 'jahoda.burst.4',
  'sayu.burst.3', 'yumemizukimizuki.burst.2']);
// Recipient eligibility comes from the descriptions of these individual heal events.
const self = new Set(['gaming.burst.1', 'lynette.skill.3', 'sigewinne.skill.2','neuvillette.normal.6']);
const other = new Set(['sigewinne.skill.1']);
const onField = new Set(['baizhu.burst.2','barbara.skill.1','charlotte.burst.2','chevreuse.skill.3','diona.burst.2','dori.burst.1',
  'furina.skill.8','jean.burst.3','kukishinobu.skill.1','linnea.burst.1','mika.burst.1','qiqi.skill.2','sangonomiyakokomi.skill.0',
  'vodyanitsa.skill.4','xilonen.burst.1']);

/** Derive base healing independently from the descriptive formula and the captured talent parameter array. */
function amount(entity, slot, detail, weaponId, outgoing, incoming, level = 1, ascension = 0) {
  const term = detail.template.match(/\{(param\d+):[^}]*P\}(生命值上限|攻击力|防御力|元素精通)/)
    ?? (entity === 'lyney' && detail.template === '{param3:P}/层' ? [detail.template,'param3','生命值上限'] : null);
  if (!term) throw Error(entity + '/' + detail.template);
  const flat = detail.template.match(/\{(param\d+):(?:I|F1)\}/);
  const base = whiteStat(entity, stats[term[2]], weaponId, level, ascension);
  const values = characters[entity].talents['combat' + (slot + 1)];
  return (base * values[term[1]][0] + (flat ? values[flat[1]][0] : 0)) * (1 + outgoing + incoming);
}

function whiteStat(entity, stat, weaponId, level, ascension) {
  const character = characters[entity].stats, weapon = weapons[weaponId].stats;
  return stat === 'elementalMastery' ? (weapon.specialized === 'FIGHT_PROP_ELEMENT_MASTERY' ? weapon.base.specialized : 0)
    : character.base[stat] * curves[level][character.curve[stat]] + character.promotion[ascension][stat]
      + (stat === 'attack' ? weapon.base.attack + weapon.promotion[0].attack : 0);
}
const explicit = value => ({ value, provenance: 'explicit', sourceRefs: [] });
const flag = value => explicit(value === null ? null : { kind: 'boolean', value });
const ratio = value => explicit(value === null ? null : { kind: 'quantity', unit: 'scalar', value });
const byActor = (id, values) => ({ subject: { kind: 'actor', id }, values });
const byEvent = values => ({ subject: { kind: 'event' }, values });
const truth = value => value === true ? 'applied' : value === false ? 'excluded' : 'unknown';

function recoverySamples(id, healId, owner, recipient, active, hydro, constellation) {
  const same = owner === recipient;
  const sample = (applies, facts, coefficient = 1) => ({ status: truth(applies), facts, coefficient });
  if (id === 'arlecchino') return [0, .65, 1.45, 2, null].map(bond => sample(same ? bond === null ? null : true : false,
    [byEvent({ 'arlecchino.consumedBondRatio': ratio(bond) })], bond));
  if (id === 'barbara') return [true, false, null].map(loop => sample(loop,
    [byActor(owner, { 'barbara.melodyLoop': flag(loop) })], healId.endsWith('.charged-hit') ? 4 : 1));
  if (id === 'clorinde') {
    const high = healId.endsWith('.high-bond');
    return [[0,true], [.33,true], [.999,true], [1,true], [1.2,true], [2,true], [null,true], [1.2,false], [1.2,null]]
      .map(([bond, night]) => sample(!same || night === false || bond !== null && (high ? bond < 1 : bond <= 0 || bond >= 1) ? false
        : night === null || bond === null ? null : true, [byEvent({ 'clorinde.impaleBondRatio': ratio(bond) }),
        byActor(owner, { 'clorinde.nightVigil': flag(night) })], bond));
  }
  if (id === 'jahoda') {
    const empowered = healId.endsWith('-hydro');
    if (healId.includes('.active')) return [hydro, null].map(boost => sample(active === false || boost !== null && boost !== empowered ? false
      : active === null || boost === null ? null : true,
    [byEvent({ 'jahoda.coordinatorHydroBoost': flag(boost) })], empowered ? 1.2 : 1));
    return [[.699,true,hydro], [.7,true,hydro], [.701,true,hydro], [.8,false,hydro], [.8,null,hydro], [null,true,hydro], [.8,true,null]]
      .map(([hp, selected, boost]) => sample(selected === false || hp !== null && hp <= .7 || boost !== null && boost !== empowered ? false
        : hp === null || selected === null || boost === null ? null : true, [byEvent({
        'jahoda.coordinatorHydroBoost': flag(boost), 'jahoda.coordinatorActiveHpRatio': ratio(hp),
      }), byActor(recipient, { 'jahoda.coordinatorLowestHpRecipient': flag(selected) })], empowered ? 1.2 : 1));
  }
  if (id === 'sayu') {
    return [[.699,true,true], [.7,true,true], [.701,true,true], [.701,true,false], [.7,false,true], [null,true,true], [.701,true,null], [.6,null,true]]
      .map(([hp, selected, enemy]) => {
        const canHeal = constellation >= 1 || enemy === false || hp !== null && hp <= .7;
        return sample(active === false || selected === false || !canHeal && hp !== null && enemy === true ? false
          : active === null || selected === null || !canHeal ? null : true,
        [byEvent({ 'sayu.darumaEnemyNearby': flag(enemy) }), byActor(recipient, { 'sayu.darumaHealRecipient': flag(selected), hpRatio: ratio(hp) })]);
      });
  }
  const selfCollected = healId.endsWith('.snack-self');
  return [[.699,true], [.7,true], [.701,true], [.6,false], [null,true], [.6,null]]
    .map(([hp, picked]) => sample(selfCollected !== same || picked === false || hp !== null && hp > .7 ? false
      : picked === null || hp === null ? null : true,
    [byActor(recipient, { 'yumemizukimizuki.snackHealCollector': flag(picked), hpRatio: ratio(hp) })], selfCollected ? 2 : 1));
}

function recoveryAmount(id, slot, detail, healId, weaponId, outgoing, incoming, coefficient, level, ascension, source) {
  const sourceLabel = source['combat' + (slot + 1)].attributes.labels[detail].split('|')[1];
  const values = characters[id].talents['combat' + (slot + 1)];
  if (id === 'arlecchino' && sourceLabel === '{param3:F1P}生命之契+{param4:F1P}攻击力') {
    const hp = whiteStat(id, 'hp', weaponId, level, ascension), attack = whiteStat(id, 'attack', weaponId, level, ascension);
    return (hp * coefficient * values.param3[0] + attack * values.param4[0]) * (1 + outgoing + incoming);
  }
  if (id === 'clorinde' && sourceLabel === '0%/{param6:F1P}/{param8:F1P}生命之契') {
    const rate = healId.endsWith('.high-bond') ? values.param8[0] : values.param6[0];
    return whiteStat(id, 'hp', weaponId, level, ascension) * coefficient * rate * (1 + outgoing + incoming);
  }
  return amount(id, slot, { template: sourceLabel }, weaponId, outgoing, incoming, level, ascension) * coefficient;
}

export async function auditTalentHealing(catalog, engine, onCase, entities = catalog.inventory.characters) {
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addSkillAction, addTalentHeal, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const [maiden, doctor, clam] = await Promise.all(['maidenbeloved','travelingdoctor','oceanhuedclam'].map(id => catalog.get('sets', id)));
  const [peer, peerWeapon] = await Promise.all([catalog.get('characters','kaeya'),catalog.get('weapons','dullblade')]);
  const [hydroPeer, hydroPeerWeapon] = await Promise.all([catalog.get('characters','barbara'),catalog.get('weapons','apprenticesnotes')]);
  const equip = (character, weapon, set, pieces = 2) => ({ ...auditBuild(character, weapon, set ? [set] : []),
    ...(set ? { theoreticalSetSlots: set.slots.slice(0, pieces).map(slot => ({ slot, setId: set.id })) } : {}) });
  const rows = [];
  for (const id of entities) {
    const character = await catalog.get('characters', id);
    if (!character.talents.some(t => t.heals?.length)) continue;
    const localSource = [...remainingDetails].some(key => key.startsWith(id + '.'))
      ? textExcerpts.talents[id] : undefined;
    const castDetail = { barbara: 0, jean: 2, gaming: 1 }[id];
    const gearVariants = ['base','bonuses','swapped', ...(id === 'barbara' ? ['clam'] : []), ...(castDetail !== undefined ? ['cast','recorded-cast'] : []),
      ...(id === 'jahoda' ? ['hydro'] : []), ...(id === 'sayu' ? ['c1'] : [])];
    for (const gear of gearVariants) {
      const project = createEmptyProject();
      project.enemy = defaultEnemy();
      project.enemy.resistances.physical = .1;
      const weaponId = (id === 'ifa' || id === 'yumemizukimizuki') && gear === 'bonuses' ? 'sacrificialfragments' : starters[character.identity.weaponType];
      const automatic = gear === 'cast' || gear === 'recorded-cast';
      const hasClam = gear === 'clam' || id === 'barbara' && automatic;
      const ownerSet = gear === 'bonuses' ? maiden : gear === 'swapped' ? doctor : hasClam ? clam : undefined;
      const peerSet = gear === 'bonuses' || automatic ? doctor : gear === 'swapped' ? maiden : undefined;
      const level = id === 'jahoda' ? 20 : 1, ascension = id === 'jahoda' ? 1 : 0, constellation = gear === 'c1' ? 1 : 0;
      const owner = addActorFromBuild(project, { ...equip(character, await catalog.get('weapons', weaponId), ownerSet, hasClam ? 4 : 2),
        level, ascension, constellation });
      const ally = addActorFromBuild(project, gear === 'hydro' ? equip(hydroPeer, hydroPeerWeapon, peerSet) : equip(peer, peerWeapon, peerSet));
      project.combatStates = [owner, ally].flatMap((actor, index) => [false, true, null].map((status, i) => ({
        id: 'field-' + index + '-' + i, actor, startMs: i * 1000, endMs: (i + 1) * 1000,
        values: { onField: status === null ? null : actor === ally ? status : !status },
      })));
      const queries = [];
      for (const [slot,talent] of character.talents.entries()) for (const heal of talent.heals ?? []) {
        if (heal.detail === undefined) continue;
        const field = '/talents/' + slot + '/details/' + heal.detail, key = talent.id + '.' + heal.detail;
        if (automatic) {
          if (talent.category !== 'burst' || castDetail !== heal.detail) continue;
          if (gear === 'recorded-cast') addTalentHeal(project,owner,id === 'gaming' ? owner : ally,heal.id,10);
          const source = addSkillAction(project, owner, talent.id, 10);
          if (gear === 'recorded-cast') addTalentHeal(project,owner,id === 'gaming' ? owner : ally,heal.id,10);
          for (const recipient of id === 'gaming' ? [owner] : [owner,ally]) {
            const healing = amount(id,slot,talent.details[heal.detail],weaponId, hasClam ? .15 : 0, recipient === ally ? .2 : 0);
            queries.push({ source, entity: id, field, gear, same: recipient === owner, active: recipient === owner,
              recipient, status: 'applied', healing });
          }
          continue;
        }
        if (gear === 'clam' && talent.category !== 'burst') continue;
        if (remainingDetails.has(key)) {
          const onFieldRequired = key === 'jahoda.burst.3' || key === 'sayu.burst.3';
          for (const time of onFieldRequired ? [0,1000,2000] : [1000]) for (const recipient of [owner,ally]) {
            const same = recipient === owner, active = time === 2000 ? null : same ? time === 0 : time === 1000;
            for (const { status, facts, coefficient } of recoverySamples(id, heal.id, owner, recipient, active, gear === 'hydro', constellation)) {
              const source = addTalentHeal(project, owner, recipient, heal.id, time, facts);
              const healing = status === 'applied' ? recoveryAmount(id, slot, heal.detail, heal.id, weaponId, ownerSet === maiden ? .15 : 0,
                (same ? ownerSet : peerSet) === doctor ? .2 : 0, coefficient, level, ascension, localSource) : status === 'excluded' ? 0 : null;
              queries.push({ source, entity: id, field, gear, same, active, recipient, status, healing, facts, healId: heal.id });
            }
          }
          continue;
        }
        if (['bennett','hutao','lyney'].includes(id)) {
          const quantity = (unit,value) => ({ value: value === null ? null : {kind:'quantity',unit,value}, provenance:'explicit',sourceRefs:[] });
          const flag = value => ({ value: value === null ? null : {kind:'boolean',value}, provenance:'explicit',sourceRefs:[] });
          const samples = id === 'bennett' ? [
            [.699,true,1,true], [.7,true,1,true], [.701,true,1,true], [.6,false,1,true], [null,true,1,true], [.6,null,1,true],
            [.6,true,1,false], [.6,true,1,null],
          ] : id === 'hutao' ? [[.49,true,1,true],[.5,true,1,true],[.51,true,1,true],[.5,true,5,true],[.51,true,7,true],
            [.5,true,0,true],[.51,true,null,true],[null,true,1,true]] : [[1,true,0,true],[1,true,1,true],[1,true,3,true],[1,true,5,true],[1,true,null,true]];
          for (const [hp,inside,count,fieldState] of samples) for (const recipient of [owner,ally]) {
            const same = recipient === owner;
            const scope = id === 'bennett' ? recipient : owner;
            const facts = [{subject:{kind:'actor',id:scope},values:{hpRatio:quantity('scalar',hp),onField:flag(fieldState)}}];
            if (id === 'bennett') {
              facts[0].values['bennett.inField'] = flag(inside);
              const opposite = scope === owner ? ally : owner;
              facts.push({subject:{kind:'actor',id:opposite},values:{hpRatio:quantity('scalar',.99),'bennett.inField':flag(false)}});
            } else facts.push({subject:{kind:'event'},values:{[id === 'hutao' ? 'targetsHit' : 'lyney.propSurplus']:quantity('count',count)}});
            const source = addTalentHeal(project,owner,recipient,heal.id,1000,facts);
            const denied = id === 'bennett' ? inside === false || fieldState === false || hp !== null && hp > .7
              : !same || count === 0 || id === 'hutao' && hp !== null && (heal.detail === 3) !== (hp <= .5);
            const unknown = id === 'bennett' ? hp === null || inside === null || fieldState === null : count === null || id === 'hutao' && hp === null;
            const status = denied ? 'excluded' : unknown ? 'unknown' : 'applied';
            const healing = status === 'applied' ? amount(id,slot,talent.details[heal.detail],weaponId,ownerSet === maiden ? .15 : 0,
              (same ? ownerSet : peerSet) === doctor ? .2 : 0) * (id === 'bennett' ? 1 : Math.min(count,5)) : denied ? 0 : null;
            queries.push({ source, entity:id, field, gear, same, active:fieldState, recipient,status,healing, hp,inside,count });
          }
          continue;
        }
        const times = gear === 'clam' ? [1000] : [0,1000,...onField.has(key) ? [2000] : []];
        for (const time of times) for (const recipient of gear === 'clam' ? [ally] : [owner, ally]) {
          const same = recipient === owner;
          const source = addTalentHeal(project, owner, recipient, heal.id, time);
          const active = time === 2000 ? null : same ? time === 0 : time === 1000;
          const excluded = self.has(key) && !same || other.has(key) && same || onField.has(key) && active === false;
          const status = excluded ? 'excluded' : onField.has(key) && active === null ? 'unknown' : 'applied';
          const healing = status === 'applied' ? amount(id,slot,talent.details[heal.detail],weaponId,
            (id === 'sangonomiyakokomi' ? .25 : 0) + (ownerSet === maiden || ownerSet === clam ? .15 : 0),
            (same ? ownerSet : peerSet) === doctor ? .2 : 0) : status === 'excluded' ? 0 : null;
          queries.push({ source, entity: id, field, gear, same, active, recipient, status, healing });
        }
      }
      const input = JSON.stringify(project);
      const result = engine.evaluateTimeline(project);
      if (input !== JSON.stringify(project)) throw Error(id + ': 求值改写了存档对象');
      const resultRows = result.combatChanges?.filter(c => c.kind === 'talent-healing') ?? [];
      const sameNumber = (a,b) => a === b || Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7;
      const expectedBubble = hasClam ? Math.min(30000,queries.reduce((total,q) => total + q.healing,0)) * .9 * .9 : undefined;
      for (const q of queries) {
        const found = resultRows.filter(c => (c.sourceEventIds?.[0] ?? c.source) === q.source && c.recipient === q.recipient), actual = found[0];
        const correct = resultRows.length === queries.length && found.length === 1 && actual.status === q.status && sameNumber(actual.healing ?? null, q.healing);
        const bubble = !hasClam || result.points.length === 1 && sameNumber(result.points[0].value, expectedBubble);
        rows.push({ entity: id, field: q.field, gear, recipient: q.same ? 'owner' : 'ally', onField: q.active, status: q.status,
          expected: q.healing, actualStatus: actual?.status ?? null, actual: actual?.healing ?? null,
          ...(q.facts ? { facts: q.facts, healId: q.healId } : {}),
          ...(Object.hasOwn(q,'hp') ? { hpRatio:q.hp, inField:q.inside, count:q.count } : {}),
          ...(hasClam ? { expectedBubble, actualBubble: result.points.map(p => p.value) } : {}),
          ...(!correct || !bubble ? { issue: '治疗数值、受益者、条件或泡沫贡献不符' } : {}) });
      }
      if (onCase) onCase(project, queries.map(({ source,recipient,status,healing }) => ({ source,recipient,status,healing })), expectedBubble);
    }
  }
  const byField = new Map();
  for (const row of rows) {
    const field = row.entity + row.field;
    byField.set(field, !row.issue && (byField.get(field) ?? true));
  }
  const verified = [...byField].filter(([,passed]) => passed).map(([field]) => field);
  return { rows, verified, summary: { verifiedTalentHeals: verified.length, talentHealingScenarios: rows.length,
    talentHealingFailures: rows.filter(r => r.issue).length } };
}
