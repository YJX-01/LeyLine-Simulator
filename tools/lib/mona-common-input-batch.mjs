import { auditBuild, auditHit, novice, setGateFacts } from './roster-audit-settings.mjs';
import { ordinaryInactiveWindows } from './mona-ordinary-batch.mjs';
import { readContentSource } from './content-source.mjs';

const rollSource = 'src/game-data/data/tables/artifact-rolls.json';
const upstreamRollSource = 'tools/data/sources/lunagc/b0501c5d89767ead5f647869a2412521447f7682/ReliquaryAffixExcelConfigData.json';
const rolls = readContentSource(new URL('../../' + rollSource, import.meta.url)).affixes;

// Skill identity is independently reviewed; this batch adds only the normal
// C0 branch at the explicitly recorded no-artifact inputs.
export async function auditMonaCommonInputBranches(monaRows, leylineRows, reviews, entities, engine) {
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const targets = new Map(leylineRows.map(row => [row.id, row]));
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const weapons = new Map(entities.weapons.map(row => [row.id, row]));
  const set = entities.sets?.find(row => row.id === 'gladiatorsfinale');
  const branches = new Map(monaRows.filter(row => row.kind === 'output-branch' && row.branch === 'normal'
    && row.output === 'damage' && row.scenario?.id === 'default' && row.scenario?.constellation === 0)
    .map(row => [row.parentId, row]));
  const claimed = new Set(reviews.flatMap(review => review.mona ?? []).filter(id => id.startsWith('mona:branch:')));
  const skillTargets = new Map(), targetSkills = new Map();
  for (const review of reviews) {
    if (review.disposition !== 'matched' || review.leyline?.length !== 1) continue;
    const skill = review.mona?.filter(id => id.startsWith('mona:skill:'));
    if (skill?.length !== 1) continue;
    const target = review.leyline[0].id;
    if (!skillTargets.has(skill[0])) skillTargets.set(skill[0], new Set());
    if (!targetSkills.has(target)) targetSkills.set(target, new Set());
    skillTargets.get(skill[0]).add(target); targetSkills.get(target).add(skill[0]);
  }
  const rows = [], mappings = [];
  const seen = new Set();
  for (const review of reviews) {
    if (review.disposition !== 'matched' || review.leyline.length !== 1) continue;
    const skills = review.mona.filter(id => id.startsWith('mona:skill:'));
    if (skills.length !== 1) continue;
    const branch = branches.get(skills[0]), target = targets.get(review.leyline[0].id);
    const binding = target?.binding, def = binding?.definition;
    if (!branch || claimed.has(branch.id) || !target || review.leyline[0].revision !== target.revision
      || skillTargets.get(skills[0])?.size !== 1 || targetSkills.get(target.id)?.size !== 1 || seen.has(branch.id)
      || target.subject !== 'hit' || def?.support !== 'hit-complete'
      || binding.family !== 'ordinary' || def.when || def.selection || def.elementBy || def.infusion || def.snapshot
      || binding.unlock || !Array.isArray(def.base) || def.base.some(term => term.stat !== 'attack' || !term.parameter
        || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) continue;
    const character = characters.get(target.entity), weapon = weapons.get(novice[character?.identity?.weaponType]);
    const talent = character?.talents.find(item => item.id === binding.skillId);
    const hit = talent?.hits.find(item => item.id === binding.hitId);
    if (!weapon || !talent || !hit || !set) continue;
    seen.add(branch.id);
    const row = { mona: branch.id, leyline: target.id, sourceReview: review.id, status: 'unresolved', cases: [] };
    rows.push(row);
    try {
      for (const rollId of ['501051', '501052', '501054']) {
        const flatAttack = rolls[rollId].value;
        const level = 1, ascension = 0, talentLevel = 1;
        const input = structuredClone(branch.scenario.input);
        Object.assign(input.character, { level, ascend: false, skill1: talentLevel - 1, skill2: talentLevel - 1, skill3: talentLevel - 1 });
        Object.assign(input.weapon, { level: 1, ascend: false });
        input.artifacts = []; input.buffs = [];
        const neutral = api.CalculatorInterface.get_damage_analysis(input, null);
        const monaAttack = Object.values(neutral.atk ?? {}).reduce((a, b) => a + b, 0);
        const leylineAttack = character.attributes.base.attack * character.progression.curves.attack[1]
          + character.progression.promotion[0].attack + weapon.baseAttack;
        const roundingAdjustment = leylineAttack - monaAttack;
        if (!Number.isFinite(roundingAdjustment) || Math.abs(roundingAdjustment) > 1) throw new Error('Base attack panels do not align within rounding');
        input.artifacts = [{ id: 1, set_name: 'GladiatorsFinale', slot: 'Flower', level: 0, star: 5,
          main_stat: ['HPFixed', 717], sub_stats: [['ATKFixed', flatAttack], ['DEFFixed', rolls['501081'].value], ['CriticalRate', rolls['501201'].value]] }];
        input.buffs = [{ name: 'ATKFixed', config: { ATKFixed: { value: roundingAdjustment } } }];
        const mona = api.CalculatorInterface.get_damage_analysis(input, null);
        const achievedMonaAttack = Object.values(mona.atk ?? {}).reduce((a, b) => a + b, 0);
        const artifact = { id: 'flower', setId: 'gladiatorsfinale', slot: 'flower', rarity: 5, level: 0, mainStat: 'hp', inventory: null,
          sourceRefs: [], substats: [{ stat: 'attack', value: flatAttack }, { stat: 'defense', value: rolls['501081'].value },
            { stat: 'critRate', value: rolls['501201'].value }] };
        const build = { ...auditBuild(character, weapon, [set]), level, ascension, artifacts: [artifact], talents: { normal: talentLevel, skill: talentLevel, burst: talentLevel } };
        const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
        if (!prepared.ok) throw new Error('LeyLine build: ' + JSON.stringify(prepared.diagnostics));
        const { setup, request } = auditHit(character, talent, hit, 90);
        const inactiveWindows = ordinaryInactiveWindows(character);
        setGateFacts(character, request.frame, inactiveWindows);
        const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
        const attackTrace = evaluated.trace.find(node => node.kind === 'attribute' && node.nodeId === 'attribute.attack' && node.context?.actorId === 'actor');
        const achievedLeylineAttack = attackTrace?.state === 'known' ? attackTrace.value?.value : null;
        const expected = mona.normal?.non_critical, actual = evaluated.totals.all.value?.value;
        const tolerance = Math.max(1e-6, Math.abs(expected) * 0.0002);
        row.cases.push({ level, ascension, talentLevel, flatAttack, rollId, roundingAdjustment, monaInput: input,
          leylineBuild: { level, ascension, weaponLevel: 1, weaponAscension: 0, talentLevel, artifacts: [artifact], inactiveWindows },
          effectiveAttack: { mona: achievedMonaAttack, leyline: achievedLeylineAttack,
            leylineMethod: 'evaluateStructuredHit attribute.attack trace', leylineTrace: attackTrace },
          target: { level: 90, resistance: 0.1, defenseReduction: 0, ordinaryDamageReduction: 0 },
          element: binding.element, mona: expected, leyline: actual, tolerance, requiredInputs: evaluated.requiredInputs });
        if (String(mona.element).toLowerCase() !== binding.element || !Number.isFinite(expected) || !Number.isFinite(actual) || !Number.isFinite(achievedLeylineAttack)
          || Math.abs(achievedMonaAttack - achievedLeylineAttack) > 1e-8
          || Math.abs(expected - actual) > tolerance || evaluated.requiredInputs?.length) throw new Error('Common-input damage, element or required facts differ');
      }
      row.status = 'matched';
      mappings.push({ id: 'common-input:' + branch.character + ':' + branch.index, disposition: 'matched', coverage: 'scenario', mona: [branch.id], leyline: [review.leyline[0]],
        explanation: '已独立核对命中身份；零命、一级及指定敌人下，以三条真实档位副词条的零级五星圣遗物设置攻击力，明确关闭记录中的无历史窗口；Mona 另以合成固定攻击增益修正基础值精度差，再由双方运行入口比较非暴击普通伤害。',
        sources: [...new Set([...review.sources, target.source, rollSource, upstreamRollSource, 'tools/lib/mona-common-input-batch.mjs',
          ...Object.keys(ordinaryInactiveWindows(character)).map(key => target.source.split('#')[0] + '#/facts/' + key.replaceAll('~', '~0').replaceAll('/', '~1'))])],
        comparisons: row.cases.map(item => ({ name: `Aligned attack +${item.flatAttack}`, expected: item.mona, actual: item.leyline, tolerance: item.tolerance })) });
    } catch (error) { row.reason = String(error?.message ?? error); }
  }
  return { rows, mappings, summary: { eligible: rows.length, reviewed: mappings.length, unresolved: rows.length - mappings.length },
    limitations: ['C0 level-1 noncritical normal damage with aligned attack only; other branches, event counts and timing remain open.'] };
}
