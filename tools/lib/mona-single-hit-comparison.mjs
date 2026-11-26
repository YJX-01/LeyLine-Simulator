import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentSource } from './content-source.mjs';
import { leylineSingleHitInventory, monaCalculationInventory, probeMonaBuffs, probeMonaSkills } from './mona-inventory-probes.mjs';
import { auditMonaAino, auditMonaBuffScenarios, batchMonaBuffs } from './mona-buff-audit.mjs';
import { auditMonaArtifactEvents, auditMonaEquipmentHits, auditMonaSets, loadScopedEquipmentEvents, reviewMonaEquipmentBatch } from './mona-equipment-audit.mjs';
import {
  auditMonaAmplificationBatch,
  auditMonaCommonInputBranches,
  auditMonaDuplicateMenuArms,
  auditMonaFixedOpenSkills,
  auditMonaOrdinaryBatch,
  auditMonaOrdinaryC6,
  auditMonaWrongOrdinaryArms,
  auditTravelerNormalScenarios,
  compareMonaOrdinaryScaling,
} from './mona-ordinary-audit.mjs';
import { auditMonaTransformative, validateMonaTransformativeReviews } from './mona-transformative-audit.mjs';
import { loadSpecBuffScenarios, loadSpecFourPieceScenarios, loadSpecHitScenarios } from './mona-entity-specs.mjs';
import { runSpecBuffScenarios, runSpecFourPieceScenarios, runSpecHitScenarios } from './mona-spec-runner.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const identitySource = 'tools/data/sources/catalog/mona-community/catalog.json';
const formSource = 'tools/data/sources/character-text/base-and-manekin.json';
const travelerSource = 'tools/data/sources/catalog/enka/catalog.json';
const start = {
  mona: '589ac6919057709924c0c20d5a9d673fe9b0be1a',
  leyline: '829d19df0b96113c22016e5bde9ad5744817a260',
};
const reviewDirectory = `tools/data/sources/mona-community/${start.mona}`;
const familyByOutput = {
  normal: 'ordinary', melt: 'ordinary', vaporize: 'ordinary', spread: 'ordinary', aggravate: 'ordinary',
  direct_moonelectro: 'lunar-charged', direct_moonbloom: 'lunar-bloom', direct_mooncrystallize: 'lunar-crystallize',
  direct_stellarconduct: 'stellar-conduct', direct_stellarswirl: 'stellar-swirl',
};
const statTargets = {
  ATKFixed: 'attack', ATKPercentage: 'attackPercent', HPFixed: 'hp', HPPercentage: 'hpPercent',
  DEFFixed: 'defense', DEFPercentage: 'defensePercent', ElementalMastery: 'elementalMastery',
  Recharge: 'energyRecharge', CriticalAttacking: 'critRate', CriticalDamageBase: 'critDamage',
  HealingBonus: 'healingBonus', ShieldStrength: 'shieldStrength', BonusBase: 'damageBonus',
  ExtraDamageNormalAttack: 'baseDamageBonus', ExtraDamageBase: 'baseDamageBonus',
  IndependentBaseMultiplier: 'baseMultiplier', DefPenetration: 'defenseIgnore',
  CriticalBase: 'critRate', ElementalMasteryExtra: 'elementalMastery', IncomingHealingBonus: 'incomingHealingBonus',
  EnhanceVaporize: 'amplifyingReactionBonus', EnhanceAggravate: 'additiveReactionBonus', EnhanceSpread: 'additiveReactionBonus',
  StellarSwirlBonus: 'reaction.stellar-swirl.damageBonus', StellarSwirlBaseBonus: 'reaction.stellar-swirl.baseBonus',
  StellarSwirlElevation: 'reaction.stellar-swirl.elevation', StellarConductBaseBonus: 'reaction.stellar-conduct.baseBonus',
};
const elements = ['Anemo', 'Cryo', 'Dendro', 'Electro', 'Geo', 'Hydro', 'Physical', 'Pyro'];

