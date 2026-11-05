<script setup lang="ts">
import { computed } from 'vue';
import { resolveLoadout } from '@leyline/engine';
import { type Loadout, type EquipmentStat } from '@leyline/schema';
import { content, capacity, sets, slots, statNames, percentStat, allowedMain, talentCap } from '../domain/editor';
const actor = defineModel<Loadout>({ required: true });
const weapons = computed(() => Object.entries(content.weapons).filter(([, weapon]) => weapon.weapon_type === content.characters[actor.value.character].base.weapon));
const preview = computed(() => { try { return { value: resolveLoadout(JSON.parse(JSON.stringify(actor.value))) }; } catch (error) { return { error: error instanceof Error ? error.message : '配置无效' }; } });
const ranges = [[1,20],[20,40],[40,50],[50,60],[60,70],[70,80],[80,90]];
function ascend(weapon = false) {
  const target = weapon ? actor.value.weapon : actor.value;
  const [min, max] = ranges[target.ascension];
  target.level = Math.max(min, Math.min(max, target.level));
  if (!weapon) for (const key of ['normal', 'skill', 'burst'] as const) actor.value.talents[key] = Math.min(actor.value.talents[key], talentCap(target.ascension));
}
function addPiece(slot: keyof typeof slots) { actor.value.artifacts.push({ slot, level: 20, set: 'none', mainStat: allowedMain(slot)[0], substats: [] }); }
function addSub(index: number) {
  const piece = actor.value.artifacts[index];
  const stat = content.artifactSubstats.find(stat => stat !== piece.mainStat && !piece.substats.some(sub => sub.stat === stat)) as EquipmentStat | undefined;
  if (stat && piece.substats.length < 4) piece.substats.push({ stat, value: 0 });
}
const fmt = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
</script>
<template>
  <div class="fields">
    <label>角色突破<select v-model.number="actor.ascension" @change="ascend()"><option v-for="n in 7" :key="n" :value="n-1">{{ n-1 }}</option></select></label>
    <label>角色等级<input v-model.number="actor.level" type="number" :min="ranges[actor.ascension][0]" :max="ranges[actor.ascension][1]"></label>
    <label>命座<input v-model.number="actor.constellation" type="number" min="0" max="6"></label>
    <label v-for="(label, key) in { normal: '普通攻击天赋', skill: '元素战技天赋', burst: '元素爆发天赋' }" :key="key">{{ label }}<input v-model.number="actor.talents[key]" type="number" min="1" :max="talentCap(actor.ascension)"></label>
    <label>初始生命（%）<input type="number" min="1" max="100" :value="actor.initialHpRatio * 100" @input="actor.initialHpRatio = Number(($event.target as HTMLInputElement).value) / 100"></label>
    <label>初始能量<input v-model.number="actor.initialEnergy" type="number" min="0" :max="capacity[actor.character]"></label>
    <label>武器<select v-model="actor.weapon.id"><option v-for="[id, weapon] in weapons" :key="id" :value="id">{{ weapon.name }}</option></select></label>
    <label>武器突破<select v-model.number="actor.weapon.ascension" @change="ascend(true)"><option v-for="n in 7" :key="n" :value="n-1">{{ n-1 }}</option></select></label>
    <label>武器等级<input v-model.number="actor.weapon.level" type="number" :min="ranges[actor.weapon.ascension][0]" :max="ranges[actor.weapon.ascension][1]"></label>
    <label>武器精炼<input v-model.number="actor.weapon.refinement" type="number" min="1" max="5"></label>
  </div>
  <h3>圣遗物</h3>
  <p>副词条的百分比直接填写百分数，例如充能 20 表示 20%。</p>
  <div class="actions"><button v-for="(label, slot) in slots" :key="slot" type="button" :disabled="actor.artifacts.some(piece => piece.slot === slot)" @click="addPiece(slot)">添加{{ label }}</button></div>
  <details v-for="(piece, index) in actor.artifacts" :key="piece.slot">
    <summary>{{ slots[piece.slot] }} · {{ sets[piece.set] }} · {{ statNames[piece.mainStat] }} +{{ piece.level }}</summary>
    <div class="fields">
      <label>套装<select v-model="piece.set"><option v-for="(label, set) in sets" :key="set" :value="set">{{ label }}</option></select></label>
      <label>强化等级<input v-model.number="piece.level" type="number" min="0" max="20"></label>
      <label>主词条<select v-model="piece.mainStat"><option v-for="stat in allowedMain(piece.slot)" :key="stat" :value="stat">{{ statNames[stat] }}</option></select></label>
    </div>
    <div v-for="(sub, subIndex) in piece.substats" :key="subIndex" class="substat">
      <label>副词条 {{ subIndex + 1 }}<select v-model="sub.stat" @change="sub.value = 0"><option v-for="stat in content.artifactSubstats" :key="stat" :value="stat" :disabled="stat === piece.mainStat || piece.substats.some((other, i) => i !== subIndex && other.stat === stat)">{{ statNames[stat] }}</option></select></label>
      <label>副词条数值<input type="number" min="0" step="0.1" :value="Number((sub.value * (percentStat(sub.stat) ? 100 : 1)).toFixed(5))" @input="sub.value = Number(($event.target as HTMLInputElement).value) / (percentStat(sub.stat) ? 100 : 1)"></label>
      <button type="button" @click="piece.substats.splice(subIndex, 1)">移除副词条 {{ subIndex + 1 }}</button>
    </div>
    <div class="actions"><button type="button" :disabled="piece.substats.length >= 4" @click="addSub(index)">添加副词条</button><button type="button" @click="actor.artifacts.splice(index, 1)">移除{{ slots[piece.slot] }}</button></div>
  </details>
  <p v-if="preview.error" role="alert">{{ preview.error }}</p>
  <aside v-if="preview.value" aria-label="配装预览">
    <strong>初始面板</strong>
    <p>生命 {{ fmt(preview.value.stats.maxHp) }} · 攻击 {{ fmt((preview.value.stats.characterBaseAttack + preview.value.stats.weaponBaseAttack) * (1 + preview.value.stats.attackPercent) + preview.value.stats.flatAttack) }} · 防御 {{ fmt(preview.value.stats.defense) }}</p>
    <p>暴击 {{ fmt(preview.value.stats.critRate * 100) }}% · 暴伤 {{ fmt(preview.value.stats.critDamage * 100) }}% · 充能 {{ fmt(preview.value.stats.energyRecharge * 100) }}%</p>
    <details><summary>属性来源</summary><ul><li v-for="(entry, index) in preview.value.contributions" :key="index">{{ entry.source }} · {{ statNames[entry.stat] ?? entry.stat }}：{{ fmt(entry.value * (percentStat(entry.stat) ? 100 : 1)) }}</li></ul></details>
  </aside>
</template>
