import { readContentSource } from './content-source.mjs';
import { probeMonaSkills } from './mona-calculation-probes.mjs';

const source = '.references/mona-community/beta-tools/runtime-7106.mjs';
const axes = { attack: 'atk_ratio', defense: 'def_ratio', hp: 'hp_ratio', elementalMastery: 'em_ratio' };
const normalize = value => String(value ?? '').replace(/[\s·：:，,。()（）]/g, '').toLowerCase();
const sum = object => Object.values(object ?? {}).reduce((total, value) => total + value, 0);
const equal = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.000051;

/** Compare only authored base scaling under Mona's default C0 configuration. */
export async function compareMonaOrdinaryScaling(monaRows, leylineRows, candidates, initialProbes = []) {
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const mona = new Map(monaRows.filter(row => row.kind === 'skill').map(row => [row.id, row]));
  const indexed = new Map(leylineRows.map(row => [row.id, row]));
  const documents = new Map(), probes = new Map(), rows = [];
  const initialBySkill = new Map(initialProbes.filter(row => row.constellation === 0).map(row => [row.skillId, row]));
  const ordered = [...candidates.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  for (const [skillId, hits] of ordered) {
    const skill = mona.get(skillId);
    if (!skill) continue;
    const candidateRows = hits.map(hit => typeof hit === 'string' ? indexed.get(hit)
      : indexed.get(hit.id) ?? (hit.binding ? hit : undefined)).filter(Boolean);
    if (!candidateRows.length) continue;
    const initial = initialBySkill.get(skillId) ?? (await probeMonaSkills({ characters: [skill.character], indices: [skill.index], constellations: [0] })).rows[0];
    for (const hit of candidateRows) {
      const out = { mona: skillId, leyline: hit.id, entity: hit.entity, revision: hit.revision, field: hit.field,
        source: hit.source, monaSource: skill.source, method: 'default-c0-scaling-only', status: 'unavailable', levels: [] };
      rows.push(out);
      const binding = hit.binding, definition = binding?.definition, terms = definition?.base;
      const groups = [...new Set((skill.occurrences ?? []).map(item => item.group))];
      const expectedGroup = ({ normal: 1, charged: 1, plunge: 1, skill: 2, burst: 3 })[binding?.category];
      const labels = (skill.occurrences ?? []).map(item => normalize(item.label));
      out.labelMatch = labels.includes(normalize(binding?.name));
      const talentGroup = Number(binding?.skillField?.split('/').at(-1)) + 1;
      if (!expectedGroup || !groups.some(group => group === expectedGroup || group === talentGroup)) { out.reason = 'skill-group-mismatch'; continue; }
      if (binding.family !== 'ordinary' || !Array.isArray(terms) || !terms.length || definition.when || definition.selection || binding.unlock) {
        out.reason = 'conditional-or-nonordinary'; continue;
      }
      if (terms.some(term => !axes[term.stat] || !term.parameter || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) {
        out.reason = 'unsupported-base-term'; continue;
      }
      if (initial?.status !== 'ok') { out.reason = 'runtime-initialization-failed'; out.error = initial?.error; continue; }
      if (!documents.has(hit.entity)) documents.set(hit.entity, readContentSource(new URL('../../src/game-data/data/characters/' + hit.entity + '.json', import.meta.url)));
      const document = documents.get(hit.entity);
      const talent = document.talents.find(item => item.id === binding.skillId);
      const params = terms.map(term => talent?.parameters.find(parameter => parameter.id === term.parameter));
      if (params.some(parameter => !parameter || !Array.isArray(parameter.values))) { out.reason = 'missing-parameter'; continue; }
      out.parameters = binding.parameters;
      const maxLevel = Math.min(15, ...params.map(parameter => parameter.values.length));
      for (let level = 1; level <= maxLevel; level++) {
        const key = skillId + ':' + level;
        if (!probes.has(key)) {
          const input = structuredClone(initial.input);
          for (const group of [1, 2, 3]) input.character['skill' + group] = level - 1;
          try { probes.set(key, { result: api.CalculatorInterface.get_damage_analysis(input, null) }); }
          catch (error) { probes.set(key, { error: String(error?.message ?? error) }); }
        }
        const probe = probes.get(key);
        if (probe.error) { out.levels.push({ level, error: probe.error }); continue; }
        const actual = {}, expected = Object.fromEntries(Object.values(axes).map(axis => [axis, 0]));
        for (const axis of Object.values(axes)) actual[axis] = sum(probe.result[axis]);
        for (const [index, term] of terms.entries()) expected[axes[term.stat]] += params[index].values[level - 1];
        const extraDamage = sum(probe.result.extra_damage);
        const element = String(probe.result.element ?? '').toLowerCase();
        const matches = Object.values(axes).every(axis => equal(actual[axis], expected[axis])) && equal(extraDamage, 0)
          && element === String(binding.element ?? '').toLowerCase() && !probe.result.is_heal && !probe.result.is_shield;
        out.levels.push({ level, actual, expected, extraDamage, element, matches });
      }
      const checked = out.levels.filter(level => !level.error);
      out.status = checked.length === maxLevel && checked.length > 0 && checked.every(level => level.matches) ? 'scaling-match'
        : checked.some(level => !level.matches) ? 'scaling-mismatch' : 'probe-error';
      out.levelCoverage = { checked: checked.length, expected: maxLevel };
      if (out.status === 'scaling-mismatch') out.levels = out.levels.filter(level => level.error || !level.matches).slice(0, 1);
    }
  }
  const summary = {};
  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;
  return { source, rows, summary, tolerance: 0.000051, scope: '默认零命配置的技能倍率。匹配项保留全部等级，其他项定位首个差异。同倍率候选仍需区分条件和命中。' };
}
