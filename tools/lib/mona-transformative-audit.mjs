import { readContentSource } from './content-source.mjs';
import { assembleCalculationLibrary, readCalculationLibrary } from './calculation-library.mjs';
import { auditBuild } from './roster-audit-settings.mjs';
import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

const monaSource = '.references/mona-community/beta-tools/runtime-7106.mjs';
const rulesSource = 'src/game-data/data/calculation/reactions.json';
const reactions = [
  ['burning', 'burning', 'pyro', .25], ['superconduct', 'superconduct', 'cryo', 1.5],
  ['swirl_pyro', 'swirl', 'pyro', .6], ['swirl_hydro', 'swirl', 'hydro', .6],
  ['swirl_electro', 'swirl', 'electro', .6], ['swirl_cryo', 'swirl', 'cryo', .6],
  ['electro_charged', 'electro-charged', 'electro', 2], ['shatter', 'shatter', 'physical', 3],
  ['overload', 'overloaded', 'pyro', 2.75], ['bloom', 'bloom', 'dendro', 2],
  ['burgeon', 'burgeon', 'dendro', 3], ['hyperbloom', 'hyperbloom', 'dendro', 3],
];
const q = (unit, value) => ({ kind: 'quantity', unit, value });
const resistanceFactor = r => r < 0 ? 1 - r / 2 : r < .75 ? 1 - r : 1 / (4 * r + 1);
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-5, Math.abs(b) * 1e-6);

/** Actual Mona public reaction API versus the maintained LeyLine reaction formula. */
export async function auditMonaTransformative(entities, engine) {
  const compiled = engine.compileCalculation(readCalculationLibrary());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const reactionData = readContentSource(new URL('../../src/game-data/data/calculation/reactions.json', import.meta.url));
  const rules = reactionData.rules;
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addTransformativeReaction, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const character = entities.characters.find(row => row.id === 'kaeya');
  const weapon = entities.weapons.find(row => row.id === 'dullblade');
  const set = entities.sets.find(row => row.id === 'gladiatorsfinale');
  const common = readContentSource(new URL('../../src/game-data/data/calculation/common.json', import.meta.url));
  const reactionRules = assembleCalculationLibrary(common, reactionData, []);
  const { api, named } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const fixture = (await probeMonaSkills({ characters: ['Kaeya'], indices: [0], constellations: [0] })).rows[0];
  if (fixture?.status !== 'ok') throw new Error('Mona Kaeya fixture unavailable: ' + fixture?.error);
  const rows = [];
  const scenarios = [1, 50, 90].flatMap(level => [0, 20].flatMap(em => [-.2, .1, .8].map(resistance => ({ level, em, resistances: Object.fromEntries(['pyro', 'hydro', 'electro', 'cryo', 'dendro', 'physical', 'geo', 'anemo'].map(element => [element, resistance])) }))));
  scenarios.push({ level: 90, em: 0, resistances: { pyro: -.2, hydro: 0, electro: .1, cryo: .3, dendro: .5, physical: .8, geo: .4, anemo: .6 } });
  for (const { level, em, resistances } of scenarios) {
    const input = structuredClone(fixture.input);
    input.character.level = level;
    input.artifacts = [];
    input.buffs = em ? [named('ElementalMastery', { value: em })] : [];
    input.enemy = Object.fromEntries(Object.entries(resistances).map(([element, resistance]) => [element + '_res', resistance]));
    input.enemy.level = 90;
    let result;
    try { result = api.CalculatorInterface.get_transformative_damage(input); }
    catch (error) { rows.push({ level, em, resistances, status: 'mona-error', error: String(error?.message ?? error) }); continue; }
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    project.enemy.resistances = { ...project.enemy.resistances, ...resistances };
    const build = { ...auditBuild(character, weapon), level, ascension: level === 90 ? 6 : level === 50 ? 2 : 0,
      sets: em ? [set] : [], artifacts: em ? [{ id: 'synthetic-em', setId: 'gladiatorsfinale', slot: 'flower', rarity: 5, level: 0, mainStat: 'hp', inventory: null, sourceRefs: [], substats: [{ stat: 'elementalMastery', value: em }] }] : [] };
    const actor = addActorFromBuild(project, build);
    const records = reactions.map(([, family, element], index) => addTransformativeReaction(project, actor, family, element, index, reactionRules));
    const evaluated = engine.evaluateTimeline(project);
    for (const [index, [key, family, element, coefficient]] of reactions.entries()) {
      const resistance = resistances[element];
      const multiplier = rules.levelMultipliers[level], factor = resistanceFactor(resistance);
      const coefficientIndex = reactionData.calculation.attributes.findIndex(entry => entry.identity.id === 'attribute.reaction.' + family + '.coefficient');
      const point = evaluated.points.find(entry => entry.id === records[index]);
      const leyline = point?.real?.structured?.totals?.all?.state === 'known' ? point.value : null;
      const independent = multiplier * coefficient * (1 + 16 * em / (2000 + em)) * factor;
      const mona = result[key];
      rows.push({ key, family, element, level, em, resistance, coefficient, mona, leyline, independent,
        diagnostics: leyline === null ? evaluated.diagnostics : undefined, status: leyline === null ? 'leyline-unavailable' : near(mona, independent) && near(leyline, independent) ? 'match' : 'mismatch',
        provenance: { mona: monaSource, leyline: rulesSource + '#/rules/levelMultipliers/' + level,
          formula: 'src/engine/src/calculation/templates-reactions.ts', coefficient: rulesSource + '#/calculation/attributes/' + coefficientIndex },
        scope: 'Public project reaction event, noncritical; synthetic EM substat isolates the numerical formula, not trigger or aura ownership.' });
    }
    result.free?.();
  }
  const zeroResult = engine.evaluateFormula(compiled.program, { namespace: 'builtin', id: 'transformative', revision: '1' }, {
    levelMultiplier: q('damage', rules.levelMultipliers[90]), reactionCoefficient: q('scalar', 0), em: q('elementalMastery', 0),
    reactionBonus: q('scalar', 0), resistanceFactor: q('scalar', .9),
  });
  const zero = zeroResult.outputs.value;
  const legalZero = { input: 'zero reaction coefficient', value: zero?.state === 'known' ? zero.value.value : null,
    status: zero?.state === 'known' && zero.value.value === 0 ? 'match' : 'mismatch', scope: 'LeyLine formula only; Mona has no coefficient input.' };
  const summary = { cases: rows.length };
  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;
  return { rows, legalZero, summary, limitations: ['Crystallize is a shield, not a transformative damage output; not compared here.',
    'Direct lunar and stellar damage use separate APIs and are not covered by this standalone reaction comparison.',
    'Target aura and trigger ownership are not inputs of this standalone formula; compare them through event-level probes.',
    'The independent arithmetic uses explicitly listed coefficients and adopted level multipliers; it is not independent evidence for those constants.'] };
}

