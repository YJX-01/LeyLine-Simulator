import type { Page } from '@playwright/test';

export async function readDocument<T>(page: Page, kind: string, text: string): Promise<T> {
  return page.evaluate(async ({ kind, text }) => {
    // @ts-expect-error Vite browser source URL.
    const { unpackDocument } = await import('/src/domain/content-document.ts');
    return unpackDocument(kind, JSON.parse(text));
  }, { kind, text });
}
