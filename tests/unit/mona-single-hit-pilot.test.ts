import { describe, expect, it } from 'vitest';
import { DATA_VERSION, getArtifactMain, getBuildSources, getCharacter, getWeapon } from '@leyline/game-data';
import { elements, type Build, type Enemy, type EvaluatedValue } from '@leyline/schema';
import { evaluateDamage, evaluateStructuredHit, prepareStructuredBuilds } from '@leyline/engine';
import { selectCatalogHit } from '../helpers/catalog-calculation';
// @ts-expect-error The shared audit fixture is maintained as JavaScript.
import { auditBuild, auditHit } from '../../tools/lib/roster-audit-settings.mjs';

function numeric(value: EvaluatedValue): number {
  if (value.state !== 'known' || value.value.kind !== 'quantity') throw new Error('Expected a known numeric result');
  return value.value.value;
}

// Explicit calculation settings, not a recorded combat sequence. The two T9
// coefficients come from tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json;
// reaction direction and settlement are documented in tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/reaction-facts.json
// and calculation-formula-facts.json in the same directory.
describe('single-hit migration pilot', () => {
  it('keeps Xingqiu skill strikes separate and applies Hydro vaporize to each selected strike', async () => {
    const build: Build = { schemaVersion: '0.2.0', kind: 'calculation-build', ...await getBuildSources(), dataVersion: DATA_VERSION,
      character: await getCharacter('xingqiu'), weapon: await getWeapon('favoniussword'), artifactMain: await getArtifactMain(),
      artifacts: [], sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 },
      weaponLevel: 90, weaponAscension: 6, refinement: 1 };
    const enemy: Enemy = { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
    const attack = (16.9176 * 8.349 + 60.53229 + 41.0671 * 7.275 + 155.6) * 1.24;
    for (const [index, coefficient] of [2.856, 3.2504].entries()) {
      const hit = selectCatalogHit(build, 'xingqiu.skill', index);
      const plain = evaluateDamage(build, { ...hit, crit: 'noncritical', reaction: 'none' }, enemy);
      const vaporize = evaluateDamage(build, { ...hit, crit: 'noncritical', reaction: { type: 'vaporize', trigger: 'record-owner' } }, enemy);
      const expected = attack * coefficient * 1.2 * 0.5 * 0.9;
      expect(hit.hit.hitId).toBe(`xingqiu.skill.param${index + 1}`);
      expect(plain.status).toBe('complete');
      expect(plain.value).toBeCloseTo(expected, 7);
      expect(vaporize.status).toBe('complete');
      expect(vaporize.value).toBeCloseTo(expected * 2, 7);
    }
  });

  it('uses target Cryo aura for Frostbearer even with a Cryo teammate', async () => {
    // R1 description: 80% ATK normally, 200% against Cryo-affected enemies.
    // tools/data/sources/catalog/genshin-db/weapons.json, frostbearer.metadata.r1.
    const character = await getCharacter('lisa');
    const weapon = await getWeapon('frostbearer');
    const prepared = prepareStructuredBuilds([{ id: 'actor', build: auditBuild(character, weapon) }, { id: 'cryo-ally', element: 'cryo' }]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const flag = (value: boolean) => ({ value: { kind: 'boolean' as const, value }, provenance: 'explicit' as const, sourceRefs: [] });
    for (const aura of [false, true]) for (const cryoBranch of [false, true]) {
      const talent = character.talents[0];
      const { setup, request } = auditHit(character, talent, talent.hits[0]);
      const hitId = `frostbearer.${cryoBranch ? 'icicle-cryo' : 'icicle'}`;
      request.hit = { definition: { group: 'weapons', namespace: weapon.namespace, id: weapon.id, revision: weapon.revision }, hitId };
      request.critMode = 'noncritical';
      request.frame.facts = { 'frostbearer.icicleTriggered': flag(true) };
      request.frame.factOverrides.push({ subject: { kind: 'target', id: 'enemy' }, facts: { 'aura.cryo': flag(aura) } });
      setup.events[0].hitId = hitId;
      delete setup.events[0].skillId;
      delete setup.events[0].category;
      const result = evaluateStructuredHit(prepared.team, setup, request);
      const value = numeric(result.totals.all);
      const attack = (19.41072 + 42.401) * 1.09;
      const expected = aura === cryoBranch ? attack * (aura ? 2 : 0.8) * 0.5 * 0.9 : 0;
      expect(value).toBeCloseTo(expected, 8);
    }
  });

  it('calculates both Flins direct lunar strikes with their actual gates', async () => {
    const character = await getCharacter('flins');
    const weapon = await getWeapon('beginnersprotector');
    const build = { ...auditBuild(character, weapon), level: 90, ascension: 6, talents: { normal: 10, skill: 10, burst: 10 } };
    const prepared = prepareStructuredBuilds([{ id: 'actor', build }]);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const flag = (value: boolean) => ({ value: { kind: 'boolean' as const, value }, provenance: 'explicit' as const, sourceRefs: [] });
    const talent = character.talents.find(item => item.id === 'flins.burst')!;
    // Exact growth, T10 param6/param7, direct lunar equation and 10% electro resistance.
    // See tools/data/sources/kqm-web/2026-11-15/reaction-formulas.json and the pinned talent table.
    const attack = 374.8372196;
    const mastery = attack * 0.08;
    for (const [suffix, coefficient] of [['symphony', 1.286208], ['symphony-extra', 1.870848]] as const) {
      const hit = talent.hits.find(item => item.id === `flins.burst.${suffix}`)!;
      for (const cloud of [false, true]) {
        const { setup, request } = auditHit(character, talent, hit, 90);
        request.frame.factOverrides[0].facts['flins.symphonyWindow'] = flag(true);
        request.frame.factOverrides.push({ subject: { kind: 'team' }, facts: { fullMoonsign: flag(true) } });
        request.frame.facts.nearThundercloud = flag(cloud);
        const result = evaluateStructuredHit(prepared.team, setup, request);
        const enabled = suffix === 'symphony' || cloud;
        const expected = enabled ? attack * coefficient * 3 * 0.9 * (1 + 6 * mastery / (2000 + mastery) + 0.2) * (1 + attack * 0.00007) : 0;
        expect(numeric(result.totals.all)).toBeCloseTo(expected, 6);
      }
    }
    const extra = talent.hits.find(item => item.id === 'flins.burst.param2-extra')!;
    expect(extra.category).toBe('burst');
    for (const moon of [false, true]) for (const cloud of [false, true]) {
      const { setup, request } = auditHit(character, talent, extra, 90);
      request.frame.factOverrides.push({ subject: { kind: 'team' }, facts: { fullMoonsign: flag(moon) } });
      request.frame.facts.nearThundercloud = flag(cloud);
      const result = evaluateStructuredHit(prepared.team, setup, request);
      const expected = moon && cloud ? attack * 0.29232 * 3 * 0.9 * (1 + 6 * mastery / (2000 + mastery) + 0.2) * (1 + attack * 0.00007) : 0;
      expect(numeric(result.totals.all)).toBeCloseTo(expected, 6);
    }
  });

  it('uses the allied Shenhe attack for Kaeya Cryo damage', async () => {
    const kaeya = await getCharacter('kaeya');
    const shenhe = await getCharacter('shenhe');
    const sword = await getWeapon('dullblade');
    const spear = await getWeapon('beginnersprotector');
    const talent = kaeya.talents.find(item => item.id === 'kaeya.skill')!;
    const hit = talent.hits.find(item => item.id === 'kaeya.skill.param1')!;
    const flag = (value: boolean) => ({ value: { kind: 'boolean' as const, value }, provenance: 'explicit' as const, sourceRefs: [] });
    for (const weaponLevel of [1, 20]) {
      const support = { ...auditBuild(shenhe, spear), weaponLevel };
      const prepared = prepareStructuredBuilds([{ id: 'actor', build: auditBuild(kaeya, sword) }, { id: 'support', build: support }]);
      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      const { setup, request } = auditHit(kaeya, talent, hit, 90);
      const supportFacts = Object.fromEntries(Object.entries(shenhe.metadata.facts ?? {}).filter(([, field]) => field.scope === 'owner' && field.type.kind === 'boolean').map(([key]) => [key, flag(false)]));
      request.frame.factOverrides.push({ subject: { kind: 'actor', id: 'support' }, facts: supportFacts });
      const base = numeric(evaluateStructuredHit(prepared.team, setup, request).totals.all);
      request.frame.factOverrides.at(-1)!.facts['shenhe.quillTap'] = flag(true);
      const outcome = evaluateStructuredHit(prepared.team, setup, request);
      const affected = numeric(outcome.totals.all);
      const sourceAttack = 23.6474 + spear.baseAttack * spear.attackCurve[weaponLevel];
      expect(affected - base).toBeCloseTo(sourceAttack * 0.45656 * 101 / 291 * 0.9, 8);
    }
  });
});
