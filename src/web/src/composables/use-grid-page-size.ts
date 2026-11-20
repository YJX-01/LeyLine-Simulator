import { ref, watch, type Ref } from 'vue';

type CardDensity = 'relaxed' | 'compact';

export function useGridPageSize(
  grid: Ref<HTMLElement | undefined>,
  density: Readonly<Ref<CardDensity>>,
  rows: Readonly<Record<CardDensity, number>>,
  size: Ref<number> = ref(rows[density.value]),
) {
  watch([grid, density], ([element, layout], _previous, onCleanup) => {
    if (!element) return;
    const measure = () => {
      if (!element.clientWidth) return;
      const columns = getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length;
      size.value = rows[layout] * columns;
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
