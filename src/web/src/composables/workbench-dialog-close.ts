export type BeforeDialogClose = (close: () => void, cancel?: () => void) => void;

export const workbenchDialogClose = new WeakMap<HTMLDialogElement, {
  isDirty: () => boolean;
  close: (closed: () => void, canceled: () => void) => void;
}>();
