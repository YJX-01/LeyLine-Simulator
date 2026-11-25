const novice = { Sword: 'DullBlade', Claymore: 'WasterGreatsword', Polearm: 'BeginnersProtector', Bow: 'HuntersBow', Catalyst: 'ApprenticesNotes' };
const defaults = (name, fields) => fields?.length ? { [name]: Object.fromEntries(fields.map(field => [field.name, field.default])) } : 'NoConfig';
const artifacts = ['Flower', 'Feather', 'Sand', 'Goblet', 'Head'].map((slot, i) => ({
  id: i + 1, set_name: 'GladiatorsFinale', slot, level: 20, star: 5,
  main_stat: [i === 0 ? 'HPFixed' : i === 1 ? 'ATKFixed' : 'ATKPercentage', i === 0 ? 4780 : i === 1 ? 311 : .466],
  sub_stats: [['Recharge', .2], ['ElementalMastery', 20]],
}));

/** Probe published runtime; failures are records, not silently omitted. */
export async function probeMonaSkills({ characters: selected, constellations = [0, 6], indices, configure, scenarioId = 'default' } = {}) {
  const [{ api, read }, { visibleDamageReactionKeys }] = await Promise.all([
    import('../../.references/mona-community/beta-tools/runtime-7106.mjs'),
    import('../../.references/mona-community/src/algorithms/reaction-labels.mjs'),
  ]);
  const characters = read('src/assets/_gen_character.js');
  const rows = [];
  for (const name of (selected ?? Object.keys(characters)).slice().sort()) {
    const character = characters[name];
    if (!character) throw new Error(`Unknown Mona character: ${name}`);
    const available = [...new Set([1, 2, 3].flatMap(group => character[`skillMap${group}`].map(row => row.index)))].sort((a, b) => a - b);
    for (const constellation of constellations) for (const index of available.filter(i => !indices || indices.includes(i))) {
      const input = {
        character: { name, level: 90, ascend: false, constellation, skill1: 9, skill2: 9, skill3: 9, params: defaults(name, character.config) },
        weapon: { name: novice[character.weapon], level: 90, ascend: false, refine: 1, params: 'NoConfig' },
        skill: { index, config: defaults(name, character.configSkill) }, artifacts, enemy: null, buffs: [], artifact_config: null,
      };
      if (configure) configure(input, { name, index, constellation });
      const base = { scenarioId, skillId: `mona:skill:${name}:${index}`, character: name, index, constellation, input };
      try {
        const result = api.CalculatorInterface.get_damage_analysis(input, null);
        const keys = visibleDamageReactionKeys(result);
        rows.push({ ...base, status: 'ok', analysis: result, branches: keys.map(key => ({ key, result: result[key] })), reactionAvailability: result.reaction_availability ?? null });
      } catch (error) {
        rows.push({ ...base, status: 'error', error: String(error?.message ?? error) });
      }
    }
  }
  return { source: '.references/mona-community/beta-tools/runtime-7106.mjs', rows, limitations: ['Default configurations at the specified constellations only; unobserved branches are unknown.', 'Visible reaction keys follow Mona UI filtering; other runtime fields are not enumerated.'] };
}

// Ignore insignificant floating-point drift while retaining original changed values.
function differences(before, after, path = '') {
  if (Object.is(before, after)) return [];
  if (typeof before === 'number' && typeof after === 'number' && Number.isFinite(before) && Number.isFinite(after) && Math.abs(before - after) <= 1e-12 * Math.max(1, Math.abs(before), Math.abs(after))) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => differences(before[key], after[key], `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`));
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}
function alternate(field) {
  const value = field.default;
  if (typeof value === 'boolean') return !value;
  if (field.type === 'option' && Array.isArray(field.options) && field.options.length > 1) return value === 0 ? 1 : 0;
  if (typeof value === 'number') {
    if (typeof field.max === 'number' && field.max !== value) return field.max;
    if (typeof field.min === 'number' && field.min !== value) return field.min;
    if (field.type === 'floatPercentageInput') return value === 1 ? .5 : 1;
    return value === 1 ? 2 : 1;
  }
  if (Array.isArray(value)) return value.length ? [] : null;
  return null;
}
function namedBuff(name, params) {
  return { name, config: Object.keys(params).length ? { [name]: params } : 'NoConfig' };
}
function safeCall(fn) {
  try { return { status: 'ok', value: fn() }; }
  catch (error) { return { status: 'error', error: String(error?.message ?? error) }; }
}

