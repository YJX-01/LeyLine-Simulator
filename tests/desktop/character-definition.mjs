import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { sourceFingerprint } from '../../tools/lib/source-fingerprint.mjs';
import { desktopExecutable } from '../../tools/lib/desktop-location.mjs';

const output = resolve('artifacts/character-definition-desktop');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'leyline-character-definition-'));
const executable = await desktopExecutable(true);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: executable, args: ['--smoke', `--user-data-dir=${profile}`], env, timeout: 30000 });
try {
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByTestId('workspace-nav-artifacts').click();
  await page.getByRole('button', { name: '莫娜导入', exact: true }).click();
  await page.getByLabel('导入莫娜圣遗物文件', { exact: true }).setInputFiles(resolve('.references/artifacts_mona.json'));
  await page.getByRole('button', { name: '确认导入 458 件五星圣遗物', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const before = await page.evaluate(() => localStorage.getItem('leyline-account-v2'));
  if (JSON.parse(before).artifacts.length !== 458) throw new Error('Actual inventory did not import');
  await page.getByTestId('workspace-nav-definitions').click();
  const panel = page.getByRole('region', { name: '自定义角色元数据', exact: true });
  await panel.getByRole('button', { name: '复制角色元数据', exact: true }).click();
  await expect(panel.getByLabel('角色元数据名称', { exact: true })).toHaveValue('琴 · 自定义');
  const multiplier = panel.getByLabel('元数据技能倍率', { exact: true });
  await multiplier.clear(); await multiplier.pressSequentially('2.92');
  const file = resolve(output, 'jean.character.json');
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, file);
  await panel.getByRole('button', { name: '导出角色定义', exact: true }).click();
  await expect.poll(async () => JSON.parse(await readFile(file, 'utf8').catch(() => '{}')).kind).toBe('character-definition');
  await panel.getByRole('button', { name: '打开角色定义', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已载入');
  await expect(multiplier).toHaveValue('2.92');
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
  await panel.getByRole('button', { name: '导出角色定义', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已取消');
  await expect(multiplier).toHaveValue('2.92');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await panel.evaluate(element => element.scrollWidth > element.clientWidth + 1)) throw new Error('Narrow metadata panel overflows');
  await page.screenshot({ path: resolve(output, 'character-definition-mobile.png'), fullPage: true });
  if (await page.evaluate(() => localStorage.getItem('leyline-account-v2')) !== before) throw new Error('Metadata workflow changed actual account');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ status: 'passed', sourceFingerprint:sourceFingerprint(), executable, profile, actualInventory: 458,
    checks: ['actual-inventory-import', 'metadata-copy', 'sequential-decimal-input', 'native-export-open', 'save-cancel-preserves-draft', '390px', 'account-unchanged'],
    scope: 'Metadata round-trip and actual inventory isolation; no game damage observation or full-axis acceptance claimed.' }, null, 2) + '\n');
  console.log('Packaged desktop metadata and actual inventory checks passed.');
} finally { await app.close(); }
