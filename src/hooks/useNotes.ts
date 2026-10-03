import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { decryptBytes, decryptText, deriveKey, encryptBytes, encryptText, fromB64 } from '../lib/crypto'
import { removeMedia } from '../lib/media'
import type { MediaItem, NoteRow, NoteSummary } from '../lib/types'

export interface Fields {
  title: string
  body: string
}

type Transform = (bytes: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>

// Copies a note's files to fresh paths, changing them with "transform" (encrypt or decrypt).
// The caller deletes the old files only after the note has been saved with the new ones.
async function rewriteMedia(note: NoteRow, transform: Transform): Promise<MediaItem[]> {
  const folder = crypto.randomUUID().slice(0, 8)
  const out: MediaItem[] = []
  for (const m of note.media ?? []) {
    const id = m.path.split('/').pop()!
    const path = `${note.user_id}/${note.id}/${folder}/${id}`
    const { data, error } = await supabase.storage.from('media').download(m.path)
    if (error) throw error
    const bytes = await transform(new Uint8Array(await data.arrayBuffer()))
    const { error: upErr } = await supabase.storage
      .from('media')
      .upload(path, bytes, { upsert: true, contentType: 'application/octet-stream' })
    if (upErr) throw upErr
    out.push({ ...m, path })
  }
  return out
}

export function useNotes() {
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('notes')
      .select('id,title,body,locked,updated_at')
      .order('updated_at', { ascending: false })
    if (error) setError(error.message)
    else setNotes(data as NoteSummary[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createNote(): Promise<NoteRow | null> {
    const { data, error } = await supabase.from('notes').insert({}).select().single()
    if (error) {
      setError(error.message)
      return null
    }
    await refresh()
    return data as NoteRow
  }

  async function getNote(id: string): Promise<NoteRow | null> {
    const { data, error } = await supabase.from('notes').select('*').eq('id', id).single()
    if (error) {
      setError(error.message)
      return null
    }
    return data as NoteRow
  }

  // If a key is given, the note is locked: the text is stored encrypted and only the title stays readable.
  async function saveNote(id: string, fields: Fields, key: CryptoKey | null = null) {
    const content = key
      ? { data: await encryptText(key, JSON.stringify(fields)), title: fields.title, body: '' }
      : { ...fields }
    const { error } = await supabase
      .from('notes')
      .update({ ...content, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setError(error.message)
    await refresh()
  }

  async function updateMedia(id: string, media: MediaItem[]) {
    const { error } = await supabase
      .from('notes')
      .update({ media, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setError(error.message)
    await refresh()
  }

  // Deletes the notes and all their attached files.
  async function deleteNotes(ids: string[]) {
    const { data } = await supabase.from('notes').select('media').in('id', ids)
    const paths = (data ?? []).flatMap((r) => ((r.media ?? []) as MediaItem[]).map((m) => m.path))
    await removeMedia(paths)
    const { error } = await supabase.from('notes').delete().in('id', ids)
    if (error) setError(error.message)
    await refresh()
  }

  async function deleteNote(id: string) {
    await deleteNotes([id])
  }

  // Locks notes (and their attachments) with your one passkey. The title stays visible.
  async function lockNotes(ids: string[], key: CryptoKey): Promise<boolean> {
    const { data, error } = await supabase.from('notes').select('*').in('id', ids)
    if (error) {
      setError(error.message)
      return false
    }
    for (const n of data as NoteRow[]) {
      if (n.locked) continue
      try {
        const media = await rewriteMedia(n, (b) => encryptBytes(key, b))
        const payload = await encryptText(key, JSON.stringify({ title: n.title, body: n.body }))
        const { error } = await supabase
          .from('notes')
          .update({ locked: true, salt: null, data: payload, title: n.title, body: '', media })
          .eq('id', n.id)
        if (error) throw error
        await removeMedia((n.media ?? []).map((m) => m.path))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not lock this note')
        await refresh()
        return false
      }
    }
    await refresh()
    return true
  }

  // Removes the lock: decrypts the text and the attachments and stores them as a normal note.
  async function removeLocks(ids: string[], key: CryptoKey): Promise<boolean> {
    const { data, error } = await supabase.from('notes').select('*').in('id', ids)
    if (error) {
      setError(error.message)
      return false
    }
    let skipped = 0
    for (const n of data as NoteRow[]) {
      if (!n.locked) continue
      if (n.salt) {
        skipped++
        continue
      }
      try {
        const fields = JSON.parse(await decryptText(key, n.data!)) as Fields
        const media = await rewriteMedia(n, (b) => decryptBytes(key, b))
        const { error } = await supabase
          .from('notes')
          .update({ locked: false, salt: null, data: null, title: fields.title, body: fields.body, media })
          .eq('id', n.id)
        if (error) throw error
        await removeMedia((n.media ?? []).map((m) => m.path))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove the lock')
        await refresh()
        return false
      }
    }
    if (skipped) {
      setError('Some notes still use their own old PIN. Open each one once to switch it to your passkey, then remove the lock.')
    }
    await refresh()
    return true
  }

  // Opens a note locked with your passkey. Returns null if it cannot be decrypted.
  async function unlockWithKey(note: NoteRow, key: CryptoKey): Promise<Fields | null> {
    try {
      const fields = JSON.parse(await decryptText(key, note.data!)) as Fields
      // Older locked notes had no visible title; set it now so it shows on the card.
      if (!note.title && fields.title) {
        supabase
          .from('notes')
          .update({ title: fields.title })
          .eq('id', note.id)
          .then(() => refresh())
      }
      return fields
    } catch {
      return null
    }
  }

  // Older notes that were locked with their own PIN. Returns null if the PIN is wrong.
  async function unlockNote(note: NoteRow, pin: string): Promise<{ key: CryptoKey; fields: Fields } | null> {
    try {
      const key = await deriveKey(pin, fromB64(note.salt!))
      const fields = JSON.parse(await decryptText(key, note.data!)) as Fields
      return { key, fields }
    } catch {
      return null
    }
  }

  // Switches a note that was locked with its own PIN over to your one passkey.
  async function convertNote(
    note: NoteRow,
    oldKey: CryptoKey,
    fields: Fields,
    newKey: CryptoKey,
  ): Promise<boolean> {
    try {
      const media = await rewriteMedia(note, async (b) => encryptBytes(newKey, await decryptBytes(oldKey, b)))
      const payload = await encryptText(newKey, JSON.stringify(fields))
      const { error } = await supabase
        .from('notes')
        .update({ data: payload, salt: null, media, title: fields.title })
        .eq('id', note.id)
      if (error) throw error
      await removeMedia((note.media ?? []).map((m) => m.path))
      await refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert this note')
      return false
    }
  }

  return {
    notes,
    loading,
    error,
    createNote,
    getNote,
    saveNote,
    updateMedia,
    deleteNote,
    deleteNotes,
    lockNotes,
    removeLocks,
    unlockWithKey,
    unlockNote,
    convertNote,
  }
}