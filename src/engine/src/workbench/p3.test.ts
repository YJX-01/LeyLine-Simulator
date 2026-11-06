import { describe, expect, it } from 'vitest';
import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { getRealCharacter, getRealWeapon, getArtifactMain, REAL_DATA_VERSION } from '@leyline/game-data/real';
import { evaluateWorkbench } from './index';
import snapshot from '../../../../fixtures/workbench/p3-snapshot.json';
import history from '../../../../fixtures/workbench/p3-history.json';

const snap = () => workbenchProjectSchema.parse(structuredClone(snapshot));
const hist = () => workbenchProjectSchema.parse(structuredClone(history));
const definition = (p: WorkbenchProject, id: string) => p.definitions.find(d => d.id === id)!;
const node = (p: WorkbenchProject, d: string, id: string) => definition(p, d).nodes.find(n => n.id === id)!;
function constant(p: WorkbenchProject, d: string, id: string, value: number) {
  const entry = node(p, d, id);
  if (entry.op !== 'constant') throw new Error('Expected independent constant input');
  entry.quantity.value = value;
}
const value = (p: WorkbenchProject, id?: string) => {
  const result = evaluateWorkbench(p);
  expect(result.diagnostics).toEqual([]);
  expect(result.status).toBe('complete');
  return id ? result.points.find(point => point.id === id)?.value : result.objectiveValue;
};
function simple(): WorkbenchProject {
  const p = hist();
  p.timeline = [{ id: 'one', timeMs: 1000, order: 0, actor: 'dealer', definition: 'hit-one', kind: 'damage' }];
  p.objective = {};
  return p;
}
function addAttackEffect(p: WorkbenchProject, amount = 100) {
  const d = definition(p, 'dealer-character');
  d.nodes.push({ id: 'flat', op: 'constant', quantity: { value: amount, unit: 'attack' } });
  d.effects.push({ id: 'flat', startMs: 0, endMs: 10000, value: 'flat', attribute: 'attack', unit: 'attack' });
  definition(p, 'hit-one').nodes = [{ id: 'damage', op: 'attribute', key: 'attack', unit: 'attack' }];
}

describe('P3 independent attribute capture and dependency samples', () => {
  it('recomputes 6900/7020/6600 and preserves the saved graph across runs', () => {
    const p = snap();
    const original = JSON.stringify(p);
    expect(value(p)).toBe(6900); // (2000 + (1000+500)*.2) * 2 * 1.5
    p.candidate.actors[0].inputs.attack.value = 1200;
    expect(value(p)).toBe(7020); // (2000 + (1200+500)*.2) * 2 * 1.5
    p.candidate.actors[0].inputs.attack.value = 1000;
    definition(p, 'support-character').effects[1].captureAt = 'dynamic';
    expect(value(p)).toBe(6600); // (2000 + 1000*.2) * 2 * 1.5
    expect(value(JSON.parse(original))).toBe(6900);
    expect(value(snap())).toBe(6900);
  });
  it('fails missing capture sources and rejects P3 syntax under the old rules', () => {
    const p = snap();
    const capture = node(p, 'snapshot-hit', 'captured-attack');
    if (capture.op === 'capture') capture.at = 'deleted-cast';
    expect(evaluateWorkbench(p).diagnostics.some(d => d.code === 'missing-reference')).toBe(true);
    p.rulesVersion = 'workbench-v1';
    expect(workbenchProjectSchema.safeParse(p).success).toBe(false);
  });
  it('distinguishes before/after capture of an action at the exact same time', () => {
    const p = simple(); addAttackEffect(p);
    const d = definition(p, 'dealer-character');
    d.effects[0].action = 'hit-four';
    p.timeline.unshift({ id: 'cast', timeMs: 1000, order: 0, actor: 'dealer', definition: 'hit-four', kind: 'action' });
    p.timeline[1].order = 1;
    definition(p, 'hit-one').nodes = [{ id: 'attack', op: 'attribute', key: 'attack', unit: 'attack' }, { id: 'damage', op: 'capture', at: 'cast', phase: 'before', value: 'attack' }];
    expect(value(p)).toBe(2000);
    const capture = node(p, 'hit-one', 'damage'); if (capture.op === 'capture') capture.phase = 'after';
    expect(value(p)).toBe(2100);
  });
  it('reads own effect source without recursively including that instance', () => {
    const p = simple();
    const d = definition(p, 'dealer-character');
    d.nodes = [{ id: 'own', op: 'attribute', key: 'attack', unit: 'attack' }];
    d.effects = [{ id: 'own', startMs: 0, endMs: 5000, value: 'own', attribute: 'attack', unit: 'attack', captureAt: 'source', action: 'hit-four' }];
    p.timeline.unshift({ id: 'cast', timeMs: 0, order: 0, actor: 'dealer', definition: 'hit-four', kind: 'action' });
    definition(p, 'hit-one').nodes = [{ id: 'damage', op: 'attribute', key: 'attack', unit: 'attack' }];
    expect(value(p)).toBe(4000);
  });
  it('detects a cross-actor attribute dependency cycle', () => {
    const p = snap();
    definition(p, 'support-character').effects = [{ id: 'from-dealer', startMs: 0, endMs: 8000, value: 'from-dealer', recipient: 'self', attribute: 'attack', unit: 'attack' }];
    definition(p, 'support-character').nodes = [{ id: 'from-dealer', op: 'attribute', actor: 'dealer', key: 'attack', unit: 'attack' }];
    definition(p, 'dealer-character').effects = [{ id: 'from-support', startMs: 0, endMs: 8000, value: 'from-support', attribute: 'attack', unit: 'attack' }];
    definition(p, 'dealer-character').nodes = [{ id: 'from-support', op: 'attribute', actor: 'support', key: 'attack', unit: 'attack' }];
    const result = evaluateWorkbench(p);
    expect(result.status).toBe('invalid');
    expect(result.diagnostics.some(d => d.code === 'cycle')).toBe(true);
  });
});

