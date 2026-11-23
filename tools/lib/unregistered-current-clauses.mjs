import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, novice, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const catalog = '../data/sources/catalog/genshin-db/';
const upstream = 'data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const mechanics = 'kqm-theorycrafting-library@7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5:';
const mona = 'mona-community@589ac6919057709924c0c20d5a9d673fe9b0be1a:';
const read = path => readContentSource(new URL(path, import.meta.url));
const growth = read(catalog + 'characters.json');
const weaponGrowth = read(catalog + 'weapons.json');
const rates = read('../' + upstream + 'stats/talents.json');
const source = (group, id, field) => 'tools/' + upstream + 'ChineseSimplified/' + group + '/' + id + '.json#' + field;
const constellation = (id, rank) => source('constellations', id, 'c' + rank);
const path = rank => '/constellations/' + (rank - 1);
const known = result => result?.state === 'known' && result.value.kind === 'quantity' ? result.value.value : null;
const reference = id => ({ namespace: 'builtin', id, revision: '1' });

const pendingOutputs = [
  ['aether-anemo', 'a2', '风涡剑击败目标后的每跳自疗为自身生命上限2%。需要击败事件及每跳治疗入口。'],
  ['aether-hydro', 'a1', '源水之滴回复旅行者生命上限7%。需要拾取来源及治疗归属。'],
  ['aether-hydro', 'c4', '水纹护盾为生命上限10%，水伤吸收250%。需要长按窗口中的护盾创建、刷新上限及吸收验证。'],
  ['aether-hydro', 'c6', '源水之滴额外治疗附近生命比例最低者，其生命上限6%。需要确认同值择取、距离与治疗来源。'],
  ['alyosha', 'a1', '图加林每击治疗场上角色120%攻击力。需要对应的命中来源与治疗受益人。'],
  ['alyosha', 'c4', '图加林每击治疗最低生命比例角色60%攻击力。需要最低生命值受益者的选择规则。'],
  ['baizhu', 'a3', '部分采集物交互治疗场上角色2.5%白术生命上限。需要采集物事件及受益人。'],
  ['barbara', 'c6', '复苏目标并恢复100%生命。需要倒地事件、可用目标及复苏治疗语义。'],
  ['beidou', 'c1', '斫雷护盾为16%最大生命，对雷吸收250%。需要元素爆发护盾绑定，现有盾量审计中的捉浪为独立护盾。'],
  ['charlotte', 'c1', '核实印记每跳治疗80%攻击。需要实际被定格治疗的受益人和独立治疗登记。'],
  ['columbina', 'a4', '指定地区复苏后的治疗量依好感等级。需要好感等级对应的恢复曲线及地区条件。'],
  ['dahlia', 'c6', '西风之眷的10%攻速已验证。倒地对象的满生命复苏仍需单独的生命变化记录。'],
  ['dehya', 'a1', '赤鬃之血伤害在指定窗口降低60%。需要判定赤鬃之血承担伤害以及窗口中的每两秒限次。'],
  ['dehya', 'a2', '生命低于40%时立即回复20%，后续每跳6%。需要受伤前后生命、触发与两类治疗入账。'],
  ['dehya', 'c4', '炽鬃拳或焚落踢命中回复2.5%生命与1.5能量。需要合并触发间隔的独立治疗及能量登记。'],
  ['dori', 'c6', '战技后三秒雷附魔，普攻命中使全队回复4%多莉生命上限。需要雷附魔适用段、治疗受益人及限次。'],
  ['emilie', 'a3', '柔灯之匣使附近全队受到燃烧时提高85%火抗。需要把此火抗限定于入向燃烧伤害。'],
  ['escoffier', 'a1', '康复食疗每跳为场上角色恢复138.24%攻击力。需要单跳治疗登记与受益者选择。'],
  ['escoffier', 'c4', '康复食疗单跳倍增与2能量以施术者暴击率判定。需要独立的倍增状态、限次与能量输出。'],
  ['flins', 'c6', '自身月感电擢升35%，满辉队友另有10%。需要自身重叠时叠加规则及伤害独立记录。'],
  ['furina', 'a1', '其他治疗来源溢出后，每跳治疗各队员自身最大生命2%。需要来源排除、溢出和受益人确定。'],
  ['gaming', 'a1', '踏云献瑞命中后每跳恢复1.5%最大生命。需要从战技命中关联周期治疗。'],
  ['gaming', 'c1', '文仔会合恢复嘉明15%最大生命。需要会合来源及独立治疗登记。'],
  ['gorou', 'c4', '难破或摧碎时每跳治疗领域内场上角色50%五郎防御。需要领域位阶与治疗受益人。'],
  ['iansan', 'a2', '热身效应内回复夜魂时为场上角色治疗60%伊安珊攻击力。需要夜魂变化及受益人。'],
  ['iansan', 'a3', '纳塔燃素区特定飞跃免受坠落伤害。需要坠落伤害与该移动的来源。'],
  ['ifa', 'a1', '救援要义提高扩散、星扩散、感电与月感电。需要每层倍率、上限及各伤害族的独立对照。'],
  ['ifa', 'a4', '燃素机制区域生命低于40%时以10燃素恢复40%生命。需要区域、燃素、目标及治疗状态。'],
  ['jahoda', 'a1', '协调器火记录伤害为130%。水记录的治疗已单列。需要火伤倍率适用段，满辉及同数元素优先级验证。'],
  ['jean', 'a1', '普通攻击命中有50%概率全队回复15%琴攻击。需要命中后的治疗选择及概率事件。'],
  ['kaeya', 'a1', '霜袭每击中一单位自疗15%攻击。需要实际命中数量与单次治疗登记。'],
  ['kaeya', 'c4', '生命低于20%触发30%最大生命护盾且对冰吸收250%。需要独立护盾登记与受伤阈值。'],
  ['kaveh', 'a1', '草原核及其烈绽放、超绽放命中卡维时，回复300%其元素精通。需要从入向反应伤害判定触发。'],
  ['kaveh', 'c6', '天园之光为61.8%攻击的草范围伤害。需要实测伤害类别及与草原核强制引爆的分别归属。'],
  ['kinich', 'c6', '贯鳞炮弹跳为700%攻击的草元素战技伤害。需要将突破天赋和C2增强由原炮命中传给弹跳，并核对C1适用。'],
  ['kirara', 'a1', '每层加固包装可附加20%原安全运输护盾。需要实际叠加上限、剩余盾量与刷新绑定。'],
  ['kirara', 'c2', '联机冲撞队友护盾为安全运输护盾吸收上限40%。需要匹配受益队友和区分本人护盾与上限。'],
  ['layla', 'c1', '自身护盾20%提升在技能公式已表达。额外队友盾为自身护盾35%，需要各队友独立持有与已有盾排除。'],
  ['lynette', 'a3', '接触复苏水团的水中耐力和治疗提高25%。需要确认地图交互与受益人。'],
  ['manekin', 'a1', '离场禁限区域爆炸为自身元素200%攻击。需要形态、区域存在与爆炸伤害类别证据。'],
  ['manekina', 'a1', '离场禁限区域爆炸为自身元素200%攻击。需要形态、区域存在与爆炸伤害类别证据。'],
  ['mitya', 'c6', '稳态炉心造成原伤害115%，星超导擢升20%。需要明确稳态倍率覆盖哪些引爆段，以及反应擢升作用于哪些成员。'],
  ['nicole', 'c6', '指定圣祝之引受益者时已核验40%无视防御。队伍升变还需自动记录各角色先前的虚己之赐、距离及离场后的持续状态。', 'timeline-only'],
  ['odette', 'c6', '华彩提供25%星烁擢升，奥黛塔还有20%。需要自身重叠的合并规则、华彩授予及两个伤害族的对照。'],
  ['prune', 'c4', '转化誓锤再次弹起造成80%攻击对应元素伤害。需要分别查证战技和爆发衍生的弹跳伤害类别。'],
  ['qiqi', 'c4', '度厄真符使目标攻击力下降20%。需要目标攻击属性和流入承伤计算的依据。'],
  ['qiqi', 'c6', '复苏附近队伍成员并恢复50%生命。需要倒地目标、复苏治疗语义及范围。'],
  ['sangonomiyakokomi', 'c2', '半血及以下目标的化海月和海人化羽治疗分别提升4.5%及0.6%心海最大生命。需要两种治疗各自的受益人状态绑定。'],
  ['sayu', 'a1', '在场触发扩散或星扩散时治疗300＋1.2×精通。需要反应拥有者、场上状态及全队治疗归属。'],
  ['sayu', 'a2', '不倒貉貉的溅射治疗为主治疗20%。需要区分主目标与附近其他受益者。'],
  ['sigewinne', 'a2', '每1000点全队生命之契使本次治疗提升3%，上限30%。需要治疗时全队契值和每个治疗来源。'],
  ['sigewinne', 'a3', '水下低生命时恢复50%且全抗性降低10%。需要水下和当前场上状态、周期自疗及抗性适用范围。'],
  ['varesa', 'a3', '纳塔燃素区特定飞跃免受坠落伤害。需要坠落伤害与该移动的来源。'],
  ['wriothesley', 'c4', '凌跃拳回复提升至50%最大生命，溢出治疗可给场上自身20%或离场全队10%攻速。需要治疗前后生命、场上分支及互斥窗口。'],
  ['xianyun', 'c4', '冲击波命中后据步天梯次数治疗全队50%／80%／150%攻击力。需要命中至治疗的计数和受益者绑定。'],
  ['xingqiu', 'a1', '雨帘剑破碎或结束时恢复6%行秋生命上限。需要分开记录失效与破碎，并确认当前场上角色。'],
  ['xinyan', 'c1', '暴击使普通和重击攻击速度提升12%。需要普通及重击速度分别应用与独立状态。'],
  ['yanfei', 'c4', '施放爆发的护盾为45%生命上限，对火吸收250%。需要当前护盾实例与元素吸收。'],
  ['yaoyao', 'a2', '白玉萝卜炸裂后每跳恢复0.8%最大生命。需要爆炸范围受益人及单跳治疗登记。'],
  ['yoimiya', 'a1', '战技窗口内每个普攻命中叠加2%火伤，最多十层。需要按该伤害发生前层数和三秒续期验证。'],
  ['yumemizukimizuki', 'c4', '同一次拾取同时触发点心伤害与治疗并恢复5能量。需要在同一拾取输入上绑定两个输出及限次能量。'],
  ['zhongli', 'a1', '玉璋盾受击每层加5%护盾强效，最多五层。需要保留同盾实例的确证受击层数。'],
  ['zhongli', 'c6', '玉璋盾受伤量40%转治疗，单次上限为受益人生命8%。需要实测伤害基准和护盾实际受损值。'],
  ['zibai', 'c6', '灵驹飞踏超额时隙浮光每点擢升1.6%。需要本次实际消耗、后三秒有效期及月结晶擢升适用范围。'],
];

