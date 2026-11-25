import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { auditBuild, auditHit } from './roster-audit-settings.mjs';
import { createRuntimeCatalog } from './runtime-catalog.mjs';

/** Prefer the caller's linked entities; construct a fallback catalog only if needed. */
function setEntityResolver(entities) {
  let catalogPromise;
  return {
    async get(group, id) {
      const entity = entities?.[group]?.find(item => item.id === id);
      if (entity) return entity;
      catalogPromise ??= createRuntimeCatalog();
      return (await catalogPromise).get(group, id);
    },
  };
}

/** Build the same character with different counts of a single theoretical set. */
function prepareSetTeams(engine, character, weapon, set, counts) {
  return counts.map(count => {
    const theoreticalSetSlots = ['flower', 'plume', 'sands', 'goblet'].slice(0, count)
      .map(slot => ({ slot, setId: set.id }));
    const build = { ...auditBuild(character, weapon, [set]), theoreticalSetSlots };
    const result = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.team;
  });
}

/** Read one attribute for an actual authored hit in each prepared team. */
function readHitAttribute(engine, teams, character, talent, hit, stat) {
  const { setup, request } = auditHit(character, talent, hit);
  Object.assign(request.frame, { ownerId: 'actor', recipientId: 'actor', contributorId: null, hit: {
    skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element,
    origin: hit.origin, family: 'ordinary', reactionId: null,
  } });
  const binding = { kind: 'attribute', actor: { role: 'owner' },
    key: { namespace: 'builtin', id: 'attribute.' + stat, revision: '1' }, at: { kind: 'current', phase: 'same' } };
  return teams.map(team => {
    const context = engine.createStructuredCombatContext(team, setup);
    const value = engine.evaluateCombatBindings(team.program, context, { value: binding }, request.frame).outputs.value;
    return value?.state === 'known' ? value.value.value : null;
  });
}

/** Keep artifact stats fixed while replacing only the final set identity. */
function monaSetArtifacts(input, key, count) {
  const other = key === 'GladiatorsFinale' ? 'NoblesseOblige' : 'GladiatorsFinale';
  const before = input.artifacts.slice(0, count).map((artifact, index) => ({
    ...artifact, set_name: index === count - 1 ? other : key,
  }));
  return { before, after: before.map(artifact => ({ ...artifact, set_name: key })) };
}

function monaHitDamage(api, input, artifacts, index) {
  return api.CalculatorInterface.get_damage_analysis({ ...input, skill: { ...input.skill, index }, artifacts }, null).normal.non_critical;
}

const monaArtifactPath = '.references/mona-community/src/assets/_gen_artifact.js';
const catalogPath = 'tools/data/sources/catalog/mona-community/catalog.json';
const sourcePath = 'tools/data/sources/catalog/genshin-db/sets.json';
const runtime = '.references/mona-community/beta-tools/runtime-7106.mjs';
const definitions = [
  ['hp', /^生命值上限提高([\d.]+)点。$/, 'hp', null, 1],
  ['defense', /^防御力提高([\d.]+)点。$/, 'def', null, 1],
  ['attackPercent', /^攻击力提高([\d.]+)%[。；]?$/, 'atk', 'attack'],
  ['defensePercent', /^防御力提高([\d.]+)%[。；]?$/, 'def', 'defense'],
  ['hpPercent', /^生命值(?:上限)?提升([\d.]+)%[。；]?$/, 'hp', 'hp'],
  ['energyRecharge', /^元素充能效率(?:提高|提升)([\d.]+)%[。；]?$/, 'recharge'],
  ['elementalMastery', /^元素精通提高([\d.]+)点。$/, 'elemental_mastery', null, 1],
  ['critRate', /^暴击率提高([\d.]+)%[。；]?$/, 'critical'],
  ['healingBonus', /^(?:角色造成的治疗效果提升|治疗加成提高)([\d.]+)%[。；]?$/, 'healing_bonus'],
  ['shieldStrength', /^护盾强效提高([\d.]+)%[。；]?$/, 'shield_strength'],
  ['physicalBonus', /^造成的物理伤害提高([\d.]+)%[。；]?$/, 'bonus_physical'],
  ...[['岩','geo'],['冰','cryo'],['火','pyro'],['草','dendro'],['风','anemo'],['水','hydro'],['雷','electro']].map(([zh,element]) =>
    [element+'Bonus', new RegExp('^获得([\\d.]+)%'+zh+'元素伤害加成。$'), 'bonus_'+element]),
];
const sum = values => Object.values(values ?? {}).reduce((a, b) => a + b, 0);
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7;
const valueOf = value => typeof value === 'number' ? value : value?.amount;
// Used only to report likely wording differences when no effect parser matches.
const comparableText = text => text?.replace(/[。；，\s]/g, '').replaceAll('提高', '提升');

