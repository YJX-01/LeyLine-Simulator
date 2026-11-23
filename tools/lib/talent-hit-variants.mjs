import { existsSync } from 'node:fs';
import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { auditBuild, auditHit, novice, number, setAuditDefaults } from './roster-audit-settings.mjs';
import { readContentSource } from './content-source.mjs';

const capture = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const ratesPath = capture + 'stats/talents.json';
const detailPath = 'tools/data/sources/catalog/talent-hit-variants.json';
const identitiesPath = 'tools/data/sources/catalog/genshin-db/';
const depotPath = 'tools/data/sources/character-text/base-and-manekin.json';
const yanfeiC6Path = capture + 'ChineseSimplified/constellations/yanfei.json';
const file = path => new URL('../../' + path, import.meta.url);
const read = path => readContentSource(file(path));
const { variantReferences, repeatedGrant } = read(detailPath);
const growth = read(identitiesPath + 'characters.json');
const weaponsSource = read(identitiesPath + 'weapons.json');
const rates = read(ratesPath);
const depot = read(depotPath);
const proud = new Map(read(depot.proudSkillsFile).filter(row => [1, 2].includes(row.level))
  .map(row => [row.proudSkillGroupId + '/' + row.level, row]));
const param = /\{(param\d+):[^}]+\}/g;
const keys = text => [...text.matchAll(param)].map(match => match[1]);
const stat = { 生命值上限: 'hp', 攻击力: 'attack', 防御力: 'defense', 元素精通: 'elementalMastery' };
const readValue = output => output?.state === 'known' && output.value.kind === 'quantity' ? output.value.value : null;
const close = (actual, expected) => actual !== null && Math.abs(actual - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);

function captureFor(id, index) {
  const group = 'combat' + (index + 1), binding = depot.bindings[id];
  if (binding) {
    const skills = depot.skillDepots[binding.skillDepotId];
    const skill = depot.skills[index === 2 ? skills.energySkill : skills.skills[index]];
    if (!skill) return;
    const row = level => proud.get(skill.proudSkillGroupId + '/' + level);
    return { path: depotPath + '#skills/' + skill.id, labels: row(1)?.paramDescList.map(hash => depot.textMap[hash]),
      numericPath: depot.proudSkillsFile + '#proudSkillGroupId=' + skill.proudSkillGroupId,
      rate: (key, level) => row(level)?.paramList[Number(key.slice(5)) - 1] };
  }
  const sourceId = /^(aether|lumine)-/.test(id) ? 'traveler' + id.split('-')[1] : id;
  const path = capture + 'ChineseSimplified/talents/' + sourceId + '.json';
  if (!existsSync(file(path))) return;
  const skill = read(path)[group];
  return { path: path + '#' + group, labels: skill?.attributes.labels, description: skill?.description,
    numericPath: ratesPath + '#' + sourceId + '/' + group, rate: (key, level) => rates[sourceId]?.[group]?.[key]?.[level - 1] };
}

function terms(text, defaultStat = 'attack') {
  const parsed = [...text.matchAll(/\{(param\d+):[^}]+\}\s*(生命值上限|攻击力|防御力|元素精通)?/g)];
  const suffix = parsed.at(-1)?.[2];
  const shared = parsed.length > 1 && parsed.slice(0, -1).every(match => !match[2]) ? stat[suffix] : undefined;
  return parsed.map(([, parameter, unit]) => ({ parameter, stat: stat[unit] ?? shared ?? defaultStat }));
}

function repeatTerms(template) {
  const group = template.match(/^\(([^()]+)\)\s*[*×]\s*(\d+)$/);
  if (group) return [{ terms: terms(group[1]), repetitions: Number(group[2]) }];
  if (template.includes('/')) return template.split('/').flatMap(repeatTerms);
  const split = template.split('+').map(term => term.trim());
  if (split.length > 1 && split.every(term => term === split[0] && keys(term).length === 1)) {
    return [{ terms: terms(split[0]), repetitions: split.length }];
  }
  return split.flatMap(term => {
    const matches = term.match(/^\{param\d+:[^}]+\}(?:生命值上限|攻击力|防御力|元素精通)?\s*[*×]\s*(\d+)$/);
    return matches ? [{ terms: terms(term), repetitions: Number(matches[1]) }] : [];
  });
}

