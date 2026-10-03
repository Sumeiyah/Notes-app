import { supabase } from './supabase'
import { decryptText, deriveKey, encryptText, fromB64, newSalt, toB64 } from './crypto'

export interface Profile {
  salt: string
  check_data: string
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('salt,check_data').maybeSingle()
  return (data as Profile | null) ?? null
}

// Creates the one passkey used for all locked notes.
export async function createPasskey(pin: string): Promise<{ key: CryptoKey; profile: Profile }> {
  const salt = newSalt()
  const key = await deriveKey(pin, salt)
  const profile = { salt: toB64(salt), check_data: await encryptText(key, 'ok') }
  const { error } = await supabase.from('profiles').insert(profile)
  if (error) throw error
  return { key, profile }
}

// True if this key belongs to your passkey.
export async function keyMatches(profile: Profile, key: CryptoKey): Promise<boolean> {
  try {
    return (await decryptText(key, profile.check_data)) === 'ok'
  } catch {
    return false
  }
}

// Returns the key if the passkey is right, otherwise null.
export async function checkPasskey(profile: Profile, pin: string): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(pin, fromB64(profile.salt))
    return (await keyMatches(profile, key)) ? key : null
  } catch {
    return null
  }
}