describe('P3 effect selection and stable source revisions', () => {
  it.each([['add', 2300], ['replace', 2100], ['stack', 2200]] as const)('applies %s with independent instances and stack caps', (policy, expected) => {
    const p = simple(); addAttackEffect(p);
    const effect = definition(p, 'dealer-character').effects[0];
    Object.assign(effect, { action: 'hit-four', policy, group: 'same', maxStacks: 2 });
    p.timeline.unshift(...[0, 100, 200].map((timeMs, order) => ({ id: `cast-${order}`, timeMs, order, actor: 'dealer', definition: 'hit-four', kind: 'action' as const })));
    expect(value(p)).toBe(expected);
  });
  it('uses half-open intervals and deterministic same-time action order', () => {
    const p = simple(); addAttackEffect(p);
    const effect = definition(p, 'dealer-character').effects[0]; effect.startMs = 1000; effect.endMs = 2000;
    expect(value(p)).toBe(2100);
    p.timeline[0].timeMs = 2000; expect(value(p)).toBe(2000);
    effect.startMs = 0; effect.endMs = 5000; effect.action = 'hit-four';
    p.timeline[0].timeMs = 1000;
    p.timeline.push({ id: 'cast', timeMs: 1000, order: 1, actor: 'dealer', definition: 'hit-four', kind: 'action' });
    expect(value(p)).toBe(2000);
    p.timeline[0].order = 2; expect(value(p)).toBe(2100);
  });
  it.each(['replace', 'stack'] as const)('permanently retires an overwritten %s instance after the replacement expires', policy => {
    const p = simple(); addAttackEffect(p);
    const d = definition(p, 'dealer-character');
    Object.assign(d.effects[0], { group: 'refresh', policy, maxStacks: 1 });
    d.nodes.push({ id: 'new', op: 'constant', quantity: { value: 200, unit: 'attack' } });
    d.effects.push({ id: 'replacement', startMs: 2000, endMs: 4000, value: 'new', attribute: 'attack', unit: 'attack', group: 'refresh', policy, maxStacks: 1 });
    p.timeline[0].timeMs = 3000; expect(value(p)).toBe(2200);
    p.timeline[0].timeMs = 5000; expect(value(p)).toBe(2000); // The old +100 does not revive.
  });
  it('rejects conflicting policy or stack caps in one recipient attribute group', () => {
    for (const conflict of [{ policy: 'replace' as const, maxStacks: 1 }, { policy: 'stack' as const, maxStacks: 2 }]) {
      const p = simple(); addAttackEffect(p);
      const d = definition(p, 'dealer-character');
      Object.assign(d.effects[0], { group: 'same', policy: 'stack', maxStacks: 1 });
      definition(p, 'empty-weapon').nodes = [{ id: 'other', op: 'constant', quantity: { value: 200, unit: 'attack' } }];
      definition(p, 'empty-weapon').effects = [{ id: 'other', startMs: 0, endMs: 10000, value: 'other', attribute: 'attack', unit: 'attack', group: 'same', ...conflict }];
      expect(evaluateWorkbench(p).diagnostics.some(issue => issue.code === 'invalid-input')).toBe(true);
    }
  });
  it('does not silently treat unknown activation as zero', () => {
    const p = simple(); addAttackEffect(p);
    definition(p, 'dealer-character').effects[0].condition = 'unmarked';
    expect(evaluateWorkbench(p).status).toBe('partial');
    expect(evaluateWorkbench(p).points[0].value).toBeNull();
    p.conditions.unmarked = false; expect(value(p)).toBe(2000);
    p.conditions.unmarked = true; expect(value(p)).toBe(2100);
  });
  it('does not read unknown conditions on an expired additive instance', () => {
    const p = simple(); addAttackEffect(p);
    const effect = definition(p, 'dealer-character').effects[0];
    effect.endMs = 1000; effect.condition = 'expired-unknown';
    expect(value(p)).toBe(2000);
  });
  it('keeps revisions on their original definition version, slot and action identity', () => {
    const p = simple(); addAttackEffect(p);
    const identity = JSON.stringify(['dealer', 'character', 'dealer-character', '1', 'flat', null]);
    p.effectRevisions = [{ instanceId: identity, disabled: true }];
    expect(value(p)).toBe(2000);
    p.effectRevisions[0] = { instanceId: identity, disabled: false, value: { value: 250, unit: 'attack' } };
    expect(value(p)).toBe(2250);
    definition(p, 'dealer-character').version = '2';
    const changed = evaluateWorkbench(p);
    expect(changed.diagnostics.some(d => d.code === 'stale-revision')).toBe(true);
    expect(changed.points[0].value).toBe(2100);
    expect(p.effectRevisions[0].instanceId).toBe(identity);
  });
});