function indexBy(items, key) {
  const index = new Map();
  for (const item of items) {
    const value = key(item);
    const group = index.get(value) ?? [];
    group.push(item);
    index.set(value, group);
  }
  return index;
}

function identityIndex() {
  const catalog = readContentSource(resolve(root, identitySource));
  const forms = readContentSource(resolve(root, formSource)).bindings;
  const travelers = new Map(Object.entries(readContentSource(resolve(root, travelerSource)).mapping.characters).map(([key, form]) => [form.id, key]));
  const identities = new Map();
  for (const [kind, group] of [['character', 'characters'], ['weapon', 'weapons'], ['set', 'sets']]) {
    for (const [index, entry] of catalog[group].entries()) {
      const match = kind === 'character' && /^(Aether|Lumine|Manekina)(Anemo|Cryo|Dendro|Electro|Geo|Hydro|Pyro)$/.exec(entry.monaKey);
      const form = match && `${match[1]}-${match[2]}`.toLowerCase();
      const formRef = form && (Object.hasOwn(forms, form) ? `${formSource}#/bindings/${form}`
        : travelers.has(form) ? `${travelerSource}#/mapping/characters/${travelers.get(form)}` : null);
      const entity = entry.canonicalId ?? (formRef ? form : null);
      const identity = { kind, entity, sources: [`${identitySource}#/${group}/${index}`] };
      if (formRef && entity === form) identity.sources.push(formRef);
      for (const key of [entry.monaKey, entry.exportName].filter(Boolean)) identities.set(`${kind}:${key}`, identity);
    }
  }
  return identities;
}

function labelKey(label) {
  return label?.normalize('NFKC').toLowerCase().replace(/\(第(\d+)击\)/g, '$1').replace(/[^\p{L}\p{N}]/gu, '') ?? '';
}

function effectTargets(attribute) {
  if (typeof attribute !== 'string') return [];
  if (attribute === 'DefMinus' || attribute === 'DefMinusBase') return ['target.defenseReduction'];
  if (attribute === 'ATKFixed') return ['attribute.attack', 'attribute.flatAttack'];
  if (attribute === 'DEFFixed') return ['attribute.defense', 'attribute.flatDefense'];
  if (/^ExtraDmg(Base|NormalAttack|ChargedAttack|PlungingAttack|ElementalSkill|ElementalBurst|Anemo|Geo|Cryo)$/.test(attribute)) return ['attribute.baseDamageBonus'];
  if (/^Bonus(NormalAttack|ChargedAttack|PlungingAttack|PlungingImpact|ElementalSkill|ElementalBurst)$/.test(attribute)) return ['attribute.damageBonus'];
  if (Object.hasOwn(statTargets, attribute)) return ['attribute.' + statTargets[attribute]];
  for (const element of elements) {
    if (attribute === 'Bonus' + element) return ['attribute.' + element.toLowerCase() + 'Bonus'];
    if (attribute === 'ResMinus' + element) return ['target.resistance.' + element.toLowerCase()];
  }
  return [];
}

function ownerOf(row, before, identities, prefixes) {
  const source = row.parentId && before.get(row.parentId);
  const character = row.character ?? source?.character;
  if (character) return identities.get('character:' + character);
  if (row.kind === 'input') return identities.get(`${row.ownerType === 'artifact' ? 'set' : row.ownerType}:${row.owner}`);
  if (row.kind === 'equipment-event') return identities.get('weapon:' + row.key) ?? identities.get('set:' + row.key);
  if (row.kind === 'set-threshold' || row.kind === 'set-stat-effect') return identities.get('set:' + row.key);
  if (row.type === 'weapon-fields' || row.type === 'artifact-set' || row.type === 'character') {
    const kind = { 'weapon-fields': 'weapon', 'artifact-set': 'set', character: 'character' }[row.type];
    return identities.get(`${kind}:${row.key}`);
  }
  const buff = row.kind === 'buff' ? row : before.get('mona:buff:' + row.key);
  const kind = { Character: 'character', Weapon: 'weapon', Artifact: 'set', ArtifactSet: 'set' }[buff?.genre];
  if (buff?.genre === 'Resonance') return { kind: 'resonance', entity: 'resonances', sources: [] };
  if (!kind) return undefined;
  return prefixes[kind].find(([key]) => buff.key.startsWith(key))?.[1];
}

