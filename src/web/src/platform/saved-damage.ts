import { storageKeyFor } from '@leyline/schema/version';
import { damageCalculatorSchema, type DamageCalculatorDocument } from '@leyline/schema';
import { packDocument, unpackDocument } from '../domain/content-document';

export interface SavedDamageSummary {
  id: string;
  name: string;
  team?: string;
  savedAt: number;
  value?: number;
  verification?: 'pending';
}

// Keep the list cheap to open, even when each entry carries a whole team's definitions.
async function withDatabase<T>(action: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(storageKeyFor('saved-damage'), 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('summaries', { keyPath: 'id' });
      open.result.createObjectStore('documents');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try { return await action(db); } finally { db.close(); }
}

function read<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function write(db: IDBDatabase, update: (summaries: IDBObjectStore, documents: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['summaries', 'documents'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('伤害列表未能保存。'));
    try { update(tx.objectStore('summaries'), tx.objectStore('documents')); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export async function listSavedDamage(): Promise<SavedDamageSummary[]> {
  const rows = await withDatabase(db => read<SavedDamageSummary[]>(db.transaction('summaries').objectStore('summaries').getAll()));
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveDamageSnapshot(info: Omit<SavedDamageSummary, 'id' | 'savedAt'>, document: DamageCalculatorDocument) {
  const summary = { ...info, id: crypto.randomUUID(), savedAt: Date.now() };
  const packed = packDocument('damage-calculator', document);
  await withDatabase(db => write(db, (summaries, documents) => {
    documents.add(packed, summary.id);
    summaries.add(summary);
  }));
  return summary.id;
}

export async function loadSavedDamage(id: string) {
  const packed = await withDatabase(db => read(db.transaction('documents').objectStore('documents').get(id)));
  if (packed === undefined) throw new Error('这条伤害已被删除，请重新打开列表。');
  return damageCalculatorSchema.parse(unpackDocument('damage-calculator', packed));
}

export async function deleteSavedDamage(id: string) {
  await withDatabase(db => write(db, (summaries, documents) => {
    summaries.delete(id);
    documents.delete(id);
  }));
}