const patterns = [
  [/^元素战技造成的伤害提升([\d.]+)%[。；]?$/, ['skill']],
  [/^元素爆发造成的伤害提升([\d.]+)%[。；]?$/, ['burst']],
  [/^普通攻击与重击造成的伤害提高([\d.]+)%[。；]?$/, ['normal', 'charged']],
  [/^下落攻击造成的伤害提升([\d.]+)%[。；]?$/, ['plunge']],
];
const hits = [
  ['normal', 0, 'kaeya.normal.param1'],
  ['charged', 5, 'kaeya.normal.param6'],
  ['plunge', 7, 'kaeya.normal.param9'],
  ['skill', 10, 'kaeya.skill.param1'],
  ['burst', 11, 'kaeya.burst.param1'],
];

/** Verify category bonuses on real eligible and ineligible Kaeya hits. */
async function auditSetCategory({ identity, text, monaText, effectIndex, leylineRows, engine, catalog, character, weapon, api, input, index }) {
  const definition = patterns.map(([pattern, categories]) => ({ match: monaText?.match(pattern), categories })).find(row => row.match);
  if (!definition) return null;
  const independent = patterns.map(([pattern, categories]) => ({ match: text?.match(pattern), categories })).find(row => row.match);
  const { canonicalId: entity, exportName: key } = identity;
  const amount = Number(definition.match[1]) / 100;
  const id = `mona:set-stat:${key}:2:damageBonus`;
  const component = { id, kind: 'set-stat-effect', key, attribute: 'damageBonus', categories: definition.categories,
    source: { path: '.references/mona-community/src/assets/_gen_artifact.js', pointer: `/${identity.monaKey}/effect2` }, resolution: 'source-declared' };
  const common = { entity, key, id, pieces: 2, sourceText: text ?? null, monaText: monaText ?? null, source: `${sourcePath}#/${entity}/effect2Pc`,
    stat: 'damageBonus', expected: amount, categories: definition.categories };
  if (!independent || Number(independent.match[1]) !== Number(definition.match[1])
    || JSON.stringify(independent.categories) !== JSON.stringify(definition.categories) || effectIndex < 0) {
    return { component, row: { ...common, status: 'open-source' } };
  }
  const targets = leylineRows.filter(row => row.kind === 'set' && row.entity === entity && row.subject === 'modifier'
    && row.field.startsWith(`/effects/${effectIndex}/`) && row.binding?.modifier?.target === 'attribute.damageBonus'
    && JSON.stringify(row.binding.buff.appliesTo?.categories) === JSON.stringify(definition.categories));
  if (targets.length !== 1) return { component, row: { ...common, status: 'open-binding', reason: 'Expected one modifier with exact category scope.' } };
  const target = targets[0];
  try {
    const set = await catalog.get('sets', entity);
    const teams = prepareSetTeams(engine, character, weapon, set, [1, 2]);
    const artifacts = monaSetArtifacts(input, key, 2);
    const cases = [];
    for (const [category, index, hitId] of hits) {
      const talent = character.talents.find(row => row.hits.some(hit => hit.id === hitId));
      const hit = talent.hits.find(row => row.id === hitId);
      const values = readHitAttribute(engine, teams, character, talent, hit, 'damageBonus');
      const before = monaHitDamage(api, input, artifacts.before, index);
      const after = monaHitDamage(api, input, artifacts.after, index);
      const active = definition.categories.includes(category);
      cases.push({ category, hitId, monaIndex: index, expected: active ? amount : 0,
        monaDeltaRatio: after / before - 1, leylineBefore: values[0], leylineAfter: values[1],
        leylineDelta: values[1] - values[0], before, after });
    }
    const status = cases.every(row => Number.isFinite(row.leylineBefore) && Number.isFinite(row.leylineAfter)
      && near(row.expected, row.monaDeltaRatio) && near(row.expected, row.leylineDelta)) ? 'matched-scenario' : 'open-runtime';
    const scope = 'Kaeya wearer; one versus two pieces, five explicit normal, charged, plunge, skill and burst hits. Four-piece effects remain open.';
    const row = { ...common, status, recipient: 'kaeya', cases, scope, target: { id: target.id, revision: target.revision, source: target.source } };
    if (status !== 'matched-scenario') return { component, row };
    const mapping = { id: 'set-category-scenario:' + key, disposition: 'matched', mona: [id, `mona:set-threshold:${key}:2`],
      leyline: [{ id: target.id, revision: target.revision }], explanation: scope,
      sources: [catalogPath + `#/sets/${index}`, common.source, target.source, runtime],
      comparisons: cases.flatMap(test => [
        { name: `Mona ${test.category} damage ratio delta`, expected: test.expected, actual: test.monaDeltaRatio, tolerance: 1e-7 },
        { name: `LeyLine ${test.category} modifier delta`, expected: test.expected, actual: test.leylineDelta, tolerance: 1e-7 },
      ]) };
    return { component, row, mapping };
  } catch (error) {
    return { component, row: { ...common, status: 'open-error', error: String(error?.message ?? error) } };
  }
}