/** Candidate links use catalog identities, never label similarity across entities. */
export function singleHitCandidates(monaRows, leylineRows, identities = identityIndex()) {
  const before = new Map(monaRows.map(row => [row.id, row]));
  const byOwner = indexBy(leylineRows, row => `${row.kind}:${row.entity}`);
  const prefixes = Object.fromEntries(['character', 'weapon', 'set'].map(kind => [kind, [...identities]
    .filter(([key, identity]) => key.startsWith(kind + ':') && identity.entity)
    .map(([key, identity]) => [key.slice(kind.length + 1), identity])
    .sort(([a], [b]) => b.length - a.length || a.localeCompare(b, 'en'))]));
  const candidates = new Map();
  const owners = new Map();
  const add = (id, target, reasons) => {
    const group = candidates.get(id) ?? [];
    group.push({ id: target.id, reasons });
    candidates.set(id, group);
  };
  for (const row of monaRows) {
    if (['action', 'entry-point', 'input'].includes(row.kind)) continue;
    const skill = row.kind === 'skill' ? row : row.kind === 'output-branch' ? before.get(row.parentId) : undefined;
    const owner = ownerOf(row, before, identities, prefixes);
    if (owner) owners.set(row.id, owner);
    const targets = (owner?.entity && byOwner.get(`${owner.kind}:${owner.entity}`)) || [];
    if (skill) {
      const slots = new Set(skill.occurrences.map(entry => entry.group - 1));
      const names = new Set(skill.occurrences.map(entry => labelKey(entry.label)).filter(Boolean));
      const family = familyByOutput[row.branch];
      if (row.output === 'healing' || row.output === 'shield') {
        for (const target of targets.filter(target => target.clause?.subject === 'detail' && names.has(labelKey(target.clause.name)))) {
          add(row.id, target, ['目录身份', '详情名称']);
        }
        continue;
      }
      for (const target of targets) {
        if (target.subject !== 'hit') continue;
        const binding = target.binding.family;
        const targetFamilies = typeof binding === 'string' ? [binding] : Object.values(binding.cases);
        if (family && !targetFamilies.includes(family)) continue;
        const sameSlot = slots.has(Number(target.binding.skillField.split('/').at(-1)));
        const sameLabel = names.has(labelKey(target.binding.name));
        if (sameSlot || sameLabel) add(row.id, target, ['目录身份', ...(sameSlot ? ['天赋组'] : []), ...(sameLabel ? ['名称'] : []), ...(family ? ['输出族'] : [])]);
      }
    } else if (row.kind === 'set-threshold' || row.kind === 'set-stat-effect') {
      const pieces = row.kind === 'set-threshold' ? row.pieces : 2;
      for (const target of targets.filter(target => target.binding?.pieces === pieces)) {
        if (row.kind === 'set-stat-effect' && target.binding.modifier?.target !== 'attribute.' + row.attribute) continue;
        add(row.id, target, ['套装身份', '件数门槛']);
      }
    } else if (row.kind === 'equipment-event') {
      for (const target of targets.filter(target => target.subject === 'equipment-hit' || owner?.kind === 'set' && target.subject === 'modifier'
        && target.binding.modifier.target === 'attribute.baseDamageBonus')) add(row.id, target, ['装备身份', '附伤或基础加值']);
    } else if (row.kind === 'reaction-field' && row.output === 'damage') {
      const family = row.key.startsWith('swirl_') ? 'swirl' : row.key === 'overload' ? 'overloaded' : row.key.replaceAll('_', '-');
      for (const target of byOwner.get('reaction:reactions') ?? []) {
        if (target.binding?.identity?.id === 'attribute.reaction.' + family + '.coefficient') add(row.id, target, ['剧变反应系数']);
      }
    } else if (['buff', 'effect', 'automatic-rule'].includes(row.kind) || row.kind === 'open' && row.key) {
      const attributes = effectTargets(row.effect?.attribute ?? row.attribute);
      for (const target of targets.filter(target => target.subject === 'modifier')) {
        if (!attributes.length || attributes.includes(target.binding.modifier.target)) add(row.id, target, ['授予者身份', ...(attributes.length ? ['修饰属性'] : [])]);
      }
    }
  }
  return { candidates, owners };
}