/** Check the persisted comparisons against the published Mona coefficients and the live runs. */
export function validateMonaTransformativeReviews(reviews, audit, leylineRows) {
  const issues = [], accepted = [];
  const fields = new Map(leylineRows.map(row => [row.id, row]));
  const legacyCoefficients = { superconduct: .5, electro_charged: 1.2, shatter: 1.5, overload: 2 };
  const scenarios = [1, 50, 90].flatMap(level => [0, 20].flatMap(em =>
    [-.2, .1, .8].map(resistance => ({ level, em, resistance }))));
  const asymmetric = { pyro: -.2, hydro: 0, electro: .1, cryo: .3, dendro: .5, physical: .8 };
  const caseCount = scenarios.length + 1;
  const rows = audit.rows ?? [];
  if (rows.length !== caseCount * reactions.length) {
    issues.push({ side: 'reaction', issue: 'Expected ' + caseCount * reactions.length + ' reaction cases', actual: rows.length });
  }
  for (const [key, family, element, coefficient] of reactions) {
    const id = 'transformative-' + key;
    const matches = reviews.filter(review => review.id === id);
    const cases = rows.filter(row => row.key === key);
    const errors = [];
    const [review] = matches;
    const monaCoefficient = legacyCoefficients[key] ?? coefficient;
    const different = monaCoefficient !== coefficient;
    if (matches.length !== 1) errors.push('review count ' + matches.length);
    if (review && (review.disposition !== (different ? 'different' : 'matched') || review.mona?.length !== 1
      || review.mona[0] !== 'mona:reaction:' + key || review.leyline?.length !== 1)) {
      errors.push('review disposition or identities changed');
    }
    const reference = review?.leyline?.[0];
    const target = fields.get(reference?.id);
    if (!target || target.revision !== reference.revision || target.binding?.identity?.id !== 'attribute.reaction.' + family + '.coefficient') {
      errors.push('LeyLine coefficient identity changed');
    }
    if (cases.length !== caseCount) errors.push('scenario count changed');
    for (const [index, row] of cases.entries()) {
      const expected = scenarios[index] ?? { level: 90, em: 0, resistance: asymmetric[element] };
      if (row.level !== expected.level || row.em !== expected.em || row.resistance !== expected.resistance || row.element !== element) {
        errors.push('scenario input changed at index ' + index);
        break;
      }
      if (row.coefficient !== coefficient || !near(row.leyline, row.independent)
        || !near(row.mona, row.independent * monaCoefficient / coefficient) || row.status !== (different ? 'mismatch' : 'match')) {
        errors.push('unrecognized result at ' + JSON.stringify([row.level, row.em, row.resistance, row.mona, row.leyline]));
        break;
      }
    }
    const verified = Array.isArray(review?.comparisons) && review.comparisons.length && review.comparisons.every(({ expected, actual, tolerance }) =>
      [expected, actual, tolerance].every(Number.isFinite) && tolerance >= 0 && Math.abs(actual - expected) <= tolerance
      && cases.some(row => near(row.leyline, expected) && near(row.leyline, actual)));
    if (review && !verified) errors.push('persisted comparisons no longer agree with live values');
    if (errors.length) issues.push({ side: 'reaction', id, issue: errors.join('; ') });
    else accepted.push(review);
  }
  const extra = reviews.filter(review => review.id?.startsWith('transformative-')
    && !reactions.some(([key]) => review.id === 'transformative-' + key));
  if (extra.length) issues.push({ side: 'reaction', issue: 'Unexpected transformative reviews', ids: extra.map(row => row.id) });
  return { reviews: accepted, issues, summary: {
    scenarios: caseCount, cases: rows.length, accepted: accepted.length, rejected: reactions.length - accepted.length,
  } };
}
