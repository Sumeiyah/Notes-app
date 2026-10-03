import { supabase } from './supabase'
import { decryptBytes, encryptBytes } from './crypto'
import type { MediaItem } from './types'

const BUCKET = 'media'
const MAX_BYTES = 50 * 1024 * 1024

// Uploads with a progress percentage. Locked notes are encrypted first.
export async function uploadMedia(
  userId: string,
  noteId: string,
  blob: Blob,
  key: CryptoKey | null,
  onProgress?: (pct: number) => void,
): Promise<MediaItem> {
  if (blob.size > MAX_BYTES) throw new Error('File is over the 50 MB limit of the free plan')
  const path = `${userId}/${noteId}/${crypto.randomUUID()}`
  const type = (blob.type || 'application/octet-stream').split(';')[0]
  const file = key
    ? new Blob([await encryptBytes(key, new Uint8Array(await blob.arrayBuffer()))], {
        type: 'application/octet-stream',
      })
    : blob

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')

  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', file)

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = `Upload failed (${xhr.status})`
      try {
        msg = JSON.parse(xhr.responseText).message ?? msg
      } catch {
        /* keep default message */
      }
      reject(new Error(msg))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(form)
  })
  return { path, type }
}

// Returns a temporary URL the browser can display or play.
export async function downloadMedia(item: MediaItem, key: CryptoKey | null): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(item.path)
  if (error) throw error
  if (!key) return URL.createObjectURL(new Blob([data], { type: item.type }))
  const bytes = await decryptBytes(key, new Uint8Array(await data.arrayBuffer()))
  return URL.createObjectURL(new Blob([bytes], { type: item.type }))
}

export async function removeMedia(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

// Used when a note that already has attachments gets locked.
export async function encryptExisting(items: MediaItem[], key: CryptoKey) {
  for (const item of items) {
    const { data, error } = await supabase.storage.from(BUCKET).download(item.path)
    if (error) throw error
    const encrypted = await encryptBytes(key, new Uint8Array(await data.arrayBuffer()))
    const { error: upError } = await supabase.storage
      .from(BUCKET)
      .upload(item.path, encrypted, { upsert: true, contentType: 'application/octet-stream' })
    if (upError) throw upError
  }
}