export const partyInfusionFact = 'partyInfusion';
export const partyInfusionElements = ['pyro', 'hydro', 'cryo'];

const meleeWeapons = ['WEAPON_SWORD_ONE_HAND', 'WEAPON_CLAYMORE', 'WEAPON_POLE'];
const weaponAttacks = ['normal', 'charged', 'plunge'];

export function partyInfusionHit(hit, weaponType) {
  return meleeWeapons.includes(weaponType) && hit.element === 'physical' && hit.origin === 'talent'
    && weaponAttacks.includes(hit.category) && !hit.elementBy && !hit.coordinated && !!hit.damage.ordinary;
}

/** List the loadout's sources for a confirmed infusion. The user supplies its result at impact. */
export function partyInfusionOptions(hit, weaponType, builds, infused) {
  const options = new Map();
  if (!partyInfusionHit(hit, weaponType) || hit.infusion && infused !== false) return options;
  for (const { character, constellation } of builds) {
    const grants = [
      ...character.metadata.talents.flatMap(talent => talent.partyInfusion ? [{ element: talent.partyInfusion, name: talent.name }] : []),
      ...character.metadata.constellations.flatMap(entry => entry.partyInfusion && entry.rank <= constellation
        ? [{ element: entry.partyInfusion, name: entry.rank + '命' }] : []),
    ];
    for (const { element, name } of grants) {
      const source = character.identity.name + ' · ' + name;
      const sources = options.get(element) ?? [];
      if (!sources.includes(source)) options.set(element, [...sources, source]);
    }
  }
  return options;
}

export function selectedPartyInfusion(hit, weaponType, builds, selected, infused) {
  if (selected?.kind !== 'enum' || !partyInfusionElements.includes(selected.value)) return;
  if (partyInfusionOptions(hit, weaponType, builds, infused).has(selected.value)) return selected.value;
}
