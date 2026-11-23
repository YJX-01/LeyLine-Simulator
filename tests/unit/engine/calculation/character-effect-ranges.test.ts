import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { expect, it } from 'vitest';
import { auditCharacterEffectRanges } from '../../../../tools/lib/character-effect-ranges.mjs';

it('shows only the sourced range or reach for the selected character and hit', async () => {
  const [characters, weapons] = await Promise.all([
    Promise.all(['amber', 'chiori', 'fischl', 'kukishinobu', 'xiangling', 'yaemiko', 'zhongli'].map(getCharacter)),
    Promise.all(['huntersbow', 'dullblade', 'apprenticesnotes', 'beginnersprotector'].map(getWeapon)),
  ]);
  const audit = auditCharacterEffectRanges({ characters, weapons }, engine);
  expect(audit.rows.filter(row => row.issue)).toEqual([]);
  expect(audit.summary.verifiedCharacterEffectRanges).toBe(7);
  expect(audit.rows.filter(row => row.probe?.id.startsWith('unlocked')).map(row => [row.entity, row.probe?.hitId, row.value])).toEqual([
    ['amber', 'amber.burst.param1', 0.3],
    ['chiori', 'chiori.skill.param1', 0.5],
    ['fischl', 'fischl.skill.param2', 0.5],
    ['kukishinobu', 'kukishinobu.burst.param1', 0.5],
    ['xiangling', 'xiangling.skill.param1', 0.2],
    ['yaemiko', 'yaemiko.skill.param2', 0.6],
    ['yaemiko', 'yaemiko.skill.param3', 0.6],
    ['yaemiko', 'yaemiko.skill.param4', 0.6],
    ['zhongli', 'zhongli.burst.param1', 0.2],
  ]);
  expect(audit.gaps.map(row => row.entity)).toEqual(expect.arrayContaining(['gaming', 'kinich']));
}, 15000);
