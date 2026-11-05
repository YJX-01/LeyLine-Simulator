import { defineStore } from 'pinia';
import { ref } from 'vue';
import { parsePlanInput, readPlans, writePlans, type Plan, type StoragePort } from '../domain/plans';

export const usePlansStore = defineStore('plans', () => {
  const plans = ref<Plan[]>([]);
  const error = ref('');
  const ready = ref(false);
  let storage: StoragePort | undefined;
  function initialize(port?: StoragePort) {
    if (ready.value) return;
    try {
      storage = port ?? window.localStorage;
      plans.value = readPlans(storage);
      ready.value = true;
    } catch { storage = undefined; error.value = '无法读取本地方案，原始数据未覆盖。仍可使用 JSON 导入导出。'; }
  }
  function change(next: Plan[]) {
    try {
      if (!storage) throw new Error('本地存储不可用。');
      writePlans(storage, next);
      plans.value = next;
      error.value = '';
      return true;
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '方案保存失败。'; return false; }
  }
  function save(name: string, source: string) {
    try {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 80) throw new Error('方案名称须为 1—80 个字符。');
      const input = parsePlanInput(source);
      return change([...plans.value, { id: crypto.randomUUID(), name: trimmed, input }]);
    } catch (cause) { error.value = cause instanceof Error ? cause.message : '方案配置无效。'; return false; }
  }
  function remove(id: string) { return change(plans.value.filter(plan => plan.id !== id)); }
  function rename(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) { error.value = '方案名称须为 1—80 个字符。'; return false; }
    return change(plans.value.map(plan => plan.id === id ? { ...plan, name: trimmed } : plan));
  }
  return { plans, error, ready, initialize, save, remove, rename };
});
