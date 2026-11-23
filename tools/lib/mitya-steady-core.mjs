import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

export const mityaSteadyCoreCharacterIds = ['mitya', 'alyosha', 'valeriy', 'sandrone', 'odette'];
export const mityaSteadyCoreWeaponIds = ['magicguide', 'beginnersprotector', 'wastergreatsword', 'dullblade'];

const entity = 'mitya';
const field = '/constellations/5';
const pointer = field + '/buffs/1';
const sourceRoot = 'tools/data/sources/';
const genshin = sourceRoot + 'genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const growthRoot = sourceRoot + 'catalog/genshin-db/';
const mona = sourceRoot + 'mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/mitya-steady-core.json';
const lifecycle = sourceRoot + 'catalog/combat-lifecycle.json';
const formulaSource = sourceRoot + 'kqm-web/2026-11-15/reaction-formulas.json';
const talentSource = genshin + 'stats/talents.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const clause = (id, group, key) => genshin + 'ChineseSimplified/' + group + '/' + id + '.json#' + key;
const description = source => {
  const [path, key] = source.split('#');
  return read(path)[key].description;
};
const percent = (text, pattern) => amount(text, pattern) / 100;
function amount(text, pattern) {
  const value = Number(text.match(pattern)?.[1]);
  if (!Number.isFinite(value)) throw new Error('米提亚稳态炉心固定来源缺少数值 ' + pattern.source);
  return value;
}
const numeric = value => value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null;
const close = (value, expected) => value !== null && Math.abs(value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);

