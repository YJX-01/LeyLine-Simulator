<script setup lang="ts">
import { ref } from 'vue';
import { usePlansStore } from './stores/plans';
import { parsePlanInput } from './domain/plans';
const props = defineProps<{ source: string }>();
const emit = defineEmits<{ load: [source: string] }>();
const library = usePlansStore();
library.initialize();
const name = ref('我的队伍'), message = ref('');
function save() { if (library.save(name.value, props.source)) message.value = '方案已保存到本机。'; }
function download() {
  try {
    const input = parsePlanInput(props.source);
    const url = URL.createObjectURL(new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'leyline-team.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.value = '方案已导出。';
  } catch { message.value = '当前配置无效，无法导出。'; }
}
async function upload(event: Event) {
  const element = event.target as HTMLInputElement;
  const file = element.files?.[0];
  try {
    if (!file) return;
    if (file.size > 1_000_000) throw new Error();
    emit('load', JSON.stringify(parsePlanInput(await file.text()), null, 2));
    message.value = '已导入，请检查配置后运行。';
  } catch { message.value = '导入失败：文件过大、JSON 格式错误或配置版本不支持。'; }
  finally { element.value = ''; }
}
</script>
<template>
  <details class="plan-library">
    <summary>本地方案与导入导出</summary>
    <p>方案仅保存在当前浏览器。导入、载入会替换编辑区；请先保存需要保留的配置。</p>
    <label>新方案名称<input v-model="name" maxlength="80"></label>
    <div class="actions"><button type="button" @click="save">保存为新方案</button><button type="button" @click="download">导出方案 JSON</button></div>
    <label>导入方案 JSON<input type="file" accept="application/json,.json" @change="upload"></label>
    <p v-if="library.error" role="alert">{{ library.error }}</p>
    <p role="status">{{ message }}</p>
    <ul aria-label="本地方案列表"><li v-for="plan in library.plans" :key="plan.id">
      <input :aria-label="`${plan.name}的名称`" :value="plan.name" maxlength="80" @change="library.rename(plan.id, ($event.target as HTMLInputElement).value)">
      <button type="button" @click="emit('load', JSON.stringify(plan.input, null, 2))">载入 {{ plan.name }}</button>
      <button type="button" @click="library.save(`${plan.name.slice(0, 75)} 副本`, JSON.stringify(plan.input))">复制 {{ plan.name }}</button>
      <button type="button" @click="library.remove(plan.id)">删除 {{ plan.name }}</button>
    </li></ul>
  </details>
</template>
<style scoped>
.plan-library { margin: 20px 0; padding: 16px; background: #f3f6f7; }
.plan-library label, .plan-library .actions { margin: 12px 0; }
li { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
</style>
