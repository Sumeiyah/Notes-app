export interface MediaItem {
  path: string
  type: string
  w?: number
}

export interface NoteRow {
  id: string
  user_id: string
  title: string
  body: string
  data: string | null
  locked: boolean
  salt: string | null
  media: MediaItem[]
  updated_at: string
}

export type NoteSummary = Pick<NoteRow, 'id' | 'title' | 'body' | 'locked' | 'updated_at'>