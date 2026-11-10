import { existsSync } from 'node:fs';
import { test } from '@playwright/test';
import { inventoryTask } from '../../helpers/inventory-task';
test.skip(!existsSync('.references/artifacts_mona.json'), 'Requires user-provided actual inventory, unavailable in public CI.');
for (const url of ['http://127.0.0.1:5175/', 'http://127.0.0.1:5176/leyline/']) {
  test(`${url}: Actual inventory save and reopen`, async ({ page }, info) => inventoryTask(page, info, url));
}
