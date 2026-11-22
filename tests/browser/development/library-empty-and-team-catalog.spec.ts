import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { LocalAccount } from '@leyline/schema';
import type { SavedTeam } from '../../../src/web/src/stores/saved-teams';
import { readDocument } from '../../helpers/browser-document';

test('all five empty library lists open their creation dialogs and restore focus on cancel', async ({ page }) => {
  await page.goto('/');
  for (const [nav, action, title] of [
    ['characters', '手动添加角色', '手动添加角色'],
    ['loadouts', '新建角色配置', '手动添加角色'],
    ['artifacts', '新建圣遗物', '手动添加圣遗物'],
    ['combinations', '新建组合', '新建组合'],
    ['team', '新建队伍', '新建队伍'],
  ]) {
    await page.getByTestId(`workspace-nav-${nav}`).click();
    const create = page.locator('#workspace-main .library-empty').getByRole('button', { name: action, exact: true });
    await create.click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: `关闭${title}`, exact: true }).click();
    await expect(create).toBeFocused();
  }
});

test('a team slot can create a recorded character from the catalog and reuse the local configuration', async ({ page }) => {
  const source = '.references/enka/official-example.json';
  test.skip(!existsSync(source), 'Requires the original public showcase with Amber and Skyward Harp.');
  const recording = JSON.parse(readFileSync(source, 'utf8')).avatarInfoList.find((avatar: { avatarId: number }) => avatar.avatarId === 10000021);
  const weapon = recording.equipList.find((item: { itemId: number }) => item.itemId === 15501).weapon;
  const constellation = recording.talentIdList.length;
  const refinement = Number(Object.values(weapon.affixMap)[0]) + 1;
  const state = (key: string) => page.evaluate(key => localStorage.getItem(key), key);
  const accountKey = 'leyline-account-0.2.0', teamKey = 'leyline-saved-teams-0.2.0';
  await page.goto('/');
  await page.getByTestId('workspace-nav-team').click();
  const initialAccount = await state(accountKey), initialTeams = await state(teamKey);
  await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
  const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
  await team.getByRole('button', { name: '选择队员3', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
  const sources = picker.getByRole('group', { name: '角色资料来源' });
  await expect(sources.getByRole('button', { name: '全部角色', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const search = picker.getByLabel('搜索游戏角色', { exact: true });
  await search.pressSequentially('安柏');
  await sources.getByRole('button', { name: '本地', exact: true }).click();
  await expect(picker.getByText('还没有本地角色配置')).toBeVisible();
  await sources.getByRole('button', { name: '全部角色', exact: true }).click();
  await expect(search).toHaveValue('安柏');
  const choice = picker.getByRole('button', { name: '选择安柏', exact: true });
  await choice.click();
  const setup = page.getByRole('dialog', { name: '安柏', exact: true });
  const saveAndSelect = setup.getByRole('button', { name: '保存', exact: true });
  await expect(saveAndSelect).toBeEnabled();
  await setup.getByRole('button', { name: `${constellation}命`, exact: true }).click();
  await page.keyboard.press('Escape');
  const guard = page.getByRole('dialog', { name: '有未保存的修改', exact: true });
  await guard.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(setup).toHaveCount(0);
  await expect(choice).toBeFocused();
  await expect(search).toHaveValue('安柏');
  expect(await state(accountKey)).toBe(initialAccount);
  await choice.click();
  await setup.getByRole('button', { name: `${constellation}命`, exact: true }).click();
  await setup.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByLabel('搜索装备武器', { exact: true }).pressSequentially('天空之翼');
  await weapons.getByRole('button', { name: '天空之翼', exact: true }).click();
  await setup.getByRole('button', { name: `精炼${refinement}阶`, exact: true }).click();
  await saveAndSelect.click();
  const member = team.getByRole('button', { name: '选择安柏的角色配置', exact: true });
  await expect(picker).toHaveCount(0);
  await expect(member).toBeFocused();
  const savedAccount = (await state(accountKey))!;
  const account = await readDocument<LocalAccount>(page, 'account', savedAccount);
  expect(account.characters).toHaveLength(1);
  const [amber] = account.characters;
  expect(amber.build).toMatchObject({ character: { id: 'amber' }, weapon: { id: 'skywardharp' }, level: Number(recording.propMap['4001'].val), constellation, refinement, weaponLevel: weapon.level });
  expect(await state(teamKey)).toBe(initialTeams);
  await team.getByRole('button', { name: '关闭新建队伍', exact: true }).click();
  await guard.getByRole('button', { name: '放弃修改', exact: true }).click();
  expect(await state(accountKey)).toBe(savedAccount);
  await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
  await team.getByRole('button', { name: '选择队员3', exact: true }).click();
  await picker.getByRole('button', { name: '选择安柏首选配置', exact: true }).click();
  await team.getByRole('button', { name: '保存', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '队伍详情', exact: true });
  await detail.getByRole('button', { name: '选择安柏的角色配置', exact: true }).click();
  const configurations = page.getByRole('dialog', { name: '选择角色配置', exact: true });
  await expect(configurations.getByRole('group', { name: '角色资料来源' })).toHaveCount(0);
  await expect(configurations.getByRole('button', { name: '选择安柏首选配置', exact: true })).toBeVisible();
  await configurations.getByRole('button', { name: '切换其他角色', exact: true }).click();
  await expect(sources.getByRole('button', { name: '本地', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sources.getByRole('button', { name: '全部角色', exact: true }).click();
  await search.pressSequentially('安柏');
  await choice.click();
  const existing = page.getByRole('dialog', { name: '安柏', exact: true });
  await expect(existing.getByRole('button', { name: `精炼${refinement}阶`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await existing.getByRole('button', { name: '选用当前配置', exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(await state(accountKey)).toBe(savedAccount);
  const [saved] = await readDocument<SavedTeam[]>(page, 'saved-teams', (await state(teamKey))!);
  expect(saved.slots?.[2]?.configuration).toEqual({ accountId: account.id, characterId: amber.id, presetId: '' });
  await page.reload();
  await page.getByTestId('workspace-nav-characters').click();
  await expect(page.getByRole('button', { name: '查看安柏详情', exact: true })).toBeVisible();
  await page.getByTestId('workspace-nav-loadouts').click();
  await expect(page.getByRole('button', { name: '查看安柏首选配置', exact: true })).toBeVisible();
});

test('an equipment-only local configuration opens its own editor and returns to the same slot', async ({ page }) => {
  const source = '.references/enka/official-example.json';
  test.skip(!existsSync(source), 'Requires the original recorded showcase and its equipped flower.');
  await page.route('**/api/enka/618285856', route => route.fulfill({ json: JSON.parse(readFileSync(source, 'utf8')) }));
  await page.goto('/');
  await page.getByRole('button', { name: '展柜导入', exact: true }).click();
  await page.getByLabel('游戏 UID', { exact: true }).fill('618285856');
  await page.getByRole('button', { name: '查询角色展柜', exact: true }).click();
  await page.getByRole('button', { name: '确认导入 4 位角色', exact: true }).click();
  const content = (await page.evaluate(() => localStorage.getItem('leyline-account-0.2.0')))!;
  const account = await readDocument<LocalAccount>(page, 'account', content);
  const amber = account.characters.find(entry => entry.build?.character.id === 'amber')!;
  const role = page.getByRole('dialog', { name: '安柏', exact: true });
  // Use the library's own clear and equip operations to keep only her recorded flower.
  await page.getByRole('button', { name: '查看安柏详情', exact: true }).click();
  await role.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认清除', exact: true }).click();
  await role.getByRole('button', { name: '装备生之花', exact: true }).click();
  await page.getByRole('dialog', { name: '选择生之花', exact: true }).locator(`[data-artifact-id="${amber.equipment.flower}"]`).click();
  await role.getByRole('button', { name: '保存', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('workspace-nav-team').click();
  await page.locator('.library-empty').getByRole('button', { name: '新建队伍', exact: true }).click();
  const team = page.getByRole('dialog', { name: '新建队伍', exact: true });
  await team.getByRole('button', { name: '选择队员4', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择队员', exact: true });
  const select = picker.getByRole('button', { name: '选择安柏首选配置', exact: true });
  await select.click();
  await role.getByRole('button', { name: '更换武器', exact: true }).click();
  const weapons = page.getByRole('dialog', { name: '选择武器', exact: true });
  await weapons.getByRole('button', { name: amber.showcase!.build.weapon.name, exact: true }).click();
  await role.getByRole('button', { name: `${amber.build!.constellation}命`, exact: true }).click();
  await role.getByRole('button', { name: `精炼${amber.build!.refinement}阶`, exact: true }).click();
  await role.getByRole('button', { name: '保存', exact: true }).click();
  await role.getByRole('button', { name: '关闭安柏', exact: true }).click();
  await expect(select).toBeFocused();
  await select.click();
  await expect(team.locator('[data-slot="4"] .configuration-title')).toContainText(amber.showcase!.build.weapon.name);
  await expect(team.getByRole('button', { name: '选择安柏的角色配置', exact: true })).toBeFocused();
});
