import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readContentSource } from '../../lib/content-source.mjs';
import { runMonaTriage } from '../../lib/mona-triage.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const monaRoot = resolve(root, '.references/mona-community');

const { values } = parseArgs({
  options: {
    character: { type: 'string', multiple: true },
    out: { type: 'string', default: 'C:/Users/32616/.gemini/antigravity-cli/brain/73ba3e16-f45e-473e-8d3e-e1c5c8a8d0e9/scratch/mona-scaffolds' },
    'all-gaps': { type: 'boolean', default: false },
  },
});

const [{ CHARACTER_EFFECT_RULES }, { STELLAR_SUPPORT_RULES, VODYANITSA_SUPPORT_RULES }] = await Promise.all([
  import('../../../.references/mona-community/beta-data/character-effect-rules.mjs'),
  import('../../../.references/mona-community/beta-data/scoped-character-effect-rules.mjs'),
]);
const monaBuffs = JSON.parse(
  readFileSync(resolve(monaRoot, 'src/assets/_gen_buff.js'), 'utf8').replace(/^(?:\s*\/\/[^\n]*\n)*\s*export default\s*/, ''),
);
const zh = JSON.parse(readFileSync(resolve(monaRoot, 'src/i18n/generated/zh-cn.json'), 'utf8'));
const textExcerpts = readContentSource(resolve(root, 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/text-excerpts.json'));

const allElements = ['pyro', 'hydro', 'electro', 'cryo', 'anemo', 'geo', 'dendro', 'physical'];

function draftModifiersFromMonaEffect(eff) {
  const attr = eff.attribute;
  const val = typeof eff.value === 'number' ? eff.value : { __todoExpr: eff.value };
  if (attr === 'ResMinusBase') {
    return allElements.map(el => ({
      target: `target.resistance.${el}`,
      value: typeof val === 'number' ? -Math.abs(val) : val,
    }));
  }
  const res = /^ResMinus(Pyro|Hydro|Electro|Cryo|Anemo|Geo|Dendro|Physical)$/.exec(String(attr));
  if (res) {
    return [{
      target: `target.resistance.${res[1].toLowerCase()}`,
      value: typeof val === 'number' ? -Math.abs(val) : val,
    }];
  }
  if (attr === 'DefMinus' || attr === 'DefMinusBase') {
    return [{ target: 'target.defenseReduction', value: val }];
  }
  if (attr === 'BonusBase' || attr === 'BonusNormalAndElemental') {
    return [{ target: 'attribute.damageBonus', value: val }];
  }
  if (attr === 'ATKPercentage') return [{ target: 'attribute.attackPercent', value: val }];
  if (attr === 'ElementalMastery') {
    return [{ target: 'attribute.elementalMastery', value: typeof val === 'number' ? { amount: val, unit: 'elementalMastery' } : val }];
  }
  if (attr === 'EnhanceStellarSuperconduct') return [{ target: 'attribute.reaction.stellar-conduct.damageBonus', value: val }];
  if (attr === 'StellarSwirlBonus') return [{ target: 'attribute.reaction.stellar-swirl.damageBonus', value: val }];
  const bonus = /^Bonus(Pyro|Hydro|Electro|Cryo|Anemo|Geo|Dendro|Physical)$/.exec(String(attr));
  if (bonus) return [{ target: `attribute.${bonus[1].toLowerCase()}Bonus`, value: val }];
  return [{ target: `__map:${String(attr)}`, value: val }];
}

const triage = await runMonaTriage();
const requested = new Set(values.character ?? []);
if (values['all-gaps'] || !requested.size) {
  for (const r of triage.buffRows) {
    if (r.kind === 'character' && r.entity && ['C-missing-in-leyline', 'B-partial-or-diff'].includes(r.triageClass)) {
      requested.add(r.entity);
    }
  }
}

mkdirSync(values.out, { recursive: true });
const index = [];
for (const entityId of [...requested].sort()) {
  const charPath = resolve(root, 'src/game-data/data/characters', `${entityId}.json`);
  const doc = JSON.parse(readFileSync(charPath, 'utf8'));
  const gapBuffs = triage.buffRows.filter(r => r.entity === entityId && ['C-missing-in-leyline', 'B-partial-or-diff', 'B-opaque-needs-check'].includes(r.triageClass));
  const skillRow = triage.skillRows.find(r => r.entity === entityId);
  const unmatchedSkills = (skillRow?.skills ?? []).filter(s => s.triageClass === 'C-unmatched-skill');

  const buffDrafts = gapBuffs.map(row => {
    const rule = CHARACTER_EFFECT_RULES[row.key] ?? STELLAR_SUPPORT_RULES[row.key] ?? VODYANITSA_SUPPORT_RULES[row.key] ?? null;
    const meta = monaBuffs[row.key] ?? null;
    const factKey = `${entityId}.${row.key[0].toLowerCase() + row.key.slice(1)}`;
    const modifiers = (rule?.effects ?? []).flatMap(draftModifiersFromMonaEffect);
    const hasTargetRes = modifiers.some(m => m.target.startsWith('target.'));
    return {
      monaKey: row.key,
      monaLabel: row.label,
      monaDescription: meta?.description != null ? zh[meta.description] ?? null : null,
      monaConfig: meta?.config ?? [],
      monaRule: rule,
      triageClass: row.triageClass,
      missingTargets: row.missingTargets,
      leylineDraft: {
        factDeclaration: { [factKey]: { scope: hasTargetRes ? 'target' : 'owner', type: { kind: 'boolean' }, label: row.label ?? row.key } },
        buff: {
          id: factKey,
          recipient: hasTargetRes ? 'target' : 'team',
          condition: { fact: factKey },
          modifiers,
        },
      },
    };
  });

  const scaffold = {
    entity: entityId,
    name: doc.identity.name,
    productPath: `src/game-data/data/characters/${entityId}.json`,
    specPath: `tools/data/sources/mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/specs/characters/${entityId}.json`,
    officialExcerpts: {
      talents: textExcerpts.talents?.[entityId] ?? null,
      constellations: textExcerpts.constellations?.[entityId] ?? null,
    },
    existingFacts: Object.keys(doc.facts ?? {}),
    existingBuffIds: [...(doc.talents ?? []), ...(doc.passives ?? []), ...(doc.constellations ?? [])]
      .flatMap(x => (x.buffs ?? []).map(b => b.id)),
    existingHitNames: [...(doc.talents ?? []), ...(doc.passives ?? []), ...(doc.constellations ?? [])]
      .flatMap(x => (x.hits ?? []).map(h => h.name)),
    buffDrafts,
    unmatchedSkills,
  };
  const outFile = resolve(values.out, `${entityId}.scaffold.json`);
  writeFileSync(outFile, JSON.stringify(scaffold, null, 2) + '\n');
  index.push({ entity: entityId, name: doc.identity.name, buffGaps: buffDrafts.length, unmatchedSkills: unmatchedSkills.length, file: outFile });
}

writeFileSync(resolve(values.out, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), count: index.length, entities: index }, null, 2) + '\n');
console.log(JSON.stringify({ count: index.length, entities: index.map(x => `${x.entity}(buffs:${x.buffGaps},skills:${x.unmatchedSkills})`) }, null, 2));
