import { readContentSource } from './content-source.mjs';

const revision = 'bd35e243fa436f141f015cf221a6e19d0c34b7ca';
const catalog = readContentSource(new URL('../data/sources/catalog/battle-scenes.json', import.meta.url));
const { excerpts, independentRecords } = readContentSource(new URL(
  `../data/sources/anime-game-data-2/${revision}/scene-environment-amount-facts.json`, import.meta.url,
));
const paths = {
  dungeons: 'ExcelBinOutput/DungeonExcelConfigData.json',
  levelEntities: 'ExcelBinOutput/DungeonLevelEntityConfigData.json',
  placeholder: 'BinOutput/LevelEntity/ConfigLevelEntity_Spiral_Abyss.json',
  climate: 'BinOutput/Climate/ConfigClimate.json',
  cold: 'BinOutput/Ability/Temp/LevelAbilities/ConfigAbility_Climate.json',
  fire: 'BinOutput/Ability/Temp/ConfigAbility_LevelBuff.json',
};
const ref = (path, fragment) => `anime-game-data-2@${revision}:${path}#${fragment}`;
const placeholderName = 'Level_Spiral_Abyss_Charge_Empty';
const dungeons = new Map(excerpts[paths.dungeons].map(record => [record.id, record]));
const levelEntities = new Map(excerpts[paths.levelEntities].map(record => [record.clientId, record]));
const placeholder = excerpts[paths.placeholder][placeholderName];
const climate = excerpts[paths.climate];
const cold = excerpts[paths.cold].ClimateAbility_Cold;
const loss = cold.SERVER_ClimateAbility_Cold_Lv2;
const warm = cold.UNIQUE_WarmBuff;
const fire = excerpts[paths.fire].LevelEntity_AvatarDot_Fire;
const taishanRecord = independentRecords.taishanMansion;

const cases = {
  10390: {
    resolved: ['关卡条款确认严寒积满时损失生命值。'],
    fields: ['平台绑定的严寒表量程和默认累积速度', '严寒满额后的生命上限比例、固定损失、首次扣减和每跳间隔'],
    needed: '需要该场景的区域气候模板、满额扣血修饰器绑定及覆盖值，或者已知生命上限和严寒条的当前版本逐帧记录。',
    sourceRefs: [
      ref(paths.climate, 'common'),
      ref(paths.climate, 'Full_Params_Example_Cold'),
      ref(paths.cold, 'ClimateAbility_Cold/SERVER_ClimateAbility_Cold_Lv2'),
    ],
    referenceOnly: {
      meterCapacity: climate.common.length,
      thresholdRatio: climate.common.thresholdRatio,
      exampleRatePerSecond: climate.templates.Full_Params_Example_Cold.temperatureOptions.speed,
      genericLoss: {
        flat: loss.onThinkInterval[0].amount,
        maxHpRatio: loss.onThinkInterval[0].amountByTargetMaxHPRatio,
        intervalMs: loss.thinkInterval * 1000,
      },
    },
  },
  10392: {
    resolved: ['关卡条款确认温暖地面削减严寒，极寒地面加快累积。'],
    fields: ['温暖地面每次减少量及间隔', '极寒地面累积速度及与场景默认速度的关系'],
    needed: '需要此场景的平台机关组对温暖、极寒状态绑定的 AddClimateMeter 或 ResistClimateMixin 动作及参数，或者各平台连续停留时的当前版本严寒条记录。',
    sourceRefs: [
      ref(paths.cold, 'ClimateAbility_Cold/UNIQUE_WarmBuff'),
      ref(paths.cold, 'ClimateAbility_Cold/ClimateAbility_Cold_Lv1_Accelerator'),
    ],
    referenceOnly: {
      genericWarmPointDelta: warm.onThinkInterval[0].value,
      genericWarmPointIntervalMs: warm.thinkInterval * 1000,
      genericAcceleratorRatio: cold.ClimateAbility_Cold_Lv1_Accelerator.modifierMixins[0].ratio,
    },
  },
  10311: {
    resolved: [`太山府 ${taishanRecord.version} 版本附着记录为开战后 ${taishanRecord.firstApplicationMs / 1000} 秒首次施加、每 ${taishanRecord.applicationIntervalMs / 1000} 秒再次施加。`],
    fields: ['当前版本首次附着、再次附着和每跳伤害间隔', '本阶阴燃之火的有效倍率、等级系数和角色抗性及护盾结算'],
    needed: '需要本场景的阴燃之火触发与难度覆盖配置，或当前版本记录开战、附着、扣减与清除时刻并标明火抗、护盾和生命值的实验。通用持续火伤能力尚未与该关卡绑定。',
    sourceRefs: [ref(paths.fire, 'LevelEntity_AvatarDot_Fire'), taishanRecord.source],
    referenceOnly: {
      genericMultiplier: fire.abilitySpecials.LevelEntity_AvatarDot_Fire_P1_Damage,
      genericIntervalMs: fire.abilitySpecials[fire.UNIQUE_LevelEntity_AvatarDot_Fire.thinkInterval] * 1000,
      genericSystemValue: fire.systemValue.type,
      historicalFirstApplicationMs: taishanRecord.firstApplicationMs,
      historicalApplicationIntervalMs: taishanRecord.applicationIntervalMs,
    },
  },
  10577: {
    resolved: ['关卡条款确认拾取稚雷珠后，后续攻击命中敌人可释放落雷。'],
    fields: ['当前版本雷晶实、稚雷珠和落雷的生成、持有及命中时序', '落雷倍率和本阶等级系数，或可复现的对应目标固定伤害'],
    needed: '需要本场景雷晶实、稚雷珠拾取及落雷攻击的机关和能力链，包含 attackProperty、伤害来源等级和目标结算，或当前版本标明日程、难度、触发攻击与受击目标的独立伤害记录。',
    sourceRefs: [],
  },
};

