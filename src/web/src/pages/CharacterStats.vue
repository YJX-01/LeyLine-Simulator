<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CharacterStatPanel from '../components/CharacterStatPanel.vue';
import { resolveEquipmentPanel } from '@leyline/engine';
import type { Build, StatKey } from '@leyline/schema';
import type { AccountCharacter, LocalAccount } from '../domain/account';
import { calculationArtifact, resolveBuildEquipment } from '../domain/build-snapshot';
const props = defineProps<{ character: AccountCharacter; build?: Build; showcase: boolean; account: LocalAccount }>();
const stats = ref<Partial<Record<StatKey, number | null>>>({});
const message = ref('');
const element = computed(() => props.build?.character.identity.element ?? 'physical');
const equipped = computed(() => props.showcase ? [] : Object.values(props.character.equipment).map(id => props.account.artifacts.find(item => item.id === id)));
watch([() => props.build, () => props.showcase, () => props.character.build, equipped], async ([build, showcase, savedBuild, items], _, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  message.value = '';
  if (!build) { stats.value = {}; return; }
  try {
    if (!showcase && items.some(item => !item?.real || item.mona?.setIdentityPending)) throw new Error('装备词条或套装身份待补全，暂不展示计算面板。');
    const equipment = showcase ? build : await resolveBuildEquipment(items.map(item =>
      calculationArtifact(item!.real!, item!.inventoryId === null ? undefined : props.account.id)), savedBuild ?? build);
    if (!current) return;
    const result = resolveEquipmentPanel({ ...build, ...equipment });
    stats.value = result.stats;
    message.value = result.status === 'invalid' ? result.issues.filter(issue => issue.code === 'invalid-input').map(issue => issue.message).join('；') : '';
  } catch (cause) { if (current) { stats.value = {}; message.value = cause instanceof Error ? cause.message : '面板加载失败。'; } }
}, { immediate: true });
</script>
<template>
  <CharacterStatPanel v-if="build" :title="showcase ? '展柜快照面板' : '当前装备面板'" :element="element" :stats="stats" :message="message" />
</template>
