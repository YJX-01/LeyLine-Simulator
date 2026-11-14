import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';

// Only identity/path enumeration is mechanical. Review states below are explicitly authored.
const root = resolve(import.meta.dirname, '../../..');
const manifest = readContentSource(resolve(root, 'src/game-data/data/manifest.json'));
const basic = new Set(['apprenticesnotes', 'beginnersprotector', 'huntersbow', 'ironpoint', 'oldmercspal', 'pocketgrimoire', 'seasonedhuntersbow', 'wastergreatsword']);
const marker = '<!-- p5-semantic-ledger -->';
const batches = [
  ['characters', 'p5-inventory-characters.md'],
  ['weapons', 'p5-inventory-weapons.md'],
  ['sets', 'p5-inventory-artifact-sets.md'],
];
const expected = { characters: 154, weapons: 256, sets: 63 };
for (const [group, filename] of batches) {
  const ids = manifest[group];
  if (ids.length !== expected[group] || new Set(ids).size !== ids.length) throw new Error(`Review changed scope: ${group}`);
  const directory = group === 'sets' ? 'artifact-sets' : group;
  const lines = ids.map(id => {
    const entity = readContentSource(resolve(root, `src/game-data/data/${directory}/${id}.json`));
    const name = entity.identity?.name ?? entity.name;
    if (group === 'characters') {
      const paths = entity.talents.map(talent => `${talent.name}（${talent.id}）`).join('；');
      const binding = entity.talents.map(talent => `${talent.category}:${talent.hits.length}`).join('／');
      if (id === 'beidou') return `| ${name} (${id}) | ${paths} | 本批E及全部被动作用范围已读；C1—6文本已读但未纳入证明 | ${binding}；E档位0/1/2 | E九级三档独立完整公式 | C0 E正式Build／图／文件／Worker／候选 | 计算器可操作；完整角色仍未完成 | A/Q及命座、触发和捕获未收口；R2/R3 |`;
      if (id === 'kaeya') return `| ${name} (${id}) | ${paths} | E、全部被动及C1—3作用范围；冰棱捕获及C1已复核 | ${binding}；E加级复用；Q显式独立捕获 | C0—C3 E及C0—C1单次冰棱独立公式 | 正式Build／图／文件／Worker／候选；Q独立取值点不生成动作 | 计算器可选捕获技能／时刻／阶段；完整角色仍未完成 | C1普攻目标冰附着；Q C2以上、贡献分类及其它路径；R2/R3 |`;
      const direct = {
        noelle: ['E、全部被动及C1—3作用范围已读', 'C0—C3 E初始防御缩放；C3复用加级', 'Q强化与转换、C4及以上、护盾和治疗'],
        xinyan: ['E初始／脉冲区别、全部被动及C1—3已读', 'C0—C3 E初始火伤；C3复用加级', 'E脉冲、Q、护盾等级及C4以上'],
        razor: ['E点按／长按、雷之印及全部被动已读；C1全伤害影响保留', 'C0 E两类单次雷伤', 'C1拾取增伤、C2目标生命、后续命座和Q协同'],
        barbara: ['普攻族、全部被动及C1已读；C2水伤影响保留', 'C0—C1普攻族8类单次水伤', 'C2以上、E及治疗'],
      }[id];
      if (direct) return `| ${name} (${id}) | ${paths} | ${direct[0]} | ${binding}；支持标记未扩大 | ${direct[1]}独立完整公式 | 正式Build／图／文件／Worker／候选逐类核验 | 计算器可选、换装并重开；不是整角色可用 | ${direct[2]}；R2/R3 |`;
      return `| ${name} (${id}) | ${paths} | 本批未审，目录源和历史局部证据保留 | ${binding}；绑定不代表可用 | 本批未核验 | 本批未审，不能由标记推断 | 本批未验收 | 主要玩法、被动与命座逐项复核；R0/R3 |`;
    }
    if (group === 'weapons' && basic.has(id)) return `| ${name} (${id}) | 基础攻击成长／显式无副属性、无被动 | 本批逐件固定源及社区交叉核对 | passive.kind=none；无效果绑定 | 1—90来源曲线、全部突破逐值比较；合法最高70级 | 基础属性入口；双手剑随北斗E完整查询 | 计算器可选；不证明玩家持有 | 不扩展至缺效果字段的其它武器；R1本项已核验 |`;
    if (group === 'weapons') return `| ${name} (${id}) | 基础属性／主要战斗效果及精炼，待语义审查 | 本批未审，固定目录源保留 | 现有绑定不作完成证明 | 本批未核验 | 本批未审 | 本批未验收 | 逐条效果、精炼及正式查询；R0/R3 |`;
    return `| ${name} (${id}) | ${entity.effects.map(effect => `${effect.pieces}件效果`).join('／')} | 本批未审，固定目录源保留 | 现有绑定不作完成证明 | 本批未核验 | 本批未审 | 本批未验收 | 主要战斗效果；四星实物待R4，三星及以下仅实物验收暂缓；R0/R3/R4 |`;
  });
  const path = resolve(root, `docs/planning/${filename}`);
  const before = readFileSync(path, 'utf8').split(marker)[0].trimEnd();
  const section = `\n\n${marker}\n\n## R0主要路径语义台账（2026-11-14）\n\n覆盖本清单全部${ids.length}个ID。入口名称和绑定数量仅由正式定义枚举，不是语义归类或完成率；已细审北斗C0 E、凯亚C0—C3 E、C0—C1单次冰棱与8件基础武器。其它实体明确“本批未审”，不覆盖或否定历史局部证据。正式查询、用户操作与游戏观测分别登记；下表无一项表示整角色或P5完成，没有新增玩家战斗记录或游戏观测。统一边界见[本轮实施](p5-implementation.md)及[详细计划](p5-character-usability.md)。\n\n| 实体ID | 主要路径入口／待审范围 | 来源语义审阅 | 定义绑定 | 组件／独立计算 | 正式完整查询 | 用户操作 | 剩余阻断／归属 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${lines.join('\n')}\n`;
  writeFileSync(path, before + section, 'utf8');
  console.log(`${filename}: ${ids.length} IDs; review states are explicit, not inferred from flags.`);
}
