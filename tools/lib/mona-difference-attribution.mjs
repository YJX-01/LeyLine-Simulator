import { validateMonaTransformativeReviews } from './mona-transformative-audit.mjs';
import { amplificationFingerprint } from './source-fingerprint.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const amplificationCases = new Map([
  ['amplification-batch:Citlali:0:melt',{mona:'mona:branch:Citlali:0:c0:default:melt',leyline:'character:citlali:hit:/talents/0/hits/0',entity:'citlali',weapon:'apprenticesnotes',reaction:'melt',aura:'pyro',element:'cryo',index:0}],
  ['amplification-batch:Citlali:1:melt',{mona:'mona:branch:Citlali:1:c0:default:melt',leyline:'character:citlali:hit:/talents/0/hits/1',entity:'citlali',weapon:'apprenticesnotes',reaction:'melt',aura:'pyro',element:'cryo',index:1}],
  ['amplification-batch:Xiangling:12:vaporize',{mona:'mona:branch:Xiangling:12:c0:default:vaporize',leyline:'character:xiangling:hit:/talents/1/hits/0',entity:'xiangling',weapon:'beginnersprotector',reaction:'vaporize',aura:'hydro',element:'pyro',index:12}],
]);
const close=(a,b)=>Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b));
function scopedDuplicateMenu(link) {
  const definitions={
    'ordinary-duplicate-menu:Citlali:10':{name:'Citlali',id:'citlali',weapon:'apprenticesnotes',index:10,target:'character:citlali:hit:/talents/2/hits/1',hits:['citlali.burst.param1','citlali.burst.param2'],ratios:[5.376,1.344],source:'.references/mona-community/mona_core/src/character/characters/cryo/citlali.rs'},
    'ordinary-duplicate-menu:KaedeharaKazuha:6':{name:'KaedeharaKazuha',id:'kaedeharakazuha',weapon:'dullblade',index:6,target:'character:kaedeharakazuha:hit:/talents/0/hits/7',hits:['kaedeharakazuha.normal.param7','kaedeharakazuha.normal.param8'],ratios:[.43,.74648],source:'.references/mona-community/mona_core/src/character/characters/anemo/kaedehara_kazuha.rs'},
  };
  const rule=definitions[link.id],proof=link.scopedDuplicateMenuProof,row=proof?.row;
  if(!rule || !row || link.mona?.length!==2 || !link.mona.includes(`mona:skill:${rule.name}:${rule.index}`)
    || !link.mona.includes(`mona:branch:${rule.name}:${rule.index}:c0:default:normal`) || link.leyline?.length!==1
    || link.leyline[0].id!==rule.target || link.leyline[0].revision!=='3' || row.spec?.id!==rule.id
    || row.spec.source!==rule.source || JSON.stringify(row.spec.hits)!==JSON.stringify(rule.hits))return false;
  try {
    if(proof.provenance?.mona!=='589ac6919057709924c0c20d5a9d673fe9b0be1a'
      || JSON.stringify(proof.provenance)!==JSON.stringify(amplificationFingerprint(rule.id,rule.weapon)))return false;
    for(const path of [rule.source,'tools/lib/mona-ordinary-wrong-arms.mjs','tools/lib/mona-calculation-probes.mjs','tools/lib/roster-audit-settings.mjs',
      'src/web/src/domain/real-project.ts','src/web/src/domain/workbench-project.ts',
      'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json']) {
      if(proof.dependencies?.[path]!==createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex'))return false;
    }
  } catch { return false; }
  const input=row.mona?.input,aligned=row.mona?.alignedInput,actor=row.project?.candidate?.actors?.[0];
  if(input?.character?.name!==rule.name || input.character.level!==1 || input.character.constellation!==0 || input.skill?.index!==rule.index
    || input.weapon?.level!==1 || input.weapon.refine!==1 || input.artifacts?.length!==0 || input.enemy!==null || input.buffs?.length!==0
    || actor?.build?.character?.id!==rule.id || actor.build.level!==1 || actor.build.ascension!==0 || actor.build.constellation!==0
    || row.project?.enemy?.level!==90 || !close(row.project.enemy.resistances[rule.id==='citlali'?'cryo':'physical'],.1)
    || aligned?.buffs?.length!==1 || !close(aligned.buffs[0]?.config?.ATKFixed?.value,row.mona.correction)
    || Math.abs(row.mona.correction)>1 || !close(row.mona.nativeAttack+row.mona.correction,row.mona.attack)
    || Math.abs(row.mona.ratio-rule.ratios[0])>.00005) return false;
  if(rule.id==='kaedeharakazuha' && (input.skill.config?.KaedeharaKazuha?.after_e_or_q!==false
    || row.events.some(id=>!row.project.timeline.find(event=>event.id===id)?.damage?.facts?.some(fact=>fact.subject.kind==='actor'
      && fact.subject.id===actor.id && fact.values?.['kaedeharakazuha.crimsonMomijiInfusion']?.value?.value===false)))) return false;
  const factor=101/291*.9;
  return rule.hits.every((hit,i)=>row.project.timeline.some(event=>event.id===row.events[i] && event.damage?.hit.hitId===hit)
    && close(row.ratios[i],rule.ratios[i]) && close(row.expected[i],row.mona.attack*rule.ratios[i]*factor)
    && close(row.actual[i],row.expected[i])) && close(row.mona.damage,row.mona.attack*row.mona.ratio*factor);
}
function scopedAmplificationBatch(link, cache) {
  if (!link.id.startsWith('amplification-batch:')) return false;
  try {
    if (!cache.batch) {
      const proof = JSON.parse(readFileSync(new URL('../../artifacts/amplification-shared-review.json', import.meta.url), 'utf8'));
      for (const path of ['artifacts/amplification-shared-review.mjs', 'tools/lib/mona-amplification-batch.mjs', 'artifacts/mona-difference-batch.json']) {
        const data = readFileSync(new URL('../../' + path, import.meta.url));
        if (proof.sourceSha256?.[path] !== createHash('sha256').update(data).digest('hex')) return false;
      }
      cache.batch = { proof, prior: JSON.parse(readFileSync(new URL('../../artifacts/mona-difference-batch.json', import.meta.url), 'utf8')), fingerprints: new Map() };
    }
    const { proof, prior, fingerprints } = cache.batch;
    if (proof.baseline?.mona !== '589ac6919057709924c0c20d5a9d673fe9b0be1a'
      || prior.baselines?.mona !== proof.baseline.mona) return false;
    const mapping = proof.mappings?.find(row => row.id === link.id);
    if (!mapping || mapping.disposition !== 'different' || JSON.stringify(mapping.mona) !== JSON.stringify(link.mona)
      || JSON.stringify(mapping.leyline) !== JSON.stringify(link.leyline) || link.mona?.length !== 1 || link.leyline?.length !== 1) return false;
    const target = link.leyline[0].id, match = /^character:([^:]+):hit:\/talents\/(\d+)\/hits\/(\d+)$/.exec(target);
    const row = proof.rows?.find(item => item.id === link.mona[0] && item.leyline === target);
    if (!match || !row || row.status !== 'different' || row.cases?.length !== 3 || link.leyline[0].revision !== '3') return false;
    const [,,talentIndex,hitIndex] = match, entity = match[1], origin = proof.provenance?.[entity];
    if (!origin || origin.fingerprint?.mona !== proof.baseline.mona) return false;
    const fingerprintKey = entity + '/' + origin.weapon;
    if (!fingerprints.has(fingerprintKey)) fingerprints.set(fingerprintKey, amplificationFingerprint(entity, origin.weapon));
    if (JSON.stringify(fingerprints.get(fingerprintKey)) !== JSON.stringify(origin.fingerprint)) return false;
    const branch = prior.mona.find(item => item.id === row.id), parent = branch?.parentId;
    const ordinary = prior.links.find(item => item.disposition === 'matched' && item.id.startsWith('ordinary-batch:')
      && item.mona?.includes(parent) && item.leyline?.length === 1 && item.leyline[0].id === target && item.leyline[0].revision === '3');
    const anchored = prior.leyline.find(item => item.id === target);
    if (!ordinary || !anchored || branch?.scenario?.id !== 'default' || branch.scenario.constellation !== 0
      || branch.branch !== row.reaction || branch.parentId !== parent || row.element !== anchored.binding?.element
      || anchored.source !== `src/game-data/data/characters/${entity}.json#/talents/${talentIndex}/hits/${hitIndex}`) return false;
    const direction = { pyro: { melt: [2,'cryo'], vaporize: [1.5,'hydro'] }, hydro: { vaporize: [2,'pyro'] }, cryo: { melt: [1.5,'pyro'] } };
    const config = direction[row.element]?.[row.reaction];
    if (!config || row.aura !== config[1]) return false;
    return row.cases.every((item, index) => {
      const m = item.mona, y = item.leyline;
      return item.level === [1,6,10][index] && m?.otherBonus === 0 && m.em > 0 && y?.em > 0
        && close(m.expected, m.normal * config[0] * (1 + (25/9) * m.em / (1400 + m.em)))
        && close(y.expected, y.normal * config[0] * (1 + 2.78 * y.em / (1400 + y.em)))
        && close(m.actual, m.expected) && close(y.actual, y.expected);
    });
  } catch { return false; }
}
/** Classify the existing difference mappings without treating an untested event sequence as resolved. */
export function classifyMonaDifferences(links, wrongArmRows = [], transformative, leylineRows = []) {
  const cache = {};
  const verifiedReactions = new Set(validateMonaTransformativeReviews(links, transformative ?? { rows: [] }, leylineRows)
    .reviews.map(review => review.id));
  return links.filter(link => link.disposition === 'different').map(link => {
    const id = link.id;
    let cause = 'unclassified', status = 'open', batchProof = false;
    if (verifiedReactions.has(id)) {
      cause = 'reaction-coefficient-version';
      status = 'attributed';
    } else if (scopedDuplicateMenu(link)) {
      cause = 'duplicate-menu-binding';
      status = 'attributed-scoped';
    } else if ((batchProof = scopedAmplificationBatch(link, cache))) {
      cause = 'amplification-coefficient-and-talent-precision';
      status = 'attributed-scoped';
    } else if (id.startsWith('ordinary-wrong-arm:')) {
      const row = wrongArmRows.find(item => item.status === 'different' && link.mona?.includes(item.mona)
        && link.leyline?.some(ref => ref.id === item.leyline));
      if (row?.arm?.path && link.sources?.includes(row.arm.path + ':' + row.arm.line)
        && row.ratios?.length === 15 && row.cases?.length === 3 && row.ratios.every((item, index) => item.level === index + 1 &&
        [item.mona, item.rust, item.official].every(Number.isFinite)
        && Math.abs(item.mona - item.rust) <= .000001 && Math.abs(item.mona - item.official) > .001)
        && row.cases.every((item, index) => item.level === [1, 6, 10][index] && Number.isFinite(item.actual) && Number.isFinite(item.expected)
          && Math.abs(item.actual - item.expected) <= Math.max(.000001, Math.abs(item.expected) * .000001))) {
        cause = 'talent-parameter-branch';
        status = 'attributed';
      }
    }
    return { id, cause, status, ...(status === 'attributed-scoped' ? {
      scope: batchProof ? 'independent-natural-panels-only' : 'level-one-single-hit-only',
      proof: batchProof ? 'artifacts/amplification-shared-review.json' : 'live:duplicateMenus',
    } : {}), evidence: Array.isArray(link.sources) ? [...link.sources] : [],
      explanation: link.explanation ?? '', comparisons: Array.isArray(link.comparisons) ? link.comparisons : [] };
  });
}