/** Actual release comparisons. Zero delta describes this scenario only, never absence of an effect. */
export async function probeMonaBuffs({ keys, recipients = ['Bennett', 'Lisa'], vary = true, skillProbes } = {}) {
  const { api, read } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const catalog = read('src/assets/_gen_buff.js');
  const selected = (keys ?? Object.keys(catalog)).slice().sort();
  for (const key of selected) if (!catalog[key]) throw new Error(`Unknown Mona buff: ${key}`);
  const fixtures = skillProbes ?? await probeMonaSkills({ characters: recipients, constellations: [0] });
  const inputs = Object.fromEntries(recipients.map(name => {
    const row = fixtures.rows.find(item => item.character === name && item.constellation === 0 && item.status === 'ok');
    if (!row) throw new Error(`No successful default skill fixture for ${name}`);
    return [name, row.input];
  }));
  const rows = [];
  for (const recipient of recipients) {
    const baseInput = inputs[recipient];
    const baseline = {
      attribute: safeCall(() => api.CommonInterface.get_attribute(structuredClone(baseInput))),
      damage: safeCall(() => api.CalculatorInterface.get_damage_analysis(structuredClone(baseInput), null)),
    };
    for (const key of selected) {
      const fields = catalog[key].config ?? [];
      const defaults = Object.fromEntries(fields.map(field => [field.name, structuredClone(field.default)]));
      const cases = [{ id: 'default', params: defaults }];
      if (vary) for (const field of fields) {
        const value = alternate(field);
        if (value !== null && !Object.is(value, field.default)) cases.push({ id: `vary:${field.name}`, params: { ...defaults, [field.name]: value }, varied: { field: field.name, from: field.default, to: value } });
      }
      let defaultCalls;
      for (const scenario of cases) {
        const buff = namedBuff(key, scenario.params);
        const input = { ...baseInput, buffs: [buff] };
        const locked = { ...baseInput, buffs: [{ ...buff, lock: true }] };
        const calls = {
          attribute: safeCall(() => api.CommonInterface.get_attribute(structuredClone(input))),
          damage: safeCall(() => api.CalculatorInterface.get_damage_analysis(structuredClone(input), null)),
          lockedAttribute: safeCall(() => api.CommonInterface.get_attribute(structuredClone(locked))),
          lockedDamage: safeCall(() => api.CalculatorInterface.get_damage_analysis(structuredClone(locked), null)),
        };
        const comparison = {};
        for (const [field, reference] of [['attribute', 'attribute'], ['damage', 'damage'], ['lockedAttribute', 'attribute'], ['lockedDamage', 'damage']]) {
          const result = calls[field], original = baseline[reference];
          comparison[field] = result.status === 'ok' && original.status === 'ok'
            ? { status: 'ok', changes: differences(original.value, result.value) }
            : { status: 'error', error: result.error ?? original.error, baselineError: original.error ?? null };
        }
        if (scenario.id === 'default') defaultCalls = calls;
        else {
          comparison.variationFromDefault = {};
          for (const field of ['attribute', 'damage']) {
            const reference = defaultCalls[field], current = calls[field];
            comparison.variationFromDefault[field] = reference.status === 'ok' && current.status === 'ok'
              ? { status: 'ok', changes: differences(reference.value, current.value) }
              : { status: 'error', error: current.error ?? reference.error };
          }
        }
        rows.push({ id: `mona:buff-probe:${key}:${recipient}:${scenario.id}`, buffId: `mona:buff:${key}`, recipient, skill: baseInput.skill, scenario, input, comparison });
      }
    }
  }
  return {
    source: '.references/mona-community/beta-tools/runtime-7106.mjs', fixtures: inputs, rows,
    limitations: [
      'The selected default recipients and skills exercise only specific scope and timing; zero change does not establish that a buff has no effect.',
      'Each variation changes one declared field to a mechanically chosen alternative; invalid alternatives are retained as errors, and combinations and recipient conditions remain open.',
      'The compared panel and damage outputs can omit native or specialized effects; matching numeric outputs are not evidence of equivalent behavior.',
    ],
  };
}
