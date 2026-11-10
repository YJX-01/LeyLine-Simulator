<script setup lang="ts">
import {computed} from 'vue';
import type {StatKey} from '@leyline/schema';
import {accountStatLabels} from '../domain/account-real';
import StatLabel from './StatLabel.vue';
import SingleSelectPicker from './SingleSelectPicker.vue';
const props=defineProps<{modelValue?:StatKey;options:StatKey[];label:string;allowEmpty?:boolean}>(),emit=defineEmits<{'update:modelValue':[value:StatKey];clear:[]}>();
const choices=computed(()=>props.options.map(stat=>({id:stat,name:accountStatLabels[stat].replace('%',''),title:accountStatLabels[stat].replace('%','（比例）')+(['hp','attack','defense'].includes(stat)?'（固定）':'')})));
</script>
<template><SingleSelectPicker class="stat-picker" :model-value="modelValue" :options="choices" :label="label" :allow-empty="allowEmpty" @update:model-value="emit('update:modelValue',$event as StatKey)" @clear="emit('clear')"><template #selected-icon="{option}"><StatLabel v-if="option" :stat="option.id as StatKey" icon-only :size="20" /></template><template #option-icon="{option}"><StatLabel :stat="option.id as StatKey" icon-only :size="20" /></template></SingleSelectPicker></template>
