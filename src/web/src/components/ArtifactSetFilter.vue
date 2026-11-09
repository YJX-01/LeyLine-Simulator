<script setup lang="ts">
import { computed } from 'vue';
import { compareReleaseNewest, releaseMetadata } from '../domain/catalog-release';
import MultiSelectPicker from './MultiSelectPicker.vue';
const props=defineProps<{modelValue:string[];label:string;options:{id:string;name:string;rarity?:number}[]}>();
const emit=defineEmits<{'update:modelValue':[value:string[]]}>();
const ordered=computed(()=>[...props.options].sort((a,b)=>(b.rarity ?? 0)-(a.rarity ?? 0) || compareReleaseNewest(releaseMetadata('artifacts',a.id),releaseMetadata('artifacts',b.id)) || a.name.localeCompare(b.name,'zh-CN')));
</script>
<template><MultiSelectPicker class="artifact-set-filter" :model-value="modelValue" :label="label" :options="ordered" image-kind="artifacts" searchable @update:model-value="emit('update:modelValue',$event)" /></template>