const timingOutputs = [
  ['aether-cryo', 'c1', '星烁命中后的恢复能量与每0.5秒限次。'],
  ['aether-electro', 'c6', '两次普通落雷后的强化计数和额外1点能量。'],
  ['arlecchino', 'a1', '血偿勒令击败或结算时授予130%生命之契及契值上限。'],
  ['dori', 'a2', '战技每次施放一次的自身充能转能量，最多15。'],
  ['furina', 'c4', '召唤物命中或治疗后的4点能量与每5秒限次。'],
  ['gorou', 'c1', '其他场上队友岩伤缩短战技冷却。'],
  ['kamisatoayaka', 'c1', '冰伤普攻或重击的战技减冷却判定。'],
  ['kinich', 'a1', '持续期间对噩地的燃烧、烈绽放命中产生夜魂。'],
  ['kirara', 'c1', '生命上限每8000产生额外弹体，单枚倍率已有。'],
  ['klee', 'a2', '重击暴击时全队回复能量。'],
  ['kujousara', 'a2', '伏命中后的充能转能量及三秒限次。'],
  ['kujousara', 'c1', '施加攻击加成或命中时减少施放冷却。'],
  ['lanyan', 'c2', '护盾存续时普攻命中最多补充原盾40%及限次。'],
  ['lohen', 'a1', '由其他队友伤害阈值判断额外争胜。'],
  ['lohen', 'c1', '争胜上限和由其他队友伤害积攒速度。'],
  ['mika', 'a2', '战技及爆发重叠窗口、暴击与侦明层数上限。'],
  ['mika', 'c1', '灵风攻速比例改变鹰翎恢复间隔。'],
  ['mika', 'c4', '鹰翎治疗使米卡恢复能量与次数。'],
  ['mualani', 'c2', '进夜魂与拾取豚豚球时获得充能及夜魂。'],
  ['mualani', 'c6', '解除C1伤害提升每次夜魂一次的限制。'],
  ['nefer', 'a2', '额外草露供给及由元素精通决定的供给速率。'],
  ['neuvillette', 'c4', '受治疗产生源水之滴与限次。'],
  ['raidenshogun', 'c6', '梦想一心命中后其他队友爆发冷却缩短与五次上限。'],
  ['rosaria', 'c4', '战技每次施放首次暴击获得5点能量。'],
  ['shenhe', 'c6', '普攻和重击触发冰翎时不消耗次数。'],
  ['tighnari', 'c6', '花筥箭蓄力耗时减少0.9秒。额外箭的单击倍率独立核验。'],
  ['yaoyao', 'c2', '处于爆发状态时萝卜命中后的能量与限次。'],
];

