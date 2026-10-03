import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Total size in bytes of all your uploaded files. Re-checks whenever "deps" change.
export function useStorageUsage(deps: unknown[]) {
  const [used, setUsed] = useState<number | null>(null)

  useEffect(() => {
    let dead = false
    supabase.rpc('my_storage_bytes').then(({ data, error }) => {
      if (!dead && !error) setUsed(Number(data))
    })
    return () => {
      dead = true
    }
  }, deps)

  return used
}