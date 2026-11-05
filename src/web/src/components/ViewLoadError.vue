<template><main><h1>页面未能加载</h1><p role="alert">页面资源加载失败，可能是网络中断或版本已更新。请恢复网络后重新加载页面。</p><button type="button" @click="reload">重新加载页面</button></main></template>
<script setup lang="ts">function reload() { window.location.reload(); }</script>