function resolveEvidence(ref) {
  if (typeof ref !== 'string' || !ref) return false;
  const [filename, pointer] = ref.replace(/:\d+(?:-\d+)?$/, '').split('#', 2);
  if (isAbsolute(filename)) return false;
  const path = resolve(root, filename);
  const localPath = relative(root, path);
  if (isAbsolute(localPath) || localPath.startsWith('..') || !existsSync(path)) return false;
  if (!pointer?.startsWith('/') || !filename.endsWith('.json')) return true;
  let value = readContentSource(path);
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    if (value == null || !Object.hasOwn(value, key)) return false;
    value = value[key];
  }
  return true;
}

function closedComparisons(cases) {
  return Array.isArray(cases) && cases.length > 0 && cases.every(({ expected, actual, tolerance }) =>
    [expected, actual, tolerance].every(Number.isFinite) && tolerance >= 0 && Math.abs(expected - actual) <= tolerance);
}

export function reviewLinks(reviews, before, after, issues) {
  const links = [];
  const ids = new Set();
  const evidence = new Map();
  function resolves(ref) {
    if (!evidence.has(ref)) evidence.set(ref, resolveEvidence(ref));
    return evidence.get(ref);
  }
  for (const review of reviews) {
    const { id, disposition, mona, leyline, explanation, sources, comparisons } = review;
    const requiredSides = { matched: [true, true], different: [true, true], 'mona-only': [true, false], 'leyline-only': [false, true] }[disposition];
    const issue = !id || ids.has(id) ? '复核记录标识缺失或重复'
      : !requiredSides || !Array.isArray(mona) || !Array.isArray(leyline) || !!mona.length !== requiredSides[0] || !!leyline.length !== requiredSides[1] ? '复核结论与两侧引用不符'
      : mona.some(key => !before.has(key)) ? 'Mona 条目引用无法解析'
      : leyline.some(target => !after.has(target.id) || after.get(target.id).revision !== target.revision) ? 'LeyLine 条目引用无法解析或修订已变更'
      : typeof explanation !== 'string' || !explanation.trim() || !Array.isArray(sources) || !sources.length || !sources.every(resolves) ? '复核引用缺失或无法解析'
      : requiredSides[1] && !closedComparisons(comparisons) ? '缺少通过的独立数值对照' : null;
    if (issue) {
      issues.push({ id, mona, leyline, issue });
      continue;
    }
    ids.add(id);
    links.push(review);
  }
  return links;
}

function assertUnique(rows, side, issues) {
  const byId = indexBy(rows, row => row.id);
  for (const [id, items] of byId) if (!id || items.length !== 1) issues.push({ side, id, issue: '目录条目标识缺失或重复' });
  return new Map([...byId].map(([id, [row]]) => [id, row]));
}

function countBy(rows, key) {
  return Object.fromEntries([...indexBy(rows, key)].map(([name, items]) => [name, items.length]));
}

