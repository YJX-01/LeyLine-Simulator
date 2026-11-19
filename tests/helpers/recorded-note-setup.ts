import type { Page } from '@playwright/test';
import { organizeMonaWearNotes } from '../../src/web/src/domain/mona-wear-notes';
/** Historical setup from the actual Mona wear notes; never supplies cultivation or weapons. */
export async function restoreRecordedNoteSetup(page:Page) {
  const account=await page.evaluate(()=>JSON.parse(localStorage.getItem('leyline-account-v5')!));
  organizeMonaWearNotes(account);
  await page.evaluate(content=>localStorage.setItem('leyline-account-v5',content),JSON.stringify(account));
  await page.reload();
}
