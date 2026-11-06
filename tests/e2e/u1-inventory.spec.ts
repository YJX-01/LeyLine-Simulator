import { existsSync } from 'node:fs';
import { test } from '@playwright/test';
import { inventoryTask } from '../u1-inventory-task';
test.skip(!existsSync('.references/artifacts_mona.json'), 'Requires the user-provided actual inventory; no synthetic substitute.');
test('U1 actual inventory: preview, browse, filter, inspect, save and reopen', async ({ page }, info) => inventoryTask(page, info));
