<script setup lang="ts">
import { onMounted, ref } from 'vue';
import CloseButton from './components/CloseButton.vue';
type Dependency = { id:string; license:string; productionDependencyClosure:boolean; desktopRuntime:boolean; direct:Array<{ importer:string; group:string }>; modified:string[]; noticeStatus:string };
type Source = { id:string; name:string; url:string | null; license:string; usage:string };
const packages = ref<Dependency[]>([]);
const sources = ref<Source[]>([]);
const directCount = ref(0);
const showAll = ref(false);
const bundled = ref<Array<{name:string;version:string;license:string}>>([]);
function usage(pkg: Dependency) {
  if (pkg.desktopRuntime) return '桌面运行时';
  if (pkg.direct.length && pkg.direct.every(item => item.group === 'devDependencies')) return '构建与测试';
  return pkg.productionDependencyClosure ? '生产依赖闭包' : '构建与测试';
}
const error = ref('');
const documentText = ref('');
const documentTitle = ref('');
const loading = ref(false);
const base = `${import.meta.env.BASE_URL}licenses/`;
async function load(path: string) {
  const response = await fetch(base + path);
  if (!response.ok) throw new Error('许可资料加载失败，请重试。');
  return response;
}
async function showDocument(path: string, title: string) {
  loading.value = true; error.value = '';
  try { documentText.value = await (await load(path)).text(); documentTitle.value = title; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '许可资料加载失败。'; }
  finally { loading.value = false; }
}
onMounted(async () => {
  try {
    const [dependencies, credits] = await Promise.all([load('dependencies.json').then(response => response.json()), load('sources.json').then(response => response.json())]);
    if (import.meta.env.PROD) bundled.value = (await (await load('bundled-packages.json')).json()).packages;
    packages.value = dependencies.packages; directCount.value = dependencies.summary.directPackages; sources.value = credits.sources;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '许可资料加载失败。'; }
});
</script>
<template>
  <section class="third-party-credits">
    <p v-if="packages.length">{{ directCount }} 个直接依赖 · {{ packages.length }} 个包版本 · {{ sources.length }} 项代码、素材与资料来源</p><p v-else>正在加载许可资料…</p>
    <div class="credit-actions"><button class="secondary" :disabled="loading" @click="showDocument('THIRD_PARTY_NOTICES.md', '使用与协议说明')">使用与协议说明</button><button class="secondary" :disabled="loading" @click="showDocument('CREDITS.md', '鸣谢')">鸣谢</button><button class="secondary" :disabled="loading" @click="showDocument('npm-LICENSES.txt', '依赖许可原文')">依赖许可原文</button><button class="secondary" :disabled="loading" @click="showDocument('tooling/Pillow/LICENSE', '素材处理工具许可')">素材处理工具许可</button></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="documentTitle" class="license-reader"><div class="license-reader-heading"><h3>{{ documentTitle }}</h3><CloseButton label="关闭原文" @click="documentTitle = ''; documentText = ''" /></div><pre tabindex="0">{{ documentText }}</pre></section>
    <details v-if="bundled.length"><summary>本次网页代码 · {{ bundled.length }} 个第三方包</summary><p v-for="pkg in bundled" :key="pkg.name">{{ pkg.name }}@{{ pkg.version }} · {{ pkg.license }}</p></details>
    <h3>软件依赖</h3><button class="secondary" @click="showAll = !showAll">{{ showAll ? '只看直接依赖' : '查看全部间接依赖' }}</button>
    <div class="credit-table"><table><thead><tr><th>包与版本</th><th>协议</th><th>用途</th></tr></thead><tbody><tr v-for="pkg in packages.filter(item => showAll || item.direct.length)" :key="pkg.id"><td>{{ pkg.id }}<small v-if="pkg.modified.length">本地存储兼容补丁</small><small v-if="pkg.noticeStatus === 'declaration-only'">安装包仅附协议声明</small></td><td>{{ pkg.license }}</td><td>{{ usage(pkg) }}</td></tr></tbody></table></div>
    <h3>代码、素材与资料</h3><article v-for="source in sources" :key="source.id"><h4>{{ source.name }}</h4><p>{{ source.usage }}</p><small>{{ source.license }}</small><code v-if="source.url">{{ source.url }}</code><button class="secondary" v-if="['genshin-optimizer', 'genshin-db', 'mona', 'miao-plugin'].includes(source.id)" @click="showDocument(`sources/${source.id}/LICENSE`, source.name + ' · 许可原文')">查看许可原文</button></article>
    <p class="native-notices">桌面组件声明位于应用目录的 LICENSE 和 LICENSES.chromium.html。</p>
  </section>
</template>
<style scoped>
.third-party-credits { display:grid; gap:16px; }.third-party-credits > button { justify-self:start; }.credit-actions { display:flex; gap:8px; flex-wrap:wrap; }.credit-table { overflow:auto; max-height:40vh; }table { width:100%; border-collapse:collapse; text-align:left; }th,td { padding:8px; border-bottom:1px solid var(--line); }th { position:sticky; top:0; background:var(--surface); }small,code { display:block; color:var(--muted); }code { overflow-wrap:anywhere; font-size:11px; }article { display:grid; gap:6px; padding-block:10px; border-top:1px solid var(--line); }article button { justify-self:start; }.license-reader { border:1px solid var(--line); border-radius:8px; padding:12px; }.license-reader-heading { display:flex; justify-content:space-between; gap:12px; align-items:center; }pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:48vh; overflow:auto; font-size:12px; padding-block:12px; }.native-notices { color:var(--muted); font-size:12px; }
</style>
