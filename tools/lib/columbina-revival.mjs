import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { auditBuild, bool, number } from './roster-audit-settings.mjs';

const source = 'tools/data/sources/catalog/columbina-revival.json';
const growthSource = 'tools/data/sources/catalog/genshin-db/characters.json';
const curveSource = 'tools/data/sources/catalog/genshin-db/character-curves.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const entity = 'columbina';
const field = '/passives/3';
const healId = 'columbina.skill.heal.revival';
const facts = {
  friendship: 'columbina.revival.friendship',
  fallen: 'reviveFallenRecipient',
  local: 'columbina.revival.localRecipient',
  ready: 'columbina.revival.ready',
  region: 'columbina.revival.inRegion',
  scene: 'columbina.revival.sceneEligible',
};

export const columbinaRevivalCharacterIds = [entity, 'kaeya'];
export const columbinaRevivalWeaponIds = ['apprenticesnotes', 'dullblade'];
export const columbinaRevivalSetIds = ['maidenbeloved', 'travelingdoctor'];

export async function auditColumbinaRevival(entities, engine) {
  const evidence = read(source);
  const sources = [source, evidence.source.mirror + '/blob/' + evidence.source.revision + '/' + evidence.handler.path,
    evidence.clientText, growthSource + '#/kaeya/stats', growthSource + '#/columbina/stats', curveSource];
  const rows = [], verified = new Set(), resolved = [], gaps = [];
  const result = () => ({ rows, verified, resolved, gaps, summary: { columbinaRevivalCases: rows.length,
    columbinaRevivalFailures: rows.filter(row => row.issue).length, columbinaRevivalClauses: resolved.length } });

  const character = entities.characters.find(entry => entry.id === entity);
  if (!character) return result();
  const peer = entities.characters.find(entry => entry.id === 'kaeya');
  const weapon = entities.weapons.find(entry => entry.id === 'apprenticesnotes');
  const peerWeapon = entities.weapons.find(entry => entry.id === 'dullblade');
  const maiden = entities.sets.find(entry => entry.id === 'maidenbeloved');
  const doctor = entities.sets.find(entry => entry.id === 'travelingdoctor');
  const talentIndex = character.talents.findIndex(t => t.heals?.some(h => h.id === healId));
  const healIndex = character.talents[talentIndex]?.heals.findIndex(h => h.id === healId);
  const declaration = character.talents[talentIndex]?.heals[healIndex];
  const pointer = `/talents/${talentIndex}/heals/${healIndex}`;
  const row = { entity, field, pointer, healId, output: 'healing', sources };

  const { handler, cooldown, region, friendshipNamecard } = evidence;
  const offstage = handler.modifierMixin.onKillActions[0];
  const onstage = handler.onKill[0];
  const [revive, start] = offstage.successActions;
  const [friendshipKey, ratio, operator] = revive.amountByTargetMaxHPRatio;
  const [sample, floor] = handler.onThinkInterval;
  const cap = friendshipNamecard.record.fetterLevel;
  const [clientPath, clientKey] = evidence.clientText.split('#');
  const clientText = read(clientPath)[clientKey];
  const gated = trigger => {
    const [skill, area, scene] = trigger.targetPredicates;
    const [apply, timer] = trigger.successActions;
    return trigger.target === 'Caster' && apply.$type === 'ReviveAvatar' && apply.target === 'CurLocalAvatar'
      && JSON.stringify(apply.amountByTargetMaxHPRatio) === JSON.stringify(revive.amountByTargetMaxHPRatio)
      && timer.$type === 'AvatarSkillStart' && timer.target === 'Caster' && timer.skillID === start.skillID
      && skill.$type === 'BySkillReady' && skill.target === 'Caster' && skill.skillID === cooldown.record.id
      && area.$type === 'ByTargetInArea' && area.target === apply.target && area.areas.join() === String(region.record.areaID1)
      && scene.$type === 'ByCurrentSceneTypes' && scene.target === apply.target && scene.sceneTypes.join() === 'SCENE_WORLD,SCENE_ROOM';
  };
  if (!peer || !weapon || !peerWeapon || !maiden || declaration?.origin?.passive !== 3 || declaration.trigger
    || character.metadata.passives[3]?.name !== clientText.name || cooldown.record.id !== start.skillID
    || cooldown.record.cdTime !== Number(clientText.description.match(/每(\d+)秒至多触发一次/u)?.[1]) || cooldown.record.maxChargeNum !== 1
    || handler.modifierMixin.type !== 'OffStage' || !gated(offstage) || !gated(onstage) || operator !== 'MUL'
    || sample.$type !== 'SetFriendshipToGlobalValue' || sample.gvKey !== friendshipKey
    || floor.key !== friendshipKey || floor.predicates[0].key !== friendshipKey
    || floor.predicates[0].compareType !== 'LessAndEqual' || floor.predicates[0].value !== floor.value) {
    rows.push({ ...row, issue: '月的守望的原始处理器、冷却、发放来源或测试用目录内容不符' });
    return result();
  }

  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const growth = read(growthSource), curves = read(curveSource);

  function trial(title, { friendship = 5, eligible = {}, status = 'applied', self = false, bonus = false, incoming = false } = {}) {
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    const ownerBuild = auditBuild(character, weapon, bonus ? [maiden] : []);
    if (bonus) ownerBuild.theoreticalSetSlots = maiden.slots.slice(0, 2).map(slot => ({ slot, setId: maiden.id }));
    const owner = addActorFromBuild(project, ownerBuild);
    const peerBuild = auditBuild(peer, peerWeapon, incoming ? [doctor] : []);
    if (incoming) peerBuild.theoreticalSetSlots = doctor.slots.slice(0, 2).map(slot => ({ slot, setId: doctor.id }));
    const recipient = self ? owner : addActorFromBuild(project, peerBuild);
    const recipientStats = growth[self ? entity : peer.id].stats;
    const maxHp = recipientStats.base.hp * curves[1][recipientStats.curve.hp];
    const values = keys => Object.fromEntries(keys.filter(key => eligible[key] !== null).map(key => [facts[key], bool(eligible[key] ?? true)]));
    const event = values(['ready', 'region', 'scene']);
    if (friendship !== null) event[facts.friendship] = number('count', friendship);
    const recordedFacts = [
      { subject: { kind: 'event' }, values: event },
      { subject: { kind: 'actor', id: recipient }, values: values(['fallen', 'local']) },
    ];
    const definition = { namespace: character.namespace, id: character.id, revision: character.revision };
    const record = { id: 'lunar-vigil', kind: 'state-change', timeMs: 1, order: 1, actor: owner, definition: project.candidate.actors[0].character,
      talentHeal: { definition, healId, recipientId: recipient, facts: recordedFacts } };
    project.timeline.push(record);
    const before = JSON.stringify(project);
    const evaluation = engine.evaluateTimeline(project);
    const changes = evaluation.combatChanges?.filter(change => change.kind === 'talent-healing');
    const change = changes?.[0];
    const nominal = maxHp * Math.max(floor.value, friendship) * ratio;
    const expected = status === 'applied' ? nominal : status === 'excluded' ? 0 : null;
    const expectedBase = bonus || incoming ? nominal : null;
    const value = change?.healing ?? null, base = change?.baseHealing ?? null;
    const equal = (actual, wanted) => actual === wanted || actual != null && wanted != null && Math.abs(actual - wanted) < 1e-7;
    const measured = evaluation.status === 'invalid' ? 'invalid' : change?.status ?? 'missing';
    const matched = status === 'invalid' ? evaluation.diagnostics.some(issue => issue.path.endsWith('.' + facts.friendship))
      : changes?.length === 1 && change?.effect === healId && change.source === record.id
      && change.actor === owner && change.recipient === recipient;
    const checked = matched && measured === status && JSON.stringify(project) === before
      && equal(value, expected) && equal(base, expectedBase);
    const missing = change?.missing ?? (evaluation.status === 'invalid' ? evaluation.diagnostics.map(issue => issue.path + ' ' + issue.message) : undefined);
    rows.push({ ...row, probe: { title, friendship, eligible, self, bonus, incoming }, status: measured, value, base,
      expected, expectedBase, expectedStatus: status, ...(missing && { missing }),
      ...(!checked && { issue: '月的守望的复苏量、资格、受益者或记录不符' }) });
  }

  for (const friendship of [1, 5, cap]) trial(`好感等级 ${friendship}`, { friendship });
  trial('采样值为零时回填一级', { friendship: 0 });
  trial('缺当次好感采样', { friendship: null, status: 'unknown' });
  trial('超出游戏好感等级', { friendship: cap + 1, status: 'invalid' });
  trial('本地场上哥伦比娅倒下', { self: true });
  trial('治疗加成交互缺观测', { bonus: true, status: 'unknown' });
  if (doctor) trial('受治疗加成交互缺观测', { incoming: true, status: 'unknown' });
  for (const key of ['region', 'scene', 'ready', 'local', 'fallen']) {
    trial(`不符合 ${facts[key]}`, { eligible: { [key]: false }, status: 'excluded' });
    trial(`缺 ${facts[key]} 记录`, { eligible: { [key]: null }, status: 'unknown' });
  }
  trial('明确在范围外且缺好感采样', { friendship: null, eligible: { region: false }, status: 'excluded' });

  if (!rows.some(row => row.issue)) {
    verified.add(entity + field);
    verified.add(entity + pointer);
    const remaining = `仍需由时间轴自动跟踪倒下、当前地区和场景、受益者、${cooldown.record.cdTime}秒限次及${handler.thinkInterval}秒好感采样。`;
    resolved.push({ entity, field, remaining,
      resolved: '确认倒下的是自己的场上角色、地区和场景符合且复苏限次已就绪后，按受益者生命上限乘以本次哥伦比娅的好感等级与10%恢复生命值。配置的最低取值为一级。' });
    gaps.push({ entity, field, status: 'timeline-only', reason: remaining, sources },
      { entity, field, status: 'needs-evidence', reason: '固定动作给出受益者生命上限和好感系数。仍缺低于10级好感时两项治疗加成与复苏到账的独立对照、舍入及地区边界。', sources });
  }
  return result();
}
