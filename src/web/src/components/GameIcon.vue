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
const props = withDefaults(defineProps<{ kind: 'characters' | 'weapons' | 'artifacts' | 'artifactSlots' | 'elements' | 'skills' | 'constellations' | 'buffs' | 'stats'; id?: string; name?: string; size?: number; constellation?: number; refinement?: number; rarity?: number; level?: number; monochrome?: boolean }>(), { size: 48 });
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
  <span class="game-icon" :class="[kind, { placeholder: !source || failed, monochrome }]" :data-rarity="rarityValue" :style="{ width: `${size}px`, height: `${size}px`, '--portrait-background': `var(--rarity-${rarityValue}-background, var(--neutral-canvas))` }" aria-hidden="true"><img v-if="source && !failed" :src="source" :width="size" :height="size" alt="" loading="lazy" decoding="async" @error="failed = true"><span v-else>{{ kind === 'characters' ? (name?.slice(0,1) ?? '人') : kind === 'weapons' ? '⚔' : '◇' }}</span><span v-if="(kind === 'stats' || kind === 'artifactSlots' || kind === 'skills' || monochrome) && source && !failed" class="stat-glyph" :style="{ maskImage: `url(${source})`, WebkitMaskImage: `url(${source})` }"></span><img v-if="kind === 'characters' && elementSource && size >= 28" class="element-badge" :src="elementSource" alt="" loading="lazy"><span v-if="rank !== undefined && rank > 0" class="rank-badge" :data-rank="rank" :style="{ background: `var(--rank-${rank}-background)`, color: `var(--rank-${rank}-ink)`, borderColor: `var(--rank-${rank}-border)`, fontSize: `${Math.max(8, Math.min(12, size * .16))}px` }" :title="kind === 'characters' ? `${rank} 命` : `精炼 ${rank}`">{{ rank }}</span><span v-if="level !== undefined && level > 0 && (kind === 'characters' || kind === 'weapons')" class="level-badge" :style="{ fontSize: `${Math.max(8, Math.min(11, size * .14))}px` }" :title="`${level}级`">{{ level }}</span></span>
</template>
<style scoped>
.game-icon { position:relative; display:inline-flex; flex-shrink:0; align-items:center; justify-content:center; vertical-align:middle; overflow:hidden; border-radius:8px; background:radial-gradient(ellipse at 50% 100%,#f2ddac80,transparent 75%); }img { width:100%; height:100%; object-fit:contain; }.characters,.weapons { overflow:visible; border-radius:7px; background:var(--portrait-background,var(--neutral-canvas));  }.characters > img:not(.element-badge),.weapons > img { border-radius:inherit; object-fit:contain; aspect-ratio:1; }.artifactSlots,.elements,.skills,.constellations,.buffs { background:none; }.placeholder { color:var(--muted); font-size:20px; font-weight:600; }
.monochrome > img { position:absolute; opacity:0; }.skills > img { position:absolute; opacity:0; }.skills { color:var(--muted); }.stats { background:none; border-radius:0; color:var(--muted); }.artifactSlots > img,.stats > img { position:absolute; opacity:0; }.stat-glyph { width:100%; height:100%; background:currentColor; mask-size:contain; mask-position:center; mask-repeat:no-repeat; -webkit-mask-size:contain; -webkit-mask-position:center; -webkit-mask-repeat:no-repeat; }
.game-icon .rank-badge,.game-icon .level-badge { position:absolute; z-index:2; right:0; display:flex; align-items:center; justify-content:center; width:22%; height:22%; min-width:12px; min-height:12px; max-width:22px; max-height:22px; box-sizing:border-box; border:0; border-radius:3px; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; }
.game-icon .rank-badge { top:0; }
.game-icon .element-badge { position:absolute; z-index:1; left:0; top:0; width:24%; height:24%; min-width:10px; min-height:10px; max-width:24px; max-height:24px; padding:1px; border:0; background:transparent; object-fit:contain; box-sizing:border-box; }
.game-icon .level-badge { bottom:0; background:var(--neutral-raised); color:var(--ink); }
</style>
