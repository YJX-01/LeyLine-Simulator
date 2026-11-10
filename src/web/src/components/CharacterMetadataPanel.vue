<script setup lang="ts">
import type { CharacterDefinition } from '@leyline/schema';
import { formatTalentDetail, talentBonus } from '../domain/character-info';
const props=defineProps<{character:CharacterDefinition;talents?:{normal:number;skill:number;burst:number};constellation?:number}>();
const bonusKnown=()=>!props.constellation || props.character.constellations.length===6;
const level=(category:'normal'|'skill'|'burst')=>Math.min(15,(props.talents?.[category]??1)+talentBonus(props.character,category,props.constellation??0));
</script>
<template>
  <details class="character-metadata-panel">
    <summary>角色介绍与技能说明</summary>
    <p v-if="!bonusKnown()">当前快照未收录命座天赋加级，以下显示基础等级。</p>
    <p v-if="character.identity.title" class="character-title">{{ character.identity.title }}</p>
    <p>{{ character.identity.description || '此快照未收录角色介绍。' }}</p>
    <p v-for="note in character.capabilities.notes" :key="note">{{ note }}</p>
    <section v-for="talent in character.talents" :key="talent.id">
      <h3>{{ talent.name }} · {{ level(talent.category) }}级</h3><p>{{ talent.description || '此快照未收录技能说明。' }}</p>
      <p v-if="talent.flavorText">{{ talent.flavorText }}</p>
      <dl v-if="talent.details.length"><template v-for="(detail,index) in talent.details" :key="index"><dt>{{ detail.label }}</dt><dd>{{ formatTalentDetail(talent,detail.template,level(talent.category)) }}</dd></template></dl>
      <p v-if="!talent.support.supported" class="metadata-support">{{ talent.support.reason }}</p>
    </section>
    <section v-for="passive in character.passives" :key="passive.id"><h3>{{ passive.name }}</h3><p>{{ passive.description }}</p></section>
    <section v-for="item in character.constellations" :key="item.rank"><h3>{{ item.rank }}命 · {{ item.name }}</h3><p>{{ item.description }}</p></section>
  </details>
</template>
<style scoped>
.character-metadata-panel { margin-top:16px; font-size:var(--font-body); color:var(--ink); }
summary { cursor:pointer; font-weight:700; } section { margin-top:16px; } h3 { font-size:var(--font-control); margin-bottom:8px; }
p { white-space:pre-wrap; line-height:1.8; } .metadata-support { color:var(--muted); }
dl { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 16px; } dd { margin:0;white-space:pre-wrap;overflow-wrap:anywhere; } .character-title { font-weight:700; }
</style>
