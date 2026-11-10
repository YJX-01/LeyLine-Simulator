/** Human-readable portable files. Storage and generated chunks may use compact JSON. */
export function formatJson(value: unknown): string {
  const content = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('JSON数值必须为有限值。');
    return item;
  }, 2);
  if (content === undefined) throw new Error('无法导出空JSON值。');
  return content + '\n';
}
