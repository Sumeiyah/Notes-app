// Keeps your passkey-derived key on THIS device only, so locking a note does not ask again.
// The key is stored in a form that the browser will not let any code read back out.
const DB = 'notes-keys'
const STORE = 'keys'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveKey(userId: string, key: CryptoKey): Promise<void> {
  await run('readwrite', (s) => s.put(key, userId))
}

export async function loadKey(userId: string): Promise<CryptoKey | undefined> {
  try {
    return await run<CryptoKey | undefined>('readonly', (s) => s.get(userId))
  } catch {
    return undefined
  }
}

export async function forgetKey(userId: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(userId))
  } catch {
    /* nothing to forget */
  }
}