const indirectOutputs = [
  ['bennett', 'c1', '爆发领域的两条攻击力贡献已含C1解除血量门槛和附加基础攻击力20%。'],
  ['collei', 'c2', '突破一被动的草伤命中已有二命免除事先反应门槛。续时为独立时序。'],
  ['eula', 'c6', '光降之剑倍率绑定当前层数。初始层数及随机叠层属于时序。'],
  ['furina', 'c2', '爆发增益读取原始与溢出气氛值，生命上限按每层0.35%与140%上限计算。积攒倍率属于时序。'],
  ['nicole', 'a2', '圣祝之引当前的攻击加成由已有效的圣祝状态绑定。八秒自触发属于时序。'],
];

function finding([entity, slot, needed, status]) {
  const rank = Number(slot.slice(1));
  const passive = slot[0] === 'a';
  const id = entity.includes('-') ? 'traveler' + entity.split('-')[1] : entity;
  const sources = /^manekin/.test(entity) ? ['tools/data/sources/character-text/base-and-manekin.json'] :
    [passive ? source('talents', id, 'passive' + rank) : constellation(id, rank)];
  return { entity, field: passive ? '/passives/' + (rank - 1) : path(rank), sources, needed, reason: needed, ...(status ? { status } : {}) };
}

const hitCases = [
  ['bennett', 4, 'c4.passionate-followup', 'c4FollowupReady', 'skill', 'pyro', rates.bennett.combat2.param3[3] * 1.35,
    mechanics + 'docs/characters/pyro/bennett.md:192-208', 'favoniussword'],
  ['chongyun', 1, 'c1.ice-unleashed', 'c1IceBladeReady', 'other', 'cryo', 0.5,
    mechanics + 'docs/evidence/characters/cryo/chongyun.md:124-143', 'ferrousshadow'],
  ['venti', 1, 'c1.split-arrow-aimed', 'c1SplitArrowHit', 'charged', 'physical', rates.venti.combat1.param7[0] * 0.33,
    mechanics + 'docs/characters/anemo/venti.md:181-195', 'favoniuswarbow'],
  ['venti', 1, 'c1.split-arrow-fully-charged', 'c1SplitArrowHit', 'charged', 'anemo', rates.venti.combat1.param8[0] * 0.33,
    mechanics + 'docs/characters/anemo/venti.md:181-195', 'favoniuswarbow'],
  ['tighnari', 6, 'c6.clusterbloom-arrow', 'c6ClusterbloomReady', 'charged', 'dendro', 1.5,
    mona + 'mona_core/src/character/characters/dendro/tighnari.rs:104-121', 'favoniuswarbow'],
  ['kujousara', 2, 'c2.weaker-crowfeather', 'c2WeakerCrowfeatherHit', 'skill', 'electro', rates.kujousara.combat2.param1[0] * 0.3,
    mechanics + 'docs/characters/electro/kujou-sara.md:190-205', 'favoniuswarbow'],
];

