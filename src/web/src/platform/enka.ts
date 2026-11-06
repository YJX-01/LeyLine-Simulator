import { getDesktopBridge } from './desktop';
export function enkaErrorLabel(error: unknown): string {
  if (error instanceof Error && error.name === 'ZodError') return '展柜响应字段不完整，账号资料没有改变。';
  const message = String(error);
  if (/ENKA_HTTP_400/.test(message)) return 'UID 格式不正确，请检查后重试。';
  if (/ENKA_HTTP_404/.test(message)) return '没有找到这个 UID，请检查服务器与数字。';
  if (/ENKA_HTTP_424/.test(message)) return '游戏或展柜服务正在维护，请稍后重试。';
  if (/ENKA_HTTP_429/.test(message)) return '查询过于频繁，请稍后重试。';
  if (/ENKA_HTTP_403/.test(message)) return 'Enka 暂时拒绝此请求，请稍后重试。';
  if (/ENKA_HTTP_[45]|fetch|network|timeout|aborted/i.test(message)) return '暂时无法连接 Enka，请稍后重试；账号资料没有改变。';
  return error instanceof Error ? error.message.replace(/^Error: /, '') : '展柜查询失败，账号资料没有改变。';
}
export async function fetchEnka(uid: string, signal: AbortSignal): Promise<unknown> {
  if (!/^\d{9,10}$/.test(uid)) throw new Error('请输入 9～10 位数字 UID。');
  const bridge = getDesktopBridge();
  if (bridge?.lookupEnka) return JSON.parse(await bridge.lookupEnka(uid));
  const response = await fetch(`${import.meta.env.BASE_URL}api/enka/${uid}`, { signal:AbortSignal.any([signal,AbortSignal.timeout(18000)]), headers: { Accept: 'application/json' } });
  if (!response.ok) {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('当前网页未提供 Enka 导入通道，请使用桌面版或本地预览。');
    throw new Error(`ENKA_HTTP_${response.status}`);
  }
  const content = await response.text();
  if (content.length > 2 * 1024 * 1024) throw new Error('展柜响应过大，未读取。');
  try { return JSON.parse(content); } catch { throw new Error('当前网页未提供 Enka 导入通道，请使用桌面版或本地预览。'); }
}
