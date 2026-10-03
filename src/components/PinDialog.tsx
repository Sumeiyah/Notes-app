import { useState } from 'react'

interface Props {
  title: string
  confirmPin?: boolean
  error?: string | null
  busy?: boolean
  onSubmit: (pin: string) => void
  onCancel: () => void
}

export default function PinDialog({ title, confirmPin = false, error, busy = false, onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pin.length < 4) return setProblem('Use at least 4 characters.')
    if (confirmPin && pin !== again) return setProblem('The two entries do not match.')
    setProblem(null)
    onSubmit(pin)
  }

  const input =
    'w-full rounded-xl bg-card px-4 py-3 text-white placeholder:text-muted outline-none focus:ring-2 focus:ring-accent'
  const message = problem ?? error

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <form
        className="grid w-full max-w-sm gap-3 rounded-3xl bg-menu p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-xl font-semibold">{title}</h2>
        <input
          autoFocus
          className={input}
          type="password"
          placeholder="PIN or password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        {confirmPin && (
          <>
            <input
              className={input}
              type="password"
              placeholder="Enter it again"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
            <p className="text-sm text-muted">
              If you forget this PIN, the note cannot be recovered.
            </p>
          </>
        )}
        {message && <p className="text-sm text-red-400">{message}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="rounded-full px-5 py-2 text-muted" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className="rounded-full px-5 py-2 font-medium text-accent disabled:opacity-50">
            {busy ? 'Working…' : 'OK'}
          </button>
        </div>
      </form>
    </div>
  )
}