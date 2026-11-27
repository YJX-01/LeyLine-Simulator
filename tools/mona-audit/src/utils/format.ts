import type { EntityKind } from '../types';

export const ROLE_LABELS: Record<string, string> = {
  behavior: '范围内行为',
  parent: '归入父项',
  excluded: '范围外',
  pending: '待判定范围',
};

export const CATEGORY_LABELS: Record<string, string> = {
  damage: '伤害',
  buff: '增益',
  unknown: '未分类',
};

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  character: '角色',
  weapon: '武器',
  set: '圣遗物',
  reaction: '反应',
  resonance: '共鸣',
  other: '其他',
};

export const ELEMENT_LABELS: Record<string, string> = {
  anemo: '风',
  geo: '岩',
  electro: '雷',
  dendro: '草',
  hydro: '水',
  pyro: '火',
  cryo: '冰',
};

export const ATTRIBUTION_STATUS_LABELS: Record<string, string> = {
  open: '待核对',
  'attributed-scoped': '限定范围已归因',
  attributed: '已归因',
};

export const CAUSE_LABELS: Record<string, string> = {
  'amplification-precision': '增幅系数与天赋精度',
  'amplification-coefficient-and-talent-precision': '增幅系数与天赋精度',
  'talent-parameter-branch': '天赋参数分支差异',
  'reaction-coefficient-version': '反应系数版本差异',
  'event-semantics-not-established': '事件语义尚未建立',
  'activation-condition': '触发条件限制',
  'target-aura-condition': '目标附着条件差异',
  'target-aura-and-event-semantics': '目标附着与事件语义',
  'damage-penalty-and-event-semantics': '伤害修正与事件语义',
  'duplicate-menu-binding': '重复菜单绑定',
  'spec-verified-semantic-difference': '规范确认语义差异',
  unclassified: '未分类差异',
};

export const FEATURE_LABELS: Record<string, string> = {
  output: '输出类型',
  element: '元素',
  family: '伤害族',
  category: '动作类别',
  stat: '属性',
  value: '数值',
  base: '基础倍率',
  snapshot: '属性捕获',
  parameters: '参数',
  description: '说明',
  trigger: '触发器',
  condition: '生效条件',
  recipient: '作用对象',
  appliesTo: '适用范围',
  stacking: '叠层规则',
  lifetime: '持续时间',
  scope: '范围',
  needed: '所需条件',
  variables: '变量',
  inputs: '输入项',
  pieces: '套装件数',
  branches: '输出分支',
};

export const RAW_SECTION_LABELS: Record<string, string> = {
  features: '特征字段',
  source: '来源位置',
  sourceIds: '来源编号',
  raw: '原始记录',
  links: '映射记录',
  candidates: '候选项',
  counterparts: '对应条目',
  candidateRows: '候选条目',
  details: '计算与探针详情',
  attribution: '差异归因',
  assignments: '来源归属',
};

export function sideLabel(value: string): string {
  if (value === 'mona') return 'Mona';
  if (value === 'leyline') return 'LeyLine';
  return value;
}

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value;
}

export function entityKindLabel(value?: EntityKind | string): string {
  if (!value) return '其他';
  return ENTITY_KIND_LABELS[value as EntityKind] ?? value;
}

export function elementLabel(value?: string): string {
  if (!value) return '';
  return ELEMENT_LABELS[value] ?? value;
}

export function causeLabel(value?: string): string {
  if (!value) return '未分类差异';
  return CAUSE_LABELS[value] ?? value;
}

export function attributionStatusLabel(value?: string): string {
  if (!value) return '';
  return ATTRIBUTION_STATUS_LABELS[value] ?? value;
}

export function behaviorGroupLabel(key: string): string {
  const parts = key.split('/');
  const map: Record<string, string> = {
    mona: 'Mona',
    leyline: 'LeyLine',
    damage: '伤害',
    buff: 'Buff',
    unknown: '待定范围',
  };
  return parts.map(part => map[part] ?? part).join(' ');
}

export function formatInt(value: number | undefined | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('zh-CN');
}

export function formatPercent(numerator: number, denominator: number, digits = 1): string {
  if (!denominator || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return '—';
  return `${((numerator / denominator) * 100).toFixed(digits)}%`;
}

export function formatNumber(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 1e-4) return value.toExponential(2);
  if (abs >= 1000) return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  if (abs >= 10) return value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}

export function formatSignedDelta(value: number | undefined | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

export function formatRelativeDiff(actual: unknown, expected: unknown): string {
  if (typeof actual !== 'number' || typeof expected !== 'number') return '—';
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return '—';
  if (expected === 0) return actual === 0 ? '0.00%' : '—';
  const ratio = ((actual - expected) / Math.abs(expected)) * 100;
  if (Math.abs(ratio) < 0.0001) return '0.00%';
  return `${ratio > 0 ? '+' : ''}${ratio.toFixed(3)}%`;
}

export function formatTimestamp(iso?: string): string {
  if (!iso) return '未知';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function shortPath(raw?: string): string {
  if (!raw) return '—';
  const cleaned = raw.replace(/^\.references\/mona-community\//, 'mona/').replace(/^src\/game-data\/data\//, 'game-data/');
  if (cleaned.length <= 64) return cleaned;
  const [file, hash] = cleaned.split('#');
  const segments = file.split('/');
  const tail = segments.slice(-2).join('/');
  return hash ? `${tail}#${hash}` : tail;
}

export function upstreamGithubUrl(raw: unknown, monaVersion?: string | null): string {
  if (typeof raw !== 'string') return '';
  const prefix = '.references/mona-community/';
  const path = raw.split('#')[0];
  if (!path.startsWith(prefix) || typeof monaVersion !== 'string' || !/^[a-f0-9]{40}$/.test(monaVersion)) {
    return '';
  }
  return `https://github.com/TwiceDrop/genshin_artifact/blob/${monaVersion}/${path.slice(prefix.length).split('/').map(encodeURIComponent).join('/')}`;
}

export function displayValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function comparisonTone(comparison: string, attributionStatus?: string): 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'neutral' {
  if (comparison === '一致') return 'success';
  if (comparison === '有差异') return attributionStatus === 'attributed' ? 'warning' : 'danger';
  if (comparison === '待确认' || comparison === '条件不可比') return 'warning';
  if (comparison === '仅 Mona') return 'info';
  if (comparison === '仅 LeyLine') return 'purple';
  return 'neutral';
}

export function runTone(run: string): 'success' | 'danger' | 'neutral' {
  if (run === '已跑通') return 'success';
  if (run === '执行失败') return 'danger';
  return 'neutral';
}