export function auditMityaSteadyCore(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const summary = { mityaSteadyCoreCases: 0, mityaSteadyCoreMismatches: 0, verifiedMityaSteadyCore: 0 };
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  if (!characters.has(entity) || !weapons.has('magicguide')) return { rows, verified, resolved, gaps, summary };

  const scope = read(mona);
  const steadyHits = Object.values(scope.steadyCore);
  const [ordinaryCore, overflow, detonation, c4Hit] = steadyHits;
  const c6Source = clause(entity, 'constellations', 'c6');
  const c4Source = clause(entity, 'constellations', 'c4');
  const c2Source = clause(entity, 'constellations', 'c2');
  const rates = read(talentSource);
  const baseStats = read(growthRoot + 'characters.json');
  const weaponStats = read(growthRoot + 'weapons.json');
  const curves = read(growthRoot + 'character-curves.json');
  const attachmentRates = read(lifecycle).stellarConduct.coefficients;
  const c6Text = description(c6Source);
  const steadyFactor = percent(c6Text, /造成原本(\d+)%的伤害/);
  const elevationFactor = 1 + percent(c6Text, /星超导反应伤害\*\*擢升\*\*(\d+)%/);
  const c4Ratio = percent(description(c4Source), /元素精通(\d+)%/);
  const c2Text = description(c2Source);
  const steadyMastery = amount(c2Text, /稳态：[^；]*元素精通提升(\d+)点/);
  const overloadMastery = amount(c2Text, /过载：[^。]*元素精通提升(\d+)点/);
  const blessingSource = clause(entity, 'talents', 'passive3');
  const blessing = description(blessingSource);
  const blessingRate = percent(blessing, /每点元素精通都将提升([\d.]+)%/);
  const blessingCap = percent(blessing, /至多通过这种方式提升(\d+)%/);

  function build(id, constellation = 0, ascension = 0) {
    const weapon = { mitya: 'magicguide', alyosha: 'beginnersprotector', valeriy: 'dullblade', sandrone: 'wastergreatsword', odette: 'dullblade' }[id];
    if (!characters.has(id) || !weapons.has(weapon)) return null;
    return { ...auditBuild(characters.get(id), weapons.get(weapon)), constellation, ascension, level: ascension ? 20 : 1 };
  }
  function attack(candidate) {
    const stats = baseStats[candidate.character.id].stats;
    return stats.base.attack * curves[candidate.level][stats.curve.attack] + stats.promotion[candidate.ascension].attack
      + weaponStats[candidate.weapon.id].stats.base.attack;
  }
  function record(rank, hitId, { mode = 'steady', beacons = 3, excess = true, consumed = true, attachments = 1, peers = [],
    dealerId = 'actor', conductRadiance = false, reactionBonus = 0, flat = 0, peerBaseMultiplier = 1, peerBlessing = 0, overlapping = false,
    sources: extraSources = [] } = {}) {
    if (peers.some(peer => !peer.build)) return;
    const cast = build(entity, rank);
    const dealer = dealerId === 'actor' ? cast : peers.find(peer => peer.id === dealerId).build;
    const members = [{ id: 'actor', build: cast }, ...peers.map(({ id, build }) => ({ id, build }))];
    const prepared = engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
    const character = dealer.character;
    const talent = character.talents.find(talent => talent.hits.some(hit => hit.id === hitId));
    const hit = talent.hits.find(hit => hit.id === hitId);
    const { setup, request } = auditHit(character, talent, hit);
    setup.events[0].actorId = request.actorId = dealerId;
    setup.targets[0].facts = { 'aura.hydro': bool(false), 'aura.electro': bool(false) };
    request.frame.factOverrides[0].subject = { kind: 'actor', id: dealerId };

    function assign(member, values) {
      const frame = { facts: { ...request.frame.facts }, factOverrides: [] };
      setAuditDefaults(member.build.character, frame);
      setGateFacts(member.build.character, frame, { onField: member.id === dealerId, ...values });
      Object.assign(request.frame.facts, frame.facts);
      for (const override of frame.factOverrides) {
        if (override.subject.kind === 'actor') override.subject.id = member.id;
        const found = request.frame.factOverrides.find(row => row.subject.kind === override.subject.kind && row.subject.id === override.subject.id);
        if (found) Object.assign(found.facts, override.facts);
        else request.frame.factOverrides.push(override);
      }
    }
    const steady = mode === 'steady', overload = mode === 'overload';
    assign(members[0], { 'mitya.stable': steady, 'mitya.overload': overload, ...(hitId === detonation ? { 'mitya.beacons': beacons } : {}),
      'mitya.excessBeacon': excess, 'mitya.fiveBeaconsConsumed': consumed, 'mitya.overloadedWithBeacon': overload,
      ...(conductRadiance ? { radiance: 'stellar-conduct' } : {}) });
    for (const peer of peers) assign(peer, peer.values ?? {});
    if (conductRadiance) setGateFacts(characters.get('alyosha'), request.frame, { 'alyosha.hunterPrecision': true });
    if (overlapping) setGateFacts(characters.get('odette'), request.frame, { 'odette.splendorStacks': 1 });
    request.frame.facts.stellarAttachments = number('count', attachments);

    const reaction = [overflow, detonation, c4Hit, 'mitya.normal.param10', 'sandrone.burst.param2'].includes(hitId);
    const inactive = [ordinaryCore, overflow, detonation].includes(hitId) && (!steady || hitId === overflow && !excess)
      || hitId === c4Hit && (!consumed || rank < 4);
    const multiplier = rank === 6 && steady && steadyHits.includes(hitId) ? steadyFactor : 1;
    const elevation = rank === 6 && reaction ? elevationFactor : 1;
    const sourceMastery = weaponStats.magicguide.stats.base.specialized + (rank >= 2 ? steady ? steadyMastery : overload ? overloadMastery : 0 : 0);
    const mastery = dealer === cast ? sourceMastery : rank >= 2 && steady ? steadyMastery : 0;
    const stat = reaction && dealer === cast ? mastery : attack(dealer);
    const skill = dealer === cast ? hitId === 'mitya.normal.param10' ? 'combat1' : 'combat2' : 'combat3';
    const parameter = dealer === cast ? hitId.split('.').at(-1) : 'param3';
    const talentIndex = dealer === cast && (skill === 'combat1' ? rank >= 5 : rank >= 3) ? 3 : 0;
    const ratio = hitId === c4Hit ? c4Ratio : rates[character.id][skill][parameter][talentIndex];
    const base = stat * ratio * (hitId === detonation ? beacons : 1);
    const reactionBase = base * multiplier * peerBaseMultiplier * attachmentRates[attachments];
    const baseBonus = Math.min(blessingCap, sourceMastery * blessingRate) + peerBlessing;
    const reactionFactor = 1 + 6 * mastery / (2000 + mastery) + reactionBonus;
    const resistance = 0.9;
    const expected = inactive ? 0 : overlapping ? null : reaction
      ? (reactionBase * (1 + baseBonus) * reactionFactor + flat) * resistance * elevation
      : base * multiplier * .5 * resistance;

    const result = engine.evaluateStructuredHit(prepared.team, setup, request);
    const output = result.outputs[0];
    const stage = id => numeric(output?.stages.find(entry => entry.id === id)?.value);
    const value = numeric(result.totals.all);
    const factor = reaction ? numeric(result.trace.find(node => node.nodeId === 'baseMultiplier' && node.definition.id === 'stellar-conduct-direct'))
      : stage('base-multiplier');
    const expectedBase = reaction ? reactionBase : base;
    const observedBase = stage(reaction ? 'reaction-base' : 'skill-base');
    const agrees = inactive ? close(value, 0) && !output?.stages.length : overlapping
      ? result.totals.all.state === 'unknown' && result.diagnostics.some(issue => issue.code === 'unreviewed-mechanism'
        && issue.nodeId === 'attribute.reaction.stellar-conduct.elevation')
      : close(value, expected) && close(factor, multiplier) && close(observedBase, expectedBase)
        && (!reaction || close(stage('reaction-bonus'), reactionFactor) && close(stage('reaction-flat'), flat) && close(stage('elevation'), elevation));
    const sources = [mona, c6Source, c2Source, blessingSource, lifecycle, formulaSource,
      hitId === c4Hit ? c4Source : talentSource + '#' + character.id + '/' + skill + '/' + parameter,
      growthRoot + 'characters.json#' + character.id, growthRoot + 'weapons.json#' + dealer.weapon.id,
      ...extraSources];
    const probe = { rank, hitId, mode, beacons, excess, consumed, attachments, dealerId, overlapping };
    const stages = { expectedMultiplier: inactive ? null : multiplier, multiplier: factor,
      expectedBase: inactive ? null : expectedBase, base: observedBase, expectedElevation: inactive || overlapping ? null : elevation,
      elevation: stage('elevation') };
    rows.push({ entity, field, pointer, output: 'damage', probe, sources, expected, value, ...stages, status: result.totals.all.state,
      ...agrees ? {} : { issue: '炉心命中条件、技能基数或对应伤害乘区与固定来源不符。', diagnostics: result.diagnostics } });
    if (!inactive && !overlapping) rows.push({ entity, field, pointer: pointer + '/modifiers/0', output: 'attribute.baseMultiplier',
      probe, sources, expected: multiplier, value: factor, ...stages, status: factor === null ? 'unknown' : 'known',
      ...close(factor, multiplier) ? {} : { issue: '实际采用的技能基数倍率与固定来源不符。', diagnostics: result.diagnostics } });
  }

  for (const rank of [5, 6]) {
    for (const hitId of Object.values(scope.cast)) {
      record(rank, hitId);
      record(rank, hitId, { mode: 'overload' });
    }
    for (const hitId of steadyHits) {
      record(rank, hitId);
      record(rank, hitId, { mode: 'overload' });
    }
    record(rank, overflow, { excess: false });
    record(rank, detonation, { beacons: 5, attachments: 3 });
    record(rank, c4Hit, { consumed: false });
    record(rank, 'mitya.normal.param10', { mode: 'overload' });
  }
  record(3, c4Hit);

  const alyosha = build('alyosha'), valeriy = build('valeriy');
  if (alyosha && valeriy) {
    const alyoshaSource = clause('alyosha', 'talents', 'passive3');
    const valeriySource = clause('valeriy', 'talents', 'combat1');
    const reactionBonus = percent(description(alyoshaSource), /星超导反应伤害提升(\d+)%/);
    const flat = attack(valeriy) * rates.valeriy.combat1.param8[0];
    const peers = [{ id: 'alyosha', build: alyosha, values: { 'alyosha.hunterPrecision': true, radiance: 'stellar-conduct' } },
      { id: 'valeriy', build: valeriy, values: { 'valeriy.assaultOrderWindow': true, 'valeriy.assaultOrder': true, radiance: 'stellar-conduct' } }];
    for (const rank of [5, 6]) record(rank, detonation, { peers, conductRadiance: true, reactionBonus, flat,
      sources: [alyoshaSource, valeriySource, talentSource + '#valeriy/combat1/param8', growthRoot + 'characters.json#valeriy', growthRoot + 'weapons.json#dullblade'] });
  }

  const sandrone = build('sandrone', 0, 1);
  if (sandrone) {
    const tactics = 4;
    const sources = [clause('sandrone', 'talents', 'passive1'), clause('sandrone', 'talents', 'passive3'), growthRoot + 'character-curves.json'];
    const peerBaseMultiplier = 1 + tactics * percent(description(sources[0]), /清除层数\*(\d+)%/);
    const peerBlessing = Math.min(.14, .00007 * attack(sandrone));
    for (const rank of [5, 6]) record(rank, 'sandrone.burst.param2', { dealerId: 'sandrone', peerBaseMultiplier, peerBlessing, sources,
      peers: [{ id: 'sandrone', build: sandrone, values: { 'sandrone.tactics': tactics, radiance: 'stellar-conduct' } }] });
  }

  const odette = build('odette', 6, 1);
  if (odette) record(6, detonation, { peers: [{ id: 'odette', build: odette }], overlapping: true, sources: [clause('odette', 'constellations', 'c6')] });

  summary.mityaSteadyCoreCases = rows.length;
  summary.mityaSteadyCoreMismatches = rows.filter(row => row.issue).length;
  if (rows.length && !summary.mityaSteadyCoreMismatches) {
    verified.add(entity + pointer);
    verified.add(entity + pointer + '/modifiers/0');
    const remaining = '过载消耗信标时34%概率返还，以及多个角色同次星超导擢升的叠加规则待独立证据。';
    resolved.push({ entity, field, resolved: '稳态炉心普通命中、消耗与引爆星超导及稳态四命追加伤害的技能基数乘以1.15。', remaining });
    gaps.push({ entity, field, reason: remaining, sources: [c6Source, mona] });
  }
  summary.verifiedMityaSteadyCore = verified.size;
  return { rows, verified, resolved, gaps, summary };
}
