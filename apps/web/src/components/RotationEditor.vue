<script setup lang="ts">
import { ref } from 'vue';
import type { TeamInput } from '@leyline/schema';
import { characterNames } from '../domain/editor';
const input = defineModel<TeamInput>({ required: true });
const page = ref(0), size = 25;
function add(type: 'switch' | 'cast') {
  if (input.value.commands.length >= 2000) return;
  const base = { type, id: crypto.randomUUID(), timeMs: Math.min(input.value.durationMs, (input.value.commands.at(-1)?.timeMs ?? -1000) + 1000), actorId: input.value.initialOnField };
  input.value.commands.push(type === 'switch' ? { ...base, type } : { ...base, type, action: 'E' });
  page.value = Math.floor((input.value.commands.length - 1) / size);
}
function copy(index: number) { if (input.value.commands.length < 2000) input.value.commands.splice(index + 1, 0, { ...input.value.commands[index], id: crypto.randomUUID() }); }
function kind(index: number, type: 'switch' | 'cast') {
  const { id, timeMs, actorId } = input.value.commands[index];
  input.value.commands[index] = type === 'switch' ? { type, id, timeMs, actorId } : { type, id, timeMs, actorId, action: 'E' };
}
function actorChange(index: number) { const command = input.value.commands[index]; if (command.type === 'cast') { command.action = 'E'; delete command.holdMs; } }
function move(index: number, delta: number) {
  const other = index + delta; if (other < 0 || other >= input.value.commands.length) return;
  [input.value.commands[index], input.value.commands[other]] = [input.value.commands[other], input.value.commands[index]];
}
</script>
<template>
  <h2>动作循环</h2><p>时间以秒填写，精确到毫秒。同一时刻按表格顺序提交；冷却、能量和动作锁由运行结果解释。</p>
  <div class="actions"><button type="button" :disabled="input.commands.length >= 2000" @click="add('switch')">添加换人</button><button type="button" :disabled="input.commands.length >= 2000" @click="add('cast')">添加施放</button><button type="button" @click="input.commands.sort((a,b) => a.timeMs - b.timeMs); page = 0">按时间稳定排序</button></div>
  <div class="scroll"><table aria-label="动作编辑表"><thead><tr><th>序号 / 时间（秒）</th><th>类型 / 角色</th><th>动作 / 长按</th><th>操作</th></tr></thead><tbody>
    <tr v-for="(command, offset) in input.commands.slice(page * size, (page + 1) * size)" :key="command.id">
      <td><span>#{{ page * size + offset + 1 }}</span><label>动作时间<input type="number" min="0" :max="input.durationMs / 1000" step="0.001" :value="command.timeMs / 1000" @input="command.timeMs = Math.round(Number(($event.target as HTMLInputElement).value) * 1000)"></label></td>
      <td><label>指令类型<select :value="command.type" @change="kind(page * size + offset, ($event.target as HTMLSelectElement).value as 'switch' | 'cast')"><option value="switch">换人</option><option value="cast">施放</option></select></label><label>动作角色<select v-model="command.actorId" @change="actorChange(page * size + offset)"><option v-for="actor in input.actors" :key="actor.id" :value="actor.id">{{ characterNames[actor.character] }}</option></select></label></td>
      <td><template v-if="command.type === 'cast'"><label>施放动作<select v-model="command.action" @change="delete command.holdMs"><option v-for="action in ['N', 'N1', 'N2', 'N3', 'N4', 'N5', ...(input.actors.find(a => a.id === command.actorId)?.character === 'hutao' ? ['N6'] : []), 'C', 'PL', 'PH', 'E', 'Q']" :key="action" :value="action">{{ action }}</option></select></label>
      <label v-if="command.action === 'E' && input.actors.find(a => a.id === command.actorId)?.character === 'jean'">长按秒数<input type="number" min="0" max="5" step="0.001" :value="(command.holdMs ?? 0) / 1000" @input="command.holdMs = Math.round(Number(($event.target as HTMLInputElement).value) * 1000)"></label></template></td>
      <td><div class="actions"><button type="button" :disabled="input.commands.length >= 2000" @click="copy(page * size + offset)">复制动作</button><button type="button" @click="input.commands.splice(page * size + offset, 1); page = Math.min(page, Math.max(0, Math.ceil(input.commands.length / size) - 1))">删除动作</button><button type="button" :disabled="page * size + offset === 0" @click="move(page * size + offset, -1)">上移</button><button type="button" :disabled="page * size + offset === input.commands.length - 1" @click="move(page * size + offset, 1)">下移</button></div></td>
    </tr>
  </tbody></table></div>
  <div class="actions"><button type="button" :disabled="page === 0" @click="page--">上一页动作</button><span>第 {{ page + 1 }} 页 · 共 {{ input.commands.length }} 条</span><button type="button" :disabled="(page + 1) * size >= input.commands.length" @click="page++">下一页动作</button></div>
</template>
