<script lang="ts">
type Icon = { file: string; name: string; element?: string; revision?: string };
type IconIndex = Record<string, Record<string, Icon>>;
let library: Promise<IconIndex> | undefined;
function loadIcons() { return library ??= import('../assets/game-icon-index.json').then(module => module.default); }
</script>
<script setup lang="ts">
import { computed, onMounted, shallowRef, ref, watch } from 'vue';
const props = withDefaults(defineProps<{ kind: 'characters' | 'weapons' | 'artifacts' | 'elements'; id?: string; name?: string; size?: number }>(), { size: 48 });
const icons = shallowRef<IconIndex>();
const failed = ref(false);
const entry = computed(() => {
  const group = icons.value?.[props.kind];
  if (!group) return undefined;
  if (props.id && group[props.id]) return group[props.id];
  if (props.kind === 'artifacts' && props.id) return group[`${props.id}-flower`] ?? group[`${props.id}-circlet`];
  return props.kind === 'characters' && props.name ? Object.values(group).find(icon => icon.name === props.name) : undefined;
});
const source = computed(() => entry.value ? `${import.meta.env.BASE_URL}game-icons/${entry.value.file}?v=${entry.value.revision ?? '1'}` : undefined);
const elementSource = computed(() => { const icon = entry.value?.element ? icons.value?.elements[entry.value.element] : undefined; return icon ? `${import.meta.env.BASE_URL}game-icons/${icon.file}?v=${icon.revision ?? '1'}` : undefined; });
watch(source, () => { failed.value = false; });
onMounted(async () => { try { icons.value = await loadIcons(); } catch { /* Text remains available offline if an asset is missing. */ } });
</script>
<template>
  <span class="game-icon" :class="[kind, { placeholder: !source || failed }]" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true"><img v-if="source && !failed" :src="source" :width="size" :height="size" alt="" loading="lazy" decoding="async" @error="failed = true"><span v-else>{{ kind === 'characters' ? (name?.slice(0,1) ?? '人') : kind === 'weapons' ? '⚔' : '◇' }}</span><img v-if="kind === 'characters' && elementSource && size >= 48" class="element-badge" :src="elementSource" alt="" loading="lazy"></span>
</template>
<style scoped>
.game-icon { position:relative; display:inline-flex; flex-shrink:0; align-items:center; justify-content:center; vertical-align:middle; overflow:hidden; border-radius:12px; background:radial-gradient(ellipse at 50% 100%,#f2ddac80,transparent 75%); }img { width:100%; height:100%; object-fit:contain; }.characters { overflow:visible; border-radius:50%; background:linear-gradient(150deg,#c9d6ce,#f1ead6); }.characters > img:not(.element-badge) { border-radius:50%; object-fit:contain; aspect-ratio:1; }.elements { background:none; }.placeholder { color:var(--muted); background:#eceee6; font-size:20px; font-weight:600; }
.game-icon .element-badge { position:absolute; right:1px; bottom:1px; width:24%; height:24%; padding:2px; border-radius:50%; background:#f8faf1e8; object-fit:contain; }
</style>