function boundedExclusion(id, label) {
  if (label.includes('坠地冲击')) return '低空与高空是同一落地冲击的高度档，沿用已有命名和分支。';
  if (label === '总伤害') return '总伤害表项给出累计量，单次计算使用对应的单跳倍率。';
  if (/伤害提升|伤害加成/.test(label)) return '倍率是条件修饰量，沿用对应修饰规则。';
  if (id === 'odette' && label.includes('星超导/星扩散')) return '已有辉映事实在同一命中切换伤害族及其倍率。';
}

/** Compare in-game talent templates and fixed numeric curves with the current single-hit declarations. */
export function auditTalentHitVariants(entities, engine) {
  const rows = [], resolved = [], gaps = [], verified = new Set();
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  for (const character of entities.characters) {
    const id = character.id, reference = variantReferences[id];
    const baseId = depot.bindings[id]?.baseId ?? (/^(aether|lumine)-/.test(id) ? id.split('-')[0] : id);
    const base = growth[baseId]?.stats.base;
    const teams = new Map();
    function scenario(rank, weaponId) {
      if (!weapons.has(weaponId)) return;
      const key = rank + '/' + weaponId;
      if (!teams.has(key)) {
        const build = { ...auditBuild(character, weapons.get(weaponId)), constellation: rank };
        const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
        if (!prepared.ok) throw new Error(id + ': ' + JSON.stringify(prepared.diagnostics));
        teams.set(key, prepared.team);
      }
      return teams.get(key);
    }
    function quantify(talent, hit, rank, weaponId) {
      const team = scenario(rank, weaponId);
      if (!team) return {};
      const { request, setup } = auditHit(character, talent, hit);
      setup.targets[0].facts.targetHpRatio = number('scalar', 1);
      setAuditDefaults(character, request.frame);
      const { frame } = request;
      const context = engine.createStructuredCombatContext(team, setup);
      const value = engine.evaluateCombatBindings(team.program, context, { damage: { kind: 'formula', formula: hit.base.formula,
        inputs: hit.base.bindings, output: hit.base.output } }, {
        ...frame, ownerId: 'actor', recipientId: 'actor', contributorId: null,
        hit: { skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, family: 'ordinary', origin: hit.origin, reactionId: null },
      });
      return { value: readValue(value.outputs.damage), team, setup, request };
    }
    for (const [index, talent] of character.talents.entries()) {
      const source = captureFor(id, index);
      const entries = authoredHitEntries(character.metadata, talent.id);
      for (const [detail, row] of talent.details.entries()) {
        const { label, template } = row;
        if (!label.includes('伤害') || !/\}\s*[/+]|[*×]\s*\d/.test(template)) continue;
        const field = '/talents/' + index + '/details/' + detail;
        const sourceLabel = label + '|' + template;
        const sources = [...source ? [source.path, source.numericPath] : []];
        const alternative = reference?.talent === 'combat' + (index + 1) && reference.groups[label];
        if (alternative) sources.push(detailPath + '#variantReferences/' + id, ...reference.sources);
        const bucket = { entity: id, field, label, template, sources };
        const countGroups = repeatTerms(template);
        const isSlash = /\}\s*[/／]\s*\{/.test(template);
        if (!source?.labels?.includes(sourceLabel)) {
          gaps.push({ ...bucket, reason: '尚未在固定原文中找到完全对应的倍率模板。' });
          continue;
        }
        const exclusion = !alternative && isSlash && boundedExclusion(id, label);
        if (exclusion) {
          rows.push({ ...bucket, classification: 'excluded', reason: exclusion });
          continue;
        }
        if (!alternative && isSlash) {
          gaps.push({ ...bucket, reason: '各倍率对应的互斥条件或独立事件尚需明确。' });
          continue;
        }
        if (alternative && id === 'yanfei'
          && (!source.description.includes('初始最多持有三枚丹火印') || !source.description.includes('消耗所有的丹火印')
            || !read(yanfeiC6Path).c6.description.includes('最大数量增加一枚'))) {
          gaps.push({ ...bucket, reason: '固定说明中的初始丹火印数量、重击消耗或六命上限与所列档位不符。' });
          continue;
        }
        const expectations = alternative ? terms(template).map((term, ordinal) => ({
          terms: [term], name: alternative[ordinal], kind: id === 'zhongli' ? 'source-event' : 'variant',
          repetitions: countGroups.find(group => group.terms[0].parameter === term.parameter)?.repetitions,
          minConstellation: id === 'yanfei' && ordinal === 4 ? 6 : 0,
        })) : countGroups;
        if (!expectations.length) {
          const separate = keys(template).every(parameter => entries.some(entry => entry.hit.id === talent.id + '.' + parameter
            && Array.isArray(entry.hit.base) && entry.hit.base.some(term => term.parameter === parameter)));
          rows.push({ ...bucket, classification: separate ? 'explicit-hits' : 'excluded',
            reason: separate ? '以已绑定的独立命中表达各倍率项。' : '此行保留既有复合或附加关系，单凭连接符无法重新分段。' });
          continue;
        }
        const start = rows.length;
        for (const expected of expectations) {
          const parameter = expected.terms[0].parameter;
          const root = talent.id + '.' + parameter;
          const matching = entries.filter(({ hit }) => hit.id === root
            || id === 'yoimiya' && hit.id === root + '.pyro' || id === 'vesna' && hit.id === root + '.anemo'
            || id === repeatedGrant.entity && hit.id === repeatedGrant.hit && index === 0 && parameter === 'param9');
          if (!matching.length) {
            gaps.push({ ...bucket, reason: '缺少此倍率的正式单击：' + parameter });
            continue;
          }
          for (const { hit: declaration, field: hitField, unlock } of matching) {
            const hit = talent.hits.find(hit => hit.id === declaration.id);
            if (!hit) {
              gaps.push({ ...bucket, reason: '未展开的单击定义：' + declaration.id });
              continue;
            }
            const weaponId = expected.terms.some(term => term.stat === 'elementalMastery') ? 'ironsting' : novice[character.identity.weaponType];
            const weapon = weaponsSource[weaponId]?.stats;
            const basis = { hp: base?.hp, defense: base?.defense, attack: base?.attack + weapon?.base.attack,
              elementalMastery: weapon?.base.specialized ?? 0 };
            const level = id === 'tartaglia' && index === 0 ? 2 : 1;
            const count = expected.repetitions;
            const sourceRates = expected.terms.map(term => ({ ...term, rate: source.rate(term.parameter, level) }));
            const rawDamage = sourceRates.reduce((sum, term) => sum + term.rate * basis[term.stat], 0);
            const rank = expected.minConstellation || (declaration.id === repeatedGrant.hit ? repeatedGrant.constellation : 0);
            const measured = quantify(talent, hit, rank, weaponId);
            const evidence = [...sources];
            if (declaration.id === repeatedGrant.hit) evidence.push(detailPath + '#repeatedGrant', repeatedGrant.source);
            if (id === 'yanfei') evidence.push(yanfeiC6Path + '#c6');
            let active = null, locked = null, grantValid = true;
            if (id === 'yanfei' && expected.kind && measured.team) {
              active = readValue(engine.evaluateStructuredHit(measured.team, measured.setup, measured.request).totals.all);
              grantValid = close(active, rawDamage * 0.5 * 0.9);
            }
            if (expected.minConstellation && measured.team) {
              const previous = scenario(expected.minConstellation - 1, weaponId);
              locked = readValue(engine.evaluateStructuredHit(previous, measured.setup, measured.request).totals.all);
              grantValid = grantValid && unlock?.rank === expected.minConstellation && unlock?.state === 'constellation'
                && locked === 0 && hit.origin === 'talent';
            } else if (expected.kind) grantValid = grantValid && !unlock;
            const metadataValid = hit.selection?.repetitions === count && (!expected.kind || hit.selection?.kind === expected.kind
              && hit.name.includes(expected.name) && !/第\d+击/.test(hit.name));
            const success = metadataValid && grantValid && close(measured.value ?? null, rawDamage);
            rows.push({ ...bucket, sources: evidence, hit: hit.id, hitField, classification: expected.kind ?? 'repeat',
              rawRates: sourceRates, repetitions: count ?? 1, constellation: rank, value: measured.value ?? null, expected: rawDamage,
              ...id === 'yanfei' && expected.kind ? { active, locked } : {},
              ...success ? {} : { issue: '固定倍率、单击次数、名称或命座门槛不一致。' } });
          }
        }
        const cases = rows.slice(start);
        if (cases.length && cases.every(row => !row.issue) && !gaps.some(row => row.entity === id && row.field === field)) {
          verified.add(id + field);
          for (const row of cases) verified.add(id + row.hitField);
          resolved.push({ ...bucket, hits: cases.map(row => row.hit),
            resolved: alternative ? reference.condition : '倍率项保留单击原值，重复次数可独立标注。' });
        }
      }
    }
  }
  return { rows, verified, resolved, gaps, summary: { talentHitVariantCases: rows.length,
    talentHitVariantMismatches: rows.filter(row => row.issue).length, verifiedTalentHitVariantFields: verified.size,
    talentHitVariantGaps: gaps.length, talentHitVariantResolvedDetails: resolved.length } };
}
