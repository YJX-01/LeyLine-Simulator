<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import CornerBadge from './CornerBadge.vue';
const props=defineProps<{accountId:string;characterId:string;name:string}>();
const store=useCharacterLoadoutsStore(),error=ref('');
const level=computed(()=>store.favoriteLevel(props.accountId,props.characterId));
function cycle() { try{store.setFavorite(props.accountId,props.characterId,(level.value+1)%4);error.value='';}catch{error.value='收藏未能保存。';} }
</script>
<template><div class="character-favorite"><button type="button" :class="{active:level>0}" :aria-label="`设置${name}收藏`" :title="`${level?`${level}级收藏`:'未收藏'}；点击依次切换 1、2、3 级和未收藏`" @click="cycle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></svg><CornerBadge v-if="level" small>{{ level }}</CornerBadge></button><span v-if="error" role="alert">{{ error }}</span></div></template>
<style scoped>
.character-favorite { display:flex; align-items:center; }.character-favorite button { position:relative; display:flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:4px; border:0; background:transparent; color:var(--muted); }.character-favorite svg { width:24px; height:24px; fill:none; stroke:currentColor; stroke-width:1.5; }.character-favorite .active { color:var(--element-geo-deep); }.active svg { fill:var(--element-geo-light); }.corner-badge { position:absolute; right:-2px; bottom:-2px; color:var(--element-geo-deep); background:var(--element-geo-light); }.character-favorite > span { font-size:var(--font-body); }
</style>
