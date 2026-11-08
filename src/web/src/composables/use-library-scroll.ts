import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useAccountStore } from '../stores/account';
import { useLibraryViewStore } from '../stores/library-view';

export function useLibraryScroll(key:()=>string, enabled=true) {
  if(!enabled)return;
  const account=useAccountStore(),views=useLibraryViewStore();
  let frame=0;
  const positions=()=>views.forAccount(account.account.id).scroll;
  async function restore() {
    await nextTick();
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>window.scrollTo(0,positions()[key()] ?? 0));
  }
  onMounted(()=>void restore());
  watch(key,(_current,previous)=>{positions()[previous]=window.scrollY;void restore();});
  onBeforeUnmount(()=>{cancelAnimationFrame(frame);positions()[key()]=window.scrollY;});
}
