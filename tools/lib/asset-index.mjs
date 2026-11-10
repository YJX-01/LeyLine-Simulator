export const assetKinds = ['characters','weapons','artifacts','artifactSlots','elements','skills','constellations','stats','buffs'];

/** Resolve canonical character identities onto shared artwork before emitting runtime indices. */
export function createAssetIndex(manifest, characters, revisions) {
  const index = Object.fromEntries(assetKinds.map(kind => [kind, {}]));
  for (const asset of manifest.assets) {
    const entry = { file:asset.file, name:asset.name, ...(asset.element ? {element:asset.element} : {}),
      ...(asset.rarity ? {rarity:asset.rarity} : {}), revision:revisions[asset.file] };
    index[asset.kind][asset.key] = entry;
    for (const alias of asset.aliases ?? []) index[asset.kind][alias.key] = {...entry,name:alias.name};
  }
  for (const alias of manifest.sharedBuffStatIcons ?? []) {
    if (!index.stats[alias.stat]) throw new Error(`Unknown shared stat icon: ${alias.stat}`);
    index.buffs[alias.key] = {...index.stats[alias.stat],name:alias.name};
  }
  const alias = (kind,key,target,name,element) => {
    if (index[kind][key] || !index[kind][target]) return;
    index[kind][key] = {...index[kind][target],name,...(element ? {element} : {})};
  };
  for (const character of characters) {
    const form = character.id.match(/^(aether|lumine|manekin|manekina)-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/);
    const base = form?.[1] ?? character.id;
    if (form) alias('characters',character.id,base,character.identity.name,form[2]);
    const prefix = form && ['aether','lumine'].includes(base) ? `traveler${form[2]}` : base;
    for (const talent of character.talents) {
      const slot = `combat${{normal:1,skill:2,burst:3}[talent.category]}`;
      const target = !form && ['aether','lumine'].includes(base) && talent.category==='normal'
        ? 'normal-skill_a_01' : `${prefix}-${slot}`;
      alias('skills',`${character.id}-${slot}`,target,talent.name);
    }
    for (const constellation of character.constellations) {
      alias('constellations',`${character.id}-c${constellation.rank}`,`${prefix}-c${constellation.rank}`,constellation.name);
    }
  }
  return index;
}

export function characterIconReferences(characters) {
  return characters.flatMap(character => [
    {kind:'characters',key:character.id},
    ...character.talents.map(talent => ({kind:'skills',key:`${character.id}-combat${{normal:1,skill:2,burst:3}[talent.category]}`})),
    ...character.constellations.map(item => ({kind:'constellations',key:`${character.id}-c${item.rank}`})),
  ]);
}

export function missingCharacterIcons(index, characters) {
  return characterIconReferences(characters).filter(({kind,key}) => !index[kind]?.[key]);
}
