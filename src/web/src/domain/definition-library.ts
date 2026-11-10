import { definitionLibrarySchema, type DefinitionLibraryFile, type Project, type ExpressionNode } from '@leyline/schema';

export type ContentDefinition = Project['definitions'][number];
export type {DefinitionLibraryFile} from '@leyline/schema';
export const cloneDefinition = (definition: ContentDefinition): ContentDefinition => JSON.parse(JSON.stringify(definition));
export function createDefinition(name: string, kind: 'damage' | 'equipment' | 'character' = 'damage'): ContentDefinition {
  const definition: ContentDefinition = { id: crypto.randomUUID(), name: name.trim() || '自定义内容', version: '1',
    source: { kind: 'user', reference: 'local', verified: false }, nodes: [], effects: [] };
  if (kind === 'damage') {
    definition.nodes = [{ id: 'attack', op: 'input', key: 'attack', unit: 'attack' },
      { id: 'multiplier', op: 'constant', quantity: { value: 2, unit: 'scalar' } },
      { id: 'base', op: 'multiply', left: 'attack', right: 'multiplier' }];
    definition.damage = 'base';
  }
  return definition;
}
export function parseDefinitionLibrary(input: unknown): DefinitionLibraryFile {
  const parsed=definitionLibrarySchema.safeParse(input);
  if(!parsed.success)throw new Error('内容定义库格式或版本不受支持，现有资料保持不变。');
  const value=parsed.data;
  const definitions = parsed.data.definitions;
  if (new Set(definitions.map(entry => entry.id)).size !== definitions.length) throw new Error('内容定义标识重复，现有资料保持不变。');
  for (const definition of definitions) validateDefinitionReferences(definition, definitions);
  return { schemaVersion: 2, kind: 'definition-library', id: value.id, name: value.name, definitions };
}
export function validateDefinitionReferences(definition: ContentDefinition, definitions: ContentDefinition[]): void {
  const nodes = new Map(definition.nodes.map(node => [node.id, node]));
  if (nodes.size !== definition.nodes.length || new Set(definition.effects.map(effect => effect.id)).size !== definition.effects.length) throw new Error('节点或效果标识重复。');
  const references = (node: ExpressionNode) => node.op === 'add' || node.op === 'multiply' || node.op === 'divide' ? [node.left, node.right] : node.op === 'condition' ? [node.yes, node.no] : node.op === 'capture' ? [node.value] : [];
  const visited = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new Error('公式包含循环引用，请修正后保存。');
    if (visited.has(id)) return;
    if (path.size > 128) throw new Error('公式过深，请简化后保存。');
    const node = nodes.get(id);
    if (!node) throw new Error('公式引用了不存在的节点，请修正后保存。');
    for (const next of references(node)) visit(next, new Set(path).add(id));
    visited.add(id);
  };
  for (const node of definition.nodes) visit(node.id, new Set());
  if (definition.damage) visit(definition.damage, new Set());
  for (const effect of definition.effects) {
    visit(effect.value, new Set());
    if (effect.action && !definitions.some(entry => entry.id === effect.action)) throw new Error('区间效果的动作定义缺失。');
  }
}
/** Import is explicit and never replaces an existing snapshot, including a different version. */
export function copyDefinitionToProject(project: Project, input: ContentDefinition, available: ContentDefinition[] = [input]): string {
  const pending: ContentDefinition[] = [];
  const seen = new Set<string>();
  const collect = (definition: ContentDefinition) => {
    if (seen.has(definition.id)) return;
    seen.add(definition.id);
    const existing = project.definitions.find(entry => entry.id === definition.id);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(definition)) return;
      throw new Error('当前轴已有同一内容的快照。请保留旧轴，或先另建项目再使用新版。');
    }
    for (const effect of definition.effects) {
      if (!effect.action) continue;
      const dependency = available.find(entry => entry.id === effect.action) ?? project.definitions.find(entry => entry.id === effect.action);
      if (!dependency) throw new Error('区间效果的动作定义缺失，未复制到当前轴。');
      collect(dependency);
    }
    if (project.calculationProfile === 'direct' && (definition.nodes.some(node => ['attribute', 'capture', 'history'].includes(node.op)) || definition.effects.some(effect => ['recipient', 'attribute', 'unit', 'group', 'policy', 'maxStacks', 'captureAt'].some(key => Object.hasOwn(effect, key))))) {
      throw new Error('此定义需要 依赖求值配置。请先在队伍页明确采用 依赖求值配置，再复制定义；旧项目不会自动升级。');
    }
    pending.push(cloneDefinition(definition));
  };
  collect(input);
  project.definitions.push(...pending);
  return input.id;
}
