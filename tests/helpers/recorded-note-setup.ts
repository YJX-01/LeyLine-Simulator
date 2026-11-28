import type { Page } from '@playwright/test';
import { organizeMonaWearNotes } from '../../src/web/src/domain/mona-wear-notes';
/** Historical setup from the actual Mona wear notes; never supplies cultivation or weapons. */
export async function restoreRecordedNoteSetup(page:Page) {
  const file=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-0.3.0')!));
  organizeMonaWearNotes(file.document);
  await page.evaluate(content=>localStorage.setItem('leyline-account-0.3.0',content),JSON.stringify(file));
  await page.reload();
}
