import { useEffect, useRef, useState } from 'react'

const BARS = 40

export function useRecorder(onDone: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const rec = useRef<MediaRecorder | null>(null)
  const timers = useRef<number[]>([])
  const done = useRef(onDone)
  done.current = onDone

  function clearTimers() {
    timers.current.forEach((t) => window.clearInterval(t))
    timers.current = []
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)

      const chunks: Blob[] = []
      const r = new MediaRecorder(stream)
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
        clearTimers()
        setRecording(false)
        setLevels([])
        done.current(new Blob(chunks, { type: r.mimeType || 'audio/webm' }))
      }
      r.start()
      rec.current = r
      setSeconds(0)
      setLevels([])
      setRecording(true)

      timers.current = [
        window.setInterval(() => setSeconds((s) => s + 1), 1000),
        window.setInterval(() => {
          analyser.getByteTimeDomainData(samples)
          let sum = 0
          for (let i = 0; i < samples.length; i++) sum += ((samples[i] - 128) / 128) ** 2
          const level = Math.min(1, Math.sqrt(sum / samples.length) * 4)
          setLevels((prev) => [...prev.slice(-(BARS - 1)), level])
        }, 70),
      ]
    } catch {
      alert('Could not use the microphone. Check that the browser has permission.')
    }
  }

  function stop() {
    rec.current?.stop()
  }

  // If you leave the note mid-recording, stop and keep what was recorded.
  useEffect(() => {
    return () => {
      if (rec.current?.state === 'recording') rec.current.stop()
      clearTimers()
    }
  }, [])

  return { recording, seconds, levels, start, stop }
}