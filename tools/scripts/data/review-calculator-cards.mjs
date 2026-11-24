import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';

const [characterId, ...extra] = process.argv.slice(2);
if (!characterId || extra.length) {
  console.error('用法：node tools/scripts/data/review-calculator-cards.mjs <角色 ID>');
  process.exitCode = 1;
} else {
  const catalog = await createRuntimeCatalog();
  const character = await catalog.get('characters', characterId);
  const { calculatorHitChoices, damageGroupNames } = await loadContentSchema('/src/web/src/domain/calculator-hits.ts');
  const { calculatorDamageGroups, isCalculatorCombatModifier } = await loadContentSchema();
  const { metadata } = character, display = metadata.calculator ?? {};
  const hits = calculatorHitChoices(character);
  const settings = display.groups ?? [];
  const order = [...new Set([...settings.map(group => group.type), ...calculatorDamageGroups])];
  const present = order.filter(type => hits.some(hit => hit.group === type && !hit.common));
  const table = values => console.log('| ' + values.map(value => String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/g, ' ')).join(' | ') + ' |');
  console.log('# ' + character.identity.name + ' 卡片核对\n');
  console.log('角色伤害分组 ' + present.map((type, index) => {
    const expanded = settings.length ? settings.some(group => group.type === type && group.expanded) : index === 0;
    return damageGroupNames[type] + (expanded ? '（展开）' : '（折叠）');
  }).join('、') + '\n');
  table(['伤害 ID', '类型', '来源天赋', '编号', '别名', '正式名', '卡片备注', '置顶顺序']);
  table(Array(8).fill('---'));
  const sorted = [...hits.filter(hit => hit.common), ...present.flatMap(type => hits.filter(hit => !hit.common && hit.group === type))];
  for (const hit of sorted) table([hit.hitId, damageGroupNames[hit.group], hit.skillName, hit.code, hit.alias, hit.name, hit.note,
    hit.common ? display.pinnedHits.indexOf(hit.hitId) + 1 : '']);
  console.log('');
  table(['增益 ID', '正式名／来源', '编号', '别名', '备注']);
  table(Array(5).fill('---'));
  for (const owner of [metadata, ...metadata.talents, ...metadata.passives, ...metadata.constellations]) {
    for (const buff of owner.buffs ?? []) {
      const card = display.buffs?.[buff.id];
      if (card?.scope === 'exploration' || (buff.modifiers.length && !buff.modifiers.some(modifier => isCalculatorCombatModifier(modifier.target, card)))) continue;
      table([buff.id, owner.name ?? character.identity.name, card?.code, card?.alias, card?.note]);
    }
  }
}
