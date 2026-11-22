<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {CombatChange, Project} from '@leyline/schema';
import {observedReactionNames, realElementLabel, recordLabel} from '../domain/workbench-labels';

const props = defineProps<{project:Project; actor:string; timeMs:number; before?:string; changes?:CombatChange[]}>();
type CrystalElement = NonNullable<Project['timeline'][number]['crystalElement']>;
const crystalElements: CrystalElement[] = ['pyro','hydro','electro','cryo'];
const crystal = ref<CrystalElement | ''>('');
const emit = defineEmits<{reaction:[actor:string, reaction:keyof typeof observedReactionNames, crystalElement?:CrystalElement]; pickup:[actor:string, source:string, effect?:string]}>();
const owner = ref(props.actor), reaction = ref<keyof typeof observedReactionNames>('quicken'), selected = ref('');
watch(()=>props.actor, id=>{owner.value=id;});
const drops = computed(()=>{
  const query = props.project.timeline.find(r=>r.id===props.before);
  const rows = (props.changes ?? []).filter(row=>(row.kind==='clear-particles' || row.kind==='elemental-particles') && row.status!=='excluded' && row.timeMs<=props.timeMs);
  return rows.flatMap(row=>{
    const source = props.project.timeline.find(r=>r.id===row.source);
    if (!source || query && source.timeMs===props.timeMs && source.order>=query.order) return [];
    const effect = row.kind==='clear-particles' ? undefined : row.effect;
    if (props.project.timeline.some(r=>r.particleSource===row.source && r.particleEffect===effect)) return [];
    return [{key:JSON.stringify([row.source,effect]),source:row.source,effect, label:recordLabel(props.project,row.source)+' · '+(row.particleElement ? realElementLabel(row.particleElement) : '无元素')+'微粒 · '+row.timeMs+' ms'}];
  });
});
function pickup() {
  const drop=drops.value.find(row=>row.key===selected.value);
  if (drop) emit('pickup',owner.value,drop.source,drop.effect);
  selected.value='';
}
</script>
<template>
  <details><summary>反应记录与微粒拾取</summary><div class="reaction-record">
    <label>记录队员<select v-model="owner"><option v-for="m in project.candidate.actors.filter(member=>member.build)" :key="m.id" :value="m.id">{{m.name ?? m.id}}</option></select></label>
    <label>反应<select v-model="reaction"><option v-for="(label,id) in observedReactionNames" :key="id" :value="id">{{label}}</option></select></label>
    <label v-if="reaction==='crystallize'">结晶元素<select v-model="crystal"><option value="">未知</option><option v-for="element in crystalElements" :key="element" :value="element">{{realElementLabel(element)}}</option></select></label>
    <button class="ui-action" type="button" @click="emit('reaction',owner,reaction,reaction==='crystallize' && crystal || undefined)">记录触发</button>
    <template v-if="drops.length"><label>微粒来源<select v-model="selected"><option value="">选择来源</option><option v-for="row in drops" :key="row.key" :value="row.key">{{row.label}}</option></select></label>
      <button type="button" class="ui-action" :disabled="!selected" @click="pickup">拾取微粒</button></template>
  </div></details>
</template>
<style scoped>
summary {cursor:pointer;line-height:var(--control-height-md);}
.reaction-record {display:flex;align-items:end;flex-wrap:wrap;gap:8px;}
label {display:grid;gap:4px;}
</style>
