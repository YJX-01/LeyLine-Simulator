import { calculationJsonPointer, type CalculationDiagnostic } from './diagnostic';

export const calculationJsonLimits = Object.freeze({ bytes: 8 * 1024 * 1024, depth: 128, values: 100000 });
export type CalculationJsonResult = { ok: true; value: unknown } | { ok: false; diagnostics: CalculationDiagnostic[] };

/** Object callers must obey the same finite tree boundary as serialized documents. */
export function inspectCalculationStructure(input: unknown): CalculationDiagnostic[] {
  const active = new Set<object>();
  let visits = 0;
  const walk = (value: unknown, depth: number, path: (string | number)[]): CalculationDiagnostic | undefined => {
    const fail = (code: CalculationDiagnostic['code'], message: string): CalculationDiagnostic => ({ code, message,
      severity: 'error', jsonPointer: calculationJsonPointer(path), affectedOutputIds: [] });
    if (++visits > calculationJsonLimits.values || depth > calculationJsonLimits.depth) return fail('budget', '计算对象结构超过预算。');
    if (!value || typeof value !== 'object') return undefined;
    if (active.has(value)) return fail('cycle', '计算对象必须是有限的 JSON 树。');
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return fail('invalid-range', '计算对象必须使用普通 JSON 对象。');
    active.add(value);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (Array.isArray(value) && key === 'length') continue;
      if (!('value' in descriptor)) return fail('invalid-range', '计算对象不得包含访问器。');
      const issue = walk(descriptor.value, depth + 1, [...path, key]);
      if (issue) return issue;
    }
    active.delete(value);
    return undefined;
  };
  const issue = walk(input, 0, []);
  return issue ? [issue] : [];
}

/** Inspect member names before JSON.parse can overwrite a duplicate, without evaluating source text. */
export function parseCalculationJson(text: string): CalculationJsonResult {
  let position = 0, visits = 0;
  let pointer: (string | number)[] = [];
  let code: CalculationDiagnostic['code'] = 'malformed-json';
  const fail = (message: string): never => { throw new Error(message); };
  const whitespace = () => { while (/[\t\n\r ]/.test(text[position] ?? '') && position < text.length) position++; };
  const string = (): string => {
    const start = position++;
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') { position++; continue; }
      if (character === '"') return JSON.parse(text.slice(start, position)) as string;
    }
    return fail('JSON字符串未结束。');
  };
  const visit = (depth: number, path: (string | number)[]) => {
    pointer = path;
    if (++visits > calculationJsonLimits.values || depth > calculationJsonLimits.depth) { code = 'budget'; fail('JSON结构超过执行预算。'); }
    whitespace();
    const token = text[position];
    if (token === '{') {
      position++; whitespace();
      const keys = new Set<string>();
      if (text[position] === '}') { position++; return; }
      while (position < text.length) {
        whitespace();
        if (text[position] !== '"') fail('JSON对象成员名必须是字符串。');
        const key = string();
        pointer = [...path, key];
        if (keys.has(key)) fail('JSON对象成员名重复：' + key);
        keys.add(key); whitespace();
        if (text[position++] !== ':') fail('JSON对象缺少冒号。');
        visit(depth + 1, [...path, key]); whitespace();
        if (text[position] === '}') { position++; return; }
        if (text[position++] !== ',') fail('JSON对象缺少逗号。');
      }
      fail('JSON对象未结束。');
    } else if (token === '[') {
      position++; whitespace();
      if (text[position] === ']') { position++; return; }
      for (let index = 0; position < text.length; index++) {
        visit(depth + 1, [...path, index]); whitespace();
        if (text[position] === ']') { position++; return; }
        if (text[position++] !== ',') fail('JSON数组缺少逗号。');
      }
      fail('JSON数组未结束。');
    } else if (token === '"') string();
    else {
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(position));
      if (!match) fail('JSON值无效。');
      position += match![0].length;
    }
  };
  try {
    if (new TextEncoder().encode(text).byteLength > calculationJsonLimits.bytes) { code = 'budget'; fail('计算文件超过8 MiB。'); }
    visit(0, []); whitespace();
    if (position !== text.length) fail('JSON根值后存在多余内容。');
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (cause) {
    return { ok: false, diagnostics: [{ code, severity: 'error', jsonPointer: calculationJsonPointer(pointer), affectedOutputIds: [],
      message: cause instanceof Error ? cause.message : 'JSON格式无效。' }] };
  }
}
