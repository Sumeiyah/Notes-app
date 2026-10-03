import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

const DOTS = 16
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function AudioPlayer({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [peaks, setPeaks] = useState<number[]>(Array(DOTS).fill(0.2))
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)

  // Decode the audio once to size the dots from the real volume and find its length.
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer()
        const ctx = new AudioContext()
        const decoded = await ctx.decodeAudioData(buf)
        ctx.close()
        if (dead) return
        setDuration(decoded.duration)
        const data = decoded.getChannelData(0)
        const size = Math.floor(data.length / DOTS) || 1
        const out: number[] = []
        for (let i = 0; i < DOTS; i++) {
          let max = 0
          for (let j = i * size; j < (i + 1) * size && j < data.length; j++) {
            const v = Math.abs(data[j])
            if (v > max) max = v
          }
          out.push(max)
        }
        const top = Math.max(...out, 0.01)
        setPeaks(out.map((v) => Math.max(0.1, v / top)))
      } catch {
        /* keep the placeholder dots */
      }
    })()
    return () => {
      dead = true
    }
  }, [url])

  function toggle() {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play()
    else a.pause()
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audio.current
    if (!a || !duration) return
    const box = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - box.left) / box.width) * duration
    setTime(a.currentTime)
  }

  const progress = duration ? time / duration : 0

  return (
    <div className="flex w-[260px] max-w-full items-center gap-3 rounded-full bg-card py-1.5 pl-1.5 pr-4 ring-1 ring-white/10">
      <audio
        ref={audio}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setTime(0)
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration)
        }}
      />
      <button
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black"
        onClick={toggle}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex h-6 min-w-0 flex-1 cursor-pointer items-center justify-between" onClick={seek}>
        {peaks.map((p, i) => (
          <span
            key={i}
            className={'rounded-full ' + (i / DOTS < progress ? 'bg-white' : 'bg-white/35')}
            style={{ width: `${3 + p * 5}px`, height: `${3 + p * 5}px` }}
          />
        ))}
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-white/60">
        {clock(playing || time > 0 ? time : duration)}
      </span>
    </div>
  )
}