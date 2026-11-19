import { nextTick, shallowRef, type InjectionKey } from 'vue';
import type { ArtifactReferenceTarget } from '../domain/artifact-references';
import { workbenchDialogClose } from './workbench-dialog-close';

const referenceReturnLimit = 5;
export const artifactReferenceNavigation: InjectionKey<(target: ArtifactReferenceTarget) => void> = Symbol('artifact-reference-navigation');

interface ReferencePosition {
  dialogs: { element: HTMLDialogElement; scrollTop: number }[];
  focus: HTMLElement | null;
  scrollY: number;
}

interface ReferenceLayer {
  id: number;
  target: ArtifactReferenceTarget;
  keepPage: boolean;
  returnTo?: ReferencePosition;
}

function capturePosition(): ReferencePosition {
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
    .map(element => ({ element, scrollTop: element.scrollTop }));
  return {
    dialogs,
    focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    scrollY: window.scrollY,
  };
}

function suspend(position: ReferencePosition) {
  for (const { element } of [...position.dialogs].reverse()) element.close();
}

function resume(position: ReferencePosition) {
  for (const { element, scrollTop } of position.dialogs) {
    if (!element.isConnected) continue;
    if (!element.open) element.showModal();
    element.scrollTop = scrollTop;
  }
  if (position.focus?.isConnected) position.focus.focus({ preventScroll: true });
  window.scrollTo(0, position.scrollY);
}

async function closePosition(position: ReferencePosition) {
  for (const { element } of [...position.dialogs].reverse()) {
    if (!element.isConnected) continue;
    const control = workbenchDialogClose.get(element);
    if (control) {
      const closed = await new Promise<boolean>(resolve => control.close(() => resolve(true), () => resolve(false)));
      if (!closed) return false;
    }
    element.close();
  }
  return true;
}

export function useArtifactReferenceNavigation() {
  const layers = shallowRef<ReferenceLayer[]>([]);
  let sequence = 0;
  let evicting: ReferenceLayer[] | undefined;

  async function follow(target: ArtifactReferenceTarget, keepPage = false) {
    if (evicting) return;
    const history = layers.value;
    const source = capturePosition();
    const first = history[0];
    // After the first eviction, the earliest visible view remains as a destination.
    const hasBaseLayer = !!first && !first.returnTo;
    const retainedCount = history.length - Number(hasBaseLayer);
    const oldest = retainedCount === referenceReturnLimit ? history[hasBaseLayer ? 1 : 0].returnTo : undefined;

    // The latest source stays mounted. Eviction closes only the source leaving the queue.
    suspend(source);
    let retained = history;
    if (oldest) {
      evicting = history;
      let closed = false;
      try {
        if (oldest.dialogs.some(({ element }) => workbenchDialogClose.get(element)?.isDirty())) resume(oldest);
        closed = await closePosition(oldest);
      } finally {
        if (evicting === history) evicting = undefined;
        if (!closed && layers.value === history) {
          await nextTick();
          if (layers.value === history) {
            suspend(oldest);
            resume(source);
          }
        }
      }
      if (!closed || layers.value !== history) return;
      retained = history.slice(hasBaseLayer ? 1 : 0);
      retained[0] = { ...retained[0], returnTo: undefined };
    }
    window.scrollTo(0, source.scrollY);
    layers.value = [...retained, { id: ++sequence, target, keepPage, returnTo: source }];
  }

  async function restore(position: ReferencePosition, previous: ReferenceLayer[]) {
    await nextTick();
    if (layers.value === previous) resume(position);
  }

  function back(id: number) {
    const layer = layers.value.at(-1);
    if (layer?.id !== id) return;
    const previous = layers.value.slice(0, -1);
    layers.value = previous;
    if (layer.returnTo) void restore(layer.returnTo, previous);
  }

  function clear(restoreSource = false) {
    const source = layers.value[0]?.returnTo;
    if (!layers.value.length) return;
    const previous: ReferenceLayer[] = [];
    layers.value = previous;
    evicting = undefined;
    if (restoreSource && source) void restore(source, previous);
  }

  return { layers, follow, back, clear };
}
