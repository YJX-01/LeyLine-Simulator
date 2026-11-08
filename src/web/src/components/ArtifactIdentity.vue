<script setup lang="ts">
import type { AccountArtifact } from '../domain/account';
defineProps<{ item:AccountArtifact }>();
</script>
<template>
  <details class="artifact-identity"><summary>来源与实物身份</summary><p>{{ item.id }}</p><p>{{ item.real?.source?.key }}</p><p v-if="item.mona">原文件主词条：{{ item.mona.mainValue }}；当前值按强化等级表显示。</p><p v-if="item.mona?.equippedBy">原始穿戴备注：{{ item.mona.equippedBy }}</p></details>
</template>
<style scoped>
.artifact-identity { margin-top:16px; font-size:var(--font-body); overflow-wrap:anywhere; }.artifact-identity p { font-size:var(--font-body); line-height:1.6; }
</style>