/** Two-piece wearer-panel checks; source-ineligible and runtime failures remain open. */
async function auditTwoPiece(leylineRows, context) {
  const { engine, catalog, identities, sources, api, monaCatalog, monaLabels } = context;
  const character = await catalog.get('characters', 'kaeya');
  const weapon = await catalog.get('weapons', 'dullblade');
  const input = await context.fixture('Kaeya');
  const rows = [], monaRows = [], mappings = [];
  for (const [index, identity] of identities.entries()) {
    const { canonicalId: entity, exportName: key } = identity;
    const document = readContentSource(new URL('../../src/game-data/data/artifact-sets/' + entity + '.json', import.meta.url));
    for (const pieces of [1, 2, 4]) {
      const locale = monaCatalog[identity.monaKey]?.['effect' + pieces];
      const description = locale == null ? null : monaLabels[locale];
      if (!description) continue;
      monaRows.push({
        id: `mona:set-threshold:${key}:${pieces}`,
        kind: 'set-threshold', key, pieces, description,
        source: { path: '.references/mona-community/src/assets/_gen_artifact.js', pointer: `/${identity.monaKey}/effect${pieces}` },
        resolution: 'source-declared',
      });
    }
    const effectIndex = document.effects.findIndex(effect => effect.pieces === 2);
    const text = sources[entity]?.effect2Pc;
    const monaText = monaLabels[monaCatalog[identity.monaKey]?.effect2];
    const parse = value => definitions.map(([stat, pattern, panel, base, scale]) =>
      ({ stat, panel, base, scale: scale ?? .01, found: value?.match(pattern) })).find(row => row.found);
    const match = parse(monaText);
    const independent = parse(text);
    const baseRow = { entity, key, sourceText: text ?? null, monaText: monaText ?? null,
      source: `${sourcePath}#/${entity}/effect2Pc`, pieces: 2 };
    if (!monaText) {
      rows.push({ ...baseRow, status: 'no-two-piece', reason: 'One-piece set or no captured two-piece text.' });
      continue;
    }
    if (!match) {
      const category = await auditSetCategory({ identity, text, monaText, effectIndex, leylineRows, engine, catalog, character, weapon, api, input, index });
      if (category) {
        monaRows.push(category.component);
        rows.push(category.row);
        if (category.mapping) mappings.push(category.mapping);
        continue;
      }
      const wordingDiffers = text && monaText !== text && comparableText(text) === comparableText(monaText);
      rows.push({ ...baseRow, monaText, status: wordingDiffers ? 'open-source' : 'open-specialized',
        reason: wordingDiffers ? 'The source wording differs and could not be parsed by this batch.'
          : 'Conditional, category-scoped, team, incoming-healing, resistance or other non-panel effect.' });
      continue;
    }
    const expected = Number(match.found[1]) * match.scale;
    const id = `mona:set-stat:${key}:2:${match.stat}`;
    monaRows.push({
      id, kind: 'set-stat-effect', key, attribute: match.stat,
      source: { path: '.references/mona-community/src/assets/_gen_artifact.js', pointer: `/${identity.monaKey}/effect2` },
      resolution: 'source-declared',
    });
    if (!independent || independent.stat !== match.stat || independent.scale !== match.scale
      || Number(independent.found[1]) !== Number(match.found[1]) || effectIndex < 0) {
      rows.push({ ...baseRow, status: 'open-source', stat: match.stat, monaText });
      continue;
    }
    const mods = leylineRows.filter(row => row.kind === 'set' && row.entity === entity && row.subject === 'modifier'
      && row.field.startsWith(`/effects/${effectIndex}/`) && row.binding?.modifier?.target === 'attribute.' + match.stat
      && near(valueOf(row.binding.modifier.value), expected));
    if (mods.length !== 1) {
      rows.push({ ...baseRow, status: 'open-binding', stat: match.stat, expected, reason: 'Expected exactly one matching authored modifier.' });
      continue;
    }
    const target = mods[0];
    try {
      const set = await catalog.get('sets', entity);
      const teams = prepareSetTeams(engine, character, weapon, set, [1, 2]);
      const values = readHitAttribute(engine, teams, character, character.talents[0], character.talents[0].hits[0], match.stat);
      const artifacts = monaSetArtifacts(input, key, 2);
      const before=api.CommonInterface.get_attribute({...input,artifacts:artifacts.before});
      const after=api.CommonInterface.get_attribute({...input,artifacts:artifacts.after});
      const monaDelta=sum(after[match.panel])-sum(before[match.panel]);
      const monaBase=match.base==='attack'?before.atk['角色基础攻击']+before.atk['武器基础攻击']
        :match.base==='defense'?before.def['角色基础防御']:match.base==='hp'?before.hp['角色基础生命']:1;
      const monaExpected=expected*monaBase, leylineDelta=values[1]-values[0];
      const status=values.every(Number.isFinite)&&near(monaDelta,monaExpected)&&near(leylineDelta,expected)?'matched-scenario':'open-runtime';

      const row={...baseRow,id,stat:match.stat,expected,recipient:'kaeya',onePiece:values[0],twoPieces:values[1],leylineDelta,monaDelta,monaExpected,status,
        target:{id:target.id,revision:target.revision,source:target.source},scope:'Kaeya wearer, one versus two pieces, queried panel stat; four-piece and other effects excluded.'};
      rows.push(row);
      if(status!=='matched-scenario')continue;

      mappings.push({id:'set-stat-scenario:'+key+':'+match.stat,disposition:'matched',mona:[id, 'mona:set-threshold:' + key + ':2'],leyline:[{id:target.id,revision:target.revision}],
        explanation:row.scope,sources:[catalogPath+`#/sets/${index}`,row.source,target.source,runtime],comparisons:[
          {name:'Mona one-to-two piece panel delta',expected:monaExpected,actual:monaDelta,tolerance:1e-7},
          {name:'LeyLine one-to-two piece stat delta',expected,actual:leylineDelta,tolerance:1e-7},
        ]});
    } catch(error) { rows.push({...baseRow,status:'open-error',stat:match.stat,expected,error:String(error?.message??error)}); }
  }
  return {rows,monaRows,mappings,summary:{sets:rows.length,...Object.fromEntries([...new Set(rows.map(row=>row.status))].sort().map(status=>[status,rows.filter(row=>row.status===status).length])),mappedEffects:mappings.length},
    limitations:['This covers only source-recognized unconditional wearer panel stats at two pieces; other effects and four-piece behavior remain open.',
      'Mona receives two synthetic pieces with identical individual stats; LeyLine uses theoretical set slots. Numeric panel contribution is compared rather than final damage.']};
}

