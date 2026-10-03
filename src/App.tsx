import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import { useNotes } from './hooks/useNotes'
import { useStorageUsage } from './hooks/useStorage'
import AuthForm from './components/AuthForm'
import NoteList from './components/NoteList'
import NoteEditor from './components/NoteEditor'
import PinDialog from './components/PinDialog'
import { checkPasskey, createPasskey, fetchProfile, keyMatches, type Profile } from './lib/passkey'
import { forgetKey, loadKey, saveKey } from './lib/keystore'
import type { NoteRow } from './lib/types'

type OpenNote = NoteRow & { key: CryptoKey | null }
type Dialog =
  | { mode: 'setup' | 'enter'; then: (key: CryptoKey) => Promise<void> }
  | { mode: 'legacy'; note: NoteRow }
  | null

export default function App() {
  const { user, loading, signOut } = useAuth()

  if (loading) return <p className="p-6 text-muted">Loading…</p>
  if (!user) return <AuthForm />

  return (
    <NotesScreen
      userId={user.id}
      onSignOut={async () => {
        await forgetKey(user.id) // this device forgets your key when you sign out
        await signOut()
      }}
    />
  )
}

function NotesScreen({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const {
    notes,
    error,
    createNote,
    getNote,
    saveNote,
    deleteNote,
    deleteNotes,
    lockNotes,
    removeLocks,
    unlockWithKey,
    unlockNote,
    convertNote,
    updateMedia,
  } = useNotes()

  const [current, setCurrent] = useState<OpenNote | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [deviceKey, setDeviceKey] = useState<CryptoKey | null>(null)
  const storageUsed = useStorageUsage([notes, current === null])

  // Load your passkey profile, and the key this device saved earlier (if it still matches).
  useEffect(() => {
    ;(async () => {
      const p = await fetchProfile()
      setProfile(p)
      if (!p) return
      const k = await loadKey(userId)
      if (k && (await keyMatches(p, k))) setDeviceKey(k)
      else if (k) await forgetKey(userId)
    })()
  }, [userId])

  function remember(key: CryptoKey) {
    setDeviceKey(key)
    saveKey(userId, key).catch(() => {})
  }

  // Always asks for the passkey. Used to open a locked note or remove a lock.
  async function askPasskey(then: (key: CryptoKey) => Promise<void>) {
    const p = profile === undefined ? await fetchProfile() : profile
    setProfile(p)
    setPinError(null)
    setDialog({ mode: p ? 'enter' : 'setup', then })
  }

  // Uses the key saved on this device without asking. Asks once if there is none yet.
  async function withDeviceKey(then: (key: CryptoKey) => Promise<void>) {
    if (deviceKey) return then(deviceKey)
    return askPasskey(then)
  }

  async function open(id: string) {
    const note = await getNote(id)
    if (!note) return
    if (!note.locked) return setCurrent({ ...note, key: null })
    if (note.salt) {
      setPinError(null)
      return setDialog({ mode: 'legacy', note })
    }
    askPasskey(async (key) => {
      const fields = await unlockWithKey(note, key)
      if (fields) setCurrent({ ...note, ...fields, key })
      else alert('Could not unlock this note.')
    })
  }

  async function create() {
    const note = await createNote()
    if (note) setCurrent({ ...note, key: null })
  }

  async function remove(id: string) {
    if (!confirm('Delete this note?')) return
    await deleteNote(id)
    setCurrent(null)
  }

  async function removeMany(ids: string[]): Promise<boolean> {
    if (!confirm(`Delete ${ids.length} note${ids.length > 1 ? 's' : ''}?`)) return false
    await deleteNotes(ids)
    return true
  }

  function save(id: string, fields: { title: string; body: string }) {
    return saveNote(id, fields, current?.key ?? null)
  }

  async function submitPin(pin: string) {
    if (!dialog) return
    setBusy(true)
    setPinError(null)
    try {
      if (dialog.mode === 'legacy') {
        const r = await unlockNote(dialog.note, pin)
        if (r) {
          const old = dialog.note
          setDialog(null)
          // Switch this note over to your one passkey, then open it.
          await withDeviceKey(async (key) => {
            if (await convertNote(old, r.key, r.fields, key)) {
              const fresh = await getNote(old.id)
              if (fresh) setCurrent({ ...fresh, ...r.fields, key })
            } else {
              setCurrent({ ...old, ...r.fields, key: r.key })
            }
          })
        } else setPinError('Wrong PIN')
      } else if (dialog.mode === 'setup') {
        const { key, profile: p } = await createPasskey(pin)
        setProfile(p)
        remember(key)
        setDialog(null)
        await dialog.then(key)
      } else {
        const key = await checkPasskey(profile as Profile, pin)
        if (!key) setPinError('Wrong passkey')
        else {
          remember(key)
          setDialog(null)
          await dialog.then(key)
        }
      }
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Something went wrong')
    }
    setBusy(false)
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl">
      {error && <p className="p-4 text-sm text-red-400">{error}</p>}
      {current ? (
        <NoteEditor
          key={current.id}
          note={current}
          cryptoKey={current.key}
          onSave={save}
          onMediaChange={updateMedia}
          onDelete={remove}
          onBack={() => setCurrent(null)}
        />
      ) : (
        <NoteList
          notes={notes}
          onSelect={open}
          onNew={create}
          onSignOut={onSignOut}
          storageUsed={storageUsed}
          onDeleteMany={removeMany}
          onLockMany={(ids) => {
            withDeviceKey(async (key) => {
              await lockNotes(ids, key)
            })
          }}
          onUnlockMany={(ids) => {
            askPasskey(async (key) => {
              await removeLocks(ids, key)
            })
          }}
        />
      )}

      {dialog && (
        <PinDialog
          title={
            dialog.mode === 'setup'
              ? 'Create your passkey'
              : dialog.mode === 'enter'
                ? 'Enter your passkey'
                : 'Enter PIN'
          }
          confirmPin={dialog.mode === 'setup'}
          error={pinError}
          busy={busy}
          onSubmit={submitPin}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}