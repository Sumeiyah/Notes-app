import { useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  EllipsisVertical,
  Lock,
  LockOpen,
  LogOut,
  Search,
  Share2,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react'
import type { NoteSummary } from '../lib/types'

interface Props {
  notes: NoteSummary[]
  onSelect: (id: string) => void
  onNew: () => void
  onSignOut: () => void
  onDeleteMany: (ids: string[]) => Promise<boolean>
  onLockMany: (ids: string[]) => void
  onUnlockMany: (ids: string[]) => void
  storageUsed: number | null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// Removes the hidden attachment markers from a note's text.
const clean = (s: string) => s.replace(/\{\{media:[^}]*\}\}/g, '')

const STORAGE_LIMIT = 1024 ** 3 // 1 GB on the free plan
const sizeText = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.round(b / 1024 ** 2)} MB`

export default function NoteList({
  notes,
  onSelect,
  onNew,
  onSignOut,
  onDeleteMany,
  onLockMany,
  onUnlockMany,
  storageUsed,
}: Props) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const pressTimer = useRef<number>(0)
  const longPressed = useRef(false)

  const selecting = selected.size > 0
  // When every selected note is locked, the button removes the lock instead of adding one.
  const allLocked = selecting && [...selected].every((id) => notes.find((n) => n.id === id)?.locked)
  const q = query.trim().toLowerCase()
  // Locked notes can be found by their title only, since their text is encrypted.
  const shown = q
    ? notes.filter((n) => (n.locked ? n.title : n.title + ' ' + clean(n.body)).toLowerCase().includes(q))
    : notes

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function startPress(id: string) {
    longPressed.current = false
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      toggle(id)
    }, 500)
  }

  function endPress() {
    window.clearTimeout(pressTimer.current)
  }

  function clickCard(id: string) {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (selecting) toggle(id)
    else onSelect(id)
  }

  function closeSearch() {
    setSearching(false)
    setQuery('')
  }

  async function deleteSelected() {
    if (await onDeleteMany([...selected])) setSelected(new Set())
  }

  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full hover:bg-card'
  const allSelected = shown.length > 0 && shown.every((n) => selected.has(n.id))

  return (
    <div className="px-4 pb-32 pt-4">
      <header className="relative mb-2 flex h-12 items-center gap-1">
        {selecting ? (
          <>
            <button className={iconBtn} aria-label="Cancel selection" onClick={() => setSelected(new Set())}>
              <X size={24} strokeWidth={1.75} />
            </button>
            <h1 className="flex-1 px-2 text-2xl font-semibold">{selected.size} selected</h1>
            <button
              className="rounded-full px-4 py-2 text-sm text-muted hover:bg-card"
              onClick={() => setSelected(allSelected ? new Set() : new Set(shown.map((n) => n.id)))}
            >
              {allSelected ? 'None' : 'All'}
            </button>
          </>
        ) : searching ? (
          <>
            <button className={iconBtn} aria-label="Close search" onClick={closeSearch}>
              <ArrowLeft size={24} strokeWidth={1.75} />
            </button>
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent px-2 text-xl outline-none placeholder:text-muted"
              placeholder="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </>
        ) : (
          <>
            <h1 className="flex-1 text-3xl font-semibold">All notes</h1>
            <button className={iconBtn} aria-label="Search" onClick={() => setSearching(true)}>
              <Search size={24} strokeWidth={1.75} />
            </button>
            <button className={iconBtn} aria-label="More" onClick={() => setMenuOpen(true)}>
              <EllipsisVertical size={24} strokeWidth={1.75} />
            </button>
          </>
        )}

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-3xl bg-menu py-2 shadow-xl">
              <button
                className="flex w-full items-center gap-4 px-5 py-3 text-left text-lg hover:bg-white/10"
                onClick={() => {
                  setMenuOpen(false)
                  onSignOut()
                }}
              >
                <LogOut size={22} strokeWidth={1.5} className="text-white/80" />
                Sign out
              </button>
            </div>
          </>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        {storageUsed === null ? (
          <span />
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/15">
              <div
                className={'h-full rounded-full ' + (storageUsed / STORAGE_LIMIT > 0.8 ? 'bg-red-400' : 'bg-white')}
                style={{ width: `${Math.min(100, (storageUsed / STORAGE_LIMIT) * 100)}%` }}
              />
            </div>
            <span>{sizeText(storageUsed)} of 1 GB used</span>
          </div>
        )}
        <span>Date modified ↓</span>
      </div>

      {notes.length === 0 && (
        <p className="py-16 text-center text-muted">No notes yet. Tap the pencil to start one.</p>
      )}
      {notes.length > 0 && shown.length === 0 && (
        <p className="py-16 text-center text-muted">No notes match your search.</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {shown.map((n) => {
          const on = selected.has(n.id)
          return (
            <button
              key={n.id}
              className="min-w-0 select-none text-center"
              onClick={() => clickCard(n.id)}
              onPointerDown={() => startPress(n.id)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onContextMenu={(e) => {
                e.preventDefault()
                endPress()
                longPressed.current = false
                toggle(n.id)
              }}
            >
              <div
                className={
                  'relative aspect-square w-full overflow-hidden rounded-2xl bg-card p-2 text-left text-[11px] leading-snug sm:p-3 sm:text-sm ' +
                  (on ? 'ring-2 ring-accent' : '')
                }
              >
                {selecting && (
                  <span
                    className={
                      'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ' +
                      (on ? 'border-accent bg-accent text-white' : 'border-white/40')
                    }
                  >
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                )}
                {n.locked ? (
                  <div className="flex h-full items-center justify-center text-muted">
                    <Lock size={28} strokeWidth={1.5} />
                  </div>
                ) : (
                  <p className="line-clamp-6 whitespace-pre-wrap break-words">{clean(n.body)}</p>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 break-words text-sm font-semibold sm:text-base">
                {n.title || (n.locked ? 'Locked note' : 'Untitled')}
              </p>
              <p className="text-xs text-muted sm:text-sm">{fmt(n.updated_at)}</p>
            </button>
          )
        })}
      </div>

      {selecting ? (
        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-3xl justify-around bg-app/95 px-2 py-3">
          <button
            className="flex w-20 flex-col items-center gap-1 text-xs"
            onClick={() => {
              const ids = [...selected]
              setSelected(new Set())
              if (allLocked) onUnlockMany(ids)
              else onLockMany(ids)
            }}
          >
            {allLocked ? <LockOpen size={24} strokeWidth={1.5} /> : <Lock size={24} strokeWidth={1.5} />}
            {allLocked ? 'Unlock' : 'Lock'}
          </button>
          <button className="flex w-20 flex-col items-center gap-1 text-xs opacity-40" disabled>
            <Share2 size={24} strokeWidth={1.5} />
            Share
          </button>
          <button className="flex w-20 flex-col items-center gap-1 text-xs" onClick={deleteSelected}>
            <Trash2 size={24} strokeWidth={1.5} />
            Delete
          </button>
          <button className="flex w-20 flex-col items-center gap-1 text-xs opacity-40" disabled>
            <EllipsisVertical size={24} strokeWidth={1.5} />
            More
          </button>
        </nav>
      ) : (
        <button
          aria-label="New note"
          className="fixed bottom-8 right-6 flex h-16 w-16 items-center justify-center rounded-full bg-card text-accent shadow-lg"
          onClick={onNew}
        >
          <SquarePen size={28} strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}