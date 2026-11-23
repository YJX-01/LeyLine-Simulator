<script setup lang="ts">
import NumberStepper from './NumberStepper.vue';
import { maximumLibraryPageRows, useLibraryPreferencesStore, type LibraryPageRows } from '../stores/library-preferences';

const preferences = useLibraryPreferencesStore();
const groups: { title: string; fields: { key: keyof LibraryPageRows; label: string }[] }[] = [
  { title: '角色', fields: [{ key: 'characters', label: '每页' }] },
  { title: '角色配置', fields: [{ key: 'configurationRelaxed', label: '疏松' }, { key: 'configurationCompact', label: '紧凑' }] },
  { title: '圣遗物', fields: [{ key: 'artifactRelaxed', label: '疏松' }, { key: 'artifactCompact', label: '紧凑' }] },
  { title: '圣遗物组合', fields: [{ key: 'combinations', label: '每页' }] },
  { title: '队伍', fields: [{ key: 'teams', label: '每页' }] },
];
</script>

<template>
  <section class="library-page-settings" aria-labelledby="library-page-settings-title">
    <header>
      <h2 id="library-page-settings-title">库列表每页行数</h2>
      <button type="button" class="ui-action soft" data-size="md" @click="preferences.resetRows()">恢复默认行数</button>
    </header>
    <div class="library-page-settings-rows">
      <div v-for="group in groups" :key="group.title" class="library-page-settings-row">
        <h3>{{ group.title }}</h3>
        <div class="library-page-settings-fields">
          <div v-for="field in group.fields" :key="field.key" class="library-page-settings-field">
            <label :for="`library-rows-${field.key}`">{{ field.label }}</label>
            <NumberStepper :input-id="`library-rows-${field.key}`" :model-value="preferences.rows[field.key]"
              :maximum="maximumLibraryPageRows" :label="`${group.title}${field.label === '每页' ? '' : field.label}每页行数`"
              @update:model-value="preferences.rows[field.key] = $event" />
            <span>行</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.library-page-settings { display:grid; gap:16px; }
.library-page-settings header { display:flex; align-items:center; flex-wrap:wrap; justify-content:space-between; gap:12px; }
.library-page-settings h2,.library-page-settings h3 { margin:0; font-size:var(--font-control); }
.library-page-settings-rows { display:grid; gap:12px; }
.library-page-settings-row { display:grid; grid-template-columns:minmax(100px,160px) minmax(0,1fr); align-items:center; gap:12px; }
.library-page-settings-fields { display:flex; flex-wrap:wrap; gap:12px 24px; }
.library-page-settings-field { display:flex; align-items:center; gap:8px; font-size:var(--font-control); }
.library-page-settings-field :deep(.number-stepper) { width:120px; }
@media(max-width:500px) { .library-page-settings-row { grid-template-columns:minmax(0,1fr); gap:8px; } }
</style>
