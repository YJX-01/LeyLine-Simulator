<script setup lang="ts">
import { computed,ref } from 'vue';
import { compareReleaseNewest,releaseMetadata } from '../domain/catalog-release';
import GameIcon from './GameIcon.vue';
import LibraryToolbar from './LibraryToolbar.vue';
import SortPanel from './SortPanel.vue';
import ChoiceGroup from './ChoiceGroup.vue';
import FilterActions from './FilterActions.vue';
import WorkbenchDialog from './WorkbenchDialog.vue';
const props=defineProps<{options:{id:string;name:string;element?:string}[];kind:'characters'|'weapons'|'artifacts';label:string;selectedId?:string}>();
const emit=defineEmits<{select:[id:string]}>();
const query=ref(''),sort=ref('release'),direction=ref<'asc'|'desc'>('desc'),element=ref('all'),sortOpen=ref(false),filterOpen=ref(false);
const elements=[{value:'all',label:'全部'},...Object.entries({anemo:'风',geo:'岩',electro:'雷',dendro:'草',hydro:'水',pyro:'火',cryo:'冰'}).map(([value,label])=>({value,label}))];
const entries=computed(()=>props.options.filter(entry=>entry.name.includes(query.value.trim()) && (element.value==='all' || entry.element===element.value)).sort((a,b)=>(direction.value==='desc'?1:-1)*(sort.value==='release'?compareReleaseNewest(releaseMetadata(props.kind,a.id,a.name),releaseMetadata(props.kind,b.id,b.name)):b.name.localeCompare(a.name,'zh-CN')) || a.name.localeCompare(b.name,'zh-CN')));
</script>
<template><section class="catalog-browser"><LibraryToolbar v-model="query" :label="`搜索${label}`" placeholder="查找名称…" :filter-count="element==='all'?0:1" :sorted="sort!=='release' || direction!=='desc'" @sort="sortOpen=true" @filter="filterOpen=true" /><div class="catalog-browser-options"><button v-for="entry in entries" :key="entry.id" class="catalog-browser-item" :class="{selected:entry.id===selectedId}" :aria-label="`选择${entry.name}`" @click="emit('select',entry.id)"><GameIcon :kind="kind" :id="entry.id" :name="entry.name" :size="64" /><strong>{{ entry.name }}</strong></button></div><p v-if="!entries.length">没有符合条件的内容。</p><WorkbenchDialog v-if="sortOpen" title="目录排序" size="filter" @close="sortOpen=false"><SortPanel v-model="sort" v-model:direction="direction" :options="[{value:'release',label:'实装版本'},{value:'name',label:'名称'}]" @reset="sort='release';direction='desc'" @confirm="sortOpen=false" /></WorkbenchDialog><WorkbenchDialog v-if="filterOpen" title="筛选目录" size="filter" @close="filterOpen=false"><ChoiceGroup v-if="kind==='characters'" v-model="element" :options="elements" label="元素" /><p v-else>通过名称搜索选择。</p><template #footer><FilterActions flush @reset="element='all'" @confirm="filterOpen=false" /></template></WorkbenchDialog></section></template>
<style scoped>.catalog-browser { display:grid; gap:16px; min-width:0; }.catalog-browser-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(116px,1fr)); gap:12px; }.catalog-browser-item { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; padding:12px; border:1px solid var(--line); border-top:3px solid var(--line); border-radius:10px; background:var(--surface); color:var(--ink); font-size:var(--font-control); }.catalog-browser-item:hover,.catalog-browser-item.selected { border-top-color:var(--element-anemo-primary); }.catalog-browser-item.selected { background:var(--element-anemo-light); }.catalog-browser p { font-size:var(--font-control); }</style>
