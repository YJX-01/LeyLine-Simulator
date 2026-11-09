<script setup lang="ts">
withDefaults(defineProps<{label?:string;disabled?:boolean;size?:'lg'|'md'}>(),{label:'取消',size:'lg'});
const emit=defineEmits<{click:[event:MouseEvent]}>();
</script>
<template><button type="button" class="ui-action soft" data-accent="pyro" :data-size="size==='md'?'md':undefined" :disabled="disabled" @click="emit('click',$event)">{{ label }}</button></template>
