<script setup lang="ts">
import { ref } from 'vue';
import { elementPalette, neutralPalette, contrastRatio } from '../styles/palette';
const selected = ref<(typeof elementPalette)[number]>(elementPalette[0]);
</script>
<template>
  <section class="palette" aria-label="七元素配色验证">
    <p>配色草案 v1 · 体验验证中。原色用于图标与强调，浅色用于底面，深色用于文字与操作。以下为同一套设计变量，可选择一行预览。</p>
    <div class="palette-table"><div class="palette-labels"><span>元素</span><span>原色</span><span>浅色</span><span>深色</span><span>深字／浅底</span></div><button v-for="element in elementPalette" :key="element.id" class="palette-row" :class="{ selected:selected.id === element.id }" @click="selected = element"><strong>{{ element.name }}</strong><span v-for="shade in (['primary','light','deep'] as const)" :key="shade"><i :style="{ background:element[shade] }"></i><code>{{ element[shade] }}</code></span><b>{{ contrastRatio(element.deep,element.light).toFixed(2) }} : 1</b></button></div>
    <div class="palette-demo" :style="{ background:selected.light,color:selected.deep,borderColor:selected.primary }"><strong>{{ selected.name }}元素 · 界面示例</strong><p>浅色承载内容，深色保证可读。{{ contrastRatio(selected.deep,'#FFFFFF').toFixed(2) }} : 1（白字／深底）</p><button :style="{ background:selected.deep,color:'#FFFFFF',borderColor:selected.deep }">主要操作</button><button :style="{ background:'transparent',color:selected.deep,borderColor:selected.deep }">次要操作</button></div>
    <div class="neutral-swatches"><span v-for="(color,key) in neutralPalette" :key="key"><i :style="{ background:color }"></i><code>{{ color }}</code></span></div>
    <p>色彩同时配合文字、图标和选中边框表达状态；不会仅凭颜色区分操作。深字／浅底、白字／深底均以 4.5 : 1 为验收线。</p>
  </section>
</template>
<style scoped>
.palette { background:transparent; padding:16px 0 0; }p { font-size:var(--font-body); color:var(--muted); line-height:1.7; }.palette-table { overflow-x:auto; }.palette-labels,.palette-row { display:grid; grid-template-columns:44px repeat(3,minmax(110px,1fr)) 100px; align-items:center; gap:10px; min-width:540px; }.palette-labels { padding:10px; font-size:var(--font-body); color:var(--muted); }.palette-row { width:100%; color:var(--ink); background:var(--surface); border:1px solid var(--line); margin-bottom:6px; padding:10px; text-align:left; }.palette-row.selected { outline:2px solid var(--action); outline-offset:-2px; }.palette-row > span,.neutral-swatches > span { display:flex; align-items:center; gap:8px; }i { display:block; width:24px; height:24px; border-radius:6px; border:1px solid var(--line); flex-shrink:0; }code,b { font-size:var(--font-body); }.palette-demo { border:1px solid; border-radius:10px; margin:16px 0; padding:18px; }.palette-demo p { color:inherit; }.palette-demo button { height:var(--control-height-lg); min-height:var(--control-height-lg); padding:0 12px; margin-right:10px; font-size:var(--font-body); }.neutral-swatches { display:flex; gap:16px; flex-wrap:wrap; }
</style>
