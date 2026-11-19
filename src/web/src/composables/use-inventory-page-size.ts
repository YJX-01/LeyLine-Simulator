import { watch, type Ref } from 'vue';

export function useInventoryPageSize(
  grid: Ref<HTMLElement | undefined>,
  density: Ref<'relaxed' | 'compact'>,
  size: Ref<number>,
) {
  watch([grid, density], ([element, layout], _previous, onCleanup) => {
    if (!element) return;
    const rows = layout === 'compact' ? 8 : 5;
    const measure = () => {
      const columns = getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length;
      size.value = rows * columns;
    };
    let frame = 0;
    let width: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(element);
    measure();
    onCleanup(() => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    });
  }, { flush: 'post' });
  return size;
}
