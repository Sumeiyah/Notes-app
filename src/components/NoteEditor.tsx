import { useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Camera,
  ChevronLeft,
  EllipsisVertical,
  Image as ImageIcon,
  Mic,
  Music,
  Plus,
  Square,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRecorder } from '../hooks/useRecorder'
import { useDictation } from '../hooks/useDictation'
import { caretAt } from '../lib/caret'
import { removeMedia, uploadMedia } from '../lib/media'
import MediaView from './MediaView'
import CameraDialog from './CameraDialog'
import type { MediaItem, NoteRow } from '../lib/types'

interface Fields {
  title: string
  body: string
}

interface Props {
  note: NoteRow
  cryptoKey: CryptoKey | null
  onSave: (id: string, fields: Fields) => Promise<void>
  onMediaChange: (id: string, media: MediaItem[]) => Promise<void>
  onDelete: (id: string) => void
  onBack: () => void
}

type MenuName = 'plus' | 'more' | null
type AddItem = { label: string; Icon: LucideIcon; action: 'record' | 'camera' | 'file'; accept?: string }
type Line = { top: number; left: number; width: number; height: number }
type Target = { kind: 'text'; i: number; pos: number } | { kind: 'media'; id: string; after: boolean }

const addItems: AddItem[] = [
  { label: 'Voice recording', Icon: AudioLines, action: 'record' },
  { label: 'Image', Icon: ImageIcon, action: 'file', accept: 'image/*' },
  { label: 'Camera', Icon: Camera, action: 'camera' },
  { label: 'Video', Icon: Video, action: 'file', accept: 'video/*' },
  { label: 'Audio file', Icon: Music, action: 'file', accept: 'audio/*' },
]

// A note body is stored as text with markers like {{media:ID}} where attachments sit.
// Blocks alternate: even index = text, odd index = attachment id.
// Attachments with only an empty text block between them are shown together in one row.
const parse = (body: string) => body.split(/\{\{media:([^}]+)\}\}/)
const serialize = (b: string[]) => b.map((x, i) => (i % 2 ? `{{media:${x}}}` : x)).join('')
const idOf = (m: MediaItem) => m.path.split('/').pop()!
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function initialBlocks(note: NoteRow): string[] {
  const b = parse(note.body)
  // Attachments from older notes have no marker yet, so put them at the end.
  for (const m of note.media ?? []) if (!b.includes(idOf(m))) b.push(idOf(m), '')
  return b
}

function AutoText(props: {
  value: string
  onChange: (v: string) => void
  onCursor: (pos: number) => void
  reg: (el: HTMLTextAreaElement | null) => void
  placeholder?: string
  last?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    }
  }, [props.value])
  return (
    <textarea
      ref={(el) => {
        ref.current = el
        props.reg(el)
      }}
      rows={1}
      className={
        'block w-full resize-none overflow-hidden bg-transparent px-4 py-2 text-lg leading-relaxed outline-none placeholder:text-muted ' +
        (props.last ? 'min-h-[40vh]' : '')
      }
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onSelect={(e) => props.onCursor(e.currentTarget.selectionStart)}
      onFocus={(e) => props.onCursor(e.currentTarget.selectionStart)}
    />
  )
}

