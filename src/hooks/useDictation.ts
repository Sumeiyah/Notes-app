import { useEffect, useRef, useState } from 'react'

// The browser's built-in speech recognition. TypeScript has no types for it, so "any" is used.
const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const rec = useRef<any>(null)
  const wanted = useRef(false)
  const handler = useRef(onText)
  handler.current = onText

  function start() {
    if (!SpeechRec) {
      alert('Voice typing is not supported in this browser. Try Chrome or Edge.')
      return
    }
    const r = new SpeechRec()
    r.continuous = true
    r.interimResults = true
    r.lang = navigator.language || 'en-US'

    r.onresult = (e: any) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text: string = e.results[i][0].transcript
        if (e.results[i].isFinal) handler.current(text.trim())
        else live += text
      }
      setInterim(live)
    }
    r.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      wanted.current = false
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        alert('Microphone permission is blocked. Allow it in the browser address bar and try again.')
      } else if (e.error === 'network') {
        alert('Voice typing needs an internet connection.')
      } else {
        alert('Voice typing stopped: ' + e.error)
      }
    }
    r.onend = () => {
      setInterim('')
      if (wanted.current) {
        // The browser stops after a pause; start again until you press stop.
        try {
          r.start()
        } catch {
          wanted.current = false
          setListening(false)
        }
      } else {
        setListening(false)
      }
    }

    wanted.current = true
    rec.current = r
    r.start()
    setListening(true)
  }

  function stop() {
    wanted.current = false
    rec.current?.stop()
  }

  useEffect(() => {
    return () => {
      wanted.current = false
      rec.current?.abort?.()
    }
  }, [])

  return { listening, interim, start, stop }
}