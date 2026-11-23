import { matchingSceneHits, sceneHitInInterval, type AttributePanel, type CalculationIssue, type DamageResult,
  type SceneHitRequest, type SceneSelection } from '@leyline/schema';

export function evaluateSceneHit(
  selections: SceneSelection[] | undefined, hit: SceneHitRequest, timeMs: number, panel: AttributePanel,
): DamageResult {
  const matching = matchingSceneHits(selections, hit.scene);
  const definition = matching[0]?.definition.hits?.[0];
  const issues: CalculationIssue[] = [];
  let baseDamage: number | null = null;
  let value: number | null = null;
  if (!definition) {
    issues.push({ code: 'unknown', message: '请选择与该冲击匹配的秘境难度及场景效果。' });
  } else if (!matching.some(selection => sceneHitInInterval(selection, timeMs)) || hit.triggered === false || hit.targetHit === false) {
    baseDamage = value = 0;
  } else {
    if (hit.triggered === null) issues.push({ code: 'unknown', message: '尚未确认冲击的触发条件。' });
    if (hit.targetHit === null) issues.push({ code: 'unknown', message: definition.recipient === 'character'
      ? '尚未确认场上角色受到冲击。' : '尚未确认当前敌人受到冲击。' });
    if (hit.elementLevelCo === null) issues.push({ code: 'unknown', message: '请填写此击的 ElementLevelCo 系数。' });
    if (hit.triggered === true && hit.targetHit === true && hit.elementLevelCo !== null) {
      const damage = definition.multiplier * hit.elementLevelCo;
      if (Number.isFinite(damage)) {
        baseDamage = damage;
        if ('trueDamage' in definition) value = damage;
        else issues.push({ code: 'unsupported', message: '尚无该冲击的伤害元素、防御及抗性结算依据。' });
      }
      else issues.push({ code: 'invalid-input', message: 'ElementLevelCo 超出可计算范围。' });
    }
  }
  return {
    status: value !== null ? 'complete' : issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : 'partial',
    value, panel, baseDamage, scaling: [],
    parts: { attack: null, multiplier: definition?.multiplier ?? null, bonus: null, crit: null, defense: null, resistance: null },
    ...(definition && { sceneHit: { multiplier: definition.multiplier, elementLevelCo: hit.elementLevelCo, sourceRefs: definition.sourceRefs } }),
    diagnostics: issues.map(issue => issue.message), issues,
  };
}
