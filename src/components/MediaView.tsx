import { useEffect, useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { downloadMedia } from '../lib/media'
import AudioPlayer from './AudioPlayer'
import type { MediaItem } from '../lib/types'

interface Props {
  item: MediaItem
  cryptoKey: CryptoKey | null
  selected: boolean
  dragging: boolean
  reg?: (el: HTMLDivElement | null) => void // CHANGED: now optional
  onSelect: () => void
  onDragStart: (e: React.PointerEvent) => void
  onResize: (widthPercent: number, commit: boolean) => void
  onRemove: () => void
}

export default function MediaView({
  item,
  cryptoKey,
  selected,
  dragging,
  reg,
  onSelect,
  onDragStart,
  onResize,
  onRemove,
}: Props) {
  const wrap = useRef<HTMLDivElement | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let made: string | null = null
    downloadMedia(item, cryptoKey)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u)
        else {
          made = u
          setUrl(u)
        }
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [item.path, cryptoKey])

  const setRef = (el: HTMLDivElement | null) => {
    wrap.current = el
    reg?.(el) // CHANGED: safe if no function is passed
  }

  const kind = item.type.split('/')[0]

  // Drag a handle to resize. The left edge stays put, so the width follows the pointer.
  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const box = wrap.current
    const parent = box?.parentElement
    if (!box || !parent) return
    const cs = getComputedStyle(parent)
    const full = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const left = box.getBoundingClientRect().left
    const pct = (ev: PointerEvent) => Math.min(100, Math.max(15, ((ev.clientX - left + 4) / full) * 100))
    const move = (ev: PointerEvent) => onResize(pct(ev), false)
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onResize(pct(ev), true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const shown = selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  const dot = 'absolute z-10 h-4 w-4 touch-none rounded-full border-2 border-white bg-accent'

  const content = failed ? (
    <p className="bg-card p-4 text-sm text-muted">Could not load this attachment</p>
  ) : !url ? (
    <p className="bg-card p-4 text-sm text-muted">Loading…</p>
  ) : kind === 'image' ? (
    <img src={url} alt="" draggable={false} className="w-full" />
  ) : kind === 'video' ? (
    <video src={url} controls playsInline className="w-full" />
  ) : (
    <AudioPlayer url={url} />
  )

  if (kind === 'audio') {
    return (
      <div
        ref={setRef}
        className="group flex w-full items-center gap-1 p-1"
        style={{ opacity: dragging ? 0.4 : 1 }}
        onClick={onSelect}
      >
        <div className={'rounded-full ' + (selected ? 'ring-2 ring-accent' : '')}>{content}</div>
        <button
          aria-label="Drag to move"
          className={'flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-full text-muted hover:bg-card ' + shown}
          onPointerDown={onDragStart}
        >
          <GripVertical size={18} />
        </button>
        {selected && (
          <button
            aria-label="Remove attachment"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      ref={setRef}
      className="group relative p-1"
      style={{ width: `${item.w ?? 70}%`, opacity: dragging ? 0.4 : 1 }}
      onClick={onSelect}
    >
      <div
        className={
          'select-none overflow-hidden rounded-2xl ' +
          (selected ? 'ring-2 ring-accent ' : '') +
          (kind === 'image' ? 'cursor-grab' : '')
        }
        onPointerDown={kind === 'image' ? onDragStart : undefined}
      >
        {content}
      </div>

      <button
        aria-label="Drag to move"
        className={'absolute left-3 top-3 z-10 flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full bg-black/60 ' + shown}
        onPointerDown={onDragStart}
      >
        <GripVertical size={18} />
      </button>

      {selected && (
        <>
          <button
            aria-label="Remove attachment"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X size={18} />
          </button>
          <span className={dot + ' -bottom-1 -right-1 cursor-nwse-resize'} onPointerDown={startResize} />
          <span
            className={dot + ' -right-1 top-1/2 -translate-y-1/2 cursor-ew-resize'}
            onPointerDown={startResize}
          />
        </>
      )}
    </div>
  )
}