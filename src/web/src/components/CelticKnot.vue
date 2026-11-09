<script setup lang="ts">
import {computed,useId} from 'vue';
const props=withDefaults(defineProps<{decorated?:boolean;variant?:'line'|'ribbon'}>(),{decorated:false,variant:'line'});
const maskId=`${useId()}-celtic-knot`;
const arcMaskId=`${maskId}-arc`;
const ringMaskId=`${maskId}-ring`;
// Approved circular arcs (152 degrees), with cuts following the crossing strand.
const coreArc='M12 2A8.92538 8.92538 0 0 0 20.66025 17';
const coreCrossing='M10.16169 12.29937A8.92538 8.92538 0 0 0 14.04292 16.3185';
const ringOver='M18.03081 15.93311A7.2 7.2 0 0 1 15.53306 18.27355';
const coreOver='M10.92963 3.24324A8.92538 8.92538 0 0 0 9.36362 7.16373';
// One closed strand: each quadratic uses the opposite triangle vertex as its control.
const strand='M12 2Q3.3397 17 20.6603 17Q12 2 3.3397 17Q20.6603 17 12 2Z';
const ring='M4.8 12a7.2 7.2 0 1 0 14.4 0a7.2 7.2 0 1 0 -14.4 0';
const rotations=[0,120,240];
const wovenRing=computed(()=>props.decorated);
const bandWidth=computed(()=>props.decorated?1.8:2.2);
const bandOpening=computed(()=>props.decorated?0.62:0.85);
// Exact quadratic fragments cover the overpassing strand; the underpass stays transparent.
const knotBridge='M10.4091 14.0518Q11.6856 15.5148 14.2196 16.2518';
const rimKnotBridge='M11.6772 2.5701Q10.2897 5.0712 9.6531 7.1388';
const rimBridge='M18.2243 15.6192A7.2 7.2 0 0 1 16.2076 17.8426';
</script>
<template>
  <g class="celtic-knot" :data-decorated="decorated" :data-variant="variant">
    <template v-if="variant==='line'">
      <g :transform="decorated?'translate(12 12) scale(.86) translate(-12 -12)':'translate(0 2.5)'">
        <defs>
          <mask :id="arcMaskId" maskUnits="userSpaceOnUse" x="-12" y="-12" width="48" height="48" style="mask-type:luminance">
            <rect x="-12" y="-12" width="48" height="48" fill="white" stroke="none" />
            <path :d="coreCrossing" transform="rotate(120 12 12)" fill="none" stroke="black" stroke-width="1.88" stroke-linecap="butt" />
            <path v-if="decorated" :d="ringOver" fill="none" stroke="black" stroke-width="1.48" stroke-linecap="butt" />
          </mask>
          <mask v-if="decorated" :id="ringMaskId" maskUnits="userSpaceOnUse" x="-12" y="-12" width="48" height="48" style="mask-type:luminance">
            <rect x="-12" y="-12" width="48" height="48" fill="white" stroke="none" />
            <path v-for="angle in rotations" :key="angle" :d="coreOver" :transform="`rotate(${angle} 12 12)`" fill="none" stroke="black" stroke-width="1.88" stroke-linecap="butt" />
          </mask>
        </defs>
        <g v-for="angle in rotations" :key="angle" :transform="`rotate(${angle} 12 12)`">
          <path data-core-arc="true" :d="coreArc" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" :mask="`url(#${arcMaskId})`" />
        </g>
        <circle v-if="decorated" class="simple-ring" cx="12" cy="12" r="7.2" :mask="`url(#${ringMaskId})`" />
      </g>
      <circle v-if="decorated" class="outer-ring" cx="12" cy="12" r="10.5" />
    </template>
    <template v-else>
      <defs>
        <mask :id="maskId" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24" style="mask-type:luminance">
          <rect width="24" height="24" fill="black" stroke="none" />
          <path :d="strand" fill="none" stroke="white" :stroke-width="bandWidth" />
          <path v-if="wovenRing" :d="ring" fill="none" stroke="white" stroke-width="1.2" />
          <path v-if="bandOpening" :d="strand" fill="none" stroke="black" :stroke-width="bandOpening" />
          <g v-for="angle in rotations" :key="`gap-${angle}`" :transform="`rotate(${angle} 12 12)`" fill="black" stroke="none">
            <circle cx="12" cy="15.3333" :r="wovenRing ? 1.25 : 1.65" />
            <template v-if="decorated"><circle cx="10.4774" cy="4.9628" r="1.25" /><circle cx="17.3331" cy="16.8372" r="1.25" /></template>
          </g>
          <g v-for="angle in rotations" :key="`bridge-${angle}`" :transform="`rotate(${angle} 12 12)`" fill="none">
            <path :d="knotBridge" stroke="white" :stroke-width="bandWidth" /><path v-if="bandOpening" :d="knotBridge" stroke="black" :stroke-width="bandOpening" />
            <template v-if="decorated"><path :d="rimKnotBridge" stroke="white" :stroke-width="bandWidth" /><path :d="rimKnotBridge" stroke="black" :stroke-width="bandOpening" /><path :d="rimBridge" stroke="white" stroke-width="1.2" /></template>
          </g>
        </mask>
      </defs>
      <g :transform="`translate(0 ${decorated ? 0.7 : 2.5})`"><rect class="knot-ink" width="24" height="24" :mask="`url(#${maskId})`" /></g>
    </template>
  </g>
</template>
<style scoped>
.celtic-knot { stroke-linecap:round; stroke-linejoin:round; }.knot-ink { fill:currentColor; stroke:none; }.simple-ring,.outer-ring { fill:none; stroke:currentColor; stroke-width:1.2; }
</style>
