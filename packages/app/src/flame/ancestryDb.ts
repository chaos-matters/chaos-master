/**
 * IndexedDB store for flame ancestry data.
 *
 * Ancestry nodes contain full FlameDescriptor objects which easily exceed
 * localStorage's ~5 MB quota during population simulation runs (hundreds of
 * breeds × full serialized flames). IndexedDB gives us hundreds of MB and
 * avoids the synchronous I/O cost of JSON.stringify on every write.
 */

import type { FlameDescriptor } from './schema/flameSchema'

const DB_NAME = 'chaos-master-ancestry'
const DB_VERSION = 1
const STORE_NAME = 'nodes'

// ── Schema ────────────────────────────────────────────────────────────────────

export interface AncestryRow {
  hash: string
  name: string
  parentA: string | null
  parentB: string | null
  generation: number
  createdAt: number
  flame: FlameDescriptor
}

// ── Database helpers ──────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' })
      }
    }
    req.onsuccess = () => {
      resolve(req.result)
    }
    req.onerror = () => {
      reject(req.error ?? new Error('Failed to open IndexedDB'))
    }
  })
}

function withStore(
  mode: IDBTransactionMode,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        const req = fn(store)
        tx.oncomplete = () => {
          resolve()
        }
        tx.onerror = () => {
          reject(tx.error ?? new Error('IndexedDB transaction failed'))
        }
        tx.onabort = () => {
          reject(tx.error ?? new Error('IndexedDB transaction aborted'))
        }
        // Some fn calls return void (put with no need to track), avoid unhandled
        void req
      }),
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Load all ancestry rows into a Map. */
export async function loadAllNodes(): Promise<Map<string, AncestryRow>> {
  const rows = new Map<string, AncestryRow>()
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const cursorReq = store.openCursor()
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result
          if (cursor) {
            const row = cursor.value as AncestryRow
            rows.set(row.hash, row)
            cursor.continue()
          } else {
            resolve(rows)
          }
        }
        cursorReq.onerror = () => {
          reject(cursorReq.error ?? new Error('IndexedDB cursor failed'))
        }
        tx.onerror = () => {
          reject(tx.error ?? new Error('IndexedDB transaction failed'))
        }
      })
      .catch(reject)
  })
}

/** Write a single node (upsert). */
export function putNode(row: AncestryRow): Promise<void> {
  return withStore('readwrite', (store) => store.put(row))
}

/** Write many nodes in one transaction. */
export function putNodes(rows: AncestryRow[]): Promise<void> {
  if (rows.length === 0) return Promise.resolve()
  return withStore('readwrite', (store) => {
    for (const row of rows) {
      store.put(row)
    }
  })
}

/** Delete a single node. */
export function deleteNode(hash: string): Promise<void> {
  return withStore('readwrite', (store) => store.delete(hash))
}

/** Clear all ancestry data. */
export function clearAllNodes(): Promise<void> {
  return withStore('readwrite', (store) => store.clear())
}
