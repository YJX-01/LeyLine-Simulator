import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { teamSchema } from '@leyline/schema';
import example from '../../../../fixtures/scenarios/first-team.json';
import { parsePlanInput, type StoragePort } from '../domain/plans';
import { canonical } from '../domain/editor';
export const draftKey = 'leyline.draft.v1';
export const useWorkspaceStore = defineStore('workspace', () => {
  const source = ref(JSON.stringify(example, null, 2)), notice = ref('');
  const input = computed(() => { try { return parsePlanInput(source.value); } catch { return undefined; } });
  const signature = computed(() => input.value ? canonical(input.value) : source.value);
  let initialized = false, storage: StoragePort | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  function initialize(port?: StoragePort) {
    if (initialized) return;
    initialized = true;
    try {
      storage = port ?? window.localStorage;
      const raw = storage.getItem(draftKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version !== 1) throw new Error();
        source.value = JSON.stringify(teamSchema.parse(saved.input), null, 2);
        notice.value = '已恢复本机上次编辑的草稿。';
      }
    } catch { storage = undefined; notice.value = '草稿无法读取，原始数据未覆盖。可继续编辑并导出方案。'; }
  }
  watch(source, () => {
    clearTimeout(timer);
    if (!storage || !input.value) return;
    const draft = input.value;
    timer = setTimeout(() => {
      try { storage!.setItem(draftKey, JSON.stringify({ version: 1, input: draft })); }
      catch { notice.value = '草稿保存失败，请导出方案备份。'; }
    }, 300);
  });
  return { source, input, signature, notice, initialize };
});
