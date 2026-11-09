<script setup lang="ts">
import {computed,ref} from 'vue';
import {useArtifactFavoritesStore} from '../stores/artifact-favorites';
import FavoriteControl from './FavoriteControl.vue';
const props=defineProps<{accountId:string;itemId:string}>(),store=useArtifactFavoritesStore(),error=ref('');
const level=computed(()=>store.level(props.accountId,props.itemId));
function change(value:number){try{store.set(props.accountId,props.itemId,value);error.value='';}catch{error.value='收藏未保存，请检查本地存储。';}}
</script>
<template><span class="artifact-favorite"><FavoriteControl :level="level" label="设置圣遗物收藏" @change="change" /><span v-if="error" role="alert">{{ error }}</span></span></template>
<style scoped>.artifact-favorite { display:flex; align-items:center; gap:8px; }</style>
