import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, fact, number } from './roster-audit-settings.mjs';

const evidencePath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/varka-charged-hands.json';
const sourceRoot = 'tools/data/sources/';
const talentsPath = sourceRoot + 'genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json';
const charactersPath = sourceRoot + 'catalog/genshin-db/characters.json';
const weaponsPath = sourceRoot + 'catalog/genshin-db/weapons.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const evidence = read(evidencePath).interpretation;
const rates = read(talentsPath).varka.combat2;
const attack = read(charactersPath).varka.stats.base.attack + read(weaponsPath).wastergreatsword.stats.base.attack;
const resistances = { physical: .2, anemo: .4, pyro: .1, hydro: .3, electro: .5, cryo: .6 };
const parties = [
  { party: [], element: 'physical' },
  { party: ['anemo'], element: 'physical' },
  { party: ['cryo'], element: 'cryo' },
  { party: ['cryo', 'electro'], element: 'electro' },
  { party: ['cryo', 'electro', 'hydro'], element: 'hydro' },
  { party: ['cryo', 'hydro', 'pyro'], element: 'pyro' },
];

/** Compare the separate right- and left-hand hits against fixed attack and talent data. */
export function auditVarkaChargedHands(entities, engine) {
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const character = entities.characters.find(entry => entry.id === 'varka');
  const weapon = entities.weapons.find(entry => entry.id === 'wastergreatsword');
  if (character && weapon) {
    const build = auditBuild(character, weapon);
    const skill = character.talents.find(talent => talent.id === 'varka.skill');
    const metadata = character.metadata.talents.find(talent => talent.id === skill.id);
    const teams = parties.map(({ party, element }) => {
      const actors = [{ id: 'actor', build }, ...party.map((element, index) => ({ id: 'peer-' + index, element }))];
      const prepared = engine.prepareStructuredBuilds(actors);
      if (!prepared.ok) throw new Error('varka: ' + JSON.stringify(prepared.diagnostics));
      return { party, element, team: prepared.team };
    });
    for (const [side, normal, charged] of [
      ['right', evidence.normal.right, evidence.charged.right],
      ['left', evidence.normal.left, evidence.charged.left],
    ]) for (const parameter of [...normal, charged]) {
      const id = skill.id + '.' + parameter;
      const hit = skill.hits.find(entry => entry.id === id);
      if (!hit) throw new Error('法尔伽缺少命中 ' + id);
      const field = '/talents/' + character.metadata.talents.indexOf(metadata) + '/hits/' + metadata.hits.findIndex(entry => entry.id === id);
      const sources = [evidencePath, talentsPath + '#varka/combat2/' + parameter, charactersPath + '#varka', weaponsPath + '#wastergreatsword'];
      const start = rows.length;
      function probe({ party, element, team }, stance, legacyHand) {
        const selected = side === 'right' ? element : 'anemo';
        const { setup, request } = auditHit(character, skill, hit);
        request.frame.factOverrides[0].facts['varka.stance'] = bool(stance);
        for (const [name, resistance] of Object.entries(resistances)) {
          setup.targets[0].inputs['resistance.' + name] = number('scalar', resistance);
        }
        if (legacyHand !== undefined) {
          setup.events[0].facts.strikingHand = fact(legacyHand === null ? null : { kind: 'enum', value: legacyHand });
        }
        const result = engine.evaluateStructuredHit(team, setup, request);
        const value = result.totals.all.state === 'known' ? result.totals.all.value.value : null;
        const expected = stance ? attack * rates[parameter][0] * .5 * (1 - resistances[selected]) : 0;
        const matches = value !== null && Math.abs(value - expected) <= 1e-8 && result.outputs.length === 1
          && !result.requiredInputs.some(input => input.key === 'strikingHand');
        rows.push({ entity: character.id, field, hit: id, sources, expected, value, status: result.totals.all.state,
          probe: { party, stance, side, element: selected, ...(legacyHand !== undefined && { legacyHand }) },
          ...(!matches && { issue: '狂飙突进命中的元素或倍率与固定配置不符。', diagnostics: result.diagnostics }) });
      }
      for (const team of teams) {
        probe(team, true);
        if (parameter === charged) for (const legacyHand of ['left', 'right', null]) probe(team, true, legacyHand);
      }
      probe(teams.at(-1), false);
      if (rows.slice(start).every(row => !row.issue)) {
        verified.add(character.id + field);
        resolved.push({ entity: character.id, field, remaining: '',
          resolved: side === 'right' ? '右手在狂飙突进中按火、水、雷、冰的队伍优先级转化，没有适用队友时按物理伤害计算。'
            : '左手在狂飙突进中始终造成风元素伤害。' });
      }
    }
  }
  return { rows, verified, resolved, gaps, summary: {
    varkaHandCases: rows.length, varkaHandMismatches: rows.filter(row => row.issue).length, verifiedVarkaHandHits: verified.size,
  } };
}