export const unregisteredCurrentClauseIds = [...new Set(hitCases.map(([id]) => id).concat([
  'jean', 'dahlia', 'raidenshogun', 'sucrose', 'nicole', 'aether-anemo', 'lumine-anemo', 'aether-electro', 'lumine-electro', 'kaeya', 'albedo',
]))];

export function auditUnregisteredCurrentClauses(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], verified = new Set();
  const relevant = entries => entries.flatMap(entry => entry[0].startsWith('aether-') ? [entry, [entry[0].replace('aether-', 'lumine-'), ...entry.slice(1)]] : [entry])
    .filter(([id]) => characters.has(id)).map(finding);
  const gaps = relevant(pendingOutputs);

  function build(id, rank, ascension, weaponId) {
    const character = characters.get(id);
    const weapon = weapons.get(weaponId ?? novice[character.identity.weaponType]);
    return { ...auditBuild(character, weapon), constellation: rank, ascension, level: ascension ? character.progression.promotion[ascension].maxLevel : 1 };
  }

  function result(id, key, settings) {
    const { rank, ascension = 0, weapon, facts = {}, recipientFacts = {}, event, eventTime = 0, albedoCastAt, time = 1, peer, stat } = settings;
    const owner = build(id, rank, ascension, weapon);
    const members = [{ id: 'actor', build: owner }];
    let measured = members[0];
    if (peer) {
      measured = { id: 'peer', build: build(peer, 0, 0) };
      members.push(measured);
    }
    if (albedoCastAt !== undefined) members.push({ id: 'albedo', build: build('albedo', 0, 4) });
    const { character } = measured.build;
    const hitId = character.id + '.' + key;
    const talent = character.talents.find(talent => talent.hits.some(hit => hit.id === hitId));
    const hit = talent?.hits.find(hit => hit.id === hitId);
    if (!hit) throw new Error('缺少正式命中 ' + hitId);
    const prepared = engine.prepareStructuredBuilds(members);
    if (!prepared.ok) throw new Error(id + ' ' + JSON.stringify(prepared.diagnostics));
    const { team } = prepared;
    const { setup, request } = auditHit(character, talent, hit, measured.build.level);
    const { frame } = request;
    setAuditDefaults(owner.character, frame);
    setGateFacts(owner.character, frame, facts);
    setup.events.find(event => event.id === 'hit').actorId = measured.id;
    setup.events.find(event => event.id === 'hit').timeMs = time;
    if (peer) frame.factOverrides.push({ subject: { kind: 'actor', id: 'peer' },
      facts: { onField: bool(true), ...recipientFacts } });
    if (event) setup.events.unshift({ id: 'trigger', kind: 'hit', actorId: 'actor', targetIds: ['enemy'], timeMs: eventTime,
      order: 0, skillId: id + '.' + event.split('.')[0], hitId: id + '.' + event, category: event.split('.')[0], sourceEventIds: [], facts: {} });
    if (albedoCastAt !== undefined) setup.events.unshift({ id: 'albedo-cast', kind: 'action', actorId: 'albedo', targetIds: [],
      timeMs: albedoCastAt, order: 0, skillId: 'albedo.burst', sourceEventIds: [], facts: {} });
    if (!stat) {
      const value = engine.evaluateStructuredHit(team, setup, request);
      return { value: known(value.totals.all), execution: value.execution, category: hit.category, element: hit.element };
    }
    const binding = stat.startsWith('target.') ? { kind: 'enemy', key: reference(stat) } :
      { kind: 'attribute', key: reference('attribute.' + stat), actor: { role: 'recipient' } };
    const context = engine.createStructuredCombatContext(team, setup);
    const evaluated = engine.evaluateCombatBindings(team.program, context, { value: { ...binding, at: { kind: 'current', phase: 'same' } } },
      { ...frame, ownerId: 'actor', recipientId: measured.id, contributorId: null, hit: { skillId: talent.id, hitId, category: hit.category,
        element: hit.element, family: 'ordinary', origin: hit.origin, reactionId: null } });
    return { value: known(evaluated.outputs.value) };
  }

  function probe(entity, field, key, sources, settings, expected, validate = () => true) {
    const actual = result(entity, key, settings);
    const ok = typeof actual.value === 'number' && Math.abs(actual.value - expected) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
    rows.push({ entity, field, sources, settings: { key, ...settings }, ...actual, expected,
      ...(!ok || !validate(actual) ? { issue: '单击数值、适用类别或条件与固定来源的独立预期不符' } : {}) });
  }

  const levelOneAttack = (id, weapon) => growth[id].stats.base.attack + weaponGrowth[weapon].stats.base.attack;
  for (const [id, rank, key, gate, category, element, ratio, evidence, alternative] of hitCases) if (characters.has(id)) {
    const field = path(rank), sources = [constellation(id, rank), evidence];
    const defaultWeapon = novice[characters.get(id).identity.weaponType];
    for (const [actualRank, active, weapon] of [[rank, false, defaultWeapon], [rank - 1, true, defaultWeapon],
      [rank, true, defaultWeapon], ...(weapons.has(alternative) ? [[rank, true, alternative]] : [])]) {
      const activeDamage = actualRank === rank && active;
      const expected = activeDamage ? levelOneAttack(id, weapon) * ratio * 0.5 * 0.9 : 0;
      probe(id, field, key, sources, { rank: actualRank, weapon, facts: { [id + '.' + gate]: active } }, expected,
        actual => actual.category === category && actual.element === element);
    }
  }

  if (characters.has('raidenshogun')) {
    const id = 'raidenshogun', field = path(2), sources = [constellation(id, 2), source('talents', id, 'combat3')];
    for (const [key, expectedAtC2] of [['burst.param1', 0.6], ['burst.param5', 0.6], ['burst.param16', 0.6], ['skill.param1', 0], ['normal.param1', 0]]) {
      for (const rank of [1, 2]) probe(id, field, key, sources, { rank, stat: 'defenseIgnore' }, rank === 2 ? expectedAtC2 : 0);
    }
    for (const rank of [1, 2]) probe(id, field, 'burst.param1', sources, { rank },
      levelOneAttack(id, novice.WEAPON_POLE) * rates[id].combat3.param1[0] * 0.9 / (rank === 2 ? 1.4 : 2));
  }

  if (characters.has('jean')) {
    const id = 'jean', field = path(4), sources = [constellation(id, 4), mechanics + 'docs/characters/anemo/jean.md:182-188'];
    for (const [rank, inField, element, expected] of [[4, true, 'anemo', -0.3], [4, true, 'cryo', 0.1],
      [4, false, 'anemo', 0.1], [3, true, 'anemo', 0.1]]) {
      probe(id, field, 'skill.param1', sources, { rank, stat: 'target.resistance.' + element, facts: { 'jean.c4EnemyInsideDandelion': inField } }, expected);
    }
  }

  if (characters.has('dahlia') && characters.has('kaeya')) {
    const id = 'dahlia', field = path(6), sources = [constellation(id, 6)];
    for (const [rank, favor, onField, expected] of [[6, true, true, 0.1], [5, true, true, 0], [6, false, true, 0], [6, true, false, 0]]) {
      probe(id, field, 'normal.param1', sources, { rank, peer: 'kaeya', stat: 'normalAttackSpeed',
        recipientFacts: { 'dahlia.favonianFavor': bool(favor), onField: bool(onField) } }, expected);
    }
  }

  if (characters.has('nicole') && characters.has('kaeya')) {
    const id = 'nicole', field = path(6), sources = [constellation(id, 6), mechanics + 'src/data/characters/Nicole.json:340-342'];
    for (const [rank, peer, blessed, expected] of [[6, 'kaeya', true, 0.4], [6, 'kaeya', false, 0], [5, 'kaeya', true, 0],
      [6, undefined, true, 0.4], [6, undefined, false, 0]]) {
      const key = 'nicole.guidanceOfTheosis';
      probe(id, field, 'normal.param1', sources, { rank, peer, stat: 'defenseIgnore', facts: peer ? {} : { [key]: blessed },
        recipientFacts: peer ? { [key]: bool(blessed) } : {} }, expected);
    }
  }

  if (characters.has('sucrose') && characters.has('kaeya') && weapons.has('sacrificialfragments')) {
    const id = 'sucrose', field = '/passives/1';
    const sources = [source('talents', id, 'passive2'), mechanics + 'docs/characters/anemo/sucrose.md:158-167'];
    const bonus = Math.round(weaponGrowth.sacrificialfragments.stats.base.specialized) * 0.2;
    for (const [ascension, peer, event, time, expected] of [
      [4, 'kaeya', 'skill.param1', 1, bonus], [4, 'kaeya', 'burst.param2', 7999, bonus], [4, 'kaeya', 'burst.param1', 8001, 0],
      [4, 'kaeya', 'normal.param1', 1, 0], [4, 'kaeya', undefined, 1, 0], [3, 'kaeya', 'skill.param1', 1, 0],
      [4, undefined, 'skill.param1', 1, bonus / 0.2],
    ]) probe(id, field, 'normal.param1', sources, { rank: 0, ascension, weapon: 'sacrificialfragments', peer, event, time, stat: 'elementalMastery' }, expected);
    if (characters.has('albedo')) {
      const recorded = [...sources, mechanics + 'docs/evidence/characters/anemo/sucrose.md:352-365'];
      const settings = { rank: 0, ascension: 4, weapon: 'sacrificialfragments', peer: 'kaeya', event: 'skill.param1',
        eventTime: 9000, time: 11000, stat: 'elementalMastery' };
      probe(id, field, 'normal.param1', recorded, { ...settings, albedoCastAt: 0 }, bonus + 125 * 0.2);
      probe(id, field, 'normal.param1', recorded, { ...settings, albedoCastAt: 10000 }, bonus + 125);
    }
  }

  for (const id of ['aether-anemo', 'lumine-anemo']) if (characters.has(id)) {
    const field = path(6), sources = [constellation('traveleranemo', 6)];
    for (const [rank, active, absorbed, element, expected] of [[6, true, 'pyro', 'anemo', -0.1], [6, true, 'pyro', 'pyro', -0.1],
      [6, true, 'hydro', 'pyro', 0.1], [6, true, 'hydro', 'hydro', -0.1], [6, true, 'none', 'hydro', 0.1],
      [6, false, 'pyro', 'anemo', 0.1], [5, true, 'pyro', 'pyro', 0.1]]) {
      probe(id, field, 'burst.param1', sources, { rank, stat: 'target.resistance.' + element,
        facts: { [id + '.c6GustSurgeShred']: active, [id + '.c6GustSurgeAbsorbed']: absorbed } }, expected);
    }
  }

  for (const id of ['aether-electro', 'lumine-electro']) if (characters.has(id)) {
    const field = path(6), sources = [constellation('travelerelectro', 6), source('talents', 'travelerelectro', 'combat3')];
    for (const [rank, active, key, expectedMultiplier] of [
      [6, true, 'burst.param2', 2], [6, false, 'burst.param2', 1], [5, true, 'burst.param2', 1],
      [6, true, 'burst.param1', 1],
    ]) {
      probe(id, field, key, sources, { rank, stat: 'baseMultiplier', facts: { [id + '.c6EnhancedFallingThunder']: active } }, expectedMultiplier);
    }
  }

  const partial = new Set(gaps.map(row => row.entity + row.field));
  const checked = new Set(rows.map(row => row.entity + row.field));
  const failed = new Set(rows.filter(row => row.issue).map(row => row.entity + row.field));
  for (const key of checked) if (!partial.has(key) && !failed.has(key)) verified.add(key);

  return { rows, verified, gaps, timing: relevant(timingOutputs), indirect: relevant(indirectOutputs),
    summary: { unregisteredCurrentClauseCases: rows.length, unregisteredCurrentClauseFailures: rows.filter(row => row.issue).length,
    unregisteredCurrentClausesVerified: verified.size } };
}