export function auditSceneEnvironmentAmounts(_entities, _engine) {
  const rows = [], resolved = [], gaps = [];
  const verified = new Set(), baseVerified = new Set();
  for (const { entity, field, evidence } of catalog) {
    const { clientId, dungeonId, levelConfigId } = evidence ?? {};
    const clause = cases[clientId];
    if (!clause || !['damage-amount-missing', 'timing'].includes(evidence.status)) continue;

    const dungeon = dungeons.get(dungeonId), levelEntity = levelEntities.get(clientId);
    if (!dungeon || levelEntity?.id !== levelConfigId || !Object.hasOwn(dungeon.levelConfigMap, levelConfigId)
      || levelEntity.levelConfigName !== placeholderName
      || placeholder.GAKBFMMJCNM.length || placeholder.KNNDIKNGIJP.length) {
      gaps.push({ entity, field, issue: '秘境难度、原始条款或空能力入口与固定来源不符。' });
      continue;
    }

    const observations = clientId === 10577
      ? independentRecords.violetCourt.filter(record => record.encounterLevel === dungeon.showLevel) : [];
    const sourceRefs = [...evidence.sourceRefs, ref(paths.placeholder, placeholderName), ...clause.sourceRefs,
      ...observations.flatMap(record => [record.reference, record.frame])];
    const scope = { sceneId: dungeon.sceneId, levelRevise: dungeon.levelRevise, showLevel: dungeon.showLevel,
      levelConfigName: levelEntity.levelConfigName, descTextMapHash: levelEntity.descTextMapHash, sourceRefs: [...new Set(sourceRefs)] };
    const established = [...clause.resolved];
    if (observations.length) established.push('两张早期难度 IV 实战图均显示雷伤 74208，进入的日程、各伤害数字对应的敌方身份和当前版适用性待确认。');
    const remaining = `秘境 ${dungeonId}（sceneId ${dungeon.sceneId}）的条款连到无战斗能力的 ${placeholderName}。${clause.needed}`;
    resolved.push({
      entity, field, resolved: established, missingFields: clause.fields.map(name => `${field} · ${name}`),
      remaining, evidence: scope,
    });
    rows.push({ entity, field, dungeonId, ...scope, value: null, ...clause.referenceOnly && { referenceOnly: clause.referenceOnly } });
  }
  return { rows, verified, baseVerified, resolved, gaps, observations: independentRecords.violetCourt,
    summary: {
      sceneEnvironmentAmountRows: rows.length,
      sceneEnvironmentAmountVerified: verified.size,
      sceneEnvironmentAmountBaseVerified: baseVerified.size,
      sceneEnvironmentAmountObservations: independentRecords.violetCourt.length,
      sceneEnvironmentAmountCheckFailures: gaps.length,
    },
  };
}
