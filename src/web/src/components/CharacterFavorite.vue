<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCharacterLoadoutsStore } from '../stores/character-loadouts';
import FavoriteControl from './FavoriteControl.vue';
const props=defineProps<{accountId:string;characterId:string;name:string}>();
const store=useCharacterLoadoutsStore(),error=ref('');
const level=computed(()=>store.favoriteLevel(props.accountId,props.characterId));
function cycle(value:number) { try{store.setFavorite(props.accountId,props.characterId,value);error.value='';}catch{error.value='收藏未能保存。';} }
</script>
<template><div class="character-favorite"><FavoriteControl :level="level" :label="`设置${name}收藏`" @change="cycle" /><span v-if="error" role="alert">{{ error }}</span></div></template>
<style scoped>.character-favorite { display:flex; align-items:center; }.character-favorite > span { font-size:var(--font-body); }</style>
