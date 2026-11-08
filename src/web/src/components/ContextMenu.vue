<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref,nextTick} from 'vue';
const props=defineProps<{x:number;y:number;label:string;options:{id:string;label:string;danger?:boolean}[]}>();
const emit=defineEmits<{close:[];select:[id:string]}>();
const menu=ref<HTMLElement>(),left=ref(props.x),top=ref(props.y);
let previous:HTMLElement|null=null;
function outside(event:PointerEvent){if(!menu.value?.contains(event.target as Node))emit('close');}
function close(){emit('close');}
function key(event:KeyboardEvent){
  const items=Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []),index=items.indexOf(document.activeElement as HTMLButtonElement);
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();emit('close');}
  else if(event.key==='Tab')emit('close');
  else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[target]?.focus();
  }
}
onMounted(async()=>{
  previous=document.activeElement as HTMLElement;await nextTick();const bounds=menu.value?.getBoundingClientRect();
  left.value=Math.max(8,Math.min(props.x,innerWidth-(bounds?.width ?? 180)-8));top.value=Math.max(8,Math.min(props.y,innerHeight-(bounds?.height ?? 100)-8));menu.value?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
  window.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);window.addEventListener('scroll',close,true);
});
onBeforeUnmount(()=>{window.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true);queueMicrotask(()=>previous?.isConnected && previous.focus());});
</script>
<template><Teleport to="body"><div ref="menu" class="context-menu" role="menu" :aria-label="label" :style="{left:left+'px',top:top+'px'}" @keydown="key" @contextmenu.prevent><button v-for="option in options" :key="option.id" role="menuitem" :class="{danger:option.danger}" @click="emit('select',option.id)">{{ option.label }}</button></div></Teleport></template>
<style scoped>.context-menu { position:fixed; z-index:1000; width:180px; box-sizing:border-box; display:grid; gap:4px; padding:6px; background:var(--surface); border:1px solid var(--line); border-radius:10px; box-shadow:0 8px 24px color-mix(in srgb,var(--ink) 15%,transparent); }.context-menu button { height:40px; min-height:40px; padding:0 12px; border:0; border-radius:6px; text-align:left; font-size:var(--font-control); font-weight:700; color:var(--ink); background:transparent; }.context-menu button:hover,.context-menu button:focus-visible { background:var(--element-anemo-light); }.context-menu button:focus-visible { outline:2px solid var(--element-hydro-deep); outline-offset:-2px; }.context-menu .danger { color:var(--element-pyro-deep); }.context-menu .danger:hover,.context-menu .danger:focus-visible { background:var(--element-pyro-light); }</style>