export default function NoteEditor({ note, cryptoKey, onSave, onMediaChange, onDelete, onBack }: Props) {
  const { user } = useAuth()
  const [title, setTitle] = useState(note.title)
  const [blocks, setBlocks] = useState<string[]>(() => initialBlocks(note))
  const [media, setMedia] = useState<MediaItem[]>(note.media ?? [])
  const [status, setStatus] = useState('')
  const [menu, setMenu] = useState<MenuName>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drop, setDrop] = useState<Line | null>(null)

  const blocksRef = useRef(blocks)
  const mediaRef = useRef<MediaItem[]>(note.media ?? [])
  const taRefs = useRef(new Map<number, HTMLTextAreaElement>())
  const mediaEls = useRef(new Map<string, HTMLElement>())
  const cursor = useRef({ i: blocks.length - 1, pos: Infinity })
  const latest = useRef<Fields>({ title: note.title, body: serialize(blocks) })
  const dirty = useRef(false)
  const timer = useRef<number>(0)
  const fileRef = useRef<HTMLInputElement>(null)

  async function flush() {
    if (!dirty.current) return
    dirty.current = false
    await onSave(note.id, latest.current)
    setStatus('Saved')
  }

  function edit(changes: Partial<Fields>) {
    latest.current = { ...latest.current, ...changes }
    if (changes.title !== undefined) setTitle(changes.title)
    dirty.current = true
    setStatus('Saving…')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 800)
  }

  function updateBlocks(next: string[]) {
    blocksRef.current = next
    setBlocks(next)
    edit({ body: serialize(next) })
  }

  // If you leave the note while a save is pending, save it first.
  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current)
      if (dirty.current) onSave(note.id, latest.current)
    }
  }, [])

  async function attach(blob: Blob) {
    if (!user) return
    const isAudio = blob.type.startsWith('audio')
    setStatus('Uploading… 0%')
    try {
      const up = await uploadMedia(user.id, note.id, blob, cryptoKey, (p) => setStatus(`Uploading… ${p}%`))
      const item: MediaItem = { ...up, w: isAudio ? 100 : 70 }
      mediaRef.current = [...mediaRef.current, item]
      setMedia(mediaRef.current)
      await onMediaChange(note.id, mediaRef.current)

      // Insert at the cursor: split the text block there and put the attachment between.
      const cur = blocksRef.current
      const c = cursor.current
      const i = c.i % 2 === 0 && c.i < cur.length ? c.i : cur.length - 1
      const pos = Math.min(c.pos, cur[i].length)
      updateBlocks([...cur.slice(0, i), cur[i].slice(0, pos), idOf(item), cur[i].slice(pos), ...cur.slice(i + 1)])
      cursor.current = { i: i + 2, pos: 0 }
      setSelected(idOf(item))
      await flush()
    } catch (e) {
      setStatus('Upload failed: ' + (e instanceof Error ? e.message : 'unknown error'))
    }
  }

  async function detach(item: MediaItem) {
    const id = idOf(item)
    const cur = blocksRef.current
    const i = cur.indexOf(id)
    if (i > 0) updateBlocks([...cur.slice(0, i - 1), cur[i - 1] + cur[i + 1], ...cur.slice(i + 2)])
    mediaRef.current = mediaRef.current.filter((m) => m.path !== item.path)
    setMedia(mediaRef.current)
    setSelected(null)
    await onMediaChange(note.id, mediaRef.current)
    await removeMedia([item.path])
  }

  function resizeTo(item: MediaItem, w: number, commit: boolean) {
    mediaRef.current = mediaRef.current.map((m) => (m.path === item.path ? { ...m, w: Math.round(w) } : m))
    setMedia(mediaRef.current)
    if (commit) onMediaChange(note.id, mediaRef.current)
  }

  // Finds what is under a screen point: another attachment (left/right half) or a spot in the text.
  function locate(dragId: string, x: number, y: number): { target: Target; line: Line } | null {
    for (const [id, el] of mediaEls.current) {
      if (id === dragId) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const after = x > r.left + r.width / 2
        return {
          target: { kind: 'media', id, after },
          line: { top: r.top, left: (after ? r.right : r.left) - 1, width: 3, height: r.height },
        }
      }
    }
    let best: { i: number; el: HTMLTextAreaElement; dist: number } | null = null
    for (const [i, el] of taRefs.current) {
      const r = el.getBoundingClientRect()
      const dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
      if (!best || dist < best.dist) best = { i, el, dist }
    }
    if (!best) return null
    const r = best.el.getBoundingClientRect()
    const { pos, top } = caretAt(best.el, x, Math.min(Math.max(y, r.top), r.bottom - 1))
    return {
      target: { kind: 'text', i: best.i, pos },
      line: { top: top - 1, left: r.left + 16, width: r.width - 32, height: 2 },
    }
  }

  function moveTo(id: string, t: Target) {
    const b = blocksRef.current
    const mi = b.indexOf(id)
    if (mi < 1) return
    const without = [...b.slice(0, mi - 1), b[mi - 1] + b[mi + 1], ...b.slice(mi + 2)]
    if (t.kind === 'media') {
      const ti = without.indexOf(t.id)
      if (ti < 1) return
      updateBlocks(
        t.after
          ? [...without.slice(0, ti + 1), '', id, ...without.slice(ti + 1)]
          : [...without.slice(0, ti), id, '', ...without.slice(ti)],
      )
    } else {
      let ti = t.i
      let tp = t.pos
      if (ti === mi + 1) {
        tp = b[mi - 1].length + tp
        ti = mi - 1
      } else if (ti > mi + 1) ti -= 2
      const tx = without[ti]
      updateBlocks([...without.slice(0, ti), tx.slice(0, tp), id, tx.slice(tp), ...without.slice(ti + 1)])
    }
    setSelected(id)
  }

  function startDrag(id: string, e: React.PointerEvent) {
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    let active = false
    let raf = 0
    let last = { x: sx, y: sy }

    const update = () => {
      raf = 0
      const t = locate(id, last.x, last.y)
      setDrag({ id, x: last.x, y: last.y })
      setDrop(t ? t.line : null)
    }
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY }
      if (!active) {
        if (Math.hypot(last.x - sx, last.y - sy) < 6) return
        active = true
        setSelected(id)
        document.body.style.userSelect = 'none'
      }
      if (ev.clientY < 90) window.scrollBy(0, -14)
      else if (ev.clientY > window.innerHeight - 90) window.scrollBy(0, 14)
      if (!raf) raf = requestAnimationFrame(update)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      cancelAnimationFrame(raf)
      document.body.style.userSelect = ''
      if (active && ev.type === 'pointerup') {
        const t = locate(id, ev.clientX, ev.clientY)
        if (t) moveTo(id, t.target)
      }
      setDrag(null)
      setDrop(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const { recording, seconds, levels, start, stop } = useRecorder(attach)

  // Puts dictated words into the note where the cursor was.
  function insertText(text: string) {
    if (!text) return
    const cur = blocksRef.current
    const c = cursor.current
    const i = c.i % 2 === 0 && c.i < cur.length ? c.i : cur.length - 1
    const pos = Math.min(c.pos, cur[i].length)
    const before = cur[i].slice(0, pos)
    const spacer = before && !/\s$/.test(before) ? ' ' : ''
    const next = [...cur]
    next[i] = before + spacer + text + cur[i].slice(pos)
    cursor.current = { i, pos: pos + spacer.length + text.length }
    updateBlocks(next)
  }

  const dictation = useDictation(insertText)

  function chooseAdd(it: AddItem) {
    setMenu(null)
    if (it.action === 'record') {
      dictation.stop()
      start()
    } else if (it.action === 'camera') setShowCamera(true)
    else if (fileRef.current) {
      fileRef.current.accept = it.accept ?? '*/*'
      fileRef.current.click()
    }
  }

  const iconBtn = 'flex h-10 w-10 items-center justify-center rounded-full hover:bg-card'
  const menuItem = 'flex w-full items-center gap-4 px-5 py-3 text-left text-lg hover:bg-white/10'

  // Build the page: text blocks, and rows of attachments that sit next to each other.
  const rows: React.ReactNode[] = []
  for (let i = 0; i < blocks.length; i++) {
    if (i % 2 === 0) {
      const hidden = i > 0 && i < blocks.length - 1 && blocks[i] === ''
      if (!hidden) {
        rows.push(
          <AutoText
            key={'t' + i}
            value={blocks[i]}
            placeholder={i === 0 ? 'Write something…' : undefined}
            last={i === blocks.length - 1}
            reg={(el) => {
              if (el) taRefs.current.set(i, el)
              else taRefs.current.delete(i)
            }}
            onChange={(v) => {
              const next = [...blocksRef.current]
              next[i] = v
              updateBlocks(next)
            }}
            onCursor={(pos) => {
              cursor.current = { i, pos }
              setSelected(null)
            }}
          />,
        )
      }
      continue
    }
    if (i >= 3 && blocks[i - 1] === '') continue // already drawn in an earlier row
    const ids = [blocks[i]]
    for (let j = i; j + 2 < blocks.length - 1 && blocks[j + 1] === ''; j += 2) ids.push(blocks[j + 2])
    rows.push(
      <div key={'g' + blocks[i]} className="flex flex-wrap items-start px-3 py-1">
        {ids.map((id) => {
          const m = media.find((x) => idOf(x) === id)
          if (!m) return null
          return (
            <MediaView
              key={id}
              item={m}
              cryptoKey={cryptoKey}
              selected={selected === id}
              dragging={drag?.id === id}
              reg={(el) => {
                if (el) mediaEls.current.set(id, el)
                else mediaEls.current.delete(id)
              }}
              onSelect={() => setSelected(id)}
              onDragStart={(e) => startDrag(id, e)}
              onResize={(w, commit) => resizeTo(m, w, commit)}
              onRemove={() => detach(m)}
            />
          )
        })}
      </div>,
    )
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-white/10 bg-app px-2 py-2">
        <button className={iconBtn} aria-label="Back" onClick={onBack}>
          <ChevronLeft size={28} strokeWidth={1.75} />
        </button>
        <input
          className="min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold outline-none placeholder:text-muted"
          placeholder="Title"
          value={title}
          onChange={(e) => edit({ title: e.target.value })}
        />
        <button
          className={iconBtn + (dictation.listening ? ' bg-card text-accent' : '')}
          aria-label="Voice typing"
          onClick={() => {
            if (dictation.listening) dictation.stop()
            else if (!recording) dictation.start()
          }}
        >
          <Mic size={24} strokeWidth={1.75} />
        </button>
        <button className={iconBtn} aria-label="Add" onClick={() => setMenu('plus')}>
          <Plus size={28} strokeWidth={1.75} />
        </button>
        <button className={iconBtn} aria-label="More" onClick={() => setMenu('more')}>
          <EllipsisVertical size={24} strokeWidth={1.75} />
        </button>

        {menu && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
            <div className="absolute right-2 top-14 z-30 w-64 overflow-hidden rounded-3xl bg-menu py-2 shadow-xl">
              {menu === 'plus' &&
                addItems.map((it, i) => (
                  <div key={it.label}>
                    <button className={menuItem} onClick={() => chooseAdd(it)}>
                      <it.Icon size={22} strokeWidth={1.5} className="text-white/80" />
                      {it.label}
                    </button>
                    {i === 0 && <div className="mx-5 my-1 border-t border-dashed border-white/20" />}
                  </div>
                ))}
              {menu === 'more' && (
                <button
                  className={menuItem}
                  onClick={() => {
                    setMenu(null)
                    onDelete(note.id)
                  }}
                >
                  <Trash2 size={22} strokeWidth={1.5} className="text-white/80" />
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="pt-2">{rows}</div>

      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) await attach(file)
        }}
      />

      {showCamera && <CameraDialog onCapture={attach} onClose={() => setShowCamera(false)} />}

      {drop && (
        <div
          className="pointer-events-none fixed z-50 rounded-full bg-accent"
          style={{ top: drop.top, left: drop.left, width: drop.width, height: drop.height }}
        />
      )}
      {drag && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl bg-menu px-3 py-1.5 text-sm shadow-xl"
          style={{ left: drag.x + 14, top: drag.y + 14 }}
        >
          Drop to move
        </div>
      )}

      {dictation.listening && !recording && (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[320px] max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-xl ring-1 ring-white/10">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="min-w-0 flex-1 truncate text-sm text-white/70">{dictation.interim || 'Listening…'}</span>
          <button
            aria-label="Stop voice typing"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black"
            onClick={dictation.stop}
          >
            <Square size={13} fill="currentColor" />
          </button>
        </div>
      )}

      {recording && (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[260px] max-w-[90vw] -translate-x-1/2 items-center gap-3 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-xl ring-1 ring-white/10">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="w-9 text-sm tabular-nums">{clock(seconds)}</span>
          <div className="flex h-6 min-w-0 flex-1 items-center justify-between">
            {Array.from({ length: 14 }).map((_, i) => {
              const size = 3 + (levels[levels.length - 14 + i] ?? 0) * 6
              return <span key={i} className="rounded-full bg-white" style={{ width: size, height: size }} />
            })}
          </div>
          <button
            aria-label="Stop recording"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black"
            onClick={stop}
          >
            <Square size={13} fill="currentColor" />
          </button>
        </div>
      )}

      <p className="fixed bottom-4 left-4 text-xs text-muted">{status}</p>
    </div>
  )
}