describe('P3 history graph, counters and resets', () => {
  it('preserves earlier dependencies when only settlement is selected: 150 / 180', () => {
    const p = hist();
    expect(value(p)).toBe(150); // (100+200)*.5; normal 900 at endMs excluded
    expect(evaluateWorkbench(p).totalValue).toBe(1350);
    constant(p, 'hit-one', 'damage', 120); constant(p, 'hit-four', 'damage', 240);
    expect(value(p)).toBe(180);
    expect(evaluateWorkbench(p).points).toHaveLength(4);
  });
  it('detects a genuine settlement self-reference, not a half-open excluded point', () => {
    const p = hist();
    const window = node(p, 'settlement', 'window');
    if (window.op === 'history') { window.endMs = 6001; window.includeCurrent = true; }
    const result = evaluateWorkbench(p);
    expect(result.status).toBe('invalid');
    expect(result.diagnostics.some(d => d.code === 'cycle')).toBe(true);
  });
  it('filters actor and definition, resets after settlement and respects same-time order', () => {
    const p = hist();
    const window = node(p, 'settlement', 'window');
    if (window.op !== 'history') throw new Error('history node missing');
    window.endMs = 10000; window.definition = 'hit-one';
    expect(value(p)).toBe(50);
    delete window.definition;
    window.resetAt = ['four'];
    expect(value(p)).toBe(450); // reset at 4s excludes that damage and earlier; 6s normal hit remains
    window.resetAt = ['settle'];
    p.timeline.push({ id: 'later', timeMs: 7000, order: 0, actor: 'dealer', definition: 'hit-one', kind: 'damage' }, { id: 'settle-again', timeMs: 8000, order: 0, actor: 'dealer', definition: 'settlement', kind: 'damage' });
    p.objective.damageIds = ['settle-again'];
    expect(value(p)).toBe(50);
    window.actor = 'absent';
    expect(evaluateWorkbench(p).diagnostics.some(d => d.code === 'missing-reference')).toBe(true);
  });
  it('counts with initial value and cap and keeps scalar units explicit', () => {
    const p = hist();
    const d = definition(p, 'settlement');
    d.nodes = [{ id: 'count', op: 'history', mode: 'count', startMs: 1000, endMs: 6000, initial: 2, cap: 3 }, { id: 'per-count', op: 'constant', quantity: { value: 10, unit: 'damage' } }, { id: 'damage', op: 'multiply', left: 'count', right: 'per-count' }];
    expect(value(p)).toBe(30); // min(2 initial + 2 observed, 3)*10
    const count = d.nodes[0]; if (count.op === 'history') count.cap = 10;
    expect(value(p)).toBe(40);
  });
  it('feeds prior damage into an effect in the same dependency model', () => {
    const p = hist();
    const d = definition(p, 'dealer-character');
    d.nodes = [{ id: 'prior', op: 'history', mode: 'sum', startMs: 1000, endMs: 6000 }];
    d.effects = [{ id: 'history-attack', startMs: 6000, endMs: 10000, value: 'prior', attribute: 'attack', unit: 'damage' }];
    // History values are damage units: using it as a damageBonus must fail rather than coerce.
    d.effects[0].attribute = 'damageBonus';
    expect(evaluateWorkbench(p).diagnostics.some(issue => issue.code === 'unit')).toBe(true);
    d.nodes.push({ id: 'damage-unit', op: 'constant', quantity: { value: 100, unit: 'damage' } }, { id: 'ratio', op: 'divide', left: 'prior', right: 'damage-unit' });
    d.effects[0].value = 'ratio'; d.effects[0].unit = 'scalar';
    // 1+300/100 = 4; the prior 100 and 200 were computed before the effect starts.
    p.objective.damageIds = ['six'];
    expect(value(p)).toBe(3600);
  });
  it('terminates the visit budget with a wide shallow graph instead of silently approximating', () => {
    const p = simple(); addAttackEffect(p);
    const d = definition(p, 'dealer-character');
    d.effects = Array.from({ length: 200 }, (_, index) => ({ ...d.effects[0], id: `effect-${index}` }));
    p.timeline = Array.from({ length: 1000 }, (_, order) => ({ ...p.timeline[0], id: `hit-${order}`, order }));
    const result = evaluateWorkbench(p);
    expect(result.diagnostics.some(issue => issue.code === 'budget')).toBe(true);
    expect(result.status).toBe('partial');
    expect(result.objectiveValue).toBeNull();
  });
  it('reports missing history reset dependencies and bounded graph traversal', () => {
    const p = hist();
    const window = node(p, 'settlement', 'window'); if (window.op === 'history') window.resetAt = ['missing-reset'];
    expect(evaluateWorkbench(p).diagnostics.some(d => d.code === 'missing-reference')).toBe(true);
    const deep = simple();
    const d = definition(deep, 'hit-one');
    d.nodes = [{ id: 'zero', op: 'constant', quantity: { value: 0, unit: 'damage' } }];
    for (let index = 0; index < 150; index++) d.nodes.push({ id: `n${index}`, op: 'add', left: index ? `n${index - 1}` : 'zero', right: 'zero' });
    d.damage = 'n149';
    expect(evaluateWorkbench(deep).diagnostics.some(issue => issue.code === 'budget')).toBe(true);
  });
});

