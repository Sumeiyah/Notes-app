import { useEffect, useRef, useState } from 'react'
import { SwitchCamera, X } from 'lucide-react'

interface Props {
  onCapture: (blob: Blob) => void
  onClose: () => void
}

export default function CameraDialog({ onCapture, onClose }: Props) {
  const preview = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const wantSave = useRef(false)
  const [mode, setMode] = useState<'photo' | 'video'>('photo')
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing }, audio: mode === 'video' })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = s
        if (preview.current) preview.current.srcObject = s
      })
      .catch(() => setError('Could not open the camera. Check the browser permission and that no other app is using it.'))
    return () => {
      cancelled = true
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [mode, facing])

  function takePhoto() {
    const v = preview.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    c.toBlob(
      (b) => {
        if (b) {
          onCapture(b)
          onClose()
        }
      },
      'image/jpeg',
      0.9,
    )
  }

  function toggleRecord() {
    if (recording) {
      wantSave.current = true
      recorder.current?.stop()
      return
    }
    if (!stream.current) return
    const chunks: Blob[] = []
    const r = new MediaRecorder(stream.current)
    r.ondataavailable = (e) => chunks.push(e.data)
    r.onstop = () => {
      setRecording(false)
      if (wantSave.current) {
        onCapture(new Blob(chunks, { type: r.mimeType || 'video/webm' }))
        onClose()
      }
    }
    wantSave.current = false
    r.start()
    recorder.current = r
    setRecording(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <button
        aria-label="Close camera"
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50"
        onClick={onClose}
      >
        <X size={22} />
      </button>

      {error ? (
        <p className="m-auto max-w-sm p-6 text-center text-muted">{error}</p>
      ) : (
        <video ref={preview} autoPlay muted playsInline className="min-h-0 flex-1 object-contain" />
      )}

      <div className="flex flex-col items-center gap-4 pb-8 pt-4">
        <div className="flex gap-6 text-sm">
          {(['photo', 'video'] as const).map((m) => (
            <button
              key={m}
              disabled={recording}
              className={m === mode ? 'font-semibold text-accent' : 'text-muted'}
              onClick={() => setMode(m)}
            >
              {m === 'photo' ? 'Photo' : 'Video'}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center justify-center gap-10">
          <span className="w-10" />
          <button
            aria-label={mode === 'photo' ? 'Take photo' : recording ? 'Stop recording' : 'Start recording'}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white"
            onClick={mode === 'photo' ? takePhoto : toggleRecord}
          >
            <span
              className={
                mode === 'photo'
                  ? 'h-11 w-11 rounded-full bg-white'
                  : recording
                    ? 'h-6 w-6 rounded-sm bg-red-500'
                    : 'h-10 w-10 rounded-full bg-red-500'
              }
            />
          </button>
          <button
            aria-label="Switch camera"
            disabled={recording}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 disabled:opacity-40"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          >
            <SwitchCamera size={22} />
          </button>
        </div>
      </div>
    </div>
  )
}