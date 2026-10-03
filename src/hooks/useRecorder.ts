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
      // 1. Optimize microphone constraints for human voice (saves massive space)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000 // 16kHz is ideal for speech clarity and low data footprints
        } 
      })
      
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)

      const chunks: Blob[] = []
      
      // 2. Set strict compression parameters (MIME type and low audio bitrate)
      const recorderOptions = {
        mimeType: 'audio/webm;codecs=opus', // Opus manages ultra-dense audio compression
        audioBitsPerSecond: 32000 // 32kbps is the golden standard for clear voice diaries
      }

      // Initialize the recorder with our compression choices
      const r = new MediaRecorder(stream, recorderOptions)
      
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
        clearTimers()
        setRecording(false)
        setLevels([])
        // Forces the saved file to explicitly use the optimized compressed webm standard
        done.current(new Blob(chunks, { type: 'audio/webm;codecs=opus' }))
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