function mechanismOf(row, parents) {
  if (row.kind === 'open' && row.parentId) return 'inspect/' + (parents.get(row.parentId)?.kind ?? 'probe');
  if (row.kind === 'output-branch') return 'output/' + row.output + '/' + row.branch;
  if (row.kind === 'skill') return 'skill/talent-' + [...new Set(row.occurrences.map(entry => entry.group))].join('-');
  if (row.kind === 'effect') {
    const stat = typeof row.effect.attribute === 'string' ? row.effect.attribute : 'conditional-attribute';
    return ['effect', stat, row.effect.value?.op ?? (typeof row.effect.value === 'number' ? 'constant' : 'expression')].join('/');
  }
  if (row.kind === 'set-threshold') return 'set/' + row.pieces + '-piece';
  if (row.kind === 'set-stat-effect') return 'set/2-piece/' + row.attribute;
  if (row.kind === 'automatic-rule') return 'grant/' + row.type;
  if (row.kind === 'buff') return 'buff/' + row.genre;
  if (row.kind === 'equipment-event' || row.kind === 'reaction-field') return row.kind;
  if (row.subject === 'hit' || row.subject === 'equipment-hit') {
    const definition = row.binding.definition;
    const family = definition.family ?? 'ordinary';
    const stats = Array.isArray(definition.base) ? [...new Set(definition.base.map(term => term.stat))].sort().join('+') : '';
    return [row.subject, typeof family === 'string' ? family : 'conditional-family', stats || 'custom',
      definition.when || row.binding.unlock ? 'gated' : 'base'].join('/');
  }
  if (row.subject === 'modifier') {
    const { buff, modifier } = row.binding;
    const recipient = typeof buff.recipient === 'string' ? buff.recipient : buff.recipient ? 'filtered' : 'owner';
    const formula = typeof modifier.value === 'number' ? 'constant' : modifier.value?.call ?? 'expression';
    return ['modifier', modifier.target, recipient, formula, buff.trigger?.kind ?? (buff.condition ? 'condition' : 'granted')].join('/');
  }
  if (row.clause) return 'clause/' + row.clause.subject + '/' + row.clause.status;
  return row.subject ?? row.kind;
}

/** Build the same mapping in both directions. Candidate links and reviews have distinct states. */
export function buildSingleHitComparison(monaInventory, leylineInventory, reviews = [], issues = [],
  matches = singleHitCandidates(monaInventory.rows, leylineInventory.rows)) {
  const before = assertUnique(monaInventory.rows, 'mona', issues);
  const after = assertUnique(leylineInventory.rows, 'leyline', issues);
  const { candidates, owners } = matches;
  const links = reviewLinks(reviews, before, after, issues);
  const fullLinks = new Set(links.filter(link => link.coverage !== 'scenario').map(link => link.id));
  const mappedStatus = mapped => mapped.some(id => fullLinks.has(id)) ? 'reviewed' : 'partial';
  const monaLinks = new Map();
  const leylineLinks = new Map();
  function append(index, key, value) {
    const list = index.get(key) ?? [];
    list.push(value);
    index.set(key, list);
  }
  for (const link of links) {
    for (const id of link.mona) append(monaLinks, id, link.id);
    for (const { id } of link.leyline) append(leylineLinks, id, link.id);
  }
  const reverse = new Map();
  for (const [id, entries] of candidates) for (const entry of entries) append(reverse, entry.id, { ...entry, id });
  const mona = monaInventory.rows.map(row => {
    const identity = owners.get(row.id);
    const mapped = monaLinks.get(row.id) ?? [];
    const options = candidates.get(row.id) ?? [];
    const parent = before.get(row.parentId);
    const label = parent?.occurrences?.map(entry => entry.label).join(' ');
    const scopedOutput = row.kind === 'output-branch' && row.branch === 'normal' && Number.isFinite(row.result?.non_critical) &&
      (row.output === 'healing' && row.result.is_heal && !row.result.is_shield && /治疗|回复量|回复生命值/.test(label)
      || row.output === 'shield' && row.result.is_shield && !row.result.is_heal && /护盾吸收量/.test(label));
    const reference = scopedOutput || ['entry-point', 'input', 'action'].includes(row.kind);
    const status = mapped.length ? mappedStatus(mapped) : reference ? 'reference' : options.length ? 'candidate' : 'unmatched';
    return { ...row, ...(identity ? { identity } : {}), ...(scopedOutput ? { scope: { kind: row.output, label, source: parent.source,
      reason: '此配置的菜单名称与内核输出均标明治疗或护盾数值。相关授予、转化为伤害的效果及其他配置分别核对。' } } : {}),
      status, links: mapped, candidates: options };
  });
  const leyline = leylineInventory.rows.map(row => {
    const mapped = leylineLinks.get(row.id) ?? [];
    const options = reverse.get(row.id) ?? [];
    const reference = row.bindingId || ['timeline-only', 'non-numeric'].includes(row.clause?.status);
    const status = mapped.length ? mappedStatus(mapped) : reference ? 'reference' : options.length ? 'candidate' : 'unmatched';
    return { ...row, status, links: mapped, candidates: options };
  });
  const summarize = rows => ({ total: rows.length, byStatus: countBy(rows, row => row.status) });
  const pendingRow = row => ['partial', 'candidate', 'unmatched'].includes(row.status);
  const open = rows => rows.filter(pendingRow).map(row => row.id);
  const gaps = { mona: open(mona), leyline: open(leyline), issues };
  const summary = { mona: { ...summarize(mona), byKind: countBy(mona, row => row.kind) },
    leyline: { ...leylineInventory.summary, ...summarize(leyline) }, reviewed: links.length,
    monaPending: gaps.mona.length, leylinePending: gaps.leyline.length, issues: issues.length,
    complete: !gaps.mona.length && !gaps.leyline.length && !issues.length };
  const packets = [];
  for (const [side, rows] of [['mona', mona], ['leyline', leyline]]) {
    const pending = rows.filter(pendingRow);
    for (const [mechanism, group] of indexBy(pending, row => mechanismOf(row, before))) {
      packets.push({ side, mechanism, count: group.length, entities: [...new Set(group.map(row => row.entity ?? row.identity?.entity).filter(Boolean))].sort(),
        ids: group.map(row => row.id) });
    }
  }
  return { baselines: start, summary, mona, leyline, links, gaps, packets, limitations: monaInventory.limitations };
}

