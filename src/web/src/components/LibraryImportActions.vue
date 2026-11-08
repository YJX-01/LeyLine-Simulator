<script setup lang="ts">
withDefaults(defineProps<{showcase?:boolean;createLabel?:string}>(),{createLabel:'手动添加'});
const emit=defineEmits<{mona:[];showcase:[];create:[]}>();
</script>
<template><button class="ui-action soft" data-accent="hydro" @click="emit('mona')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H6V3ZM12 9v8m-3-3 3 3 3-3"/></svg>莫娜导入</button><button v-if="showcase" class="ui-action soft" data-accent="electro" @click="emit('showcase')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a17 17 0 0 1 0 16 17 17 0 0 1 0-16Z"/></svg>展柜导入</button><button class="ui-action" data-accent="anemo" :aria-label="createLabel" @click="emit('create')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>手动添加</button></template>
