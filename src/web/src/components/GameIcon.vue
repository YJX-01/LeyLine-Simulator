<script lang="ts">
type Icon = { file: string; name: string; element?: string; revision?: string; rarity?: number };
type IconIndex = Record<string, Record<string, Icon>>;
let library: Promise<IconIndex> | undefined;
let detailLibrary: Promise<IconIndex> | undefined;
function loadIcons(kind: string) {
  if (['skills', 'constellations', 'buffs'].includes(kind)) return detailLibrary ??= import('../assets/game-detail-icon-index.json').then(module => module.default);
  return library ??= import('../assets/game-icon-index.json').then(module => module.default);
}
</script>
<script setup lang="ts">
import { computed, shallowRef, ref, watch } from 'vue';
const props = withDefaults(defineProps<{ kind: 'characters' | 'weapons' | 'artifacts' | 'elements' | 'skills' | 'constellations' | 'buffs' | 'stats'; id?: string; name?: string; size?: number; constellation?: number; refinement?: number; rarity?: number }>(), { size: 48 });
const icons = shallowRef<IconIndex>();
const failed = ref(false);
const entry = computed(() => {
  const group = icons.value?.[props.kind];
  if (!group) return undefined;
  if (props.id && group[props.id]) return group[props.id];
  if (props.kind === 'artifacts' && props.id) return group[`${props.id}-flower`] ?? group[`${props.id}-circlet`];
  return props.kind === 'characters' && props.name ? Object.values(group).find(icon => icon.name === props.name) : undefined;
});
const source = computed(() => entry.value ? `${import.meta.env.BASE_URL}${entry.value.file}?v=${entry.value.revision ?? '1'}` : undefined);
const elementSource = computed(() => { const icon = entry.value?.element ? icons.value?.elements[entry.value.element] : undefined; return icon ? `${import.meta.env.BASE_URL}${icon.file}?v=${icon.revision ?? '1'}` : undefined; });
const rank = computed(() => props.kind === 'characters' ? props.constellation : props.kind === 'weapons' ? props.refinement : undefined);
const rarityValue = computed(() => props.rarity ?? entry.value?.rarity);
watch(source, () => { failed.value = false; });
watch(() => props.kind, async kind => {
  try { const loaded = await loadIcons(kind); if (props.kind === kind) icons.value = loaded; } catch { /* Keep the fallback if an offline asset is missing. */ }
}, { immediate: true });
</script>
<template>
  <span class="game-icon" :class="[kind, { placeholder: !source || failed }]" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true"><img v-if="source && !failed" :src="source" :width="size" :height="size" alt="" loading="lazy" decoding="async" @error="failed = true"><span v-else>{{ kind === 'characters' ? (name?.slice(0,1) ?? '人') : kind === 'weapons' ? '⚔' : '◇' }}</span><span v-if="kind === 'stats' && source && !failed" class="stat-glyph" :style="{ maskImage: `url(${source})`, WebkitMaskImage: `url(${source})` }"></span><img v-if="kind === 'characters' && elementSource && size >= 28" class="element-badge" :src="elementSource" alt="" loading="lazy"><span v-if="rank !== undefined && rank > 0" class="rank-badge" :class="{ epic: rarityValue === 4, legendary: rarityValue === 5, rare: rarityValue === 3 }" :title="kind === 'characters' ? `${rank} 命` : `精炼 ${rank}`">{{ rank }}</span></span>
</template>
<style scoped>
.game-icon { position:relative; display:inline-flex; flex-shrink:0; align-items:center; justify-content:center; vertical-align:middle; overflow:hidden; border-radius:12px; background:radial-gradient(ellipse at 50% 100%,#f2ddac80,transparent 75%); }img { width:100%; height:100%; object-fit:contain; }.characters,.weapons { overflow:visible; border-radius:50%; background:var(--neutral-canvas); box-shadow:inset 0 0 0 1px var(--line); }.weapons > img { box-sizing:border-box; padding:0; border-radius:50%; }.characters > img:not(.element-badge) { border-radius:50%; object-fit:contain; aspect-ratio:1; }.elements,.skills,.constellations,.buffs { background:none; }.placeholder { color:var(--muted); background:var(--neutral-canvas); font-size:20px; font-weight:600; }
.stats { background:none; border-radius:0; color:var(--muted); }.stats > img { position:absolute; opacity:0; }.stat-glyph { width:100%; height:100%; background:currentColor; mask-size:contain; mask-position:center; mask-repeat:no-repeat; -webkit-mask-size:contain; -webkit-mask-position:center; -webkit-mask-repeat:no-repeat; }
.game-icon .rank-badge { position:absolute; z-index:1; right:-2px; top:-2px; display:flex; align-items:center; justify-content:center; width:30%; height:30%; min-width:16px; min-height:16px; max-width:26px; max-height:26px; box-sizing:border-box; border:2px solid var(--surface); border-radius:50%; background:var(--neutral-line); color:var(--ink); font-size:clamp(10px, .8vw, 12px); font-weight:700; line-height:1; }.game-icon .rank-badge.rare { background:var(--element-hydro-light); color:var(--element-hydro-deep); }
.game-icon .rank-badge.epic { background:var(--element-electro-light); color:var(--element-electro-deep); }.game-icon .rank-badge.legendary { background:var(--element-geo-light); color:var(--element-geo-deep); }
.game-icon .element-badge { position:absolute; right:1px; bottom:1px; width:24%; height:24%; padding:2px; border-radius:50%; background:#f8faf1e8; object-fit:contain; }
</style>