it.each([
  { id: 'jean', base: 1549.2330752985004, attack: 693.5415325, multipliers: [4.964], bonus: 1 },
  { id: 'kaeya', base: 990.790476932988, attack: 677.3802041, multipliers: [3.2503999999999995], bonus: 1 },
  { id: 'xingqiu', base: 2682.857029682754, attack: 813.614201276, multipliers: [2.856, 3.2503999999999995], bonus: 1.2 },
])('re-evaluates real $id with a cross-actor 100 attack effect through the common rule graph', async reference => {
  const p = simple();
  const character = await getRealCharacter(reference.id);
  p.candidate.actors[0].realBuild = { dataVersion: REAL_DATA_VERSION, character, weapon: await getRealWeapon(reference.id === 'xingqiu' ? 'sacrificialsword' : 'favoniussword'), artifactMain: await getArtifactMain(), sets: [], artifacts: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 1, skill: 9, burst: 1 }, weaponLevel: 90, weaponAscension: 6, refinement: 1, hpRatio: 1 };
  p.enemy = { level: 90, defenseReduction: 0, defenseIgnore: 0, resistances: { physical: .1, anemo: .1, geo: .1, electro: .1, hydro: .1, pyro: .1, cryo: .1, dendro: .1 } };
  definition(p, 'hit-one').nodes = [{ id: 'damage', op: 'game-damage' }];
  p.timeline = reference.multipliers.map((_, hitIndex) => ({ id: `real-${hitIndex}`, kind: 'damage', actor: 'dealer', definition: 'hit-one', timeMs: 1000, order: hitIndex, realDamage: { skillId: `${reference.id}.skill`, hitIndex, crit: 'noncritical', reaction: 'none' } }));
  expect(value(p)).toBeCloseTo(reference.base, 7);
  p.candidate.actors.push({ id: 'support', character: 'hit-four', weapon: 'empty-weapon', inputs: { attack: { value: 500, unit: 'attack' } } });
  definition(p, 'hit-four').nodes = [{ id: 'ally-attack', op: 'attribute', key: 'attack', unit: 'attack' }, { id: 'ratio', op: 'constant', quantity: { value: .2, unit: 'scalar' } }, { id: 'converted', op: 'multiply', left: 'ally-attack', right: 'ratio' }];
  definition(p, 'hit-four').effects = [{ id: 'cross-attack', startMs: 0, endMs: 10000, value: 'converted', recipient: 'dealer', attribute: 'attack', unit: 'attack' }];
  // The independent increment is 100 attack * E9 coefficients * elemental bonus * .5 * .9.
  const increment = 100 * reference.multipliers.reduce((sum, coefficient) => sum + coefficient, 0) * reference.bonus * .5 * .9;
  expect(value(p)).toBeCloseTo(reference.base + increment, 7);
  p.candidate.actors[1].inputs.attack.value = 1000;
  expect(value(p)).toBeCloseTo(reference.base + 2 * increment, 7);
  const owner = p.candidate.actors[0];
  const weapon = structuredClone(definition(p, owner.weapon));
  weapon.id = 'real-owner-weapon'; p.definitions.push(weapon); owner.weapon = weapon.id;
  weapon.nodes.push({ id: 'weapon-effect', op: 'constant', quantity: { value: 25, unit: 'attack' } });
  weapon.effects.push({ id: 'weapon-effect', startMs: 0, endMs: 10000, value: 'weapon-effect', attribute: 'attack', unit: 'attack' });
  // A shared definition remains stable while the real weapon snapshot changes.
  const real = owner.realBuild!;
  const id = JSON.stringify([owner.id, 'weapon', weapon.id, weapon.version, 'weapon-effect', null, real.weapon.id, real.dataVersion]);
  p.effectRevisions = [{ instanceId: id, disabled: true }];
  expect(value(p)).toBeCloseTo(reference.base + 2 * increment, 7);
  real.weapon.id = `${real.weapon.id}-replacement`;
  const changed = evaluateWorkbench(p);
  expect(changed.diagnostics.some(d => d.code === 'stale-revision')).toBe(true);
  expect(changed.points.every(point => point.value !== null)).toBe(true);
  expect(changed.points.reduce((sum, point) => sum + (point.value ?? 0), 0)).toBeCloseTo(reference.base + 2.25 * increment, 7);

});

