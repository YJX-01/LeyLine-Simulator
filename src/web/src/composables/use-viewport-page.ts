import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

export function useViewportPage(grid:Ref<HTMLElement|undefined>, density:()=>string, enabled:boolean, retainedSize?:Ref<number>) {
  const size=retainedSize ?? ref(30);
  let observer:ResizeObserver|undefined,frame=0;
  function measure() {
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const element=grid.value,card=element?.firstElementChild;
      if(!enabled || !element || !card)return;
      const style=getComputedStyle(element),height=card.getBoundingClientRect().height;
      if(!height)return;
      const columns=style.gridTemplateColumns.split(' ').filter(Boolean).length;
      const gap=parseFloat(style.rowGap) || 0;
      const top=element.getBoundingClientRect().top+window.scrollY;
      const rows=Math.max(1,Math.floor((window.innerHeight-top-92+gap)/(height+gap)));
      const next=columns*rows;
      if(next!==size.value)size.value=next;
    });
  }
  onMounted(()=>{
    if(!enabled)return;
    observer=new ResizeObserver(measure);
    if(grid.value)observer.observe(grid.value);
    window.addEventListener('resize',measure);
    measure();
  });
  watch([grid,density],async()=>{await nextTick();observer?.disconnect();if(grid.value)observer?.observe(grid.value);measure();});
  onBeforeUnmount(()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',measure);});
  return size;
}
