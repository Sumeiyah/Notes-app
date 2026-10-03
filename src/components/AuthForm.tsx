import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function AuthForm() {
  const { signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: typeof signIn) {
    setBusy(true)
    setError(null)
    const message = await action(email, password)
    if (message) setError(message)
    setBusy(false)
  }

  const input =
    'w-full rounded-xl bg-card px-4 py-3 text-white placeholder:text-muted outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="mx-auto mt-[12vh] grid max-w-sm gap-3 p-4">
      <h1 className="mb-2 text-3xl font-semibold">Notes</h1>
      <input
        className={input}
        type="email"
        placeholder="Email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={input}
        type="password"
        placeholder="Password (6+ characters)"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        className="rounded-xl bg-accent px-4 py-3 font-medium text-white disabled:opacity-60"
        disabled={busy}
        onClick={() => run(signIn)}
      >
        Sign in
      </button>
      <button
        className="rounded-xl bg-card px-4 py-3 disabled:opacity-60"
        disabled={busy}
        onClick={() => run(signUp)}
      >
        Create account
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}