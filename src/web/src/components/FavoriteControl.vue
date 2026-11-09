<script setup lang="ts">
import FavoriteMark from './FavoriteMark.vue';
defineProps<{level:number;label:string}>();const emit=defineEmits<{change:[value:number]}>();
</script>
<template><button type="button" class="favorite-control" :class="{active:level>0}" :aria-label="label" :aria-description="level?`${level}级收藏`:'未收藏'" :title="`${level?level+'级收藏':'未收藏'}；点击切换收藏等级`" @click="emit('change',(level+1)%4)"><FavoriteMark :level="level" /></button></template>
<style scoped>.favorite-control { display:flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:2px; border:0; background:transparent; }</style>
