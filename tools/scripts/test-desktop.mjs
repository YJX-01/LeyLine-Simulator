import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const directory = resolve('artifacts/desktop-validation');
await mkdir(directory, { recursive: true });
const userData = await mkdtemp(resolve(tmpdir(), 'leyline-desktop-test-'));
const executable = resolve(`artifacts/desktop/LeyLine-${process.platform}-${process.arch}/${process.platform === 'win32' ? 'LeyLine.exe' : 'LeyLine'}`);
const launchEnvironment = { ...process.env };
delete launchEnvironment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ executablePath: executable, args: ['--smoke', `--user-data-dir=${userData}`],
  env: launchEnvironment, timeout: 30000 });
try {
  const page = await application.firstWindow();
  page.setDefaultTimeout(10000);
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await expect(page.getByRole('heading', { name: '伤害轴工作台' })).toBeVisible();
  await expect(page.getByTestId('objective-value')).toHaveText('4,400');
  await expect(page.getByText('桌面端 · 离线计算')).toBeVisible();
  await page.getByRole('combobox', { name: '武器方案', exact: true }).selectOption('weapon-b');
  await expect(page.getByTestId('objective-value')).toHaveText('4,000');
  await page.getByRole('combobox', { name: '武器方案', exact: true }).selectOption('weapon-a');
  await page.getByLabel('攻击力', { exact: false }).fill('1100');
  await expect(page.getByTestId('objective-value')).toHaveText('4,840');
  const savedPath = resolve(directory, 'saved-project.json');
  await application.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, savedPath);
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('项目已保存');
  const saved = JSON.parse(await readFile(savedPath, 'utf8'));
  if (saved.candidate.actors[0].inputs.attack.value !== 1100) throw new Error('Native save lost edited input');
  await page.getByLabel('攻击力', { exact: false }).fill('900');
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await expect(page.getByTestId('objective-value')).toHaveText('4,840');
  await expect(page.getByLabel('攻击力', { exact: false })).toHaveValue('1100');
  await page.getByLabel('攻击力', { exact: false }).fill('1000');
  await page.getByLabel('目标 hit-2', { exact: true }).uncheck();
  await expect(page.getByTestId('objective-value')).toHaveText('2,000');
  await expect(page.getByTestId('total-value')).toHaveText('4,400');
  await page.getByLabel('目标 hit-2', { exact: true }).check();
  await page.getByLabel('此效果需要额外触发条件').check();
  await expect(page.getByTestId('total-value')).toHaveText('待确认');
  await page.getByRole('combobox', { name: '条件 triggered', exact: true }).selectOption('false');
  await expect(page.getByTestId('total-value')).toHaveText('4,000');
  await page.getByLabel('此效果需要额外触发条件').uncheck();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.screenshot({ path: resolve(directory, 'desktop.png'), fullPage: true });
  const security = await page.evaluate(() => ({ nodeAvailable: typeof window.require !== 'undefined', bridge: Boolean(window.leylineDesktop), origin: location.origin }));
  if (security.nodeAvailable || !security.bridge || security.origin !== 'leyline://app') throw new Error(`Unexpected renderer isolation: ${JSON.stringify(security)}`);
  const preferences = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  if (!preferences.sandbox || !preferences.contextIsolation || preferences.nodeIntegration) throw new Error('Desktop security preferences changed');
  if (requests.some(url => /^https?:/.test(url)) || errors.length) throw new Error(JSON.stringify({ requests, errors }));
  console.log(JSON.stringify({ status: 'passed', checks: ['4400/4000/4840/2000', 'native-file-save-open', 'unknown-vs-false', 'isolated-renderer', 'local-assets'], screenshot: resolve(directory, 'desktop.png') }, null, 2));
} finally { await application.close(); }
