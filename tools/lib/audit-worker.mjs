import { parentPort } from 'node:worker_threads';
import { createRuntimeCatalog } from './runtime-catalog.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { novice } from './roster-audit-settings.mjs';
import { auditSingleHitModifiers } from './single-hit-modifier-matrix.mjs';
import {
  rosterEvaluation,
  rosterEquipmentEvaluation,
  auditPublicScenes,
  auditResonances,
  auditReactionBlessings,
  auditCharacterClauses,
} from './roster-evaluation.mjs';
import { auditHealingWindows, auditSetConditions } from './set-condition-audit.mjs';
import { auditTalentHealing } from './talent-healing-audit.mjs';

let sharedPromise;
function loadShared(fullCatalog) {
  if (!sharedPromise || (fullCatalog && !sharedPromise.full)) {
    sharedPromise = (async () => {
      const catalog = await createRuntimeCatalog();
      const engine = await loadContentSchema('/src/engine/src/index.ts');
      const { combatObservationUnits } = await loadContentSchema('/src/schema/src/calculation/event.ts');
      const entities = { characters: [], weapons: [], sets: [] };
      const weaponIds = fullCatalog
        ? catalog.inventory.weapons
        : [...new Set([...Object.values(novice), 'blackcliffslasher', 'rust', 'thestringless', 'theblacksword', 'wolfsgravestone', 'tomeoftheeternalflow', 'staffofhoma'])];
      entities.characters = await Promise.all(catalog.inventory.characters.map(id => catalog.get('characters', id)));
      entities.weapons = await Promise.all(weaponIds.map(id => catalog.get('weapons', id)));
      entities.sets = await Promise.all(catalog.inventory.sets.map(id => catalog.get('sets', id)));
      return { catalog, engine, entities, combatObservationUnits };
    })();
    sharedPromise.full = fullCatalog;
  }
  return sharedPromise;
}

parentPort.on('message', async ({ id, task, payload }) => {
  try {
    const needsFullWeapons = task !== 'single-hit-shard';
    const { catalog, engine, entities, combatObservationUnits } = await loadShared(needsFullWeapons);
    let result;
    if (task === 'single-hit-shard') {
      result = auditSingleHitModifiers(entities, engine, {
        characterIds: payload.characterIds,
        aliasHitIds: new Set(payload.aliasHitIds),
        includeCrossChecks: payload.includeCrossChecks,
      });
    } else if (task === 'roster-evaluation') {
      result = rosterEvaluation(entities, engine);
    } else if (task === 'roster-equipment') {
      result = rosterEquipmentEvaluation(entities, engine, combatObservationUnits);
    } else if (task === 'set-conditions') {
      result = auditSetConditions(entities, engine);
    } else if (task === 'set-healing') {
      result = await auditHealingWindows(catalog, engine);
    } else if (task === 'talent-healing') {
      result = await auditTalentHealing(catalog, engine);
    } else if (task === 'scenes-resonances-clauses') {
      result = {
        scenes: auditPublicScenes(entities, engine),
        resonances: auditResonances(entities, engine),
        reactionBlessings: auditReactionBlessings(entities, engine),
        characterClauses: auditCharacterClauses(entities, engine, new Set(), new Set()),
      };
    } else {
      throw new Error('Unknown audit worker task: ' + task);
    }
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error?.stack ?? String(error) });
  }
});
