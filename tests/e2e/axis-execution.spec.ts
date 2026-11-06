import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DesktopBridge } from '../../src/web/src/platform/desktop';

type SaveWindow = Window & {
  leylineDesktop: DesktopBridge;
  axisSavedContents: string[];
  axisSaveMode: 'pending' | 'cancel' | 'fail';
  axisFinishSave?: (saved: boolean) => void;
};
type WorkerWindow = Window & {
  axisHoldReplies: boolean;
  axisHeldReplies: (() => void)[];
};

async function team(page: Page) {
  await page.getByTestId('workspace-nav-team').click();
  return page.getByRole('spinbutton', { name: '候选攻击力', exact: true });
}

test('uses the real axis Worker and round trips edits through undo, redo, and reload recovery', async ({ page }) => {
  const workers: string[] = [];
  const errors: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#compatibility');
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
  const attack = await team(page);
  await attack.fill('1100');
  await expect(page.getByTestId('workspace-total')).toHaveText('4,840');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(attack).toHaveValue('1000');
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(attack).toHaveValue('1100');
  await expect(page.getByTestId('workspace-total')).toHaveText('4,840');
  await page.reload();
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
  await page.getByRole('button', { name: '恢复上次编辑', exact: true }).click();
  await expect(page.getByTestId('workspace-total')).toHaveText('4,840');
  await expect(await team(page)).toHaveValue('1100');
  await expect(page.locator('.design-statusbar')).toContainText('当前轴尚未保存');
  expect(workers.some(url => url.includes('axis.worker.ts'))).toBe(true);
  expect(errors).toEqual([]);
});

test('ignores queued real Worker replies after cancellation and project replacement', async ({ page }) => {
  // Only delivery is controlled. Every response is calculated by the real native Worker.
  // Keeping a response already received by the adapter makes late delivery deterministic.
  await page.addInitScript(() => {
    const state = window as unknown as WorkerWindow;
    state.axisHoldReplies = false;
    state.axisHeldReplies = [];
    const NativeWorker = window.Worker;
    class ControlledWorker {
      private native: Worker;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        this.native = new NativeWorker(url, options);
        this.native.onmessage = event => {
          const handler = this.onmessage;
          const deliver = () => handler?.(event);
          if (state.axisHoldReplies) state.axisHeldReplies.push(deliver);
          else deliver();
        };
        this.native.onerror = event => this.onerror?.(event);
      }
      postMessage(value: unknown) { this.native.postMessage(value); }
      terminate() { this.native.terminate(); }
    }
    window.Worker = ControlledWorker as unknown as typeof Worker;
  });
  await page.goto('/#compatibility');
  await expect(page.getByTestId('workspace-total')).toHaveText('4,400');
  const attack = await team(page);
  await page.evaluate(() => { (window as unknown as WorkerWindow).axisHoldReplies = true; });
  await attack.fill('1100');
  await expect.poll(() => page.evaluate(() => (window as unknown as WorkerWindow).axisHeldReplies.length)).toBe(1);
  await expect(page.getByTestId('workspace-total')).toHaveText('待确认');
  await page.getByRole('button', { name: '取消计算', exact: true }).click();
  await page.evaluate(() => { (window as unknown as WorkerWindow).axisHeldReplies.shift()?.(); });
  await expect(page.locator('.shell-notices .shell-project-actions').getByRole('status')).toHaveText('已取消');
  await expect(page.getByTestId('workspace-total')).toHaveText('待确认');
  await page.evaluate(() => { (window as unknown as WorkerWindow).axisHoldReplies = false; });
  await page.getByRole('button', { name: '重新计算', exact: true }).click();
  await expect(page.getByTestId('workspace-total')).toHaveText('4,840');

  await page.evaluate(() => { (window as unknown as WorkerWindow).axisHoldReplies = true; });
  await attack.fill('1200');
  await expect.poll(() => page.evaluate(() => (window as unknown as WorkerWindow).axisHeldReplies.length)).toBe(1);
  await page.getByTestId('workspace-nav-projects').click();
  await page.getByRole('button', { name: /^武器乙 · 无加成/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as WorkerWindow).axisHeldReplies.length)).toBe(2);
  await page.evaluate(() => { (window as unknown as WorkerWindow).axisHeldReplies.shift()?.(); });
  await expect(page.getByTestId('workspace-total')).toHaveText('待确认');
  await page.evaluate(() => { (window as unknown as WorkerWindow).axisHeldReplies.shift()?.(); });
  await expect(page.getByTestId('workspace-total')).toHaveText('4,000');
  await expect(await team(page)).toHaveValue('1000');
});

test('preserves edits during native saving and after cancellation or failure', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as SaveWindow;
    state.axisSavedContents = [];
    state.axisSaveMode = 'pending';
    state.leylineDesktop = {
      openProject: async () => null,
      saveProject: async content => {
        state.axisSavedContents.push(content);
        if (state.axisSaveMode === 'cancel') return false;
        if (state.axisSaveMode === 'fail') throw new Error('文件写入失败，编辑内容已保留。');
        return new Promise<boolean>(resolve => { state.axisFinishSave = resolve; });
      },
    };
  });
  await page.goto('/#compatibility');
  const attack = await team(page);
  await attack.fill('1100');
  const save = page.getByRole('button', { name: '保存轴项目', exact: true });
  await save.click();
  await expect(save).toBeDisabled();
  await attack.fill('1200');
  await expect(page.getByTestId('workspace-total')).toHaveText('5,280');
  await page.evaluate(() => { (window as unknown as SaveWindow).axisFinishSave?.(true); });
  await expect(save).toBeEnabled();
  const savedAttack = await page.evaluate(() => {
    const input = JSON.parse((window as unknown as SaveWindow).axisSavedContents[0]);
    return input.candidate.actors[0].inputs.attack.value;
  });
  expect(savedAttack).toBe(1100);
  await expect(attack).toHaveValue('1200');
  await expect(page.locator('.design-statusbar')).toContainText('当前轴尚未保存');

  await page.evaluate(() => { (window as unknown as SaveWindow).axisSaveMode = 'cancel'; });
  await save.click();
  await expect(save).toBeEnabled();
  await expect(page.locator('.design-statusbar')).toContainText('当前轴尚未保存');
  await page.evaluate(() => { (window as unknown as SaveWindow).axisSaveMode = 'fail'; });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('操作未完成');
  await expect(attack).toHaveValue('1200');
  await expect(page.getByTestId('workspace-total')).toHaveText('5,280');
  await expect(page.locator('.design-statusbar')).toContainText('当前轴尚未保存');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(attack).toHaveValue('1100');
  await expect(page.getByTestId('workspace-total')).toHaveText('4,840');
});