function monaRevision(checkout) {
  if (!existsSync(resolve(checkout, '.git'))) return null;
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/** Identify the exact worktree used by both focused and full reports. */
export function auditWorktree(directory) {
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  const revision = git('rev-parse', 'HEAD').trim();
  const changed = new Set([git('diff', '--name-only', '-z', 'HEAD'), git('ls-files', '--others', '--exclude-standard', '-z')]
    .flatMap(paths => paths.split('\0').filter(Boolean)));
  const hash = createHash('sha256').update(revision);
  for (const relativePath of [...changed].sort()) {
    const file = resolve(directory, relativePath);
    const digest = existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'removed';
    hash.update('\0' + relativePath + '\0' + digest);
  }
  return { revision, dirty: changed.size > 0, worktree: hash.digest('hex') };
}

export function readReviews() {
  return readdirSync(resolve(root, reviewDirectory), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name).sort().flatMap(name => {
      const path = `${reviewDirectory}/${name}`;
      const source = readContentSource(resolve(root, path));
      return (source.mappings ?? []).map(review => ({ ...review, record: path }));
    });
}

function reviewExclusiveFormHits(monaRows, leylineRows) {
  const { bindings } = readContentSource(resolve(root, formSource));
  const monaForms = new Set(monaRows.filter(row => row.kind === 'skill').map(row => row.character.toLowerCase()));
  const mappings = [];
  for (const row of leylineRows) {
    if (row.subject !== 'hit' || !Object.hasOwn(bindings, row.entity) || monaForms.has(row.entity.replaceAll('-', ''))) continue;
    const comparison = row.evidence?.comparison;
    const ref = row.evidence?.refs?.find(value => value.startsWith('evaluatedHits#'));
    if (row.evidence?.status !== 'available' || !ref || !Number.isFinite(comparison?.expected) || !Number.isFinite(comparison.value)) continue;
    mappings.push({
      id: 'exclusive-form:' + row.binding.hitId, disposition: 'leyline-only', mona: [], leyline: [{ id: row.id, revision: row.revision }],
      sources: [formSource + '#/bindings/' + row.entity, row.source, '.references/mona-community/src/assets/_gen_character.js'],
      explanation: '正式形态目录与固定 Mona 角色菜单逐形态核对。此形态单独登记，命中通过计算器入口与独立算式验算。',
      comparisons: [{ name: ref, expected: comparison.expected, actual: comparison.value, tolerance: Math.max(1e-8, Math.abs(comparison.expected) * 1e-8) }],
    });
  }
  return mappings;
}

export async function auditMonaSingleHit(entities, clauseInventory, engine) {
  const leyline = await leylineSingleHitInventory(entities, clauseInventory);
  const issues = [];
  const checkout = resolve(root, '.references/mona-community');
  const revision = monaRevision(checkout);
  if (revision !== start.mona) {
    issues.push({ side: 'mona', issue: '缺少固定版本的 Mona 发布目录', expected: start.mona, actual: revision });
    return buildSingleHitComparison({ rows: [] }, leyline, [], issues);
  }
  const probes = await probeMonaSkills();
  const steadyCore = await probeMonaSkills({ characters: ['Mitya'], indices: [12, 13], scenarioId: 'steady-4-beacons',
    configure: input => Object.assign(input.character.params.Mitya, { core_mode: 1, beacons: 4 }) });
  const mona = await monaCalculationInventory({ probes: { ...probes, rows: [...probes.rows, ...steadyCore.rows] } });
  const skills = mona.rows.filter(row => row.kind === 'skill').length;
  const buffs = mona.rows.filter(row => row.kind === 'buff').length;
  if (skills !== 2167 || buffs !== 268 || probes.rows.length !== skills * 2) {
    issues.push({ side: 'mona', issue: '发布目录或探针数量与固定基线不符', skills, buffs, probes: probes.rows.length });
  }
  const { two: sets, four: fourPiece } = await auditMonaSets(leyline.rows, entities, engine);
  const inventory = { ...mona, rows: [...mona.rows, ...sets.monaRows, ...fourPiece.monaRows] };
  const matches = singleHitCandidates(inventory.rows, leyline.rows);
  const options = matches.candidates;
  const [ordinaryScaling, buffProbes, equipment, transformative, aino] = await Promise.all([
    compareMonaOrdinaryScaling(mona.rows, leyline.rows, options, probes.rows), probeMonaBuffs({ skillProbes: probes }),
    auditMonaEquipmentHits(leyline.rows), auditMonaTransformative(entities, engine), auditMonaAino(),
  ]);
  const ordinary = await auditMonaOrdinaryBatch(mona.rows, leyline.rows, options, ordinaryScaling, entities, engine);
  const ordinaryC6 = await auditMonaOrdinaryC6(mona.rows, leyline.rows, ordinary, entities, engine);
  const fixedSkills = await auditMonaFixedOpenSkills(mona.rows, leyline.rows, ordinary, ordinaryC6);
  const ordinarySourceDifferences = await auditMonaWrongOrdinaryArms(mona.rows, leyline.rows, options, ordinaryScaling, entities, engine);
  const duplicateMenus = await auditMonaDuplicateMenuArms(mona.rows, leyline.rows, entities, engine);
  ordinarySourceDifferences.mappings.push(...duplicateMenus.mappings);
  const amplification = await auditMonaAmplificationBatch(mona.rows, leyline.rows, ordinary, entities, engine);
  const { resonance, characters: characterBuffs } = await auditMonaBuffScenarios(entities, engine);
  const buffBatch = batchMonaBuffs(mona.rows, leyline.rows, options, { resonanceAudit: resonance, characterAudit: characterBuffs });
  const gear = await reviewMonaEquipmentBatch(leyline.rows, entities, engine, equipment);
  const artifactEvents = await auditMonaArtifactEvents(leyline.rows, entities, engine);
  const specBuffs = await runSpecBuffScenarios({ scenarios: loadSpecBuffScenarios(), entities, engine, leylineRows: leyline.rows });
  const specHits = await runSpecHitScenarios({ scenarios: loadSpecHitScenarios(), entities, engine, leylineRows: leyline.rows });
  const specFourPiece = await runSpecFourPieceScenarios({ scenarios: loadSpecFourPieceScenarios(), entities, engine, leylineRows: leyline.rows });
  const forms = reviewExclusiveFormHits(mona.rows, leyline.rows);
  const reviewed = [ordinary, ordinaryC6, fixedSkills, ordinarySourceDifferences, amplification, buffBatch, gear, artifactEvents, sets, fourPiece, specBuffs, specHits, specFourPiece];
  const reviews = readReviews();
  const reactions = validateMonaTransformativeReviews(reviews.filter(row => row.id.startsWith('transformative-')), transformative, leyline.rows);
  issues.push(...reactions.issues);
  const initialReviews = [
    ...reviews.filter(row => !row.id.startsWith('transformative-')), ...reactions.reviews,
    ...reviewed.flatMap(batch => batch.mappings), ...forms,
  ];
  const before = new Map(inventory.rows.map(row => [row.id, row]));
  const after = new Map(leyline.rows.map(row => [row.id, row]));
  const accepted = reviewLinks(initialReviews, before, after, issues);
  const commonInputs = await auditMonaCommonInputBranches(mona.rows, leyline.rows, accepted, entities, engine);
  const commonInputsC6 = await auditMonaCommonInputBranches(mona.rows, leyline.rows, accepted, entities, engine, { constellation: 6 });
  const travelerNormal = await auditTravelerNormalScenarios(mona.rows, leyline.rows, entities, engine);
  const scenarioLinks = reviewLinks([...commonInputs.mappings, ...commonInputsC6.mappings, ...travelerNormal.mappings], before, after, issues);
  const result = buildSingleHitComparison(inventory, leyline, [...accepted, ...scenarioLinks], issues, matches);
  const batches = { commonInputs, commonInputsC6, travelerNormal, ordinary, ordinaryC6, fixedSkills, ordinarySourceDifferences, duplicateMenus, amplification, buffs: buffBatch,
    resonance, characterBuffs, equipmentDamage: gear.damage, artifactEvents, sets, fourPiece, specBuffs, specHits, specFourPiece };
  result.summary.batches = { commonInputs: commonInputs.summary, commonInputsC6: commonInputsC6.summary, travelerNormal: travelerNormal.summary, ordinary: ordinary.summary, ordinaryC6: ordinaryC6.summary, fixedSkills: fixedSkills.summary,
    ordinarySourceDifferences: ordinarySourceDifferences.summary, amplification: amplification.summary, buffs: buffBatch.summary,
    resonance: resonance.summary, sets: sets.summary, fourPiece: fourPiece.summary, exclusiveFormHits: forms.length,
    characterBuffs: characterBuffs.summary, artifactEvents: artifactEvents.rows.length,
    specBuffs: specBuffs.summary, specHits: specHits.summary, specFourPiece: specFourPiece.summary,
    equipment: { ...equipment.summary, ...gear.summary, damage: gear.damage.summary },
    transformative: transformative.summary, transformativeReviews: reactions.summary };
  result.summary.ordinaryScaling = ordinaryScaling.summary;
  result.summary.buffScenarios = buffProbes.rows.length;
  result.summary.equipment = equipment.summary;
  result.summary.transformative = transformative.summary;
  const scopedEquipmentEvents = loadScopedEquipmentEvents().filter(record => before.has(record.mona) && after.has(record.leyline));
  return { ...result, batches: { ...Object.fromEntries(Object.entries(batches).map(([name, batch]) => [name, batch.rows])), scopedEquipmentEvents },
    ordinaryScaling, buffProbes, equipment, transformative, aino };
}