const fourPieceSpecs = [
  { key: 'GladiatorsFinale', entity: 'gladiatorsfinale', category: 'normal',
    phrase: /^装备该圣遗物套装的角色为单手剑、双手剑、长柄武器角色时，角色普通攻击造成的伤害提高35%[。；]?$/ },
  { key: 'WanderersTroupe', entity: 'wandererstroupe', category: 'charged',
    phrase: /^装备该圣遗物套装的角色为法器、弓箭角色时，角色重击造成的伤害提高35%[。；]?$/ },
];
const fourPieceProfiles = [
  { id: 'kaeya', mona: 'Kaeya', weapon: 'dullblade', weaponClass: 'sword', hits: [['normal', 0, 'kaeya.normal.param1'], ['charged', 5, 'kaeya.normal.param6']] },
  { id: 'amber', mona: 'Amber', weapon: 'huntersbow', weaponClass: 'bow', hits: [['normal', 0, 'amber.normal.param1'], ['charged', 5, 'amber.normal.param6']] },
];

/** Tests two weapon classes and two attack categories; other classes stay unverified. */
async function auditFourPiece(leylineRows, context) {
  const { engine, catalog, identities, sources, api, monaCatalog, monaLabels } = context;
  const rows = [], monaRows = [], mappings = [];
  for (const spec of fourPieceSpecs) {
    const catalogIndex = identities.findIndex(row => row.exportName === spec.key);
    const identity = identities[catalogIndex];
    const monaText = monaLabels[monaCatalog[identity.monaKey]?.effect4];
    const sourceText = sources[spec.entity]?.effect4Pc;
    const id = `mona:set-stat:${spec.key}:4:${spec.category}:weapon`;
    const source = { path: monaArtifactPath, pointer: `/${identity.monaKey}/effect4` };
    monaRows.push({ id, kind: 'set-stat-effect', key: spec.key, pieces: 4, category: spec.category,
      resolution: 'source-declared', source });
    const row = { id, key: spec.key, entity: spec.entity, pieces: 4, sourceText, monaText,
      scope: 'Three versus four pieces; Kaeya sword and Amber bow, each using normal and charged hits. Other weapon classes remain untested.' };
    if (!spec.phrase.test(sourceText) || !spec.phrase.test(monaText)) {
      rows.push({ ...row, status: 'open-source' });
      continue;
    }
    const target = leylineRows.find(item => item.id === `set:${spec.entity}:modifier:/effects/1/buffs/0/modifiers/0`);
    if (!target || target.binding.modifier.target !== 'attribute.damageBonus') {
      rows.push({ ...row, status: 'open-binding' });
      continue;
    }
    try {
      const set = await catalog.get('sets', spec.entity);
      const cases = [];
      for (const profile of fourPieceProfiles) {
        const character = await catalog.get('characters', profile.id);
        const weapon = await catalog.get('weapons', profile.weapon);
        const input = await context.fixture(profile.mona);
        const teams = prepareSetTeams(engine, character, weapon, set, [3, 4]);
        const artifacts = monaSetArtifacts(input, spec.key, 4);
        for (const [category, index, hitId] of profile.hits) {
          const talent = character.talents.find(item => item.hits.some(hit => hit.id === hitId));
          const hit = talent?.hits.find(item => item.id === hitId);
          if (!hit) throw new Error('Missing authored hit: ' + hitId);
          const values = readHitAttribute(engine, teams, character, talent, hit, 'damageBonus');
          const before = monaHitDamage(api, input, artifacts.before, index);
          const after = monaHitDamage(api, input, artifacts.after, index);
          const qualifies = category === spec.category && (spec.key === 'GladiatorsFinale' ? profile.weaponClass === 'sword' : profile.weaponClass === 'bow');
          cases.push({ recipient: profile.id, weaponClass: profile.weaponClass, category, hitId, monaIndex: index,
            expected: qualifies ? .35 : 0, monaDeltaRatio: after / before - 1, leylineBefore: values[0], leylineAfter: values[1],
            leylineDelta: values[1] - values[0], before, after });
        }
      }
      const status = cases.every(test => Number.isFinite(test.leylineBefore) && Number.isFinite(test.leylineAfter)
        && near(test.expected, test.monaDeltaRatio) && near(test.expected, test.leylineDelta)) ? 'matched-scenario' : 'open-runtime';
      rows.push({ ...row, status, cases, target: { id: target.id, revision: target.revision, source: target.source } });
      if (status !== 'matched-scenario') continue;
      mappings.push({ id: 'set-four-piece-scenario:' + spec.key, disposition: 'matched', mona: [id], leyline: [{ id: target.id, revision: target.revision }],
        explanation: row.scope, sources: [catalogPath + `#/sets/${catalogIndex}`, sourcePath + `#/${spec.entity}/effect4Pc`, target.source, runtime],
        comparisons: cases.flatMap(test => [
          { name: `Mona ${test.recipient} ${test.category} damage ratio`, expected: test.expected, actual: test.monaDeltaRatio, tolerance: 1e-7 },
          { name: `LeyLine ${test.recipient} ${test.category} modifier`, expected: test.expected, actual: test.leylineDelta, tolerance: 1e-7 },
        ]) });
    } catch (error) { rows.push({ ...row, status: 'open-error', error: String(error?.message ?? error) }); }
  }
  return { rows, monaRows, mappings, summary: { cases: rows.length, matched: rows.filter(row => row.status === 'matched-scenario').length } };
}

/** Run both packets using one engine, source catalog, entity resolver and fixture cache. */
export async function auditMonaSets(leylineRows, entities, providedEngine) {
  const engine = providedEngine ?? await loadContentSchema('/src/engine/src/index.ts');
  const catalog = setEntityResolver(entities);
  const identities = readContentSource(new URL('../../' + catalogPath, import.meta.url)).sets;
  const sources = readContentSource(new URL('../../' + sourcePath, import.meta.url));
  const { api, read } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const monaCatalog = read('src/assets/_gen_artifact.js');
  const monaLabels = read('src/i18n/generated/zh-cn.json');
  const fixtures = new Map();
  async function fixture(name) {
    if (!fixtures.has(name)) fixtures.set(name, probeMonaSkills({ characters: [name], indices: [0], constellations: [0] }));
    return (await fixtures.get(name)).rows[0].input;
  }
  const context = { engine, catalog, identities, sources, api, monaCatalog, monaLabels, fixture };
  const two = await auditTwoPiece(leylineRows, context);
  const four = await auditFourPiece(leylineRows, context);
  return { two, four };
}
