<script setup lang="ts">
import { ref } from 'vue';
import { type TeamInput, type CharacterId, characterIdSchema } from '@leyline/schema';
import { characterNames, newActor, removeActor } from '../domain/editor';
import LoadoutEditor from './LoadoutEditor.vue';
const input = defineModel<TeamInput>({ required: true });
const selected = ref(input.value.actors[0].id);
function add() {
  const character = characterIdSchema.options.find(id => !input.value.actors.some(actor => actor.character === id));
  if (character && input.value.actors.length < 4) { const actor = newActor(character, crypto.randomUUID()); input.value.actors.push(actor); selected.value = actor.id; }
}
function replace(index: number, character: CharacterId) { input.value.actors[index] = newActor(character, input.value.actors[index].id); }
function remove(id: string) { input.value = removeActor(input.value, id); selected.value = input.value.actors[0].id; }
</script>
<template>
  <h2>配队与装备</h2>
  <p>替换角色会重置该槽位装备并保留动作引用。移除角色会同时移除其动作。</p>
  <div class="actions"><button v-for="actor in input.actors" :key="actor.id" type="button" :aria-pressed="selected === actor.id" @click="selected = actor.id">编辑{{ characterNames[actor.character] }}</button><button type="button" :disabled="input.actors.length >= 4" @click="add">添加角色</button></div>
  <template v-for="(actor, index) in input.actors" :key="actor.id">
    <fieldset v-if="selected === actor.id || !input.actors.some(a => a.id === selected)">
      <legend>{{ characterNames[actor.character] }}的配置</legend>
      <label>角色<select :value="actor.character" @change="replace(index, ($event.target as HTMLSelectElement).value as CharacterId)"><option v-for="id in characterIdSchema.options" :key="id" :value="id" :disabled="input.actors.some(a => a.id !== actor.id && a.character === id)">{{ characterNames[id] }}</option></select></label>
      <button type="button" :disabled="input.actors.length === 1" @click="remove(actor.id)">移除当前角色</button>
      <LoadoutEditor v-model="input.actors[index]" />
    </fieldset>
  </template>
</template>
