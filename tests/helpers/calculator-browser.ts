import { expect, test as base, type Locator } from '@playwright/test';

/** Check the live calculator throughout each scenario, including dialogs that close before the final assertion. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const violations = new Set<string>();
    await page.exposeFunction('reportCalculatorViolation', (message: string) => violations.add(message));
    await page.addInitScript(() => {
      const report = (window as unknown as { reportCalculatorViolation: (message: string) => void }).reportCalculatorViolation;
      const forbidden = /待核实|待核验|待确认|需补充条件/;
      function inspect(node: Node) {
        const element = node instanceof Element ? node : node.parentElement;
        if (!element) return;
        const root = element.closest('.damage-calculator') ? element : element.querySelector('.damage-calculator');
        if (!root) return;
        const content = root.textContent ?? '';
        const index = content.search(forbidden);
        if (index !== -1) report('计算页文案：' + content.slice(Math.max(0, index - 40), index + 40));
        for (const control of [root, ...root.querySelectorAll('[aria-label], [placeholder], [title]')]) {
          for (const key of ['aria-label', 'placeholder', 'title']) {
            const value = control.getAttribute(key);
            if (value && forbidden.test(value)) report(key + ' 包含 ' + value);
          }
        }
        const selector = '.buff-entry input, .buff-entry select';
        const controls = root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(selector);
        for (const control of root.matches(selector) ? [root as HTMLInputElement | HTMLSelectElement, ...controls] : controls) {
          if (control.value === '' || !control.validity.valid || control instanceof HTMLInputElement && control.indeterminate) {
            report('增益卡初始控件无有效值：' + control.outerHTML);
          }
        }
      }
      new MutationObserver(records => {
        for (const change of records) {
          if (change.type === 'childList') change.addedNodes.forEach(inspect);
          else inspect(change.target);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['aria-label', 'placeholder', 'title'] });
    });
    await use(page);
    expect([...violations], '伤害计算界面约定').toEqual([]);
  },
});

export async function revealDamageCard(card: Locator) {
  const toggle = card.locator('xpath=ancestor::section[1]').getByRole('heading').getByRole('button');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  return card;
}

export async function chooseDamageCard(card: Locator) {
  await (await revealDamageCard(card)).click();
}
